import type { PeriodInput, RegionInputRow } from './types.ts';
import { compareIds, headroom, renderResult, validateOptimizationInput } from './optimization-contract.ts';
import type { EngineOutcome } from './optimization-contract.ts';

// Distinct k/d values with safe integer denominators differ by >2^-106.
// Each grid bucket therefore contains at most one distinct current coverage.
const SCALE = 1n << 108n;
interface Stream { row: RegionInputRow; prior: bigint; end: bigint; demand: bigint }
function prefix(s: Stream, threshold: bigint): bigint {
  if (threshold < 0n) return 0n;
  const last = threshold * s.demand / SCALE;
  const count = last - s.prior + 1n;
  return count < 0n ? 0n : count > s.end - s.prior ? s.end - s.prior : count;
}

/** Exact rank selection over the merge of increasing per-region kit streams. */
export function optimizeAllocation(value: unknown): EngineOutcome {
  const invalid = validateOptimizationInput(value);
  if (invalid) return invalid;
  const input = value as PeriodInput;
  const totals = new Map(input.regions.map(r => [r.regionId, r.priorDispatchedKits]));
  const committed = input.regions.reduce((s, r) => s + BigInt(r.priorDispatchedKits), 0n);
  const streams: Stream[] = input.regions.filter(r => headroom(r) > 0).map(row => ({ row,
    prior: BigInt(row.priorDispatchedKits), end: BigInt(Math.min(row.demandKits, row.capacityKits)), demand: BigInt(row.demandKits) }));
  const available = BigInt(input.stockKits) - committed;
  const useful = streams.reduce((s, r) => s + r.end - r.prior, 0n);
  const target = available < useful ? available : useful;
  if (target === useful) {
    for (const s of streams) totals.set(s.row.regionId, Number(s.end));
  } else if (target > 0n) {
    let low = 0n, high = SCALE;
    while (low < high) {
      const mid = (low + high) / 2n;
      const count = streams.reduce((sum, s) => sum + prefix(s, mid), 0n);
      if (count >= target) high = mid;
      else low = mid + 1n;
    }
    let taken = 0n;
    const boundary: { s: Stream; current: bigint }[] = [];
    for (const s of streams) {
      const count = prefix(s, low - 1n);
      taken += count;
      totals.set(s.row.regionId, Number(s.prior + count));
      if (prefix(s, low) > count) boundary.push({ s, current: s.prior + count });
    }
    boundary.sort((a, b) => {
      const current = a.current * b.s.demand - b.current * a.s.demand;
      if (current !== 0n) return current < 0n ? -1 : 1;
      const next = (a.current + 1n) * b.s.demand - (b.current + 1n) * a.s.demand;
      return next !== 0n ? (next > 0n ? -1 : 1) : compareIds(a.s.row.regionId, b.s.row.regionId);
    });
    const remaining = Number(target - taken); // <= number of boundary streams
    for (let i = 0; i < remaining; i++) {
      const { s, current } = boundary[i];
      totals.set(s.row.regionId, Number(current + 1n));
    }
  }
  return renderResult(input, totals);
}
