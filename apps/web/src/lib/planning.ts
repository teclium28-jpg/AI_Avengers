// Pure planning and reconciliation logic for the browser preview. No React, no DOM, no
// storage: everything here is unit tested in apps/web/test/planning.test.ts.
//
// Rules this module enforces (context.md, SRS):
// - The allocation engine must never crash the interface. Inputs the engine refuses are
//   reported as readable issues and the plan falls back to preserved commitments only.
// - Closure sets capacity to zero for NEW kits but never erases need or past dispatches.
// - Missing is not zero: an unreported receipt stays "not reported".
// - A mismatch is a review signal, never an accusation.
import {
  optimizeAllocation,
  computeBaselineAllocation,
  reconcile,
  csvCell,
  type PeriodInput,
  type LedgerEvent,
  type RegionAllocation,
} from "@fairshare/domain";
import type {
  CalculatedAllocationItem,
  CenterEntity,
  MovementRecord,
  MovementType,
  RegionEntity,
} from "../types";

export const PERIOD_ID = "2026-W46";

export interface PlanIssue {
  code: string;
  message: string;
}

export interface PlanResult {
  rows: CalculatedAllocationItem[];
  issues: PlanIssue[];
  totalAllocatedKits: number;
  totalDemandKits: number;
  totalUnmetKits: number;
  /** Mean and minimum coverage over regions whose coverage is defined; null when none. */
  averageCoveragePct: number | null;
  minCoveragePct: number | null;
}

const isWholeKits = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Kits already dispatched to each center: the imported baseline plus every dispatch in the ledger. */
export function committedByCenter(centers: CenterEntity[], movements: MovementRecord[]): Record<string, number> {
  const committed: Record<string, number> = {};
  for (const c of centers) committed[c.centerId] = isWholeKits(c.committedDispatches) ? c.committedDispatches : 0;
  for (const m of movements) {
    if (m.movementType === "dispatch" && m.centerId in committed) committed[m.centerId] += m.quantityKits;
  }
  return committed;
}

function centerIsOpen(center: CenterEntity | undefined): boolean {
  return !!center && center.operatingStatus !== "closed" && center.configuredCapacity > 0;
}

/** Translate the interface state into the engine contract. Closed centers keep past dispatches. */
export function toPeriodInput(
  stockKits: number,
  centers: CenterEntity[],
  regions: RegionEntity[],
  committed: Record<string, number>,
): PeriodInput {
  const byId = new Map(centers.map((c) => [c.centerId, c]));
  return {
    periodId: PERIOD_ID,
    stockKits,
    regions: regions.map((r) => {
      const center = byId.get(r.assignedCenterId);
      const prior = committed[r.assignedCenterId] ?? 0;
      const noNewKits = r.status === "ineligible" || !centerIsOpen(center);
      // A closed center or an ineligible region receives nothing new. Its capacity is set to what
      // was already dispatched, so commitments are preserved instead of being treated as a conflict.
      const capacityKits = noNewKits ? prior : center!.configuredCapacity;
      return {
        periodId: PERIOD_ID,
        regionId: r.regionId,
        regionName: r.regionName,
        centerId: r.assignedCenterId,
        demandKits: r.demandKits,
        capacityKits,
        priorDispatchedKits: prior,
        status: capacityKits > 0 ? ("open" as const) : ("closed" as const),
        provenance: "reported" as const,
      };
    }),
  };
}

function describeFinding(f: { code: string; path: string; message: string; quantities?: Record<string, unknown> }, regions: RegionEntity[]): PlanIssue {
  const regionId = f.path.startsWith("regions.") ? f.path.slice("regions.".length) : undefined;
  const indexMatch = /^regions\[(\d+)\]/.exec(f.path);
  const region = regionId ?? (indexMatch ? regions[Number(indexMatch[1])]?.regionId : undefined);
  const q = f.quantities ?? {};
  switch (f.code) {
    case "COMMITMENT_EXCEEDS_LIMIT":
      return { code: f.code, message: `Region ${region}: ${q.priorDispatchedKits} kits were already dispatched, which is more than its current demand (${q.demandKits}) or center capacity (${q.capacityKits}). Correct the demand, capacity or dispatch record; dispatched kits are never silently reassigned.` };
    case "COMMITMENTS_EXCEED_STOCK":
      return { code: f.code, message: `Stock (${q.stockKits} kits) is smaller than the ${q.preservedCommitmentsKits} kits already dispatched.` };
    case "SHARED_CENTER_UNSUPPORTED":
      return { code: f.code, message: `Region ${region ?? ""} shares a distribution center with another region. Each region needs its own center in this engine version.`.replace("  ", " ") };
    case "DUPLICATE_REGION":
      return { code: f.code, message: `Region ID ${region ?? ""} appears more than once.`.replace("  ", " ") };
    case "REGION_LIMIT":
      return { code: f.code, message: "More than 100 regions; split the period or region list." };
    case "INVALID_QUANTITY":
      return { code: f.code, message: `${region ? `Region ${region}: ` : ""}a quantity is not a whole, non-negative number of kits.` };
    default:
      return { code: f.code, message: f.message };
  }
}

