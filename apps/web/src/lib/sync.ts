import { supabase, isSupabaseConfigured } from "./supabase";

/**
 * Browser-to-Supabase mirroring is OFF unless VITE_ENABLE_SUPABASE_SYNC=true at build time.
 * The authoritative path is the API (server recomputes and records decisions); the browser must
 * not write authoritative data directly. Keep this only for demos against a sandbox project whose
 * row-level security has been reviewed.
 */
export const isSyncEnabled = import.meta.env?.VITE_ENABLE_SUPABASE_SYNC === "true" && isSupabaseConfigured;

export function mirrorToSupabase(table: string, row: Record<string, unknown>, mode: "insert" | "upsert" = "insert"): void {
  if (!isSyncEnabled) return;
  void (async () => {
    try {
      const query = supabase.from(table);
      const { error } = mode === "upsert" ? await query.upsert(row) : await query.insert(row);
      if (error) console.warn(`[Supabase mirror] ${table} ${mode} failed:`, error.message);
    } catch (err) {
      console.warn("[Supabase mirror] Network error:", err);
    }
  })();
}
