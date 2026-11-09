import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Lock, RefreshCw, X, AlertTriangle } from "lucide-react";
import { useOperational } from "../../context/OperationalContext";

interface ReviewAcceptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewAcceptModal: React.FC<ReviewAcceptModalProps> = ({ isOpen, onClose }) => {
  const {
    authoritativeRevision,
    authoritativeStock,
    stagedStock,
    authoritativeCenters,
    stagedCenters,
    publishAuthoritativePlan,
    resetStudioToAuthoritative,
  } = useOperational();

  const [justification, setJustification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [simulateConflict, setSimulateConflict] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  if (!isOpen) return null;

  // Identify staged overrides
  const overrides: string[] = [];
  stagedCenters.forEach((sc) => {
    const orig = authoritativeCenters.find((c) => c.centerId === sc.centerId);
    if (orig) {
      if (orig.configuredCapacity !== sc.configuredCapacity) {
        overrides.push(
          `${sc.centerName}: Handling capacity changed from ${orig.configuredCapacity} to ${sc.configuredCapacity} kits`
        );
      }
      if (orig.operatingStatus !== sc.operatingStatus) {
        overrides.push(
          `${sc.centerName}: Operating status changed from "${orig.operatingStatus}" to "${sc.operatingStatus}"`
        );
      }
    }
  });

  const isSurgeStock = stagedStock > authoritativeStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 10) return;

    if (simulateConflict) {
      setConflictError(
        `Conflict 409: Revision r${authoritativeRevision} was superseded by Revision r${
          authoritativeRevision + 1
        } by Ishaan. Please reload authoritative register.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await publishAuthoritativePlan(justification, idempotencyKey);
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
            <h3 className="text-base font-semibold text-zinc-900 font-sans">
              Publish Plan to Authoritative Register
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 rounded-lg p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Revision lock check */}
          <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
            <span className="text-zinc-600">Target Registration Period:</span>
            <span className="font-mono font-medium text-zinc-900">
              Cycle 2026-W46 • Locking at <span className="text-emerald-700 font-bold">r{authoritativeRevision}</span>
            </span>
          </div>

          {/* Staged Overrides */}
          <div className="space-y-1.5">
            <label className="font-semibold text-zinc-700 uppercase tracking-wider text-[11px]">
              Staged Parameter Overrides ({overrides.length})
            </label>
            {overrides.length > 0 ? (
              <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg bg-zinc-50/50 text-zinc-800 max-h-32 overflow-y-auto">
                {overrides.map((ov, idx) => (
                  <li key={idx} className="p-2.5 flex items-start space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                    <span>{ov}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-zinc-500 italic p-2 bg-zinc-50 rounded border border-zinc-200">
                Baseline allocation with no center capacity overrides.
              </p>
            )}
          </div>

          {/* Surge Warning */}
          {isSurgeStock && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">Unconfirmed Hypothetical Stock:</span>
                <p className="mt-0.5 leading-relaxed">
                  You have staged {stagedStock} kits ({stagedStock - authoritativeStock} unconfirmed surge kits).
                  Hypothetical stock cannot become confirmed stock in the official register without warehouse physical verification.
                </p>
              </div>
            </div>
          )}

          {/* Conflict Error Notice */}
          {conflictError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start space-x-2 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Concurrent Write Conflict</span>
                <p className="mt-0.5">{conflictError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setConflictError(null);
                    resetStudioToAuthoritative();
                    onClose();
                  }}
                  className="mt-2 inline-flex items-center text-xs font-semibold text-rose-700 hover:text-rose-900 underline"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reload Authoritative State
                </button>
              </div>
            </div>
          )}

          {/* Mandatory Change Justification */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="font-semibold text-zinc-700">
                Regulatory Decision Justification <span className="text-rose-500">*</span>
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
              className="w-full text-zinc-900 border border-zinc-300 rounded-lg p-2.5 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Idempotency Key Tracking */}
          <div className="text-[11px] text-zinc-400 flex items-center justify-between border-t border-zinc-100 pt-3">
            <span>Idempotency Key:</span>
            <span className="font-mono text-zinc-600">{idempotencyKey.slice(0, 18)}...</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={justification.trim().length < 10 || isSubmitting}
              className="inline-flex items-center px-4 py-2 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {isSubmitting ? "Committing to Ledger..." : `Publish Revision r${authoritativeRevision + 1}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
