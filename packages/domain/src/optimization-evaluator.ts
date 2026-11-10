import type { PeriodInput, RegionInputRow } from './types.ts';
import { ENGINE_VERSION, POLICY_VERSION, isQuantity, validateOptimizationInput } from './optimization-contract.ts';
import type { Finding } from './optimization-contract.ts';

export interface Evaluation {
  feasible: boolean;
  feasibility: Finding[];
  policy: { status: 'conforms' | 'violates' | 'not_checked'; findings: Finding[] };
  strongerOptimality: 'not_claimed';
}
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Does not import or call any allocator or result renderer. Accepts untrusted results. */
export function evaluateAllocation(value: unknown, result: unknown,
  options: { checkPolicy?: boolean; detailed?: boolean } = {}): Evaluation {
  const feasibility: Finding[] = [], policy: Finding[] = [];
  const add = (code: string, path: string, message: string) => feasibility.push({ code, path, message });
  const finish = (checked = false): Evaluation => ({ feasible: feasibility.length === 0, feasibility,
    policy: { status: checked ? (policy.length ? 'violates' : 'conforms') : 'not_checked', findings: policy }, strongerOptimality: 'not_claimed' });
  const invalid = validateOptimizationInput(value);
  if (invalid) { feasibility.push(...invalid.findings); return finish(); }
  const input = value as PeriodInput;
  const detailed = options.detailed !== false;
  if (!object(result) || !Array.isArray(result.allocations)) {
    add('INVALID_RESULT', '', 'Expected an object with allocation rows.'); return finish();
  }
  if (result.periodId !== input.periodId) add('PERIOD_MISMATCH', 'periodId', 'Result period differs from input.');
  if (result.totalStockKits !== input.stockKits) add('STOCK_MISMATCH', 'totalStockKits', 'Must equal confirmed input stock.');
  for (const key of ['totalAllocatedKits', 'unallocatedKits', ...(detailed ? ['preservedCommitmentsKits', 'newlyAllocatedKits'] : [])]) {
    if (!isQuantity(result[key])) add('INVALID_QUANTITY', key, 'Expected a whole non-negative safe integer.');
  }
  if (detailed && (result.ok !== true || result.policyVersion !== POLICY_VERSION || result.engineVersion !== ENGINE_VERSION)) add('VERSION_MISMATCH', '', 'Expected the supported success, policy and engine versions.');
  const inputs = new Map(input.regions.map(r => [r.regionId, r]));
  const seen = new Set<string>();
  const checked: { row: RegionInputRow; allocated: number; newly: number }[] = [];
  let total = 0n, newlyTotal = 0n;
  for (let i = 0; i < result.allocations.length; i++) {
    const a: unknown = result.allocations[i], path = `allocations[${i}]`;
    if (!object(a) || typeof a.regionId !== 'string') { add('INVALID_REGION', path, 'Allocation needs a region ID.'); continue; }
    if (seen.has(a.regionId)) add('DUPLICATE_REGION', path, 'Exactly one result per region is required.');
    seen.add(a.regionId);
    const row = inputs.get(a.regionId);
    if (!row) { add('UNKNOWN_REGION', path, `Unknown region ${a.regionId}.`); continue; }
    if (!isQuantity(a.allocatedKits) || !isQuantity(a.newlyAllocatedKits)) {
      add('INVALID_QUANTITY', path, 'Total and new allocation must be whole non-negative safe integers.'); continue;
    }
    const allocated = a.allocatedKits, newly = a.newlyAllocatedKits;
    total += BigInt(allocated); newlyTotal += BigInt(newly);
    checked.push({ row, allocated, newly });
    if (BigInt(allocated) !== BigInt(row.priorDispatchedKits) + BigInt(newly)) add('COMMITMENT_ACCOUNTING', path, 'Total must equal prior dispatch plus new allocation.');
    if (allocated < row.priorDispatchedKits) add('COMMITMENT_LOST', path, 'Prior dispatch must be preserved.');
    if (allocated > row.demandKits || allocated > row.capacityKits) add('LIMIT_EXCEEDED', path, 'Total exceeds demand or inclusive capacity.');
    if ((row.status === 'closed' || row.demandKits === 0) && newly !== 0) add('INELIGIBLE_ALLOCATION', path, 'Ineligible region received new kits.');
    const coverage = row.demandKits === 0 ? null : allocated / row.demandKits;
    if (a.coverage !== coverage) add('COVERAGE_MISMATCH', path, 'Display coverage must equal total/demand, or null for zero demand.');
    if (detailed) {
      const headroom = row.status === 'open' ? Math.min(row.demandKits, row.capacityKits) - row.priorDispatchedKits : 0;
      const expected = { priorDispatchedKits: row.priorDispatchedKits, demandKits: row.demandKits,
        capacityKits: row.capacityKits, unmetDemandKits: row.demandKits - allocated, eligibleHeadroomKits: headroom };
      for (const [key, v] of Object.entries(expected)) if (a[key] !== v) add('REGION_ACCOUNTING', `${path}.${key}`, `Expected ${v}.`);
      const exact = a.exactCoverage;
      if (row.demandKits === 0 ? exact !== null : !object(exact) || exact.numerator !== String(allocated) || exact.denominator !== String(row.demandKits)) add('EXACT_COVERAGE_MISMATCH', path, 'Exact fraction must match allocation/demand as decimal strings.');
      const bound = row.status === 'open' && row.capacityKits < row.demandKits && allocated === row.capacityKits;
      if (a.boundByCapacity !== bound) add('CAPACITY_FACT_MISMATCH', path, 'Capacity fact differs from observed quantities.');
      const expectedFacts = new Map<string, { kind: string; quantities: Record<string, number> }>();
      if (row.demandKits === 0) expectedFacts.set('ZERO_DEMAND', { kind: 'observed_fact', quantities: { demandKits: 0 } });
      if (row.status === 'closed') expectedFacts.set('CENTER_CLOSED', { kind: 'observed_fact', quantities: { capacityKits: row.capacityKits } });
      if (row.priorDispatchedKits > 0) expectedFacts.set('COMMITMENT_PRESERVED', { kind: 'observed_fact', quantities: { priorDispatchedKits: row.priorDispatchedKits } });
      if (bound) expectedFacts.set('CAPACITY_LIMIT_REACHED', { kind: 'observed_fact', quantities: { capacityKits: row.capacityKits, demandKits: row.demandKits, allocatedKits: allocated } });
      if (row.demandKits > 0 && allocated === row.demandKits) expectedFacts.set('DEMAND_SATISFIED', { kind: 'observed_fact', quantities: { demandKits: row.demandKits, allocatedKits: allocated } });
      if (result.unallocatedKits === 0 && newly < headroom) expectedFacts.set('STOCK_EXHAUSTED', { kind: 'allocation_stop', quantities: { unallocatedKits: 0, remainingHeadroomKits: headroom - newly } });
      const explanations = a.explanations;
      if (!Array.isArray(explanations) || explanations.length !== expectedFacts.size) add('EXPLANATION_MISMATCH', path, 'Missing or extra explanation facts.');
      else for (const e of explanations) {
        const expectedFact = object(e) && typeof e.code === 'string' ? expectedFacts.get(e.code) : undefined;
        if (!expectedFact || !object(e) || e.kind !== expectedFact.kind || !object(e.quantities)
          || Object.keys(e.quantities).length !== Object.keys(expectedFact.quantities).length
          || Object.entries(expectedFact.quantities).some(([k, v]) => (e.quantities as Record<string, unknown>)[k] !== v)) add('EXPLANATION_MISMATCH', path, 'Explanation code/kind/quantities are inconsistent.');
        if (object(e) && typeof e.code === 'string') expectedFacts.delete(e.code);
      }
    }
  }
  for (const row of input.regions) if (!seen.has(row.regionId)) add('MISSING_REGION', `allocations.${row.regionId}`, 'Input region missing from output.');
  const commitments = input.regions.reduce((s, r) => s + BigInt(r.priorDispatchedKits), 0n);
  if (total !== BigInt(input.stockKits) - (isQuantity(result.unallocatedKits) ? BigInt(result.unallocatedKits) : -1n)) add('STOCK_ACCOUNTING', '', 'Allocated + unallocated must equal confirmed stock.');
  if (!isQuantity(result.totalAllocatedKits) || total !== BigInt(result.totalAllocatedKits)) add('TOTAL_MISMATCH', 'totalAllocatedKits', 'Must equal sum of region totals.');
  if (detailed && (!isQuantity(result.preservedCommitmentsKits) || BigInt(result.preservedCommitmentsKits) !== commitments
    || !isQuantity(result.newlyAllocatedKits) || BigInt(result.newlyAllocatedKits) !== newlyTotal)) add('SUMMARY_MISMATCH', '', 'Commitment/new summary differs from row sums.');
  if (isQuantity(result.unallocatedKits) && result.unallocatedKits > 0 && checked.some(({ row, allocated }) => row.status === 'open' && allocated < Math.min(row.demandKits, row.capacityKits))) add('AVOIDABLE_LEFTOVER', 'unallocatedKits', 'Useful eligible headroom remains while stock is unused.');
  if (feasibility.length || options.checkPolicy === false) return finish();

  // Each region's awards form an increasing stream, k/d for prior <= k < limit.
  // A correct prefix contains no selected event later than an unselected event.
  // Checking only last selected and next unselected per stream suffices.
  const before = (a: typeof checked[number], ka: number, b: typeof checked[number], kb: number): boolean => {
    const d = BigInt(a.row.demandKits), e = BigInt(b.row.demandKits);
    const x = BigInt(ka), y = BigInt(kb);
    const current = x * e - y * d;
    if (current !== 0n) return current < 0n;
    const next = (x + 1n) * e - (y + 1n) * d;
    return next !== 0n ? next > 0n : a.row.regionId < b.row.regionId;
  };
  for (const selected of checked.filter(a => a.newly > 0)) {
    for (const unselected of checked.filter(a => a.row.status === 'open' && a.allocated < Math.min(a.row.demandKits, a.row.capacityKits))) {
      if (before(unselected, unselected.allocated, selected, selected.allocated - 1)) policy.push({ code: 'POLICY_FRONTIER_INVERSION', path: `allocations.${selected.row.regionId}`, message: `Last new kit was awarded after ${unselected.row.regionId}'s next eligible kit in the specified ordering.` });
    }
  }
  return finish(true);
}
