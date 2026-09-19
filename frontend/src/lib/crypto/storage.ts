import { uint8ArrayToBase64, base64ToUint8Array } from "./primitives";

const DB_NAME = "chatsapp_crypto_store";
const DB_VERSION = 1;
const STORE_KEYS = "crypto_keys";
const STORE_DEVICE = "device_meta";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_DEVICE)) {
        db.createObjectStore(STORE_DEVICE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store Identity Key Pair locally in IndexedDB
 */
export async function storeIdentityKeys(
  uid: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, "readwrite");
    const store = tx.objectStore(STORE_KEYS);
    const item = {
      id: `identity_${uid}`,
      uid,
      publicKey: uint8ArrayToBase64(publicKey),
      privateKey: uint8ArrayToBase64(privateKey),
      updatedAt: Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve Identity Key Pair from IndexedDB
 */
export async function getIdentityKeys(
  uid: string
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, "readonly");
      const store = tx.objectStore(STORE_KEYS);
      const req = store.get(`identity_${uid}`);
      req.onsuccess = () => {
        const res = req.result;
        if (!res || !res.privateKey || !res.publicKey) {
          return resolve(null);
        }
        resolve({
          publicKey: base64ToUint8Array(res.publicKey),
          privateKey: base64ToUint8Array(res.privateKey),
        });
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("getIdentityKeys error:", e);
    return null;
  }
}

/**
 * Store Push Notification Preview Key Pair locally in IndexedDB
 */
export async function storeNotificationKeys(
  uid: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, "readwrite");
    const store = tx.objectStore(STORE_KEYS);
    const item = {
      id: `notification_${uid}`,
      uid,
      publicKey: uint8ArrayToBase64(publicKey),
      privateKey: uint8ArrayToBase64(privateKey),
      updatedAt: Date.now(),
    };
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve Notification Key Pair from IndexedDB (also used by Service Worker)
 */
export async function getNotificationKeys(
  uid?: string
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, "readonly");
      const store = tx.objectStore(STORE_KEYS);

      if (uid) {
        const req = store.get(`notification_${uid}`);
        req.onsuccess = () => {
          const res = req.result;
          if (!res || !res.privateKey || !res.publicKey) return resolve(null);
          resolve({
            publicKey: base64ToUint8Array(res.publicKey),
            privateKey: base64ToUint8Array(res.privateKey),
          });
        };
        req.onerror = () => reject(req.error);
      } else {
        // Find any active notification key
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          const notif = list.find((i: any) => i.id?.startsWith("notification_"));
          if (!notif) return resolve(null);
          resolve({
            publicKey: base64ToUint8Array(notif.publicKey),
            privateKey: base64ToUint8Array(notif.privateKey),
          });
        };
        req.onerror = () => reject(req.error);
      }
    });
  } catch (e) {
    console.warn("getNotificationKeys error:", e);
    return null;
  }
}

/**
 * Manage Persistent Device ID
 */
export async function getStoredDeviceId(): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DEVICE, "readonly");
      const store = tx.objectStore(STORE_DEVICE);
      const req = store.get("deviceId");
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return localStorage.getItem("chatsapp_deviceId");
  }
}

export async function setStoredDeviceId(deviceId: string): Promise<void> {
  try {
    localStorage.setItem("chatsapp_deviceId", deviceId);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DEVICE, "readwrite");
      const store = tx.objectStore(STORE_DEVICE);
      const req = store.put({ key: "deviceId", value: deviceId });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("setStoredDeviceId warning:", e);
  }
}

/**
 * Clear cryptographic material on logout
 */
export async function clearCryptoStorage(uid?: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, "readwrite");
      const store = tx.objectStore(STORE_KEYS);
      if (uid) {
        store.delete(`identity_${uid}`);
        store.delete(`notification_${uid}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } else {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }
    });
  } catch (e) {
    console.warn("clearCryptoStorage error:", e);
  }
}

/**
 * Cache user's encrypted master secret in device storage
 */
export async function storeEncryptedMasterSecret(
  uid: string,
  record: any
): Promise<void> {
  try {
    localStorage.setItem(`chatsapp_enc_master_${uid}`, JSON.stringify(record));
  } catch (e) {
    console.warn("storeEncryptedMasterSecret error:", e);
  }
}

export async function getStoredEncryptedMasterSecret(
  uid: string
): Promise<any | null> {
  try {
    const raw = localStorage.getItem(`chatsapp_enc_master_${uid}`);
    if (raw) return JSON.parse(raw);
    return null;
  } catch {
    return null;
  }
}
