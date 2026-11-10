import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import type {
  AidRequest,
  RegionEntity,
  CenterEntity,
  CalculatedAllocationItem,
  DecisionReceiptEntity,
  MovementRecord,
  AllocationAlgorithmType,
  NavigationPage,
} from "../types";
import { computeSha256Fingerprint } from "../lib/crypto";
import { mirrorToSupabase } from "../lib/sync";
import {
  PERIOD_ID,
  computePlan,
  committedByCenter,
  summarizeCenterLedger,
  checkMovement,
  dispatchHeadroom,
  type CenterLedgerSummary,
  type MovementCheck,
  type PlanIssue,
  type PlanResult,
} from "../lib/planning";
import { SCENARIO_PRESETS } from "../lib/scenarios";

// ==========================================
// Seed data (clearly synthetic demo fixtures)
// ==========================================

const SEED_CENTERS: CenterEntity[] = [
  {
    centerId: "CTR-A",
    centerName: "North Hub (Bhiwandi Logistics Center)",
    configuredCapacity: 60,
    committedDispatches: 0,
    operatingStatus: "active",
    address: "Warehouse Complex 4, Mumbai-Nashik Highway, Bhiwandi",
    contactPerson: "Rajesh Patil (Site Lead)",
  },
  {
    centerId: "CTR-B",
    centerName: "Central Node (Dharavi Community Depot)",
    configuredCapacity: 40,
    committedDispatches: 0,
    operatingStatus: "active",
    address: "Ward G-North Community Center, 60-Feet Road, Dharavi",
    contactPerson: "Sunita Kamble (Distribution Supervisor)",
  },
  {
    centerId: "CTR-C",
    centerName: "Coastal Terminal (Colaba Relief Store)",
    configuredCapacity: 60,
    committedDispatches: 0,
    operatingStatus: "active",
    address: "Dockyard Storehouse 12, Sassoon Docks, Colaba",
    contactPerson: "Amitabh Sen (Logistics Officer)",
  },
];

const SEED_REGIONS: RegionEntity[] = [
  {
    regionId: "A",
    regionName: "Zone 1 — Northern Wards & Informal Settlements",
    assignedCenterId: "CTR-A",
    demandKits: 60,
    status: "active",
    subDistrict: "Kurla-Ghatkopar Belt",
    populationServed: 14200,
  },
  {
    regionId: "B",
    regionName: "Zone 2 — Central Transit Wards & High-Density Belt",
    assignedCenterId: "CTR-B",
    demandKits: 60,
    status: "active",
    subDistrict: "Dharavi-Sion Sector",
    populationServed: 18500,
  },
  {
    regionId: "C",
    regionName: "Zone 3 — Coastal Fisherfolk & Dockside Colonies",
    assignedCenterId: "CTR-C",
    demandKits: 60,
    status: "active",
    subDistrict: "Colaba-Sewri Waterfront",
    populationServed: 11800,
  },
];

const ALGORITHM_VERSION: Record<AllocationAlgorithmType, string> = {
  "srs-progressive-maxmin": "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
  "hamilton-proportional": "Hamilton Proportional Baseline v1 (Largest Remainder)",
};

const SEED_RECEIPTS: DecisionReceiptEntity[] = [
  {
    receiptId: "RCPT-MMR-2026-001",
    periodId: PERIOD_ID,
    revision: 1,
    actorId: "ACT-DIR-01",
    actorName: "Swayam Ruparel",
    actorRole: "Chief Operations Coordinator",
    timestampUTC: "2026-11-10T08:00:00Z",
    timestampIST: "10 Nov 2026, 13:30:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: ALGORITHM_VERSION["srs-progressive-maxmin"],
    changeJustification: "Initial approved baseline allocation for Cycle 2026-W46.",
    // SHA-256 of the canonical payload below; verified by the audit view.
    canonicalPayloadHash: "4f4df5eab0d624a5a54e05aaea40552c3a987ef30cc8a07a9720b000712de2c4",
    stagedOverrides: { capacityOverrides: {}, statusOverrides: {} },
    resultingAllocation: { A: 40, B: 40, C: 40 },
  },
];

