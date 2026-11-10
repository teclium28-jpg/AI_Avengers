import React, { createContext, useContext, useState, useEffect } from "react";

export type UserRole = "admin" | "hub_operator" | "community_ngo";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleTitle: string;
  agency: string;
  department: string;
  badgeNumber: string;
  avatarColor: string;
  assignedFacilityId?: string; // for hub operators e.g. "CTR-B"
  assignedRegionId?: string;   // for community NGOs e.g. "B"
}

export const PRESET_PROFILES: UserProfile[] = [
  {
    id: "USR-SWAYAM",
    name: "Swayam Ruparel",
    email: "swayam.ruparel@relief.maharashtra.gov.in",
    role: "admin",
    roleTitle: "State Relief Director",
    agency: "Maharashtra State Food Distribution Authority",
    department: "State Disaster Operations Command",
    badgeNumber: "DIR-8812",
    avatarColor: "bg-emerald-600",
  },
  {
    id: "USR-SUNITA",
    name: "Sunita Kamble",
    email: "sunita.kamble@depot.dharavi.gov.in",
    role: "hub_operator",
    roleTitle: "Dharavi Depot Warehouse Lead",
    agency: "Central Staging Depot (CTR-B)",
    department: "Ward G-North Warehouse & Transport",
    badgeNumber: "HUB-4020",
    avatarColor: "bg-blue-600",
    assignedFacilityId: "CTR-B",
  },
  {
    id: "USR-FARHAN",
    name: "Dr. Farhan Shaikh",
    email: "farhan.shaikh@sneha-relief.org",
    role: "community_ngo",
    roleTitle: "Community Relief Coordinator",
    agency: "Sneha & Dharavi Community Relief NGO",
    department: "Ground Census & Family Assistance",
    badgeNumber: "NGO-7104",
    avatarColor: "bg-amber-600",
    assignedRegionId: "B",
  },
];

interface AuthContextValue {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  login: (profile: UserProfile) => void;
  loginCustom: (email: string, role: UserRole, agency?: string) => boolean;
  logout: () => void;
  switchProfile: (userId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("fairshare_auth_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          // Normalize legacy roles
          if (parsed.role === "coordinator") parsed.role = "admin";
          if (parsed.role === "operator") parsed.role = "hub_operator";
          if (parsed.role === "reviewer") parsed.role = "community_ngo";

          if (["admin", "hub_operator", "community_ngo"].includes(parsed.role)) {
            return parsed as UserProfile;
          }
        }
      } catch {
        return PRESET_PROFILES[0];
      }
    }
    // Default to Swayam (State Admin) so the terminal is immediately operational
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

  const loginCustom = (email: string, role: UserRole, agency?: string): boolean => {
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
      role,
      roleTitle:
        role === "admin"
          ? "State Logistics Director"
          : role === "hub_operator"
          ? "Warehouse Hub Manager"
          : "Community Relief NGO Partner",
      agency:
        agency ||
        (role === "admin"
          ? "Maharashtra State Food Distribution Authority"
          : role === "hub_operator"
          ? "Central Node Depot (CTR-B)"
          : "Community Food Relief Partner"),
      department:
        role === "admin"
          ? "State Operations Command"
          : role === "hub_operator"
          ? "Depot Staging & Vehicle Receiving"
          : "Community Aid Distribution",
      badgeNumber: `SEC-${Math.floor(1000 + Math.random() * 9000)}`,
      avatarColor:
        role === "admin"
          ? "bg-emerald-600"
          : role === "hub_operator"
          ? "bg-blue-600"
          : "bg-amber-600",
      assignedFacilityId: role === "hub_operator" ? "CTR-B" : undefined,
      assignedRegionId: role === "community_ngo" ? "B" : undefined,
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
