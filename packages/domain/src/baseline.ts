// Capacity-aware proportional allocation baseline (Hamilton largest-remainder).
// This is the COMPARISON BASELINE, not the fairness engine — see context.md's
// "B. Baseline" and PDF §02. Do not merge this with progressive max-min fairness.
//
// All proportional arithmetic uses exact BigInt fractions, never floats, so capping
// decisions and largest-remainder tie-breaks are exact rather than float-approximate.

import type { BaselineResult, PeriodInput, RegionAllocation, RegionInputRow } from "./types.ts";

interface Frac {
  num: bigint;
  den: bigint; // always > 0
}

function frac(num: bigint, den: bigint): Frac {
  if (den < 0n) return { num: -num, den: -den };
  return { num, den };
}

/** a < b */
function fracLt(a: Frac, b: Frac): boolean {
  return a.num * b.den < b.num * a.den;
}

/** a > b */
function fracGt(a: Frac, b: Frac): boolean {
  return a.num * b.den > b.num * a.den;
}

function fracFloor(a: Frac): bigint {
  // a.den > 0 by construction
  if (a.num >= 0n) return a.num / a.den;
  return -((-a.num + a.den - 1n) / a.den);
}

function fracSub(a: Frac, b: Frac): Frac {
  return frac(a.num * b.den - b.num * a.den, a.den * b.den);
}

interface ActiveRegion {
  row: RegionInputRow;
  headroomKits: bigint; // entitlement - priorDispatched, i.e. max *new* allocation
}

interface FinalizedRegion {
  regionId: string;
  newlyAllocatedKits: bigint;
  boundByCapacity: boolean;
}

/**
 * Cap-and-redistribute: proportional-to-demand shares among still-active regions,
 * capping any region whose share would exceed its headroom and redistributing the
 * excess among the rest, until a fixed point (no region gets capped in a pass).
 * Returns the finalized newly-allocated amount for every eligible region, plus
 * whichever pool remains undistributed because total headroom < stock available.
 */
function capAndRedistribute(
  active: ActiveRegion[],
  poolKits: bigint,
): { finalized: FinalizedRegion[]; activeShares: Map<string, Frac>; remainingPool: bigint } {
  const finalized: FinalizedRegion[] = [];
  let currentActive = active;
  let pool = poolKits;

  for (;;) {
    if (currentActive.length === 0) break;
    const totalDemand = currentActive.reduce((sum, r) => sum + BigInt(r.row.demandKits), 0n);
    if (totalDemand === 0n || pool <= 0n) break;

    const shares = new Map<string, Frac>();
    for (const r of currentActive) {
      shares.set(r.row.regionId, frac(pool * BigInt(r.row.demandKits), totalDemand));
    }

    // Find regions whose proportional share exceeds their headroom.
    const overCap = currentActive.filter((r) =>
      fracGt(shares.get(r.row.regionId)!, frac(r.headroomKits, 1n)),
    );

    if (overCap.length === 0) {
      // Fixed point: nobody is over their cap. Stop here; caller floors + distributes remainder.
      return { finalized, activeShares: shares, remainingPool: pool };
    }

    for (const r of overCap) {
      finalized.push({
        regionId: r.row.regionId,
        newlyAllocatedKits: r.headroomKits,
        boundByCapacity: true,
      });
      pool -= r.headroomKits;
    }
    currentActive = currentActive.filter((r) => !overCap.includes(r));
  }

  return { finalized, activeShares: new Map(), remainingPool: pool };
}

