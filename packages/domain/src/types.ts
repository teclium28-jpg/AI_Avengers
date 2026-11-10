// Shared types for FairShare's data-preparation and baseline-allocation layer.
// See docs/data-preparation.md for the full schema writeup and rationale.

/** Raw CSV row shape for regions.csv, before cleaning. All fields arrive as strings. */
export interface RawRegionRow {
  period_id: string;
  region_id: string;
  region_name: string;
  center_id: string;
  demand_kits: string;
  capacity_kits: string;
  prior_dispatched_kits: string;
  status: string;
  reported_or_simulated: string;
}

/** Raw CSV row shape for stock.csv, before cleaning. */
export interface RawStockRow {
  period_id: string;
  stock_kits: string;
  stock_type: string;
  source: string;
  as_of_date: string;
}

export type RegionStatus = "open" | "closed";
export type Provenance = "reported" | "simulated";
export type StockType = "confirmed" | "hypothetical";

/** A cleaned, type-checked region row, ready for the baseline/fairness engines. */
export interface RegionInputRow {
  periodId: string;
  regionId: string;
  regionName: string;
  centerId: string;
  demandKits: number;
  capacityKits: number;
  priorDispatchedKits: number;
  status: RegionStatus;
  provenance: Provenance;
}

/** A cleaned stock row. Only `stock_type === "confirmed"` rows reach the engines. */
export interface StockInputRow {
  periodId: string;
  stockKits: number;
  stockType: StockType;
  source: string;
  asOfDate: string;
}

export type DataIssueKind =
  | "missing_field"
  | "duplicate_row"
  | "invalid_quantity"
  | "impossible_balance"
  | "inconsistent_status"
  | "suspicious_magnitude";

/** A structured, non-fatal(ish) finding from cleaning — surfaced to the importer UI. */
export interface DataIssue {
  kind: DataIssueKind;
  row: number;
  column?: string;
  message: string;
}

/** Everything the baseline (and later the fairness engine) needs for one period. */
export interface PeriodInput {
  periodId: string;
  /** Confirmed period total INCLUDING prior dispatches, not remaining warehouse stock. */
  stockKits: number;
  regions: RegionInputRow[];
}

export interface RegionAllocation {
  regionId: string;
  allocatedKits: number;
  /** allocatedKits - priorDispatchedKits, i.e. the newly distributed portion. */
  newlyAllocatedKits: number;
  coverage: number | null; // allocatedKits / demandKits, null when demand is 0 (N/A)
  boundByCapacity: boolean;
}

export interface BaselineResult {
  periodId: string;
  totalStockKits: number;
  totalAllocatedKits: number;
  unallocatedKits: number;
  allocations: RegionAllocation[];
}
