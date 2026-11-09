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
import { allocateFairness, computeBaselineAllocation } from "@fairshare/domain";
import type { RegionInputRow, AlgorithmType, RegionAllocation } from "../types";
import { SCENARIO_PRESETS, ScenarioPreset } from "../lib/scenarios";

interface PracticeDeskViewProps {
  confirmedStock: number;
  currentStock: number;
  onStockChange: (newStock: number) => void;
  regions: RegionInputRow[];
  onRegionsChange: (newRegions: RegionInputRow[]) => void;
  authoritativeRegions: RegionInputRow[];
  authoritativeStock: number;
  currentRevision: number;
  onOpenAcceptModal: () => void;
  onResetToAuthoritative: () => void;
  hasStagedChanges: boolean;
}

export const PracticeDeskView: React.FC<PracticeDeskViewProps> = ({
  confirmedStock,
  currentStock,
  onStockChange,
  regions,
  onRegionsChange,
  authoritativeRegions,
  authoritativeStock,
  currentRevision,
  onOpenAcceptModal,
  onResetToAuthoritative,
  hasStagedChanges,
}) => {
  const [selectedAlgorithm, setSelectedAlgorithm] =
    useState<AlgorithmType>("srs-progressive-maxmin");
  const [compareBaseline, setCompareBaseline] = useState<boolean>(true);

  // 1. Run live calculation on current staged inputs
  const currentAllocationResult = useMemo(() => {
    const periodInput = {
      periodId: "p1",
      stockKits: currentStock,
      regions,
    };
    if (selectedAlgorithm === "srs-progressive-maxmin") {
      return allocateFairness(periodInput);
    }
    return computeBaselineAllocation(periodInput);
  }, [currentStock, regions, selectedAlgorithm]);

  // Baseline allocation for side-by-side comparison
  const baselineComparisonResult = useMemo(() => {
    return computeBaselineAllocation({
      periodId: "p1",
      stockKits: currentStock,
      regions,
    });
  }, [currentStock, regions]);

  // Authoritative allocation (the benchmark)
  const authoritativeResult = useMemo(() => {
    return allocateFairness({
      periodId: "p1",
      stockKits: authoritativeStock,
      regions: authoritativeRegions,
    });
  }, [authoritativeStock, authoritativeRegions]);

  // Key performance metrics
  const totalDemand = useMemo(
    () => regions.reduce((sum, r) => sum + r.demandKits, 0),
    [regions]
  );
  const totalAllocated = currentAllocationResult.totalAllocatedKits;
  const totalUnmet = Math.max(0, totalDemand - totalAllocated);
  const activeCentersCount = regions.filter((r) => r.status === "open" && r.capacityKits > 0).length;

  // Impact analysis (Before vs. After)
  const impactAnalysis = useMemo(() => {
    const authMap = new Map(authoritativeResult.allocations.map((a) => [a.regionId, a.allocatedKits]));
    const currMap = new Map(currentAllocationResult.allocations.map((a) => [a.regionId, a.allocatedKits]));

    const deltas: {
      regionId: string;
      regionName: string;
      demand: number;
      before: number;
      after: number;
      delta: number;
      beforeCov: number;
      afterCov: number;
    }[] = [];

    regions.forEach((r) => {
      const b = authMap.get(r.regionId) || 0;
      const a = currMap.get(r.regionId) || 0;
      deltas.push({
        regionId: r.regionId,
        regionName: r.regionName,
        demand: r.demandKits,
        before: b,
        after: a,
        delta: a - b,
        beforeCov: r.demandKits > 0 ? (b / r.demandKits) * 100 : 0,
        afterCov: r.demandKits > 0 ? (a / r.demandKits) * 100 : 0,
      });
    });

    const beforeAvgCov =
      deltas.reduce((sum, d) => sum + d.beforeCov, 0) / (deltas.length || 1);
    const afterAvgCov =
      deltas.reduce((sum, d) => sum + d.afterCov, 0) / (deltas.length || 1);

    const beforeMinCov = Math.min(...deltas.map((d) => d.beforeCov));
    const afterMinCov = Math.min(...deltas.map((d) => d.afterCov));

    return {
      deltas,
      beforeAvgCov,
      afterAvgCov,
      beforeMinCov,
      afterMinCov,
    };
  }, [authoritativeResult, currentAllocationResult, regions]);

  // Handle center capacity slider
  const handleCapacityChange = (regionId: string, newCapacity: number) => {
    onRegionsChange(
      regions.map((r) =>
        r.regionId === regionId ? { ...r, capacityKits: newCapacity } : r
      )
    );
  };

  // Handle center operating status toggle
  const handleStatusToggle = (regionId: string) => {
    onRegionsChange(
      regions.map((r) =>
        r.regionId === regionId
          ? {
              ...r,
              status: r.status === "open" ? "closed" : "open",
              capacityKits: r.status === "open" ? 0 : 40,
            }
          : r
      )
    );
  };

  // Load deterministic preset
  const applyPreset = (preset: ScenarioPreset) => {
    onStockChange(preset.input.stockKits);
    onRegionsChange(preset.input.regions.map((r) => ({ ...r })));
  };

  const isSurge = currentStock > confirmedStock;

  return (
    <div className="space-y-6 pb-20">
      {/* 1. TOP KPI RIBBON (Physical vs Staged) */}
      <div className="bg-white rounded-xl border border-zinc-200 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 shadow-sm">
        {/* KPI 1: Confirmed Stock */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Confirmed Stock
            </span>
            <Package className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-zinc-900">{confirmedStock}</span>
            <span className="text-xs text-zinc-500">kits in warehouse</span>
          </div>
          {isSurge ? (
            <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 w-fit">
              +{currentStock - confirmedStock} Hypothetical Surge
            </span>
          ) : (
            <span className="mt-2 text-[11px] text-zinc-400">Authoritative physical inventory</span>
          )}
        </div>

        {/* KPI 2: Plan Reserved */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Plan Reserved
            </span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-emerald-700">{totalAllocated}</span>
            <span className="text-xs text-zinc-500">of {currentStock} kits</span>
          </div>
          <div className="mt-2 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (totalAllocated / (currentStock || 1)) * 100)}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Unmet Demand */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Unmet Need
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-rose-600">{totalUnmet}</span>
            <span className="text-xs text-zinc-500">shortfall ({totalDemand} total need)</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400">
            {((totalAllocated / (totalDemand || 1)) * 100).toFixed(1)}% program coverage
          </span>
        </div>

        {/* KPI 4: Operational Centers */}
        <div className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Distribution Network
            </span>
            <Building className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-zinc-900">
              {activeCentersCount} / {regions.length}
            </span>
            <span className="text-xs text-zinc-500">centers active</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400">
            {regions.length - activeCentersCount > 0
              ? `${regions.length - activeCentersCount} emergency closed`
              : "All distribution nodes online"}
          </span>
        </div>
      </div>

      {/* 2. ALGORITHM BAR & CONTROLS */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Scale className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Allocation Policy Engine</h2>
            <p className="text-xs text-zinc-500">
              Exact integer arithmetic (BigInt cross-products); decimals are display-only.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Policy selector */}
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50 text-xs font-medium">
            <button
              onClick={() => setSelectedAlgorithm("srs-progressive-maxmin")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                selectedAlgorithm === "srs-progressive-maxmin"
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              SRS Progressive Max-Min (Primary Policy)
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
            <span>Compare with Hamilton baseline</span>
          </label>
        </div>
      </div>

      {/* 3. HERO COMPONENT: ALLOCATION MATRIX */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Regional Allocation Matrix</h3>
            <p className="text-xs text-zinc-500">
              Live practice preview recalculating in &lt;16ms on main thread.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-500 bg-zinc-100 px-2 py-1 rounded border border-zinc-200">
            {currentAllocationResult.allocations.length} Regions Assigned
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Center Node</th>
                <th className="py-3 px-4 font-mono text-right">Demand</th>
                <th className="py-3 px-4 font-mono text-right">Capacity</th>
                <th className="py-3 px-4 font-mono text-right font-bold text-zinc-900">
                  Allocated Kits
                </th>
                <th className="py-3 px-4 font-mono text-right">Coverage</th>
                {compareBaseline && (
                  <th className="py-3 px-4 font-mono text-right text-zinc-500">
                    Hamilton Baseline
                  </th>
                )}
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-sans">
              {currentAllocationResult.allocations.map((alloc) => {
                const reg = regions.find((r) => r.regionId === alloc.regionId)!;
                const baseAlloc = baselineComparisonResult.allocations.find(
                  (b) => b.regionId === alloc.regionId
                );

                const isClosed = reg.status === "closed" || reg.capacityKits === 0;
                const isFull = alloc.allocatedKits >= reg.demandKits && reg.demandKits > 0;
                const isCapped = alloc.boundByCapacity;

                return (
                  <tr
                    key={alloc.regionId}
                    className={`hover:bg-zinc-50/70 transition-colors ${
                      isClosed ? "bg-zinc-50/40 text-zinc-400" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-900">{reg.regionName}</div>
                      <div className="text-xs text-zinc-400 font-mono">ID: {reg.regionId}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs text-zinc-700">{reg.centerId}</div>
                      <div className="text-[11px] text-zinc-400">
                        {isClosed ? "Offline" : "Operational"}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-zinc-700">
                      {reg.demandKits}
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-zinc-700">
                      {reg.capacityKits}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-bold text-base text-zinc-900">
                      {alloc.allocatedKits}
                    </td>
                    <td className="py-3 px-4 font-mono text-right">
                      {alloc.coverage !== null ? (
                        <div>
                          <span className="font-semibold text-zinc-900">
                            {(alloc.coverage * 100).toFixed(1)}%
                          </span>
                          <span className="text-xs text-zinc-400 ml-1.5">
                            ({alloc.allocatedKits}/{reg.demandKits})
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">N/A</span>
                      )}
                    </td>
                    {compareBaseline && (
                      <td className="py-3 px-4 font-mono text-right text-xs text-zinc-500">
                        {baseAlloc?.allocatedKits ?? 0} kits
                        {baseAlloc && baseAlloc.allocatedKits !== alloc.allocatedKits && (
                          <span className="ml-1 text-[11px] text-emerald-600 font-semibold">
                            (diff: {alloc.allocatedKits - baseAlloc.allocatedKits})
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-3 px-4 text-center">
                      {isClosed ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          Unserviceable (Closed)
                        </span>
                      ) : isFull ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          100% Fulfilled
                        </span>
                      ) : isCapped ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          Capacity Bound
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
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

      {/* 4. PROMINENT ALLOCATION IMPACT SECTION (Before vs. After) */}
      {hasStagedChanges && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  Allocation Impact Comparison (Revision r{currentRevision} vs. Staged Preview)
                </h3>
                <p className="text-xs text-zinc-500">
                  Explains who gained, who lost, and equity shifts under proposed constraint modifications.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
              Local Staged Preview
            </span>
          </div>

          {/* Region-by-region impact comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {impactAnalysis.deltas.map((d) => (
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
                    <span className="text-xs text-zinc-400 block">Original (r{currentRevision})</span>
                    <span className="text-sm font-bold font-mono text-zinc-700">{d.before} kits</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-400" />
                  <div>
                    <span className="text-xs text-zinc-400 block">Staged Preview</span>
                    <span className="text-sm font-bold font-mono text-zinc-900">{d.after} kits</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 block">Change</span>
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

          {/* Equity shifts summary bar */}
          <div className="flex flex-wrap gap-4 pt-2 text-xs border-t border-zinc-100">
            <div className="flex items-center space-x-1.5">
              <span className="text-zinc-500">Average Coverage:</span>
              <span className="font-mono font-semibold text-zinc-800">
                {impactAnalysis.beforeAvgCov.toFixed(1)}% → {impactAnalysis.afterAvgCov.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-zinc-500">Minimum Coverage:</span>
              <span className="font-mono font-semibold text-zinc-800">
                {impactAnalysis.beforeMinCov.toFixed(1)}% → {impactAnalysis.afterMinCov.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. INTERACTIVE CONSTRAINT CONTROLS & PRESETS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sub-Panel: Scenario Reset Presets */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-zinc-900">Deterministic Scenario Presets</h3>
          </div>
          <p className="text-xs text-zinc-500">
            Resets all variables to verified starting states. Never inherits accidental slider mutations.
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
                  <span className="font-mono text-[11px] text-zinc-400">
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
              <h3 className="text-sm font-semibold text-zinc-900">
                Distribution Center Capacity Constraints
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono">
              Non-double-counting reservation accounting
            </span>
          </div>

          <div className="space-y-4">
            {regions.map((reg) => {
              const currentAlloc =
                currentAllocationResult.allocations.find((a) => a.regionId === reg.regionId)
                  ?.allocatedKits || 0;
              const committed = reg.priorDispatchedKits;
              const undispatchedReservation = Math.max(0, currentAlloc - committed);
              const remainingAllocatable = Math.max(
                0,
                reg.capacityKits - committed - undispatchedReservation
              );

              return (
                <div
                  key={reg.regionId}
                  className="p-4 rounded-lg border border-zinc-200 bg-zinc-50/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-xs text-zinc-900 flex items-center space-x-2">
                        <span>{reg.regionName}</span>
                        <span className="font-mono text-zinc-400">({reg.centerId})</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        Target Demand: {reg.demandKits} kits
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleStatusToggle(reg.regionId)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          reg.status === "open"
                            ? "bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200"
                            : "bg-rose-50 text-rose-700 border-rose-200"
                        }`}
                      >
                        {reg.status === "open" ? "Active" : "Closed (Capacity 0)"}
                      </button>
                    </div>
                  </div>

                  {/* Slider Control */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-600">Configured Handling Capacity:</span>
                      <span className="font-mono font-bold text-zinc-900">
                        {reg.capacityKits} kits
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      disabled={reg.status === "closed"}
                      value={reg.capacityKits}
                      onChange={(e) =>
                        handleCapacityChange(reg.regionId, parseInt(e.target.value, 10))
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
                      <span className="text-zinc-400 block text-[10px]">Reserved</span>
                      <span className="font-semibold text-emerald-700">{undispatchedReservation}</span>
                    </div>
                    <div className="p-1.5 bg-white rounded border border-zinc-200">
                      <span className="text-zinc-400 block text-[10px]">Remaining</span>
                      <span className="font-semibold text-zinc-900">{remainingAllocatable}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. STAGED ACTIONS BAR (BOTTOM DOCK) */}
      {hasStagedChanges && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-zinc-200 py-3.5 px-4 sm:px-6 lg:px-8 shadow-lg z-30 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-medium text-zinc-900">
              Uncommitted Practice Preview staged vs Revision r{currentRevision}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onResetToAuthoritative}
              className="inline-flex items-center px-3.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Discard Overrides
            </button>
            <button
              onClick={onOpenAcceptModal}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Review & Accept Plan (r{currentRevision + 1})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
