// Adversarial security, input-validation, API-flow and server-response campaign.
// Runs the real Hono app in-process against native PostgreSQL with every migration
// applied and the restricted runtime role. All identities and data are SYNTHETIC.
//
// Regression tests for defects F-01..F-07 found by this campaign (docs/security-test-report.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { generateKeyPair, createLocalJWKSet, exportJWK, exportSPKI, SignJWT } from 'jose';
import { startDatabase } from './postgres.mjs';
import { Repository } from '../../apps/api/src/repository.ts';
import { DecisionService } from '../../apps/api/src/service.ts';
import { createApp } from '../../apps/api/src/index.ts';
import type { RequestContext } from '../../apps/api/src/contracts.ts';

type Role = 'coordinator' | 'operator' | 'reviewer';
interface RegionSpec { demand: number; capacity?: number; name?: string; code?: string }
const ISSUER = 'https://synthetic.invalid/auth/v1';
const b64url = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

test('security, input, API flow and server response campaign', async t => {
  const db = await startDatabase(), sql = db.connect();
  const repo = new Repository(sql), service = new DecisionService(repo);
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const stranger = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const app = createApp({ service, issuer: ISSUER, getKey: createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'ES256' }] }) });

  const now = () => Math.floor(Date.now() / 1000);
  const sign = (sub: string, claims: Record<string, unknown> = {}, key = privateKey) =>
    new SignJWT({ sub, iss: ISSUER, aud: 'authenticated', iat: now(), exp: now() + 600, ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' }).sign(key);

  async function member(organizationId: string, role: Role) {
    const userId = randomUUID(), membershipId = randomUUID();
    await db.admin`insert into auth.users values(${userId})`;
    await db.admin`insert into fairshare.memberships(organization_id,id,user_id,display_name,role,provenance) values(${organizationId},${membershipId},${userId},'SYNTHETIC test identity',${role},'reported')`;
    return { userId, membershipId, bearer: await sign(userId), context: { organizationId, actorId: userId, requestId: randomUUID() } as RequestContext };
  }

  /** New organization, coordinator, open period and one imported input revision. */
  async function fixture(regions: RegionSpec[] = [{ demand: 60 }], stock = 30) {
    const organizationId = randomUUID(), periodId = randomUUID(), code = 'period-' + randomUUID();
    await db.admin`insert into fairshare.organizations(id,name,provenance) values(${organizationId},'SYNTHETIC security campaign','simulated')`;
    await db.admin`insert into fairshare.planning_periods(organization_id,id,code,starts_at,ends_at,provenance) values(${organizationId},${periodId},${code},now(),now()+interval '1 day','simulated')`;
    const coordinator = await member(organizationId, 'coordinator');
    const rows = regions.map((r, i) => ({ period_id: code, region_id: r.code ?? `region-${i}-${randomUUID()}`, region_name: r.name ?? 'SYNTHETIC region ' + i,
      center_id: 'center-' + randomUUID(), demand_kits: String(r.demand), capacity_kits: String(r.capacity ?? r.demand), prior_dispatched_kits: '0', status: 'open', reported_or_simulated: 'simulated' }));
    const importBody = (expectedRevision: number) => ({ periodId, expectedRevision, provenance: 'simulated' as const,
      stock: { period_id: code, stock_kits: String(stock), stock_type: 'confirmed' as const, source: 'SYNTHETIC security campaign', as_of_date: new Date().toISOString() }, regions: structuredClone(rows) });
    async function call(path: string, options: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string | undefined>; bearer?: string } = {}) {
      const headers: Record<string, string> = {};
      const merged = { Authorization: 'Bearer ' + (options.bearer ?? coordinator.bearer), 'X-Organization-Id': organizationId, 'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json', ...options.headers };
      for (const [k, v] of Object.entries(merged)) if (v !== undefined) headers[k] = v;
      const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
      return app.request('/api/v1' + path, { method: options.method ?? (body === undefined ? 'GET' : 'POST'), headers, ...(body === undefined ? {} : { body }) });
    }
    const imported = await service.import(coordinator.context, randomUUID(), importBody(0));
    assert.equal(imported.status, 201);
    const revision = async () => (await service.snapshot(coordinator.context, periodId)).revision;
    const accept = async (extra: Record<string, unknown> = {}) => ({ periodId, expectedRevision: await revision(), algorithm: 'srs-progressive-maxmin', reason: 'SYNTHETIC verified acceptance', ...extra });
    const reservations = async () => (await service.summary(coordinator.context, periodId, undefined, 100)).reservations;
    const event = (reservationId: string, eventType: string, quantityKits: number, extra: Record<string, unknown> = {}) => ({ reservationId, eventKey: randomUUID(), eventType, quantityKits,
      reason: 'SYNTHETIC generated report', source: 'security campaign', reference: randomUUID(), provenance: 'simulated', occurredAt: new Date().toISOString(), ...extra });
    return { organizationId, periodId, code, coordinator, rows, importBody, call, revision, accept, reservations, event, stock };
  }
  const count = async (table: string, periodId: string) => (await db.admin.unsafe(`select count(*)::int n from fairshare.${table} where period_id=$1`, [periodId]))[0].n as number;
  /** Every error must be the documented envelope and must not leak internals. */
  async function assertError(response: Response, status: number, code?: string) {
    const text = await response.clone().text();
    assert.equal(response.status, status, text);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const body = JSON.parse(text);
    assert.equal(typeof body.error?.code, 'string'); assert.equal(typeof body.error?.message, 'string');
    if (code) assert.equal(body.error.code, code);
    assert.doesNotMatch(text, /postgres|fairshare\.|pg_|select |insert |stack|node_modules|at .*\(.*:\d+:\d+\)|password|secret/i, 'error body leaks internals');
    return body;
  }

  try {
    // ---------------------------------------------------------------- authentication
    await t.test('AUTH: missing, malformed and oversized credentials are 401 before any work', async () => {
      const f = await fixture(), path = `/periods/${f.periodId}/snapshot`;
      for (const Authorization of [undefined, '', 'Bearer', 'Bearer ', 'Basic dXNlcjpwYXNz', 'bearer ' + f.coordinator.bearer, 'Token ' + f.coordinator.bearer,
        'Bearer not.a.jwt', 'Bearer ' + f.coordinator.bearer + 'x', 'Bearer ' + f.coordinator.bearer.split('.').slice(0, 2).join('.') + '.', 'Bearer ' + 'a'.repeat(20000)]) {
        await assertError(await f.call(path, { headers: { Authorization } }), 401);
      }
    });
    await t.test('AUTH: forged tokens (alg none, HS256 key confusion, foreign key, tampered payload) are 401', async () => {
      const f = await fixture(), path = `/periods/${f.periodId}/snapshot`, sub = f.coordinator.userId;
      const claims = { sub, iss: ISSUER, aud: 'authenticated', iat: now(), exp: now() + 600 };
      const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.`;
      const confused = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256', kid: 'test' }).sign(new TextEncoder().encode(await exportSPKI(publicKey)));
      const foreign = await sign(sub, {}, stranger.privateKey);
      const [head, , signature] = f.coordinator.bearer.split('.');
      const tampered = `${head}.${b64url({ ...claims, sub: randomUUID() })}.${signature}`;
      const embedded = await new SignJWT(claims).setProtectedHeader({ alg: 'ES256', jwk: await exportJWK(stranger.publicKey) }).sign(stranger.privateKey);
      for (const [name, token] of Object.entries({ none, confused, foreign, tampered, embedded })) {
        const response = await f.call(path, { bearer: token });
        assert.equal(response.status, 401, name); await assertError(response, 401, 'UNAUTHORIZED');
      }
    });
    await t.test('AUTH: expired, not-yet-valid, wrong issuer/audience and claim-less tokens are 401', async () => {
      const f = await fixture(), path = `/periods/${f.periodId}/snapshot`, sub = f.coordinator.userId;
      const cases: Record<string, Record<string, unknown>> = { expired: { exp: now() - 5 }, notYetValid: { nbf: now() + 3600 }, wrongIssuer: { iss: 'https://evil.invalid/auth/v1' },
        issuerPrefix: { iss: ISSUER + '.evil.invalid' }, wrongAudience: { aud: 'anon' }, noExpiry: { exp: undefined }, noIssuedAt: { iat: undefined },
        subjectNotUuid: { sub: "' OR 1=1 --" }, subjectMissing: { sub: undefined }, subjectArray: { sub: [sub] } };
      for (const [name, claims] of Object.entries(cases)) assert.equal((await f.call(path, { bearer: await sign(sub, claims) })).status, 401, name);
      // Role or organization claims inside the token must never grant anything.
      const outsider = randomUUID(); await db.admin`insert into auth.users values(${outsider})`;
      const selfPromoted = await sign(outsider, { role: 'coordinator', app_metadata: { role: 'coordinator', organization_id: f.organizationId }, organization_id: f.organizationId });
      await assertError(await f.call(path, { bearer: selfPromoted }), 403, 'FORBIDDEN');
    });
    await t.test('AUTH: organization context must be a UUID the caller actively belongs to', async () => {
      const f = await fixture(), path = `/periods/${f.periodId}/snapshot`;
      for (const org of [undefined, '', 'null', "' OR '1'='1", f.organizationId + ',' + randomUUID(), '00000000-0000-0000-0000-000000000000'])
        assert.ok([403].includes((await f.call(path, { headers: { 'X-Organization-Id': org } })).status), String(org));
      await assertError(await f.call(path, { headers: { 'X-Organization-Id': randomUUID() } }), 403, 'FORBIDDEN');
      const other = await fixture();
      await assertError(await f.call(path, { headers: { 'X-Organization-Id': other.organizationId } }), 403, 'FORBIDDEN');
      assert.equal((await f.call(path)).status, 200);
    });
    await t.test('AUTH: unconfigured deployment fails closed with 503 and health stays public', async () => {
      const bare = createApp();
      const response = await bare.request('/api/v1/periods/' + randomUUID() + '/snapshot', { headers: { Authorization: 'Bearer x' } }, {});
      await assertError(response, 503, 'NOT_CONFIGURED');
      const health = await bare.request('/api/v1/health', {}, {});
      assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok', stage: 'scaffold' });
    });

    // ---------------------------------------------------------------- server responses
    await t.test('RESPONSE: every authenticated response is no-store, nosniff and carries a unique request id', async () => {
      const f = await fixture(), ids = new Set<string>();
      for (const response of [await f.call(`/periods/${f.periodId}/snapshot`), await f.call('/periods/not-a-uuid/snapshot'), await f.call('/nope'), await f.call(`/periods/${f.periodId}/snapshot`, { headers: { Authorization: undefined } })]) {
        assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(response.headers.get('access-control-allow-origin'), null, 'no CORS grant expected on a same-origin API');
        if (response.status !== 200) { const id = (await response.json()).error.requestId; assert.match(id, /^[0-9a-f-]{36}$/); ids.add(id); }
      }
      assert.equal(ids.size, 3);
    });
    await t.test('RESPONSE: health endpoint also sends no-store and nosniff', async () => {
      const health = await app.request('/api/v1/health');
      assert.equal(health.headers.get('cache-control'), 'no-store'); assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    });
    await t.test('RESPONSE: unknown routes and unsupported methods are 404 only after authentication', async () => {
      const f = await fixture();
      for (const [method, path] of [['GET', '/nope'], ['GET', '/periods'], ['DELETE', `/periods/${f.periodId}/snapshot`], ['PUT', '/plans/accept'], ['GET', '/plans/accept'],
        ['POST', `/periods/${f.periodId}/snapshot`], ['PATCH', '/imports'], ['GET', '/__checks/database'], ['GET', '/admin'], ['GET', '/scenarios/evaluate']] as const) {
        await assertError(await f.call(path, { method }), 404, 'NOT_FOUND');
        assert.equal((await f.call(path, { method, headers: { Authorization: undefined } })).status, 401, `${method} ${path} must not reveal routes anonymously`);
      }
      assert.equal((await app.request('/__checks/database', { method: 'POST' })).status, 404);
      assert.equal((await app.request('/api/v2/health')).status, 404);
    });
    await t.test('RESPONSE: hostile path and query values never reach SQL and never produce 5xx', async () => {
      const f = await fixture();
      const hostile = ["1' OR '1'='1", '1;DROP TABLE fairshare.plans', '..%2f..%2fetc%2fpasswd', '%00', '%F0%9F%92%A9', '${7*7}', '<script>alert(1)</script>', 'a'.repeat(5000), '-1', 'null', f.periodId + '%0d%0aSet-Cookie:x=1'];
      for (const value of hostile) for (const path of [`/periods/${value}/snapshot`, `/periods/${value}/summary`, `/receipts/${value}/replay`, `/receipts/${value}/export?format=csv`, `/movements/${value}`]) {
        const response = await f.call(path); assert.ok([404, 422].includes(response.status), `${path.slice(0, 80)} -> ${response.status}`);
        assert.equal(response.headers.get('set-cookie'), null);
      }
      for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=abc', 'limit=1e9', 'limit=1.5', 'limit=', 'cursor=abc', "cursor=' OR 1=1", 'offset=5', 'limit=5&limit=500&x=1'])
        await assertError(await f.call(`/periods/${f.periodId}/summary?${query}`), 422, 'INVALID_REQUEST');
      for (const format of ['', 'pdf', 'CSV', 'csv;html', '../csv']) await assertError(await f.call(`/receipts/${randomUUID()}/export?format=${encodeURIComponent(format)}`), 422, 'INVALID_FORMAT');
      assert.equal((await f.call(`/receipts/${randomUUID()}/export?format=csv`)).status, 404);
    });
    await t.test('RESPONSE: oversized bodies are rejected with 413 with and without Content-Length', async () => {
      const f = await fixture(), huge = JSON.stringify({ huge: 'a'.repeat(262145) });
      await assertError(await f.call('/imports', { raw: huge }), 413, 'PAYLOAD_TOO_LARGE');
      const stream = () => new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new TextEncoder().encode('a'.repeat(8192))); c.close(); } });
      const streamed = await app.request('/api/v1/plans/accept', { method: 'POST', body: stream(), duplex: 'half', headers: { Authorization: 'Bearer ' + f.coordinator.bearer, 'X-Organization-Id': f.organizationId, 'Idempotency-Key': randomUUID() } } as RequestInit);
      await assertError(streamed, 413, 'PAYLOAD_TOO_LARGE');
      // Just under the limit is parsed and rejected by the schema, not by size.
      await assertError(await f.call('/plans/accept', { raw: JSON.stringify({ pad: 'a'.repeat(262000) }) }), 422, 'INVALID_REQUEST');
    });
    await t.test('RESPONSE: rate limit returns 429 with Retry-After and is scoped to the actor', async () => {
      const f = await fixture(), statuses: number[] = []; let limited: Response | undefined;
      // The limit is 120 per actor per clock minute; 250 calls span at most two buckets.
      for (let i = 0; i < 250 && !limited; i++) { const r = await f.call(`/periods/${f.periodId}/snapshot`); statuses.push(r.status); if (r.status === 429) limited = r; }
      assert.ok(limited, 'expected a 429 within 250 requests'); assert.ok(statuses.length > 120);
      assert.ok(statuses.slice(0, -1).every(s => s === 200));
      assert.equal(limited.headers.get('retry-after'), '60'); await assertError(limited, 429, 'RATE_LIMIT');
      const colleague = await member(f.organizationId, 'reviewer');
      assert.equal((await f.call(`/periods/${f.periodId}/snapshot`, { bearer: colleague.bearer })).status, 200, 'another actor must not be throttled');
      // A throttled write must not be applied.
      await assertError(await f.call('/plans/accept', { body: await f.accept() }), 429); assert.equal(await count('plans', f.periodId), 0);
    });

    // ---------------------------------------------------------------- input validation
    await t.test('INPUT: malformed, empty and wrongly typed JSON bodies are 422 with no side effects', async () => {
      const f = await fixture(), good = await f.accept();
      for (const raw of ['', '{', '{"periodId":', 'null', '[]', '"text"', '42', 'true', '{"periodId":NaN}', '﻿{}',  '{"a":'.repeat(5000) + '1' + '}'.repeat(5000)])
        await assertError(await f.call('/plans/accept', { raw }), 422, 'INVALID_REQUEST');
      const proto = await f.call('/plans/accept', { raw: JSON.stringify(good).replace('{', '{"__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}},') });
      await assertError(proto, 422, 'INVALID_REQUEST'); assert.equal(({} as Record<string, unknown>).admin, undefined);
      assert.equal(await count('plans', f.periodId), 0);
    });
    await t.test('INPUT: acceptance rejects every out-of-contract field value', async () => {
      const f = await fixture(), good = await f.accept();
      const bad: Record<string, unknown>[] = [
        { periodId: 'x' }, { periodId: null }, { periodId: [good.periodId] }, { periodId: { $ne: null } },
        { expectedRevision: '1' }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: 2147483648 }, { expectedRevision: null }, { expectedRevision: true },
        { algorithm: 'random' }, { algorithm: '' }, { algorithm: 'SRS-PROGRESSIVE-MAXMIN' }, { algorithm: ['srs-progressive-maxmin'] },
        { reason: '' }, { reason: '  a ' }, { reason: 'a'.repeat(1001) }, { reason: 7 }, { reason: null },
        { overrides: 'all' }, { overrides: [{ regionId: 'r' }] }, { overrides: [{ regionId: 'r', newlyAllocatedKits: -1 }] }, { overrides: [{ regionId: 'r', newlyAllocatedKits: 1.2 }] },
        { overrides: [{ regionId: '', newlyAllocatedKits: 1 }] }, { overrides: [{ regionId: 'r', newlyAllocatedKits: 1, bonus: 1 }] },
        { overrides: Array.from({ length: 101 }, (_, i) => ({ regionId: 'r' + i, newlyAllocatedKits: 0 })) },
        { extra: true }, { actorId: randomUUID() }, { organizationId: randomUUID() }, { allocations: [{ regionId: 'r', allocatedKits: 999 }] }, { confirmedStock: 9999 },
      ];
      for (const change of bad) await assertError(await f.call('/plans/accept', { body: { ...good, ...change } }), 422, 'INVALID_REQUEST');
      for (const field of ['periodId', 'expectedRevision', 'algorithm', 'reason']) { const body: Record<string, unknown> = { ...good }; delete body[field]; await assertError(await f.call('/plans/accept', { body }), 422, 'INVALID_REQUEST'); }
      for (const raw of [JSON.stringify(good).replace(/"expectedRevision":\d+/, '"expectedRevision":1e400'), JSON.stringify(good).replace(/"expectedRevision":\d+/, '"expectedRevision":00')]) await assertError(await f.call('/plans/accept', { raw }), 422, 'INVALID_REQUEST');
      for (const key of [undefined, '', 'abc', '1', randomUUID() + 'x', "' OR 1=1"]) await assertError(await f.call('/plans/accept', { body: good, headers: { 'Idempotency-Key': key } }), 422, 'INVALID_REQUEST');
      assert.equal(await count('plans', f.periodId), 0); assert.equal(await count('idempotency_records', f.periodId), 1, 'only the fixture import may have claimed a key');
      // Boundary values that ARE in contract still work.
      assert.equal((await f.call('/plans/accept', { body: { ...good, reason: 'a'.repeat(1000) } })).status, 201);
    });
    await t.test('INPUT: browser-supplied allocations, stock or identity can never be smuggled into acceptance', async () => {
      const f = await fixture([{ demand: 60 }, { demand: 60 }], 30);
      const accepted = await f.call('/plans/accept', { body: await f.accept() }); assert.equal(accepted.status, 201);
      const rows = await f.reservations();
      assert.equal(rows.reduce((s: number, r: { reserved_kits: string }) => s + Number(r.reserved_kits), 0), 30, 'server recomputed from confirmed stock');
      assert.deepEqual(rows.map((r: { reserved_kits: string }) => Number(r.reserved_kits)).sort(), [15, 15]);
    });
    await t.test('INPUT: manual override must pass validity checks', async () => {
      const f = await fixture([{ demand: 30, capacity: 25, code: 'region-a' }, { demand: 30, code: 'region-b' }], 20);
      const attempt = async (overrides: unknown, extra: Record<string, unknown> = {}) => f.call('/plans/accept', { body: await f.accept({ algorithm: 'manual-override', overrides, ...extra }) });
      const invalid: Record<string, unknown> = {
        overStock: [{ regionId: 'region-a', newlyAllocatedKits: 20 }, { regionId: 'region-b', newlyAllocatedKits: 20 }],
        overCapacity: [{ regionId: 'region-a', newlyAllocatedKits: 26 }, { regionId: 'region-b', newlyAllocatedKits: 0 }],
        overDemand: [{ regionId: 'region-a', newlyAllocatedKits: 0 }, { regionId: 'region-b', newlyAllocatedKits: 31 }],
        avoidableLeftover: [{ regionId: 'region-a', newlyAllocatedKits: 1 }, { regionId: 'region-b', newlyAllocatedKits: 1 }],
        missingRegion: [{ regionId: 'region-a', newlyAllocatedKits: 20 }],
        unknownRegion: [{ regionId: 'region-a', newlyAllocatedKits: 20 }, { regionId: 'region-b', newlyAllocatedKits: 0 }, { regionId: 'region-zz', newlyAllocatedKits: 0 }],
        duplicateRegion: [{ regionId: 'region-a', newlyAllocatedKits: 10 }, { regionId: 'region-a', newlyAllocatedKits: 10 }, { regionId: 'region-b', newlyAllocatedKits: 0 }],
        empty: [], maxInt: [{ regionId: 'region-a', newlyAllocatedKits: 2147483647 }, { regionId: 'region-b', newlyAllocatedKits: 2147483647 }],
      };
      for (const [name, overrides] of Object.entries(invalid)) { const r = await attempt(overrides); assert.equal(r.status, 422, name + ': ' + await r.clone().text()); await assertError(r, 422, 'INVALID_DECISION'); }
      assert.equal(await count('plans', f.periodId), 0);
      const ok = await attempt([{ regionId: 'region-a', newlyAllocatedKits: 20 }, { regionId: 'region-b', newlyAllocatedKits: 0 }]);
      assert.equal(ok.status, 201, await ok.clone().text());
    });
    await t.test('INPUT: manual override without overrides is rejected as invalid, not as an outage', async () => {
      const f = await fixture(); const r = await f.call('/plans/accept', { body: await f.accept({ algorithm: 'manual-override' }) });
      assert.equal(r.status, 422, await r.clone().text());
    });
    await t.test('INPUT: overrides on a non-manual algorithm are a 422', async () => {
      const f = await fixture(); const r = await f.call('/plans/accept', { body: await f.accept({ overrides: [{ regionId: f.rows[0].region_id, newlyAllocatedKits: 1 }] }) });
      await assertError(r, 422, 'INVALID_REQUEST');
    });
    await t.test('INPUT: NUL characters in free text are a 422', async () => {
      const f = await fixture(); const statuses: number[] = [];
      statuses.push((await f.call('/plans/accept', { body: await f.accept({ reason: 'SYNTHETIC \u0000 reason' }) })).status);
      const body = f.importBody(await f.revision()); body.stock.source = 'SYNTHETIC \u0000 source'; statuses.push((await f.call('/imports', { body })).status);
      assert.deepEqual(statuses, [422, 422]);
    });
    await t.test('INPUT: NUL and unpaired-surrogate text never commits a partial write', async () => {
      const f = await fixture(), before = await f.revision();
      for (const reason of ['SYNTHETIC \u0000 reason', 'SYNTHETIC \ud800 reason', 'SYNTHETIC \udfff\ud800 reason']) {
        const r = await f.call('/plans/accept', { body: await f.accept({ reason }) }); assert.ok(r.status >= 400 || r.status === 201, String(r.status));
        if (r.status >= 400) { await assertError(r, r.status); assert.equal(await f.revision(), before); }
      }
    });
    await t.test('INPUT: unusual but legal text is stored and exported verbatim', async () => {
      const f = await fixture([{ demand: 60, name: 'SYNTHETIC  मुंबई   ‮flipped‬ ​' }], 30);
      const reason = 'SYNTHETIC ' + 'नमस्ते 🙂 ‮ \t tab " quote \\ slash   ' + "Robert'); DROP TABLE fairshare.plans;--";
      const r = await f.call('/plans/accept', { body: await f.accept({ reason }) }); assert.equal(r.status, 201, await r.clone().text());
      const [plan] = await db.admin`select reason from fairshare.plans where period_id=${f.periodId}`; assert.equal(plan.reason, reason.trim());
      assert.equal((await db.admin`select count(*)::int n from fairshare.plans`)[0].n > 0, true, 'table survived the injection string');
    });
    await t.test('INPUT: import rejects impossible, ambiguous or unsafe rows and persists nothing', async () => {
      const f = await fixture(), base = await f.revision();
      const mutate = async (change: (body: ReturnType<typeof f.importBody>) => void) => { const body = f.importBody(base); change(body); return f.call('/imports', { body }); };
      const regionField = (field: string, value: unknown) => mutate(b => { (b.regions[0] as Record<string, unknown>)[field] = value; });
      for (const value of ['-1', '1.5', '1e3', '0x10', 'ten', '', ' ', '१२', '1,000', '+5', '5 kits', '100001', '99999999999999999999999', 'NaN', 'Infinity', '=1+1', null, 5, true, ['5']])
        for (const field of ['demand_kits', 'capacity_kits', 'prior_dispatched_kits']) { const r = await regionField(field, value); assert.equal(r.status, 422, `${field}=${JSON.stringify(value)} -> ${r.status}`); }
      for (const [field, value] of [['status', 'paused'], ['status', ''], ['reported_or_simulated', 'real'], ['region_id', ''], ['region_id', '   '], ['region_name', ''], ['center_id', ''], ['period_id', 'other-period'], ['region_id', 'a'.repeat(201)], ['surprise', 'x']] as const)
        assert.equal((await regionField(field, value)).status, 422, `${field}=${value}`);
      const cases: Record<string, (b: ReturnType<typeof f.importBody>) => void> = {
        noRegions: b => { b.regions = []; }, tooManyRegions: b => { b.regions = Array.from({ length: 101 }, (_, i) => ({ ...b.regions[0], region_id: 'r' + i, center_id: 'c' + i })); },
        duplicateRegion: b => { b.regions.push({ ...b.regions[0] }); }, closedWithCapacity: b => { b.regions[0].status = 'closed'; },
        priorExceedsCapacity: b => { b.regions[0].prior_dispatched_kits = '61'; }, priorExceedsStock: b => { b.regions[0].prior_dispatched_kits = '31'; },
        hypotheticalStock: b => { (b.stock as Record<string, unknown>).stock_type = 'hypothetical'; }, promisedStock: b => { (b.stock as Record<string, unknown>).stock_type = 'promised'; },
        negativeStock: b => { b.stock.stock_kits = '-5'; }, fractionalStock: b => { b.stock.stock_kits = '10.5'; }, missingStock: b => { b.stock.stock_kits = ''; },
        badDate: b => { b.stock.as_of_date = '10/11/2026'; }, dateWithoutZone: b => { b.stock.as_of_date = '2026-11-10T10:00:00'; }, impossibleDate: b => { b.stock.as_of_date = '2026-02-30T10:00:00Z'; },
        stockPeriodMismatch: b => { b.stock.period_id = 'other-period'; }, badProvenance: b => { (b as Record<string, unknown>).provenance = 'real'; },
        negativeRevision: b => { b.expectedRevision = -1; }, unknownPeriod: b => { b.periodId = randomUUID(); },
      };
      for (const [name, change] of Object.entries(cases)) { const r = await mutate(change); assert.ok([404, 422].includes(r.status), `${name} -> ${r.status} ${await r.clone().text()}`); if (name !== 'unknownPeriod') assert.equal(r.status, 422, name); }
      assert.equal(await f.revision(), base, 'no rejected import may advance the revision');
      assert.equal((await db.admin`select count(*)::int n from fairshare.stock_records where period_id=${f.periodId}`)[0].n, 1);
      // Whitespace and case that the cleaning rules explicitly tolerate.
      const ok = await mutate(b => { b.regions[0].status = ' OPEN '; b.regions[0].demand_kits = ' 61 '; b.regions[0].capacity_kits = '61'; }); assert.equal(ok.status, 201, await ok.clone().text());
    });
    await t.test('INPUT: an import that disagrees with the ledger or reassigns a region is refused', async () => {
      const f = await fixture(), base = await f.revision();
      const stale = f.importBody(base + 5); await assertError(await f.call('/imports', { body: stale }), 409, 'CONFLICT');
      const moved = f.importBody(base); moved.regions[0].center_id = 'center-' + randomUUID(); await assertError(await f.call('/imports', { body: moved }), 409, 'CONFLICT');
      const omitted = f.importBody(base); omitted.regions[0].region_id = 'region-new-' + randomUUID(); omitted.regions[0].center_id = 'center-' + randomUUID(); await assertError(await f.call('/imports', { body: omitted }), 409, 'CONFLICT');
      const invented = f.importBody(base); invented.regions[0].prior_dispatched_kits = '5'; await assertError(await f.call('/imports', { body: invented }), 409, 'CONFLICT');
      assert.equal(await f.revision(), base);
    });
    await t.test('INPUT: movement events reject out-of-contract values and impossible balances', async () => {
      const f = await fixture(); assert.equal((await f.call('/plans/accept', { body: await f.accept() })).status, 201);
      const [r] = await f.reservations(), movement = randomUUID(), path = `/movements/${movement}/events`;
      const bad: Record<string, unknown>[] = [{ quantityKits: -1 }, { quantityKits: 1.5 }, { quantityKits: '5' }, { quantityKits: 2147483648 }, { quantityKits: null }, { eventType: 'theft' }, { eventType: 'DISPATCH' }, { eventType: '' },
        { occurredAt: 'yesterday' }, { occurredAt: '2026-11-10' }, { occurredAt: 1762750000 }, { reservationId: 'x' }, { eventKey: 'x' }, { reversesEventId: 'x' }, { reason: 'a' }, { reason: 'a'.repeat(1001) },
        { source: '' }, { reference: 'a'.repeat(201) }, { provenance: 'real' }, { recordedBy: randomUUID() }, { organizationId: randomUUID() }, { fraud: true }];
      for (const change of bad) await assertError(await f.call(path, { body: { ...f.event(r.id, 'dispatch', 5), ...change } }), 422, 'INVALID_REQUEST');
      await assertError(await f.call(path, { body: f.event(randomUUID(), 'dispatch', 5) }), 404, 'NOT_FOUND');
      await assertError(await f.call('/movements/not-a-uuid/events', { body: f.event(r.id, 'dispatch', 5) }), 422, 'INVALID_REQUEST');
      assert.equal(await count('movement_events', f.periodId), 0); assert.equal(await count('movements', f.periodId), 0);
      // Receipt before any dispatch, over-dispatch and zero dispatch are impossible facts.
      for (const body of [f.event(r.id, 'receipt', 1), f.event(r.id, 'collection', 1), f.event(r.id, 'dispatch', 0), f.event(r.id, 'loss_transit', 1), f.event(r.id, 'return', 1)]) {
        const response = await f.call(path, { body }); assert.equal(response.status, 422, body.eventType + ' ' + await response.clone().text());
      }
      const over = await f.call(path, { body: f.event(r.id, 'dispatch', f.stock + 1) }); assert.equal(over.status, 422, 'dispatch above reservation: ' + await over.clone().text());
      assert.equal(await count('movement_events', f.periodId), 0, 'no impossible fact entered the ledger');
      assert.equal((await f.call(path, { body: f.event(r.id, 'dispatch', f.stock) })).status, 201);
      for (const [type, n] of [['receipt', f.stock + 1], ['loss_transit', f.stock + 1], ['collection', 1], ['in_transit', f.stock + 1]] as const) assert.equal((await f.call(path, { body: f.event(r.id, type, n) })).status, 422, type);
      await assertError(await f.call(path, { body: f.event(r.id, 'dispatch', 1, { reversesEventId: randomUUID() }) }), 422);
      const ledger = await service.movement(f.coordinator.context, movement);
      assert.equal(ledger.balances.dispatchedKits, f.stock); assert.equal(ledger.balances.transportBalanceKits, f.stock); assert.equal(ledger.balances.receiptReportedKits, null, 'missing receipt is not zero');
    });
    await t.test('INPUT: a movement id cannot be re-bound to another reservation', async () => {
      const f = await fixture([{ demand: 60 }, { demand: 60 }], 30); assert.equal((await f.call('/plans/accept', { body: await f.accept() })).status, 201);
      const [a, b] = await f.reservations(), movement = randomUUID();
      assert.equal((await f.call(`/movements/${movement}/events`, { body: f.event(a.id, 'dispatch', 5) })).status, 201);
      await assertError(await f.call(`/movements/${movement}/events`, { body: f.event(b.id, 'dispatch', 5) }), 409, 'CONFLICT');
    });
    await t.test('INPUT: event timestamps far in the future are refused', async () => {
      const f = await fixture(); assert.equal((await f.call('/plans/accept', { body: await f.accept() })).status, 201);
      const [r] = await f.reservations();
      const response = await f.call(`/movements/${randomUUID()}/events`, { body: f.event(r.id, 'dispatch', 1, { occurredAt: '9999-12-31T23:59:59Z' }) });
      assert.equal(response.status, 422, await response.clone().text());
    });
    await t.test('INPUT: review updates reject bad values and unknown or foreign reviews', async () => {
      const f = await fixture(); assert.equal((await f.call('/plans/accept', { body: await f.accept() })).status, 201);
      const [r] = await f.reservations(); const dispatched = await f.call(`/movements/${randomUUID()}/events`, { body: f.event(r.id, 'dispatch', 5) });
      const reviewId = (await dispatched.json()).reviewId; assert.match(reviewId, /^[0-9a-f-]{36}$/);
      const good = { periodId: f.periodId, status: 'resolved', reason: 'SYNTHETIC carrier confirmed', provenance: 'simulated' };
      for (const change of [{ status: 'closed' }, { status: '' }, { reason: 'a' }, { reason: null }, { periodId: 'x' }, { provenance: 'x' }, { resolvedBy: randomUUID() }, { fraud: true }])
        await assertError(await f.call('/reviews/' + reviewId, { method: 'PATCH', body: { ...good, ...change } }), 422, 'INVALID_REQUEST');
      await assertError(await f.call('/reviews/not-a-uuid', { method: 'PATCH', body: good }), 422, 'INVALID_REQUEST');
      await assertError(await f.call('/reviews/' + randomUUID(), { method: 'PATCH', body: good }), 404, 'NOT_FOUND');
      // An unknown period fails the idempotency claim's foreign key before the review lookup.
      const wrongPeriod = await f.call('/reviews/' + reviewId, { method: 'PATCH', body: { ...good, periodId: randomUUID() } });
      assert.ok([404, 422].includes(wrongPeriod.status), String(wrongPeriod.status)); await assertError(wrongPeriod, wrongPeriod.status);
      assert.equal((await db.admin`select status from fairshare.reviews where id=${reviewId}`)[0].status, 'open');
      const ok = await f.call('/reviews/' + reviewId, { method: 'PATCH', body: good }); assert.equal(ok.status, 200, await ok.clone().text());
      const [saved] = await db.admin`select status,resolution_reason,resolved_by from fairshare.reviews where id=${reviewId}`;
      assert.equal(saved.status, 'resolved'); assert.equal(saved.resolution_reason, good.reason); assert.equal(saved.resolved_by, f.coordinator.membershipId);
    });

    // ---------------------------------------------------------------- authorization
    await t.test('AUTHZ: role matrix is enforced on every endpoint', async () => {
      const f = await fixture([{ demand: 60 }, { demand: 60 }], 30);
      const accepted = await (await f.call('/plans/accept', { body: await f.accept() })).json(); const [a, b] = await f.reservations();
      const movement = randomUUID(); const dispatched = await (await f.call(`/movements/${movement}/events`, { body: f.event(a.id, 'dispatch', 5) })).json();
      const reviewer = await member(f.organizationId, 'reviewer'), operator = await member(f.organizationId, 'operator'), assigned = await member(f.organizationId, 'operator');
      await db.admin`insert into fairshare.center_operators values(${f.organizationId},${a.center_id},${assigned.membershipId})`;
      const review = { periodId: f.periodId, status: 'in_review', reason: 'SYNTHETIC looking into it', provenance: 'simulated' };
      const as = (who: { bearer: string }) => ({
        snapshot: () => f.call(`/periods/${f.periodId}/snapshot`, { bearer: who.bearer }), summary: () => f.call(`/periods/${f.periodId}/summary`, { bearer: who.bearer }),
        replay: () => f.call(`/receipts/${accepted.receiptId}/replay`, { bearer: who.bearer }), exportCsv: () => f.call(`/receipts/${accepted.receiptId}/export?format=csv`, { bearer: who.bearer }),
        movement: () => f.call(`/movements/${movement}`, { bearer: who.bearer }),
        accept: async () => f.call('/plans/accept', { bearer: who.bearer, body: await f.accept() }), import: async () => f.call('/imports', { bearer: who.bearer, body: f.importBody(await f.revision()) }),
        dispatch: () => f.call(`/movements/${movement}/events`, { bearer: who.bearer, body: f.event(a.id, 'dispatch', 1) }),
        receipt: () => f.call(`/movements/${movement}/events`, { bearer: who.bearer, body: f.event(a.id, 'receipt', 1) }),
        reversal: () => f.call(`/movements/${movement}/events`, { bearer: who.bearer, body: f.event(a.id, 'dispatch', 5, { reversesEventId: dispatched.eventId }) }),
        otherCenter: () => f.call(`/movements/${randomUUID()}/events`, { bearer: who.bearer, body: f.event(b.id, 'receipt', 0) }),
        review: () => f.call('/reviews/' + dispatched.reviewId, { bearer: who.bearer, method: 'PATCH', body: review }),
      });
      const expected: Record<string, Record<string, number>> = {
        reviewer: { snapshot: 200, summary: 200, replay: 200, exportCsv: 200, movement: 200, accept: 403, import: 403, dispatch: 403, receipt: 403, reversal: 403, otherCenter: 403, review: 200 },
        unassignedOperator: { snapshot: 403, summary: 403, replay: 403, exportCsv: 403, movement: 404, accept: 403, import: 403, dispatch: 404, receipt: 404, reversal: 404, otherCenter: 404, review: 403 },
        assignedOperator: { snapshot: 403, summary: 403, replay: 403, exportCsv: 403, movement: 200, accept: 403, import: 403, dispatch: 403, reversal: 403, otherCenter: 404, review: 403, receipt: 201 },
      };
      const actors = { reviewer, unassignedOperator: operator, assignedOperator: assigned };
      const plans = await count('plans', f.periodId), revision = await f.revision();
      for (const [name, who] of Object.entries(actors)) for (const [action, status] of Object.entries(expected[name])) {
        const response = await (as(who) as Record<string, () => Promise<Response>>)[action]();
        assert.equal(response.status, status, `${name} ${action}: ${await response.clone().text()}`);
        if (response.status >= 400) await assertError(response, status);
      }
      assert.equal(await count('plans', f.periodId), plans); assert.equal(await f.revision(), revision, 'denied writes changed nothing');
      assert.equal((await db.admin`select count(*)::int n from fairshare.movement_events where movement_id=${movement}`)[0].n, 2, 'only the dispatch and the assigned operator receipt exist');
    });
    await t.test('AUTHZ: deactivated members and demoted coordinators lose access immediately, even for replays', async () => {
      const f = await fixture(), key = randomUUID(), body = await f.accept();
      assert.equal((await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } })).status, 201);
      await db.admin`update fairshare.memberships set role='reviewer' where id=${f.coordinator.membershipId}`;
      await assertError(await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } }), 403, 'FORBIDDEN');
      await db.admin`update fairshare.memberships set active=false where id=${f.coordinator.membershipId}`;
      for (const path of [`/periods/${f.periodId}/snapshot`, `/periods/${f.periodId}/summary`]) await assertError(await f.call(path), 403, 'FORBIDDEN');
    });
    await t.test('AUTHZ: an idempotency key belongs to one actor and one organization', async () => {
      const f = await fixture(), key = randomUUID(), colleague = await member(f.organizationId, 'coordinator');
      // Actor A claims the key with an import; actor B then presents it on a fresh, otherwise valid acceptance.
      assert.equal((await f.call('/imports', { body: f.importBody(await f.revision()), headers: { 'Idempotency-Key': key } })).status, 201);
      await assertError(await f.call('/plans/accept', { body: await f.accept(), bearer: colleague.bearer, headers: { 'Idempotency-Key': key } }), 403, 'FORBIDDEN');
      assert.equal(await count('plans', f.periodId), 0);
      const first = await f.call('/plans/accept', { body: await f.accept() }); assert.equal(first.status, 201);
      // The same key in another organization is unrelated and must not replay or leak.
      const other = await fixture(); const theirs = await other.call('/plans/accept', { body: await other.accept(), headers: { 'Idempotency-Key': key } });
      assert.equal(theirs.status, 201); assert.notEqual((await theirs.json()).receiptId, (await first.json()).receiptId);
      assert.equal(await count('plans', f.periodId), 1);
    });
    await t.test('AUTHZ: another actor replaying a completed acceptance key gets 403', async () => {
      const f = await fixture(), key = randomUUID(), body = await f.accept(), colleague = await member(f.organizationId, 'coordinator');
      assert.equal((await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } })).status, 201);
      const replay = await f.call('/plans/accept', { body, bearer: colleague.bearer, headers: { 'Idempotency-Key': key } });
      assert.equal(replay.status, 403, await replay.clone().text());
    });
    await t.test('AUTHZ: another actor replaying a completed acceptance key never receives the saved result', async () => {
      const f = await fixture(), key = randomUUID(), body = await f.accept(), colleague = await member(f.organizationId, 'coordinator');
      const saved = await (await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } })).json();
      const replay = await f.call('/plans/accept', { body, bearer: colleague.bearer, headers: { 'Idempotency-Key': key } });
      assert.ok([403, 409].includes(replay.status), String(replay.status)); assert.doesNotMatch(await replay.text(), new RegExp(saved.receiptId));
      assert.equal(await count('plans', f.periodId), 1);
    });
    await t.test('AUTHZ: organization B cannot read, write, replay or export organization A through any endpoint', async () => {
      const a = await fixture(), b = await fixture();
      const accepted = await (await a.call('/plans/accept', { body: await a.accept() })).json(); const [r] = await a.reservations();
      const movement = randomUUID(); const dispatched = await (await a.call(`/movements/${movement}/events`, { body: a.event(r.id, 'dispatch', 5) })).json();
      const before = { plans: await count('plans', a.periodId), events: await count('movement_events', a.periodId), revision: await a.revision() };
      const review = { periodId: a.periodId, status: 'dismissed', reason: 'SYNTHETIC cross-tenant attempt', provenance: 'simulated' };
      const attempts: [string, Promise<Response>, number[]][] = [
        ['snapshot', b.call(`/periods/${a.periodId}/snapshot`), [404]], ['summary', b.call(`/periods/${a.periodId}/summary`), [404]],
        ['replay', b.call(`/receipts/${accepted.receiptId}/replay`), [404]], ['export html', b.call(`/receipts/${accepted.receiptId}/export?format=html`), [404]],
        ['movement', b.call(`/movements/${movement}`), [404]], ['event on their reservation', b.call(`/movements/${movement}/events`, { body: a.event(r.id, 'receipt', 5) }), [404]],
        ['event new movement', b.call(`/movements/${randomUUID()}/events`, { body: a.event(r.id, 'dispatch', 1) }), [404]],
        ['review', b.call('/reviews/' + dispatched.reviewId, { method: 'PATCH', body: review }), [404, 422]],
        ['accept', b.call('/plans/accept', { body: await a.accept() }), [404]], ['import', b.call('/imports', { body: a.importBody(await a.revision()) }), [404, 422]],
        // Org B's valid token with org A's header: not a member there.
        ['header swap', b.call(`/periods/${a.periodId}/snapshot`, { headers: { 'X-Organization-Id': a.organizationId } }), [403]],
        ['header swap write', b.call('/plans/accept', { body: await a.accept(), headers: { 'X-Organization-Id': a.organizationId } }), [403]],
      ];
      for (const [name, pending, allowed] of attempts) { const response = await pending; assert.ok(allowed.includes(response.status), `${name} -> ${response.status} ${await response.clone().text()}`); await assertError(response, response.status); }
      assert.deepEqual({ plans: await count('plans', a.periodId), events: await count('movement_events', a.periodId), revision: await a.revision() }, before);
      assert.equal((await db.admin`select status from fairshare.reviews where id=${dispatched.reviewId}`)[0].status, 'open');
    });
    await t.test('AUTHZ: the runtime database role cannot bypass the API contract with direct SQL', async () => {
      const a = await fixture(), b = await fixture(); const operator = await member(a.organizationId, 'operator');
      const denied = (context: RequestContext, run: (tx: any) => Promise<unknown>, codes = ['42501']) => assert.rejects(repo.transaction(context, run), (e: any) => codes.includes(e.code), 'expected ' + codes);
      const c = a.coordinator.context;
      await denied(c, tx => tx`insert into fairshare.plans(organization_id,id,period_id) values(${a.organizationId},${randomUUID()},${a.periodId})`);
      await denied(c, tx => tx`update fairshare.memberships set role='coordinator'`);
      await denied(c, tx => tx`insert into fairshare.memberships(organization_id,user_id,display_name,role,provenance) values(${a.organizationId},${randomUUID()},'x','coordinator','reported')`);
      await denied(c, tx => tx`delete from fairshare.audit_events`);
      await denied(c, tx => tx`update fairshare.decision_receipts set fingerprint='0'`);
      await denied(c, tx => tx`update fairshare.planning_periods set status='closed'`);
      await denied(c, tx => tx`truncate fairshare.movement_events`);
      await denied(c, tx => tx`select * from fairshare.api_rate_limits`);
      await denied(c, tx => tx`set local role fairshare_writer`, ['42501', '0LP01']);
      await denied(c, tx => tx`select * from auth.users`);
      await denied(c, tx => tx`create table fairshare.backdoor(id int)`);
      await denied(c, tx => tx`select fairshare.write_record('drop_everything','{}'::jsonb)`, ['22023', '22004', 'P0002', '42501']);
      // An operator calling the privileged writer directly is still refused.
      await denied(operator.context, tx => tx`select fairshare.write_record('accept',${tx.json({ periodId: a.periodId, expectedRevision: 1 })})`);
      // Switching the transaction-local organization does not help a non-member.
      await repo.transaction(b.coordinator.context, async tx => {
        await tx`select set_config('app.org_id',${a.organizationId},true)`;
        for (const table of ['plans', 'planning_periods', 'stock_records', 'demand_records', 'memberships', 'audit_events', 'idempotency_records'])
          assert.equal((await tx.unsafe(`select * from fairshare.${table}`)).length, 0, table + ' leaked across organizations');
      });
      // Without any context, nothing is visible at all.
      for (const table of ['organizations', 'planning_periods', 'memberships', 'plans']) assert.equal((await sql.unsafe(`select * from fairshare.${table}`)).length, 0, table);
    });
    await t.test('AUTHZ: a closed period accepts no further writes', async () => {
      const f = await fixture(); await db.admin`update fairshare.planning_periods set status='closed' where id=${f.periodId}`;
      await assertError(await f.call('/plans/accept', { body: await f.accept() }), 404, 'NOT_FOUND');
      await assertError(await f.call('/imports', { body: f.importBody(await f.revision()) }), 404, 'NOT_FOUND');
      assert.equal((await f.call(`/periods/${f.periodId}/snapshot`)).status, 200, 'history stays readable'); assert.equal(await count('plans', f.periodId), 0);
    });

    // ---------------------------------------------------------------- API flows
    await t.test('FLOW: hand-checkable base, disruption and restore scenarios through the public API', async () => {
      const f = await fixture([{ demand: 60, code: 'A' }, { demand: 60, capacity: 40, code: 'B' }, { demand: 60, code: 'C' }], 120);
      const allocations = async () => { const r = await f.call('/plans/accept', { body: await f.accept() }); assert.equal(r.status, 201, await r.clone().text());
        const record = (await db.admin`select payload from fairshare.decision_receipts where id=${(await r.json()).receiptId}`)[0].payload;
        return Object.fromEntries(record.result.allocations.map((x: { regionId: string; allocatedKits: number }) => [x.regionId, x.allocatedKits])); };
      assert.deepEqual(await allocations(), { A: 40, B: 40, C: 40 });
      const change = async (capacity: string, stock = '120') => { const body = f.importBody(await f.revision()); body.regions[1].capacity_kits = capacity; body.stock.stock_kits = stock; const r = await f.call('/imports', { body }); assert.equal(r.status, 201, await r.clone().text()); };
      await change('20'); assert.deepEqual(await allocations(), { A: 50, B: 20, C: 50 });
      await change('20', '140'); assert.deepEqual(await allocations(), { A: 60, B: 20, C: 60 });
      await change('40'); assert.deepEqual(await allocations(), { A: 40, B: 40, C: 40 });
      const live = (await f.reservations()).filter((r: { released_kits: string; reserved_kits: string }) => Number(r.released_kits) === 0);
      assert.equal(live.reduce((s: number, r: { reserved_kits: string }) => s + Number(r.reserved_kits), 0), 120, 'superseded plans hold no live reservation');
    });
    await t.test('FLOW: closure keeps demand visible, allocates nothing new and does not block others', async () => {
      const f = await fixture([{ demand: 60, code: 'A' }, { demand: 60, capacity: 40, code: 'B' }, { demand: 60, code: 'C' }], 120);
      const body = f.importBody(await f.revision()); body.regions[2].status = 'closed'; body.regions[2].capacity_kits = '0'; assert.equal((await f.call('/imports', { body })).status, 201);
      const snapshot = await (await f.call(`/periods/${f.periodId}/snapshot`)).json();
      assert.deepEqual(snapshot.input.regions.map((r: { regionId: string; demandKits: number; status: string }) => [r.regionId, r.demandKits, r.status]), [['A', 60, 'open'], ['B', 60, 'open'], ['C', 60, 'closed']]);
      const accepted = await (await f.call('/plans/accept', { body: await f.accept() })).json();
      const record = (await db.admin`select payload from fairshare.decision_receipts where id=${accepted.receiptId}`)[0].payload;
      assert.deepEqual(record.result.allocations.map((x: { allocatedKits: number }) => x.allocatedKits), [60, 40, 0]);
    });
    await t.test('FLOW: acceptance is exactly-once under retry, payload change and stale revision', async () => {
      const f = await fixture(), key = randomUUID(), body = await f.accept();
      const first = await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } }); assert.equal(first.status, 201); const saved = await first.json();
      assert.match(saved.receiptId, /^[0-9a-f-]{36}$/); assert.match(saved.fingerprint, /^[0-9a-f]{64}$/); assert.equal(saved.revision, body.expectedRevision + 1);
      for (let i = 0; i < 3; i++) { const retry = await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } }); assert.equal(retry.status, 201); assert.deepEqual(await retry.json(), saved); }
      // Key order and insignificant whitespace are the same canonical payload.
      const reordered = await f.call('/plans/accept', { raw: JSON.stringify(Object.fromEntries(Object.entries(body).reverse()), null, 2), headers: { 'Idempotency-Key': key } });
      assert.equal(reordered.status, 201); assert.deepEqual(await reordered.json(), saved);
      assert.equal(await count('plans', f.periodId), 1); assert.equal(await count('reservations', f.periodId), 1); assert.equal(await count('decision_receipts', f.periodId), 1);
      await assertError(await f.call('/plans/accept', { body }), 409, 'STALE_REVISION');
      await assertError(await f.call('/plans/accept', { body: { ...body, expectedRevision: 999 } }), 409, 'STALE_REVISION');
      assert.equal(await count('plans', f.periodId), 1);
    });
    await t.test('FLOW: reusing an idempotency key with a different payload is 422', async () => {
      const f = await fixture(), key = randomUUID(), body = await f.accept();
      assert.equal((await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } })).status, 201);
      const changed = await f.call('/plans/accept', { body: { ...body, reason: 'SYNTHETIC different content' }, headers: { 'Idempotency-Key': key } });
      await assertError(changed, 422, 'KEY_CONFLICT');
    });
    await t.test('FLOW: a changed payload under a used key is refused and changes nothing', async () => {
      const f = await fixture(), key = randomUUID(), body = await f.accept();
      assert.equal((await f.call('/plans/accept', { body, headers: { 'Idempotency-Key': key } })).status, 201);
      for (const change of [{ reason: 'SYNTHETIC different content' }, { algorithm: 'hamilton-proportional' }, { expectedRevision: body.expectedRevision + 1 }]) {
        const r = await f.call('/plans/accept', { body: { ...body, ...change }, headers: { 'Idempotency-Key': key } }); assert.ok([409, 422].includes(r.status), String(r.status)); await assertError(r, r.status);
      }
      assert.equal(await count('plans', f.periodId), 1);
      // The key that accepted a plan cannot be replayed against another endpoint either.
      const reuse = await f.call('/imports', { body: f.importBody(await f.revision()), headers: { 'Idempotency-Key': key } }); assert.ok([409, 422].includes(reuse.status), String(reuse.status));
    });
    await t.test('FLOW: twenty concurrent acceptances of one revision commit exactly one plan', async () => {
      const f = await fixture(), body = await f.accept();
      const responses = await Promise.all(Array.from({ length: 20 }, () => f.call('/plans/accept', { body })));
      const statuses = responses.map(r => r.status); assert.equal(statuses.filter(s => s === 201).length, 1, statuses.join()); assert.ok(statuses.every(s => s === 201 || s === 409), statuses.join());
      assert.equal(await count('plans', f.periodId), 1); assert.equal(await count('reservations', f.periodId), 1); assert.equal(await f.revision(), body.expectedRevision + 1);
    });
    await t.test('FLOW: dispatch, receipt and collection keep two separate balances and replays never double-count', async () => {
      const f = await fixture([{ demand: 60 }], 40); assert.equal((await f.call('/plans/accept', { body: await f.accept() })).status, 201);
      const [r] = await f.reservations(), movement = randomUUID(), path = `/movements/${movement}/events`;
      const dispatch = f.event(r.id, 'dispatch', 40); const first = await f.call(path, { body: dispatch }); assert.equal(first.status, 201); const saved = await first.json();
      for (let i = 0; i < 3; i++) { const retry = await f.call(path, { body: dispatch }); assert.equal(retry.status, 201); assert.deepEqual(await retry.json(), saved); }
      assert.equal((await Promise.all(Array.from({ length: 5 }, () => f.call(path, { body: f.event(r.id, 'receipt', 35) })))).filter(x => x.status === 201).length, 1, 'only one of five racing receipts of 35 fits the transport balance');
      assert.equal((await f.call(path, { body: f.event(r.id, 'collection', 25) })).status, 201);
      const view = await (await f.call(`/movements/${movement}`)).json();
      assert.equal(view.balances.dispatchedKits, 40); assert.equal(view.balances.transportBalanceKits, 5); assert.equal(view.balances.unexplainedTransportKits, 5); assert.equal(view.balances.centerBalanceKits, 10);
      assert.equal(view.balances.valid, true); assert.ok(view.reviews.length >= 1, 'mismatch opened a review'); assert.doesNotMatch(JSON.stringify(view), /fraud|theft|guilt/i);
      assert.equal((await db.admin`select fulfilled_kits::int n from fairshare.reservations where id=${r.id}`)[0].n, 40);
      // A coordinator correction appends an exact reversal; history is never rewritten.
      const reversal = await f.call(path, { body: f.event(r.id, 'collection', 25, { reversesEventId: (await db.admin`select id from fairshare.movement_events where movement_id=${movement} and event_type='collection'`)[0].id }) });
      assert.equal(reversal.status, 201, await reversal.clone().text());
      const after = await (await f.call(`/movements/${movement}`)).json(); assert.equal(after.balances.centerBalanceKits, 35);
      assert.deepEqual(after.balances.timeline.map((e: { state: string }) => e.state), ['active', 'active', 'reversed', 'correction']);
    });
    await t.test('FLOW: receipt replay is exact and reports later evidence changes', async () => {
      const f = await fixture(); const accepted = await (await f.call('/plans/accept', { body: await f.accept() })).json();
      const codes = (body: { changes: { code: string }[] }) => body.changes.map(c => c.code);
      const exact = await (await f.call(`/receipts/${accepted.receiptId}/replay`)).json(); assert.equal(exact.status, 'exact');
      assert.ok(!codes(exact).includes('STOCK_CHANGED') && !codes(exact).includes('REGION_INPUT_CHANGED')); assert.ok(exact.differences.every((d: { before: number; after: number }) => d.before === d.after));
      const body = f.importBody(await f.revision()); body.stock.stock_kits = '10'; assert.equal((await f.call('/imports', { body })).status, 201);
      const later = await (await f.call(`/receipts/${accepted.receiptId}/replay`)).json(); assert.equal(later.status, 'exact'); assert.equal(later.changed, true);
      assert.ok(codes(later).includes('STOCK_CHANGED')); assert.ok(later.differences.some((d: { before: number; after: number }) => d.before !== d.after));
      await assertError(await f.call(`/receipts/${randomUUID()}/replay`), 404, 'NOT_FOUND');
    });
    await t.test('FLOW: replaying a receipt right after acceptance reports no change', async () => {
      const f = await fixture(); const accepted = await (await f.call('/plans/accept', { body: await f.accept() })).json();
      const exact = await (await f.call(`/receipts/${accepted.receiptId}/replay`)).json();
      assert.equal(exact.changed, false); assert.deepEqual(exact.changes, []);
    });
    await t.test('FLOW: summary pagination is bounded, stable and complete', async () => {
      const f = await fixture(Array.from({ length: 7 }, () => ({ demand: 10 })), 35); assert.equal((await f.call('/plans/accept', { body: await f.accept() })).status, 201);
      const seen: string[] = []; let cursor: string | null = null, pages = 0;
      do { const page: { reservations: { id: string }[]; nextCursor: string | null } = await (await f.call(`/periods/${f.periodId}/summary?limit=3${cursor ? '&cursor=' + cursor : ''}`)).json();
        assert.ok(page.reservations.length <= 3); seen.push(...page.reservations.map(r => r.id)); cursor = page.nextCursor; pages++; } while (cursor && pages < 10);
      assert.equal(pages, 3); assert.equal(seen.length, 7); assert.equal(new Set(seen).size, 7); assert.deepEqual(seen, [...seen].sort());
      const all = await (await f.call(`/periods/${f.periodId}/summary`)).json(); assert.equal(all.reservations.length, 7); assert.equal(all.nextCursor, null);
      assert.equal((await (await f.call(`/periods/${f.periodId}/summary?cursor=${randomUUID().replace(/^./, 'f')}&limit=100`)).json()).nextCursor, null);
    });

    // ---------------------------------------------------------------- export safety
    await t.test('EXPORT: spreadsheet formulas and HTML in stored text are neutralised in downloads', async () => {
      const f = await fixture([{ demand: 60, code: '=HYPERLINK("https://evil.invalid","x")', name: '<img src=x onerror=alert(1)>' }, { demand: 60, code: '<script>alert(document.domain)</script>' },
        { demand: 60, code: '@SUM(1+1)*cmd|\' /C calc\'!A0' }, { demand: 60, code: '-2+3' }, { demand: 60, code: '+1' }, { demand: 60, code: '​=1+1' }], 60);
      const reason = '=cmd|\' /C calc\'!A0 </p><script>alert(1)</script> "quoted", line\r\nbreak';
      const accepted = await f.call('/plans/accept', { body: await f.accept({ reason }) }); assert.equal(accepted.status, 201, await accepted.clone().text());
      const { receiptId } = await accepted.json();
      const csv = await f.call(`/receipts/${receiptId}/export?format=csv`), html = await f.call(`/receipts/${receiptId}/export?format=html`);
      for (const [response, type, name] of [[csv, 'text/csv; charset=utf-8', 'csv'], [html, 'text/html; charset=utf-8', 'html']] as const) {
        assert.equal(response.status, 200); assert.equal(response.headers.get('content-type')?.toLowerCase(), type);
        assert.equal(response.headers.get('content-disposition'), `attachment; filename="fairshare-receipt.${name}"`);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/); assert.match(response.headers.get('content-security-policy') ?? '', /sandbox/);
      }
      const text = await csv.text(), records = text.split(/\r\n(?=")/).filter(Boolean);
      assert.equal(records.length, 7, 'header plus six regions; embedded line break stays inside its quoted cell');
      // Decode RFC 4180 cells: every cell is quoted, quotes doubled.
      const cells = (record: string) => [...record.matchAll(/"((?:[^"]|"")*)"(?:,|\r\n|$)/g)].map(m => m[1].replace(/""/g, '"'));
      for (const record of records.slice(1)) for (const cell of cells(record)) {
        const visible = cell.replace(/^[\s​-‏⁠-⁯]*/u, '');
        assert.doesNotMatch(visible, /^[=+@-]/, 'formula cell not neutralised: ' + cell.slice(0, 40));
        assert.doesNotMatch(cell, /^[\t\r\n]/);
      }
      assert.equal(cells(records[1])[5], "'" + reason.trim(), 'reason is preserved after the leading quote');
      const page = await html.text();
      assert.doesNotMatch(page, /<script|<img|onerror=|<\/p><script/i); assert.match(page, /&lt;script&gt;alert\(document\.domain\)&lt;\/script&gt;/);
      assert.equal((page.match(/<script/gi) ?? []).length, 0); assert.equal((page.match(/<table>/g) ?? []).length, 1);
    });

    // ---------------------------------------------------------------- real HTTP
    await t.test('WIRE: the same guarantees hold over a real HTTP socket', async () => {
      const f = await fixture();
      const server = createServer(async (req, res) => {
        const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET');
        const response = await app.fetch(new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers as Record<string, string>, ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}) } as RequestInit));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/api/v1';
      const headers = { Authorization: 'Bearer ' + f.coordinator.bearer, 'X-Organization-Id': f.organizationId, 'Content-Type': 'application/json' };
      try {
        const health = await fetch(base + '/health'); assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok', stage: 'scaffold' });
        assert.equal((await fetch(base + `/periods/${f.periodId}/snapshot`)).status, 401);
        const snapshot = await fetch(base + `/periods/${f.periodId}/snapshot`, { headers }); assert.equal(snapshot.status, 200);
        const body = await snapshot.json(); assert.equal(body.periodId, f.periodId); assert.equal(body.organizationId, f.organizationId); assert.equal(body.input.stockKits, f.stock);
        const chunks = async function* () { for (let i = 0; i < 40; i++) yield Buffer.from('a'.repeat(8192)); };
        const chunked = await fetch(base + '/imports', { method: 'POST', headers: { ...headers, 'Idempotency-Key': randomUUID() }, body: Readable.toWeb(Readable.from(chunks())) as BodyInit, duplex: 'half' } as RequestInit);
        assert.equal(chunked.status, 413);
        const accepted = await fetch(base + '/plans/accept', { method: 'POST', headers: { ...headers, 'Idempotency-Key': randomUUID() }, body: JSON.stringify(await f.accept()) });
        assert.equal(accepted.status, 201); assert.match(accepted.headers.get('content-type') ?? '', /application\/json/); assert.equal(accepted.headers.get('cache-control'), 'no-store');
        const preflight = await fetch(base + '/plans/accept', { method: 'OPTIONS', headers: { Origin: 'https://evil.invalid', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,x-organization-id' } });
        assert.equal(preflight.headers.get('access-control-allow-origin'), null, 'cross-origin browsers must not be granted access'); assert.ok(preflight.status >= 400);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });
  } finally { await sql.end(); await db.stop(); }
});
