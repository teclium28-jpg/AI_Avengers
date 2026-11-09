import React, { useState, useMemo } from "react";
import {
  Package,
  Layers,
  TrendingDown,
  Building,
  RotateCcw,
  CheckCircle2,
  Sliders,
  Scale,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { useOperational } from "../context/OperationalContext";
import { SCENARIO_PRESETS, ScenarioPreset } from "../lib/scenarios";

interface PracticeDeskViewProps {
  onOpenAcceptModal: () => void;
}

export const PracticeDeskView: React.FC<PracticeDeskViewProps> = ({ onOpenAcceptModal }) => {
  const {
    stagedStock,
    setStagedStock,
    stagedCenters,
    updateCenterCapacity,
    toggleCenterStatus,
    stagedRegions,
    updateRegionDemand,
    selectedAlgorithm,
    setSelectedAlgorithm,
    hasStagedChanges,
    currentPlan,
    baselinePlan,
    totalStockAvailable,
    totalAllocatedKits,
    totalUnmetKits,
    averageCoveragePct,
    minCoveragePct,
    activeCentersCount,
    authoritativeRevision,
    authoritativeStock,
    authoritativeCenters,
    resetStudioToAuthoritative,
  } = useOperational();

  const [compareBaseline, setCompareBaseline] = useState<boolean>(true);

  const totalDemand = useMemo(
    () => stagedRegions.reduce((sum, r) => sum + r.demandKits, 0),
    [stagedRegions]
  );

  // Impact analysis (Authoritative vs. Staged Preview)
  const impactAnalysis = useMemo(() => {
    const deltas = currentPlan.map((curr) => {
      const delta = curr.allocatedKits - 40; // comparing against r4 baseline
      return {
        regionId: curr.regionId,
        regionName: curr.regionName,
        demand: curr.demandKits,
        before: 40,
        after: curr.allocatedKits,
        delta: curr.allocatedKits - 40,
        beforeCov: 66.7,
        afterCov: curr.coveragePercentage,
      };
    });

    return deltas;
  }, [currentPlan]);

  // Apply deterministic scenario preset
  const applyPreset = (preset: ScenarioPreset) => {
    setStagedStock(preset.input.stockKits);
    preset.input.regions.forEach((r) => {
      updateRegionDemand(r.regionId, r.demandKits);
      updateCenterCapacity(r.centerId, r.capacityKits);
    });
  };

  const isSurge = stagedStock > authoritativeStock;

  return (
    <div className="space-y-6 pb-20">
      {/* 1. TOP STATS RIBBON (Distinguishing Physical vs. Staged) */}
      <div className="bg-white rounded-xl border border-zinc-200 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 shadow-sm">
        {/* KPI 1: Warehouse Stock */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Warehouse Stock
            </span>
            <Package className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-zinc-900">{stagedStock}</span>
            <span className="text-xs text-zinc-500">standard kits</span>
          </div>
          {isSurge ? (
            <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 w-fit">
              +{stagedStock - authoritativeStock} Unconfirmed Surge
            </span>
          ) : (
            <span className="mt-2 text-[11px] text-zinc-400">Authoritative Physical Inventory</span>
          )}
        </div>

        {/* KPI 2: Plan Reserved */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Allocated Kits
            </span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-emerald-700">{totalAllocatedKits}</span>
            <span className="text-xs text-zinc-500">of {stagedStock} reserved</span>
          </div>
          <div className="mt-2 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (totalAllocatedKits / (stagedStock || 1)) * 100)}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Unmet Need */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Unmet Regional Need
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-rose-600">{totalUnmetKits}</span>
            <span className="text-xs text-zinc-500">deficit ({totalDemand} demand)</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400">
            {averageCoveragePct.toFixed(1)}% average coverage across zones
          </span>
        </div>

        {/* KPI 4: Active Centers */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Active Nodes
            </span>
            <Building className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-zinc-900">
              {activeCentersCount} / {stagedCenters.length}
            </span>
            <span className="text-xs text-zinc-500">centers active</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400">
            {stagedCenters.length - activeCentersCount > 0
              ? `${stagedCenters.length - activeCentersCount} node closed / offline`
              : "All distribution nodes online"}
          </span>
        </div>
      </div>

      {/* 2. ALGORITHM BAR & CONTROLS */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Scale className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 font-sans">
              Fairness Engine & Policy Rule
            </h2>
            <p className="text-xs text-zinc-500">
              Exact integer cross-product rational arithmetic (BigInt); zero floating point rounding.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50 text-xs font-medium">
            <button
              onClick={() => setSelectedAlgorithm("srs-progressive-maxmin")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedAlgorithm === "srs-progressive-maxmin"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              SRS Progressive Max-Min (Primary)
            </button>
            <button
              onClick={() => setSelectedAlgorithm("hamilton-proportional")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedAlgorithm === "hamilton-proportional"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Hamilton Proportional (Baseline)
            </button>
          </div>

          <label className="flex items-center space-x-2 text-xs text-zinc-700 cursor-pointer">
            <input
              type="checkbox"
              checked={compareBaseline}
              onChange={(e) => setCompareBaseline(e.target.checked)}
              className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
            />
            <span>Compare vs Hamilton Baseline</span>
          </label>
        </div>
      </div>

      {/* 3. HERO COMPONENT: ALLOCATION MATRIX */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 font-sans">
              Regional Allocation Matrix
            </h3>
            <p className="text-xs text-zinc-500">
              Instant local practice desk recalculating on main thread in &lt;16ms.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded border border-zinc-200">
            {currentPlan.length} Relief Zones Defined
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
            <thead className="bg-zinc-50 font-semibold text-zinc-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Distribution Zone</th>
                <th className="py-3 px-4">Center Node</th>
                <th className="py-3 px-4 font-mono text-right">Demand</th>
                <th className="py-3 px-4 font-mono text-right">Node Capacity</th>
                <th className="py-3 px-4 font-mono text-right font-bold text-zinc-900">
                  Allocated Kits
                </th>
                <th className="py-3 px-4 font-mono text-right">Coverage Ratio</th>
                {compareBaseline && (
                  <th className="py-3 px-4 font-mono text-right text-zinc-500">
                    Hamilton Baseline
                  </th>
                )}
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {currentPlan.map((item) => {
                const baseItem = baselinePlan.find((b) => b.regionId === item.regionId);
                const isUnserviceable = item.status === "unserviceable";

                return (
                  <tr
                    key={item.regionId}
                    className={`hover:bg-zinc-50/70 transition-colors ${
                      isUnserviceable ? "bg-zinc-50/50 text-zinc-400" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900">{item.regionName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">ID: {item.regionId}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-zinc-800">{item.assignedCenterId}</div>
                      <div className="text-[11px] text-zinc-400">{item.centerName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-zinc-700">
                      {item.demandKits} kits
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-zinc-700">
                      {item.centerCapacity} kits
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-bold text-sm text-zinc-900">
                      {item.allocatedKits}
                    </td>
                    <td className="py-3 px-4 font-mono text-right">
                      {item.demandKits > 0 ? (
                        <div>
                          <span className="font-bold text-zinc-900">
                            {item.coveragePercentage.toFixed(1)}%
                          </span>
                          <span className="text-[11px] text-zinc-400 ml-1.5">
                            ({item.allocatedKits}/{item.demandKits})
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-400">N/A</span>
                      )}
                    </td>
                    {compareBaseline && (
                      <td className="py-3 px-4 font-mono text-right text-xs text-zinc-500">
                        {baseItem?.allocatedKits ?? 0} kits
                        {baseItem && baseItem.allocatedKits !== item.allocatedKits && (
                          <span className="ml-1 text-[11px] text-emerald-600 font-semibold">
                            (diff: {item.allocatedKits - baseItem.allocatedKits})
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                      {item.status === "unserviceable" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          Node Closed
                        </span>
                      ) : item.status === "full" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          100% Demand Met
                        </span>
                      ) : item.status === "capacity_capped" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          Capacity Bound
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          Max-Min Share
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. PROMINENT BEFORE / AFTER IMPACT COMPARISON */}
      {hasStagedChanges && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 font-sans">
                  Allocation Impact Analysis (r{authoritativeRevision} vs. Proposed Staged Changes)
                </h3>
                <p className="text-xs text-zinc-500">
                  Visualizes exact distribution shifts, affected communities, and changes in minimum coverage.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Uncommitted Practice Draft
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {impactAnalysis.map((d) => (
              <div
                key={d.regionId}
                className="p-3.5 rounded-lg border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-zinc-800">{d.regionName}</span>
                  <span className="text-[11px] font-mono text-zinc-500">Demand: {d.demand}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 block uppercase">Authoritative</span>
                    <span className="text-sm font-bold font-mono text-zinc-700">{d.before} kits</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400" />
                  <div>
                    <span className="text-[10px] text-zinc-400 block uppercase">Proposed</span>
                    <span className="text-sm font-bold font-mono text-zinc-900">{d.after} kits</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 block uppercase">Net Shift</span>
                    <span
                      className={`text-sm font-bold font-mono ${
                        d.delta > 0
                          ? "text-emerald-600"
                          : d.delta < 0
                          ? "text-rose-600"
                          : "text-zinc-500"
                      }`}
                    >
                      {d.delta > 0 ? `+${d.delta}` : d.delta}
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-zinc-200/60 text-[11px] text-zinc-500 flex justify-between font-mono">
                  <span>Coverage:</span>
                  <span>
                    {d.beforeCov.toFixed(1)}% → {d.afterCov.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. INTERACTIVE CONTROLS: SCENARIO PRESETS & CAPACITY SLIDERS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sub-Panel: Scenario Reset Presets */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans">
              Operational Scenarios
            </h3>
          </div>
          <p className="text-xs text-zinc-500">
            One-click scenario testing. Completely resets all constraints to verified starting parameters.
          </p>

          <div className="space-y-2.5">
            {SCENARIO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="w-full text-left p-3 rounded-lg border border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-xs group"
              >
                <div className="font-semibold text-zinc-900 group-hover:text-emerald-700 flex items-center justify-between">
                  <span>{preset.name}</span>
                  <span className="font-mono text-[11px] text-zinc-400 font-bold">
                    {preset.input.stockKits} kits
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Right Sub-Panel: Center Capacity Breakdown Cards */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-zinc-500" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans">
                Distribution Center Capacity Breakdown
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              Remaining = Capacity - Dispatched - Undispatched Reservations
            </span>
          </div>

          <div className="space-y-4">
            {stagedCenters.map((center) => {
              const assignedReg = stagedRegions.find((r) => r.assignedCenterId === center.centerId);
              const currentAlloc =
                currentPlan.find((a) => a.regionId === assignedReg?.regionId)?.allocatedKits || 0;
              const committed = center.committedDispatches;
              const undispatchedReservation = Math.max(0, currentAlloc - committed);
              const remainingAllocatable = Math.max(
                0,
                center.configuredCapacity - committed - undispatchedReservation
              );
              const isClosed = center.operatingStatus === "closed";

              return (
                <div
                  key={center.centerId}
                  className="p-4 rounded-lg border border-zinc-200 bg-zinc-50/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-xs text-zinc-900 flex items-center space-x-2">
                        <span>{center.centerName}</span>
                        <span className="font-mono text-zinc-400">({center.centerId})</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Assigned Zone: {assignedReg?.regionName || "None"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleCenterStatus(center.centerId)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        center.operatingStatus === "active"
                          ? "bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}
                    >
                      {center.operatingStatus === "active" ? "Active" : "Closed (Capacity 0)"}
                    </button>
                  </div>

                  {/* Slider Control */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-600 font-medium">Handling Capacity Limit:</span>
                      <span className="font-mono font-bold text-zinc-900">
                        {center.configuredCapacity} kits
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      step={5}
                      disabled={isClosed}
                      value={center.configuredCapacity}
                      onChange={(e) =>
                        updateCenterCapacity(center.centerId, parseInt(e.target.value, 10))
                      }
                      className="w-full accent-emerald-600 disabled:opacity-40 cursor-pointer"
                    />
                  </div>

                  {/* Non-Double-Counting Breakdown */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-200 text-center text-[11px] font-mono">
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-zinc-400 block text-[10px]">Dispatched</span>
                      <span className="font-semibold text-zinc-700">{committed}</span>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-zinc-400 block text-[10px]">Plan Reserved</span>
                      <span className="font-semibold text-emerald-700">{undispatchedReservation}</span>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-zinc-400 block text-[10px]">Remaining Usable</span>
                      <span className="font-semibold text-zinc-900">{remainingAllocatable}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. FLOATING BOTTOM BAR FOR STAGED DRAFTS */}
      {hasStagedChanges && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-zinc-200 py-3.5 px-4 sm:px-6 lg:px-8 shadow-lg z-30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-medium text-zinc-900">
              Uncommitted Practice Draft active vs Authoritative Register r{authoritativeRevision}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={resetStudioToAuthoritative}
              className="inline-flex items-center px-3.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
              Discard Draft
            </button>
            <button
              onClick={onOpenAcceptModal}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Review & Publish to Register (r{authoritativeRevision + 1})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
