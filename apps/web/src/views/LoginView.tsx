import React, { useState } from "react";
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  User,
  KeyRound,
  Building2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Building,
  HeartHandshake,
  SlidersHorizontal,
} from "lucide-react";
import { FairShareLogo } from "../components/brand/FairShareLogo";
import { useAuth, PRESET_PROFILES, UserProfile, UserRole } from "../context/AuthContext";

export const LoginView: React.FC = () => {
  const { login, loginCustom } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");
  const [email, setEmail] = useState("swayam.ruparel@relief.maharashtra.gov.in");
  const [password, setPassword] = useState("••••••••••••");
  const [agency, setAgency] = useState("Maharashtra State Food Distribution Authority");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switch role tab
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    const preset = PRESET_PROFILES.find((p) => p.role === role);
    if (preset) {
      setEmail(preset.email);
      setAgency(preset.agency);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please provide a valid official email address.");
      return;
    }

    // Match preset profile
    const matched = PRESET_PROFILES.find(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (matched) {
      login(matched);
    } else {
      loginCustom(email.trim(), selectedRole, agency);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 antialiased selection:bg-emerald-500/20 selection:text-emerald-900 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <FairShareLogo size="lg" showTagline={false} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-950 font-sans">
          FairShare Humanitarian Logistics
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Official Disaster Relief & Resource Distribution Terminal
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-white py-8 px-6 sm:px-8 border border-zinc-200/80 rounded-2xl shadow-sm space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Portal Selector Tabs */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono text-center">
              Select Your Access Portal
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-100 rounded-xl">
              {/* Admin Tab */}
              <button
                type="button"
                onClick={() => handleSelectRole("admin")}
                className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                  selectedRole === "admin"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 mb-1 text-emerald-600" />
                <span>State Admin</span>
              </button>

              {/* Warehouse Hub Tab */}
              <button
                type="button"
                onClick={() => handleSelectRole("hub_operator")}
                className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                  selectedRole === "hub_operator"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <Building className="w-4 h-4 mb-1 text-blue-600" />
                <span>Warehouse Hub</span>
              </button>

              {/* Community NGO Tab */}
              <button
                type="button"
                onClick={() => handleSelectRole("community_ngo")}
                className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                  selectedRole === "community_ngo"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <HeartHandshake className="w-4 h-4 mb-1 text-amber-600" />
                <span>Community NGO</span>
              </button>
            </div>
          </div>

          {/* Context Explainer */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-600 leading-relaxed">
            {selectedRole === "admin" && (
              <span>
                <strong>State Command:</strong> Full authority over food reserves, 30-district Max-Min fairness planning, and official register publishing.
              </span>
            )}
            {selectedRole === "hub_operator" && (
              <span>
                <strong>Warehouse Depot:</strong> Scoped exclusively to your local hub (CTR-B). Report usable daily capacity and confirm incoming truck arrivals.
              </span>
            )}
            {selectedRole === "community_ngo" && (
              <span>
                <strong>Community Requester:</strong> Scoped to your vulnerable ward. Submit family food headcount needs and track inbound relief deliveries.
              </span>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Official Agency / Facility Tenant
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Authorized Officer / Lead Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-zinc-700">
                  Security Passkey
                </label>
                <span className="text-[11px] text-zinc-400 font-mono">256-bit Authenticated</span>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg shadow-sm text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none transition-colors"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Launch {selectedRole === "admin" ? "State Command" : selectedRole === "hub_operator" ? "Depot Portal" : "Aid Portal"}
            </button>
          </form>

          {/* Quick 1-Click Profile Cards */}
          <div className="pt-4 border-t border-zinc-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-2 font-mono text-center">
              1-Click Verified Officer Profiles
            </span>
            <div className="space-y-2">
              {PRESET_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => login(p)}
                  className="w-full p-2.5 rounded-lg border border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-left flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-7 h-7 rounded-full ${p.avatarColor} text-white flex items-center justify-center text-xs font-bold shrink-0`}
                    >
                      {p.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-900 group-hover:text-emerald-800">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {p.roleTitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 group-hover:bg-emerald-100 text-zinc-600 group-hover:text-emerald-800">
                    {p.role.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Footer */}
        <div className="mt-6 text-center text-[11px] text-zinc-400 space-y-1">
          <p className="flex items-center justify-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Multi-Tenant Partitioned • Role Scoped Access Control</span>
          </p>
          <p>Government of Maharashtra • Relief & Rehabilitation Department</p>
        </div>
      </div>
    </div>
  );
};
