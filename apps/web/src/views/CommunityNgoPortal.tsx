import React, { useState } from "react";
import {
  HeartHandshake,
  Package,
  Users,
  Clock,
  CheckCircle2,
  Send,
  Truck,
  Scale,
  ShieldCheck,
  AlertCircle,
  MapPin,
  LogOut,
} from "lucide-react";
import { useAuth, PRESET_PROFILES } from "../context/AuthContext";
import { useOperational } from "../context/OperationalContext";
import { FairShareLogo } from "../components/brand/FairShareLogo";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

export const CommunityNgoPortal: React.FC = () => {
  const { currentUser, logout, switchProfile } = useAuth();
  const { stagedRegions, updateRegionDemand, currentPlan, movements } = useOperational();

  const regionId = currentUser?.assignedRegionId || "B";
  const myRegion = stagedRegions.find((r) => r.regionId === regionId) || stagedRegions[0];
  const myAllocation = currentPlan.find((p) => p.regionId === regionId);

  // Form state for updating community demand
  const [demandInput, setDemandInput] = useState<number>(myRegion?.demandKits || 60);
  const [familiesCount, setFamiliesCount] = useState<number>(1250);
  const [urgencyLevel, setUrgencyLevel] = useState<"standard" | "urgent">("standard");
  const [requestNotes, setRequestNotes] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // Dispatches for this region's assigned center
  const assignedCenterId = myRegion?.assignedCenterId || "CTR-B";
  const myDeliveries = movements.filter((m) => m.centerId === assignedCenterId);

  const handleSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    updateRegionDemand(regionId, demandInput);
    setIsSubmitted(true);

    if (isSupabaseConfigured) {
      void (async () => {
        try {
          const { error } = await supabase.from("community_demands").insert({
            region_id: regionId,
            cycle_id: "2026-W46",
            family_headcount: familiesCount,
            requested_kits: demandInput,
            urgency: urgencyLevel,
            notes: requestNotes.trim(),
            submitted_by: currentUser?.name || "Community Aid Partner",
          });
          if (error) console.warn("[Supabase Sync] community_demands insert error:", error.message);
          else console.info("[Supabase Sync] Community request stored in Supabase");
        } catch (err) {
          console.warn("[Supabase Sync] Network error:", err);
        }
      })();
    }

    setTimeout(() => setIsSubmitted(false), 4000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Top NGO Navigation Bar */}
      <header className="bg-white border-b border-zinc-200 h-16 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <FairShareLogo size="sm" showTagline={false} />
          <span className="h-4 w-px bg-zinc-200 mx-1" />
          <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-mono">
            Community Aid Portal
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-zinc-900">{currentUser?.name}</div>
            <div className="text-[10px] text-zinc-500">{currentUser?.agency}</div>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={currentUser?.id}
              onChange={(e) => switchProfile(e.target.value)}
              className="text-xs py-1 px-2 border border-zinc-300 rounded-lg bg-white text-zinc-700 focus:outline-none"
            >
              {PRESET_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role.replace("_", " ")})
                </option>
              ))}
            </select>

            <button
              onClick={logout}
              className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-zinc-100"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {/* Community Header Card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Ward ID: {myRegion?.regionId}
              </span>
              <span className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                NGO Partner: {currentUser?.agency}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-950 font-sans mt-2">
              {myRegion?.regionName}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              Assigned Distribution Depot: {myAllocation?.centerName} ({assignedCenterId})
            </p>
          </div>

          <div className="text-right bg-emerald-50 p-4 rounded-xl border border-emerald-200 shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
              Your Allocated Food Quota
            </span>
            <div className="flex items-baseline justify-end space-x-1.5 mt-1">
              <span className="text-3xl font-extrabold font-mono text-emerald-700">
                {myAllocation?.allocatedKits || 40}
              </span>
              <span className="text-xs text-emerald-600 font-medium">kits approved</span>
            </div>
            <span className="text-[10px] text-emerald-700 block mt-0.5">
              {myAllocation?.coveragePercentage ? myAllocation.coveragePercentage.toFixed(1) : "66.7"}% of current verified demand
            </span>
          </div>
        </div>

        {/* 2-Column Grid: Submit Demand & Delivery Tracking */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Action 1: Submit Food Demand Form */}
          <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
              <HeartHandshake className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-sans">
                Submit Community Food Aid Request
              </h2>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Report your field census headcount and estimated family emergency food kit requirements. The State Allocation Engine re-evaluates quotas using Progressive Max-Min fairness to protect vulnerable households.
            </p>

            <form onSubmit={handleSubmitRequest} className="space-y-4 pt-1 text-xs">
              <div>
                <label className="font-semibold text-zinc-800 block mb-1">
                  Families / Households in Need
                </label>
                <input
                  type="number"
                  min="1"
                  value={familiesCount}
                  onChange={(e) => setFamiliesCount(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">
                  Requested Standard Food Kits (15kg family ration)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={demandInput}
                    onChange={(e) => setDemandInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-32 px-3 py-2 border border-zinc-300 rounded-lg text-base font-mono font-bold text-zinc-900 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-zinc-500 font-medium">Standard Kits</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">
                  Urgency Classification
                </label>
                <select
                  value={urgencyLevel}
                  onChange={(e) => setUrgencyLevel(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="standard">Standard Weekly Relief Ration</option>
                  <option value="urgent">Critical Emergency (Flooding / Evacuee Influx)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">
                  Ground Assessment Notes
                </label>
                <textarea
                  rows={2}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g. Additional vulnerable families arrived from Sector 4 transit camp; need dry ration kits."
                  className="w-full p-2.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-800"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                {isSubmitted ? (
                  <span className="font-semibold text-emerald-700 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                    Request registered in state census!
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400">Directly syncs to State Allocations</span>
                )}

                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm transition-colors"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Submit Aid Request
                </button>
              </div>
            </form>
          </div>

          {/* Right Card: Fairness Transparency & Inbound Deliveries */}
          <div className="space-y-6">
            {/* Transparency Card */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-3">
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
                <Scale className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-sans">
                  FairShare Equity Guarantee
                </h3>
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Your allocation is calculated by the <strong>Progressive Max-Min fairness engine</strong>. During supply scarcity, the system elevates the most underserved communities first, guaranteeing that no vulnerable ward is deprived while another is over-served.
              </p>
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs text-zinc-500 space-y-1">
                <div className="flex justify-between">
                  <span>Census Demand:</span>
                  <span className="font-bold text-zinc-900">{myRegion?.demandKits} kits</span>
                </div>
                <div className="flex justify-between">
                  <span>Approved Share:</span>
                  <span className="font-bold text-emerald-700">{myAllocation?.allocatedKits} kits</span>
                </div>
                <div className="flex justify-between">
                  <span>Equitable Coverage:</span>
                  <span className="font-bold text-zinc-900">
                    {myAllocation?.coveragePercentage ? myAllocation.coveragePercentage.toFixed(1) : "66.7"}%
                  </span>
                </div>
              </div>
            </div>

            {/* Inbound Truck Waybills */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-3">
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
                <Truck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-sans">
                  Inbound Food Dispatches
                </h3>
              </div>

              {myDeliveries.length > 0 ? (
                <div className="space-y-2 text-xs">
                  {myDeliveries.map((d) => (
                    <div key={d.recordId} className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 flex justify-between items-center">
                      <div>
                        <div className="font-mono font-bold text-zinc-900">{d.waybillNumber}</div>
                        <div className="text-[11px] text-zinc-500">{d.carrierOrAgent}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{d.timestampIST}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm text-emerald-700 block font-mono">
                          {d.quantityKits} kits
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {d.movementType === "receipt" ? "Arrived at Depot" : "En Route"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic py-2">
                  No active dispatches currently on the road for this depot.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
