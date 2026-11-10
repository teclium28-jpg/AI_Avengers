import React from "react";
import {
  LayoutGrid,
  UploadCloud,
  ShieldCheck,
  GitCompare,
  Building2,
  Calendar,
  Activity,
  UserCheck,
  Lock,
} from "lucide-react";
import type { ActiveTab, UserRole } from "../../types";

interface AppHeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  hasStagedChanges: boolean;
  currentRevision: number;
  measuredLatencyMs: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  onTabChange,
  currentRole,
  onRoleChange,
  hasStagedChanges,
  currentRevision,
  measuredLatencyMs,
}) => {
  return (
    <header className="bg-white border-b border-zinc-200 sticky top-0 z-40">
      {/* Top utility bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 border-b border-zinc-100">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-lg tracking-tight text-zinc-950 font-sans">
                FairShare
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                v3.1 Baseline
              </span>
            </div>

            <div className="hidden md:flex items-center pl-4 border-l border-zinc-200 space-x-3 text-xs text-zinc-600">
              <div className="flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-medium text-zinc-800">Mumbai Central Relief</span>
                <span className="text-zinc-400 font-mono">(#ORG-A41)</span>
              </div>
              <span className="text-zinc-300">•</span>
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                <span className="font-mono">2026-W46 (Nov 10 – Nov 16)</span>
              </div>
            </div>
          </div>

          {/* System status pills & role identity */}
          <div className="flex items-center space-x-3">
            {/* Authority Status Pill */}
            {hasStagedChanges ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                Uncommitted Local Preview
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Lock className="w-3 h-3 text-emerald-600 mr-1.5" />
                Authoritative Register <span className="font-mono ml-1 font-semibold">r{currentRevision}</span>
              </span>
            )}

            {/* Network Latency */}
            <div className="hidden lg:flex items-center space-x-1.5 text-xs text-zinc-500 px-2 py-1 bg-zinc-50 rounded border border-zinc-200">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pooler:</span>
              <span className="font-mono text-zinc-700 font-medium">{measuredLatencyMs}ms</span>
            </div>

            {/* Simulated Persona Switcher Guard */}
            <div className="flex items-center space-x-2 pl-2 border-l border-zinc-200">
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-300 uppercase tracking-wider">
                Demo Mode
              </span>
              <div className="flex items-center space-x-1.5 text-xs">
                <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={currentRole}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className="text-xs font-medium text-zinc-800 bg-transparent border-0 py-0 pl-1 pr-6 focus:ring-0 cursor-pointer"
                  title="Simulated User Identity (Demo Perspective)"
                >
                  <option value="coordinator">Swayam (Coordinator)</option>
                  <option value="operator">Ishaan (Center Operator)</option>
                  <option value="reviewer">Ananya (Reviewer)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-8 -mb-px overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => onTabChange("practice")}
            className={`inline-flex items-center py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === "practice"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            Practice Desk
            {hasStagedChanges && (
              <span className="ml-2 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            onClick={() => onTabChange("intake")}
            className={`inline-flex items-center py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === "intake"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            Data Intake (CSV)
          </button>

          <button
            onClick={() => onTabChange("receipts")}
            className={`inline-flex items-center py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === "receipts"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          >
            <ShieldCheck className="w-4 h-4 mr-2" />
            Decision Receipts & Audit
          </button>

          <button
            onClick={() => onTabChange("reconciliation")}
            className={`inline-flex items-center py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === "reconciliation"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          >
            <GitCompare className="w-4 h-4 mr-2" />
            Reconciliation & Export
          </button>
        </nav>
      </div>
    </header>
  );
};
