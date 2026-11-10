import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeAllocation } from '../src/optimization.ts';
import { allocateReference, allocateFairness, AllocationInputError, compareAllocations, evaluateAllocation } from '../src/index.ts';
import type { EngineOutcome, OptimizationResult, PeriodInput, RegionInputRow } from '../src/index.ts';
import { readdirSync, readFileSync } from 'node:fs';

const row = (regionId = 'A', demandKits = 5, capacityKits = 5, priorDispatchedKits = 0, status: 'open' | 'closed' = 'open'): RegionInputRow => ({
  periodId: 'p', regionId, regionName: regionId, centerId: `c-${regionId}`, demandKits, capacityKits, priorDispatchedKits, status, provenance: 'simulated' });
const input = (stockKits = 5, regions = [row()]): PeriodInput => ({ periodId: 'p', stockKits, regions });
function success(r: EngineOutcome): OptimizationResult { assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw new Error('failed'); return r; }
const amounts = (r: OptimizationResult) => r.allocations.map(a => a.allocatedKits);
const fixtureDir = new URL('./fixtures/optimization/', import.meta.url);
for (const file of readdirSync(fixtureDir).sort()) {
  const fixture = JSON.parse(readFileSync(new URL(file, fixtureDir), 'utf8'));
  test(`golden ${fixture.name}`, () => {
    const actual = success(optimizeAllocation(fixture.input));
    assert.deepEqual(actual, success(allocateReference(fixture.input)));
    assert.deepEqual(actual.allocations.map(({ regionId, allocatedKits, newlyAllocatedKits }) => ({ regionId, allocatedKits, newlyAllocatedKits })), fixture.expected.allocations);
    assert.equal(actual.totalAllocatedKits, fixture.expected.totalAllocatedKits);
    assert.equal(actual.unallocatedKits, fixture.expected.unallocatedKits);
    assert.deepEqual(evaluateAllocation(fixture.input, actual), { feasible: true, feasibility: [], policy: { status: 'conforms', findings: [] }, strongerOptimality: 'not_claimed' });
  });
}

test('engine boundary returns structured failures instead of clamping invalid stock', () => {
  const result = optimizeAllocation({ periodId: 'p', stockKits: -1, regions: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.findings.some(f => f.code === 'INVALID_QUANTITY'));
});

test('runtime sparse arrays and negative zero receive structured validation failures', () => {
  for (const v of [input(-0), input(5, new Array(1)), input(5, [{ ...row(), demandKits: -0 }])]) {
    assert.equal(optimizeAllocation(v).ok, false);
  }
});

test('all public boundaries reject malformed quantities without coercion', () => {
  for (const bad of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, undefined, null, '5', 5n]) {
    for (const key of ['stockKits', 'demandKits', 'capacityKits', 'priorDispatchedKits']) {
      const v = input();
      const broken = key === 'stockKits' ? { ...v, [key]: bad } : { ...v, regions: [{ ...v.regions[0], [key]: bad }] };
      const outcome = optimizeAllocation(broken);
      assert.equal(outcome.ok, false, `${key}=${String(bad)}`);
      assert.deepEqual(allocateReference(broken), outcome);
      assert.equal(evaluateAllocation(broken, {}).feasible, false);
      assert.throws(() => allocateFairness(broken as PeriodInput), AllocationInputError);
    }
  }
});

test('missing IDs, duplicate regions, shared centers, period membership and enum errors are actionable', () => {
  const cases: [unknown, string][] = [
    [null, 'INVALID_INPUT'], [{ ...input(), regions: null }, 'REQUIRED_REGIONS'],
    [input(5, [row(), row()]), 'DUPLICATE_REGION'],
    [input(5, [row(), { ...row('B'), centerId: 'c-A' }]), 'SHARED_CENTER_UNSUPPORTED'],
    [input(5, [{ ...row(), periodId: 'other' }]), 'PERIOD_MISMATCH'],
    [input(5, [{ ...row(), regionId: '' }]), 'REQUIRED_ID'],
    [input(5, [{ ...row(), status: 'unknown' } as never]), 'INVALID_STATUS'],
    [input(5, [{ ...row(), provenance: 'unknown' } as never]), 'INVALID_PROVENANCE'],
    [input(5, [row('A', 5, 5, 0, 'closed')]), 'CLOSED_WITH_CAPACITY'],
    [input(5, Array.from({ length: 101 }, (_, i) => row(String(i)))), 'REGION_LIMIT'],
  ];
  for (const [v, code] of cases) {
    const r = optimizeAllocation(v); assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.findings.some(f => f.code === code), JSON.stringify(r));
  }
});

