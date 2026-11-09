import React, { useState } from "react";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Building2,
  UploadCloud,
  Truck,
  ShieldCheck,
  Search,
  Bell,
  RefreshCw,
  Lock,
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useOperational } from "../../context/OperationalContext";
import type { NavigationPage } from "../../types";
import { FairShareLogo, FairShareIcon } from "../brand/FairShareLogo";

interface AppLayoutProps {
  children: React.ReactNode;
  onOpenPublishModal: () => void;
  onOpenRecordMovementModal: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  onOpenPublishModal,
  onOpenRecordMovementModal,
}) => {
  const {
    activePage,
    setActivePage,
    organizationName,
    periodName,
    authoritativeRevision,
    hasStagedChanges,
    userName,
    userRole,
    resetToFactoryDefaults,
  } = useOperational();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const navItems: { id: NavigationPage; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: "dashboard", label: "Operations Overview", icon: LayoutDashboard },
    {
      id: "studio",
      label: "Allocation Studio",
      icon: SlidersHorizontal,
      badge: hasStagedChanges ? "Staged" : undefined,
    },
    { id: "centers", label: "Distribution Nodes", icon: Building2 },
    { id: "intake", label: "Data Intake & Batching", icon: UploadCloud },
    { id: "reconciliation", label: "Dispatch & Transit Ledger", icon: Truck },
    { id: "audit", label: "Audit Trail & Receipts", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row antialiased text-zinc-900 font-sans">
      {/* =========================================
          DESKTOP SIDEBAR NAVIGATION (Stripe / Linear style)
          ========================================= */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-zinc-200 shrink-0">
        {/* Brand & Organization */}
        <div className="p-5 border-b border-zinc-100 flex flex-col space-y-1">
          <FairShareLogo size="md" />
          <div className="mt-3 pt-3 border-t border-zinc-100">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block font-mono">
              Authority Tenant
            </span>
            <span className="text-xs font-medium text-zinc-800 line-clamp-1 mt-0.5">
              {organizationName}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-800 font-semibold"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/70"
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? "text-emerald-600" : "text-zinc-400 group-hover:text-zinc-600"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Operational Status & Footer */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50/50 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-600 font-medium flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              Network Online
            </span>
            <span className="text-[11px] text-zinc-400 font-mono">Cycle W46</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-zinc-200/70">
            <span>Official Register:</span>
            <span className="font-mono font-bold text-emerald-700">Rev {authoritativeRevision}</span>
          </div>
        </div>
      </aside>

      {/* =========================================
          MAIN APPLICATION AREA
          ========================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Command Bar */}
        <header className="bg-white border-b border-zinc-200 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 sticky top-0 z-30">
          <div className="flex items-center space-x-3">
            {/* Mobile menu toggle & brand icon */}
            <div className="flex items-center space-x-2 md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <FairShareIcon size={26} />
            </div>

            {/* Current Active Context Badge */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-zinc-800 hidden sm:inline">
                {periodName}
              </span>
              {hasStagedChanges ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                  Staged Practice Draft
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Lock className="w-3 h-3 text-emerald-600 mr-1" />
                  Official Register r{authoritativeRevision}
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions & User Profile */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenRecordMovementModal}
              className="hidden sm:inline-flex items-center px-3 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 transition-colors shadow-sm"
            >
              <Truck className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
              Record Waybill
            </button>

            {hasStagedChanges && (
              <button
                onClick={onOpenPublishModal}
                className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
              >
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Publish Revision r{authoritativeRevision + 1}
              </button>
            )}

            {/* Profile Avatar & Info */}
            <div className="relative pl-3 border-l border-zinc-200 flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-zinc-900 text-white font-semibold flex items-center justify-center text-xs">
                {userName.slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden lg:block text-left">
                <span className="text-xs font-semibold text-zinc-900 block leading-none">
                  {userName}
                </span>
                <span className="text-[10px] text-zinc-500 leading-tight block">
                  {userRole}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-zinc-200 bg-white p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium ${
                    isActive ? "bg-emerald-50 text-emerald-800 font-semibold" : "text-zinc-600"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Workspace Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
