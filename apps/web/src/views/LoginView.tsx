import React, { useState } from "react";
import {
  Lock,
  ArrowRight,
  User,
  KeyRound,
  Building2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  HeartHandshake,
  SlidersHorizontal,
} from "lucide-react";
import { FairShareLogo } from "../components/brand/FairShareLogo";
import { useAuth, OFFICIAL_USERS } from "../context/AuthContext";

export const LoginView: React.FC = () => {
  const { loginWithCredentials } = useAuth();

  const [selectedUserKey, setSelectedUserKey] = useState<string>("swayam");
  const [identifier, setIdentifier] = useState<string>("swayam");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSelectQuickUser = (userKey: string) => {
    setSelectedUserKey(userKey);
    setIdentifier(userKey);
    setPassword("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await loginWithCredentials(identifier, password);
      if (!res.success) {
        setError(res.error || "Authentication failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 antialiased selection:bg-emerald-500/20 selection:text-emerald-900 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <FairShareLogo size="lg" showTagline={false} />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-zinc-950 font-sans">
          FairShare Humanitarian Terminal
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Official Disaster Relief Logistics & Progressive Max-Min Distribution Register
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-white py-8 px-6 sm:px-8 border border-zinc-200/80 rounded-2xl shadow-sm space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Select Profile Tabs */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono text-center">
              Choose Authorized Officer
            </label>
            <div className="grid grid-cols-3 gap-2 p-1.5 bg-zinc-100 rounded-xl">
              {OFFICIAL_USERS.map((user) => {
                const isSelected = selectedUserKey === user.username;
                const icon =
                  user.role === "admin" ? (
                    <SlidersHorizontal className="w-4 h-4 mb-1 text-emerald-600" />
                  ) : user.role === "hub_operator" ? (
                    <Building2 className="w-4 h-4 mb-1 text-blue-600" />
                  ) : (
                    <HeartHandshake className="w-4 h-4 mb-1 text-amber-600" />
                  );

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectQuickUser(user.username)}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? "bg-white text-zinc-950 shadow-sm"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {icon}
                    <span className="font-sans font-bold text-xs">{user.name.split(" ")[0]}</span>
                    <span className="text-[10px] text-zinc-400 capitalize mt-0.5">
                      {user.role === "admin"
                        ? "Admin"
                        : user.role === "hub_operator"
                        ? "Depot CTR-B"
                        : "NGO Ward B"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username / Email field */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Username or Official Email
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    const matched = OFFICIAL_USERS.find(
                      (u) => u.username.toLowerCase() === e.target.value.toLowerCase()
                    );
                    if (matched) setSelectedUserKey(matched.username);
                  }}
                  placeholder="e.g. swayam, sunita, farhan"
                  className="block w-full pl-9 pr-3 py-2 text-xs border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-500 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-zinc-700">
                  Access Password
                </label>
              </div>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter access password"
                  className="block w-full pl-9 pr-9 py-2 text-xs border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-500 text-zinc-900 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Selected User Info Banner */}
            {OFFICIAL_USERS.find((u) => u.username === selectedUserKey) && (
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs flex items-center space-x-2.5">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold ${
                    OFFICIAL_USERS.find((u) => u.username === selectedUserKey)?.avatarColor
                  }`}
                >
                  {OFFICIAL_USERS.find((u) => u.username === selectedUserKey)?.name[0]}
                </div>
                <div className="truncate">
                  <div className="font-semibold text-zinc-900">
                    {OFFICIAL_USERS.find((u) => u.username === selectedUserKey)?.name}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {OFFICIAL_USERS.find((u) => u.username === selectedUserKey)?.roleTitle} •{" "}
                    {OFFICIAL_USERS.find((u) => u.username === selectedUserKey)?.agency}
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5 mr-2" />
              {isSubmitting ? "Authenticating..." : "Sign In to Terminal"}
              <ArrowRight className="w-3.5 h-3.5 ml-2" />
            </button>
          </form>

          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
            Demo build: this sign-in runs in the browser and is not a security boundary. Real access is enforced by the API.
          </p>

          {/* Institutional Compliance Notice */}
          <div className="pt-4 border-t border-zinc-100 flex items-center justify-center space-x-1.5 text-[11px] text-zinc-400 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>State Logistics Grid • SHA-256 Ledger Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
};
