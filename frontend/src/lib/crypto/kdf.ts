import { argon2id } from "hash-wasm";
import { getRandomBytes, uint8ArrayToBase64, base64ToUint8Array, hexToUint8Array } from "./primitives";

export interface KdfParameters {
  memorySize?: number; // in KB (default 65536 = 64MB)
  iterations: number;  // (default 3 for argon2id, 600000 for pbkdf2)
  parallelism?: number; // (default 1)
  hash?: string;       // "SHA-256"
}

export interface KdfMetadata {
  kdf: "argon2id" | "pbkdf2";
  salt: string; // Base64 (32 bytes)
  parameters: KdfParameters;
}

const DEFAULT_ARGON2_PARAMS: KdfParameters = {
  memorySize: 65536, // 64 MB
  iterations: 3,
  parallelism: 1,
};

const DEFAULT_PBKDF2_PARAMS: KdfParameters = {
  iterations: 600000,
  hash: "SHA-256",
};

/**
 * Generate fresh salt and KDF metadata for a new Chat Backup Secret
 */
export function createKdfMetadata(usePbkdf2Fallback = false): {
  salt: Uint8Array;
  metadata: KdfMetadata;
} {
  const salt = getRandomBytes(32);
  const saltBase64 = uint8ArrayToBase64(salt);

  if (usePbkdf2Fallback) {
    return {
      salt,
      metadata: {
        kdf: "pbkdf2",
        salt: saltBase64,
        parameters: DEFAULT_PBKDF2_PARAMS,
      },
    };
  }

  return {
    salt,
    metadata: {
      kdf: "argon2id",
      salt: saltBase64,
      parameters: DEFAULT_ARGON2_PARAMS,
    },
  };
}

/**
 * Derive 256-bit Backup Encryption Key using PBKDF2-HMAC-SHA-256 (Web Crypto Native)
 */
export async function deriveKeyPbkdf2(
  secret: string,
  salt: Uint8Array,
  iterations = 600000
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

/**
 * Derive 256-bit Backup Encryption Key using Argon2id (hash-wasm WebAssembly)
 */
export async function deriveKeyArgon2id(
  secret: string,
  salt: Uint8Array,
  parameters: KdfParameters = DEFAULT_ARGON2_PARAMS
): Promise<Uint8Array> {
  try {
    const hexResult = await argon2id({
      password: secret,
      salt: salt,
      parallelism: parameters.parallelism || 1,
      iterations: parameters.iterations || 3,
      memorySize: parameters.memorySize || 65536,
      hashLength: 32, // 32 bytes = 256 bits
      outputType: "hex",
    });

    return hexToUint8Array(hexResult);
  } catch (wasmError) {
    console.warn("Argon2id derivation error, falling back to PBKDF2:", wasmError);
    return deriveKeyPbkdf2(secret, salt, 600000);
  }
}

/**
 * Unified key derivation given a Chat Backup Secret and KdfMetadata
 */
export async function deriveBackupKey(
  secret: string,
  metadata: KdfMetadata
): Promise<Uint8Array> {
  const cleanSecret = secret.trim();
  const salt = base64ToUint8Array(metadata.salt);

  if (metadata.kdf === "argon2id") {
    try {
      return await deriveKeyArgon2id(cleanSecret, salt, metadata.parameters);
    } catch {
      return await deriveKeyPbkdf2(cleanSecret, salt, metadata.parameters?.iterations || 600000);
    }
  } else {
    return await deriveKeyPbkdf2(cleanSecret, salt, metadata.parameters?.iterations || 600000);
  }
}
