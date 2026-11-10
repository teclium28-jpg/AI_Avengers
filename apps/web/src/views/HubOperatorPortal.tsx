import React, { useState } from "react";
import {
  Building2,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  PlusCircle,
  FileText,
  MapPin,
  Sliders,
  LogOut,
} from "lucide-react";
import { useAuth, PRESET_PROFILES } from "../context/AuthContext";
import { useOperational } from "../context/OperationalContext";
import { FairShareLogo } from "../components/brand/FairShareLogo";

export const HubOperatorPortal: React.FC = () => {
  const { currentUser, logout, switchProfile } = useAuth();
  const {
    stagedCenters,
    updateCenterCapacity,
    toggleCenterStatus,
    movements,
    recordMovementEvent,
    currentPlan,
  } = useOperational();

  const facilityId = currentUser?.assignedFacilityId || "CTR-B";
  const myCenter = stagedCenters.find((c) => c.centerId === facilityId) || stagedCenters[0];

  const [capacityInput, setCapacityInput] = useState<number>(myCenter?.configuredCapacity || 40);
  const [disruptionNote, setDisruptionNote] = useState<string>("");
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Inbound arrival modal
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalQty, setArrivalQty] = useState(35);
  const [arrivalWaybill, setArrivalWaybill] = useState(`WB-MMR-${Math.floor(4000 + Math.random() * 900)}`);
  const [arrivalNotes, setArrivalNotes] = useState("");

  // Filter movements for this warehouse
  const myMovements = movements.filter((m) => m.centerId === facilityId);

  // Filter assigned region
  const myAllocation = currentPlan.find((p) => p.assignedCenterId === facilityId);

  const handleUpdateCapacity = (e: React.FormEvent) => {
    e.preventDefault();
    updateCenterCapacity(facilityId, capacityInput);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleLogArrival = (e: React.FormEvent) => {
    e.preventDefault();
    recordMovementEvent({
      waybillNumber: arrivalWaybill,
      periodId: "2026-W46",
      centerId: facilityId,
      centerName: myCenter?.centerName || "Local Depot",
      movementType: "receipt",
      quantityKits: arrivalQty,
      carrierOrAgent: "State Logistics Fleet #MH-04-E-8821",
      verifiedBy: currentUser?.name || "Depot Lead",
      notes: arrivalNotes || "Verified and scanned at unloading dock",
    });
    setShowArrivalModal(false);
    setArrivalNotes("");
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Top Hub Navigation Bar */}
      <header className="bg-white border-b border-zinc-200 h-16 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <FairShareLogo size="sm" showTagline={false} />
          <span className="h-4 w-px bg-zinc-200 mx-1" />
          <span className="text-xs font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-md font-mono">
            Warehouse Hub Portal
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-zinc-900">{currentUser?.name}</div>
            <div className="text-[10px] text-zinc-500">{myCenter?.centerName}</div>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={currentUser?.id}
              onChange={(e) => switchProfile(e.target.value)}
              className="text-xs py-1 px-2 border border-zinc-300 rounded-lg bg-white text-zinc-700 focus:outline-none"
            >
              {PRESET_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role.replace("_", " ")})
                </option>
              ))}
            </select>

            <button
              onClick={logout}
              className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-zinc-100"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 flex-1">
        {/* Hub Header Card */}
        <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Facility ID: {myCenter?.centerId}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  myCenter?.operatingStatus === "active"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-rose-50 text-rose-800"
                }`}
              >
                ● {myCenter?.operatingStatus === "active" ? "Operational" : "Offline / Closed"}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-950 font-sans mt-2">
              {myCenter?.centerName}
            </h1>
            <p className="text-xs text-zinc-500 mt-1 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              {myCenter?.address}
            </p>
          </div>

          <button
            onClick={() => toggleCenterStatus(facilityId)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors shrink-0 ${
              myCenter?.operatingStatus === "active"
                ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {myCenter?.operatingStatus === "active" ? "Mark Facility Offline (Emergency)" : "Mark Facility Operational"}
          </button>
        </div>

        {/* 2-Column Operational Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Action 1: Report Capacity / Road Disruptions */}
          <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-sans">
                Report Warehouse Throughput Limit
              </h2>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              If local roads are flooded, loading docks are blocked, or staff is restricted, enter your true usable daily kit limit. The State Allocation Engine will automatically redistribute excess food to accessible neighboring zones.
            </p>

            <form onSubmit={handleUpdateCapacity} className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1">
                  Usable Daily Handling Capacity (Kits / Day)
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    value={capacityInput}
                    onChange={(e) => setCapacityInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-32 px-3 py-2 border border-zinc-300 rounded-lg text-base font-mono font-bold text-zinc-900 text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-zinc-500 font-medium">Standard Kits</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-800 block mb-1">
                  Reason / Ground Disruption Report
                </label>
                <textarea
                  rows={2}
                  value={disruptionNote}
                  onChange={(e) => setDisruptionNote(e.target.value)}
                  placeholder="e.g. Heavy rain flooded the bridge culvert; small vehicles only."
                  className="w-full text-xs p-2.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-800"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {saveSuccess ? (
                  <span className="text-xs font-semibold text-emerald-700 flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
                    Capacity updated in central system!
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400">Syncs immediately to State Command</span>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Save Hub Capacity
                </button>
              </div>
            </form>
          </div>

          {/* Quick Stats: My Assigned Zone */}
          <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-100">
                <Package className="w-4 h-4 text-emerald-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900 font-sans">
                  Assigned Community Relief Zone
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Distribution Ward:</span>
                  <span className="font-bold text-zinc-900">{myAllocation?.regionName || "Zone 2 — Dharavi Sector"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Estimated Community Demand:</span>
                  <span className="font-mono font-bold text-zinc-900">{myAllocation?.demandKits || 60} kits</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">State Approved Quota:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {myAllocation?.allocatedKits || 40} kits
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Coverage Level:</span>
                  <span className="font-mono font-bold text-zinc-900">
                    {myAllocation?.coveragePercentage ? myAllocation.coveragePercentage.toFixed(1) : "66.7"}%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs text-zinc-600">
              Allocated quotas are strictly enforced by the State Progressive Max-Min fairness engine.
            </div>
          </div>
        </div>

        {/* Section 2: Inbound Trucks & Deliveries */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-zinc-900 font-sans">
                Truck Dispatches & Received Waybills
              </h3>
            </div>

            <button
              onClick={() => setShowArrivalModal(true)}
              className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              Confirm Truck Arrival
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-left text-xs">
              <thead className="bg-zinc-50 font-semibold text-zinc-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Waybill Number</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 font-mono text-right">Quantity</th>
                  <th className="py-3 px-4">Carrier / Vehicle</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Verified By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {myMovements.length > 0 ? (
                  myMovements.map((m) => (
                    <tr key={m.recordId} className="hover:bg-zinc-50">
                      <td className="py-3 px-4 font-mono font-bold text-zinc-900">{m.waybillNumber}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            m.movementType === "receipt"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-blue-50 text-blue-800"
                          }`}
                        >
                          {m.movementType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-bold text-zinc-900">
                        {m.quantityKits} kits
                      </td>
                      <td className="py-3 px-4 text-zinc-600">{m.carrierOrAgent}</td>
                      <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">{m.timestampIST}</td>
                      <td className="py-3 px-4 text-zinc-700">{m.verifiedBy}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-400 italic">
                      No waybills logged for this facility yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Confirm Arrival Modal */}
      {showArrivalModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 font-sans">
              Confirm Inbound Truck Arrival
            </h3>
            <p className="text-xs text-zinc-500">
              Record physical unloading of food kits at {myCenter?.centerName}.
            </p>

            <form onSubmit={handleLogArrival} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Waybill #</label>
                <input
                  type="text"
                  required
                  value={arrivalWaybill}
                  onChange={(e) => setArrivalWaybill(e.target.value)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg font-mono text-zinc-900"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Kits Received Count</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={arrivalQty}
                  onChange={(e) => setArrivalQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg font-mono text-zinc-900 font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Inspection Notes</label>
                <textarea
                  rows={2}
                  value={arrivalNotes}
                  onChange={(e) => setArrivalNotes(e.target.value)}
                  placeholder="e.g. 35 sealed kits received, packaging in good condition."
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg text-zinc-800"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowArrivalModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 border border-zinc-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Save Inbound Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
