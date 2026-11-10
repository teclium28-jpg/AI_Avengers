/**
 * FairShare Edge API Client
 * Connects to the Cloudflare Worker Hono API backend, with offline fallback.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8787";

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
