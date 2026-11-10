import React, { useState, useLayoutEffect } from "react";
import { AlertCircle, CheckCircle2, Lock, RefreshCw, X, AlertTriangle, ShieldAlert } from "lucide-react";
import { useOperational } from "../../context/OperationalContext";
import { useAuth } from "../../context/AuthContext";

interface ReviewAcceptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewAcceptModal: React.FC<ReviewAcceptModalProps> = ({ isOpen, onClose }) => {
  const {
    authoritativeRevision,
    authoritativeStock,
    stagedStock,
    stagedConfirmedStock,
    authoritativeCenters,
    stagedCenters,
    authoritativeRegions,
    stagedRegions,
    stagedSource,
    planIssues,
    selectedAlgorithm,
    publishAuthoritativePlan,
  } = useOperational();
  const { currentUser } = useAuth();
  const canPublish = currentUser?.role === "admin";

  const [justification, setJustification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());

  // One key per acceptance intent: a fresh key whenever the review is reopened. Retries while
  // the modal stays open reuse the same key, so a retried publish cannot create two revisions.
  // A layout effect runs before paint, so the previous intent's key is never shown or submitted.
  useLayoutEffect(() => {
    if (!isOpen) return;
    setIdempotencyKey(crypto.randomUUID());
    setJustification("");
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const overrides: string[] = [];
  if (stagedStock !== authoritativeStock) overrides.push(`Stock: ${authoritativeStock} → ${stagedStock} kits`);
  stagedCenters.forEach((sc) => {
    const orig = authoritativeCenters.find((c) => c.centerId === sc.centerId);
    if (!orig) {
      overrides.push(`${sc.centerName} (${sc.centerId}): new center, capacity ${sc.configuredCapacity} kits`);
      return;
    }
    if (orig.configuredCapacity !== sc.configuredCapacity) overrides.push(`${sc.centerName}: capacity ${orig.configuredCapacity} → ${sc.configuredCapacity} kits`);
    if (orig.operatingStatus !== sc.operatingStatus) overrides.push(`${sc.centerName}: status "${orig.operatingStatus}" → "${sc.operatingStatus}"`);
  });
  stagedRegions.forEach((sr) => {
    const orig = authoritativeRegions.find((r) => r.regionId === sr.regionId);
    if (!orig) overrides.push(`Region ${sr.regionId}: added (demand ${sr.demandKits} kits)`);
    else if (orig.demandKits !== sr.demandKits) overrides.push(`Region ${sr.regionId}: demand ${orig.demandKits} → ${sr.demandKits} kits`);
  });
  const removed = authoritativeRegions.filter((r) => !stagedRegions.some((s) => s.regionId === r.regionId)).length;
  if (removed) overrides.push(`${removed} region(s) removed from the period`);

  const hypothetical = stagedStock !== stagedConfirmedStock;
  const blockers: string[] = [];
  if (stagedSource === "scenario") blockers.push("This preview is a scenario preset (a what-if study of the period before any dispatch). Reset to the register or import confirmed data to publish.");
  if (hypothetical) blockers.push(`Hypothetical stock cannot become confirmed stock. The preview uses ${stagedStock} kits but ${stagedConfirmedStock} are confirmed. Reset the stock or import a confirmed warehouse count.`);
  if (planIssues.length) blockers.push(`The plan has ${planIssues.length} input conflict(s) shown in the studio. Resolve them first.`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPublish || justification.trim().length < 10 || blockers.length) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await publishAuthoritativePlan(justification, idempotencyKey, {
        actorId: currentUser?.id || "ACT-DIR-01",
        actorName: currentUser?.name || "Authorized Officer",
        actorRole: currentUser?.roleTitle || "Operations Coordinator",
      });
      if (result.ok) onClose();
      else setError(result.message ?? "The plan could not be published.");
    } catch {
      setError("The plan could not be published. Try again; the same request will not be recorded twice.");
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
              Changes Since r{authoritativeRevision} ({overrides.length})
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
                No input changes: this re-publishes the current inputs.
              </p>
            )}
          </div>

          {blockers.map((message) => (
            <div key={message} role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="leading-relaxed">{message}</p>
            </div>
          ))}
          {error && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">{error}</div>
          )}
          <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-200">
            <span className="text-zinc-600">Allocation policy:</span>
            <span className="font-medium text-zinc-900">{selectedAlgorithm === "srs-progressive-maxmin" ? "Progressive max-min fairness" : "Proportional baseline (Hamilton)"}</span>
          </div>

          {/* Non-Admin Notice */}
          {!canPublish && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2.5 text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">State Admin Permissions Required:</span>
                <p className="mt-0.5 leading-relaxed text-[11px]">
                  You are signed in as {currentUser?.name} ({currentUser?.roleTitle}). Only State Relief Admin credentials can publish official regulatory revisions.
                </p>
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
              disabled={!canPublish || justification.trim().length < 10 || isSubmitting || blockers.length > 0}
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