test('historical commitments conflict explicitly; no clamping or invented stock', () => {
  for (const v of [input(1, [row('A', 5, 5, 2)]), input(5, [row('A', 1, 5, 2)]),
    input(5, [row('A', 5, 1, 2)]), input(5, [row('A', 5, 0, 2, 'closed')]),
    input(Number.MAX_SAFE_INTEGER, [row('A', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), row('B', 1, 1, 1)])]) {
    const snapshot = structuredClone(v), outcome = optimizeAllocation(v);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) { assert.equal(outcome.kind, 'input_conflict'); assert.ok(outcome.findings.every(f => f.quantities)); }
    assert.deepEqual(v, snapshot);
  }
});

test('ID ordering is UTF-16, next-coverage tie prefers smaller demand, and empty periods are valid', () => {
  assert.deepEqual(success(optimizeAllocation(input(1, [row('a'), row('ä'), row('Z')]))).allocations.filter(a => a.allocatedKits).map(a => a.regionId), ['Z']);
  assert.deepEqual(amounts(success(optimizeAllocation(input(1, [row('A', 10, 10), row('B', 2, 2)])))), [0, 1]);
  assert.equal(success(optimizeAllocation(input(10, []))).unallocatedKits, 10);
});

test('safe-integer boundary uses exact rational comparisons and JSON-safe output', () => {
  const m = Number.MAX_SAFE_INTEGER;
  const v = input(m, [row('A', m, m), row('B', m - 1, m - 1)]);
  const r = success(optimizeAllocation(v));
  assert.equal(r.totalAllocatedKits, m);
  // q/(2q+1) is strictly smaller than q/(2q), so A receives kit q+1.
  assert.deepEqual(amounts(r), [4503599627370496, 4503599627370495]);
  assert.equal(evaluateAllocation(v, r).policy.status, 'conforms');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
  // Neighbouring ratios near 1/2 differ by less than Number precision.
  const near = input(m - 1, [row('A', m, m, 4503599627370494), row('B', m - 2, m - 2, 4503599627370494)]);
  assert.deepEqual(success(optimizeAllocation(near)), success(allocateReference(near)));
  assert.equal(allocateReference(v).ok, false); // oracle work limit, not production limit
});

test('distinct ratios less than one floating point ULP apart still follow exact ordering', () => {
  const d = 3_000_000_000_000_000;
  const v = input(2 * d - 2, [row('A', d, d, d - 1), row('B', d - 1, d - 1, d - 2)]);
  const r = success(optimizeAllocation(v));
  // B's (d-2)/(d-1) < A's (d-1)/d, by exactly 1/(d*(d-1)).
  assert.deepEqual(amounts(r), [d - 1, d - 1]);
  assert.deepEqual(r, allocateReference(v));
  assert.equal(evaluateAllocation(v, r).policy.status, 'conforms');
});

test('large-denominator seeded states agree with the oracle near preserved commitments', () => {
  for (let seed = 1; seed <= 500; seed++) {
    let state = seed;
    const rand = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
    const regions = Array.from({ length: 5 }, (_, i) => {
      const d = 1_000_000_000_000_000 + rand(100);
      return row(`r${i}`, d, d - rand(10), d - 100 - rand(100));
    });
    const v = input(regions.reduce((s, r) => s + r.priorDispatchedKits, 0) + rand(101), regions);
    const message = `large seed=${seed} input=${JSON.stringify(v)}`;
    const r = success(optimizeAllocation(v));
    assert.deepEqual(r, allocateReference(v), message);
    assert.equal(evaluateAllocation(v, r).policy.status, 'conforms', message);
  }
});

