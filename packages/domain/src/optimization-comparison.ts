import type { BaselineResult, PeriodInput } from './types.ts';
import { computeBaselineAllocation } from './baseline.ts';
import { compareIds, headroom } from './optimization-contract.ts';
import type { ExactCoverage } from './optimization-contract.ts';
import { optimizeAllocation } from './optimization.ts';
import { evaluateAllocation } from './optimization-evaluator.ts';

/** Same values go to each method. Hamilton implementation is unchanged. */
export function compareAllocations(value: unknown) {
  const fairness = optimizeAllocation(value);
  if (!fairness.ok) return fairness;
  const input = value as PeriodInput;
  const copy: PeriodInput = { ...input, regions: input.regions.map(r => ({ ...r })).sort((a, b) => compareIds(a.regionId, b.regionId)) };
  const baseline = computeBaselineAllocation(copy);
  const metrics = (result: BaselineResult) => {
    const amounts = new Map(result.allocations.map(a => [a.regionId, a.allocatedKits]));
    const positive = copy.regions.filter(r => r.demandKits > 0);
    const eligible = positive.filter(r => headroom(r) > 0);
    const minimum = (rows: typeof positive): ExactCoverage | null => {
      let best: ExactCoverage | null = null;
      for (const row of rows) {
        const n = BigInt(amounts.get(row.regionId)!), d = BigInt(row.demandKits);
        if (!best || n * BigInt(best.denominator) < BigInt(best.numerator) * d) best = { numerator: String(n), denominator: String(d) };
      }
      return best;
    };
    return { totalUsefulAllocationKits: result.totalAllocatedKits, unallocatedKits: result.unallocatedKits,
      allPositiveDemand: { regionIds: positive.map(r => r.regionId), lowestCoverage: minimum(positive) },
      eligiblePositiveDemand: { regionIds: eligible.map(r => r.regionId), lowestCoverage: minimum(eligible) },
      regions: copy.regions.map(r => ({ regionId: r.regionId, allocatedKits: amounts.get(r.regionId)!,
        unmetDemandKits: r.demandKits - amounts.get(r.regionId)!, coverage: r.demandKits === 0 ? null : amounts.get(r.regionId)! / r.demandKits,
        exactCoverage: r.demandKits === 0 ? null : { numerator: String(amounts.get(r.regionId)!), denominator: String(r.demandKits) } })) };
  };
  const baseById = new Map(baseline.allocations.map(a => [a.regionId, a]));
  const differences = fairness.allocations.map(a => ({ regionId: a.regionId,
    fairnessMinusBaselineKits: a.allocatedKits - baseById.get(a.regionId)!.allocatedKits }));
  return { ok: true as const, fairness, baseline, equalAllocations: differences.every(d => d.fairnessMinusBaselineKits === 0),
    differences, metrics: { fairness: metrics(fairness), baseline: metrics(baseline) },
    evaluation: { fairness: evaluateAllocation(input, fairness), baseline: evaluateAllocation(input, baseline, { detailed: false, checkPolicy: false }) } };
}
