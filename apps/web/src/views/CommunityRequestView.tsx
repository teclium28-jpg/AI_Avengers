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

export const CommunityRequestView: React.FC = () => {
  const { currentUser } = useAuth();
  const { authoritativeRegions, authoritativePlan, authoritativeCenters, aidRequests, submitAidRequest } = useOperational();

  const targetRegionId = currentUser?.assignedRegionId || "B";
  // Partners see the PUBLISHED allocation, not someone's unpublished preview.
  const myRegion = authoritativeRegions.find((r) => r.regionId === targetRegionId);
  const myAllocation = authoritativePlan.rows.find((p) => p.regionId === targetRegionId);
  const myCenter = authoritativeCenters.find((c) => c.centerId === myRegion?.assignedCenterId);
  const myRequests = aidRequests.filter((r) => r.regionId === targetRegionId);

  const [headcount, setHeadcount] = useState<string>("1250");
  const [kitsNeeded, setKitsNeeded] = useState<string>(String(myRegion?.demandKits ?? 60));
  const [urgency, setUrgency] = useState<"standard" | "high" | "critical">("high");
  const [notes, setNotes] = useState<string>(
    "Monsoon flash-flood waterlogging in Low-Lying Sector 4; families stranded with no cooking fuel."
  );
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(false);
    const kits = Number(kitsNeeded.trim());
    const families = Number(headcount.trim());
    if (!myRegion) {
      setError(`Ward ${targetRegionId} is not part of the current published plan.`);
      return;
    }
    if (!/^\d+$/.test(kitsNeeded.trim()) || kits < 1 || kits > 100000) {
      setError("Kits required must be a whole number between 1 and 100,000.");
      return;
    }
    if (!/^\d+$/.test(headcount.trim()) || families < 1) {
      setError("Family headcount must be a whole number of at least 1.");
      return;
    }
    setError(null);
    // A request never changes demand directly: a coordinator reviews it first.
    submitAidRequest({
      regionId: targetRegionId,
      requestedKits: kits,
      headcount: families,
      urgency,
      notes: notes.trim(),
      submittedBy: `${currentUser?.name ?? "Community partner"} (${currentUser?.agency ?? "NGO"})`,
    });
    setSubmitted(true);
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
            <span className="font-bold block">Request submitted for review</span>
            <span className="text-emerald-700">
              Your request for Ward {targetRegionId} ({kitsNeeded} kits) was sent to the State coordinator. The allocation changes only after a coordinator reviews it and publishes a new revision.
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
            {error && <p role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">{error}</p>}
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
                    onChange={(e) => setHeadcount(e.target.value)}
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
                    max={100000}
                    required
                    value={kitsNeeded}
                    onChange={(e) => setKitsNeeded(e.target.value)}
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
                <span className="font-mono text-zinc-700">{myCenter ? `${myCenter.centerName} (${myCenter.centerId})` : "Not assigned"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Current Aid Quota:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {myAllocation ? `${myAllocation.allocatedKits} Kits` : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Coverage Quotient:</span>
                <span className="font-mono font-bold text-zinc-900">
                  {myAllocation && myAllocation.demandKits > 0 ? `${myAllocation.coveragePercentage.toFixed(1)}%` : "N/A"}
                </span>
              </div>
            </div>

            {myRequests.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-semibold text-zinc-800 block text-[11px] uppercase tracking-wider">Your requests</span>
                <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg text-[11px]">
                  {myRequests.slice(0, 5).map((r) => (
                    <li key={r.requestId} className="p-2 flex justify-between">
                      <span>{r.requestedKits} kits · {new Date(r.submittedAtUTC).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                      <span className="font-semibold capitalize">{r.status === "staged" ? "Accepted for planning" : r.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
