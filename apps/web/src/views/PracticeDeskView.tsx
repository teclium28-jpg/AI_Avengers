import React, { useState, useMemo } from "react";
import {
  Package,
  Layers,
  TrendingDown,
  Building,
  CheckCircle2,
  Sliders,
  Scale,
  Search,
  Filter,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  Lock,
  ChevronDown,
} from "lucide-react";
import { useOperational } from "../context/OperationalContext";
import { useAuth } from "../context/AuthContext";
import { formatPct } from "../lib/planning";

interface PracticeDeskViewProps {
  onOpenAcceptModal: () => void;
}

export const PracticeDeskView: React.FC<PracticeDeskViewProps> = ({ onOpenAcceptModal }) => {
  const { currentUser } = useAuth();
  const role = currentUser?.role || "admin";

  const {
    stagedStock,
    setStagedStock,
    stagedConfirmedStock,
    hypotheticalStockKits,
    stagedRegions,
    updateCenterCapacity,
    selectedAlgorithm,
    setSelectedAlgorithm,
    stagedSource,
    stagedCommitted,
    currentPlan,
    baselinePlan,
    planIssues,
    totalAllocatedKits,
    totalDemandKits,
    totalUnmetKits,
    averageCoveragePct,
    minCoveragePct,
    authoritativeRevision,
    resetStudioToAuthoritative,
    applyScenario,
  } = useOperational();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "deficit" | "bound" | "closed">("all");
  const [editingCapacityId, setEditingCapacityId] = useState<string | null>(null);
  const [tempCapacityValue, setTempCapacityValue] = useState<string>("0");
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [showStockModal, setShowStockModal] = useState(false);
  const [tempStockInput, setTempStockInput] = useState(stagedStock.toString());
  const [stockError, setStockError] = useState<string | null>(null);

  const isStatewide = stagedRegions.length > 10;
  const switchToStatewide = () => applyScenario("india-operation");
  const switchToMetropolitan = () => resetStudioToAuthoritative();
  const baselineKits = useMemo(() => new Map(baselinePlan.map((b) => [b.regionId, b.allocatedKits])), [baselinePlan]);
  // Coordinators edit any center; an operator reports usable capacity for their own center only.
  const canEditCapacity = (centerId: string) =>
    role === "admin" || (role === "hub_operator" && currentUser?.assignedFacilityId === centerId);

  // Filtered plan rows
  const filteredPlan = useMemo(() => {
    return currentPlan.filter((item) => {
      // Search
      const matchesSearch =
        item.regionName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.regionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.centerName.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Filter
      if (filterMode === "deficit") return item.status === "partial" || item.status === "capacity_capped" || item.status === "unserviceable";
      if (filterMode === "bound") return item.status === "capacity_capped";
      if (filterMode === "closed") return item.status === "unserviceable";
      return true;
    });
  }, [currentPlan, searchQuery, filterMode]);

  const unallocatedStock = Math.max(0, stagedStock - totalAllocatedKits);

  const handleSaveCapacity = (centerId: string) => {
    const text = tempCapacityValue.trim();
    const error = /^\d+$/.test(text) ? updateCenterCapacity(centerId, Number(text)) : "Capacity must be a whole number of kits.";
    setCapacityError(error);
    if (!error) setEditingCapacityId(null);
  };

  const presetButtons = [
    { id: "golden-baseline", label: "1. Golden baseline" },
    { id: "b-throttled", label: "2. B throttled to 20" },
    { id: "stock-surge", label: "3. Stock surge +20" },
    { id: "restore-b", label: "4. Restore B" },
    { id: "emergency-closure", label: "5. Close center C" },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Scope & Control Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Relief Scope
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {isStatewide ? "Statewide Disaster Response Grid" : "Metropolitan 3-Zone Sector"}
            </span>
            <span className="h-3 w-px bg-zinc-200" />
            <span className="text-[11px] font-mono text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
              Provenance: Simulated Fixture
            </span>
          </div>
          <h1 className="text-xl font-bold text-zinc-950 font-sans mt-1">
            Food Aid Allocation Planner
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Progressive Max-Min allocation engine automatically guarantees equitable food distribution across all active relief centers.
          </p>
        </div>

        {/* Scope switcher & Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50 text-xs font-medium">
            <button
              onClick={switchToStatewide}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                isStatewide
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Statewide (30 Districts)
            </button>
            <button
              onClick={switchToMetropolitan}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                !isStatewide
                  ? "bg-white text-zinc-900 font-semibold shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Metropolitan (3 Wards)
            </button>
          </div>

          {role === "admin" ? (
            <button
              onClick={onOpenAcceptModal}
              className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Commit Plan (Rev {authoritativeRevision + 1})
            </button>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-mono text-zinc-500 bg-zinc-100 border border-zinc-200">
              <Lock className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              State Admin Lock (r{authoritativeRevision})
            </span>
          )}
        </div>
      </div>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Available Stock */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Period Total Stock</span>
            <Package className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold font-mono text-zinc-950">
                {stagedStock.toLocaleString()}
              </span>
              <span className="text-[11px] text-zinc-400 ml-1">kits</span>
            </div>
            {role === "admin" && (
              <button
                onClick={() => {
                  setTempStockInput(stagedStock.toString());
                  setStockError(null);
                  setShowStockModal(true);
                }}
                className="text-[11px] text-emerald-600 hover:text-emerald-700 font-semibold hover:underline"
              >
                Adjust
              </button>
            )}
          </div>
          {hypotheticalStockKits !== 0 ? (
            <div className="text-[11px] text-amber-700 font-semibold mt-1">
              {hypotheticalStockKits > 0 ? "+" : ""}{hypotheticalStockKits} hypothetical (confirmed: {stagedConfirmedStock})
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 mt-1">Confirmed stock, including kits already dispatched</div>
          )}
        </div>

        {/* Allocated Stock */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Allocated Quota</span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold font-mono text-emerald-700">
                {totalAllocatedKits.toLocaleString()}
              </span>
              <span className="text-[11px] text-zinc-400 ml-1">kits</span>
            </div>
            <span className="text-xs font-bold font-mono text-emerald-700">
              {stagedStock > 0 ? ((totalAllocatedKits / stagedStock) * 100).toFixed(0) : 0}%
            </span>
          </div>
          <div className="w-full bg-zinc-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full"
              style={{
                width: `${Math.min(100, (totalAllocatedKits / (stagedStock || 1)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* Unallocated Reserve */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Buffer Reserve</span>
            <Package className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-bold font-mono text-zinc-800">
              {unallocatedStock.toLocaleString()}
            </span>
            <span className="text-[11px] text-zinc-400 ml-1">kits unassigned</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">Available for secondary surge</div>
        </div>

        {/* Total Census Demand */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Census Demand</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-bold font-mono text-zinc-950">
              {totalDemandKits.toLocaleString()}
            </span>
            <span className="text-[11px] text-zinc-400 ml-1">kits total</span>
          </div>
          <div className="text-[11px] text-rose-600 font-medium mt-1">
            {totalUnmetKits.toLocaleString()} kits shortfall ({formatPct(averageCoveragePct)} avg coverage)
          </div>
        </div>

        {/* Fairness Parity Minimum */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Fairness Floor</span>
            <Scale className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-bold font-mono text-zinc-950">
              {formatPct(minCoveragePct)}
            </span>
            <span className="text-[11px] text-zinc-400 ml-1">min coverage</span>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1">Guaranteed minimum across all open nodes</div>
        </div>
      </div>

      {/* Scenario presets, policy choice and input conflicts */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-500 mr-1">What-if presets</span>
          {presetButtons.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyScenario(p.id)}
              className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetStudioToAuthoritative}
            className="px-2.5 py-1 rounded-lg border border-zinc-300 bg-zinc-50 font-semibold text-zinc-800 hover:bg-zinc-100"
          >
            Reset to register r{authoritativeRevision}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-500 mr-1">Policy</span>
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50" role="group" aria-label="Allocation policy">
            {([["srs-progressive-maxmin", "Fair (max-min)"], ["hamilton-proportional", "Proportional baseline"]] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={selectedAlgorithm === id}
                onClick={() => setSelectedAlgorithm(id)}
                className={`px-2.5 py-1 rounded-md ${selectedAlgorithm === id ? "bg-white font-semibold text-zinc-900 shadow-sm" : "text-zinc-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {stagedSource === "scenario" && (
            <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              Scenario preview: models the period before any dispatch; not publishable
            </span>
          )}
        </div>
        {planIssues.length > 0 && (
          <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
            <p className="font-semibold">The engine cannot plan with these inputs. Only kits already dispatched are shown.</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {planIssues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Main Allocation Matrix Card */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-50/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search districts, hubs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 w-56 font-sans"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center rounded-lg border border-zinc-200 p-0.5 bg-white text-xs">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filterMode === "all" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                All ({currentPlan.length})
              </button>
              <button
                onClick={() => setFilterMode("deficit")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filterMode === "deficit" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Deficit
              </button>
              <button
                onClick={() => setFilterMode("bound")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filterMode === "bound" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Hub Bottlenecks
              </button>
              <button
                onClick={() => setFilterMode("closed")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  filterMode === "closed" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Closed
              </button>
            </div>
          </div>

          <div className="text-xs text-zinc-500 font-mono">
            Showing {filteredPlan.length} of {currentPlan.length} regions
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
            <thead className="bg-zinc-50 font-semibold text-zinc-600 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Region / District</th>
                <th className="py-3 px-4">Distribution Hub</th>
                <th className="py-3 px-4 font-mono text-right">Demand</th>
                <th className="py-3 px-4 font-mono text-right">Hub Capacity</th>
                <th className="py-3 px-4 font-mono text-right">Prior Sent</th>
                <th className="py-3 px-4 font-mono text-right font-bold text-zinc-900">
                  Allocated Quota
                </th>
                <th className="py-3 px-4 font-mono text-right" title={selectedAlgorithm === "srs-progressive-maxmin" ? "Proportional baseline allocation for comparison" : "Fair max-min allocation for comparison"}>
                  {selectedAlgorithm === "srs-progressive-maxmin" ? "Baseline" : "Fair Plan"}
                </th>
                <th className="py-3 px-4 font-mono text-right">Coverage</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredPlan.map((item) => {
                const isClosed = item.status === "unserviceable" || item.status === "ineligible";
                const isEditing = editingCapacityId === item.assignedCenterId;

                return (
                  <tr
                    key={item.regionId}
                    className={`hover:bg-zinc-50/80 transition-colors ${
                      isClosed ? "bg-zinc-50/60 text-zinc-400" : ""
                    }`}
                  >
                    {/* Region */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900">{item.regionName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">{item.regionId}</div>
                    </td>

                    {/* Center Hub */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-800">{item.centerName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono">{item.assignedCenterId}</div>
                    </td>

                    {/* Demand */}
                    <td className="py-3 px-4 font-mono text-right text-zinc-700">
                      {item.demandKits.toLocaleString()}
                    </td>

                    {/* Hub Capacity (with quick inline edit) */}
                    <td className="py-3 px-4 font-mono text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center space-x-1">
                          <input
                            type="number"
                            min={stagedCommitted[item.assignedCenterId] ?? 0}
                            step={1}
                            aria-label={`Capacity for ${item.assignedCenterId}`}
                            value={tempCapacityValue}
                            onChange={(e) => setTempCapacityValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveCapacity(item.assignedCenterId);
                              if (e.key === "Escape") setEditingCapacityId(null);
                            }}
                            className="w-20 px-1.5 py-0.5 border border-emerald-500 rounded text-xs font-mono text-right"
                          />
                          <button
                            onClick={() => handleSaveCapacity(item.assignedCenterId)}
                            className="px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold"
                          >
                            Save
                          </button>
                          {capacityError && <span role="alert" className="block text-[10px] text-rose-700 max-w-[12rem] text-left">{capacityError}</span>}
                        </div>
                      ) : canEditCapacity(item.assignedCenterId) ? (
                        <button
                          onClick={() => {
                            setEditingCapacityId(item.assignedCenterId);
                            setTempCapacityValue(String(item.centerCapacity));
                            setCapacityError(null);
                          }}
                          className="hover:underline hover:text-emerald-700 font-mono text-zinc-700"
                          title="Click to adjust center capacity"
                        >
                          {item.centerCapacity.toLocaleString()}
                        </button>
                      ) : (
                        <span className="font-mono text-zinc-700">{item.centerCapacity.toLocaleString()}</span>
                      )}
                    </td>

                    {/* Prior Dispatched */}
                    <td className="py-3 px-4 font-mono text-right text-zinc-500">
                      {(item.priorDispatchedKits || 0) > 0 ? (
                        <span className="text-zinc-700">{(item.priorDispatchedKits || 0).toLocaleString()}</span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>

                    {/* Allocated Quota */}
                    <td className="py-3 px-4 font-mono text-right font-bold text-sm text-emerald-700">
                      {item.allocatedKits.toLocaleString()}
                    </td>

                    {/* Comparison allocation */}
                    <td className="py-3 px-4 font-mono text-right text-zinc-500">
                      {selectedAlgorithm === "srs-progressive-maxmin" ? (baselineKits.get(item.regionId) ?? 0).toLocaleString() : "—"}
                    </td>

                    {/* Coverage Ratio & Bar */}
                    <td className="py-3 px-4 font-mono text-right">
                      {item.demandKits > 0 && item.status !== "ineligible" ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={`font-bold ${
                              item.coveragePercentage >= 100
                                ? "text-emerald-700"
                                : item.coveragePercentage >= 50
                                ? "text-zinc-900"
                                : "text-amber-700"
                            }`}
                          >
                            {item.coveragePercentage.toFixed(1)}%
                          </span>
                          <div className="w-16 bg-zinc-100 rounded-full h-1 mt-1 overflow-hidden">
                            <div
                              className={`h-1 rounded-full ${
                                item.coveragePercentage >= 100
                                  ? "bg-emerald-600"
                                  : item.coveragePercentage >= 50
                                  ? "bg-zinc-700"
                                  : "bg-amber-500"
                              }`}
                              style={{ width: `${Math.min(100, item.coveragePercentage)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400">N/A</span>
                      )}
                    </td>

                    {/* Operational Status */}
                    <td className="py-3 px-4 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stock Adjustment Modal */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 font-sans">
              Try a Different Stock Level
            </h3>
            <p className="text-xs text-zinc-500">
              A what-if: allocations recalculate instantly. Stock above the confirmed {stagedConfirmedStock} kits is hypothetical and cannot be published; only a confirmed warehouse import changes confirmed stock.
            </p>

            <div>
              <label className="text-xs font-semibold text-zinc-700 block mb-1">
                Stock for this preview (kits)
              </label>
              <input
                type="number"
                value={tempStockInput}
                onChange={(e) => setTempStockInput(e.target.value)}
                min={0}
                step={1}
                aria-label="Stock for this preview"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {stockError && <p role="alert" className="text-[11px] text-rose-700 mt-1">{stockError}</p>}
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowStockModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const text = tempStockInput.trim();
                  if (!/^\d+$/.test(text)) {
                    setStockError("Enter a whole, non-negative number of kits.");
                    return;
                  }
                  setStagedStock(Number(text));
                  setStockError(null);
                  setShowStockModal(false);
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold"
              >
                Apply New Pool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const STATUS_BADGE: Record<string, [string, string]> = {
  unserviceable: ["Center Closed", "bg-rose-50 text-rose-800 border-rose-200"],
  ineligible: ["Not in Program (N/A)", "bg-zinc-100 text-zinc-600 border-zinc-200"],
  zero_demand: ["Zero Demand (N/A)", "bg-zinc-100 text-zinc-600 border-zinc-200"],
  capacity_capped: ["Hub Bound", "bg-amber-50 text-amber-800 border-amber-200"],
  full: ["Fulfilled", "bg-emerald-50 text-emerald-800 border-emerald-200"],
  partial: ["Fair Share", "bg-zinc-100 text-zinc-700 border-zinc-200"],
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const [label, tone] = STATUS_BADGE[status] ?? [status, "bg-zinc-100 text-zinc-700 border-zinc-200"];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tone}`}>{label}</span>;
};
