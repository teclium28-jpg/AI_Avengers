import React, { useState } from "react";
import {
  Building2,
  Plus,
  MapPin,
  User,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
} from "lucide-react";
import { useOperational } from "../context/OperationalContext";
import { useAuth } from "../context/AuthContext";
import type { CenterEntity, RegionEntity } from "../types";

export const CentersView: React.FC = () => {
  const { currentUser } = useAuth();
  const role = currentUser?.role || "admin";

  const {
    stagedCenters,
    updateCenterCapacity,
    toggleCenterStatus,
    addNewCenter,
    stagedRegions,
  } = useOperational();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form state for adding new center
  const [newCenterId, setNewCenterId] = useState("");
  const [newCenterName, setNewCenterName] = useState("");
  const [newCapacity, setNewCapacity] = useState(50);
  const [newAddress, setNewAddress] = useState("");
  const [newContact, setNewContact] = useState("");

  const filteredCenters = stagedCenters.filter(
    (c: CenterEntity) =>
      c.centerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.centerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCenterId.trim() || !newCenterName.trim()) return;

    addNewCenter({
      centerId: newCenterId.toUpperCase().trim(),
      centerName: newCenterName.trim(),
      configuredCapacity: newCapacity,
      operatingStatus: "active",
      address: newAddress.trim() || "Local Municipal Facility",
      contactPerson: newContact.trim() || "Assigned Operations Staff",
    });

    setIsAddModalOpen(false);
    setNewCenterId("");
    setNewCenterName("");
    setNewCapacity(50);
    setNewAddress("");
    setNewContact("");
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-950 font-sans">
            Distribution Centers & Logistics Nodes
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Physical handling infrastructure, warehouse capacity limits, and operating readiness.
          </p>
        </div>

        {role === "admin" && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Distribution Center
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by center name, code, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <span className="text-xs font-mono text-zinc-500">
          {filteredCenters.length} Nodes Registered
        </span>
      </div>

      {/* Centers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCenters.map((center: CenterEntity) => {
          const assignedRegions = stagedRegions.filter(
            (r: RegionEntity) => r.assignedCenterId === center.centerId
          );
          const totalAssignedDemand = assignedRegions.reduce(
            (sum: number, r: RegionEntity) => sum + r.demandKits,
            0
          );
          const isClosed = center.operatingStatus === "closed";

          return (
            <div
              key={center.centerId}
              className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 transition-all ${
                isClosed
                  ? "border-zinc-200 bg-zinc-50/60 opacity-80"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-mono font-bold text-zinc-400 block">
                    {center.centerId}
                  </span>
                  <h3 className="text-sm font-bold text-zinc-900 mt-0.5">{center.centerName}</h3>
                </div>
                <button
                  onClick={() => toggleCenterStatus(center.centerId)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    center.operatingStatus === "active"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                      : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100"
                  }`}
                >
                  {center.operatingStatus === "active" ? "Active" : "Closed"}
                </button>
              </div>

              {/* Address and Contact info */}
              <div className="space-y-1.5 text-xs text-zinc-500 border-t border-zinc-100 pt-3">
                <div className="flex items-start space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{center.address || "Main Municipal Storehouse"}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>{center.contactPerson || "Operations Staff"}</span>
                </div>
              </div>

              {/* Capacity Slider & Metrics */}
              <div className="space-y-2 border-t border-zinc-100 pt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-600 font-medium">Handling Capacity Limit:</span>
                  <span className="font-mono font-bold text-zinc-900 text-sm">
                    {center.configuredCapacity} kits
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={120}
                  step={5}
                  disabled={isClosed}
                  value={center.configuredCapacity}
                  onChange={(e) => updateCenterCapacity(center.centerId, parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-600 disabled:opacity-30 cursor-pointer"
                />

                <div className="flex justify-between text-[11px] text-zinc-500 font-mono pt-1">
                  <span>Assigned Demand: {totalAssignedDemand} kits</span>
                  <span>Dispatched: {center.committedDispatches} kits</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Center Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-zinc-900 font-sans">
              Register New Distribution Node
            </h3>
            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Center Code / ID *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. CTR-D"
                  value={newCenterId}
                  onChange={(e) => setNewCenterId(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Center Display Name *</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Eastern Suburb Hub (Chembur Warehouse)"
                  value={newCenterName}
                  onChange={(e) => setNewCenterName(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Handling Capacity (kits)</label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value, 10) || 0)}
                  className="w-full border border-zinc-300 rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Address / Landmark</label>
                <input
                  type="text"
                  placeholder="e.g. Municipal Ward M-West Depot, Chembur"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-700 block mb-1">Site Supervisor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Manoj Kulkarni"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-zinc-300 rounded-lg text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700"
                >
                  Register Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
