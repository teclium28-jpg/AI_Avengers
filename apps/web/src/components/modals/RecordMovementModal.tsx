import React, { useState } from "react";
import { Truck, X, CheckCircle2 } from "lucide-react";
import { useOperational } from "../../context/OperationalContext";
import type { MovementType } from "../../types";

interface RecordMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordMovementModal: React.FC<RecordMovementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { authoritativeCenters, recordMovementEvent } = useOperational();

  const [centerId, setCenterId] = useState(
    authoritativeCenters.length > 0 ? authoritativeCenters[0].centerId : "CTR-A"
  );
  const [movementType, setMovementType] = useState<MovementType>("dispatch");
  const [quantity, setQuantity] = useState<number>(20);
  const [waybill, setWaybill] = useState<string>(`WB-MMR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [carrier, setCarrier] = useState<string>("State Logistics Fleet #MH-04-E-8821");
  const [notes, setNotes] = useState<string>("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedCenter = authoritativeCenters.find((c) => c.centerId === centerId);

    recordMovementEvent({
      periodId: "2026-W46",
      centerId,
      centerName: selectedCenter?.centerName || centerId,
      movementType,
      quantityKits: quantity,
      waybillNumber: waybill.trim() || `WB-MMR-${Date.now().toString().slice(-4)}`,
      carrierOrAgent: carrier.trim() || "Local Transport Service",
      verifiedBy: "Swayam (Chief Operations Coordinator)",
      notes: notes.trim() || "Operational transit logged via terminal.",
    });

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
                <option value="dispatch">Dispatch (Central Warehouse → Center)</option>
                <option value="receipt">Receipt (Arrived at Center)</option>
                <option value="collection">Collection (Distributed to Families)</option>
                <option value="transit_loss">Confirmed Transit Loss / Spoilage</option>
                <option value="center_damage">Center Warehouse Damage</option>
                <option value="return">Return to Central Depot</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-zinc-700 block mb-1">Target Distribution Center *</label>
              <select
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
                className="w-full border border-zinc-300 rounded-lg p-2 font-medium"
              >
                {authoritativeCenters.map((c) => (
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
                min={1}
                max={500}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
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
