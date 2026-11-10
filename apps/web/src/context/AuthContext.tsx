import React, { createContext, useContext, useState, useEffect } from "react";

export type UserRole = "admin" | "hub_operator" | "community_ngo";

export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  roleTitle: string;
  agency: string;
  department: string;
  badgeNumber: string;
  avatarColor: string;
  assignedFacilityId?: string; // e.g. "CTR-B" for hub operators
  assignedRegionId?: string;   // e.g. "B" for community NGOs
}

export const OFFICIAL_USERS: (UserProfile & { defaultPassword: string })[] = [
  {
    id: "swayam",
    username: "swayam",
    name: "Swayam Ruparel",
    email: "swayam@fairshare.gov.in",
    role: "admin",
    roleTitle: "State Relief Director",
    agency: "State Disaster Management & Food Relief Authority",
    department: "State Logistics Command",
    badgeNumber: "DIR-01",
    avatarColor: "bg-emerald-600",
    defaultPassword: "admin@123",
  },
  {
    id: "sunita",
    username: "sunita",
    name: "Sunita Kamble",
    email: "sunita@depot.dharavi.gov.in",
    role: "hub_operator",
    roleTitle: "Dharavi Logistics Hub Lead",
    agency: "Central Staging Depot (CTR-B)",
    department: "Depot Staging & Vehicle Receiving",
    badgeNumber: "HUB-4020",
    avatarColor: "bg-blue-600",
    assignedFacilityId: "CTR-B",
    defaultPassword: "admin@123",
  },
  {
    id: "farhan",
    username: "farhan",
    name: "Dr. Farhan Shaikh",
    email: "farhan@sneha-relief.org",
    role: "community_ngo",
    roleTitle: "Community Food Requester & Relief Lead",
    agency: "Sneha & Dharavi Community Relief NGO",
    department: "Ground Census & Family Assistance",
    badgeNumber: "NGO-7104",
    avatarColor: "bg-amber-600",
    assignedRegionId: "B",
    defaultPassword: "admin@123",
  },
];

export const PRESET_PROFILES: UserProfile[] = OFFICIAL_USERS.map(({ defaultPassword, ...profile }) => profile);

interface AuthContextValue {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  loginWithCredentials: (identifier: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("fairshare_auth_user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          // Normalize legacy id/username if needed
          const matched = PRESET_PROFILES.find(
            (p) =>
              p.id === parsed.id ||
              p.username.toLowerCase() === parsed.username?.toLowerCase() ||
              p.name.toLowerCase() === parsed.name?.toLowerCase() ||
              p.role === parsed.role
          );
          if (matched) return matched;
        }
      } catch {
        return null;
      }
    }
    // Return null so the real login screen is shown if not logged in
    return null;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("fairshare_auth_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("fairshare_auth_user");
    }
  }, [currentUser]);

  const loginWithCredentials = (
    identifier: string,
    password: string
  ): { success: boolean; error?: string } => {
    const trimmedId = identifier.trim().toLowerCase();
    const trimmedPw = password.trim();

    if (!trimmedId) {
      return { success: false, error: "Please enter your username or official email." };
    }

    if (!trimmedPw) {
      return { success: false, error: "Please enter your password." };
    }

    // Check credentials against the official users
    const matched = OFFICIAL_USERS.find(
      (u) =>
        u.username.toLowerCase() === trimmedId ||
        u.email.toLowerCase() === trimmedId ||
        u.id.toLowerCase() === trimmedId ||
        u.name.toLowerCase().includes(trimmedId)
    );

    if (!matched) {
      return {
        success: false,
        error: "User not recognized. Valid authorized logins: 'swayam', 'sunita', or 'farhan'.",
      };
    }

    if (trimmedPw !== matched.defaultPassword) {
      return {
        success: false,
        error: "Incorrect password. The authorized access password is: admin@123",
      };
    }

    const { defaultPassword, ...profile } = matched;
    setCurrentUser(profile);
    return { success: true };
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("fairshare_auth_user");
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        loginWithCredentials,
        logout,
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
