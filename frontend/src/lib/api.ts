/**
 * API and Backend service configuration.
 * All URLs and access keys are strictly driven by environment variables.
 */

// Cloudflare Worker Backend URL (e.g., https://chatsapp-backend.workers.dev)
const RAW_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").trim();
export const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, "");

// Backend Access Key for authorized API requests (configured via VITE_BACKEND_ACCESS_KEY)
export const BACKEND_ACCESS_KEY = (import.meta.env.VITE_BACKEND_ACCESS_KEY || "").trim();

/**
 * Returns headers with X-Backend-Key authentication attached.
 */
export function getApiHeaders(extraHeaders?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  if (BACKEND_ACCESS_KEY) {
    headers["X-Backend-Key"] = BACKEND_ACCESS_KEY;
  }
  if (extraHeaders) {
    if (extraHeaders instanceof Headers) {
      extraHeaders.forEach((val, key) => {
        headers[key] = val;
      });
    } else if (Array.isArray(extraHeaders)) {
      extraHeaders.forEach(([k, v]) => {
        headers[k] = v;
      });
    } else {
      Object.assign(headers, extraHeaders);
    }
  }
  return headers;
}

/**
 * Returns the full API URL for a given endpoint.
 * Example: getApiUrl("/api/send-notification") -> "https://my-worker.workers.dev/api/send-notification"
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  if (!BACKEND_URL) {
    return cleanEndpoint;
  }
  return `${BACKEND_URL}${cleanEndpoint}`;
}

/**
 * Helper for performing fetch requests with automatic backend authentication headers.
 */
export async function apiFetch(endpoint: string, init?: RequestInit): Promise<Response> {
  const url = getApiUrl(endpoint);
  const headers = getApiHeaders(init?.headers);
  return fetch(url, { ...init, headers });
}

/**
 * Resolves media URLs (images, videos, audio, attachments).
 * Handles both absolute URLs and relative R2 endpoints (/api/media/...).
 */
export function getMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }
  if (url.startsWith("/api/")) {
    return getApiUrl(url);
  }
  return url;
}
