/**
 * API and Backend service configuration.
 * All URLs are strictly driven by environment variables.
 */

// Cloudflare Worker Backend URL (e.g., https://chatsapp-backend.workers.dev)
// If empty, relative paths are used (suitable for Netlify proxy redirects or local dev proxy)
const RAW_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").trim();
export const BACKEND_URL = RAW_BACKEND_URL.replace(/\/+$/, "");

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
