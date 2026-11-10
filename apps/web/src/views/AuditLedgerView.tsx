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
  CheckCircle2,
} from "lucide-react";
import { useOperational } from "../context/OperationalContext";
import type { DecisionReceiptEntity } from "../types";
import { computeSha256Fingerprint } from "../lib/crypto";

export const AuditLedgerView: React.FC = () => {
  const { receipts } = useOperational();

  const [selectedReceipt, setSelectedReceipt] = useState<DecisionReceiptEntity | null>(
    receipts.length > 0 ? receipts[receipts.length - 1] : null
  );

  const [compareReceipt, setCompareReceipt] = useState<DecisionReceiptEntity | null>(
    receipts.length > 1 ? receipts[receipts.length - 2] : null
  );

  const [verifiedFingerprint, setVerifiedFingerprint] = useState<boolean | null>(null);

  useEffect(() => {
    if (selectedReceipt) {
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
    <div className="space-y-6 pb-16">
      {/* Header bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-950 font-sans">
          Authoritative Regulatory Register & Audit Ledger
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Cryptographically fingerprinted audit records of all official food allocation revisions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Revision Timeline List */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
            <History className="w-4 h-4 text-zinc-500" />
            <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans">
              Published Revisions ({receipts.length})
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
                    <div className="mt-1 text-[11px] text-zinc-600 line-clamp-1">
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

        {/* Right Column: Receipt Details & Revision Diff Viewer */}
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

                <div className="flex items-center space-x-1.5 text-xs font-medium">
                  {verifiedFingerprint ? (
                    <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
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
                    <span className="text-zinc-400 block text-[11px]">Authorized Official</span>
                    <span className="font-semibold text-zinc-800 flex items-center mt-0.5">
                      <User className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                      {selectedReceipt.actorName}
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
                    Official Regulatory Justification
                  </span>
                  <p className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-zinc-800 italic leading-relaxed">
                    "{selectedReceipt.changeJustification}"
                  </p>
                </div>

                {/* Committed Allocations Table */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Committed Regional Quotas
                  </span>
                  <div className="border border-zinc-200 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-600 font-semibold">
                        <tr>
                          <th className="py-2.5 px-4">Distribution Zone</th>
                          <th className="py-2.5 px-4 font-mono text-right">Committed Quota</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {Object.entries(selectedReceipt.resultingAllocation).map(([regId, kits]) => (
                          <tr key={regId} className="hover:bg-zinc-50">
                            <td className="py-2.5 px-4 font-semibold text-zinc-800">Zone {regId}</td>
                            <td className="py-2.5 px-4 font-mono text-right font-bold text-zinc-900">
                              {String(kits)} kits
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* SHA-256 Fingerprint */}
                <div className="space-y-1 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                    Canonical SHA-256 Fingerprint
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

          {/* Revision Diff Comparison */}
          {receipts.length > 1 && selectedReceipt && compareReceipt && (
            <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-zinc-500" />
                  <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider font-sans">
                    Revision Diff Comparison
                  </h3>
                </div>
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

              <div className="border border-zinc-200 rounded-lg overflow-hidden text-xs">
                <table className="min-w-full divide-y divide-zinc-200 text-left">
                  <thead className="bg-zinc-50 font-semibold text-zinc-600">
                    <tr>
                      <th className="py-2.5 px-4">Distribution Zone</th>
                      <th className="py-2.5 px-4 font-mono text-right">
                        r{compareReceipt.revision} Quota
                      </th>
                      <th className="py-2.5 px-4 font-mono text-right">
                        r{selectedReceipt.revision} Quota
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
                            Zone {regId}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
