import {
  generateX25519KeyPair,
  aesGcmEncrypt,
  aesGcmDecrypt,
  uint8ArrayToBase64,
  base64ToUint8Array,
  getRandomBytes,
} from "./primitives";
import {
  createKdfMetadata,
  deriveBackupKey,
  type KdfMetadata,
} from "./kdf";
import {
  storeIdentityKeys,
  getIdentityKeys,
  storeNotificationKeys,
  getNotificationKeys,
  storeEncryptedMasterSecret,
  getStoredEncryptedMasterSecret,
} from "./storage";

export interface EncryptedMasterSecret {
  ciphertext: string;
  nonce: string;
  salt: string;
  kdf: "argon2id" | "pbkdf2";
  parameters?: any;
}

export interface IdentityBackupRecord {
  version: number;
  publicKey: string; // Base64 X25519 public key
  encryptedPrivateKey: string; // Base64 AES-256-GCM ciphertext
  notificationPublicKey: string; // Base64 X25519 notification public key
  encryptedNotificationPrivateKey: string; // Base64 AES-256-GCM ciphertext
  encryptedMasterSecret?: EncryptedMasterSecret; // Master secret (CHATSAPP-...) encrypted with user's memorable key
  privateKeyEncryption: {
    algorithm: "AES-256-GCM";
    iv: string; // Base64 12-byte IV for identity private key
    notificationIv: string; // Base64 12-byte IV for notification private key
    kdf: "argon2id" | "pbkdf2";
    salt: string; // Base64 32-byte salt
    parameters: any;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * Generate a strong, user-friendly Chat Backup Secret
 * Format: CHATSAPP-XXXX-XXXX-XXXX-XXXX
 */
export function generateChatBackupSecret(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Base32 without ambiguous 0/O, 1/I
  const random = getRandomBytes(16);
  const segments: string[] = [];

  for (let i = 0; i < 4; i++) {
    let seg = "";
    for (let j = 0; j < 4; j++) {
      const idx = random[i * 4 + j] % chars.length;
      seg += chars[idx];
    }
    segments.push(seg);
  }

  return `CHATSAPP-${segments.join("-")}`;
}

/**
 * Check if the current device/browser already holds the unlocked identity key for this user
 */
export async function hasLocalIdentity(uid: string): Promise<boolean> {
  const localKeys = await getIdentityKeys(uid);
  return Boolean(localKeys && localKeys.privateKey && localKeys.publicKey);
}

/**
 * Encrypt the generated Master Secret (CHATSAPP-XXXX-...) using the user's memorable key
 */
export async function encryptMasterSecretWithUserKey(
  masterSecret: string,
  userMemorableKey: string,
  usePbkdf2Fallback = false
): Promise<EncryptedMasterSecret> {
  const { metadata } = createKdfMetadata(usePbkdf2Fallback);
  const userKey = await deriveBackupKey(userMemorableKey, metadata);
  const encrypted = await aesGcmEncrypt(masterSecret, userKey);
  return {
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    salt: metadata.salt,
    kdf: metadata.kdf,
    parameters: metadata.parameters,
  };
}

/**
 * Decrypt the Master Secret (CHATSAPP-XXXX-...) using the user's memorable key
 */
export async function decryptMasterSecretWithUserKey(
  encryptedRecord: EncryptedMasterSecret,
  userMemorableKey: string
): Promise<string> {
  const kdfMeta: KdfMetadata = {
    kdf: encryptedRecord.kdf,
    salt: encryptedRecord.salt,
    parameters: encryptedRecord.parameters,
  };
  const userKey = await deriveBackupKey(userMemorableKey, kdfMeta);
  return await aesGcmDecrypt(
    {
      ciphertext: encryptedRecord.ciphertext,
      nonce: encryptedRecord.nonce,
    },
    userKey
  );
}

/**
 * Setup brand new cryptographic identity during first account setup
 */
export async function setupNewIdentity(
  uid: string,
  backupSecret: string,
  userMemorableKey?: string,
  usePbkdf2Fallback = false
): Promise<{
  backupRecord: IdentityBackupRecord;
  publicKey: Uint8Array;
}> {
  // 1. Generate local Identity Key Pair
  const identityKeyPair = generateX25519KeyPair();

  // 2. Generate local Notification Preview Key Pair
  const notificationKeyPair = generateX25519KeyPair();

  // 3. Create KDF metadata and salt for master secret
  const { metadata } = createKdfMetadata(usePbkdf2Fallback);

  // 4. Derive Backup Encryption Key from the Chat Backup Secret
  const backupKey = await deriveBackupKey(backupSecret, metadata);

  // 5. Encrypt Identity Private Key using AES-256-GCM
  const identityPrivateEncrypted = await aesGcmEncrypt(
    uint8ArrayToBase64(identityKeyPair.privateKey),
    backupKey
  );

  // 6. Encrypt Notification Private Key using AES-256-GCM
  const notificationPrivateEncrypted = await aesGcmEncrypt(
    uint8ArrayToBase64(notificationKeyPair.privateKey),
    backupKey
  );

  // 7. If user provided a memorable key, encrypt the master secret with it!
  let encryptedMasterSecret: EncryptedMasterSecret | undefined;
  if (userMemorableKey && userMemorableKey.trim()) {
    encryptedMasterSecret = await encryptMasterSecretWithUserKey(
      backupSecret,
      userMemorableKey.trim(),
      usePbkdf2Fallback
    );
    // Cache in browser storage for fast local offline unlock
    await storeEncryptedMasterSecret(uid, encryptedMasterSecret);
  }

  // 8. Store plaintext keys locally in device IndexedDB
  await Promise.all([
    storeIdentityKeys(uid, identityKeyPair.publicKey, identityKeyPair.privateKey),
    storeNotificationKeys(
      uid,
      notificationKeyPair.publicKey,
      notificationKeyPair.privateKey
    ),
  ]);

  // 9. Prepare server backup record (server NEVER sees plaintext private key, master secret, or memorable key)
  const now = Date.now();
  const backupRecord: IdentityBackupRecord = {
    version: 1,
    publicKey: uint8ArrayToBase64(identityKeyPair.publicKey),
    encryptedPrivateKey: identityPrivateEncrypted.ciphertext,
    notificationPublicKey: uint8ArrayToBase64(notificationKeyPair.publicKey),
    encryptedNotificationPrivateKey: notificationPrivateEncrypted.ciphertext,
    encryptedMasterSecret,
    privateKeyEncryption: {
      algorithm: "AES-256-GCM",
      iv: identityPrivateEncrypted.nonce,
      notificationIv: notificationPrivateEncrypted.nonce,
      kdf: metadata.kdf,
      salt: metadata.salt,
      parameters: metadata.parameters,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    backupRecord,
    publicKey: identityKeyPair.publicKey,
  };
}

/**
 * Restore an existing cryptographic identity on a new device using
 * either the user's memorable key OR the emergency Chat Backup Secret
 */
export async function restoreIdentityFromBackup(
  uid: string,
  keyOrSecretInput: string,
  backupRecord: IdentityBackupRecord
): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  if (!backupRecord || !backupRecord.privateKeyEncryption) {
    throw new Error("Invalid identity backup record found on server");
  }

  const cleanInput = keyOrSecretInput.trim();
  let effectiveMasterSecret = cleanInput;

  // Check if there is an encryptedMasterSecret on server or in local storage
  const encMaster =
    backupRecord.encryptedMasterSecret ||
    (await getStoredEncryptedMasterSecret(uid));

  if (encMaster) {
    try {
      // Try decrypting the master secret using the user's memorable key
      const decryptedSecret = await decryptMasterSecretWithUserKey(
        encMaster,
        cleanInput
      );
      if (decryptedSecret && decryptedSecret.startsWith("CHATSAPP-")) {
        effectiveMasterSecret = decryptedSecret;
        // Keep browser cached
        await storeEncryptedMasterSecret(uid, encMaster);
      }
    } catch {
      // User may have entered the emergency master secret (CHATSAPP-...) directly
      effectiveMasterSecret = cleanInput;
    }
  }

  const kdfMeta: KdfMetadata = {
    kdf: backupRecord.privateKeyEncryption.kdf,
    salt: backupRecord.privateKeyEncryption.salt,
    parameters: backupRecord.privateKeyEncryption.parameters,
  };

  // 1. Derive Backup Encryption Key locally
  const backupKey = await deriveBackupKey(effectiveMasterSecret, kdfMeta);

  // 2. Decrypt Identity Private Key
  let identityPrivBase64: string;
  try {
    identityPrivBase64 = await aesGcmDecrypt(
      {
        ciphertext: backupRecord.encryptedPrivateKey,
        nonce: backupRecord.privateKeyEncryption.iv,
      },
      backupKey
    );
  } catch (decryptErr) {
    throw new Error("Incorrect memorable key or backup secret. Please check and try again.");
  }

  const identityPrivateKey = base64ToUint8Array(identityPrivBase64);
  const identityPublicKey = base64ToUint8Array(backupRecord.publicKey);

  // 3. Decrypt Notification Private Key if present
  let notificationPrivateKey: Uint8Array | null = null;
  let notificationPublicKey: Uint8Array | null = null;

  if (
    backupRecord.encryptedNotificationPrivateKey &&
    backupRecord.privateKeyEncryption.notificationIv
  ) {
    try {
      const notifPrivBase64 = await aesGcmDecrypt(
        {
          ciphertext: backupRecord.encryptedNotificationPrivateKey,
          nonce: backupRecord.privateKeyEncryption.notificationIv,
        },
        backupKey
      );
      notificationPrivateKey = base64ToUint8Array(notifPrivBase64);
      notificationPublicKey = base64ToUint8Array(backupRecord.notificationPublicKey);
    } catch (e) {
      console.warn("Could not decrypt notification key:", e);
    }
  }

  // If notification keys were not in backup, generate a fresh pair for this device
  if (!notificationPrivateKey || !notificationPublicKey) {
    const freshNotif = generateX25519KeyPair();
    notificationPrivateKey = freshNotif.privateKey;
    notificationPublicKey = freshNotif.publicKey;
  }

  // 4. Save restored keys to this device's IndexedDB
  await Promise.all([
    storeIdentityKeys(uid, identityPublicKey, identityPrivateKey),
    storeNotificationKeys(uid, notificationPublicKey, notificationPrivateKey),
  ]);

  return {
    publicKey: identityPublicKey,
    privateKey: identityPrivateKey,
  };
}

/**
 * Checks whether an account has complete tokens on the server (both memorable key token
 * and master/private key token). If missing, prompts the user to create/generate keys.
 * If server tokens are present, checks whether local device has keys or needs unlock.
 */
export async function ensureUserIdentity(
  uid: string,
  getRemoteBackupFn: (uid: string) => Promise<IdentityBackupRecord | null>,
  saveRemoteBackupFn?: (uid: string, backup: IdentityBackupRecord) => Promise<void>
): Promise<{
  ready: boolean;
  needsUnlock: boolean;
  needsSetup?: boolean;
  autoGenerated?: boolean;
  backupRecord?: IdentityBackupRecord;
  masterSecret?: string;
}> {
  // 1. Fetch remote backup from server to check if account has complete tokens
  let remoteBackup: IdentityBackupRecord | null = null;
  try {
    remoteBackup = await getRemoteBackupFn(uid);
  } catch (err) {
    console.warn("ensureUserIdentity: check backup warning:", err);
  }

  // Check both:
  // (a) Memorable key token (encryptedMasterSecret)
  // (b) Master / private key token (encryptedPrivateKey & publicKey)
  const hasServerMemorableToken = Boolean(
    remoteBackup?.encryptedMasterSecret?.ciphertext &&
    remoteBackup?.encryptedMasterSecret?.salt &&
    remoteBackup?.encryptedMasterSecret?.nonce
  );
  const hasServerKeyToken = Boolean(
    remoteBackup?.encryptedPrivateKey &&
    remoteBackup?.publicKey
  );

  // If server lacks either memorable token or key token, prompt to create!
  if (!hasServerMemorableToken || !hasServerKeyToken) {
    return {
      ready: false,
      needsUnlock: false,
      needsSetup: true,
      autoGenerated: false,
    };
  }

  // 2. Server has complete tokens. Check if local device already has unlocked keys
  const hasKeys = await hasLocalIdentity(uid);
  if (hasKeys) {
    return {
      ready: true,
      needsUnlock: false,
      needsSetup: false,
      autoGenerated: false,
    };
  }

  // 3. Server has tokens, but this device does not have local keys -> Unlock/Restore
  return {
    ready: false,
    needsUnlock: true,
    needsSetup: false,
    autoGenerated: false,
    backupRecord: remoteBackup!,
  };
}

