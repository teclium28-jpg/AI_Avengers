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

// DEMO ONLY. This sign-in runs entirely in the browser and is NOT a security boundary: anyone
// who can open the page can read or change this logic. Real access control is the Supabase JWT
// and organization membership enforced by the API and row-level security. The shared demo
// password is stored as a SHA-256 digest so it is not printed in the bundle or the interface.
const DEMO_PASSWORD_SHA256 = "7676aaafb027c825bd9abab78b234070e702752f625b752e55e55b48e607e358";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const OFFICIAL_USERS: UserProfile[] = [
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
  },
];

export const PRESET_PROFILES: UserProfile[] = OFFICIAL_USERS;

interface AuthContextValue {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  loginWithCredentials: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
          // Match the stored id exactly: a role or a partial name must never select a profile.
          const matched = PRESET_PROFILES.find((p) => typeof parsed.id === "string" && p.id === parsed.id);
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

  const loginWithCredentials = async (
    identifier: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
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
        u.id.toLowerCase() === trimmedId
    );

    // One message for both cases, so the form does not reveal which accounts exist.
    const rejected = { success: false, error: "Incorrect username or password." };
    const passwordOk = (await sha256Hex(trimmedPw)) === DEMO_PASSWORD_SHA256;
    if (!matched || !passwordOk) return rejected;

    setCurrentUser(matched);
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
