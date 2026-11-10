import React, { useState } from "react";
import {
  HeartHandshake,
  Users,
  Package,
  Send,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  ShieldCheck,
  Building2,
  Layers,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useOperational } from "../context/OperationalContext";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export const CommunityRequestView: React.FC = () => {
  const { currentUser } = useAuth();
  const { stagedRegions, updateRegionDemand, currentPlan } = useOperational();

  const targetRegionId = currentUser?.assignedRegionId || "B";
  const myRegion = stagedRegions.find((r) => r.regionId === targetRegionId) || stagedRegions[0];
  const myAllocation = currentPlan.find((p) => p.regionId === targetRegionId);

  const [headcount, setHeadcount] = useState<number>(1250);
  const [kitsNeeded, setKitsNeeded] = useState<number>(myRegion?.demandKits || 60);
  const [urgency, setUrgency] = useState<"standard" | "high" | "critical">("high");
  const [notes, setNotes] = useState<string>(
    "Monsoon flash-flood waterlogging in Low-Lying Sector 4; families stranded with no cooking fuel."
  );
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateRegionDemand(targetRegionId, kitsNeeded);
    setSubmitted(true);

    if (isSupabaseConfigured) {
      void (async () => {
        try {
          await supabase.from("demand_records").insert({
            organization_id: "10000000-0000-0000-0000-000000000001",
            region_id: targetRegionId,
            period_id: "50000000-0000-0000-0000-000000000001",
            revision: 1,
            period_revision: 1,
            quantity_kits: kitsNeeded,
            source: "NGO Field Census Telemetry",
            observed_at: new Date().toISOString(),
            provenance: "reported",
            recorded_by: "20000000-0000-0000-0000-000000000003",
          });
        } catch (err) {
          console.warn("[Supabase Sync] Demand record update:", err);
        }
      })();
    }

    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200 font-mono">
              Community Food Aid Station • Ward {targetRegionId}
            </span>
            <span className="text-xs text-zinc-400 font-mono">Cycle 2026-W46</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-950 font-sans mt-1">
            Community Food Aid & Census Intake
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Submit verified beneficiary family headcounts and emergency ration kit requirements directly into the State Fairness Engine.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-zinc-900">{currentUser?.name}</div>
            <div className="text-[10px] text-zinc-500">{currentUser?.agency}</div>
          </div>
        </div>
      </div>

      {submitted && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center space-x-3 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold block">Community Demand Updated Successfully!</span>
            <span className="text-emerald-700">
              The State Progressive Max-Min fairness engine has updated Ward {targetRegionId} allocation quota to{" "}
              <strong>{myAllocation?.allocatedKits || kitsNeeded} kits</strong>.
            </span>
          </div>
        </div>
      )}

      {/* Main Request Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <HeartHandshake className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Submit Ward {targetRegionId} Aid Requirement
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">Verified Ground Assessment</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Verified Family Headcount <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Users className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50000}
                    required
                    value={headcount}
                    onChange={(e) => setHeadcount(parseInt(e.target.value, 10) || 0)}
                    className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-zinc-900 font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">
                  Ground census conducted by volunteer network
                </span>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Standard Food Kits Required <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                    <Package className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={kitsNeeded}
                    onChange={(e) => setKitsNeeded(parseInt(e.target.value, 10) || 0)}
                    className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg text-zinc-900 font-mono text-xs focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <span className="text-[10px] text-zinc-400 mt-0.5 block">
                  15kg standard ration kit (rice, lentils, oil, salt)
                </span>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Urgency Priority Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["standard", "high", "critical"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setUrgency(lvl)}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize transition-all ${
                      urgency === lvl
                        ? lvl === "critical"
                          ? "bg-rose-50 border-rose-300 text-rose-800"
                          : lvl === "high"
                          ? "bg-amber-50 border-amber-300 text-amber-800"
                          : "bg-emerald-50 border-emerald-300 text-emerald-800"
                        : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {lvl} Priority
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Ground Situation Assessment Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe access conditions, special vulnerabilities, medical needs..."
                className="w-full p-2.5 border border-zinc-300 rounded-lg text-zinc-900 text-xs focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center px-5 py-2.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-colors"
              >
                <Send className="w-3.5 h-3.5 mr-2" />
                Submit Aid Request to State Logistics
              </button>
            </div>
          </form>
        </div>

        {/* Live Allocation Transparency Column */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5">
              <span className="font-semibold text-zinc-800">Fair Share Transparency</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Target Community Ward:</span>
                <span className="font-mono font-bold text-zinc-900">{myRegion?.regionName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Staging Logistics Depot:</span>
                <span className="font-mono text-zinc-700">Dharavi Central Node (CTR-B)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Current Aid Quota:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {myAllocation?.allocatedKits || 40} Kits
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Coverage Quotient:</span>
                <span className="font-mono font-bold text-zinc-900">
                  {myAllocation?.coveragePercentage.toFixed(1) || "66.7"}%
                </span>
              </div>
            </div>

            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5 text-[11px] text-zinc-600 leading-relaxed">
              <span className="font-semibold text-zinc-800 block">Progressive Max-Min Guarantee:</span>
              <p>
                Your community allocation is computed mathematically to maximize the minimum fulfillment across all vulnerable wards. No political discretion or favoritism can reduce this allocation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
