import React, { useState, useEffect } from "react";
import { Truck, X, CheckCircle2 } from "lucide-react";
import { useOperational } from "../../context/OperationalContext";
import { useAuth } from "../../context/AuthContext";
import type { MovementType } from "../../types";
import { MOVEMENT_LABELS } from "../../lib/planning";

interface RecordMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordMovementModal: React.FC<RecordMovementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { authoritativeCenters, recordMovementEvent, dispatchHeadroomFor } = useOperational();
  const { currentUser } = useAuth();
  const isOperator = currentUser?.role === "hub_operator";
  // Operators report facts for their own center only, and never dispatch (coordinator action).
  const allowedTypes: MovementType[] = isOperator
    ? ["receipt", "in_transit", "collection", "center_damage", "transit_loss", "return"]
    : ["dispatch", "receipt", "in_transit", "collection", "transit_loss", "center_damage", "return"];
  const allowedCenters = isOperator
    ? authoritativeCenters.filter((c) => c.centerId === currentUser?.assignedFacilityId)
    : authoritativeCenters;

  const newWaybill = () => `WB-MMR-${Math.floor(1000 + Math.random() * 9000)}`;
  const [centerId, setCenterId] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("dispatch");
  const [quantityText, setQuantityText] = useState("20");
  const [waybill, setWaybill] = useState(newWaybill);
  const [carrier, setCarrier] = useState("State Logistics Fleet #MH-04-E-8821");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Each opening is a new report: reset the form (a reused waybill number would duplicate one).
  useEffect(() => {
    if (!isOpen) return;
    setCenterId(allowedCenters[0]?.centerId ?? "");
    setMovementType(allowedTypes[0]);
    setQuantityText("20");
    setWaybill(newWaybill());
    setCarrier("State Logistics Fleet #MH-04-E-8821");
    setNotes("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentUser?.id]);

  if (!isOpen) return null;

  const headroom = centerId ? dispatchHeadroomFor(centerId) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allowedCenters.some((c) => c.centerId === centerId)) {
      setError("You are not assigned to this center.");
      return;
    }
    if (!/^\d+$/.test(quantityText.trim())) {
      setError("Quantity must be a whole number of kits.");
      return;
    }
    if (!waybill.trim()) {
      setError("A waybill or challan number is required.");
      return;
    }
    const selectedCenter = authoritativeCenters.find((c) => c.centerId === centerId);
    const result = recordMovementEvent({
      periodId: "2026-W46",
      centerId,
      centerName: selectedCenter?.centerName || centerId,
      movementType,
      quantityKits: Number(quantityText.trim()),
      waybillNumber: waybill.trim(),
      carrierOrAgent: carrier.trim() || "Local Transport Service",
      verifiedBy: `${currentUser?.name || "Authorized Officer"} (${currentUser?.roleTitle || "Operations"})`,
      notes: notes.trim() || "Operational transit logged via terminal.",
    });
    if (!result.ok) {
      setError(result.message ?? "This movement could not be recorded.");
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-semibold text-zinc-900 font-sans">
              Record Physical Movement Waybill
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Movement Fact Type *</label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as MovementType)}
                className="w-full border border-zinc-300 rounded-lg p-2 font-medium"
              >
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>
                    {MOVEMENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Target Distribution Center *</label>
              <select
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
                disabled={isOperator}
                className="w-full border border-zinc-300 rounded-lg p-2 font-medium"
              >
                {allowedCenters.map((c) => (
                  <option key={c.centerId} value={c.centerId}>
                    {c.centerName} ({c.centerId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Quantity (Standard Kits) *</label>
              <input
                required
                type="number"
                min={movementType === "in_transit" ? 0 : 1}
                step={1}
                value={quantityText}
                onChange={(e) => setQuantityText(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg p-2 font-mono font-bold text-sm"
              />
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Waybill / Challan Number *</label>
              <input
                required
                type="text"
                value={waybill}
                onChange={(e) => setWaybill(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg p-2 font-mono"
              />
            </div>
          </div>

          {movementType === "dispatch" && (
            <p className="text-[11px] text-zinc-500">
              Published plan leaves <span className="font-mono font-semibold text-zinc-800">{Math.max(0, headroom)}</span> kits to dispatch to this center.
            </p>
          )}
          {movementType === "in_transit" && (
            <p className="text-[11px] text-zinc-500">Carrier's latest count of kits still on the road. It replaces the previous report and explains that part of the gap.</p>
          )}
          {error && (
            <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
              {error}
            </div>
          )}
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">Carrier / Transport Details</label>
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g. State Logistics Fleet #MH-04-E-8821"
              className="w-full border border-zinc-300 rounded-lg p-2"
            />
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">Operational Audit Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Batch inspected; seal intact upon departure from central depot."
              className="w-full border border-zinc-300 rounded-lg p-2"
            />
          </div>

          <div className="pt-2 border-t border-zinc-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Append to Official Ledger
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