test('independent evaluator rejects corrupt rows, summaries, facts and avoidable leftovers', () => {
  const v = input(3, [row('A'), row('B')]);
  const original = success(optimizeAllocation(v));
  const mutations: [(r: OptimizationResult) => void, string][] = [
    [r => { r.allocations.pop(); }, 'MISSING_REGION'],
    [r => { r.allocations.push(r.allocations[0]); }, 'DUPLICATE_REGION'],
    [r => { r.allocations[0].regionId = 'unknown'; }, 'UNKNOWN_REGION'],
    [r => { r.allocations[0].newlyAllocatedKits = -1; }, 'INVALID_QUANTITY'],
    [r => { r.allocations[0].allocatedKits = 0.2; }, 'INVALID_QUANTITY'],
    [r => { r.totalAllocatedKits++; }, 'TOTAL_MISMATCH'],
    [r => { r.totalStockKits++; }, 'STOCK_MISMATCH'],
    [r => { r.preservedCommitmentsKits++; }, 'SUMMARY_MISMATCH'],
    [r => { r.periodId = 'other'; }, 'PERIOD_MISMATCH'],
    [r => { r.engineVersion = 'other'; }, 'VERSION_MISMATCH'],
    [r => { r.allocations[0].coverage = 0.1; }, 'COVERAGE_MISMATCH'],
    [r => { r.allocations[0].exactCoverage!.numerator = '999'; }, 'EXACT_COVERAGE_MISMATCH'],
    [r => { r.allocations[0].unmetDemandKits++; }, 'REGION_ACCOUNTING'],
    [r => { r.allocations[0].boundByCapacity = true; }, 'CAPACITY_FACT_MISMATCH'],
    [r => { r.allocations[0].explanations[0].quantities.unallocatedKits = 2; }, 'EXPLANATION_MISMATCH'],
    [r => { r.allocations[0].allocatedKits = 9; }, 'LIMIT_EXCEEDED'],
    [r => { r.allocations[0].newlyAllocatedKits = 0; }, 'COMMITMENT_ACCOUNTING'],
    [r => { r.unallocatedKits = 1; }, 'AVOIDABLE_LEFTOVER'],
  ];
  for (const [change, code] of mutations) {
    const r = structuredClone(original); change(r);
    const check = evaluateAllocation(v, r);
    assert.equal(check.feasible, false, code);
    assert.ok(check.feasibility.some(f => f.code === code), `${code}: ${JSON.stringify(check)}`);
    assert.equal(check.policy.status, 'not_checked');
  }
  for (const broken of [null, {}, { allocations: [null] }]) assert.equal(evaluateAllocation(v, broken).feasible, false);
  const held = input(3, [row('A', 5, 5, 2)]);
  const lost = success(optimizeAllocation(held)); lost.allocations[0].allocatedKits = 0;
  assert.ok(evaluateAllocation(held, lost).feasibility.some(f => f.code === 'COMMITMENT_LOST'));
});

test('policy evaluator detects feasible but incorrectly tied or unfair allocations', () => {
  const v = input(1, [row('A', 10, 10), row('B', 2, 2)]);
  const wrong = { periodId: 'p', totalStockKits: 1, totalAllocatedKits: 1, unallocatedKits: 0,
    allocations: [{ regionId: 'A', allocatedKits: 1, newlyAllocatedKits: 1, coverage: 0.1 }, { regionId: 'B', allocatedKits: 0, newlyAllocatedKits: 0, coverage: 0 }] };
  const check = evaluateAllocation(v, wrong, { detailed: false });
  assert.equal(check.feasible, true);
  assert.equal(check.policy.status, 'violates');
  assert.equal(check.policy.findings[0].code, 'POLICY_FRONTIER_INVERSION');
  const tied = input(1, [row('A', 2, 2), row('B', 2, 2)]);
  wrong.allocations[0] = { ...wrong.allocations[0], allocatedKits: 0, newlyAllocatedKits: 0, coverage: 0 };
  wrong.allocations[1] = { ...wrong.allocations[1], allocatedKits: 1, newlyAllocatedKits: 1, coverage: 0.5 };
  assert.equal(evaluateAllocation(tied, wrong, { detailed: false }).policy.status, 'violates');
});

test('exhaustive two-region state space: oracle equality, feasibility and maximum useful throughput', t => {
  const states: RegionInputRow[] = [];
  for (let demand = 0; demand <= 3; demand++) for (let cap = 0; cap <= 3; cap++) {
    for (let prior = 0; prior <= Math.min(demand, cap); prior++) states.push(row('x', demand, cap, prior));
    if (cap === 0) states.push(row('x', demand, cap, 0, 'closed'));
  }
  let cases = 0, vectors = 0;
  for (const a of states) for (const b of states) {
    const regions = [{ ...a, regionId: 'A', centerId: 'a' }, { ...b, regionId: 'B', centerId: 'b' }];
    const prior = a.priorDispatchedKits + b.priorDispatchedKits;
    const ha = a.status === 'open' ? Math.min(a.demandKits, a.capacityKits) - a.priorDispatchedKits : 0;
    const hb = b.status === 'open' ? Math.min(b.demandKits, b.capacityKits) - b.priorDispatchedKits : 0;
    for (let stock = prior; stock <= prior + ha + hb + 2; stock++) {
      const v = input(stock, regions), r = success(optimizeAllocation(v));
      assert.deepEqual(r, success(allocateReference(v)), JSON.stringify(v));
      assert.equal(evaluateAllocation(v, r).policy.status, 'conforms', JSON.stringify(v));
      let maxTotal = prior;
      for (let x = 0; x <= ha; x++) for (let y = 0; y <= hb; y++) {
        if (prior + x + y <= stock) { vectors++; maxTotal = Math.max(maxTotal, prior + x + y); }
      }
      assert.equal(r.totalAllocatedKits, maxTotal); // objective = throughput only
      cases++;
    }
  }
  t.diagnostic(`${cases} exhaustive inputs; ${vectors} feasible vectors checked for maximum throughput only.`);
});