const SEED_MOVEMENTS: MovementRecord[] = [
  {
    recordId: "MOV-2026-003",
    waybillNumber: "WB-MMR-4021",
    periodId: PERIOD_ID,
    centerId: "CTR-B",
    centerName: "Central Node (Dharavi Community Depot)",
    movementType: "collection",
    quantityKits: 25,
    timestampUTC: "2026-11-10T06:00:00Z",
    timestampIST: "10 Nov 2026, 11:30 IST",
    carrierOrAgent: "Registered Beneficiary Families (Sector 3 & 4)",
    verifiedBy: "Sunita Kamble (Distribution Supervisor)",
    notes: "25 registered households verified via physical family tokens and collected monthly kit.",
  },
  {
    recordId: "MOV-2026-002",
    waybillNumber: "WB-MMR-4020",
    periodId: PERIOD_ID,
    centerId: "CTR-B",
    centerName: "Central Node (Dharavi Community Depot)",
    movementType: "receipt",
    quantityKits: 35,
    timestampUTC: "2026-11-10T04:15:00Z",
    timestampIST: "10 Nov 2026, 09:45 IST",
    carrierOrAgent: "State Logistics Fleet #MH-04-E-8821",
    verifiedBy: "Sunita Kamble (Distribution Supervisor)",
    notes: "35 kits received and scanned. 5 kits not yet explained (review ticket TKT-INV-881).",
  },
  {
    recordId: "MOV-2026-001",
    waybillNumber: "WB-MMR-4019",
    periodId: PERIOD_ID,
    centerId: "CTR-B",
    centerName: "Central Node (Dharavi Community Depot)",
    movementType: "dispatch",
    quantityKits: 40,
    timestampUTC: "2026-11-10T02:00:00Z",
    timestampIST: "10 Nov 2026, 07:30 IST",
    carrierOrAgent: "State Logistics Fleet #MH-04-E-8821",
    verifiedBy: "Gaurav Shinde (Depot Manager)",
    notes: "Direct dispatch of sealed 15kg Emergency Ration Kits from Central Warehouse",
  },
];

// ==========================================
// Storage: every read is validated; anything malformed falls back to the seed.
// ==========================================

const STORAGE_SCHEMA = "2";
const KEYS = {
  schema: "fairshare_schema",
  revision: "fairshare_revision",
  stock: "fairshare_stock",
  centers: "fairshare_centers",
  regions: "fairshare_regions",
  receipts: "fairshare_receipts",
  movements: "fairshare_movements",
  requests: "fairshare_aid_requests",
} as const;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: the session keeps working in memory */
  }
}
function readInt(key: string, fallback: number): number {
  const n = Number(readStorage(key));
  return readStorage(key) !== null && Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}
