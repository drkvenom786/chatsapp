import { getStoredDeviceId, setStoredDeviceId } from "./storage";

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  browser: string;
  os: string;
  createdAt: number;
  lastActive: number;
  revoked?: boolean;
}

/**
 * Detect client browser name
 */
export function detectBrowser(): string {
  if (typeof navigator === "undefined") return "Web";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("OPR/") || ua.includes("Opera/")) return "Opera";
  return "Browser";
}

/**
 * Detect client OS name
 */
export function detectOS(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  if (ua.includes("Windows NT 10.0") || ua.includes("Windows")) return "Windows";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad") || ua.includes("iPod")) return "iOS";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  return "Device";
}

/**
 * Get human-readable device name e.g. "Chrome — Windows"
 */
export function getFormattedDeviceName(): string {
  const browser = detectBrowser();
  const os = detectOS();
  return `${browser} — ${os}`;
}

/**
 * Get or generate persistent Device ID for this browser/device
 */
export async function getOrCreateDeviceId(): Promise<string> {
  let deviceId = await getStoredDeviceId();
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    await setStoredDeviceId(deviceId);
  }
  return deviceId;
}
