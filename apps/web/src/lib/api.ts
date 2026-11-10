/**
 * FairShare Edge API Client
 * Connects to the Cloudflare Worker Hono API backend, with offline fallback.
 */

// Same origin by default: production serves /api/v1 beside the app, and the Vite dev server
// proxies /api to the local Worker. A hard-coded localhost URL would make deployed builds call
// the visitor's own machine.
const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export interface ApiHealthResponse {
  status: string;
  stage: string;
}

export async function checkApiHealth(): Promise<{ online: boolean; stage?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE_URL}/api/v1/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { online: false };
    const data = (await res.json()) as ApiHealthResponse;
    return { online: true, stage: data.stage };
  } catch {
    return { online: false };
  }
}
