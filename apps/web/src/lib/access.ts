import type { NavigationPage } from "../types";
import type { UserRole } from "../context/AuthContext";

/** Pages each demo role may open. The router enforces this; navigation only reflects it. */
export const ALLOWED_PAGES: Record<UserRole, NavigationPage[]> = {
  admin: ["dashboard", "studio", "centers", "intake", "reconciliation", "audit"],
  hub_operator: ["dashboard", "studio", "centers", "reconciliation"],
  community_ngo: ["dashboard", "community_request", "reconciliation", "audit"],
};

export const canOpen = (role: UserRole | undefined, page: NavigationPage): boolean =>
  !!role && ALLOWED_PAGES[role].includes(page);
