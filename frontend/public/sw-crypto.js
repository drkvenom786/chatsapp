// ============================================================================
// ChatsApp - Service Worker Notification Decryption (E2EE)
// ============================================================================

const DB_NAME = "chatsapp_crypto_store";
const DB_VERSION = 1;
const STORE_KEYS = "crypto_keys";

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function openCryptoDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB unavailable"));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get notification private key from IndexedDB
 */
async function getNotificationPrivateKeyFromIDB() {
  try {
    const db = await openCryptoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, "readonly");
      const store = tx.objectStore(STORE_KEYS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        const notif = list.find((item) => item.id && item.id.startsWith("notification_"));
        if (notif && notif.privateKey) {
          resolve(base64ToBytes(notif.privateKey));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[SW Crypto] Failed to load key from IDB:", err);
    return null;
  }
}

// RFC 7748 X25519 Montgomery Curve Scalarmult implementation
const P_25519 = (1n << 255n) - 19n;
const A_25519 = 121665n; // (486662 - 2) / 4

function modInverse(a, p) {
  let r = 1n, base = a, exp = p - 2n;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % p;
    base = (base * base) % p;
    exp >>= 1n;
  }
  return r;
}

function x25519Scalarmult(scalarBytes, pointBytes) {
  const k = new Uint8Array(scalarBytes);
  k[0] &= 248;
  k[31] &= 127;
  k[31] |= 64;

  let s = 0n;
  for (let i = 0; i < 32; i++) s |= BigInt(k[i]) << BigInt(8 * i);

  let u = 0n;
  for (let i = 0; i < 32; i++) u |= BigInt(pointBytes[i]) << BigInt(8 * i);

  let x1 = u, x2 = 1n, z2 = 0n, x3 = u, z3 = 1n, swap = 0n;

  for (let t = 254n; t >= 0n; t--) {
    const kt = (s >> t) & 1n;
    swap ^= kt;
    if (swap) {
      [x2, x3] = [x3, x2];
      [z2, z3] = [z3, z2];
    }
    swap = kt;

    const A = (x2 + z2) % P_25519;
    const AA = (A * A) % P_25519;
    const B = (x2 - z2 + P_25519) % P_25519;
    const BB = (B * B) % P_25519;
    const E = (AA - BB + P_25519) % P_25519;
    const C = (x3 + z3) % P_25519;
    const D = (x3 - z3 + P_25519) % P_25519;
    const DA = (D * A) % P_25519;
    const CB = (C * B) % P_25519;

    x3 = ((DA + CB) * (DA + CB)) % P_25519;
    z3 = (x1 * (((DA - CB + P_25519) % P_25519) * ((DA - CB + P_25519) % P_25519) % P_25519)) % P_25519;
    x2 = (AA * BB) % P_25519;
    z2 = (E * ((AA + (A_25519 * E) % P_25519) % P_25519)) % P_25519;
  }

  if (swap) {
    [x2, x3] = [x3, x2];
    [z2, z3] = [z3, z2];
  }

  const res = (x2 * modInverse(z2, P_25519)) % P_25519;
  const out = new Uint8Array(32);
  let temp = res;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  return out;
}

/**
 * Decrypt notification preview in Service Worker
 */
async function decryptNotificationPayload(encryptedPreviewB64, nonceB64, senderPubKeyB64) {
  if (!encryptedPreviewB64 || !nonceB64 || !senderPubKeyB64) {
    return null;
  }

  try {
    const ourPrivKey = await getNotificationPrivateKeyFromIDB();
    if (!ourPrivKey) {
      console.log("[SW Crypto] Notification key not found in IndexedDB (new device / locked)");
      return null;
    }

    const senderPubKey = base64ToBytes(senderPubKeyB64);
    const sharedSecret = x25519Scalarmult(ourPrivKey, senderPubKey);

    const baseKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      "HKDF",
      false,
      ["deriveKey"]
    );

    const enc = new TextEncoder();
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(32),
        info: enc.encode("chatsapp-notification-preview-v1"),
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const ciphertext = base64ToBytes(encryptedPreviewB64);
    const nonce = base64ToBytes(nonceB64);

    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    console.warn("[SW Crypto] Decryption error:", err);
    return null;
  }
}

// Attach to Service Worker global scope
self.decryptNotificationPayload = decryptNotificationPayload;
