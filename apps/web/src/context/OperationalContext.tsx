import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import type {
  RegionEntity,
  CenterEntity,
  StockBatch,
  CalculatedAllocationItem,
  DecisionReceiptEntity,
  MovementRecord,
  AllocationAlgorithmType,
  DispatchReconciliationSummary,
  CenterReconciliationSummary,
  NavigationPage,
} from "../types";
import { allocateFairness, computeBaselineAllocation } from "@fairshare/domain";
import { computeSha256Fingerprint } from "../lib/crypto";

// ==========================================
// Initial Production Baseline Seed Data
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

const SEED_RECEIPTS: DecisionReceiptEntity[] = [
  {
    receiptId: "RCPT-MMR-2026-001",
    periodId: "2026-W46",
    revision: 1,
    actorId: "ACT-DIR-01",
    actorName: "Swayam",
    actorRole: "Chief Operations Coordinator",
    timestampUTC: "2026-11-09T08:00:00Z",
    timestampIST: "09 Nov 2026, 13:30:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
    changeJustification: "Initial approved baseline allocation for Cycle 2026-W46.",
    canonicalPayloadHash: "8f4a13b6d27e95c01b44d34e9e0fa958a4361287c8e54736f9872514d3b6a931",
    stagedOverrides: { capacityOverrides: {}, statusOverrides: {} },
    resultingAllocation: { A: 40, B: 40, C: 40 },
  },
  {
    receiptId: "RCPT-MMR-2026-002",
    periodId: "2026-W46",
    revision: 2,
    actorId: "ACT-DIR-01",
    actorName: "Swayam",
    actorRole: "Chief Operations Coordinator",
    timestampUTC: "2026-11-09T14:15:00Z",
    timestampIST: "09 Nov 2026, 19:45:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
    changeJustification: "Heavy rainfall damaged culvert approaching Dharavi Central Node; restricted loading capacity to 20 kits.",
    canonicalPayloadHash: "c23f4b67819ad5490b83e445176ea39bf54867104b2a8f9c7356291a45d09876",
    stagedOverrides: { capacityOverrides: { "CTR-B": 20 }, statusOverrides: {} },
    resultingAllocation: { A: 50, B: 20, C: 50 },
  },
  {
    receiptId: "RCPT-MMR-2026-003",
    periodId: "2026-W46",
    revision: 3,
    actorId: "ACT-DIR-01",
    actorName: "Swayam",
    actorRole: "Chief Operations Coordinator",
    timestampUTC: "2026-11-10T01:30:00Z",
    timestampIST: "10 Nov 2026, 07:00:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
    changeJustification: "Allocated additional warehouse reserve batch (+20 kits) to maximize coverage across accessible zones.",
    canonicalPayloadHash: "19d7a5b34e8f0c291847e335298a44c9b65741087d3a2f8b5c90142e76f59843",
    stagedOverrides: { capacityOverrides: { "CTR-B": 20 }, statusOverrides: {} },
    resultingAllocation: { A: 60, B: 20, C: 60 },
  },
  {
    receiptId: "RCPT-MMR-2026-004",
    periodId: "2026-W46",
    revision: 4,
    actorId: "ACT-DIR-01",
    actorName: "Swayam",
    actorRole: "Chief Operations Coordinator",
    timestampUTC: "2026-11-10T03:00:00Z",
    timestampIST: "10 Nov 2026, 08:30:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
    changeJustification: "Emergency roadway repairs completed by municipal engineers; restored Dharavi Central Node capacity to 40 kits.",
    canonicalPayloadHash: "7b4c92a18e3d5f0412894567e98a34bc21785906d4e21f3a5b8970142c3e5678",
    stagedOverrides: { capacityOverrides: { "CTR-B": 40 }, statusOverrides: {} },
    resultingAllocation: { A: 40, B: 40, C: 40 },
  },
];

