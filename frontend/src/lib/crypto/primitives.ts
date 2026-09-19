import { x25519 } from "@noble/curves/ed25519.js";

export interface EncryptedPayload {
  version: number;
  algorithm: string;
  ciphertext: string; // Base64
  nonce: string; // Base64 (12-byte IV for AES-GCM)
}

/**
 * Convert Uint8Array to Base64 string
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to Hex string
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert Hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.trim().replace(/^0x/, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Generate cryptographically secure random bytes
 */
export function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate an X25519 key pair for key agreement
 */
export function generateX25519KeyPair(): {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  const pair = x25519.keygen();
  return { publicKey: pair.publicKey, privateKey: pair.secretKey };
}

/**
 * Compute shared secret via X25519 Diffie-Hellman
 */
export function computeSharedSecret(
  ourPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Uint8Array {
  return x25519.getSharedSecret(ourPrivateKey, theirPublicKey);
}

/**
 * Derive an AES-256-GCM CryptoKey from a shared secret using HKDF-SHA-256
 */
export async function deriveKeyFromSharedSecret(
  sharedSecret: Uint8Array,
  infoString: string,
  salt?: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const info = enc.encode(infoString);
  const defaultSalt = salt || new Uint8Array(32); // 32 zero bytes if no salt

  const baseKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "HKDF",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: defaultSalt,
      info: info,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Import raw 32-byte key as AES-GCM CryptoKey
 */
export async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypt plaintext using AES-256-GCM
 */
export async function aesGcmEncrypt(
  plaintext: string,
  key: CryptoKey | Uint8Array
): Promise<EncryptedPayload> {
  const cryptoKey = key instanceof Uint8Array ? await importAesKey(key) : key;
  const nonce = getRandomBytes(12); // 96-bit random IV for AES-GCM
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    cryptoKey,
    encoded
  );

  return {
    version: 1,
    algorithm: "AES-256-GCM",
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
    nonce: uint8ArrayToBase64(nonce),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export async function aesGcmDecrypt(
  payload: { ciphertext: string; nonce: string },
  key: CryptoKey | Uint8Array
): Promise<string> {
  const cryptoKey = key instanceof Uint8Array ? await importAesKey(key) : key;
  const ciphertext = base64ToUint8Array(payload.ciphertext);
  const nonce = base64ToUint8Array(payload.nonce);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}
