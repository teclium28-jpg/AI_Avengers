import React from "react";
import {
  Package,
  Layers,
  TrendingDown,
  Building2,
  Truck,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";
import { useOperational } from "../context/OperationalContext";
import type { CalculatedAllocationItem, DecisionReceiptEntity } from "../types";

export const DashboardView: React.FC = () => {
  const {
    authoritativeStock,
    authoritativeRevision,
    currentPlan,
    totalAllocatedKits,
    totalUnmetKits,
    averageCoveragePct,
    minCoveragePct,
    activeCentersCount,
    authoritativeCenters,
    receipts,
    movements,
    setActivePage,
  } = useOperational();

  const totalDemand = currentPlan.reduce(
    (sum: number, item: CalculatedAllocationItem) => sum + item.demandKits,
    0
  );

  // Recent 3 receipts
  const recentReceipts = receipts.slice(-3).reverse();

  return (
    <div className="space-y-8 pb-12">
      {/* Platform Title & Hero Banner */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              Active Relief Cycle
            </span>
            <span className="text-xs text-zinc-400 font-mono">Period 2026-W46</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-950 mt-1.5 font-sans">
            Humanitarian Food Allocation & Distribution Register
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Authoritative decision-support terminal for State Disaster Food Relief & Humanitarian Logistics.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setActivePage("studio")}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
          >
            Launch Allocation Planner
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </button>
        </div>
      </div>

      {/* KPI Stat Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Confirmed Warehouse Stock
            </span>
            <Package className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-zinc-900">{authoritativeStock}</span>
            <span className="text-xs text-zinc-500 font-medium">Standard Kits</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400 font-medium">
            100% physically verified inventory
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Committed Allocation
            </span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-emerald-700">{totalAllocatedKits}</span>
            <span className="text-xs text-zinc-500 font-medium">of {authoritativeStock} reserved</span>
          </div>
          <div className="mt-2 w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 rounded-full"
              style={{ width: `${(totalAllocatedKits / (authoritativeStock || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Unmet Regional Need
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-rose-600">{totalUnmetKits}</span>
            <span className="text-xs text-zinc-500 font-medium">kits deficit ({totalDemand} demand)</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400 font-medium">
            Avg Coverage: <span className="font-mono font-bold text-zinc-700">{averageCoveragePct.toFixed(1)}%</span>
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Network Operating Capacity
            </span>
            <Building2 className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-zinc-900">
              {activeCentersCount} / {authoritativeCenters.length}
            </span>
            <span className="text-xs text-zinc-500 font-medium">Distribution Nodes Active</span>
          </div>
          <span className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            All assigned routes operational
          </span>
        </div>
      </div>

      {/* Main Grid: Zone Overview & Operational Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Zone Allocation Summary */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 font-sans">
                Active Zone Distribution Status
              </h2>
              <p className="text-xs text-zinc-500">
                Authoritative register allocation under SRS Progressive Max-Min fairness engine.
              </p>
            </div>
            <button
              onClick={() => setActivePage("studio")}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center"
            >
              Open Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
              <thead className="bg-zinc-50 font-semibold text-zinc-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Distribution Zone</th>
                  <th className="py-3 px-4">Center Node</th>
                  <th className="py-3 px-4 font-mono text-right">Demand</th>
                  <th className="py-3 px-4 font-mono text-right">Allocated</th>
                  <th className="py-3 px-4 font-mono text-right">Coverage %</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {currentPlan.slice(0, 8).map((item: CalculatedAllocationItem) => (
                  <tr key={item.regionId} className="hover:bg-zinc-50/70">
                    <td className="py-3.5 px-4 font-medium text-zinc-900">
                      {item.regionName}
                      <span className="text-[11px] text-zinc-400 block font-mono">ID: {item.regionId}</span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-700">
                      {item.centerName}
                      <span className="text-[11px] text-zinc-400 block font-mono">({item.assignedCenterId})</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-right text-zinc-700">
                      {item.demandKits.toLocaleString()} kits
                    </td>
                    <td className="py-3.5 px-4 font-mono text-right font-bold text-zinc-900 text-sm">
                      {item.allocatedKits.toLocaleString()} kits
                    </td>
                    <td className="py-3.5 px-4 font-mono text-right font-semibold">
                      <span className="text-zinc-900">{item.coveragePercentage.toFixed(1)}%</span>
                      <span className="text-[10px] text-zinc-400 ml-1">
                        ({item.allocatedKits}/{item.demandKits})
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {item.status === "full" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          100% Fulfilled
                        </span>
                      ) : item.status === "capacity_capped" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          Capacity Bound
                        </span>
                      ) : item.status === "unserviceable" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                          Node Closed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                          Equal Max-Min Share
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {currentPlan.length > 8 && (
            <div className="p-3 bg-zinc-50 border-t border-zinc-100 text-center">
              <button
                onClick={() => setActivePage("studio")}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
              >
                View all {currentPlan.length} regions in Allocation Planner →
              </button>
            </div>
          )}
        </div>

        {/* Right Col: Urgent Operational Notices & Quick Tools */}
        <div className="space-y-6">
          {/* Operational Alerts */}
          <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans">
                Operational Dispatch Notices
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80 text-amber-900 space-y-1">
                <span className="font-semibold block">Waybill Discrepancy Flag:</span>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Waybill #WB-MMR-4020: 5 kits pending physical verification at Dharavi Central Node. Non-punitive investigation ticket opened.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-800 space-y-1">
                <span className="font-semibold block text-zinc-900">Current Revision Status:</span>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Register locked at Revision <span className="font-mono font-bold text-emerald-700">r{authoritativeRevision}</span>. All movements must reference this revision.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Management Shortcuts */}
          <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans pb-2 border-b border-zinc-100">
              Operational Actions
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setActivePage("intake")}
                className="w-full text-left p-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-zinc-800">Import CSV Batch</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              <button
                onClick={() => setActivePage("reconciliation")}
                className="w-full text-left p-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-2">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-zinc-800">Review Physical Transit</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              <button
                onClick={() => setActivePage("audit")}
                className="w-full text-left p-2.5 rounded-lg border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors flex items-center justify-between text-xs"
              >
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-zinc-800">Inspect Audit Receipts</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Regulatory Receipts Timeline */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-bold text-zinc-900 font-sans">
              Recent Authoritative Decision Receipts
            </h3>
          </div>
          <button
            onClick={() => setActivePage("audit")}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            View Complete Audit Log →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recentReceipts.map((rcpt: DecisionReceiptEntity) => (
            <div
              key={rcpt.receiptId}
              className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/40 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="font-bold text-emerald-700">Revision r{rcpt.revision}</span>
                  <span className="text-[11px] text-zinc-400">{rcpt.receiptId}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-700 leading-relaxed line-clamp-2">
                  "{rcpt.changeJustification}"
                </p>
              </div>

              <div className="pt-2 border-t border-zinc-200/60 flex items-center justify-between text-[11px] text-zinc-400">
                <span>{rcpt.actorName}</span>
                <span>{rcpt.timestampIST}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
