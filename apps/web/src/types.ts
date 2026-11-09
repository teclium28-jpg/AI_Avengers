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

export interface UserSession {
  userId: string;
  name: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  isSimulatedDemo: boolean;
}

export type AlgorithmType = "srs-progressive-maxmin" | "hamilton-proportional";

export interface DecisionReceipt {
  receiptId: string;
  periodId: string;
  revision: number;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  timestampUTC: string;
  timestampIST: string;
  algorithm: AlgorithmType;
  algorithmVersion: string;
  changeJustification: string;
  canonicalPayloadHash: string;
  stagedOverrides: {
    capacityOverrides: Record<string, number>;
    statusOverrides: Record<string, "open" | "closed">;
  };
  resultingAllocation: Record<string, number>;
}

export type MovementEventType =
  | "dispatch"
  | "receipt"
  | "collection"
  | "loss_transit"
  | "loss_center"
  | "return";

export interface MovementEvent {
  eventId: string;
  timestampUTC: string;
  periodId: string;
  centerId: string;
  eventType: MovementEventType;
  quantityKits: number;
  referenceDoc: string;
  notes?: string;
  recordedBy: string;
}

export interface DispatchReconciliationRow {
  centerId: string;
  centerName: string;
  dispatchedKits: number;
  receivedKits: number;
  inTransitKits: number;
  confirmedLossKits: number;
  unresolvedKits: number; // dispatched - (received + inTransit + loss)
  isBalanced: boolean;
}

export interface CenterReconciliationRow {
  centerId: string;
  centerName: string;
  receivedKits: number;
  collectedKits: number;
  damagedKits: number;
  remainingInCenterKits: number; // received - (collected + damaged)
  isBalanced: boolean;
}
