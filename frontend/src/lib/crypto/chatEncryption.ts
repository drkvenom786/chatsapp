import {
  computeSharedSecret,
  deriveKeyFromSharedSecret,
  aesGcmEncrypt,
  aesGcmDecrypt,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from "./primitives";
import { getIdentityKeys, getNotificationKeys } from "./storage";

// In-memory conversation session keys cache: Map<`${roomSortedUids}`, CryptoKey>
const sessionKeyCache = new Map<string, CryptoKey>();

function getRoomKeyCacheId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

/**
 * Derive shared symmetric AES-256-GCM conversation key between two users via X25519 + HKDF
 */
export async function getConversationKey(
  ourUid: string,
  theirUid: string,
  theirPublicKeyBase64: string
): Promise<CryptoKey> {
  const cacheId = getRoomKeyCacheId(ourUid, theirUid);
  const cached = sessionKeyCache.get(cacheId);
  if (cached) return cached;

  const ourKeys = await getIdentityKeys(ourUid);
  if (!ourKeys || !ourKeys.privateKey) {
    throw new Error("Local identity private key not unlocked. Please enter your Chat Backup Secret.");
  }

  const theirPublicKey = base64ToUint8Array(theirPublicKeyBase64);
  const sharedSecret = computeSharedSecret(ourKeys.privateKey, theirPublicKey);

  // Derive conversation key with domain separation info
  const roomId = [ourUid, theirUid].sort().join("_");
  const enc = new TextEncoder();
  const conversationKey = await deriveKeyFromSharedSecret(
    sharedSecret,
    `chatsapp-conversation-v1:${roomId}`,
    enc.encode(roomId)
  );

  sessionKeyCache.set(cacheId, conversationKey);
  return conversationKey;
}

export const getOrDeriveConversationKey = getConversationKey;

/**
 * Fallback room-derived key for accounts created before the update
 * who haven't published an X25519 identity key yet.
 * Ensures NO message is EVER sent as plaintext!
 */
export async function getFallbackRoomKey(uid1: string, uid2: string): Promise<CryptoKey> {
  const roomId = [uid1, uid2].sort().join("_");
  const cacheId = `fallback_${roomId}`;
  const cached = sessionKeyCache.get(cacheId);
  if (cached) return cached;

  const enc = new TextEncoder();
  const roomKeyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(`chatsapp-legacy-protection-salt:${roomId}`),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("chatsapp-legacy-protection-v2"),
      info: enc.encode(`chatsapp-room-key:${roomId}`),
    },
    roomKeyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  sessionKeyCache.set(cacheId, key);
  return key;
}

export async function encryptFallbackChatMessage(
  plaintext: string,
  uid1: string,
  uid2: string
): Promise<{ ciphertext: string; nonce: string; version: number }> {
  const key = await getFallbackRoomKey(uid1, uid2);
  const encrypted = await aesGcmEncrypt(plaintext, key);
  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    version: 2,
  };
}

export async function decryptFallbackChatMessage(
  ciphertext: string,
  nonce: string,
  uid1: string,
  uid2: string
): Promise<string> {
  const key = await getFallbackRoomKey(uid1, uid2);
  return await aesGcmDecrypt({ ciphertext, nonce }, key);
}

/**
 * Encrypt a chat message using the derived conversation key
 */
export async function encryptChatMessage(
  plaintext: string,
  ourUid: string,
  theirUid: string,
  theirPublicKeyBase64: string
): Promise<{
  ciphertext: string;
  nonce: string;
  version: number;
}> {
  const conversationKey = await getOrDeriveConversationKey(
    ourUid,
    theirUid,
    theirPublicKeyBase64
  );

  const encrypted = await aesGcmEncrypt(plaintext, conversationKey);
  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    version: 1,
  };
}

/**
 * Decrypt a chat message using the derived conversation key
 */
export async function decryptChatMessage(
  payloadOrCiphertext: { ciphertext: string; nonce: string } | string,
  nonceOrOurUid: string,
  ourUidOrTheirUid?: string,
  theirUidOrPubKey?: string,
  theirPublicKeyBase64?: string
): Promise<string> {
  let ciphertext: string;
  let nonce: string;
  let ourUid: string;
  let theirUid: string;
  let theirPublicKey: string;

  if (typeof payloadOrCiphertext === "object" && payloadOrCiphertext !== null) {
    ciphertext = payloadOrCiphertext.ciphertext;
    nonce = payloadOrCiphertext.nonce;
    ourUid = nonceOrOurUid;
    theirUid = ourUidOrTheirUid!;
    theirPublicKey = theirUidOrPubKey!;
  } else {
    ciphertext = payloadOrCiphertext;
    nonce = nonceOrOurUid;
    ourUid = ourUidOrTheirUid!;
    theirUid = theirUidOrPubKey!;
    theirPublicKey = theirPublicKeyBase64!;
  }

  if (!theirPublicKey && ourUid && theirUid) {
    return await decryptFallbackChatMessage(ciphertext, nonce, ourUid, theirUid);
  }

  const conversationKey = await getOrDeriveConversationKey(
    ourUid,
    theirUid,
    theirPublicKey
  );

  return await aesGcmDecrypt({ ciphertext, nonce }, conversationKey);
}

/**
 * Encrypt push notification preview text
 */
export async function encryptNotificationPreview(
  previewText: string,
  ourUid: string,
  recipientNotificationPubKeyBase64: string
): Promise<{
  encryptedPreview: string;
  nonce: string;
  version: number;
}> {
  const ourKeys = await getIdentityKeys(ourUid);
  if (!ourKeys || !ourKeys.privateKey) {
    throw new Error("Local identity keys not available to encrypt notification");
  }

  const recipientNotifPubKey = base64ToUint8Array(recipientNotificationPubKeyBase64);
  const sharedSecret = computeSharedSecret(ourKeys.privateKey, recipientNotifPubKey);

  // Derive preview key using HKDF with notification domain separation
  const notifKey = await deriveKeyFromSharedSecret(
    sharedSecret,
    "chatsapp-notification-preview-v1"
  );

  const encrypted = await aesGcmEncrypt(previewText, notifKey);

  return {
    encryptedPreview: encrypted.ciphertext,
    nonce: encrypted.nonce,
    version: 1,
  };
}

/**
 * Decrypt push notification preview locally in Service Worker / browser
 */
export async function decryptNotificationPreview(
  payload: { encryptedPreview: string; nonce: string },
  senderIdentityPubKeyBase64: string,
  recipientUid?: string
): Promise<string> {
  const notifKeys = await getNotificationKeys(recipientUid);
  if (!notifKeys || !notifKeys.privateKey) {
    throw new Error("Notification private key not available on this device");
  }

  const senderIdentityPubKey = base64ToUint8Array(senderIdentityPubKeyBase64);
  const sharedSecret = computeSharedSecret(notifKeys.privateKey, senderIdentityPubKey);

  const notifKey = await deriveKeyFromSharedSecret(
    sharedSecret,
    "chatsapp-notification-preview-v1"
  );

  return await aesGcmDecrypt(
    {
      ciphertext: payload.encryptedPreview,
      nonce: payload.nonce,
    },
    notifKey
  );
}

/**
 * Clear session key cache on logout
 */
export function clearSessionKeyCache(): void {
  sessionKeyCache.clear();
}