export function computeBaselineAllocation(input: PeriodInput): BaselineResult {
  const stockKits = BigInt(Math.max(0, input.stockKits));
  const totalPriorDispatched = input.regions.reduce(
    (sum, r) => sum + BigInt(r.priorDispatchedKits),
    0n,
  );
  const poolKits = stockKits - totalPriorDispatched > 0n ? stockKits - totalPriorDispatched : 0n;

  const eligible: ActiveRegion[] = [];
  const ineligibleAllocations: RegionAllocation[] = [];

  for (const row of input.regions) {
    const entitlement = BigInt(Math.min(row.demandKits, row.capacityKits));
    const headroom = entitlement - BigInt(row.priorDispatchedKits);
    const isEligible = row.status === "open" && row.capacityKits > 0 && row.demandKits > 0;

    if (!isEligible || headroom <= 0n) {
      const allocated = row.priorDispatchedKits;
      ineligibleAllocations.push({
        regionId: row.regionId,
        allocatedKits: allocated,
        newlyAllocatedKits: 0,
        coverage: row.demandKits === 0 ? null : allocated / row.demandKits,
        boundByCapacity: row.capacityKits === 0 || headroom <= 0n,
      });
      continue;
    }

    eligible.push({ row, headroomKits: headroom });
  }

  const { finalized, activeShares, remainingPool } = capAndRedistribute(eligible, poolKits);

  const finalizedMap = new Map(finalized.map((f) => [f.regionId, f]));
  const stillActive = eligible.filter((r) => !finalizedMap.has(r.row.regionId));

  // Floor each still-active region's share (Hamilton), track remainders for largest-remainder.
  const floored = new Map<string, bigint>();
  const remainders = new Map<string, Frac>();
  let flooredTotal = 0n;
  for (const r of stillActive) {
    const share = activeShares.get(r.row.regionId) ?? frac(0n, 1n);
    const f = fracFloor(share);
    floored.set(r.row.regionId, f);
    remainders.set(r.row.regionId, fracSub(share, frac(f, 1n)));
    flooredTotal += f;
  }

  let leftover = remainingPool - flooredTotal;
  if (leftover < 0n) leftover = 0n; // defensive; shouldn't happen given exact fractions

  // Distribute leftover whole kits by descending remainder, ties by lowest region ID,
  // never exceeding a region's remaining headroom.
  const order = [...stillActive].sort((a, b) => {
    const ra = remainders.get(a.row.regionId)!;
    const rb = remainders.get(b.row.regionId)!;
    if (fracGt(ra, rb)) return -1;
    if (fracLt(ra, rb)) return 1;
    return a.row.regionId < b.row.regionId ? -1 : a.row.regionId > b.row.regionId ? 1 : 0;
  });

  for (const r of order) {
    if (leftover <= 0n) break;
    const current = floored.get(r.row.regionId)!;
    if (current < r.headroomKits) {
      floored.set(r.row.regionId, current + 1n);
      leftover -= 1n;
    }
  }

  const unallocatedKits = remainingPool - stillActive.reduce(
    (sum, r) => sum + floored.get(r.row.regionId)!,
    0n,
  );

  const allocations: RegionAllocation[] = [...ineligibleAllocations];
  for (const r of eligible) {
    const newlyAllocatedKits =
      finalizedMap.get(r.row.regionId)?.newlyAllocatedKits ?? floored.get(r.row.regionId) ?? 0n;
    const allocatedKits = BigInt(r.row.priorDispatchedKits) + newlyAllocatedKits;
    allocations.push({
      regionId: r.row.regionId,
      allocatedKits: Number(allocatedKits),
      newlyAllocatedKits: Number(newlyAllocatedKits),
      coverage: r.row.demandKits === 0 ? null : Number(allocatedKits) / r.row.demandKits,
      boundByCapacity: finalizedMap.has(r.row.regionId),
    });
  }

  // Stable order matching input region order, not internal processing order.
  const orderIndex = new Map(input.regions.map((r, i) => [r.regionId, i]));
  allocations.sort((a, b) => (orderIndex.get(a.regionId) ?? 0) - (orderIndex.get(b.regionId) ?? 0));

  const totalAllocatedKits = allocations.reduce((sum, a) => sum + a.allocatedKits, 0);

  return {
    periodId: input.periodId,
    totalStockKits: input.stockKits,
    totalAllocatedKits,
    unallocatedKits: Number(unallocatedKits),
    allocations,
  };
}

/**
 * Independent validity evaluator: re-checks a baseline (or any engine's) result
 * against the SRS invariants WITHOUT re-running the allocation logic, per the
 * plan's requirement for "an independent validity evaluator".
 */
export function isValidAllocation(
  input: PeriodInput,
  result: BaselineResult,
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const byId = new Map(input.regions.map((r) => [r.regionId, r]));

  if (result.totalAllocatedKits > input.stockKits) {
    violations.push(
      `total allocated (${result.totalAllocatedKits}) exceeds stock (${input.stockKits})`,
    );
  }

  for (const a of result.allocations) {
    const row = byId.get(a.regionId);
    if (!row) {
      violations.push(`allocation references unknown region ${a.regionId}`);
      continue;
    }
    if (!Number.isInteger(a.allocatedKits) || a.allocatedKits < 0) {
      violations.push(`region ${a.regionId}: allocatedKits must be a non-negative integer`);
    }
    // Inclusive totals: a region may hold up to max(min(demand, capacity), prior).
    // Prior dispatch is already committed, so it can exceed a later-lowered
    // demand/capacity (e.g. closure after dispatch) without being a violation.
    const ceiling = Math.max(Math.min(row.demandKits, row.capacityKits), row.priorDispatchedKits);
    if (a.allocatedKits > ceiling) {
      violations.push(
        `region ${a.regionId}: allocated (${a.allocatedKits}) exceeds allowed ceiling (${ceiling}) from demand (${row.demandKits}), capacity (${row.capacityKits}) and prior dispatch (${row.priorDispatchedKits})`,
      );
    }
    const headroom =
      row.status === "open"
        ? Math.max(0, Math.min(row.demandKits, row.capacityKits) - row.priorDispatchedKits)
        : 0;
    if (a.newlyAllocatedKits > headroom) {
      violations.push(
        `region ${a.regionId}: new allocation (${a.newlyAllocatedKits}) exceeds headroom (${headroom})`,
      );
    }
    if (a.allocatedKits !== row.priorDispatchedKits + a.newlyAllocatedKits) {
      violations.push(
        `region ${a.regionId}: allocated must equal prior dispatch plus new allocation`,
      );
    }
    if (a.allocatedKits < row.priorDispatchedKits) {
      violations.push(
        `region ${a.regionId}: allocated (${a.allocatedKits}) is below already-dispatched commitment (${row.priorDispatchedKits})`,
      );
    }
    if (row.status === "closed" && a.newlyAllocatedKits > 0) {
      violations.push(`region ${a.regionId}: closed region received new allocation`);
    }
    if (row.demandKits === 0 && a.coverage !== null) {
      violations.push(`region ${a.regionId}: zero demand must report coverage as N/A (null)`);
    }
  }

  return { valid: violations.length === 0, violations };
}
