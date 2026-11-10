import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
const org = "10000000-0000-0000-0000-000000000001";
const otherOrg = "10000000-0000-0000-0000-000000000002";
const actor = "20000000-0000-0000-0000-000000000001";
const period = "50000000-0000-0000-0000-000000000001";
const movement = "90000000-0000-0000-0000-000000000001";
const immutableTables = ["period_regions", "stock_records", "demand_records", "capacity_records",
  "input_snapshots", "plans", "allocations", "decision_receipts", "movements", "movement_events", "audit_events"];

test("database migrations and synthetic data", async (t) => {
  const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
  assert.equal(migrations.length, 4, "expected four reviewed schema migrations");
  const db = await PGlite.create();
  try {
    // Supabase supplies this real table. This isolated test stub only checks the FK.
    await db.exec("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);");
    for (const name of migrations) await db.exec(await readFile(new URL(name, migrationDir), "utf8"));
    const seed = await readFile(new URL("../../supabase/seed.sql", import.meta.url), "utf8");
    await t.test("synthetic seed requires explicit development opt-in", async () => {
      await assert.rejects(db.exec(seed), /synthetic seed disabled/);
      await db.exec("ROLLBACK");
    });
    await db.exec("SET app.allow_synthetic_seed = 'true'");
    await db.exec(seed);

    const rejected = async (sql, code) => {
      await assert.rejects(db.transaction((tx) => tx.exec(sql)), (error) => error.code === code);
    };
    const rollback = async (fn) => {
      const sentinel = new Error("test rollback");
      try { await db.transaction(async (tx) => { await fn(tx); throw sentinel; }); }
      catch (error) { if (error !== sentinel) throw error; }
    };
    const context = async (tx, tenant = org, user = actor) => {
      await tx.exec("SET LOCAL ROLE fairshare_schema_test");
      await tx.query("SELECT set_config('app.org_id', $1, true), set_config('app.actor_id', $2, true)", [tenant, user]);
    };

    await t.test("synthetic seed does not create authentication users", async () => {
      assert.equal((await db.query("SELECT count(*)::int AS n FROM auth.users")).rows[0].n, 0);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM fairshare.memberships WHERE user_id IS NOT NULL")).rows[0].n, 0);
    });
    await t.test("all fixture facts are explicitly simulated", async () => {
      for (const table of ["organizations", "memberships", "centers", "regions", "planning_periods", "stock_records",
        "demand_records", "capacity_records", "input_snapshots", "plans", "decision_receipts", "movements", "movement_events", "reviews", "audit_events"]) {
        assert.equal((await db.query(`SELECT count(*)::int AS n FROM fairshare.${table} WHERE provenance <> 'simulated'`)).rows[0].n, 0, table);
      }
    });
    await t.test("repeat seed leaves record counts and period revisions unchanged", async () => {
      const before = await db.query("SELECT id, revision FROM fairshare.planning_periods ORDER BY id");
      const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'fairshare' ORDER BY tablename")).rows;
      const counts = [];
      for (const { tablename } of tables) counts.push((await db.query(`SELECT count(*)::int AS n FROM fairshare.${tablename}`)).rows[0].n);
      await db.exec(seed);
      assert.deepEqual((await db.query("SELECT id, revision FROM fairshare.planning_periods ORDER BY id")).rows, before.rows);
      for (const [i, { tablename }] of tables.entries()) assert.equal((await db.query(`SELECT count(*)::int AS n FROM fairshare.${tablename}`)).rows[0].n, counts[i], tablename);
    });
    await t.test("scenario fixtures match normal, shortage and reduced-capacity inputs", async () => {
      const stocks = (await db.query("SELECT quantity_kits::int AS n FROM fairshare.stock_records ORDER BY period_id")).rows;
      assert.deepEqual(stocks.map((row) => row.n), [120, 90, 120]);
      const capacities = (await db.query("SELECT quantity_kits::int AS n FROM fairshare.capacity_records ORDER BY period_id, center_id")).rows;
      assert.deepEqual(capacities.map((row) => row.n), [60,40,60,60,40,60,60,20,60]);
    });
    await t.test("reconciliation fixture keeps transit and center balances separate", async () => {
      const { rows } = await db.query(`SELECT
        sum(CASE event_type WHEN 'dispatch' THEN quantity_kits ELSE 0 END)
          - sum(CASE event_type WHEN 'receipt' THEN quantity_kits ELSE 0 END) AS unresolved,
        sum(CASE event_type WHEN 'receipt' THEN quantity_kits ELSE 0 END)
          - sum(CASE event_type WHEN 'collection' THEN quantity_kits ELSE 0 END) AS center_remaining
        FROM fairshare.movement_events`);
      assert.equal(Number(rows[0].unresolved), 5);
      assert.equal(Number(rows[0].center_remaining), 10);
    });
    await t.test("kit quantities reject fractional, negative, non-finite and excessive values", async () => {
      for (const value of ["-1", "1.5", "2147483648", "NaN", "Infinity", "-Infinity"]) {
        await assert.rejects(db.query("SELECT $1::fairshare.kit_quantity", [value]), (error) => error.code === "23514");
      }
      assert.equal(Number((await db.query("SELECT 0::fairshare.kit_quantity AS n")).rows[0].n), 0);
      await rejected("UPDATE fairshare.reservations SET fulfilled_kits = NULL", "23502");
    });
    await t.test("reported membership must link to a real auth user; simulated membership cannot", async () => {
      await rejected(`INSERT INTO fairshare.memberships(organization_id, display_name, role, provenance)
        VALUES ('${org}', 'Missing user', 'coordinator', 'reported')`, "23514");
      await rejected(`INSERT INTO fairshare.memberships(organization_id, user_id, display_name, role, provenance)
        VALUES ('${org}', gen_random_uuid(), 'Unknown auth user', 'coordinator', 'reported')`, "23503");
    });
    await t.test("a period needs a positive explicit time range", async () => {
      await rejected(`INSERT INTO fairshare.planning_periods(organization_id, code, starts_at, ends_at, provenance)
        VALUES ('${org}', 'bad-range', now(), now(), 'simulated')`, "23514");
    });
    const capacityInsert = (center, revision = 2, quantity = 50) => `INSERT INTO fairshare.capacity_records
      (organization_id, period_id, center_id, revision, quantity_kits, source, observed_at, provenance, recorded_by)
      VALUES ('${org}', '${period}', '${center}', ${revision}, ${quantity}, 'SYNTHETIC test', now(), 'simulated', '${actor}')`;
    await t.test("foreign keys reject a center from another organization", async () => {
      await rejected(capacityInsert("30000000-0000-0000-0000-000000000011"), "23503");
    });
    await t.test("a new input advances the period revision exactly once", async () => {
      await rollback(async (tx) => {
        const before = (await tx.query(`SELECT revision FROM fairshare.planning_periods WHERE organization_id = '${org}' AND id = '${period}'`)).rows[0].revision;
        await tx.exec(capacityInsert("30000000-0000-0000-0000-000000000001"));
        const row = (await tx.query(`SELECT period_revision FROM fairshare.capacity_records WHERE organization_id = '${org}' AND period_id = '${period}' AND revision = 2`)).rows[0];
        assert.equal(row.period_revision, before + 1);
      });
    });
    await t.test("duplicate input revision is rejected and its period increment rolls back", async () => {
      const before = (await db.query(`SELECT revision FROM fairshare.planning_periods WHERE organization_id = '${org}' AND id = '${period}'`)).rows[0].revision;
      await rejected(capacityInsert("30000000-0000-0000-0000-000000000001", 1), "23505");
      assert.equal((await db.query(`SELECT revision FROM fairshare.planning_periods WHERE organization_id = '${org}' AND id = '${period}'`)).rows[0].revision, before);
    });
    await t.test("closed periods reject new inputs", async () => {
      await assert.rejects(db.transaction(async (tx) => {
        await tx.exec(`UPDATE fairshare.planning_periods SET status = 'closed' WHERE organization_id = '${org}' AND id = '${period}'`);
        await tx.exec(capacityInsert("30000000-0000-0000-0000-000000000001"));
      }), (error) => error.code === "23514");
    });
    await t.test("closed capacity cannot have nonzero new usable allowance", async () => {
      await assert.rejects(db.transaction(async (tx) => {
        await tx.exec(capacityInsert("30000000-0000-0000-0000-000000000001").replace("recorded_by)", "recorded_by, is_closed)").replace(`'${actor}')`, `'${actor}', true)`));
      }), (error) => error.code === "23514");
    });
    await t.test("reservations cannot consume more than reserved, or exceed their allocation", async () => {
      await rejected("UPDATE fairshare.reservations SET fulfilled_kits = 41", "23514");
      await rejected("UPDATE fairshare.reservations SET reserved_kits = 41 WHERE fulfilled_kits = 0", "23503");
    });
    await t.test("a movement cannot reference a reservation from another period", async () => {
      await rejected(`INSERT INTO fairshare.movements(organization_id, period_id, reservation_id, region_id, center_id, reference, provenance, created_by)
        VALUES ('${org}', '50000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001',
          '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'SYNTHETIC wrong period', 'simulated', '${actor}')`, "23503");
    });
    await t.test("snapshot payload hashes are verified by PostgreSQL", async () => {
      await rejected(`INSERT INTO fairshare.input_snapshots(organization_id, period_id, revision, payload, canonical_payload, fingerprint, provenance)
        VALUES ('${org}', '${period}', 999, '{}', '{}', repeat('a', 64), 'simulated')`, "23514");
    });
    await t.test("a plan cannot reference another period's input snapshot", async () => {
      await rejected(`INSERT INTO fairshare.plans(organization_id, period_id, snapshot_id, input_revision, accepted_revision,
        algorithm, engine_version, policy_version, accepted_by, reason, provenance)
        VALUES ('${org}', '50000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001',
          7, 8, 'hamilton-proportional', 'test', 'test', '${actor}', 'SYNTHETIC wrong period', 'simulated')`, "23503");
    });
    for (const table of immutableTables) {
      await t.test(`${table}: update, delete and truncate cannot rewrite history`, async () => {
        await rejected(`UPDATE fairshare.${table} SET organization_id = organization_id WHERE organization_id = '${org}'`, "23514");
        await rejected(`DELETE FROM fairshare.${table} WHERE organization_id = '${org}'`, "23514");
        await rejected(`TRUNCATE fairshare.${table} CASCADE`, "23514");
      });
    }

    const eventInsert = (quantity, reverses = "NULL", type = "receipt", eventKey = "gen_random_uuid()") => `INSERT INTO fairshare.movement_events
      (organization_id, period_id, movement_id, event_key, event_type, quantity_kits, reverses_event_id,
       reference_doc, reason, source, provenance, occurred_at, recorded_by)
      VALUES ('${org}', '${period}', '${movement}', ${eventKey}, '${type}', ${quantity}, ${reverses},
        'SYNTHETIC doc', 'SYNTHETIC correction', 'SYNTHETIC test', 'simulated', now(), '${actor}')`;
    await t.test("duplicate event IDs cannot silently record a second fact", async () => {
      await rejected(eventInsert(35, "NULL", "receipt", "'a1000000-0000-0000-0000-000000000002'"), "23505");
    });
    await t.test("event reversal must match quantity and type; valid reversal appends", async () => {
      await rejected(eventInsert(34, "'a0000000-0000-0000-0000-000000000002'"), "23514");
      await rejected(eventInsert(35, "'a0000000-0000-0000-0000-000000000002'", "collection"), "23514");
      await rollback(async (tx) => {
        await tx.exec(eventInsert(35, "'a0000000-0000-0000-0000-000000000002'"));
        assert.equal((await tx.query("SELECT count(*)::int AS n FROM fairshare.movement_events")).rows[0].n, 4);
      });
    });
    await t.test("an original event cannot be reversed twice", async () => {
      await assert.rejects(db.transaction(async (tx) => {
        await tx.exec(eventInsert(35, "'a0000000-0000-0000-0000-000000000002'"));
        await tx.exec(eventInsert(35, "'a0000000-0000-0000-0000-000000000002'"));
      }), (error) => error.code === "23505");
    });
    await t.test("a dispatch advances the revision; receipt does not", async () => {
      await rollback(async (tx) => {
        const before = (await tx.query(`SELECT revision FROM fairshare.planning_periods WHERE organization_id = '${org}' AND id = '${period}'`)).rows[0].revision;
        await tx.exec(eventInsert(1, "NULL", "dispatch"));
        await tx.exec(eventInsert(1));
        assert.equal((await tx.query(`SELECT revision FROM fairshare.planning_periods WHERE organization_id = '${org}' AND id = '${period}'`)).rows[0].revision, before + 1);
      });
    });
    await t.test("closing a review requires a resolution actor, time and reason", async () => {
      await rejected("UPDATE fairshare.reviews SET status = 'resolved'", "23514");
    });

    const pendingClaim = `INSERT INTO fairshare.idempotency_records(organization_id, request_key, period_id, actor_id, payload_hash)
      VALUES ('${org}', 'e0000000-0000-0000-0000-000000000002', '${period}', '${actor}', repeat('b',64))`;
    await t.test("an unfinished idempotency claim cannot commit", async () => {
      await rejected(pendingClaim, "23514");
    });
    await t.test("idempotency claim may complete within the same transaction", async () => {
      await rollback(async (tx) => {
        await tx.exec(pendingClaim);
        await tx.exec(`UPDATE fairshare.idempotency_records SET state = 'completed', response_status = 200,
          response_body = '{"status":"SYNTHETIC"}', completed_at = now()
          WHERE organization_id = '${org}' AND request_key = 'e0000000-0000-0000-0000-000000000002'`);
        await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
      });
    });
    await t.test("idempotency key is unique within organization even for another actor", async () => {
      await rejected(`INSERT INTO fairshare.idempotency_records(organization_id, request_key, period_id, actor_id, payload_hash)
        VALUES ('${org}', 'e0000000-0000-0000-0000-000000000001', '${period}',
          '20000000-0000-0000-0000-000000000002', repeat('c',64))`, "23505");
      await rejected("UPDATE fairshare.idempotency_records SET payload_hash = repeat('c',64)", "23514");
      await rejected("DELETE FROM fairshare.idempotency_records", "23514");
    });

    await db.exec(`CREATE ROLE fairshare_schema_test NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA fairshare TO fairshare_schema_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA fairshare TO fairshare_schema_test;
      GRANT EXECUTE ON FUNCTION fairshare.current_organization_id(), fairshare.current_actor_id() TO fairshare_schema_test;`);
    await t.test("default roles have no schema, table or function access", async () => {
      await db.exec("CREATE ROLE fairshare_unprivileged NOSUPERUSER NOBYPASSRLS");
      const row = (await db.query(`SELECT
        has_schema_privilege('fairshare_unprivileged', 'fairshare', 'USAGE') AS schema_access,
        has_table_privilege('fairshare_unprivileged', 'fairshare.plans', 'SELECT') AS table_access,
        has_function_privilege('fairshare_unprivileged', 'fairshare.current_organization_id()', 'EXECUTE') AS function_access`)).rows[0];
      assert.deepEqual(row, { schema_access: false, table_access: false, function_access: false });
    });
    await t.test("all twenty business tables enable and force RLS", async () => {
      const rows = (await db.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='fairshare' AND relkind='r'")).rows;
      assert.equal(rows.length, 20);
      assert.ok(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));
    });
    await t.test("restricted role sees no rows when organization or actor context is missing", async () => {
      await rollback(async (tx) => {
        await context(tx, "", actor);
        assert.equal((await tx.query("SELECT count(*)::int AS n FROM fairshare.organizations")).rows[0].n, 0);
        await tx.query("SELECT set_config('app.org_id', $1, true), set_config('app.actor_id', '', true)", [org]);
        assert.equal((await tx.query("SELECT count(*)::int AS n FROM fairshare.organizations")).rows[0].n, 0);
      });
    });
    await t.test("restricted role cannot read or mutate another organization's rows", async () => {
      await rollback(async (tx) => {
        await context(tx);
        assert.deepEqual((await tx.query("SELECT id FROM fairshare.organizations")).rows.map((row) => row.id), [org]);
        assert.equal((await tx.query(`UPDATE fairshare.centers SET name = 'wrong tenant' WHERE organization_id = '${otherOrg}' RETURNING id`)).rows.length, 0);
      });
      await assert.rejects(db.transaction(async (tx) => {
        await context(tx);
        await tx.exec(`INSERT INTO fairshare.centers(organization_id, code, name, provenance) VALUES ('${otherOrg}', 'attack', 'Wrong org', 'simulated')`);
      }), (error) => error.code === "42501");
    });
    await t.test("clearing context cannot hide an unfinished claim from its deferred constraint", async () => {
      await assert.rejects(db.transaction(async (tx) => {
        await context(tx);
        await tx.exec(pendingClaim);
        await tx.query("SELECT set_config('app.org_id', '', true)");
        await tx.exec("SET CONSTRAINTS ALL IMMEDIATE");
      }), (error) => error.code === "23514");
    });
    await t.test("UTC timestamps preserve their instant under IST display", async () => {
      await rollback(async (tx) => {
        await tx.exec("SET LOCAL TIME ZONE 'Asia/Kolkata'");
        const row = (await tx.query(`SELECT starts_at AT TIME ZONE 'UTC' AS utc_start,
          extract(epoch FROM starts_at)::bigint AS epoch FROM fairshare.planning_periods WHERE organization_id = '${org}' AND id = '${period}'`)).rows[0];
        assert.equal(Number(row.epoch), Date.parse("2026-11-10T00:00:00Z") / 1000);
      });
    });
  } finally {
    await db.close();
  }
});
