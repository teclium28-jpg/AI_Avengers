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
import { useAuth } from "../context/AuthContext";
import type { CalculatedAllocationItem, DecisionReceiptEntity, NavigationPage } from "../types";
import { canOpen } from "../lib/access";
import { formatPct } from "../lib/planning";

export const DashboardView: React.FC = () => {
  const {
    authoritativeStock,
    authoritativeRevision,
    authoritativePlan,
    authoritativeCenters,
    centerLedgers,
    receipts,
    aidRequests,
    resolveAidRequest,
    setActivePage,
  } = useOperational();

  const { currentUser } = useAuth();
  const role = currentUser?.role || "admin";
  const allowed = (page: NavigationPage) => canOpen(currentUser?.role, page);

  // The overview always shows the PUBLISHED register, never an unpublished studio preview.
  const currentPlan = authoritativePlan.rows;
  const { totalAllocatedKits, totalUnmetKits, averageCoveragePct } = authoritativePlan;
  const totalDemand = authoritativePlan.totalDemandKits;
  const closedCenters = authoritativeCenters.filter((c) => c.operatingStatus === "closed" || c.configuredCapacity === 0);
  const activeCentersCount = authoritativeCenters.length - closedCenters.length;
  const reviewItems = centerLedgers.filter((l) => l.unresolvedKits !== 0 || !l.centerBalanced);
  const pendingRequests = aidRequests.filter((r) => r.status === "pending");

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
            <span className="h-3 w-px bg-zinc-200" />
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-50 text-blue-700 border border-blue-200">
              Provenance: Simulated Fixture
            </span>
            {role === "hub_operator" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-100 text-blue-900 border border-blue-300">
                Depot CTR-B Scoped
              </span>
            )}
            {role === "community_ngo" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-100 text-amber-900 border border-amber-300">
                Ward B Scoped
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-zinc-950 mt-1.5 font-sans">
            {role === "hub_operator"
              ? "Dharavi Logistics Hub Terminal (Depot CTR-B)"
              : role === "community_ngo"
              ? "Dharavi Community Aid Station (Ward B Relief)"
              : "Humanitarian Food Allocation & Distribution Register"}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            {role === "hub_operator"
              ? "Warehouse operations terminal for vehicle receiving, physical kit handling capacity, and ground disruption reporting."
              : role === "community_ngo"
              ? "Humanitarian aid partner portal for family census tracking, ration requests, and Progressive Max-Min fairness verification."
              : "Authoritative decision-support terminal for State Disaster Food Relief & Humanitarian Logistics."}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {role === "hub_operator" ? (
            <button
              onClick={() => setActivePage("centers")}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
            >
              Manage Depot Capacity
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
          ) : role === "community_ngo" ? (
            <button
              onClick={() => setActivePage("community_request")}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700 shadow-sm transition-colors"
            >
              Submit Food Request
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
          ) : (
            <button
              onClick={() => setActivePage("studio")}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
            >
              Launch Allocation Planner
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Stat Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Confirmed Period Allocation Stock
            </span>
            <Package className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-zinc-900">{authoritativeStock}</span>
            <span className="text-xs text-zinc-500 font-medium">Standard Kits</span>
          </div>
          <span className="mt-2 text-[11px] text-zinc-400 font-medium">
            Inclusive period pool (includes prior dispatches)
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
              style={{ width: `${Math.min(100, (totalAllocatedKits / (authoritativeStock || 1)) * 100)}%` }}
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
            Avg Coverage: <span className="font-mono font-bold text-zinc-700">{formatPct(averageCoveragePct)}</span>
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
          {closedCenters.length === 0 ? (
            <span className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              All distribution centers open
            </span>
          ) : (
            <span className="mt-2 text-[11px] text-rose-700 font-medium">
              Closed: {closedCenters.map((c) => c.centerId).join(", ")}
            </span>
          )}
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
            {allowed("studio") && (
              <button
                onClick={() => setActivePage("studio")}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center"
              >
                Open Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
            )}
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
                      {item.demandKits > 0 && item.status !== "ineligible" ? (
                        <>
                          <span className="text-zinc-900">{item.coveragePercentage.toFixed(1)}%</span>
                          <span className="text-[10px] text-zinc-400 ml-1">
                            ({item.allocatedKits}/{item.demandKits})
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-400">N/A</span>
                      )}
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
                      ) : item.status === "zero_demand" || item.status === "ineligible" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                          {item.status === "zero_demand" ? "Zero Demand" : "Not in Program"}
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

          {currentPlan.length > 8 && allowed("studio") && (
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
              {reviewItems.length === 0 ? (
                <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-900">
                  All dispatch and center balances reconcile.
                </div>
              ) : (
                reviewItems.map((l) => (
                  <div key={l.centerId} className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/80 text-amber-900 space-y-1">
                    <span className="font-semibold block">Review signal: {l.centerName}</span>
                    <p className="text-[11px] leading-relaxed text-amber-800">
                      {l.unresolvedKits > 0
                        ? `${l.unresolvedKits} dispatched kits are not yet explained by a receipt, loss or in-transit report. This is an operational discrepancy to review, not an accusation.`
                        : l.unresolvedKits < 0
                        ? `${-l.unresolvedKits} more kits were reported received or lost than were dispatched. Check the records.`
                        : "Center stock balance needs review."}
                    </p>
                  </div>
                ))
              )}

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
              {allowed("intake") && (
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
              )}

              {allowed("reconciliation") && (
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
              )}

              {allowed("audit") && (
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
              )}
            </div>
          </div>
        </div>
      </div>

      {role === "admin" && (
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-zinc-900 font-sans">Community Aid Requests ({pendingRequests.length} pending)</h3>
          {pendingRequests.length === 0 ? (
            <p className="text-xs text-zinc-500">No pending requests from community partners.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg text-xs">
              {pendingRequests.map((r) => (
                <li key={r.requestId} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-zinc-900">Ward {r.regionId}: {r.requestedKits} kits</span>
                    <span className="ml-2 uppercase text-[10px] font-bold text-amber-700">{r.urgency}</span>
                    <p className="text-zinc-500 mt-0.5">{r.headcount} families · {r.submittedBy} · {new Date(r.submittedAtUTC).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
                    {r.notes && <p className="text-zinc-700 mt-0.5">{r.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        resolveAidRequest(r.requestId, "staged");
                        setActivePage("studio");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                    >
                      Stage as demand
                    </button>
                    <button
                      type="button"
                      onClick={() => resolveAidRequest(r.requestId, "dismissed")}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recent Regulatory Receipts Timeline */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-bold text-zinc-900 font-sans">
              Recent Authoritative Decision Receipts
            </h3>
          </div>
          {allowed("audit") && (
            <button
              onClick={() => setActivePage("audit")}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              View Complete Audit Log →
            </button>
          )}
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
