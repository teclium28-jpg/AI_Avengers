// Progressive max-min fairness allocation engine.
// Implements context.md "A. Proposed fairness plan: progressive max-min fairness"
// and FairShare Final Technical Plan PDF §02.
//
// All comparisons between coverage fractions use exact BigInt cross-products.
// Floating-point values are display-only and never participate in allocation decisions.

import type { PeriodInput, RegionAllocation, RegionInputRow } from "./types.ts";

export interface FairnessResult {
  periodId: string;
  totalStockKits: number;
  totalAllocatedKits: number;
  unallocatedKits: number;
  allocations: RegionAllocation[];
}

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

/** a == b */
function fracEq(a: Frac, b: Frac): boolean {
  return a.num * b.den === b.num * a.den;
}

interface RegionTracker {
  row: RegionInputRow;
  priorDispatched: bigint;
  newlyAllocated: bigint;
  demand: bigint;
  capacity: bigint;
  entitlement: bigint; // min(demand, capacity)
  boundByCapacity: boolean;
}

/**
 * Allocate stock across regions according to progressive max-min fairness.
 *
 * Invariants enforced:
 * - Prior dispatches are preserved as commitments, not re-allocated.
 * - An eligible region must be open (capacity > 0), have demand > 0, and current
 *   total allocation < min(demand, capacity).
 * - Closed regions (capacity = 0) stay visible, receive 0 new allocation, and
 *   cannot block distribution to other regions.
 * - In each step, the whole kit is awarded to the eligible, uncapped region with
 *   the strictly lowest current coverage ratio (allocated / demand).
 * - Equal coverage ties are broken by:
 *   1. Larger next coverage ratio (coverage after receiving 1 kit).
 *   2. Lowest region_id alphabetically.
 */
export function allocateFairness(input: PeriodInput): FairnessResult {
  const stockKits = BigInt(Math.max(0, input.stockKits));

  // 1. Initialize trackers and preserve commitments
  let totalCommitted = 0n;
  const trackers: RegionTracker[] = input.regions.map((row) => {
    const prior = BigInt(Math.max(0, row.priorDispatchedKits));
    const demand = BigInt(Math.max(0, row.demandKits));
    // If status is closed or capacity is 0, usable capacity is 0
    const capacity = row.status === "closed" ? 0n : BigInt(Math.max(0, row.capacityKits));
    const entitlement = demand < capacity ? demand : capacity;

    totalCommitted += prior;

    return {
      row,
      priorDispatched: prior,
      newlyAllocated: 0n,
      demand,
      capacity,
      entitlement,
      boundByCapacity: false,
    };
  });

  // Remaining stock available for NEW distribution
  let remainingStock = stockKits > totalCommitted ? stockKits - totalCommitted : 0n;

  // 2. Progressive 1-kit simulation step
  while (remainingStock > 0n) {
    // Find eligible regions
    const eligible: RegionTracker[] = [];
    for (const t of trackers) {
      const currentAlloc = t.priorDispatched + t.newlyAllocated;
      if (t.demand > 0n && currentAlloc < t.entitlement) {
        eligible.push(t);
      }
    }

    if (eligible.length === 0) {
      // All regions capped by demand or capacity, or all demand is 0
      break;
    }

    // Pick the region with lowest current coverage
    let best = eligible[0];
    let bestCov = frac(best.priorDispatched + best.newlyAllocated, best.demand);

    for (let i = 1; i < eligible.length; i++) {
      const cand = eligible[i];
      const candCov = frac(cand.priorDispatched + cand.newlyAllocated, cand.demand);

      if (fracLt(candCov, bestCov)) {
        best = cand;
        bestCov = candCov;
      } else if (fracEq(candCov, bestCov)) {
        // Tie-breaker 1: Larger next coverage ratio
        const bestNextCov = frac(best.priorDispatched + best.newlyAllocated + 1n, best.demand);
        const candNextCov = frac(cand.priorDispatched + cand.newlyAllocated + 1n, cand.demand);

        if (fracLt(bestNextCov, candNextCov)) {
          best = cand;
          bestCov = candCov;
        } else if (fracEq(bestNextCov, candNextCov)) {
          // Tie-breaker 2: Lowest stable region ID
          if (cand.row.regionId.localeCompare(best.row.regionId) < 0) {
            best = cand;
            bestCov = candCov;
          }
        }
      }
    }

    // Award 1 kit
    best.newlyAllocated += 1n;
    remainingStock -= 1n;
  }

  // 3. Mark boundByCapacity and compile final allocations
  let totalAllocated = 0n;
  const allocations: RegionAllocation[] = trackers.map((t) => {
    const totalAlloc = t.priorDispatched + t.newlyAllocated;
    totalAllocated += totalAlloc;

    // Region is bound by capacity if its allocation hit capacity and demand was higher
    const boundByCapacity = t.capacity > 0n && totalAlloc === t.capacity && t.demand > t.capacity;

    const coverage =
      t.demand === 0n ? null : Number(totalAlloc) / Number(t.demand);

    return {
      regionId: t.row.regionId,
      allocatedKits: Number(totalAlloc),
      newlyAllocatedKits: Number(t.newlyAllocated),
      coverage,
      boundByCapacity,
    };
  });

  return {
    periodId: input.periodId,
    totalStockKits: Number(stockKits),
    totalAllocatedKits: Number(totalAllocated),
    unallocatedKits: Number(remainingStock),
    allocations,
  };
}