function regionStatus(region: RegionEntity, center: CenterEntity | undefined, allocated: number, bound: boolean): CalculatedAllocationItem["status"] {
  if (region.status === "ineligible") return "ineligible";
  if (region.demandKits === 0) return "zero_demand";
  if (!centerIsOpen(center)) return "unserviceable";
  if (allocated >= region.demandKits) return "full";
  if (bound) return "capacity_capped";
  return "partial";
}

/** Compute one allocation (fair or proportional baseline) for the given state. Never throws. */
export function computePlan(
  stockKits: number,
  centers: CenterEntity[],
  regions: RegionEntity[],
  committed: Record<string, number>,
  algorithm: "srs-progressive-maxmin" | "hamilton-proportional",
): PlanResult {
  const input = toPeriodInput(stockKits, centers, regions, committed);
  const byCenter = new Map(centers.map((c) => [c.centerId, c]));
  let allocations: RegionAllocation[] | null = null;
  const issues: PlanIssue[] = [];
  if (!isWholeKits(stockKits)) issues.push({ code: "INVALID_STOCK", message: "Stock must be a whole, non-negative number of kits." });
  else {
    try {
      if (algorithm === "srs-progressive-maxmin") {
        const outcome = optimizeAllocation(input);
        if (outcome.ok) allocations = outcome.allocations;
        else issues.push(...outcome.findings.map((f) => describeFinding(f, regions)));
      } else {
        // The baseline does not validate on its own; refuse the same inputs the fair engine refuses.
        const check = optimizeAllocation(input);
        if (check.ok) allocations = computeBaselineAllocation(input).allocations;
        else issues.push(...check.findings.map((f) => describeFinding(f, regions)));
      }
    } catch (error) {
      issues.push({ code: "ENGINE_ERROR", message: error instanceof Error ? error.message : "The allocation could not be computed." });
    }
  }
  const found = new Map((allocations ?? []).map((a) => [a.regionId, a]));
  const rows: CalculatedAllocationItem[] = regions.map((region) => {
    const center = byCenter.get(region.assignedCenterId);
    const prior = committed[region.assignedCenterId] ?? 0;
    const a = found.get(region.regionId);
    // Without a valid plan, show only what is already committed.
    const allocated = a ? a.allocatedKits : prior;
    const bound = a ? a.boundByCapacity : false;
    return {
      regionId: region.regionId,
      regionName: region.regionName,
      assignedCenterId: region.assignedCenterId,
      centerName: center?.centerName ?? "Unassigned",
      demandKits: region.demandKits,
      centerCapacity: center?.configuredCapacity ?? 0,
      priorDispatchedKits: prior,
      newlyAllocatedKits: a ? a.newlyAllocatedKits : 0,
      allocatedKits: allocated,
      coverageFraction: { numerator: allocated, denominator: region.demandKits },
      coveragePercentage: region.demandKits > 0 ? (allocated / region.demandKits) * 100 : 0,
      isCappedByCapacity: bound,
      isCappedByDemand: region.demandKits > 0 && allocated >= region.demandKits,
      status: regionStatus(region, center, allocated, bound),
    };
  });
  return { rows, issues, ...summarize(rows) };
}

/** Coverage is defined only where demand is positive and the region is in the program. */
export function hasDefinedCoverage(row: CalculatedAllocationItem): boolean {
  return row.status !== "ineligible" && row.status !== "zero_demand" && row.demandKits > 0;
}