test('seeded properties: reproducibility, permutations, frozen input, accounting, oracle and JSON', t => {
  let count = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    let state = seed;
    const rand = (n: number) => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state % n; };
    const regions = Array.from({ length: rand(13) }, (_, i) => {
      const d = rand(101), c = rand(101), p = rand(Math.min(d, c) + 1);
      return row(`r${i}`, d, c, p, c === 0 && rand(2) === 0 ? 'closed' : 'open');
    });
    const prior = regions.reduce((s, r) => s + r.priorDispatchedKits, 0);
    const v = input(prior + rand(1001), regions), original = structuredClone(v);
    const message = `seed=${seed} input=${JSON.stringify(v)}`;
    Object.freeze(v); Object.freeze(v.regions); v.regions.forEach(Object.freeze);
    const r = success(optimizeAllocation(v));
    assert.deepEqual(r, optimizeAllocation(v), message);
    const permuted = [...v.regions];
    for (let i = permuted.length - 1; i > 0; i--) { const j = rand(i + 1); [permuted[i], permuted[j]] = [permuted[j], permuted[i]]; }
    assert.deepEqual(r, optimizeAllocation({ ...v, regions: permuted }), message);
    assert.deepEqual(r, allocateReference(v), message);
    assert.deepEqual(v, original, message);
    assert.equal(r.totalAllocatedKits + r.unallocatedKits, v.stockKits, message);
    assert.equal(r.preservedCommitmentsKits, prior, message);
    assert.ok(r.allocations.every(a => a.allocatedKits >= a.priorDispatchedKits), message);
    assert.equal(evaluateAllocation(v, r).policy.status, 'conforms', message);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r, message);
    count++;
  }
  t.diagnostic(`${count} seeds (LCG seed=1..2000), all properties checked per input.`);
});

test('Hamilton comparison reports equality and explicit coverage populations without hiding closures', () => {
  const fixture = JSON.parse(readFileSync(new URL('01-base.json', fixtureDir), 'utf8'));
  const r = compareAllocations(fixture.input); assert.ok(r.ok);
  if ('equalAllocations' in r) {
    assert.equal(r.equalAllocations, true);
    assert.equal(r.evaluation.baseline.feasible, true);
    assert.equal(r.evaluation.baseline.policy.status, 'not_checked');
  }
  const different = compareAllocations(input(1, [row('A', 2, 2), row('B', 4, 4), row('C', 5, 0, 0, 'closed')]));
  assert.ok(different.ok && 'metrics' in different);
  if ('metrics' in different) {
    assert.equal(different.equalAllocations, false);
    assert.deepEqual(different.differences.map(d => d.fairnessMinusBaselineKits), [1, -1, 0]);
    assert.equal(different.evaluation.baseline.feasible, true);
    assert.deepEqual(different.metrics.fairness.allPositiveDemand.regionIds, ['A', 'B', 'C']);
    assert.deepEqual(different.metrics.fairness.eligiblePositiveDemand.regionIds, ['A', 'B']);
    // B and closed C are both at zero; the first stable ID supplies the fraction.
    assert.deepEqual(different.metrics.fairness.allPositiveDemand.lowestCoverage, { numerator: '0', denominator: '4' });
  }
});

test('explanations preserve facts without asserting comparative causes; ineligible corruption fails', () => {
  const v = input(10, [row('A', 8, 3, 2), row('B', 5, 0, 0, 'closed'), row('C', 0, 5)]);
  const r = success(optimizeAllocation(v));
  assert.deepEqual(r.allocations[0].explanations.map(e => [e.code, e.kind]), [
    ['COMMITMENT_PRESERVED', 'observed_fact'], ['CAPACITY_LIMIT_REACHED', 'observed_fact']]);
  assert.deepEqual(r.allocations[1].explanations.map(e => e.code), ['CENTER_CLOSED']);
  assert.deepEqual(r.allocations[2].explanations.map(e => e.code), ['ZERO_DEMAND']);
  r.allocations[1].newlyAllocatedKits = 1;
  assert.ok(evaluateAllocation(v, r).feasibility.some(f => f.code === 'INELIGIBLE_ALLOCATION'));
});
