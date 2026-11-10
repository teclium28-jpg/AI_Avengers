import React from "react";
import {
  GitCompare,
  Download,
  Printer,
  PlusCircle,
  Truck,
  Building,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useOperational } from "../context/OperationalContext";
import { useAuth } from "../context/AuthContext";

interface ReconciliationViewProps {
  onOpenRecordModal: () => void;
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({ onOpenRecordModal }) => {
  const { currentUser } = useAuth();
  const role = currentUser?.role || "admin";
  const { dispatchReconciliation, centerReconciliation, movements } = useOperational();

  // Formula-safe CSV exporter
  const handleExportSafeCsv = () => {
    let csv = "Center ID,Center Name,Dispatched,Received,In Transit,Loss,Unresolved Difference\n";
    dispatchReconciliation.forEach((row) => {
      const sanitize = (val: string) => {
        if (/^[=+\-@\s]/.test(val)) return `'${val}`;
        return val;
      };
      csv += `${sanitize(row.centerId)},${sanitize(row.centerName)},${row.dispatchedKits},${row.receivedKits},${row.inTransitKits},${row.confirmedLossKits},${row.unresolvedKits}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fairshare_reconciliation_audit_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header & Export controls */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 font-sans">
            Physical Dispatches & Inventory Reconciliation
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Real-time waybill verification, transport fulfillment status, and distribution center physical stock tracking.
          </p>
        </div>

        <div className="flex items-center space-x-3 no-print">
          {role === "admin" && (
            <button
              onClick={onOpenRecordModal}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              Record Movement Waybill
            </button>
          )}

          {role === "hub_operator" && (
            <button
              onClick={onOpenRecordModal}
              className="inline-flex items-center px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              Confirm Truck Arrival (CTR-B)
            </button>
          )}

          {role === "community_ngo" && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-[11px] font-mono text-amber-800 bg-amber-50 border border-amber-200">
              Ward B Inbound Supply Monitor
            </span>
          )}
          <button
            onClick={handleExportSafeCsv}
            className="inline-flex items-center px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 shadow-sm"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export Safe CSV
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print Audit Report
          </button>
        </div>
      </div>

      {/* Non-Punitive Humanitarian Ethics Callout */}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start space-x-3 text-xs text-blue-900 shadow-sm">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <span className="font-semibold block">Non-Punitive Operational Guidance:</span>
          <p className="leading-relaxed">
            Unresolved transit quantities represent review signals for warehouse investigation, <strong>never an accusation of fraud</strong>. Furthermore, low collection rates at centers never automatically lower future estimated demand.
          </p>
        </div>
      </div>

      {/* LAYER 1: DISPATCH RECONCILIATION */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-zinc-900 font-sans">
              Layer 1: Dispatch Reconciliation (Central Warehouse → Distribution Nodes)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Formula: Dispatched = Received + In Transit + Loss + Unresolved
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Center Node</th>
                <th className="py-3 px-4 font-mono text-right">Dispatched</th>
                <th className="py-3 px-4 font-mono text-right">Received</th>
                <th className="py-3 px-4 font-mono text-right">In Transit</th>
                <th className="py-3 px-4 font-mono text-right">Loss</th>
                <th className="py-3 px-4 font-mono text-right font-bold text-zinc-900">
                  Unresolved Difference
                </th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {dispatchReconciliation.map((row) => (
                <tr key={row.centerId} className="hover:bg-zinc-50/70">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-zinc-800">{row.centerName}</span>
                    <span className="font-mono text-zinc-400 ml-1.5">({row.centerId})</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-right font-medium">{row.dispatchedKits}</td>
                  <td className="py-3 px-4 font-mono text-right font-medium">{row.receivedKits}</td>
                  <td className="py-3 px-4 font-mono text-right text-zinc-500">{row.inTransitKits}</td>
                  <td className="py-3 px-4 font-mono text-right text-zinc-500">{row.confirmedLossKits}</td>
                  <td className="py-3 px-4 font-mono text-right font-bold">
                    <span
                      className={
                        row.unresolvedKits > 0 ? "text-amber-600 font-bold" : "text-emerald-700"
                      }
                    >
                      {row.unresolvedKits} kits
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.isBalanced ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                        Reconciled
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
                        Under Review
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LAYER 2: CENTER RECONCILIATION */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Building className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-zinc-900 font-sans">
              Layer 2: Center Warehouse Balance (Received → Beneficiary Distribution)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">
            Formula: Received = Collected + Damaged + Remaining in Center
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Center Node</th>
                <th className="py-3 px-4 font-mono text-right">Received at Center</th>
                <th className="py-3 px-4 font-mono text-right">Collected by Families</th>
                <th className="py-3 px-4 font-mono text-right">Damaged in Storage</th>
                <th className="py-3 px-4 font-mono text-right font-bold text-zinc-900">
                  Remaining in Store
                </th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {centerReconciliation.map((row) => (
                <tr key={row.centerId} className="hover:bg-zinc-50/70">
                  <td className="py-3 px-4">
                    <span className="font-semibold text-zinc-800">{row.centerName}</span>
                    <span className="font-mono text-zinc-400 ml-1.5">({row.centerId})</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-right font-medium">{row.receivedKits}</td>
                  <td className="py-3 px-4 font-mono text-right font-medium">{row.collectedKits}</td>
                  <td className="py-3 px-4 font-mono text-right text-zinc-500">{row.damagedKits}</td>
                  <td className="py-3 px-4 font-mono text-right font-bold text-emerald-700">
                    {row.remainingInCenterKits} kits
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                      Balanced
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* APPEND-ONLY MOVEMENT LOG */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
          <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans">
            Physical Waybill Audit Log ({movements.length})
          </h3>
          <span className="text-[11px] text-zinc-400 font-mono">
            Immutable physical transit events
          </span>
        </div>

        <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden text-xs">
          {movements.map((evt) => (
            <div key={evt.recordId} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-zinc-50 gap-2">
              <div className="flex items-center space-x-3">
                <span className="font-mono text-[11px] font-bold text-emerald-700">
                  {evt.waybillNumber}
                </span>
                <span className="font-semibold uppercase px-2 py-0.5 rounded text-[10px] bg-zinc-100 border border-zinc-200 text-zinc-700">
                  {evt.movementType}
                </span>
                <span className="text-zinc-800">{evt.notes}</span>
              </div>
              <div className="flex items-center space-x-4 text-zinc-500 font-mono text-[11px]">
                <span className="font-bold text-zinc-900 text-xs">{evt.quantityKits} kits</span>
                <span>{evt.timestampIST}</span>
                <span>{evt.verifiedBy}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
