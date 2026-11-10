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
} from "lucide-react";
import { FairShareLogo } from "../components/brand/FairShareLogo";
import { useAuth, PRESET_PROFILES, UserProfile } from "../context/AuthContext";

export const LoginView: React.FC = () => {
  const { login, loginCustom } = useAuth();

  const [email, setEmail] = useState("swayam.ruparel@relief.maharashtra.gov.in");
  const [password, setPassword] = useState("••••••••••••");
  const [agency, setAgency] = useState("Maharashtra State Food Distribution Authority");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !email.includes("@")) {
      setError("Please provide a valid official officer email address.");
      return;
    }

    // Match preset profile if email matches
    const matched = PRESET_PROFILES.find(
      (p) => p.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (matched) {
      login(matched);
    } else {
      loginCustom(email.trim(), password, agency);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo */}
        <div className="flex justify-center mb-4">
          <FairShareLogo size="lg" showTagline={false} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-950 font-sans">
          Humanitarian Logistics Terminal
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Official Disaster Relief Allocation & Cryptographic Register Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-8 border border-zinc-200/80 rounded-2xl shadow-sm space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Agency / Authority Tenant */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Relief Authority / Agency Tenant
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <select
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                >
                  <option value="Maharashtra State Food Distribution Authority">
                    Maharashtra State Food Distribution Authority
                  </option>
                  <option value="National Disaster Management Authority">
                    National Disaster Management Authority (NDMA)
                  </option>
                  <option value="UN World Food Programme Regional Bureau">
                    UN World Food Programme Regional Logistics Hub
                  </option>
                </select>
              </div>
            </div>

            {/* Officer Email */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Officer Email / Government ID
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="officer@relief.gov.in"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-zinc-700">
                  Security Passkey
                </label>
                <span className="text-[11px] text-zinc-400">Authorized Personnel Only</span>
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

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" />
              Authenticate & Launch Terminal
            </button>
          </form>

          {/* Quick Sign-In Profiles */}
          <div className="pt-5 border-t border-zinc-100">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 block mb-2 font-mono text-center">
              Fast Officer Sign-In
            </span>
            <div className="space-y-2">
              {PRESET_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => login(profile)}
                  className="w-full p-2.5 rounded-lg border border-zinc-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-left flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-7 h-7 rounded-full ${profile.avatarColor} text-white flex items-center justify-center text-xs font-bold shrink-0`}
                    >
                      {profile.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-zinc-900 group-hover:text-emerald-800">
                        {profile.name}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {profile.roleTitle}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-100 group-hover:bg-emerald-100 text-zinc-600 group-hover:text-emerald-800">
                    {profile.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security & Audit Footer */}
        <div className="mt-6 text-center text-[11px] text-zinc-400 space-y-1">
          <p className="flex items-center justify-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-bit TLS encrypted session • SHA-256 decision provenance</span>
          </p>
          <p>Government of Maharashtra • Relief & Rehabilitation Department</p>
        </div>
      </div>
    </div>
  );
};