const SEED_MOVEMENTS: MovementRecord[] = [
  {
    recordId: "MOV-2026-001",
    waybillNumber: "WB-MMR-4019",
    periodId: "2026-W46",
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
  {
    recordId: "MOV-2026-002",
    waybillNumber: "WB-MMR-4020",
    periodId: "2026-W46",
    centerId: "CTR-B",
    centerName: "Central Node (Dharavi Community Depot)",
    movementType: "receipt",
    quantityKits: 35,
    timestampUTC: "2026-11-10T04:15:00Z",
    timestampIST: "10 Nov 2026, 09:45 IST",
    carrierOrAgent: "State Logistics Fleet #MH-04-E-8821",
    verifiedBy: "Sunita Kamble (Distribution Supervisor)",
    notes: "35 kits received and scanned. 5 kits marked unaccounted upon arrival (Investigation ticket opened: TKT-INV-881).",
  },
  {
    recordId: "MOV-2026-003",
    waybillNumber: "WB-MMR-4021",
    periodId: "2026-W46",
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
];

// ==========================================
// Operational Context State Interface
// ==========================================

interface OperationalContextValue {
  // Navigation
  activePage: NavigationPage;
  setActivePage: (page: NavigationPage) => void;

  // Active Organization & Period Metadata
  organizationName: string;
  organizationId: string;
  periodName: string;
  periodId: string;
  userRole: string;
  userName: string;

  // Authoritative Registered State
  authoritativeRevision: number;
  authoritativeStock: number;
  authoritativeCenters: CenterEntity[];
  authoritativeRegions: RegionEntity[];
  receipts: DecisionReceiptEntity[];
  movements: MovementRecord[];

  // Interactive Planning Studio State
  stagedStock: number;
  setStagedStock: (stock: number) => void;
  stagedCenters: CenterEntity[];
  stagedRegions: RegionEntity[];
  selectedAlgorithm: AllocationAlgorithmType;
  setSelectedAlgorithm: (algo: AllocationAlgorithmType) => void;
  hasStagedChanges: boolean;

  // Calculated Results
  currentPlan: CalculatedAllocationItem[];
  baselinePlan: CalculatedAllocationItem[];
  totalStockAvailable: number;
  totalAllocatedKits: number;
  totalUnmetKits: number;
  averageCoveragePct: number;
  minCoveragePct: number;
  activeCentersCount: number;

  // Reconciliation summaries
  dispatchReconciliation: DispatchReconciliationSummary[];
  centerReconciliation: CenterReconciliationSummary[];

  // Mutator Actions
  updateCenterCapacity: (centerId: string, newCapacity: number) => void;
  toggleCenterStatus: (centerId: string) => void;
  updateRegionDemand: (regionId: string, newDemand: number) => void;
  addNewCenter: (center: Omit<CenterEntity, "committedDispatches">) => void;
  publishAuthoritativePlan: (justification: string, idempotencyKey: string) => Promise<void>;
  recordMovementEvent: (event: Omit<MovementRecord, "recordId" | "timestampUTC" | "timestampIST">) => void;
  applyBatchIntake: (regions: RegionEntity[], stockKits: number) => void;
  resetStudioToAuthoritative: () => void;
  resetToFactoryDefaults: () => void;
}

const OperationalContext = createContext<OperationalContextValue | null>(null);

export const OperationalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load state from localStorage or initialize from seeds
  const [activePage, setActivePage] = useState<NavigationPage>("dashboard");

  const [authoritativeRevision, setAuthoritativeRevision] = useState<number>(() => {
    const saved = localStorage.getItem("fairshare_revision");
    return saved ? parseInt(saved, 10) : 4;
  });

  const [authoritativeStock, setAuthoritativeStock] = useState<number>(() => {
    const saved = localStorage.getItem("fairshare_stock");
    return saved ? parseInt(saved, 10) : 120;
  });

  const [authoritativeCenters, setAuthoritativeCenters] = useState<CenterEntity[]>(() => {
    const saved = localStorage.getItem("fairshare_centers");
    return saved ? JSON.parse(saved) : SEED_CENTERS;
  });

  const [authoritativeRegions, setAuthoritativeRegions] = useState<RegionEntity[]>(() => {
    const saved = localStorage.getItem("fairshare_regions");
    return saved ? JSON.parse(saved) : SEED_REGIONS;
  });

  const [receipts, setReceipts] = useState<DecisionReceiptEntity[]>(() => {
    const saved = localStorage.getItem("fairshare_receipts");
    return saved ? JSON.parse(saved) : SEED_RECEIPTS;
  });

  const [movements, setMovements] = useState<MovementRecord[]>(() => {
    const saved = localStorage.getItem("fairshare_movements");
    return saved ? JSON.parse(saved) : SEED_MOVEMENTS;
  });

  // Staged Studio state
  const [stagedStock, setStagedStock] = useState<number>(authoritativeStock);
  const [stagedCenters, setStagedCenters] = useState<CenterEntity[]>(authoritativeCenters);
  const [stagedRegions, setStagedRegions] = useState<RegionEntity[]>(authoritativeRegions);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<AllocationAlgorithmType>(
    "srs-progressive-maxmin"
  );

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem("fairshare_revision", authoritativeRevision.toString());
    localStorage.setItem("fairshare_stock", authoritativeStock.toString());
    localStorage.setItem("fairshare_centers", JSON.stringify(authoritativeCenters));
    localStorage.setItem("fairshare_regions", JSON.stringify(authoritativeRegions));
    localStorage.setItem("fairshare_receipts", JSON.stringify(receipts));
    localStorage.setItem("fairshare_movements", JSON.stringify(movements));
  }, [authoritativeRevision, authoritativeStock, authoritativeCenters, authoritativeRegions, receipts, movements]);

  // Check if staged state differs from authoritative register
  const hasStagedChanges = useMemo(() => {
    if (stagedStock !== authoritativeStock) return true;
    for (const sc of stagedCenters) {
      const ac = authoritativeCenters.find((c) => c.centerId === sc.centerId);
      if (!ac) return true;
      if (ac.configuredCapacity !== sc.configuredCapacity || ac.operatingStatus !== sc.operatingStatus)
        return true;
    }
    for (const sr of stagedRegions) {
      const ar = authoritativeRegions.find((r) => r.regionId === sr.regionId);
      if (!ar) return true;
      if (ar.demandKits !== sr.demandKits || ar.status !== sr.status) return true;
    }
    return false;
  }, [stagedStock, stagedCenters, stagedRegions, authoritativeStock, authoritativeCenters, authoritativeRegions]);

  // Calculate allocations using domain engine
  const { currentPlan, baselinePlan, totalAllocatedKits, totalUnmetKits, averageCoveragePct, minCoveragePct } =
    useMemo(() => {
      // Build domain period input
      const domainInput = {
        periodId: "2026-W46",
        stockKits: stagedStock,
        regions: stagedRegions.map((r) => {
          const center = stagedCenters.find((c) => c.centerId === r.assignedCenterId);
          const effectiveCapacity =
            !center || center.operatingStatus === "closed" ? 0 : center.configuredCapacity;

          return {
            periodId: "2026-W46",
            regionId: r.regionId,
            regionName: r.regionName,
            centerId: r.assignedCenterId,
            demandKits: r.demandKits,
            capacityKits: effectiveCapacity,
            priorDispatchedKits: center?.committedDispatches || 0,
            status: r.status === "active" && effectiveCapacity > 0 ? ("open" as const) : ("closed" as const),
            provenance: "reported" as const,
          };
        }),
      };

      // Run SRS Progressive Max-Min fairness engine
      const fairnessResult = allocateFairness(domainInput);

      // Run Hamilton proportional baseline
      const baselineResult = computeBaselineAllocation(domainInput);

      // Build enriched UI models
      const enrich = (allocList: typeof fairnessResult.allocations) => {
        return allocList.map((a) => {
          const reg = stagedRegions.find((r) => r.regionId === a.regionId)!;
          const ctr = stagedCenters.find((c) => c.centerId === reg.assignedCenterId);
          const isCenterClosed = !ctr || ctr.operatingStatus === "closed" || ctr.configuredCapacity === 0;

          let status: CalculatedAllocationItem["status"] = "partial";
          if (reg.demandKits === 0) {
            status = "zero_demand";
          } else if (isCenterClosed) {
            status = "unserviceable";
          } else if (a.allocatedKits >= reg.demandKits) {
            status = "full";
          } else if (a.boundByCapacity) {
            status = "capacity_capped";
          }

          return {
            regionId: reg.regionId,
            regionName: reg.regionName,
            assignedCenterId: reg.assignedCenterId,
            centerName: ctr?.centerName || "Unassigned",
            demandKits: reg.demandKits,
            centerCapacity: ctr?.configuredCapacity || 0,
            allocatedKits: a.allocatedKits,
            coverageFraction: { numerator: a.allocatedKits, denominator: reg.demandKits },
            coveragePercentage: reg.demandKits > 0 ? (a.allocatedKits / reg.demandKits) * 100 : 0,
            isCappedByCapacity: a.boundByCapacity,
            isCappedByDemand: a.allocatedKits >= reg.demandKits,
            status,
          };
        });
      };

      const current = selectedAlgorithm === "srs-progressive-maxmin"
        ? enrich(fairnessResult.allocations)
        : enrich(baselineResult.allocations);

      const baseline = enrich(baselineResult.allocations);

      const totalAlloc = current.reduce((sum, item) => sum + item.allocatedKits, 0);
      const totalDemand = current.reduce((sum, item) => sum + item.demandKits, 0);
      const totalUnmet = Math.max(0, totalDemand - totalAlloc);

      const coverages = current.map((c) => c.coveragePercentage);
      const avgCov = coverages.length > 0 ? coverages.reduce((a, b) => a + b, 0) / coverages.length : 0;
      const minCov = coverages.length > 0 ? Math.min(...coverages) : 0;

      return {
        currentPlan: current,
        baselinePlan: baseline,
        totalAllocatedKits: totalAlloc,
        totalUnmetKits: totalUnmet,
        averageCoveragePct: avgCov,
        minCoveragePct: minCov,
      };
    }, [stagedStock, stagedRegions, stagedCenters, selectedAlgorithm]);

  // Compute 2-layer reconciliation from physical movement logs
  const { dispatchReconciliation, centerReconciliation } = useMemo(() => {
    const dispSummary: DispatchReconciliationSummary[] = [];
    const ctrSummary: CenterReconciliationSummary[] = [];

    authoritativeCenters.forEach((center) => {
      const centerMovements = movements.filter((m) => m.centerId === center.centerId);

      const dispatched = centerMovements
        .filter((m) => m.movementType === "dispatch")
        .reduce((sum, m) => sum + m.quantityKits, 0);

      const received = centerMovements
        .filter((m) => m.movementType === "receipt")
        .reduce((sum, m) => sum + m.quantityKits, 0);

      const transitLoss = centerMovements
        .filter((m) => m.movementType === "transit_loss")
        .reduce((sum, m) => sum + m.quantityKits, 0);

      const inTransit = Math.max(0, dispatched - received - transitLoss);
      const unresolvedDiff = dispatched - (received + inTransit + transitLoss);

      dispSummary.push({
        centerId: center.centerId,
        centerName: center.centerName,
        dispatchedKits: dispatched,
        receivedKits: received,
        inTransitKits: inTransit,
        confirmedLossKits: transitLoss,
        unresolvedKits: unresolvedDiff,
        isBalanced: unresolvedDiff === 0,
      });

      const collected = centerMovements
        .filter((m) => m.movementType === "collection")
        .reduce((sum, m) => sum + m.quantityKits, 0);

      const damaged = centerMovements
        .filter((m) => m.movementType === "center_damage")
        .reduce((sum, m) => sum + m.quantityKits, 0);

      const remaining = Math.max(0, received - (collected + damaged));

      ctrSummary.push({
        centerId: center.centerId,
        centerName: center.centerName,
        receivedKits: received,
        collectedKits: collected,
        damagedKits: damaged,
        remainingInCenterKits: remaining,
        isBalanced: true,
      });
    });

    return {
      dispatchReconciliation: dispSummary,
      centerReconciliation: ctrSummary,
    };
  }, [authoritativeCenters, movements]);

  // Mutator Actions
  const updateCenterCapacity = (centerId: string, newCapacity: number) => {
    setStagedCenters((prev) =>
      prev.map((c) => (c.centerId === centerId ? { ...c, configuredCapacity: Math.max(0, newCapacity) } : c))
    );
  };

  const toggleCenterStatus = (centerId: string) => {
    setStagedCenters((prev) =>
      prev.map((c) =>
        c.centerId === centerId
          ? {
              ...c,
              operatingStatus: c.operatingStatus === "active" ? "closed" : "active",
            }
          : c
      )
    );
  };

  const updateRegionDemand = (regionId: string, newDemand: number) => {
    setStagedRegions((prev) =>
      prev.map((r) => (r.regionId === regionId ? { ...r, demandKits: Math.max(0, newDemand) } : r))
    );
  };

  const addNewCenter = (newCenter: Omit<CenterEntity, "committedDispatches">) => {
    const centerWithCommitment: CenterEntity = {
      ...newCenter,
      committedDispatches: 0,
    };
    setAuthoritativeCenters((prev) => [...prev, centerWithCommitment]);
    setStagedCenters((prev) => [...prev, centerWithCommitment]);
  };

  const resetStudioToAuthoritative = () => {
    setStagedStock(authoritativeStock);
    setStagedCenters(authoritativeCenters.map((c) => ({ ...c })));
    setStagedRegions(authoritativeRegions.map((r) => ({ ...r })));
  };

  const publishAuthoritativePlan = async (justification: string, idempotencyKey: string) => {
    const nextRevision = authoritativeRevision + 1;
    const now = new Date();

    const resultingAllocation: Record<string, number> = {};
    currentPlan.forEach((item) => {
      resultingAllocation[item.regionId] = item.allocatedKits;
    });

    const capacityOverrides: Record<string, number> = {};
    const statusOverrides: Record<string, "active" | "closed"> = {};

    stagedCenters.forEach((sc) => {
      const orig = authoritativeCenters.find((c) => c.centerId === sc.centerId);
      if (orig && orig.configuredCapacity !== sc.configuredCapacity) {
        capacityOverrides[sc.centerId] = sc.configuredCapacity;
      }
      if (orig && orig.operatingStatus !== sc.operatingStatus) {
        statusOverrides[sc.centerId] = sc.operatingStatus === "active" ? "active" : "closed";
      }
    });

    const stagedOverrides = {
      capacityOverrides,
      statusOverrides,
    };

    const payloadToHash = {
      periodId: "2026-W46",
      revision: nextRevision,
      actorId: "ACT-DIR-01",
      algorithm: selectedAlgorithm,
      algorithmVersion: "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
      changeJustification: justification,
      resultingAllocation,
      stagedOverrides,
    };

    const canonicalHash = await computeSha256Fingerprint(payloadToHash);

    const newReceipt: DecisionReceiptEntity = {
      receiptId: `RCPT-MMR-2026-${String(nextRevision).padStart(3, "0")}`,
      periodId: "2026-W46",
      revision: nextRevision,
      actorId: "ACT-DIR-01",
      actorName: "Swayam",
      actorRole: "Chief Operations Coordinator",
      timestampUTC: now.toISOString(),
      timestampIST:
        now.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "medium",
        }) + " IST",
      algorithm: selectedAlgorithm,
      algorithmVersion: "SRS Progressive Max-Min Engine v3.1 (Integer BigInt)",
      changeJustification: justification,
      canonicalPayloadHash: canonicalHash,
      stagedOverrides,
      resultingAllocation,
    };

    // Commit state atomically
    setAuthoritativeRevision(nextRevision);
    setAuthoritativeStock(stagedStock);
    setAuthoritativeCenters(stagedCenters.map((c) => ({ ...c })));
    setAuthoritativeRegions(stagedRegions.map((r) => ({ ...r })));
    setReceipts((prev) => [...prev, newReceipt]);
  };

  const recordMovementEvent = (
    event: Omit<MovementRecord, "recordId" | "timestampUTC" | "timestampIST">
  ) => {
    const now = new Date();
    const newRecord: MovementRecord = {
      ...event,
      recordId: `MOV-${Date.now().toString().slice(-6)}`,
      timestampUTC: now.toISOString(),
      timestampIST:
        now.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "short",
        }) + " IST",
    };

    // If movement is dispatch, update center committedDispatches
    if (event.movementType === "dispatch") {
      setAuthoritativeCenters((prev) =>
        prev.map((c) =>
          c.centerId === event.centerId
            ? { ...c, committedDispatches: c.committedDispatches + event.quantityKits }
            : c
        )
      );
      setStagedCenters((prev) =>
        prev.map((c) =>
          c.centerId === event.centerId
            ? { ...c, committedDispatches: c.committedDispatches + event.quantityKits }
            : c
        )
      );
    }

    setMovements((prev) => [newRecord, ...prev]);
  };

  const applyBatchIntake = (newRegions: RegionEntity[], newStockKits: number) => {
    setStagedStock(newStockKits);
    setStagedRegions(newRegions);
    setActivePage("studio");
  };

  const resetToFactoryDefaults = () => {
    localStorage.clear();
    setAuthoritativeRevision(4);
    setAuthoritativeStock(120);
    setAuthoritativeCenters(SEED_CENTERS);
    setAuthoritativeRegions(SEED_REGIONS);
    setReceipts(SEED_RECEIPTS);
    setMovements(SEED_MOVEMENTS);
    setStagedStock(120);
    setStagedCenters(SEED_CENTERS);
    setStagedRegions(SEED_REGIONS);
  };

  const activeCentersCount = useMemo(
    () => stagedCenters.filter((c) => c.operatingStatus === "active" && c.configuredCapacity > 0).length,
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
        periodId: "2026-W46",
        userRole: "Chief Operations Coordinator",
        userName: "Swayam",
        authoritativeRevision,
        authoritativeStock,
        authoritativeCenters,
        authoritativeRegions,
        receipts,
        movements,
        stagedStock,
        setStagedStock,
        stagedCenters,
        stagedRegions,
        selectedAlgorithm,
        setSelectedAlgorithm,
        hasStagedChanges,
        currentPlan,
        baselinePlan,
        totalStockAvailable: stagedStock,
        totalAllocatedKits,
        totalUnmetKits,
        averageCoveragePct,
        minCoveragePct,
        activeCentersCount,
        dispatchReconciliation,
        centerReconciliation,
        updateCenterCapacity,
        toggleCenterStatus,
        updateRegionDemand,
        addNewCenter,
        publishAuthoritativePlan,
        recordMovementEvent,
        applyBatchIntake,
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
