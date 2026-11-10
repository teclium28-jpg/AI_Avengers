import type { PeriodInput, RegionAllocation, RegionInputRow } from './types.ts';

export const POLICY_VERSION = 'fairshare-discrete-progressive/1';
export const ENGINE_VERSION = '1.0.0';
export const MAX_REGIONS = 100;
export const REFERENCE_MAX_NEW_KITS = 100_000;
export interface Finding {
  code: string;
  path: string;
  message: string;
  quantities?: Record<string, number | string>;
}
export interface EngineFailure {
  ok: false;
  policyVersion: string;
  engineVersion: string;
  kind: 'validation' | 'input_conflict' | 'unsupported';
  findings: Finding[];
}
export type ExplanationCode = 'ZERO_DEMAND' | 'CENTER_CLOSED' | 'CAPACITY_LIMIT_REACHED'
  | 'DEMAND_SATISFIED' | 'STOCK_EXHAUSTED' | 'COMMITMENT_PRESERVED';
export interface Explanation {
  code: ExplanationCode;
  kind: 'observed_fact' | 'allocation_stop';
  quantities: Record<string, number>;
}
export interface ExactCoverage { numerator: string; denominator: string }
export interface OptimizationRegion extends RegionAllocation {
  priorDispatchedKits: number;
  demandKits: number;
  capacityKits: number;
  unmetDemandKits: number;
  eligibleHeadroomKits: number;
  exactCoverage: ExactCoverage | null;
  explanations: Explanation[];
}
export interface OptimizationResult {
  ok: true;
  policyVersion: string;
  engineVersion: string;
  periodId: string;
  totalStockKits: number;
  preservedCommitmentsKits: number;
  totalAllocatedKits: number;
  newlyAllocatedKits: number;
  unallocatedKits: number;
  allocations: OptimizationRegion[];
}
export type EngineOutcome = OptimizationResult | EngineFailure;
export const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function failure(kind: EngineFailure['kind'], findings: Finding[]): EngineFailure {
  return { ok: false, policyVersion: POLICY_VERSION, engineVersion: ENGINE_VERSION, kind, findings };
}
export const isQuantity = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Validate untrusted JSON before arithmetic; never repair or mutate it. */
export function validateOptimizationInput(value: unknown): EngineFailure | null {
  const issues: Finding[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (!isObject(value)) return failure('validation', [{ code: 'INVALID_INPUT', path: '', message: 'Expected a period object.' }]);
  if (!isText(value.periodId)) add('REQUIRED_ID', 'periodId', 'A nonempty period ID is required.');
  if (!isQuantity(value.stockKits)) add('INVALID_QUANTITY', 'stockKits', 'Confirmed inclusive stock must be a non-negative safe integer.');
  if (!Array.isArray(value.regions)) add('REQUIRED_REGIONS', 'regions', 'Expected an array.');
  if (issues.length) return failure('validation', issues);
  const rows = value.regions as unknown[];
  if (rows.length > MAX_REGIONS) return failure('unsupported', [{ code: 'REGION_LIMIT', path: 'regions', message: `At most ${MAX_REGIONS} regions are supported.` }]);
  const ids = new Set<string>(), centers = new Set<string>();
  Array.from(rows).forEach((row, i) => {
    const path = `regions[${i}]`;
    if (!isObject(row)) { add('INVALID_REGION', path, 'Expected a region object.'); return; }
    for (const key of ['periodId', 'regionId', 'regionName', 'centerId']) {
      if (!isText(row[key])) add('REQUIRED_ID', `${path}.${key}`, 'Nonempty text is required.');
    }
    if (row.periodId !== value.periodId) add('PERIOD_MISMATCH', `${path}.periodId`, 'Region must belong to the input period.');
    if (isText(row.regionId)) {
      if (ids.has(row.regionId)) add('DUPLICATE_REGION', `${path}.regionId`, 'Region IDs must be unique.');
      ids.add(row.regionId);
    }
    if (isText(row.centerId)) {
      if (centers.has(row.centerId)) add('SHARED_CENTER_UNSUPPORTED', `${path}.centerId`, 'This DTO cannot divide a shared center budget; use distinct centers.');
      centers.add(row.centerId);
    }
    for (const key of ['demandKits', 'capacityKits', 'priorDispatchedKits']) {
      if (!isQuantity(row[key])) add('INVALID_QUANTITY', `${path}.${key}`, 'Expected a non-negative safe integer.');
    }
    if (row.status !== 'open' && row.status !== 'closed') add('INVALID_STATUS', `${path}.status`, 'Expected open or closed.');
    if (row.provenance !== 'reported' && row.provenance !== 'simulated') add('INVALID_PROVENANCE', `${path}.provenance`, 'Expected reported or simulated.');
    if (row.status === 'closed' && isQuantity(row.capacityKits) && row.capacityKits !== 0) add('CLOSED_WITH_CAPACITY', `${path}.capacityKits`, 'Closed capacity must be zero.');
  });
  if (issues.length) return failure('validation', issues);
  const input = value as unknown as PeriodInput;
  const conflicts: Finding[] = [];
  let committed = 0n;
  for (const row of input.regions) {
    committed += BigInt(row.priorDispatchedKits);
    if (row.priorDispatchedKits > row.demandKits || row.priorDispatchedKits > row.capacityKits) {
      conflicts.push({ code: 'COMMITMENT_EXCEEDS_LIMIT', path: `regions.${row.regionId}`, message: 'Prior dispatch conflicts with current demand/capacity; reconcile inputs without erasing dispatch.', quantities: { priorDispatchedKits: row.priorDispatchedKits, demandKits: row.demandKits, capacityKits: row.capacityKits } });
    }
  }
  if (committed > BigInt(input.stockKits)) conflicts.push({ code: 'COMMITMENTS_EXCEED_STOCK', path: 'stockKits', message: 'Confirmed period total is smaller than immutable dispatch commitments.', quantities: { stockKits: input.stockKits, preservedCommitmentsKits: committed.toString() } });
  return conflicts.length ? failure('input_conflict', conflicts) : null;
}

export function headroom(row: RegionInputRow): number {
  return row.status === 'open' ? Math.min(row.demandKits, row.capacityKits) - row.priorDispatchedKits : 0;
}

/** Shared rendering only; no allocation decisions. */
export function renderResult(input: PeriodInput, amounts: ReadonlyMap<string, number>): OptimizationResult {
  const rows = [...input.regions].sort((a, b) => compareIds(a.regionId, b.regionId));
  const totalAllocatedKits = rows.reduce((s, r) => s + amounts.get(r.regionId)!, 0);
  const unallocatedKits = input.stockKits - totalAllocatedKits;
  const preservedCommitmentsKits = rows.reduce((s, r) => s + r.priorDispatchedKits, 0);
  const allocations = rows.map((r): OptimizationRegion => {
    const allocatedKits = amounts.get(r.regionId)!;
    const newlyAllocatedKits = allocatedKits - r.priorDispatchedKits;
    const explanations: Explanation[] = [];
    const fact = (code: ExplanationCode, quantities: Record<string, number>) => explanations.push({ code, kind: 'observed_fact', quantities });
    if (r.demandKits === 0) fact('ZERO_DEMAND', { demandKits: 0 });
    if (r.status === 'closed') fact('CENTER_CLOSED', { capacityKits: r.capacityKits });
    if (r.priorDispatchedKits > 0) fact('COMMITMENT_PRESERVED', { priorDispatchedKits: r.priorDispatchedKits });
    const boundByCapacity = r.status === 'open' && r.capacityKits < r.demandKits && allocatedKits === r.capacityKits;
    if (boundByCapacity) fact('CAPACITY_LIMIT_REACHED', { capacityKits: r.capacityKits, demandKits: r.demandKits, allocatedKits });
    if (r.demandKits > 0 && allocatedKits === r.demandKits) fact('DEMAND_SATISFIED', { demandKits: r.demandKits, allocatedKits });
    if (unallocatedKits === 0 && newlyAllocatedKits < headroom(r)) explanations.push({ code: 'STOCK_EXHAUSTED', kind: 'allocation_stop', quantities: { unallocatedKits: 0, remainingHeadroomKits: headroom(r) - newlyAllocatedKits } });
    return { regionId: r.regionId, allocatedKits, newlyAllocatedKits, priorDispatchedKits: r.priorDispatchedKits,
      demandKits: r.demandKits, capacityKits: r.capacityKits, unmetDemandKits: r.demandKits - allocatedKits,
      eligibleHeadroomKits: headroom(r), coverage: r.demandKits === 0 ? null : allocatedKits / r.demandKits,
      exactCoverage: r.demandKits === 0 ? null : { numerator: String(allocatedKits), denominator: String(r.demandKits) }, boundByCapacity, explanations };
  });
  return { ok: true, policyVersion: POLICY_VERSION, engineVersion: ENGINE_VERSION, periodId: input.periodId,
    totalStockKits: input.stockKits, preservedCommitmentsKits, totalAllocatedKits,
    newlyAllocatedKits: totalAllocatedKits - preservedCommitmentsKits, unallocatedKits, allocations };
}
