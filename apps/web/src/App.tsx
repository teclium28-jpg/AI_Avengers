import React, { useState, useEffect, useMemo } from "react";
import { AppHeader } from "./components/layout/AppHeader";
import { PracticeDeskView } from "./views/PracticeDeskView";
import { DataIntakeView } from "./views/DataIntakeView";
import { AuditLedgerView } from "./views/AuditLedgerView";
import { ReconciliationView } from "./views/ReconciliationView";
import { ReviewAcceptModal } from "./components/modals/ReviewAcceptModal";
import type {
  ActiveTab,
  UserRole,
  RegionInputRow,
  DecisionReceipt,
} from "./types";
import { BASE_REGIONS } from "./lib/scenarios";
import { allocateFairness } from "@fairshare/domain";
import { computeSha256Fingerprint } from "./lib/crypto";

// Initial seed receipts representing r1 -> r4
const INITIAL_RECEIPTS: DecisionReceipt[] = [
  {
    receiptId: "rcpt_1a9b2c3d",
    periodId: "p1",
    revision: 1,
    actorId: "usr_coord_1",
    actorName: "Swayam",
    actorRole: "coordinator",
    timestampUTC: "2026-11-09T08:00:00Z",
    timestampIST: "09 Nov 2026, 13:30:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min v3.1 (Integer BigInt)",
    changeJustification: "Initial baseline food allocation plan for Week 46.",
    canonicalPayloadHash: "8f4a13b6d27e95c01b44d34e9e0fa958a4361287c8e54736f9872514d3b6a931",
    stagedOverrides: {
      capacityOverrides: {},
      statusOverrides: {},
    },
    resultingAllocation: { A: 40, B: 40, C: 40 },
  },
  {
    receiptId: "rcpt_2e3f4a5b",
    periodId: "p1",
    revision: 2,
    actorId: "usr_coord_1",
    actorName: "Swayam",
    actorRole: "coordinator",
    timestampUTC: "2026-11-09T14:15:00Z",
    timestampIST: "09 Nov 2026, 19:45:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min v3.1 (Integer BigInt)",
    changeJustification: "Severe storm damaged warehouse access road to Center B; capacity temporarily throttled to 20.",
    canonicalPayloadHash: "c23f4b67819ad5490b83e445176ea39bf54867104b2a8f9c7356291a45d09876",
    stagedOverrides: {
      capacityOverrides: { "CTR-B": 20 },
      statusOverrides: {},
    },
    resultingAllocation: { A: 50, B: 20, C: 50 },
  },
  {
    receiptId: "rcpt_3c4d5e6f",
    periodId: "p1",
    revision: 3,
    actorId: "usr_coord_1",
    actorName: "Swayam",
    actorRole: "coordinator",
    timestampUTC: "2026-11-10T01:30:00Z",
    timestampIST: "10 Nov 2026, 07:00:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min v3.1 (Integer BigInt)",
    changeJustification: "Surge distribution of emergency ration stock while Center B access road repair works continue.",
    canonicalPayloadHash: "19d7a5b34e8f0c291847e335298a44c9b65741087d3a2f8b5c90142e76f59843",
    stagedOverrides: {
      capacityOverrides: { "CTR-B": 20 },
      statusOverrides: {},
    },
    resultingAllocation: { A: 60, B: 20, C: 60 },
  },
  {
    receiptId: "rcpt_4b5c6d7e",
    periodId: "p1",
    revision: 4,
    actorId: "usr_coord_1",
    actorName: "Swayam",
    actorRole: "coordinator",
    timestampUTC: "2026-11-10T03:00:00Z",
    timestampIST: "10 Nov 2026, 08:30:00 IST",
    algorithm: "srs-progressive-maxmin",
    algorithmVersion: "SRS Progressive Max-Min v3.1 (Integer BigInt)",
    changeJustification: "Road clearing complete; restored Center B capacity to 40 kits.",
    canonicalPayloadHash: "7b4c92a18e3d5f0412894567e98a34bc21785906d4e21f3a5b8970142c3e5678",
    stagedOverrides: {
      capacityOverrides: { "CTR-B": 40 },
      statusOverrides: {},
    },
    resultingAllocation: { A: 40, B: 40, C: 40 },
  },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("practice");
  const [currentRole, setCurrentRole] = useState<UserRole>("coordinator");

  // Authoritative Register State
  const [currentRevision, setCurrentRevision] = useState<number>(4);
  const [authoritativeStock, setAuthoritativeStock] = useState<number>(120);
  const [authoritativeRegions, setAuthoritativeRegions] = useState<RegionInputRow[]>(
    BASE_REGIONS.map((r) => ({ ...r }))
  );
  const [receipts, setReceipts] = useState<DecisionReceipt[]>(INITIAL_RECEIPTS);

  // Staged Practice Desk State
  const [stagedStock, setStagedStock] = useState<number>(120);
  const [stagedRegions, setStagedRegions] = useState<RegionInputRow[]>(
    BASE_REGIONS.map((r) => ({ ...r }))
  );

  // Measured pooler latency
  const [measuredLatencyMs, setMeasuredLatencyMs] = useState<number>(24);

  // Idempotency key tracking
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    crypto.randomUUID()
  );
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState<boolean>(false);

  // Check if staged practice desk state differs from authoritative register
  const hasStagedChanges = useMemo(() => {
    if (stagedStock !== authoritativeStock) return true;
    for (const sr of stagedRegions) {
      const ar = authoritativeRegions.find((r) => r.regionId === sr.regionId);
      if (!ar) return true;
      if (ar.capacityKits !== sr.capacityKits || ar.status !== sr.status) return true;
    }
    return false;
  }, [stagedStock, stagedRegions, authoritativeStock, authoritativeRegions]);

  // Periodic network latency ping simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setMeasuredLatencyMs(20 + Math.floor(Math.random() * 8));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Reset staged practice desk to current authoritative register state
  const handleResetToAuthoritative = () => {
    setStagedStock(authoritativeStock);
    setStagedRegions(authoritativeRegions.map((r) => ({ ...r })));
  };

  // Commit and accept plan
  const handleCommitPlan = async (justification: string, usedIdempotencyKey: string) => {
    const nextRevision = currentRevision + 1;
    const now = new Date();

    // Recompute authoritatively using SRS Progressive Max-Min
    const calculation = allocateFairness({
      periodId: "p1",
      stockKits: stagedStock,
      regions: stagedRegions,
    });

    const resultingAllocation: Record<string, number> = {};
    for (const alloc of calculation.allocations) {
      resultingAllocation[alloc.regionId] = alloc.allocatedKits;
    }

    const capacityOverrides: Record<string, number> = {};
    const statusOverrides: Record<string, "open" | "closed"> = {};
    stagedRegions.forEach((sr) => {
      const orig = authoritativeRegions.find((r) => r.regionId === sr.regionId);
      if (orig && orig.capacityKits !== sr.capacityKits) {
        capacityOverrides[sr.centerId] = sr.capacityKits;
      }
      if (orig && orig.status !== sr.status) {
        statusOverrides[sr.centerId] = sr.status;
      }
    });

    const stagedOverrides = {
      capacityOverrides,
      statusOverrides,
    };

    const payloadToHash = {
      periodId: "p1",
      revision: nextRevision,
      actorId: currentRole === "coordinator" ? "usr_coord_1" : "usr_staff_2",
      algorithm: "srs-progressive-maxmin",
      algorithmVersion: "SRS Progressive Max-Min v3.1 (Integer BigInt)",
      changeJustification: justification,
      resultingAllocation,
      stagedOverrides,
    };

    const canonicalHash = await computeSha256Fingerprint(payloadToHash);

    const newReceipt: DecisionReceipt = {
      receiptId: `rcpt_${crypto.randomUUID().slice(0, 8)}`,
      periodId: "p1",
      revision: nextRevision,
      actorId: currentRole === "coordinator" ? "usr_coord_1" : "usr_staff_2",
      actorName: currentRole === "coordinator" ? "Swayam" : currentRole === "operator" ? "Ishaan" : "Ananya",
      actorRole: currentRole,
      timestampUTC: now.toISOString(),
      timestampIST: now.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "medium",
      }) + " IST",
      algorithm: "srs-progressive-maxmin",
      algorithmVersion: "SRS Progressive Max-Min v3.1 (Integer BigInt)",
      changeJustification: justification,
      canonicalPayloadHash: canonicalHash,
      stagedOverrides,
      resultingAllocation,
    };

    // Update authoritative register state atomically
    setCurrentRevision(nextRevision);
    setAuthoritativeStock(stagedStock);
    setAuthoritativeRegions(stagedRegions.map((r) => ({ ...r })));
    setReceipts((prev) => [...prev, newReceipt]);

    // Generate fresh idempotency key for next intent
    setIdempotencyKey(crypto.randomUUID());
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 font-sans">
      <AppHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        hasStagedChanges={hasStagedChanges}
        currentRevision={currentRevision}
        measuredLatencyMs={measuredLatencyMs}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "practice" && (
          <PracticeDeskView
            confirmedStock={authoritativeStock}
            currentStock={stagedStock}
            onStockChange={setStagedStock}
            regions={stagedRegions}
            onRegionsChange={setStagedRegions}
            authoritativeRegions={authoritativeRegions}
            authoritativeStock={authoritativeStock}
            currentRevision={currentRevision}
            onOpenAcceptModal={() => setIsAcceptModalOpen(true)}
            onResetToAuthoritative={handleResetToAuthoritative}
            hasStagedChanges={hasStagedChanges}
          />
        )}

        {activeTab === "intake" && (
          <DataIntakeView
            onApplyNewInputs={(newRegions, newStock) => {
              setStagedRegions(newRegions);
              setStagedStock(newStock);
              setActiveTab("practice");
            }}
          />
        )}

        {activeTab === "receipts" && (
          <AuditLedgerView receipts={receipts} />
        )}

        {activeTab === "reconciliation" && (
          <ReconciliationView />
        )}
      </main>

      {/* Review & Accept Modal */}
      <ReviewAcceptModal
        isOpen={isAcceptModalOpen}
        onClose={() => setIsAcceptModalOpen(false)}
        onCommit={handleCommitPlan}
        currentRevision={currentRevision}
        originalRegions={authoritativeRegions}
        stagedRegions={stagedRegions}
        confirmedStock={authoritativeStock}
        currentStock={stagedStock}
        idempotencyKey={idempotencyKey}
      />
    </div>
  );
};
export default App;
