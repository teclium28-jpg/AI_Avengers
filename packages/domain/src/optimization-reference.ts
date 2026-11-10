import type { PeriodInput } from './types.ts';
import { compareIds, failure, headroom, REFERENCE_MAX_NEW_KITS, renderResult, validateOptimizationInput } from './optimization-contract.ts';
import type { EngineOutcome } from './optimization-contract.ts';

/** Deliberately simple O(new kits * regions) oracle. No production selection code. */
export function allocateReference(value: unknown): EngineOutcome {
  const invalid = validateOptimizationInput(value);
  if (invalid) return invalid;
  const input = value as PeriodInput;
  const totals = new Map(input.regions.map(r => [r.regionId, r.priorDispatchedKits]));
  let left = input.stockKits - input.regions.reduce((s, r) => s + r.priorDispatchedKits, 0);
  const useful = input.regions.reduce((s, r) => s + BigInt(headroom(r)), 0n);
  if (useful < BigInt(left)) left = Number(useful);
  if (left > REFERENCE_MAX_NEW_KITS) return failure('unsupported', [{ code: 'REFERENCE_WORK_LIMIT', path: 'stockKits', message: `Reference supports at most ${REFERENCE_MAX_NEW_KITS} new useful kits.` }]);
  while (left > 0) {
    let best: (typeof input.regions)[number] | undefined;
    for (const row of input.regions) {
      const total = totals.get(row.regionId)!;
      if (row.status !== 'open' || total >= Math.min(row.demandKits, row.capacityKits)) continue;
      if (!best) { best = row; continue; }
      const a = BigInt(total), b = BigInt(totals.get(best.regionId)!);
      const d = BigInt(row.demandKits), e = BigInt(best.demandKits);
      const current = a * e - b * d;
      const next = (a + 1n) * e - (b + 1n) * d;
      if (current < 0n || (current === 0n && (next > 0n || (next === 0n && compareIds(row.regionId, best.regionId) < 0)))) best = row;
    }
    if (!best) break;
    totals.set(best.regionId, totals.get(best.regionId)! + 1);
    left--;
  }
  return renderResult(input, totals);
}
