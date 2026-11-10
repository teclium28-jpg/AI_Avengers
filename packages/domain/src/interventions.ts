import type { PeriodInput } from './types.ts';
import { optimizeAllocation } from './optimization.ts';
import { compareIds } from './optimization-contract.ts';
import type { ExactCoverage, OptimizationResult } from './optimization-contract.ts';

export interface InterventionDomain {
  stockIncrements: number[];
  capacityIncrements: { centerId: string; kits: number }[];
  includeCombined: boolean;
  maxCandidates?: number;
  target?: { usefulKits?: number; minimumCoverage?: ExactCoverage };
}
const ratioCompare = (a: ExactCoverage, b: ExactCoverage) => {
  const n = BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator);
  return n < 0n ? -1 : n > 0n ? 1 : 0;
};
function minimum(result: OptimizationResult): ExactCoverage | null {
  return result.allocations.reduce<ExactCoverage | null>((best, a) => a.exactCoverage && (!best || ratioCompare(a.exactCoverage, best) < 0) ? a.exactCoverage : best, null);
}
const quantity = (v: number) => Number.isSafeInteger(v) && v >= 0;

/** A declared finite search; outputs are hypothetical and never operational inputs. */
export function interventionFrontier(input: PeriodInput, domain: InterventionDomain) {
  const base = optimizeAllocation(input);
  if (!base.ok) return base;
  if (!domain || !Array.isArray(domain.stockIncrements) || !Array.isArray(domain.capacityIncrements)
      || domain.stockIncrements.length > 32 || domain.capacityIncrements.length > 128
      || typeof domain.includeCombined !== 'boolean') throw new Error('Invalid intervention domain');
  const limit = domain.maxCandidates ?? 256;
  if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new Error('Candidate limit must be 1..256');
  const centers = new Set(input.regions.map(r => r.centerId));
  const stocks = [...new Set([0, ...domain.stockIncrements])].sort((a, b) => a - b);
  if (!stocks.every(quantity) || stocks.some(v => !quantity(input.stockKits + v))) throw new Error('Invalid stock increment');
  const caps = [...new Map(domain.capacityIncrements.map(c => [`${c.centerId}\u0000${c.kits}`, { ...c }])).values()]
    .sort((a, b) => compareIds(a.centerId, b.centerId) || a.kits - b.kits);
  for (const c of caps) {
    const row = input.regions.find(r => r.centerId === c.centerId);
    if (!centers.has(c.centerId) || !quantity(c.kits) || !row || !quantity(row.capacityKits + c.kits)) throw new Error('Invalid capacity increment');
  }
  const target = domain.target;
  if (target?.usefulKits !== undefined && !quantity(target.usefulKits)) throw new Error('Invalid throughput target');
  const f = target?.minimumCoverage;
  if (f && (!/^\d{1,16}$/.test(f.numerator) || !/^[1-9]\d{0,15}$/.test(f.denominator) || BigInt(f.numerator) > BigInt(f.denominator))) throw new Error('Invalid coverage target');
  const candidates = [{ stock: 0, cap: null as typeof caps[number] | null }];
  for (const stock of stocks.filter(n => n > 0)) candidates.push({ stock, cap: null });
  for (const cap of caps.filter(c => c.kits > 0)) candidates.push({ stock: 0, cap });
  if (domain.includeCombined) for (const stock of stocks.filter(n => n > 0)) for (const cap of caps.filter(c => c.kits > 0)) candidates.push({ stock, cap });
  const baseById = new Map(base.allocations.map(a => [a.regionId, a]));
  const results = candidates.slice(0, limit).map((candidate, index) => {
    const changed: PeriodInput = { ...input, stockKits: input.stockKits + candidate.stock, regions: input.regions.map(r =>
      r.centerId === candidate.cap?.centerId ? { ...r, capacityKits: r.capacityKits + candidate.cap.kits, status: 'open' } : { ...r }) };
    const result = optimizeAllocation(changed);
    if (!result.ok) throw new Error('Constructed intervention unexpectedly invalid');
    const lowestCoverage = minimum(result);
    return { id: `candidate-${index}`, hypothetical: true as const, addedStockKits: candidate.stock,
      restoredCapacity: candidate.cap, changedInput: changed, result, lowestCoverage,
      usefulAllocationDelta: result.totalAllocatedKits - base.totalAllocatedKits,
      unmetDemandDelta: base.totalAllocatedKits - result.totalAllocatedKits,
      regions: result.allocations.map(a => ({ regionId: a.regionId,
        allocationDelta: a.allocatedKits - baseById.get(a.regionId)!.allocatedKits,
        unmetDemandDelta: a.unmetDemandKits - baseById.get(a.regionId)!.unmetDemandKits,
        coverageBefore: baseById.get(a.regionId)!.exactCoverage, coverageAfter: a.exactCoverage })),
      meetsTarget: !!target && (target.usefulKits === undefined || result.totalAllocatedKits >= target.usefulKits)
        && (!f || (!!lowestCoverage && ratioCompare(lowestCoverage, f) >= 0)) };
  });
  const dominates = (a: typeof results[number], b: typeof results[number]) => {
    const ca = a.restoredCapacity?.kits ?? 0, cb = b.restoredCapacity?.kits ?? 0;
    const coverage = a.lowestCoverage && b.lowestCoverage ? ratioCompare(a.lowestCoverage, b.lowestCoverage) : 0;
    return a.addedStockKits <= b.addedStockKits && ca <= cb && a.result.totalAllocatedKits >= b.result.totalAllocatedKits && coverage >= 0
      && (a.addedStockKits < b.addedStockKits || ca < cb || a.result.totalAllocatedKits > b.result.totalAllocatedKits || coverage > 0);
  };
  const meets = results.filter(c => c.meetsTarget);
  return { ok: true as const, hypothetical: true as const, base, baseMinimumCoverage: minimum(base),
    objectives: ['maximize useful allocation kits', 'maximize minimum coverage over ALL positive-demand regions', 'minimize added food kits', 'minimize restored capacity kits'],
    declaredCandidateCount: candidates.length, evaluatedCandidateCount: results.length, complete: results.length === candidates.length,
    results, frontierIds: results.filter(c => !results.some(other => dominates(other, c))).map(c => c.id),
    smallestTestedTargetIds: meets.filter(c => !meets.some(o => o.addedStockKits <= c.addedStockKits && (o.restoredCapacity?.kits ?? 0) <= (c.restoredCapacity?.kits ?? 0)
      && (o.addedStockKits < c.addedStockKits || (o.restoredCapacity?.kits ?? 0) < (c.restoredCapacity?.kits ?? 0)))).map(c => c.id) };
}
