import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "coordinator" | "operator" | "reviewer";
  roleTitle: string;
  agency: string;
  department: string;
  badgeNumber: string;
  avatarColor: string;
}

export const PRESET_PROFILES: UserProfile[] = [
  {
    id: "USR-SWAYAM",
    name: "Swayam Ruparel",
    email: "swayam.ruparel@relief.maharashtra.gov.in",
    role: "coordinator",
    roleTitle: "Chief Operations Coordinator",
    agency: "Maharashtra State Food Distribution Authority",
    department: "Executive Logistics Directorate",
    badgeNumber: "DIR-8812",
    avatarColor: "bg-emerald-600",
  },
  {
    id: "USR-ISHAAN",
    name: "Ishaan Deshmukh",
    email: "ishaan.deshmukh@relief.maharashtra.gov.in",
    role: "operator",
    roleTitle: "Logistics & Fleet Dispatcher",
    agency: "Maharashtra State Food Distribution Authority",
    department: "Central Warehouse & Fleet Operations",
    badgeNumber: "OPS-4421",
    avatarColor: "bg-blue-600",
  },
  {
    id: "USR-ANANYA",
    name: "Ananya Sharma",
    email: "ananya.sharma@audit.gov.in",
    role: "reviewer",
    roleTitle: "Independent Integrity Auditor",
    agency: "Humanitarian Oversight & Comptroller Commission",
    department: "Forensic Audit & Public Transparency",
    badgeNumber: "AUD-9018",
    avatarColor: "bg-purple-600",
  },
];

interface AuthContextValue {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  login: (profile: UserProfile) => void;
  loginCustom: (email: string, password?: string, agency?: string) => boolean;
  logout: () => void;
  switchProfile: (userId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("fairshare_auth_user");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Default to Swayam (Coordinator) so the terminal is immediately operational,
    // but the user can sign out anytime to see the login screen or switch users!
    return PRESET_PROFILES[0];
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("fairshare_auth_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("fairshare_auth_user");
    }
  }, [currentUser]);

  const login = (profile: UserProfile) => {
    setCurrentUser(profile);
  };

  const loginCustom = (email: string, _password?: string, agency?: string): boolean => {
    if (!email || !email.includes("@")) return false;
    const namePart = email.split("@")[0].replace(/[._]/g, " ");
    const formattedName = namePart
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    const newProfile: UserProfile = {
      id: `USR-${Date.now().toString().slice(-4)}`,
      name: formattedName || "Authorized Officer",
      email,
      role: email.toLowerCase().includes("audit") ? "reviewer" : email.toLowerCase().includes("ops") ? "operator" : "coordinator",
      roleTitle: email.toLowerCase().includes("audit") ? "Integrity Auditor" : email.toLowerCase().includes("ops") ? "Fleet Operator" : "Relief Coordinator",
      agency: agency || "State Disaster Response Agency",
      department: "Logistics Operations Division",
      badgeNumber: `SEC-${Math.floor(1000 + Math.random() * 9000)}`,
      avatarColor: "bg-emerald-700",
    };

    setCurrentUser(newProfile);
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const switchProfile = (userId: string) => {
    const target = PRESET_PROFILES.find((p) => p.id === userId);
    if (target) {
      setCurrentUser(target);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        login,
        loginCustom,
        logout,
        switchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