function readArray<T>(key: string, fallback: T[], valid: (item: any) => boolean): T[] {
  try {
    const parsed = JSON.parse(readStorage(key) ?? "null");
    return Array.isArray(parsed) && parsed.every(valid) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
const isCenter = (c: any) => c && typeof c.centerId === "string" && Number.isSafeInteger(c.configuredCapacity) && c.configuredCapacity >= 0;
const isRegion = (r: any) => r && typeof r.regionId === "string" && typeof r.assignedCenterId === "string" && Number.isSafeInteger(r.demandKits) && r.demandKits >= 0;
const isReceipt = (r: any) => r && typeof r.receiptId === "string" && Number.isSafeInteger(r.revision) && r.resultingAllocation && typeof r.resultingAllocation === "object";
const isMovement = (m: any) => m && typeof m.recordId === "string" && typeof m.centerId === "string" && Number.isSafeInteger(m.quantityKits);
const isRequest = (r: any) => r && typeof r.requestId === "string" && typeof r.regionId === "string";

function loadInitialState() {
  const schema = readStorage(KEYS.schema);
  const centers = readArray<CenterEntity>(KEYS.centers, SEED_CENTERS, isCenter);
  const receipts = readArray<DecisionReceiptEntity>(KEYS.receipts, SEED_RECEIPTS, isReceipt);
  return {
    revision: Math.max(1, receipts.reduce((m, r) => Math.max(m, r.revision), 0), readInt(KEYS.revision, 1)),
    stock: readInt(KEYS.stock, 120),
    // Before schema 2, ledger dispatches were also added to committedDispatches. Dispatches are
    // now always derived from the ledger, so the stored running total is reset to avoid counting
    // them twice.
    centers: schema === STORAGE_SCHEMA ? centers : centers.map((c) => ({ ...c, committedDispatches: 0 })),
    regions: readArray<RegionEntity>(KEYS.regions, SEED_REGIONS, isRegion),
    receipts: receipts.map((r) => (r.receiptId === SEED_RECEIPTS[0].receiptId && r.revision === 1 ? SEED_RECEIPTS[0] : r)),
    movements: readArray<MovementRecord>(KEYS.movements, SEED_MOVEMENTS, isMovement),
    requests: readArray<AidRequest>(KEYS.requests, [], isRequest),
  };
}

const formatIST = (date: Date, timeStyle: "short" | "medium") =>
  date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle }) + " IST";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// ==========================================
// Context
// ==========================================

export interface PublishResult {
  ok: boolean;
  message?: string;
}

interface OperationalContextValue {
  activePage: NavigationPage;
  setActivePage: (page: NavigationPage) => void;

  organizationName: string;
  organizationId: string;
  periodName: string;
  periodId: string;

  // Authoritative register (last published revision)
  authoritativeRevision: number;
  authoritativeStock: number;
  authoritativeCenters: CenterEntity[];
  authoritativeRegions: RegionEntity[];
  authoritativePlan: PlanResult;
  publishedAllocation: Record<string, number>;
  receipts: DecisionReceiptEntity[];
  movements: MovementRecord[];
  committedDispatches: Record<string, number>;

  // Planning studio (uncommitted preview)
  stagedStock: number;
  setStagedStock: (stock: number) => void;
  /** Confirmed stock behind the preview; anything above it is hypothetical. */
  stagedConfirmedStock: number;
  hypotheticalStockKits: number;
  stagedCenters: CenterEntity[];
  stagedRegions: RegionEntity[];
  selectedAlgorithm: AllocationAlgorithmType;
  setSelectedAlgorithm: (algo: AllocationAlgorithmType) => void;
  hasStagedChanges: boolean;
  stagedSource: "register" | "intake" | "scenario";
  /** Kits already dispatched per center as used by the preview. */
  stagedCommitted: Record<string, number>;

  currentPlan: CalculatedAllocationItem[];
  baselinePlan: CalculatedAllocationItem[];
  planIssues: PlanIssue[];
  totalStockAvailable: number;
  totalAllocatedKits: number;
  totalDemandKits: number;
  totalUnmetKits: number;
  averageCoveragePct: number | null;
  minCoveragePct: number | null;
  activeCentersCount: number;

  centerLedgers: (CenterLedgerSummary & { centerName: string })[];

  aidRequests: AidRequest[];
  submitAidRequest: (request: Omit<AidRequest, "requestId" | "submittedAtUTC" | "status">) => void;
  resolveAidRequest: (requestId: string, decision: "staged" | "dismissed") => void;

  /** Returns an error message when the change is refused. */
  updateCenterCapacity: (centerId: string, newCapacity: number) => string | null;
  toggleCenterStatus: (centerId: string) => void;
  updateRegionDemand: (regionId: string, newDemand: number) => string | null;
  addNewCenter: (center: Omit<CenterEntity, "committedDispatches">) => string | null;
  publishAuthoritativePlan: (
    justification: string,
    idempotencyKey: string,
    actor?: { actorId: string; actorName: string; actorRole: string }
  ) => Promise<PublishResult>;
  dispatchHeadroomFor: (centerId: string) => number;
  recordMovementEvent: (event: Omit<MovementRecord, "recordId" | "timestampUTC" | "timestampIST">) => MovementCheck;
  applyBatchIntake: (regions: RegionEntity[], centers: CenterEntity[], confirmedStockKits: number) => void;
  applyScenario: (scenarioId: string) => void;
  resetStudioToAuthoritative: () => void;
  resetToFactoryDefaults: () => void;
}