export function summarize(rows: CalculatedAllocationItem[]) {
  const inProgram = rows.filter((r) => r.status !== "ineligible");
  const totalAllocatedKits = rows.reduce((s, r) => s + r.allocatedKits, 0);
  const totalDemandKits = inProgram.reduce((s, r) => s + r.demandKits, 0);
  // Closure never erases need: closed-center regions still count as unmet.
  const totalUnmetKits = inProgram.reduce((s, r) => s + Math.max(0, r.demandKits - r.allocatedKits), 0);
  const coverages = rows.filter(hasDefinedCoverage).map((r) => r.coveragePercentage);
  return {
    totalAllocatedKits,
    totalDemandKits,
    totalUnmetKits,
    averageCoveragePct: coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : null,
    minCoveragePct: coverages.length ? Math.min(...coverages) : null,
  };
}

/** Display helper: "N/A" for undefined coverage. */
export const formatPct = (value: number | null): string => (value === null ? "N/A" : `${value.toFixed(1)}%`);

// --------------------------------------------------------------------------------------------
// Two-layer reconciliation, delegated to the shared domain ledger rules.
// --------------------------------------------------------------------------------------------

const LEDGER_TYPE: Record<MovementType, LedgerEvent["eventType"]> = {
  dispatch: "dispatch",
  receipt: "receipt",
  collection: "collection",
  in_transit: "in_transit",
  transit_loss: "loss_transit",
  center_damage: "loss_center",
  return: "return_center",
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  dispatch: "Dispatch (central warehouse to center)",
  receipt: "Receipt (arrived at center)",
  in_transit: "Carrier report: kits still in transit",
  collection: "Collection (distributed to families)",
  transit_loss: "Confirmed transit loss or spoilage",
  center_damage: "Damage at center warehouse",
  return: "Return from center to central depot",
};

/** Ledger append order: movements are stored newest first. */
function inAppendOrder(movements: MovementRecord[]): MovementRecord[] {
  return [...movements].reverse();
}

function toLedger(movements: MovementRecord[]): LedgerEvent[] {
  return movements.map((m) => ({
    id: m.recordId,
    eventType: LEDGER_TYPE[m.movementType],
    quantityKits: m.quantityKits,
    reversesEventId: null,
    occurredAt: m.timestampUTC,
    recordedAt: m.timestampUTC,
    reason: m.notes,
    source: m.carrierOrAgent,
  }));
}

export interface CenterLedgerSummary {
  centerId: string;
  dispatchedKits: number;
  /** null means no receipt was reported yet: missing is not zero. */
  receivedKits: number | null;
  inTransitKits: number;
  confirmedLossKits: number;
  /** Dispatched minus received, lost in transit: kits somewhere between warehouse and center. */
  transportBalanceKits: number;
  unresolvedKits: number;
  collectedKits: number;
  damagedKits: number;
  returnedKits: number;
  remainingInCenterKits: number;
  dispatchBalanced: boolean;
  centerBalanced: boolean;
  valid: boolean;
}

export function summarizeCenterLedger(centerId: string, movements: MovementRecord[]): CenterLedgerSummary {
  const own = inAppendOrder(movements.filter((m) => m.centerId === centerId));
  const sum = (t: MovementType) => own.filter((m) => m.movementType === t).reduce((s, m) => s + m.quantityKits, 0);
  const balances = reconcile(toLedger(own));
  const inTransit = balances.reportedInTransitKits ?? 0;
  return {
    centerId,
    dispatchedKits: sum("dispatch"),
    receivedKits: balances.receiptReportedKits,
    inTransitKits: inTransit,
    confirmedLossKits: sum("transit_loss"),
    transportBalanceKits: balances.transportBalanceKits,
    unresolvedKits: balances.unexplainedTransportKits,
    collectedKits: sum("collection"),
    damagedKits: sum("center_damage"),
    returnedKits: sum("return"),
    remainingInCenterKits: balances.centerBalanceKits,
    dispatchBalanced: balances.unexplainedTransportKits === 0,
    centerBalanced: balances.centerBalanceKits >= 0,
    valid: balances.valid,
  };
}

export interface MovementCheck {
  ok: boolean;
  message?: string;
}

/**
 * Validate a proposed movement before it is appended. Impossible facts (receiving more than was
 * dispatched, collecting more than is at the center) are refused, and a dispatch may not exceed
 * what the published plan reserved for that center.
 */
