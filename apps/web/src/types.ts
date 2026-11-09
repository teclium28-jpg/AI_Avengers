import type {
  RegionInputRow,
  StockInputRow,
  DataIssue,
  BaselineResult,
  PeriodInput,
  RawRegionRow,
  RawStockRow,
  RegionAllocation,
} from "@fairshare/domain";

export type {
  RegionInputRow,
  StockInputRow,
  DataIssue,
  BaselineResult,
  PeriodInput,
  RawRegionRow,
  RawStockRow,
  RegionAllocation,
};

export type ActiveTab = "practice" | "intake" | "receipts" | "reconciliation";
export type UserRole = "coordinator" | "operator" | "reviewer";
export type AlgorithmType = "srs-progressive-maxmin" | "hamilton-proportional";
export type AllocationAlgorithmType = "srs-progressive-maxmin" | "hamilton-proportional";

export type NavigationPage =
  | "dashboard"
  | "studio"
  | "centers"
  | "intake"
  | "reconciliation"
  | "audit";

export type RegionOperatingStatus = "active" | "ineligible";
export type CenterOperatingStatus = "active" | "constrained" | "closed";

export interface RegionEntity {
  regionId: string;
  regionName: string;
  assignedCenterId: string;
  demandKits: number;
  status: RegionOperatingStatus;
  subDistrict?: string;
  populationServed?: number;
}

export interface CenterEntity {
  centerId: string;
  centerName: string;
  configuredCapacity: number;     // Physical handling limit (kits)
  committedDispatches: number;    // Already dispatched and committed
  operatingStatus: CenterOperatingStatus;
  address?: string;
  contactPerson?: string;
}

export interface StockBatch {
  batchId: string;
  periodId: string;
  quantityKits: number;
  stockType: "confirmed" | "hypothetical";
  sourceWarehouse: string;
  intakeDate: string;
  notes?: string;
}

export interface CalculatedAllocationItem {
  regionId: string;
  regionName: string;
  assignedCenterId: string;
  centerName: string;
  demandKits: number;
  centerCapacity: number;
  allocatedKits: number;
  coverageFraction: { numerator: number; denominator: number };
  coveragePercentage: number;
  isCappedByCapacity: boolean;
  isCappedByDemand: boolean;
  status: "full" | "partial" | "capacity_capped" | "unserviceable" | "zero_demand";
}

export interface DecisionReceiptEntity {
  receiptId: string;
  periodId: string;
  revision: number;
  actorId: string;
  actorName: string;
  actorRole: string;
  timestampUTC: string;
  timestampIST: string;
  algorithm: AllocationAlgorithmType;
  algorithmVersion: string;
  changeJustification: string;
  canonicalPayloadHash: string;
  stagedOverrides: {
    capacityOverrides: Record<string, number>;
    statusOverrides: Record<string, "active" | "closed">;
  };
  resultingAllocation: Record<string, number>;
}

export type MovementType =
  | "dispatch"       // Central Warehouse -> Center
  | "receipt"        // Arrived at Center
  | "collection"     // Distributed to Family / Community
  | "transit_loss"   // Damaged or stolen in transit
  | "center_damage"  // Spoiled or damaged in center warehouse
  | "return";        // Returned to Central Depot

export interface MovementRecord {
  recordId: string;
  waybillNumber: string;
  periodId: string;
  centerId: string;
  centerName: string;
  movementType: MovementType;
  quantityKits: number;
  timestampUTC: string;
  timestampIST: string;
  carrierOrAgent: string;
  verifiedBy: string;
  notes: string;
}

export interface DispatchReconciliationSummary {
  centerId: string;
  centerName: string;
  dispatchedKits: number;
  receivedKits: number;
  inTransitKits: number;
  confirmedLossKits: number;
  unresolvedKits: number;
  isBalanced: boolean;
}

export interface CenterReconciliationSummary {
  centerId: string;
  centerName: string;
  receivedKits: number;
  collectedKits: number;
  damagedKits: number;
  remainingInCenterKits: number;
  isBalanced: boolean;
}
