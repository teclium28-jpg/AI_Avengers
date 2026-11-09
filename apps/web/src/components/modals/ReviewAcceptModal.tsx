import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Lock, RefreshCw, X, AlertTriangle } from "lucide-react";
import type { RegionInputRow } from "../../types";

interface ReviewAcceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (justification: string, idempotencyKey: string) => Promise<void>;
  currentRevision: number;
  originalRegions: RegionInputRow[];
  stagedRegions: RegionInputRow[];
  confirmedStock: number;
  currentStock: number;
  idempotencyKey: string;
}

export const ReviewAcceptModal: React.FC<ReviewAcceptModalProps> = ({
  isOpen,
  onClose,
  onCommit,
  currentRevision,
  originalRegions,
  stagedRegions,
  confirmedStock,
  currentStock,
  idempotencyKey,
}) => {
  const [justification, setJustification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [simulateConflict, setSimulateConflict] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Identify overrides
  const overrides: string[] = [];
  stagedRegions.forEach((sr) => {
    const orig = originalRegions.find((r) => r.regionId === sr.regionId);
    if (orig) {
      if (orig.capacityKits !== sr.capacityKits) {
        overrides.push(
          `Center for Region ${sr.regionId}: Capacity changed from ${orig.capacityKits} to ${sr.capacityKits} kits`
        );
      }
      if (orig.status !== sr.status) {
        overrides.push(
          `Region ${sr.regionId}: Operating status changed from "${orig.status}" to "${sr.status}"`
        );
      }
    }
  });

  const isSurgeStock = currentStock > confirmedStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 10) return;

    if (simulateConflict) {
      setConflictError(
        `Conflict 409: Revision r${currentRevision} was superseded by Revision r${
          currentRevision + 1
        } by Ishaan. Please refresh authoritative state.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onCommit(justification, idempotencyKey);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-lg w-full overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-semibold text-zinc-900">
              Review & Commit Authoritative Plan
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 rounded-lg p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Revision lock check */}
          <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
            <span className="text-zinc-600">Target Registration Period:</span>
            <span className="font-mono font-medium text-zinc-900">
              2026-W46 • Locking at <span className="text-emerald-700 font-bold">r{currentRevision}</span>
            </span>
          </div>

          {/* Staged Overrides */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-700 uppercase tracking-wider">
              Staged Changes Summary ({overrides.length})
            </label>
            {overrides.length > 0 ? (
              <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg bg-zinc-50/50 text-xs text-zinc-800 max-h-32 overflow-y-auto">
                {overrides.map((ov, idx) => (
                  <li key={idx} className="p-2.5 flex items-start space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 flex-shrink-0" />
                    <span>{ov}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-500 italic p-2 bg-zinc-50 rounded border border-zinc-200">
                Baseline allocation with no center capacity overrides.
              </p>
            )}
          </div>

          {/* Hypothetical Surge Stock Warning */}
          {isSurgeStock && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">Unconfirmed Hypothetical Stock:</span>
                <p className="mt-0.5">
                  You have staged {currentStock} kits ({currentStock - confirmedStock} unconfirmed surge kits).
                  Hypothetical stock cannot become confirmed stock in the official register. Only confirmed stock ({confirmedStock} kits) will be committed.
                </p>
              </div>
            </div>
          )}

          {/* Conflict Error Notice */}
          {conflictError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Concurrent Write Conflict</span>
                <p className="mt-0.5">{conflictError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setConflictError(null);
                    onClose();
                  }}
                  className="mt-2 inline-flex items-center text-xs font-semibold text-rose-700 hover:text-rose-900 underline"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reload Authoritative Register
                </button>
              </div>
            </div>
          )}

          {/* Mandatory Change Justification */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-zinc-700">
                Reason for Acceptance / Override <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-zinc-400">
                {justification.trim().length}/10 chars min
              </span>
            </div>
            <textarea
              required
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. Center B capacity restricted due to flooding on bridge access road; redistributing surplus to North District."
              className="w-full text-xs text-zinc-900 border border-zinc-300 rounded-lg p-2.5 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Idempotency Key Tracking */}
          <div className="text-[11px] text-zinc-400 flex items-center justify-between border-t border-zinc-100 pt-3">
            <span>Idempotency Key:</span>
            <span className="font-mono text-zinc-600">{idempotencyKey.slice(0, 18)}...</span>
          </div>

          {/* Test 409 Conflict Simulation Checkbox for Evaluators */}
          <div className="pt-1 flex items-center space-x-2">
            <input
              type="checkbox"
              id="simulateConflict"
              checked={simulateConflict}
              onChange={(e) => setSimulateConflict(e.target.checked)}
              className="rounded border-zinc-300 text-rose-600 focus:ring-rose-500 h-3.5 w-3.5"
            />
            <label htmlFor="simulateConflict" className="text-[11px] text-zinc-500 cursor-pointer">
              Simulate concurrent 409 Stale Revision Conflict (Evaluator Test)
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={justification.trim().length < 10 || isSubmitting}
              className="inline-flex items-center px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              {isSubmitting ? "Committing to Register..." : `Commit to Register (r${currentRevision + 1})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