export function checkMovement(
  proposed: Pick<MovementRecord, "centerId" | "movementType" | "quantityKits">,
  movements: MovementRecord[],
  dispatchHeadroomKits: number,
): MovementCheck {
  const q = proposed.quantityKits;
  if (!Number.isSafeInteger(q) || q < 0) return { ok: false, message: "Quantity must be a whole, non-negative number of kits." };
  if (q === 0 && proposed.movementType !== "in_transit") return { ok: false, message: "Quantity must be at least 1 kit." };
  if (proposed.movementType === "dispatch" && q > dispatchHeadroomKits) {
    return { ok: false, message: `Dispatch of ${q} kits exceeds the ${Math.max(0, dispatchHeadroomKits)} kits still reserved for this center in the published plan. Publish a revised plan first.` };
  }
  const own = movements.filter((m) => m.centerId === proposed.centerId);
  const next = { recordId: "proposed", centerId: proposed.centerId, movementType: proposed.movementType, quantityKits: q,
    timestampUTC: new Date().toISOString(), notes: "", carrierOrAgent: "" } as MovementRecord;
  if (!reconcile(toLedger(inAppendOrder([next, ...own]))).valid) {
    const now = summarizeCenterLedger(proposed.centerId, own);
    const transport = ["receipt", "transit_loss", "in_transit"].includes(proposed.movementType);
    const where = transport
      ? `only ${Math.max(0, now.transportBalanceKits)} kits are between the warehouse and the center`
      : `only ${Math.max(0, now.remainingInCenterKits)} kits are at the center`;
    return { ok: false, message: `This report cannot be recorded: ${where}. Check the quantity, or record the missing earlier movement first.` };
  }
  return { ok: true };
}

/** Kits the published plan reserved for regions served by this center, minus what was dispatched. */
export function dispatchHeadroom(
  centerId: string,
  regions: RegionEntity[],
  publishedAllocation: Record<string, number>,
  committed: Record<string, number>,
): number {
  const reserved = regions
    .filter((r) => r.assignedCenterId === centerId)
    .reduce((s, r) => s + (publishedAllocation[r.regionId] ?? 0), 0);
  return reserved - (committed[centerId] ?? 0);
}

/** RFC 4180 CSV with spreadsheet-formula neutralisation (shared with the server exports). */
export function toSafeCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// --------------------------------------------------------------------------------------------
// Intake mapping: a validated CSV row carries region, center capacity, closure and prior
// dispatches; all of it must reach the planner.
// --------------------------------------------------------------------------------------------

export interface IntakeRow {
  regionId: string;
  regionName: string;
  centerId: string;
  demandKits: number;
  capacityKits: number;
  priorDispatchedKits: number;
  status: "open" | "closed";
}

export function intakeToEntities(rows: IntakeRow[], existingCenters: CenterEntity[]): { regions: RegionEntity[]; centers: CenterEntity[] } {
  const known = new Map(existingCenters.map((c) => [c.centerId, c]));
  const centers: CenterEntity[] = rows.map((r) => {
    const previous = known.get(r.centerId);
    return {
      centerId: r.centerId,
      centerName: previous?.centerName ?? `${r.regionName} distribution center`,
      address: previous?.address,
      contactPerson: previous?.contactPerson,
      configuredCapacity: r.capacityKits,
      committedDispatches: r.priorDispatchedKits,
      operatingStatus: r.status === "closed" ? "closed" : "active",
    };
  });
  const regions: RegionEntity[] = rows.map((r) => ({
    regionId: r.regionId,
    regionName: r.regionName,
    assignedCenterId: r.centerId,
    demandKits: r.demandKits,
    status: "active",
  }));
  return { regions, centers };
}

/** Intake-level checks the CSV cleaner does not make: one center per region. */
export function intakeIssues(rows: IntakeRow[]): PlanIssue[] {
  const seen = new Map<string, string>();
  const issues: PlanIssue[] = [];
  for (const r of rows) {
    const other = seen.get(r.centerId);
    if (other) issues.push({ code: "SHARED_CENTER", message: `Regions ${other} and ${r.regionId} both use center ${r.centerId}; each region needs its own center.` });
    else seen.set(r.centerId, r.regionId);
  }
  return issues;
}