const OperationalContext = createContext<OperationalContextValue | null>(null);

export const OperationalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initial] = useState(loadInitialState);
  const [activePage, setActivePage] = useState<NavigationPage>("dashboard");

  const [authoritativeRevision, setAuthoritativeRevision] = useState<number>(initial.revision);
  const [authoritativeStock, setAuthoritativeStock] = useState<number>(initial.stock);
  const [authoritativeCenters, setAuthoritativeCenters] = useState<CenterEntity[]>(initial.centers);
  const [authoritativeRegions, setAuthoritativeRegions] = useState<RegionEntity[]>(initial.regions);
  const [receipts, setReceipts] = useState<DecisionReceiptEntity[]>(initial.receipts);
  const [movements, setMovements] = useState<MovementRecord[]>(initial.movements);
  const [aidRequests, setAidRequests] = useState<AidRequest[]>(initial.requests);

  const [stagedStock, setStagedStockState] = useState<number>(initial.stock);
  const [stagedConfirmedStock, setStagedConfirmedStock] = useState<number>(initial.stock);
  const [stagedCenters, setStagedCenters] = useState<CenterEntity[]>(initial.centers);
  const [stagedRegions, setStagedRegions] = useState<RegionEntity[]>(initial.regions);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AllocationAlgorithmType>("srs-progressive-maxmin");
  /** Where the preview came from. Scenario presets are what-if studies and cannot be published. */
  const [stagedSource, setStagedSource] = useState<"register" | "intake" | "scenario">("register");
  const usedIdempotencyKeys = useRef(new Set<string>());

  useEffect(() => {
    writeStorage(KEYS.schema, STORAGE_SCHEMA);
    writeStorage(KEYS.revision, String(authoritativeRevision));
    writeStorage(KEYS.stock, String(authoritativeStock));
    writeStorage(KEYS.centers, JSON.stringify(authoritativeCenters));
    writeStorage(KEYS.regions, JSON.stringify(authoritativeRegions));
    writeStorage(KEYS.receipts, JSON.stringify(receipts));
    writeStorage(KEYS.movements, JSON.stringify(movements));
    writeStorage(KEYS.requests, JSON.stringify(aidRequests));
  }, [authoritativeRevision, authoritativeStock, authoritativeCenters, authoritativeRegions, receipts, movements, aidRequests]);

  const committedDispatches = useMemo(() => {
    // Staged and authoritative center lists can differ (e.g. after an import); cover both.
    const all = new Map<string, CenterEntity>();
    for (const c of authoritativeCenters) all.set(c.centerId, c);
    for (const c of stagedCenters) all.set(c.centerId, c);
    return committedByCenter([...all.values()], movements);
  }, [authoritativeCenters, stagedCenters, movements]);

  const hasStagedChanges = useMemo(() => {
    if (stagedStock !== authoritativeStock) return true;
    if (stagedCenters.length !== authoritativeCenters.length || stagedRegions.length !== authoritativeRegions.length) return true;
    for (const sc of stagedCenters) {
      const ac = authoritativeCenters.find((c) => c.centerId === sc.centerId);
      if (!ac || ac.configuredCapacity !== sc.configuredCapacity || ac.operatingStatus !== sc.operatingStatus || ac.committedDispatches !== sc.committedDispatches) return true;
    }
    for (const sr of stagedRegions) {
      const ar = authoritativeRegions.find((r) => r.regionId === sr.regionId);
      if (!ar || ar.demandKits !== sr.demandKits || ar.status !== sr.status || ar.assignedCenterId !== sr.assignedCenterId) return true;
    }
    return false;
  }, [stagedStock, stagedCenters, stagedRegions, authoritativeStock, authoritativeCenters, authoritativeRegions]);

  // Presets model the period before any dispatch, so the ledger is left out of their preview.
  const stagedCommitted = useMemo(
    () => (stagedSource === "scenario" ? committedByCenter(stagedCenters, []) : committedDispatches),
    [stagedSource, stagedCenters, committedDispatches]
  );
  const fairPlan = useMemo(
    () => computePlan(stagedStock, stagedCenters, stagedRegions, stagedCommitted, "srs-progressive-maxmin"),
    [stagedStock, stagedCenters, stagedRegions, stagedCommitted]
  );
  const proportionalPlan = useMemo(
    () => computePlan(stagedStock, stagedCenters, stagedRegions, stagedCommitted, "hamilton-proportional"),
    [stagedStock, stagedCenters, stagedRegions, stagedCommitted]
  );
  const currentResult = selectedAlgorithm === "srs-progressive-maxmin" ? fairPlan : proportionalPlan;

  const latestReceipt = receipts.length ? receipts.reduce((a, b) => (b.revision > a.revision ? b : a)) : null;
  const authoritativePlan = useMemo(
    () => computePlan(authoritativeStock, authoritativeCenters, authoritativeRegions, committedDispatches, latestReceipt?.algorithm ?? "srs-progressive-maxmin"),
    [authoritativeStock, authoritativeCenters, authoritativeRegions, committedDispatches, latestReceipt?.algorithm]
  );
  const publishedAllocation = latestReceipt?.resultingAllocation ?? {};

  const centerLedgers = useMemo(() => {
    const ids = new Set(movements.map((m) => m.centerId));
    const named = new Map<string, string>();
    for (const c of [...authoritativeCenters, ...stagedCenters]) named.set(c.centerId, c.centerName);
    for (const m of movements) if (!named.has(m.centerId)) named.set(m.centerId, m.centerName);
    // Every current center, plus any center that still has ledger history.
    const centerIds = [...new Set([...authoritativeCenters.map((c) => c.centerId), ...ids])];
    return centerIds.map((id) => ({ ...summarizeCenterLedger(id, movements), centerName: named.get(id) ?? id }));
  }, [authoritativeCenters, stagedCenters, movements]);

  // ---------------- Mutators ----------------

  const setStagedStock = (stock: number) => {
    if (Number.isSafeInteger(stock) && stock >= 0) setStagedStockState(stock);
  };

  const updateCenterCapacity = (centerId: string, newCapacity: number): string | null => {
    if (!Number.isSafeInteger(newCapacity) || newCapacity < 0) return "Capacity must be a whole, non-negative number of kits.";
    const dispatched = stagedCommitted[centerId] ?? 0;
    if (newCapacity < dispatched) return `${dispatched} kits were already dispatched to this center; capacity cannot be set below that.`;
    setStagedCenters((prev) => prev.map((c) => (c.centerId === centerId ? { ...c, configuredCapacity: newCapacity } : c)));
    return null;
  };

  const toggleCenterStatus = (centerId: string) => {
    setStagedCenters((prev) =>
      prev.map((c) => (c.centerId === centerId ? { ...c, operatingStatus: c.operatingStatus === "closed" ? "active" : "closed" } : c))
    );
  };

  const updateRegionDemand = (regionId: string, newDemand: number): string | null => {
    if (!Number.isSafeInteger(newDemand) || newDemand < 0) return "Demand must be a whole, non-negative number of kits.";
    setStagedRegions((prev) => prev.map((r) => (r.regionId === regionId ? { ...r, demandKits: newDemand } : r)));
    return null;
  };

  const addNewCenter = (newCenter: Omit<CenterEntity, "committedDispatches">): string | null => {
    const id = newCenter.centerId.trim().toUpperCase();
    if (!id) return "A center code is required.";
    if ([...authoritativeCenters, ...stagedCenters].some((c) => c.centerId === id)) return `Center ${id} already exists.`;
    if (!Number.isSafeInteger(newCenter.configuredCapacity) || newCenter.configuredCapacity < 0) return "Capacity must be a whole, non-negative number of kits.";
    const center: CenterEntity = { ...newCenter, centerId: id, committedDispatches: 0 };
    setAuthoritativeCenters((prev) => [...prev, center]);
    setStagedCenters((prev) => [...prev, center]);
    return null;
  };

  const resetStudioToAuthoritative = () => {
    setStagedSource("register");
    setStagedStockState(authoritativeStock);
    setStagedConfirmedStock(authoritativeStock);
    setStagedCenters(authoritativeCenters.map((c) => ({ ...c })));
    setStagedRegions(authoritativeRegions.map((r) => ({ ...r })));
  };

  const publishAuthoritativePlan = async (
    justification: string,
    idempotencyKey: string,
    actor?: { actorId: string; actorName: string; actorRole: string }
  ): Promise<PublishResult> => {
    // Same intent retried (double click, retry after error): never create a second revision.
    if (usedIdempotencyKeys.current.has(idempotencyKey)) return { ok: true };
    if (stagedSource === "scenario") return { ok: false, message: "Scenario presets are what-if studies of the period before any dispatch. Reset to the register (or import confirmed data) to publish." };
    if (justification.trim().length < 10) return { ok: false, message: "A justification of at least 10 characters is required." };
    if (currentResult.issues.length) return { ok: false, message: "The plan has input conflicts. Resolve them before publishing." };
    if (stagedStock !== stagedConfirmedStock) {
      return { ok: false, message: `Staged stock (${stagedStock}) differs from confirmed stock (${stagedConfirmedStock}). Hypothetical stock cannot become confirmed stock; reset the stock or import a confirmed warehouse count.` };
    }
    usedIdempotencyKeys.current.add(idempotencyKey);

    const nextRevision = authoritativeRevision + 1;
    const now = new Date();
    const resultingAllocation: Record<string, number> = {};
    currentResult.rows.forEach((item) => {
      resultingAllocation[item.regionId] = item.allocatedKits;
    });
    const capacityOverrides: Record<string, number> = {};
    const statusOverrides: Record<string, "active" | "closed"> = {};
    stagedCenters.forEach((sc) => {
      const orig = authoritativeCenters.find((c) => c.centerId === sc.centerId);
      if (orig && orig.configuredCapacity !== sc.configuredCapacity) capacityOverrides[sc.centerId] = sc.configuredCapacity;
      if (orig && orig.operatingStatus !== sc.operatingStatus) statusOverrides[sc.centerId] = sc.operatingStatus === "closed" ? "closed" : "active";
    });
    const stagedOverrides = { capacityOverrides, statusOverrides };
    const effectiveActorId = actor?.actorId || "ACT-DIR-01";
    const effectiveActorName = actor?.actorName || "Authorized Officer";
    const effectiveActorRole = actor?.actorRole || "Chief Operations Coordinator";
    const algorithmVersion = ALGORITHM_VERSION[selectedAlgorithm];
    const changeJustification = justification.trim();

    const canonicalHash = await computeSha256Fingerprint({
      periodId: PERIOD_ID,
      revision: nextRevision,
      actorId: effectiveActorId,
      algorithm: selectedAlgorithm,
      algorithmVersion,
      changeJustification,
      resultingAllocation,
      stagedOverrides,
    });

    const newReceipt: DecisionReceiptEntity = {
      receiptId: `RCPT-MMR-2026-${String(nextRevision).padStart(3, "0")}`,
      periodId: PERIOD_ID,
      revision: nextRevision,
      actorId: effectiveActorId,
      actorName: effectiveActorName,
      actorRole: effectiveActorRole,
      timestampUTC: now.toISOString(),
      timestampIST: formatIST(now, "medium"),
      algorithm: selectedAlgorithm,
      algorithmVersion,
      changeJustification,
      canonicalPayloadHash: canonicalHash,
      stagedOverrides,
      resultingAllocation,
    };

    setAuthoritativeRevision(nextRevision);
    setAuthoritativeStock(stagedStock);
    setAuthoritativeCenters(stagedCenters.map((c) => ({ ...c })));
    setAuthoritativeRegions(stagedRegions.map((r) => ({ ...r })));
    setReceipts((prev) => [...prev, newReceipt]);

    mirrorToSupabase("authoritative_ledger", {
      receipt_id: newReceipt.receiptId,
      cycle_id: newReceipt.periodId,
      revision: newReceipt.revision,
      parent_receipt_id: latestReceipt?.receiptId ?? null,
      sha256_hash: canonicalHash,
      idempotency_key: idempotencyKey,
      actor_id: effectiveActorId,
      actor_name: effectiveActorName,
      actor_role: effectiveActorRole,
      justification: changeJustification,
      stock_kits: stagedStock,
      allocations: resultingAllocation,
    });
    return { ok: true };
  };

  const dispatchHeadroomFor = (centerId: string) =>
    dispatchHeadroom(centerId, authoritativeRegions, publishedAllocation, committedDispatches);

  const recordMovementEvent = (event: Omit<MovementRecord, "recordId" | "timestampUTC" | "timestampIST">): MovementCheck => {
    const check = checkMovement(event, movements, dispatchHeadroomFor(event.centerId));
    if (!check.ok) return check;
    const now = new Date();
    const newRecord: MovementRecord = {
      ...event,
      recordId: `MOV-${newId()}`,
      timestampUTC: now.toISOString(),
      timestampIST: formatIST(now, "short"),
    };
    // Dispatches become commitments through the ledger itself (see committedByCenter).
    setMovements((prev) => [newRecord, ...prev]);
    mirrorToSupabase(
      "inbound_shipments",
      {
        id: newRecord.waybillNumber,
        destination_facility_id: newRecord.centerId,
        kits_shipped: newRecord.quantityKits,
        kits_received: newRecord.movementType === "receipt" ? newRecord.quantityKits : null,
        status: newRecord.movementType === "receipt" ? "delivered" : "in_transit",
        confirmed_by: newRecord.verifiedBy,
        confirmed_at: newRecord.timestampUTC,
      },
      "upsert"
    );
    return { ok: true };
  };

  const applyBatchIntake = (newRegions: RegionEntity[], newCenters: CenterEntity[], confirmedStockKits: number) => {
    setStagedStockState(confirmedStockKits);
    setStagedConfirmedStock(confirmedStockKits);
    setStagedCenters(newCenters.map((c) => ({ ...c })));
    setStagedRegions(newRegions.map((r) => ({ ...r })));
    setStagedSource("intake");
    setActivePage("studio");
  };

  /** Deterministic presets: each one resets every input to a known state (FRONTEND.md 4.3). */
  const applyScenario = (scenarioId: string) => {
    const preset = SCENARIO_PRESETS.find((s) => s.id === scenarioId);
    if (!preset) return;
    const seedRegion = new Map(SEED_REGIONS.map((r) => [r.regionId, r]));
    const seedCenter = new Map(SEED_CENTERS.map((c) => [c.centerId, c]));
    const centers: CenterEntity[] = preset.input.regions.map((r) => ({
      ...(seedCenter.get(r.centerId) ?? { centerName: `${r.regionName} distribution center` }),
      centerId: r.centerId,
      configuredCapacity: r.capacityKits,
      committedDispatches: r.priorDispatchedKits,
      operatingStatus: r.status === "closed" ? "closed" : "active",
    }) as CenterEntity);
    const regions: RegionEntity[] = preset.input.regions.map((r) => ({
      ...(seedRegion.get(r.regionId) ?? {}),
      regionId: r.regionId,
      regionName: seedRegion.get(r.regionId)?.regionName ?? r.regionName,
      assignedCenterId: r.centerId,
      demandKits: r.demandKits,
      status: "active",
    }));
    // Presets are what-if studies: their stock is hypothetical unless it equals confirmed stock.
    setStagedStockState(preset.input.stockKits);
    setStagedConfirmedStock(authoritativeStock);
    setStagedCenters(centers);
    setStagedRegions(regions);
    setStagedSource("scenario");
  };

  const submitAidRequest = (request: Omit<AidRequest, "requestId" | "submittedAtUTC" | "status">) => {
    const saved: AidRequest = { ...request, requestId: `REQ-${newId().slice(0, 8)}`, submittedAtUTC: new Date().toISOString(), status: "pending" };
    setAidRequests((prev) => [saved, ...prev]);
  };

  const resolveAidRequest = (requestId: string, decision: "staged" | "dismissed") => {
    const request = aidRequests.find((r) => r.requestId === requestId);
    if (!request || request.status !== "pending") return;
    if (decision === "staged") updateRegionDemand(request.regionId, request.requestedKits);
    setAidRequests((prev) => prev.map((r) => (r.requestId === requestId ? { ...r, status: decision } : r)));
  };

  const resetToFactoryDefaults = () => {
    // Remove only planning data; the signed-in session is kept.
    for (const key of Object.values(KEYS)) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    usedIdempotencyKeys.current.clear();
    setAuthoritativeRevision(1);
    setAuthoritativeStock(120);
    setAuthoritativeCenters(SEED_CENTERS);
    setAuthoritativeRegions(SEED_REGIONS);
    setReceipts(SEED_RECEIPTS);
    setMovements(SEED_MOVEMENTS);
    setAidRequests([]);
    setStagedStockState(120);
    setStagedConfirmedStock(120);
    setStagedCenters(SEED_CENTERS);
    setStagedRegions(SEED_REGIONS);
    setStagedSource("register");
  };

  const activeCentersCount = useMemo(
    () => stagedCenters.filter((c) => c.operatingStatus !== "closed" && c.configuredCapacity > 0).length,
    [stagedCenters]
  );

  return (
    <OperationalContext.Provider
      value={{
        activePage,
        setActivePage,
        organizationName: "Maharashtra State Food Distribution Authority",
        organizationId: "MSFDA-MMR-DIV",
        periodName: "Cycle 2026-W46 (10 Nov – 16 Nov 2026)",
        periodId: PERIOD_ID,
        authoritativeRevision,
        authoritativeStock,
        authoritativeCenters,
        authoritativeRegions,
        authoritativePlan,
        publishedAllocation,
        receipts,
        movements,
        committedDispatches,
        stagedStock,
        setStagedStock,
        stagedConfirmedStock,
        hypotheticalStockKits: stagedStock - stagedConfirmedStock,
        stagedCenters,
        stagedRegions,
        selectedAlgorithm,
        setSelectedAlgorithm,
        hasStagedChanges,
        stagedSource,
        stagedCommitted,
        currentPlan: currentResult.rows,
        baselinePlan: proportionalPlan.rows,
        planIssues: currentResult.issues,
        totalStockAvailable: stagedStock,
        totalAllocatedKits: currentResult.totalAllocatedKits,
        totalDemandKits: currentResult.totalDemandKits,
        totalUnmetKits: currentResult.totalUnmetKits,
        averageCoveragePct: currentResult.averageCoveragePct,
        minCoveragePct: currentResult.minCoveragePct,
        activeCentersCount,
        centerLedgers,
        aidRequests,
        submitAidRequest,
        resolveAidRequest,
        updateCenterCapacity,
        toggleCenterStatus,
        updateRegionDemand,
        addNewCenter,
        publishAuthoritativePlan,
        dispatchHeadroomFor,
        recordMovementEvent,
        applyBatchIntake,
        applyScenario,
        resetStudioToAuthoritative,
        resetToFactoryDefaults,
      }}
    >
      {children}
    </OperationalContext.Provider>
  );
};

export const useOperational = () => {
  const context = useContext(OperationalContext);
  if (!context) {
    throw new Error("useOperational must be used within an OperationalProvider");
  }
  return context;
};
