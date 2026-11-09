import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Fingerprint,
  Clock,
  History,
  FileText,
  User,
  ArrowRight,
  GitCommit,
} from "lucide-react";
import type { DecisionReceipt } from "../types";
import { computeSha256Fingerprint } from "../lib/crypto";

interface AuditLedgerViewProps {
  receipts: DecisionReceipt[];
}

export const AuditLedgerView: React.FC<AuditLedgerViewProps> = ({ receipts }) => {
  const [selectedReceipt, setSelectedReceipt] = useState<DecisionReceipt | null>(
    receipts.length > 0 ? receipts[receipts.length - 1] : null
  );

  const [compareReceipt, setCompareReceipt] = useState<DecisionReceipt | null>(
    receipts.length > 1 ? receipts[receipts.length - 2] : null
  );

  const [verifiedFingerprint, setVerifiedFingerprint] = useState<boolean | null>(null);

  useEffect(() => {
    if (selectedReceipt) {
      // Recalculate canonical hash in-browser to verify against stored receipt
      const payloadToHash = {
        periodId: selectedReceipt.periodId,
        revision: selectedReceipt.revision,
        actorId: selectedReceipt.actorId,
        algorithm: selectedReceipt.algorithm,
        algorithmVersion: selectedReceipt.algorithmVersion,
        changeJustification: selectedReceipt.changeJustification,
        resultingAllocation: selectedReceipt.resultingAllocation,
        stagedOverrides: selectedReceipt.stagedOverrides,
      };

      computeSha256Fingerprint(payloadToHash).then((hash) => {
        setVerifiedFingerprint(hash === selectedReceipt.canonicalPayloadHash);
      });
    }
  }, [selectedReceipt]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Page Header */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900">
              Authoritative Decision Register & Audit Ledger
            </h2>
            <p className="text-xs text-zinc-500">
              Immutable historical register of committed allocation plans, SHA-256 canonical fingerprints, and change justifications.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Revision Timeline List */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
            <History className="w-4 h-4 text-zinc-500" />
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
              Revision History ({receipts.length})
            </h3>
          </div>

          <div className="space-y-2">
            {receipts
              .slice()
              .reverse()
              .map((rcpt) => {
                const isSelected = selectedReceipt?.receiptId === rcpt.receiptId;
                return (
                  <button
                    key={rcpt.receiptId}
                    onClick={() => setSelectedReceipt(rcpt)}
                    className={`w-full text-left p-3 rounded-lg border transition-all text-xs ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50/30 shadow-sm"
                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono font-semibold">
                      <span className="text-emerald-700">Revision r{rcpt.revision}</span>
                      <span className="text-[11px] text-zinc-400">{rcpt.receiptId}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 truncate">
                      {rcpt.changeJustification}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-400">
                      <span>{rcpt.actorName}</span>
                      <span>{rcpt.timestampIST}</span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Right Column (2 cols): Selected Receipt Details & Diff Viewer */}
        <div className="lg:col-span-2 space-y-6">
          {selectedReceipt ? (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
              {/* Receipt Header */}
              <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <GitCommit className="w-4 h-4 text-emerald-600" />
                  <span className="font-mono font-bold text-sm text-zinc-900">
                    Decision Receipt {selectedReceipt.receiptId}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Revision r{selectedReceipt.revision}
                  </span>
                </div>

                {/* Fingerprint verification status */}
                <div className="flex items-center space-x-1.5 text-xs font-medium">
                  {verifiedFingerprint ? (
                    <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <Fingerprint className="w-3.5 h-3.5 mr-1" />
                      Fingerprint Match
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-zinc-500 bg-zinc-100 px-2.5 py-0.5 rounded-full">
                      Checking fingerprint...
                    </span>
                  )}
                </div>
              </div>

              {/* Receipt Body */}
              <div className="p-6 space-y-5 text-xs">
                {/* Meta details grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Authorized Actor</span>
                    <span className="font-semibold text-zinc-800 flex items-center mt-0.5">
                      <User className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                      {selectedReceipt.actorName} ({selectedReceipt.actorRole})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Timestamp (IST)</span>
                    <span className="font-mono text-zinc-800 flex items-center mt-0.5">
                      <Clock className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                      {selectedReceipt.timestampIST}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Engine Policy</span>
                    <span className="font-semibold text-zinc-800 mt-0.5 block">
                      {selectedReceipt.algorithm}
                    </span>
                  </div>
                </div>

                {/* Change Justification */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Change Justification (Audit Evidence)
                  </span>
                  <p className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-zinc-800 italic leading-relaxed">
                    "{selectedReceipt.changeJustification}"
                  </p>
                </div>

                {/* Accepted Allocation Matrix */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Committed Allocations
                  </span>
                  <div className="border border-zinc-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-4">Region ID</th>
                          <th className="py-2.5 px-4 font-mono text-right">Committed Kits</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {Object.entries(selectedReceipt.resultingAllocation).map(([regId, kits]) => (
                          <tr key={regId} className="hover:bg-zinc-50">
                            <td className="py-2.5 px-4 font-semibold text-zinc-800">Region {regId}</td>
                            <td className="py-2.5 px-4 font-mono text-right font-bold text-zinc-900">
                              {kits} kits
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Canonical SHA-256 Fingerprint */}
                <div className="space-y-1 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Canonical SHA-256 Tamper-Evident Hash
                  </span>
                  <code className="block p-2.5 bg-zinc-900 text-emerald-400 rounded-lg font-mono text-[11px] break-all">
                    {selectedReceipt.canonicalPayloadHash}
                  </code>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-zinc-400 bg-white rounded-xl border border-zinc-200">
              Select a receipt from the history timeline to inspect its details.
            </div>
          )}

          {/* Revision Diff Viewer */}
          {receipts.length > 1 && (
            <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-zinc-500" />
                  <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    Revision Diff Comparison
                  </h3>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <select
                    value={compareReceipt?.receiptId || ""}
                    onChange={(e) =>
                      setCompareReceipt(
                        receipts.find((r) => r.receiptId === e.target.value) || null
                      )
                    }
                    className="text-xs font-mono border-zinc-300 rounded p-1"
                  >
                    {receipts.map((r) => (
                      <option key={r.receiptId} value={r.receiptId}>
                        Compare vs r{r.revision} ({r.receiptId})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedReceipt && compareReceipt && (
                <div className="border border-zinc-200 rounded-lg overflow-hidden text-xs">
                  <table className="min-w-full divide-y divide-zinc-200 text-left">
                    <thead className="bg-zinc-50 font-semibold text-zinc-600">
                      <tr>
                        <th className="py-2.5 px-4">Region</th>
                        <th className="py-2.5 px-4 font-mono text-right">
                          r{compareReceipt.revision} ({compareReceipt.receiptId})
                        </th>
                        <th className="py-2.5 px-4 font-mono text-right">
                          r{selectedReceipt.revision} ({selectedReceipt.receiptId})
                        </th>
                        <th className="py-2.5 px-4 font-mono text-right">Net Shift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {Object.keys(selectedReceipt.resultingAllocation).map((regId) => {
                        const v1 = compareReceipt.resultingAllocation[regId] ?? 0;
                        const v2 = selectedReceipt.resultingAllocation[regId] ?? 0;
                        const diff = v2 - v1;
                        return (
                          <tr key={regId} className="hover:bg-zinc-50">
                            <td className="py-2.5 px-4 font-semibold text-zinc-800">
                              Region {regId}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-right text-zinc-600">
                              {v1} kits
                            </td>
                            <td className="py-2.5 px-4 font-mono text-right text-zinc-900 font-bold">
                              {v2} kits
                            </td>
                            <td className="py-2.5 px-4 font-mono text-right font-bold">
                              <span
                                className={
                                  diff > 0
                                    ? "text-emerald-600"
                                    : diff < 0
                                    ? "text-rose-600"
                                    : "text-zinc-400"
                                }
                              >
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
