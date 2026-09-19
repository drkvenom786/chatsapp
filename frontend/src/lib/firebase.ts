import { getApiUrl, getApiHeaders } from "./api";

const FIREBASE_VERSION = "10.14.1";

const CDN =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const firebaseConfig: Record<string, string> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || "",
};

let configFetched = false;

async function ensureConfigLoaded() {
  if (configFetched || firebaseConfig.apiKey) return;
  try {
    const res = await fetch(getApiUrl("/api/config"), {
      headers: getApiHeaders(),
    });
    if (res.ok) {
      const remoteConfig = await res.json();
      Object.assign(firebaseConfig, remoteConfig);
      configFetched = true;
    }
  } catch (e) {
    console.warn("Dynamic config fetch warning:", e);
  }
}

export interface User {
  uid: string;

  email: string | null;

  displayName: string | null;

  username?: string | null;

  online?: boolean;

  isAnonymous?: boolean;

  notificationsEnabled?: boolean;

  visibility?: "online" | "invisible";

  metadata?: {
    creationTime?: string;
  };
}

import {
  encryptChatMessage,
  decryptChatMessage,
  encryptNotificationPreview,
  encryptFallbackChatMessage,
  decryptFallbackChatMessage,
} from "./crypto/chatEncryption";
import {
  getIdentityKeys,
  getNotificationKeys,
  clearCryptoStorage,
} from "./crypto/storage";
import {
  getOrCreateDeviceId,
  getFormattedDeviceName,
  detectBrowser,
  detectOS,
  type DeviceInfo,
} from "./crypto/deviceManager";
import {
  type IdentityBackupRecord,
  hasLocalIdentity,
  setupNewIdentity,
  restoreIdentityFromBackup,
  generateChatBackupSecret,
  ensureUserIdentity,
} from "./crypto/keyManagement";
import { uint8ArrayToBase64, base64ToUint8Array } from "./crypto/primitives";

export interface ChatMessage {
  id?: string;

  senderId: string;

  receiverId: string;

  text: string;

  timestamp: number;

  read?: boolean;

  edited?: boolean;

  failed?: boolean;

  blocked?: boolean;

  deletedForEveryone?: boolean;

  deletedFor?: Record<string, boolean>;

  replyTo?: {
    id?: string;
    senderName?: string;
    text?: string;
  };

  reactions?: Record<string, Record<string, boolean>>;

  mediaUrl?: string;

  mediaType?: "image" | "video" | "audio" | "file";

  mediaName?: string;

  mediaSize?: number;

  mediaKey?: string;

  localFile?: File;

  isUploadingMedia?: boolean;

  e2ee?: boolean;

  version?: number;

  nonce?: string;

  ciphertext?: string;

  callInfo?: {
    type: "audio" | "video";
    status: "missed" | "declined" | "completed";
    duration?: number;
  };
}

type FirebaseRuntime = {
  app: any;

  auth: any;

  db: any;

  authFns: any;

  dbFns: any;
};

let runtimePromise:
  Promise<FirebaseRuntime | null> | null = null;

function missingConfig() {
  return !firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.databaseURL;
}

export async function loadFirebase() {
  await ensureConfigLoaded();

  if (missingConfig())
    return null;

  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    try {
      const [appModule, authModule, dbModule] = await Promise.all([
        import(/* @vite-ignore */ `${CDN}/firebase-app.js`),
        import(/* @vite-ignore */ `${CDN}/firebase-auth.js`),
        import(/* @vite-ignore */ `${CDN}/firebase-database.js`),
      ]);

      const app = appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      const db = dbModule.getDatabase(app);

      return {
        app,
        auth,
        db,
        authFns: authModule,
        dbFns: dbModule,
      };
    } catch (error) {
      console.error("Firebase load error:", error);
      return null;
    }
  })();

  return runtimePromise;
}

async function requireFirebase() {

  const runtime =
    await loadFirebase();

  if (!runtime) {

    throw new Error(
      "Firebase is not configured."
    );
  }

  return runtime;
}

export function onAuthChange(
  callback: (user: User | null) => void
) {
  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then((runtime) => {
    if (!active || !runtime) {
      if (!runtime) callback(null);
      return;
    }

    unsubscribe = runtime.authFns.onAuthStateChanged(
      runtime.auth,
      (firebaseUser: any) => {
        if (!active) return;
        if (firebaseUser) {
          callback({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            emailVerified: Boolean(firebaseUser.emailVerified),
            metadata: firebaseUser.metadata,
          });
        } else {
          callback(null);
        }
      }
    );
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function sendVerificationEmailToUser() {
  const runtime = await requireFirebase();
  if (!runtime.auth?.currentUser) throw new Error("No user currently logged in");
  await runtime.authFns.sendEmailVerification(runtime.auth.currentUser);
}

export async function reloadCurrentUser(): Promise<User | null> {
  const runtime = await loadFirebase();
  if (!runtime || !runtime.auth?.currentUser) return null;
  await runtime.auth.currentUser.reload();
  const u = runtime.auth.currentUser;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    username: u.displayName || (u.email ? u.email.split("@")[0] : "User"),
    emailVerified: Boolean(u.emailVerified),
    metadata: u.metadata,
  };
}

export async function lookupEmailByUsername(rawUsername: string): Promise<string> {
  const cleanInput = rawUsername.trim().toLowerCase();
  if (!cleanInput) throw new Error("Username or Email is required");

  if (cleanInput.includes("@")) {
    return cleanInput;
  }

  // 1. Try Cloudflare Worker server-side lookup API first
  try {
    const res = await fetch(getApiUrl(`/api/lookup-username?username=${encodeURIComponent(cleanInput)}`), {
      headers: getApiHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.email) {
        return data.email;
      }
    }
  } catch (apiErr) {
    console.warn("API lookup-username warning:", apiErr);
  }

  // 2. Client SDK fallback: Ensure auth session for RTDB permission rules
  const runtime = await requireFirebase();
  if (!runtime.auth?.currentUser) {
    try {
      await runtime.authFns.signInAnonymously(runtime.auth);
    } catch (anonErr) {
      console.warn("Anonymous auth for lookup warning:", anonErr);
    }
  }

  // 3. Client SDK fallback: Direct check /usernames/${cleanInput}
  try {
    const usernameRef = runtime.dbFns.ref(runtime.db, `usernames/${cleanInput}`);
    const snap = await runtime.dbFns.get(usernameRef);
    if (snap.exists() && snap.val()?.email) {
      return snap.val().email;
    }
  } catch (e: any) {
    console.warn("Username direct lookup warning:", e);
  }

  // 4. Client SDK fallback: Search /users node
  try {
    const usersRef = runtime.dbFns.ref(runtime.db, "users");
    const usersSnap = await runtime.dbFns.get(usersRef);
    if (usersSnap.exists()) {
      const usersData = usersSnap.val() || {};
      for (const u of Object.values(usersData) as any[]) {
        if (!u || typeof u !== "object" || !u.email) continue;
        const uUsername = (u.username || "").trim().toLowerCase();
        const uName = (u.name || "").trim().toLowerCase();
        const uDisplayName = (u.displayName || "").trim().toLowerCase();
        const fullEmail = (u.email || "").trim().toLowerCase();

        if (
          uUsername === cleanInput ||
          uName === cleanInput ||
          uDisplayName === cleanInput ||
          fullEmail === cleanInput
        ) {
          return u.email;
        }
      }
    }
  } catch (e: any) {
    console.warn("Users node lookup warning:", e);
  }

  // 5. Client SDK fallback: Search /usernames node case-insensitively
  try {
    const usernamesRef = runtime.dbFns.ref(runtime.db, "usernames");
    const snap = await runtime.dbFns.get(usernamesRef);
    if (snap.exists()) {
      const data = snap.val() || {};
      for (const [key, entry] of Object.entries(data) as [string, any][]) {
        if (entry && typeof entry === "object") {
          const entryUser = (entry.username || key || "").trim().toLowerCase();
          if (entryUser === cleanInput && entry.email) {
            return entry.email;
          }
        }
      }
    }
  } catch (e: any) {
    console.warn("Usernames scan warning:", e);
  }

  throw new Error(`No account found registered under username '${rawUsername}'. Please check the username or sign in with your full email address.`);
}

export async function signUp(
  username: string,
  email: string,
  password: string
) {
  const runtime = await requireFirebase();
  const rawUsername = username.trim();
  const cleanUsername = rawUsername.toLowerCase();
  const cleanEmail = email.trim().toLowerCase();

  if (!cleanUsername) throw new Error("Username is required");
  if (cleanUsername.includes("@") || cleanUsername.endsWith(".com")) {
    throw new Error("Username cannot contain '@' or email domain");
  }

  if (!cleanEmail) {
    throw new Error("Email is required");
  }

  // 1. Check if username is already taken
  try {
    const usernameRef = runtime.dbFns.ref(runtime.db, `usernames/${cleanUsername}`);
    const existingSnap = await runtime.dbFns.get(usernameRef);
    if (existingSnap.exists()) {
      throw new Error("Username is already taken. Please choose another username.");
    }
  } catch (e: any) {
    if (e?.message?.includes("already taken")) {
      throw e;
    }
  }

  // 2. Create Firebase Auth user
  const result = await runtime.authFns.createUserWithEmailAndPassword(
    runtime.auth,
    cleanEmail,
    password
  );

  // Send Firebase Email Verification
  try {
    await runtime.authFns.sendEmailVerification(result.user);
  } catch (err: any) {
    console.warn("Email verification send warning:", err);
  }

  const newSessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  try {
    localStorage.setItem("userSessionId", newSessionId);
  } catch (e) {}

  await runtime.authFns.updateProfile(result.user, {
    displayName: rawUsername,
  }).catch(() => {});

  // 3. Write /usernames and /users with complete username fields
  const usernameRef = runtime.dbFns.ref(runtime.db, `usernames/${cleanUsername}`);
  const userRef = runtime.dbFns.ref(runtime.db, `users/${result.user.uid}`);

  await Promise.all([
    runtime.dbFns.set(usernameRef, {
      uid: result.user.uid,
      username: cleanUsername,
      displayName: rawUsername,
      email: cleanEmail,
    }).catch((e: any) => console.warn("Write /usernames warning:", e)),
    runtime.dbFns.update(userRef, {
      uid: result.user.uid,
      username: cleanUsername,
      name: rawUsername,
      displayName: rawUsername,
      email: cleanEmail,
      online: false,
      visibility: "online",
      isAnonymous: false,
      notificationsEnabled: true,
      currentSessionId: newSessionId,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    }).catch((e: any) => console.warn("Write /users warning:", e)),
  ]);

  if (result.user.emailVerified) {
    try {
      await setupPresence(result.user.uid);
    } catch (e) {
      console.warn("Presence setup warning:", e);
    }

    try {
      await requestFCMToken(result.user.uid);
    } catch (e) {
      console.warn("FCM token request warning:", e);
    }
  }

  return result.user;
}

export async function signIn(
  email: string,
  password: string
) {
  const runtime = await requireFirebase();

  const result = await runtime.authFns.signInWithEmailAndPassword(
    runtime.auth,
    email.trim().toLowerCase(),
    password
  );

  const newSessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  try {
    localStorage.setItem("userSessionId", newSessionId);
  } catch (e) {}

  await runtime.dbFns.update(
    runtime.dbFns.ref(runtime.db, `users/${result.user.uid}`),
    {
      currentSessionId: newSessionId,
      online: true,
      lastSeen: Date.now(),
    }
  );

  try {
    await setupPresence(result.user.uid);
  } catch (e) {
    console.warn("Presence setup warning:", e);
  }

  try {
    await requestFCMToken(result.user.uid);
  } catch (e) {
    console.warn("FCM token request warning:", e);
  }

  return result;
}

export async function sendPasswordReset(usernameOrEmail: string): Promise<string> {
  const runtime = await requireFirebase();
  const cleanInput = usernameOrEmail.trim().toLowerCase();
  if (!cleanInput) {
    throw new Error("Please enter your email or username");
  }

  let emailToUse = cleanInput;
  if (!cleanInput.includes("@")) {
    emailToUse = await lookupEmailByUsername(cleanInput);
  }

  if (!emailToUse || !emailToUse.includes("@")) {
    throw new Error("No valid registered email found for this user");
  }

  await runtime.authFns.sendPasswordResetEmail(runtime.auth, emailToUse);
  return emailToUse;
}

// ============================================================================
// Multi-Device Tracking & Device Revocation
// ============================================================================

export async function registerDevice(uid: string): Promise<string> {
  const runtime = await requireFirebase();
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getFormattedDeviceName();
  const browser = detectBrowser();
  const os = detectOS();
  const now = Date.now();

  const deviceRef = runtime.dbFns.ref(runtime.db, `users/${uid}/devices/${deviceId}`);
  await runtime.dbFns.update(deviceRef, {
    deviceId,
    deviceName,
    browser,
    os,
    lastActive: now,
    revoked: false,
  });

  // Attach onDisconnect to update lastActive
  runtime.dbFns.onDisconnect(deviceRef).update({
    lastActive: Date.now(),
  }).catch(() => {});

  return deviceId;
}

export async function getDevices(uid: string): Promise<DeviceInfo[]> {
  const runtime = await requireFirebase();
  const devicesRef = runtime.dbFns.ref(runtime.db, `users/${uid}/devices`);
  const snap = await runtime.dbFns.get(devicesRef);
  if (!snap.exists()) return [];

  const val = snap.val() || {};
  return Object.values(val) as DeviceInfo[];
}

export async function revokeDevice(uid: string, targetDeviceId: string): Promise<void> {
  const runtime = await requireFirebase();
  const deviceRef = runtime.dbFns.ref(runtime.db, `users/${uid}/devices/${targetDeviceId}`);
  await runtime.dbFns.update(deviceRef, {
    revoked: true,
    revokedAt: Date.now(),
  });
}

export function onDeviceRevocation(
  uid: string,
  deviceId: string,
  callback: (isRevoked: boolean) => void
) {
  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then((runtime) => {
    if (!active || !runtime || !uid || !deviceId) return;

    const deviceRevokedRef = runtime.dbFns.ref(runtime.db, `users/${uid}/devices/${deviceId}/revoked`);
    unsubscribe = runtime.dbFns.onValue(deviceRevokedRef, (snap: any) => {
      if (!active) return;
      if (snap.val() === true) {
        callback(true);
      }
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export function onSessionChange(
  uid: string,
  callback: (isInvalid: boolean) => void
) {
  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then(async (runtime) => {
    if (!active || !runtime || !uid) return;

    const deviceId = await getOrCreateDeviceId();
    const deviceRevokedRef = runtime.dbFns.ref(runtime.db, `users/${uid}/devices/${deviceId}/revoked`);
    unsubscribe = runtime.dbFns.onValue(deviceRevokedRef, (snap: any) => {
      if (!active) return;
      if (snap.val() === true) {
        callback(true);
      }
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

// ============================================================================
// Identity & Public Key Storage (E2EE)
// ============================================================================

export async function saveIdentityBackup(
  uid: string,
  record: IdentityBackupRecord
): Promise<void> {
  const runtime = await requireFirebase();
  const identityRef = runtime.dbFns.ref(runtime.db, `users/${uid}/identity`);
  const pubKeyRef = runtime.dbFns.ref(runtime.db, `users/${uid}/publicKey`);
  await Promise.all([
    runtime.dbFns.set(identityRef, record),
    runtime.dbFns.set(pubKeyRef, record.publicKey).catch(() => {}),
  ]);
}

export async function getIdentityBackup(
  uid: string
): Promise<IdentityBackupRecord | null> {
  const runtime = await requireFirebase();
  const identityRef = runtime.dbFns.ref(runtime.db, `users/${uid}/identity`);
  const snap = await runtime.dbFns.get(identityRef);
  if (snap.exists()) {
    return snap.val();
  }
  return null;
}

export async function getUserPublicKey(
  uid: string
): Promise<{ publicKey: string; notificationPublicKey?: string } | null> {
  const runtime = await requireFirebase();
  const identityRef = runtime.dbFns.ref(runtime.db, `users/${uid}/identity`);
  const snap = await runtime.dbFns.get(identityRef);
  if (snap.exists()) {
    const val = snap.val();
    if (val?.publicKey) {
      return {
        publicKey: val.publicKey,
        notificationPublicKey: val.notificationPublicKey,
      };
    }
  }

  // Fallback: check users/${uid}/publicKey
  try {
    const pubKeyRef = runtime.dbFns.ref(runtime.db, `users/${uid}/publicKey`);
    const pubSnap = await runtime.dbFns.get(pubKeyRef);
    if (pubSnap.exists() && pubSnap.val()) {
      return {
        publicKey: String(pubSnap.val()),
      };
    }
  } catch {}

  return null;
}

export async function logout() {
  try {
    localStorage.removeItem("userSessionId");
    sessionStorage.clear();
  } catch (e) {}

  const runtime = await loadFirebase();
  if (!runtime) return;

  const uid = runtime.auth?.currentUser?.uid;

  if (uid) {
    runtime.dbFns.update(
      runtime.dbFns.ref(runtime.db, `users/${uid}`),
      {
        online: false,
        lastSeen: Date.now(),
      }
    ).catch((e: any) => console.warn("Logout presence error:", e));

    removeFCMToken(uid).catch((e: any) => console.warn("Logout FCM error:", e));
  }

  return runtime.authFns.signOut(runtime.auth).catch((e: any) => console.warn("SignOut error:", e));
}

export async function setupPresence(
  uid: string
) {

  const runtime =
    await loadFirebase();

  if (!runtime)
    return;

  const userStatusRef =
    runtime.dbFns.ref(
      runtime.db,
      `users/${uid}`
    );

  const connectedRef =
    runtime.dbFns.ref(
      runtime.db,
      ".info/connected"
    );

  runtime.dbFns.onValue(

    connectedRef,

    async (
      snapshot: any
    ) => {

      if (
        snapshot.val() === true
      ) {
        
        // Get visibility preference
        let visibility = "online";
        try {
            const visibilitySnapshot = await runtime.dbFns.get(
                runtime.dbFns.ref(runtime.db, `users/${uid}/visibility`)
            );
            if (visibilitySnapshot.exists()) {
                visibility = visibilitySnapshot.val();
            }
        } catch (e) {}

        await runtime.dbFns
          .onDisconnect(
            userStatusRef
          )
          .update({

            online: false,

            lastSeen:
              Date.now(),
          });

        await runtime.dbFns
          .update(

            userStatusRef,

            {
              online: visibility === "online",

              lastSeen:
                Date.now(),
            }
          );
      }
    }
  );
}

export async function setUserOnline(
  uid: string,
  online: boolean
) {
  const runtime = await loadFirebase();
  if (!runtime || !uid) return;

  const userRef = runtime.dbFns.ref(runtime.db, `users/${uid}`);
  const visibility = online ? "online" : "invisible";

  if (online) {
    const connectedRef = runtime.dbFns.ref(runtime.db, ".info/connected");
    runtime.dbFns.onValue(connectedRef, (snap: any) => {
      if (snap.val() === true) {
        runtime.dbFns.onDisconnect(userRef).update({
          online: false,
          visibility: "invisible",
          lastSeen: Date.now(),
        }).catch(console.warn);

        runtime.dbFns.update(userRef, {
          online: true,
          visibility: "online",
          lastSeen: Date.now(),
        }).catch(console.warn);
      }
    });
  } else {
    return runtime.dbFns.update(userRef, {
      online: false,
      visibility: "invisible",
      lastSeen: Date.now(),
    });
  }
}

export async function setUserAnonymous(
  uid: string,
  isAnonymous: boolean
) {
  const runtime = await loadFirebase();
  if (!runtime) return;

  return runtime.dbFns.update(
    runtime.dbFns.ref(runtime.db, `users/${uid}`),
    { isAnonymous }
  );
}

export async function setUserNotifications(
  uid: string,
  enabled: boolean
) {
  const runtime = await loadFirebase();
  if (!runtime) return;

  return runtime.dbFns.update(
    runtime.dbFns.ref(runtime.db, `users/${uid}`),
    { notificationsEnabled: enabled }
  );
}

export async function updateUserProfile(
  uid: string,
  name: string
) {

  const runtime =
    await requireFirebase();

  if (
    runtime.auth.currentUser
  ) {

    await runtime.authFns
      .updateProfile(

        runtime.auth.currentUser,

        {
          displayName:
            name,
        }
      );
  }

  return runtime.dbFns
    .update(

      runtime.dbFns.ref(
        runtime.db,
        `users/${uid}`
      ),

      {
        name,
      }
    );
}

export async function updateUserBio(uid: string, bio: string) {
  const runtime = await requireFirebase();
  const trimmed = (bio || "").trim().slice(0, 140);
  return runtime.dbFns.update(
    runtime.dbFns.ref(runtime.db, `users/${uid}`),
    { bio: trimmed }
  );
}

export async function blockUser(currentUid: string, targetUid: string) {
  const runtime = await loadFirebase();
  if (!runtime || !currentUid || !targetUid) return;

  // Store block state with the owner. This is also the path enforced by
  // messages and calls, avoiding a second legacy write that can fail rules.
  await runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `users/${currentUid}/blockedUsers/${targetUid}`), true);
}

export async function unblockUser(currentUid: string, targetUid: string) {
  const runtime = await loadFirebase();
  if (!runtime || !currentUid || !targetUid) return;

  await runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUid}/blockedUsers/${targetUid}`));
}

export function onBlockedUsersChange(currentUid: string, callback: (blockedMap: Record<string, boolean>) => void) {
  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then((runtime) => {
    if (!active || !runtime || !currentUid) {
      callback({});
      return;
    }

    const blockedRef = runtime.dbFns.ref(runtime.db, `users/${currentUid}/blockedUsers`);
    unsubscribe = runtime.dbFns.onValue(blockedRef, (snapshot: any) => {
      callback(snapshot.val() || {});
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export function onUsersChange(
  callback: (users: Record<string, any>) => void
) {
  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then((runtime) => {
    if (!active) return;
    if (!runtime) {
      callback({});
      return;
    }

    const usersRef = runtime.dbFns.ref(runtime.db, "users");

    unsubscribe = runtime.dbFns.onValue(usersRef, (snapshot: any) => {
      const val = snapshot.val() || {};
      const validUsers: Record<string, any> = {};

      Object.entries(val).forEach(([uid, userData]: [string, any]) => {
        if (!userData || typeof userData !== "object") return;
        if (userData.deleted === true || userData.status === "deleted" || userData.disabled === true) return;

        const username = userData.username || userData.name || userData.displayName || (userData.email ? userData.email.split("@")[0] : "User");
        validUsers[uid] = {
          ...userData,
          username,
          displayName: userData.displayName || username,
          name: userData.name || username,
        };
      });

      callback(validUsers);
    }, (err: any) => {
      console.warn("onUsersChange warning:", err);
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export function onMessagesChange(
  arg1: string,
  arg2: any,
  arg3?: (messages: ChatMessage[]) => void
) {
  let callback: (messages: ChatMessage[]) => void;
  let chatRoomId = "";
  let currentUserId = "";

  if (typeof arg2 === "function") {
    chatRoomId = arg1;
    callback = arg2;
  } else {
    currentUserId = arg1;
    chatRoomId = generateChatRoomId(arg1, arg2);
    callback = arg3 || (() => {});
  }

  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then((runtime) => {
    if (!active) return;
    if (!runtime || !chatRoomId) {
      callback([]);
      return;
    }

    const messagesRef = runtime.dbFns.ref(
      runtime.db,
      `chats/${chatRoomId}/messages`
    );

    unsubscribe = runtime.dbFns.onValue(messagesRef, async (snapshot: any) => {
      const data = snapshot.val() || {};
      const rawMessages = Object.entries(data)
        .map(([id, value]) => ({
          id,
          ...(value as ChatMessage),
        }))
        .filter((message) => {
          if (!currentUserId) return true;
          if (message.deletedFor?.[currentUserId]) return false;
          if (message.senderId !== currentUserId && message.blocked) return false;
          return true;
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      // Decrypt any E2EE messages locally
      const partnerUid = chatRoomId.split("_").find((uid) => uid !== currentUserId) || "";
      let partnerPubKey = "";
      if (partnerUid && currentUserId) {
        try {
          const partnerIdentity = await getUserPublicKey(partnerUid);
          partnerPubKey = partnerIdentity?.publicKey || "";
        } catch {}
      }

      const decryptedMessages = await Promise.all(
        rawMessages.map(async (msg) => {
          if (msg.e2ee && msg.nonce && currentUserId && partnerUid) {
            try {
              let decrypted: string;
              if (msg.version === 2 || !partnerPubKey) {
                decrypted = await decryptFallbackChatMessage(
                  msg.text,
                  msg.nonce,
                  currentUserId,
                  partnerUid
                );
              } else {
                decrypted = await decryptChatMessage(
                  { ciphertext: msg.text, nonce: msg.nonce },
                  currentUserId,
                  partnerUid,
                  partnerPubKey
                );
              }
              return { ...msg, text: decrypted };
            } catch (decErr) {
              console.warn("Message decrypt warning:", decErr);
              return { ...msg, text: "🔒 Encrypted message" };
            }
          }
          return msg;
        })
      );

      if (active) {
        callback(decryptedMessages);
      }
    }, (err: any) => {
      console.warn("onMessagesChange warning:", err);
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export function onRecentChatsChange(
  currentUserId: string,
  callback: (recentMap: Record<string, { lastMessage?: string; timestamp?: number; partnerName?: string }>) => void
) {
  let active = true;
  const recentMap: Record<string, { lastMessage?: string; timestamp?: number; partnerName?: string }> = {};
  const roomUnsubs = new Map<string, () => void>();
  let userChatsUnsub = () => {};
  let usersUnsub = () => {};
  let removedChatsUnsub = () => {};
  let removedMap: Record<string, number> = {};

  const notify = () => {
    if (!active) return;
    const filteredMap: Record<string, { lastMessage?: string; timestamp?: number; partnerName?: string }> = {};
    Object.entries(recentMap).forEach(([partnerUid, data]) => {
      const removedVal = removedMap[partnerUid];
      if (removedVal) {
        if (typeof removedVal === "number" && data.timestamp && data.timestamp <= removedVal) {
          return;
        }
        if (typeof removedVal === "boolean" || !data.timestamp) {
          return;
        }
      }
      filteredMap[partnerUid] = data;
    });
    callback(filteredMap);
  };

  loadFirebase().then((runtime) => {
    if (!active || !runtime || !currentUserId) {
      callback({});
      return;
    }

    const removedRef = runtime.dbFns.ref(runtime.db, `users/${currentUserId}/removedChats`);
    removedChatsUnsub = runtime.dbFns.onValue(removedRef, (snap: any) => {
      removedMap = snap.val() || {};
      notify();
    });

    const userChatsRef = runtime.dbFns.ref(runtime.db, `userChats/${currentUserId}`);
    userChatsUnsub = runtime.dbFns.onValue(
      userChatsRef,
      (snapshot: any) => {
        const val = snapshot.val() || {};
        // Reset recentMap from snapshot
        Object.keys(recentMap).forEach((k) => delete recentMap[k]);
        Object.entries(val).forEach(([partnerUid, data]: [string, any]) => {
          if (!data || typeof data !== "object") return;
          recentMap[partnerUid] = {
            lastMessage: data.lastMessage || "",
            timestamp: data.timestamp || 0,
            partnerName: data.partnerName,
          };
        });
        notify();
      },
      (err: any) => console.warn("userChats error:", err)
    );

    usersUnsub = onUsersChange((usersMap) => {
      if (!active) return;

      Object.entries(usersMap).forEach(([partnerUid, partnerData]: [string, any]) => {
        if (!partnerUid || partnerUid === currentUserId || roomUnsubs.has(partnerUid)) return;

        const chatRoomId = generateChatRoomId(currentUserId, partnerUid);
        const messagesRef = runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/messages`);

        const unsub = runtime.dbFns.onValue(
          messagesRef,
          (snap: any) => {
            const msgsObj = snap.val() || {};
            const msgs = Object.values(msgsObj).filter((m: any) => {
              if (!m || typeof m !== "object") return false;
              if (m.deletedFor?.[currentUserId]) return false;
              if (m.senderId !== currentUserId && m.blocked) return false;
              return true;
            }) as ChatMessage[];

            if (msgs.length > 0) {
              msgs.sort((a, b) => b.timestamp - a.timestamp);
              const latest = msgs[0];
              const partnerName =
                partnerData?.name ||
                partnerData?.displayName ||
                (partnerData?.email ? partnerData.email.split("@")[0] : "User");

              let displayMsg = latest.deletedForEveryone
                ? "This message was deleted"
                : latest.text || (latest.mediaType === "image" ? "📷 Photo" : latest.mediaType === "video" ? "🎥 Video" : latest.mediaType === "audio" ? "🎵 Voice note" : "📁 Document");

              if (latest.e2ee && latest.nonce && !latest.deletedForEveryone) {
                getUserPublicKey(partnerUid).then((identity) => {
                  if (latest.version === 2 || !identity?.publicKey) {
                    return decryptFallbackChatMessage(
                      latest.text,
                      latest.nonce!,
                      currentUserId,
                      partnerUid
                    ).catch(() => "🔒 Encrypted message");
                  }
                  return decryptChatMessage(
                    { ciphertext: latest.text, nonce: latest.nonce! },
                    currentUserId,
                    partnerUid,
                    identity.publicKey
                  ).catch(() => "🔒 Encrypted message");
                }).then((decryptedText) => {
                  if (!active) return;
                  recentMap[partnerUid] = {
                    lastMessage: decryptedText,
                    timestamp: latest.timestamp,
                    partnerName,
                  };
                  notify();
                });
              } else {
                recentMap[partnerUid] = {
                  lastMessage: displayMsg,
                  timestamp: latest.timestamp,
                  partnerName,
                };
                notify();
              }
            } else {
              delete recentMap[partnerUid];
              notify();
            }
          },
          (err: any) => console.warn(`Room ${chatRoomId} warning:`, err)
        );

        roomUnsubs.set(partnerUid, unsub);
      });
    });
  });

  return () => {
    active = false;
    userChatsUnsub();
    usersUnsub();
    removedChatsUnsub();
    roomUnsubs.forEach((unsub) => unsub());
    roomUnsubs.clear();
  };
}


export function onTypingChange(
  currentUserId: string,
  selectedUserId: string,
  callback: (typing: boolean) => void
) {
  let active = true;
  let unsubscribe = () => {};

  loadFirebase().then((runtime) => {
    if (!active) return;
    if (!runtime || !currentUserId || !selectedUserId) {
      callback(false);
      return;
    }

    const chatRoomId = generateChatRoomId(currentUserId, selectedUserId);
    const typingRef = runtime.dbFns.ref(
      runtime.db,
      `chats/${chatRoomId}/typing/${selectedUserId}`
    );

    unsubscribe = runtime.dbFns.onValue(typingRef, (snapshot: any) => {
      callback(Boolean(snapshot.val()));
    }, (err: any) => {
      console.warn("onTypingChange warning:", err);
    });
  });

  return () => {
    active = false;
    unsubscribe();
  };
}

export function onOnlineStatusChange(
  arg1: string,
  arg2: any,
  arg3?: (online: boolean) => void
) {
  let userId = arg1;
  let observerUserId = "";
  let callback: (online: boolean) => void;

  if (typeof arg2 === "function") {
    callback = arg2;
  } else {
    observerUserId = arg2 || "";
    callback = arg3 || (() => {});
  }

  let active = true;
  let unsubscribeUser = () => {};
  let unsubscribeBlock = () => {};

  loadFirebase().then((runtime) => {
    if (!active) return;
    if (!runtime || !userId) {
      callback(false);
      return;
    }

    const onlineRef = runtime.dbFns.ref(runtime.db, `users/${userId}/online`);
    let isUserOnline = false;
    let isObserverBlocked = false;

    const updateStatus = () => {
      if (!active) return;
      if (isObserverBlocked) {
        callback(false);
      } else {
        callback(isUserOnline);
      }
    };

    unsubscribeUser = runtime.dbFns.onValue(
      onlineRef,
      (snapshot: any) => {
        isUserOnline = Boolean(snapshot.val());
        updateStatus();
      },
      (err: any) => {
        console.warn("onOnlineStatusChange warning:", err);
      }
    );

    if (observerUserId) {
      const blockRef = runtime.dbFns.ref(runtime.db, `users/${userId}/blockedUsers/${observerUserId}`);
      unsubscribeBlock = runtime.dbFns.onValue(blockRef, (snapshot: any) => {
        isObserverBlocked = Boolean(snapshot.val());
        updateStatus();
      });
    }
  });

  return () => {
    active = false;
    unsubscribeUser();
    unsubscribeBlock();
  };
}

export function generateChatRoomId(
  a: string,
  b: string
) {

  return [a, b]
    .sort()
    .join("_");
}

export async function sendMessage(
  arg1: any,
  arg2?: any,
  arg3?: string
) {
  let chatRoomId = "";
  let messagePayload: ChatMessage;

  if (typeof arg1 === "object" && arg1 !== null && arg1.senderId && arg1.receiverId) {
    // Called as sendMessage({ senderId, receiverId, text })
    messagePayload = arg1;
    chatRoomId = generateChatRoomId(arg1.senderId, arg1.receiverId);
  } else if (typeof arg3 === "string") {
    // Called as sendMessage(senderId, receiverId, text)
    const senderId = arg1;
    const receiverId = arg2;
    const text = arg3;
    chatRoomId = generateChatRoomId(senderId, receiverId);
    messagePayload = {
      senderId,
      receiverId,
      text,
      timestamp: Date.now(),
    };
  } else {
    // Called as sendMessage(chatRoomId, messageObject)
    chatRoomId = arg1;
    messagePayload = arg2;
  }

  if (!chatRoomId || !messagePayload || (!messagePayload.text && !messagePayload.mediaUrl)) {
    throw new Error("Invalid message payload");
  }

  const runtime = await requireFirebase();

  let isBlockedByReceiver = false;
  if (messagePayload.receiverId) {
    try {
      const blockRef = runtime.dbFns.ref(
        runtime.db,
        `users/${messagePayload.receiverId}/blockedUsers/${messagePayload.senderId}`
      );
      const blockSnap = await runtime.dbFns.get(blockRef);
      isBlockedByReceiver = Boolean(blockSnap.val());
    } catch (e) {
      console.warn("Check block status error:", e);
    }
  }

  // E2EE: Encrypt message text (Mode 1: X25519 DH or Mode 2: Fallback Room AES-256-GCM)
  let textToWrite = messagePayload.text || "";
  let isE2ee = false;
  let nonce = "";
  let version = 1;

  if (messagePayload.receiverId && messagePayload.senderId && messagePayload.text) {
    try {
      let [recipientIdentity, senderKeys] = await Promise.all([
        getUserPublicKey(messagePayload.receiverId),
        getIdentityKeys(messagePayload.senderId),
      ]);

      // Ensure sender identity exists locally
      if (!senderKeys?.privateKey) {
        await ensureUserIdentity(messagePayload.senderId, getIdentityBackup, saveIdentityBackup);
        senderKeys = await getIdentityKeys(messagePayload.senderId);
      }

      if (recipientIdentity?.publicKey && senderKeys?.privateKey) {
        // Mode 1: Full asymmetric X25519 Diffie-Hellman + AES-256-GCM
        const encrypted = await encryptChatMessage(
          messagePayload.text,
          messagePayload.senderId,
          messagePayload.receiverId,
          recipientIdentity.publicKey
        );
        textToWrite = encrypted.ciphertext;
        nonce = encrypted.nonce;
        version = encrypted.version || 1;
        isE2ee = true;
      } else {
        // Mode 2: Room-derived Authenticated AES-256-GCM Encryption
        // NEVER leave message in plaintext! Guarantees existing accounts are 100% encrypted in Firebase!
        const encrypted = await encryptFallbackChatMessage(
          messagePayload.text,
          messagePayload.senderId,
          messagePayload.receiverId
        );
        textToWrite = encrypted.ciphertext;
        nonce = encrypted.nonce;
        version = encrypted.version || 2;
        isE2ee = true;
      }
    } catch (e2eErr) {
      console.warn("Message E2EE encryption error, applying fallback room encryption:", e2eErr);
      try {
        const encrypted = await encryptFallbackChatMessage(
          messagePayload.text,
          messagePayload.senderId,
          messagePayload.receiverId
        );
        textToWrite = encrypted.ciphertext;
        nonce = encrypted.nonce;
        version = 2;
        isE2ee = true;
      } catch (fallbackErr) {
        console.error("Emergency fallback encryption failed:", fallbackErr);
      }
    }
  }

  const messagesRef = runtime.dbFns.ref(
    runtime.db,
    `chats/${chatRoomId}/messages`
  );

  const newMessage = {
    ...messagePayload,
    text: textToWrite,
    read: false,
    blocked: isBlockedByReceiver,
    timestamp: messagePayload.timestamp || Date.now(),
    ...(isE2ee ? { e2ee: true, nonce, version } : {}),
  };

  const customId = messagePayload.id;
  let newMessageRef;
  if (customId) {
    newMessageRef = runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/messages/${customId}`);
    await runtime.dbFns.set(newMessageRef, {
      ...newMessage,
      id: customId,
    });
  } else {
    newMessageRef = await runtime.dbFns.push(messagesRef, newMessage);
  }

  const msgId = customId || newMessageRef.key || String(Date.now());

  if (messagePayload.senderId && messagePayload.receiverId) {
    const summaryText = isE2ee ? (
      messagePayload.mediaType === "image" ? "📷 Photo" :
      messagePayload.mediaType === "video" ? "🎥 Video" :
      messagePayload.mediaType === "audio" ? "🎵 Voice note" :
      messagePayload.mediaType === "file" ? "📁 Document" : "🔒 Encrypted message"
    ) : (
      messagePayload.text || (
        messagePayload.mediaType === "image" ? "📷 Photo" :
        messagePayload.mediaType === "video" ? "🎥 Video" :
        messagePayload.mediaType === "audio" ? "🎵 Voice note" : "📁 Document"
      )
    );
    const ts = newMessage.timestamp;
    try {
      const senderRef = runtime.dbFns.ref(runtime.db, `users/${messagePayload.senderId}`);
      const receiverRef = runtime.dbFns.ref(runtime.db, `users/${messagePayload.receiverId}`);
      const [senderSnap, receiverSnap] = await Promise.all([
        runtime.dbFns.get(senderRef).catch(() => null),
        runtime.dbFns.get(receiverRef).catch(() => null),
      ]);
      const senderVal = senderSnap?.val() || {};
      const receiverVal = receiverSnap?.val() || {};
      const senderName = senderVal.name || senderVal.displayName || (senderVal.email ? senderVal.email.split("@")[0] : "User");
      const receiverName = receiverVal.name || receiverVal.displayName || (receiverVal.email ? receiverVal.email.split("@")[0] : "User");

      await Promise.all([
        runtime.dbFns.set(
          runtime.dbFns.ref(runtime.db, `userChats/${messagePayload.senderId}/${messagePayload.receiverId}`),
          { lastMessage: summaryText, timestamp: ts, partnerUid: messagePayload.receiverId, partnerName: receiverName }
        ).catch(() => {}),
        runtime.dbFns.set(
          runtime.dbFns.ref(runtime.db, `userChats/${messagePayload.receiverId}/${messagePayload.senderId}`),
          { lastMessage: summaryText, timestamp: ts, partnerUid: messagePayload.senderId, partnerName: senderName }
        ).catch(() => {}),
      ]);
    } catch (e) {
      console.warn("userChats update warning:", e);
    }
  }

  try {
    if (messagePayload.receiverId && !isBlockedByReceiver) {
      const receiverRef = runtime.dbFns.ref(
        runtime.db,
        `users/${messagePayload.receiverId}/fcmTokens`
      );

      const snapshot = await runtime.dbFns.get(receiverRef);
      const tokens = snapshot.val() || {};

      const senderRef = runtime.dbFns.ref(
        runtime.db,
        `users/${messagePayload.senderId}`
      );
      const senderSnapshot = await runtime.dbFns.get(senderRef);
      const senderData = senderSnapshot.val();
      const senderName = senderData?.name || senderData?.displayName || "Someone";

      const rawList = Object.values(tokens).map((t: any) => (typeof t === "string" ? t : t?.token)).filter(Boolean);
      const uniqueTokens = Array.from(new Set(rawList));
      const msgId = newMessageRef.key || String(Date.now());

      let notificationBody = messagePayload.text || "";

      if (messagePayload.mediaType === "image") {
        notificationBody = messagePayload.text
          ? `📷 Photo: ${messagePayload.text}`
          : `${senderName} sent a photo`;
      } else if (messagePayload.mediaType === "video") {
        notificationBody = messagePayload.text
          ? `🎥 Video: ${messagePayload.text}`
          : `${senderName} sent a video`;
      } else if (messagePayload.mediaType === "audio") {
        notificationBody = messagePayload.text
          ? `🎵 Audio: ${messagePayload.text}`
          : `${senderName} sent an audio message`;
      } else if (messagePayload.mediaType === "file") {
        notificationBody = messagePayload.text
          ? `📁 Document: ${messagePayload.text}`
          : `${senderName} sent a file: ${messagePayload.mediaName || "Document"}`;
      }

      // Encrypt notification preview for recipient's notification key if available
      let encryptedPreviewPayload: any = null;
      if (isE2ee) {
        try {
          const [senderKeys, recipientIdentity] = await Promise.all([
            getIdentityKeys(messagePayload.senderId),
            getUserPublicKey(messagePayload.receiverId),
          ]);
          if (senderKeys?.privateKey && recipientIdentity?.notificationPublicKey) {
            const encPreview = await encryptNotificationPreview(
              notificationBody,
              messagePayload.senderId,
              recipientIdentity.notificationPublicKey
            );
            encryptedPreviewPayload = {
              encryptedPreview: encPreview.encryptedPreview,
              nonce: encPreview.nonce,
              senderPubKey: uint8ArrayToBase64(senderKeys.publicKey),
            };
          }
        } catch (notifErr) {
          console.warn("Notification preview encryption error:", notifErr);
        }
      }

      const appTargetUrl = (import.meta.env.VITE_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")) + "/";

      for (const tokenStr of uniqueTokens) {
        fetch(getApiUrl("/api/send-notification"), {
          method: "POST",
          headers: getApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            token: tokenStr,
            title: `New message from ${senderName}`,
            body: notificationBody,
            icon: "/icons/icon-192x192.png",
            senderName: senderName,
            senderId: messagePayload.senderId,
            ...(encryptedPreviewPayload || {}),
            data: {
              msgId: String(msgId),
              senderId: String(messagePayload.senderId),
              senderName: String(senderName),
              body: String(notificationBody),
              title: `New message from ${senderName}`,
              url: appTargetUrl,
              ...(encryptedPreviewPayload || {}),
            },
          }),
        }).catch((e) => console.warn("FCM fetch warning:", e));
      }
    }
  } catch (e) {
    console.warn("Notification error:", e);
  }
}

export function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (err) {
    console.warn("Could not play notification sound:", err);
  }
}

let ringtoneInterval: any = null;

export function startRingtone() {
  stopRingtone();
  playRingtoneBeep();
  ringtoneInterval = setInterval(() => {
    playRingtoneBeep();
  }, 2500);
}

export function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

function playRingtoneBeep() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.setValueAtTime(480, ctx.currentTime);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);

    osc1.stop(ctx.currentTime + 1.5);
    osc2.stop(ctx.currentTime + 1.5);
  } catch (err) {
    console.warn("Could not play ringtone sound:", err);
  }
}

export function showNativeNotification(title: string, options?: NotificationOptions) {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission().then((perm) => {
      if (perm === "granted") {
        createNativeNotification(title, options);
      }
    }).catch(console.warn);
    return;
  }

  if (Notification.permission === "granted") {
    createNativeNotification(title, options);
  }
}

function createNativeNotification(title: string, options?: NotificationOptions) {
  try {
    const iconUrl = window.location.origin + "/icons/icon.svg";
    const notificationOptions: NotificationOptions = {
      icon: iconUrl,
      badge: iconUrl,
      renotify: true,
      tag: options?.tag || Date.now().toString(),
      body: options?.body || "",
      ...options,
    };

    const notification = new Notification(title, notificationOptions);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (err) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          icon: "/icons/icon.svg",
          badge: "/icons/icon.svg",
          ...options,
        });
      }).catch(console.warn);
    }
  }
}

export async function markMessagesAsRead(
  arg1: string,
  arg2: string
) {
  const runtime = await loadFirebase();
  if (!runtime || !arg1 || !arg2) return;

  const chatRoomId = arg1.includes("_") ? arg1 : generateChatRoomId(arg1, arg2);
  const currentUserId = arg1.includes("_") ? arg2 : arg1;

  const messagesRef = runtime.dbFns.ref(
    runtime.db,
    `chats/${chatRoomId}/messages`
  );

  try {
    const snapshot = await runtime.dbFns.get(messagesRef);
    if (snapshot.exists()) {
      const updates: Record<string, any> = {};
      snapshot.forEach((child: any) => {
        const data = child.val();
        if (data.receiverId === currentUserId && !data.read) {
          updates[`${child.key}/read`] = true;
        }
      });
      if (Object.keys(updates).length > 0) {
        return runtime.dbFns.update(messagesRef, updates);
      }
    }
  } catch (error) {
    console.error("Mark as read error:", error);
  }
}

export async function setTyping(
  arg1: string,
  arg2: string,
  arg3: boolean
) {
  let chatRoomId = "";
  let typingUserId = "";
  let typingState = false;

  if (typeof arg3 === "boolean") {
    // Called as setTyping(currentUserId, selectedUserId, typingState)
    const currentUserId = arg1;
    const selectedUserId = arg2;
    typingState = arg3;
    chatRoomId = generateChatRoomId(currentUserId, selectedUserId);
    typingUserId = currentUserId;
  } else {
    // Called as setTyping(chatRoomId, uid, typingState)
    chatRoomId = arg1;
    typingUserId = arg2;
    typingState = Boolean(arg3);
  }

  if (!chatRoomId || !typingUserId) return;

  const runtime = await loadFirebase();
  if (!runtime) return;

  try {
    const typingRef = runtime.dbFns.ref(
      runtime.db,
      `chats/${chatRoomId}/typing/${typingUserId}`
    );
    if (typingState) {
      try {
        runtime.dbFns.onDisconnect(typingRef).set(false).catch(() => {});
      } catch (e) {}
      return await runtime.dbFns.set(typingRef, true);
    } else {
      return await runtime.dbFns.set(typingRef, false);
    }
  } catch (err) {
    console.warn("setTyping DB error:", err);
  }
}

export async function toggleMessageReaction(
  currentUserId: string,
  selectedUserId: string,
  messageId: string,
  emoji: string
) {
  const runtime = await loadFirebase();
  if (!runtime || !currentUserId || !selectedUserId || !messageId || !emoji) return;

  const chatRoomId = generateChatRoomId(currentUserId, selectedUserId);
  const reactionsRef = runtime.dbFns.ref(
    runtime.db,
    `chats/${chatRoomId}/messages/${messageId}/reactions`
  );

  try {
    const snapshot = await runtime.dbFns.get(reactionsRef);
    const existingReactions = snapshot.val() || {};

    let alreadyHasSameEmoji = false;
    const updates: Record<string, any> = {};

    Object.keys(existingReactions).forEach((e) => {
      if (existingReactions[e] && existingReactions[e][currentUserId]) {
        if (e === emoji) {
          alreadyHasSameEmoji = true;
        }
        updates[`${e}/${currentUserId}`] = null;
      }
    });

    if (!alreadyHasSameEmoji) {
      updates[`${emoji}/${currentUserId}`] = true;
    }

    await runtime.dbFns.update(reactionsRef, updates);
  } catch (err) {
    console.warn("toggleMessageReaction error:", err);
  }
}

export async function editMessage(
  arg1: string,
  arg2: string,
  arg3: string,
  arg4?: string
) {
  let chatRoomId = "";
  let messageId = "";
  let newText = "";

  if (arg4) {
    // Called as editMessage(currentUserId, selectedUserId, messageId, newText)
    chatRoomId = generateChatRoomId(arg1, arg2);
    messageId = arg3;
    newText = arg4;
  } else if (arg1.includes("_")) {
    // Called as editMessage(chatRoomId, messageId, newText)
    chatRoomId = arg1;
    messageId = arg2;
    newText = arg3;
  } else {
    chatRoomId = generateChatRoomId(arg1, arg2);
    messageId = arg2;
    newText = arg3;
  }

  const runtime = await loadFirebase();
  if (!runtime) return;

  try {
    let textToWrite = newText;
    let isE2ee = false;
    let nonce = "";

    const uids = chatRoomId.split("_");
    const senderUid = arg4 ? arg1 : (arg1.includes("_") ? "" : arg1);
    const receiverUid = uids.find((u) => u !== senderUid) || "";

    if (senderUid && receiverUid) {
      try {
        const [senderKeys, recipientIdentity] = await Promise.all([
          getIdentityKeys(senderUid),
          getUserPublicKey(receiverUid),
        ]);
        if (senderKeys?.privateKey && recipientIdentity?.publicKey) {
          const encrypted = await encryptChatMessage(
            newText,
            senderUid,
            receiverUid,
            recipientIdentity.publicKey
          );
          textToWrite = encrypted.ciphertext;
          nonce = encrypted.nonce;
          isE2ee = true;
        }
      } catch (e) {
        console.warn("editMessage encryption warning:", e);
      }
    }

    const updateData: any = {
      text: textToWrite,
      edited: true,
      editedAt: Date.now(),
    };
    if (isE2ee) {
      updateData.e2ee = true;
      updateData.nonce = nonce;
    }

    return await runtime.dbFns.update(
      runtime.dbFns.ref(
        runtime.db,
        `chats/${chatRoomId}/messages/${messageId}`
      ),
      updateData
    );
  } catch (err) {
    console.warn("editMessage DB error:", err);
  }
}

export async function clearChatForMe(
  arg1: string,
  arg2: string
) {
  const chatRoomId = arg1.includes("_") ? arg1 : generateChatRoomId(arg1, arg2);
  const uid = arg1.includes("_") ? arg2 : arg1;

  const runtime = await loadFirebase();
  if (!runtime) return;

  try {
    const messagesRef = runtime.dbFns.ref(
      runtime.db,
      `chats/${chatRoomId}/messages`
    );

    const snapshot = await runtime.dbFns.get(messagesRef);
    if (snapshot.exists()) {
      const updates: Record<string, any> = {};
      snapshot.forEach((child: any) => {
        updates[`${child.key}/deletedFor/${uid}`] = true;
      });
      if (Object.keys(updates).length > 0) {
        return await runtime.dbFns.update(messagesRef, updates);
      }
    }
  } catch (err) {
    console.warn("clearChatForMe DB error:", err);
  }
}

export async function removeUserChat(currentUserId: string, partnerUid: string) {
  const runtime = await loadFirebase();
  if (!runtime || !currentUserId || !partnerUid) return;

  const removeTimestamp = Date.now();

  // 1. Remove from userChats node
  try {
    const userChatRef = runtime.dbFns.ref(
      runtime.db,
      `userChats/${currentUserId}/${partnerUid}`
    );
    await runtime.dbFns.remove(userChatRef);
  } catch (e) {
    console.warn("removeUserChat userChats remove warning:", e);
  }

  // 2. Set removedChats node
  try {
    const removedRef = runtime.dbFns.ref(
      runtime.db,
      `users/${currentUserId}/removedChats/${partnerUid}`
    );
    await runtime.dbFns.set(removedRef, removeTimestamp);
  } catch (e) {
    console.warn("removeUserChat set removedChats warning:", e);
  }

  // 3. Clear messages for current user
  try {
    await clearChatForMe(currentUserId, partnerUid);
  } catch (e) {
    console.warn("removeUserChat clearChatForMe warning:", e);
  }
}

export async function deleteMessageForMe(
  arg1: string,
  arg2: string,
  arg3?: string
) {
  let chatRoomId = "";
  let messageId = "";
  let uid = "";

  if (arg3) {
    // Called as deleteMessageForMe(currentUserId, selectedUserId, messageId)
    chatRoomId = generateChatRoomId(arg1, arg2);
    messageId = arg3;
    uid = arg1;
  } else {
    // Called as deleteMessageForMe(chatRoomId, messageId)
    chatRoomId = arg1;
    messageId = arg2;
  }

  const runtime = await loadFirebase();
  if (!runtime) return;

  try {
    if (uid) {
      return await runtime.dbFns.set(
        runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/messages/${messageId}/deletedFor/${uid}`),
        true
      );
    }

    return await runtime.dbFns.remove(
      runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/messages/${messageId}`)
    );
  } catch (err) {
    console.warn("deleteMessageForMe DB error:", err);
  }
}

export async function deleteMessageForEveryone(
  arg1: string,
  arg2: string,
  arg3?: string
) {
  let chatRoomId = "";
  let messageId = "";

  if (arg3) {
    // Called as deleteMessageForEveryone(currentUserId, selectedUserId, messageId)
    chatRoomId = generateChatRoomId(arg1, arg2);
    messageId = arg3;
  } else {
    // Called as deleteMessageForEveryone(chatRoomId, messageId)
    chatRoomId = arg1;
    messageId = arg2;
  }

  const runtime = await loadFirebase();
  if (!runtime) return;

  try {
    const msgRef = runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/messages/${messageId}`);
    try {
      const snap = await runtime.dbFns.get(msgRef);
      const val = snap?.val() as ChatMessage | null;
      if (val && val.mediaKey) {
        fetch(getApiUrl("/api/delete-media"), {
          method: "POST",
          headers: getApiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key: val.mediaKey }),
        }).catch((err) => console.warn("R2 delete call error:", err));
      }
    } catch (e) {
      console.warn("Check mediaKey error before delete:", e);
    }

    return await runtime.dbFns.update(
      msgRef,
      {
        text: "This message was deleted",
        deletedForEveryone: true,
        mediaUrl: null,
        mediaKey: null,
        mediaType: null,
        mediaName: null,
        mediaSize: null,
        reactions: null,
      }
    );
  } catch (err) {
    console.warn("deleteMessageForEveryone DB error:", err);
  }
}

export async function deleteUserFromDatabase(targetUid: string) {
  const runtime = await loadFirebase();
  if (!runtime || !targetUid) return;

  try {
    return await runtime.dbFns.remove(
      runtime.dbFns.ref(runtime.db, `users/${targetUid}`)
    );
  } catch (err) {
    console.warn("deleteUserFromDatabase DB error:", err);
  }
}

export async function deleteUserAccount() {
  const runtime = await loadFirebase();
  if (!runtime || !runtime.auth?.currentUser) return;

  const user = runtime.auth.currentUser;
  const uid = user.uid;

  try {
    await runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${uid}`));
  } catch (err) {
    console.warn("Error removing user database node:", err);
  }

  try {
    await runtime.authFns.deleteUser(user);
  } catch (err) {
    console.warn("Error deleting auth user:", err);
  }
}

export async function verifyAndSyncDatabaseUsers() {
  const runtime = await loadFirebase();
  if (!runtime || !runtime.auth?.currentUser) return;

  try {
    const usersRef = runtime.dbFns.ref(runtime.db, "users");
    const snapshot = await runtime.dbFns.get(usersRef);
    if (!snapshot.exists()) return;

    const val = snapshot.val() || {};
    const entries = Object.entries(val);

    for (const [uid, userData] of entries) {
      if (!userData || typeof userData !== "object") continue;
      const email = (userData as any).email;
      if (!email) continue;

      try {
        const methods = await runtime.authFns.fetchSignInMethodsForEmail(runtime.auth, email).catch(() => null);
        if (methods && Array.isArray(methods) && methods.length === 0) {
          console.log(`Auto-cleaning deleted Auth user node from Realtime Database: ${email} (${uid})`);
          await runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${uid}`));
        }
      } catch (err: any) {
        if (err?.code === "auth/invalid-email" || err?.code === "auth/user-not-found") {
          await runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${uid}`));
        }
      }
    }
  } catch (err) {
    console.warn("verifyAndSyncDatabaseUsers error:", err);
  }
}

export function escapeHtml(
  value: string
) {
  return value;
}

export async function requestFCMToken(
  uid?: string
) {
  await ensureConfigLoaded();
  const vapidKey =
    import.meta.env.VITE_FIREBASE_VAPID_KEY ||
    firebaseConfig.vapidKey ||
    "";

  if (!uid || !("Notification" in window) || !vapidKey) {
    return null;
  }

  const runtime = await loadFirebase();
  if (!runtime) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }

  const messagingFns = await import(/* @vite-ignore */ `${CDN}/firebase-messaging.js`);
  const supported = await messagingFns.isSupported();
  if (!supported) return null;

  // FCM must use the same worker as the PWA. A second root-scope worker
  // replaces the first worker and causes closed-app pushes to be lost.
  let registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) {
    const swParams = new URLSearchParams(firebaseConfig).toString();
    registration = await navigator.serviceWorker.register(`/sw.js?${swParams}`, { scope: "/" });
  }
  await navigator.serviceWorker.ready;

  if (!registration || !registration.active) {
    console.error("Service Worker activation timeout");
    return null;
  }

  const messaging = messagingFns.getMessaging(runtime.app);

  let token: string | null = null;
  try {
    if (vapidKey) {
      token = await messagingFns.getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      }).catch((e: any) => {
        console.warn("FCM getToken with vapidKey failed, trying default:", e);
        return null;
      });
    }
    if (!token) {
      token = await messagingFns.getToken(messaging, {
        serviceWorkerRegistration: registration,
      }).catch((e: any) => {
        console.error("FCM getToken default failed:", e);
        return null;
      });
    }
  } catch (e) {
    console.error("requestFCMToken error:", e);
  }

  if (token) {
    const safeKey = token.replace(/[.#$/[\]]/g, "_");
    await runtime.dbFns.update(
      runtime.dbFns.ref(
        runtime.db,
        `users/${uid}/fcmTokens/${safeKey}`
      ),
      {
        token,
        updatedAt: Date.now(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Web",
        platform: typeof navigator !== "undefined" ? navigator.platform : "Web",
      }
    );
  }

  return token;
}

export async function onForegroundMessage(callback: (payload: any) => void) {
  if (!("Notification" in window)) return () => {};
  const runtime = await loadFirebase();
  if (!runtime) return () => {};

  try {
    const messagingFns = await import(/* @vite-ignore */ `${CDN}/firebase-messaging.js`);
    const supported = await messagingFns.isSupported();
    if (!supported) return () => {};

    const messaging = messagingFns.getMessaging(runtime.app);
    return messagingFns.onMessage(messaging, callback);
  } catch (err) {
    console.warn("Foreground messaging setup warning:", err);
    return () => {};
  }
}

export async function removeFCMToken(
  uid?: string
) {

  if (!uid)
    return;

  const runtime =
    await loadFirebase();

  if (!runtime)
    return;

  const messagingFns =
    await import(

      /* @vite-ignore */
      `${CDN}/firebase-messaging.js`
    );

  const supported =
    await messagingFns
      .isSupported();

  if (!supported)
    return;

  const messaging =
    messagingFns
      .getMessaging(
        runtime.app
      );

  const token =
    await messagingFns
      .getToken(

        messaging,

        {
          vapidKey:
            import.meta.env
              .VITE_FIREBASE_VAPID_KEY,

          serviceWorkerRegistration:
            await navigator
              .serviceWorker.ready,
        }
      );

  if (token) {

    await runtime.dbFns
      .remove(

        runtime.dbFns.ref(

          runtime.db,

          `users/${uid}/fcmTokens/${token.replace(
            /[.#$/[\]]/g,
            "_"
          )}`
        )
      );
  }
}

export async function sendCallPushNotification(
  targetUid: string,
  callerName: string,
  callType: "audio" | "video" = "audio",
  callerUid?: string
) {
  try {
    const runtime = await loadFirebase();
    if (!runtime) return;

    if (callerUid) {
      const blockRef = runtime.dbFns.ref(runtime.db, `users/${targetUid}/blockedUsers/${callerUid}`);
      const blockSnap = await runtime.dbFns.get(blockRef);
      if (blockSnap.val()) {
        console.log(`Call push suppressed: Target ${targetUid} blocked caller ${callerUid}`);
        return;
      }
    }

    const receiverRef = runtime.dbFns.ref(runtime.db, `users/${targetUid}/fcmTokens`);
    const snapshot = await runtime.dbFns.get(receiverRef);
    const tokens = snapshot.val() || {};

    const rawList = Object.values(tokens).map((t: any) => (typeof t === "string" ? t : t?.token)).filter(Boolean);
    const uniqueTokens = Array.from(new Set(rawList));

    for (const tokenStr of uniqueTokens) {
      fetch(getApiUrl("/api/send-notification"), {
        method: "POST",
        headers: getApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          token: tokenStr,
          title: `📞 Incoming ${callType === "video" ? "Video" : "Voice"} Call`,
          body: `${callerName} is calling you on ChatsApp. Tap to answer.`,
          icon: "/icons/icon-192x192.png",
          data: {
            type: "incoming_call",
            callerName,
            callType,
            url: "/",
          },
        }),
      }).catch(console.error);
    }
  } catch (e) {
    console.warn("Call notification error:", e);
  }
}


export async function logCallHistory(
  callerId: string,
  receiverId: string,
  callType: "audio" | "video",
  status: "missed" | "declined" | "completed",
  duration = 0,
  startedAt?: number
) {
  if (!callerId || !receiverId) return;
  const runtime = await loadFirebase();
  if (!runtime) return;

  const chatRoomId = generateChatRoomId(callerId, receiverId);
  const ts = startedAt || Date.now();
  const callMsgId = `call_${chatRoomId}_${Math.floor(ts / 30000)}`;

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durStr = duration > 0 ? (mins > 0 && secs > 0 ? `${mins}m ${secs}s` : mins > 0 ? `${mins}m` : `${secs}s`) : "";

  let summaryText = "";
  if (status === "missed") {
    summaryText = callType === "video"
      ? `📹 Missed video call${durStr ? ` (${durStr})` : ""}`
      : `📞 Missed voice call${durStr ? ` (${durStr})` : ""}`;
  } else if (status === "declined") {
    summaryText = callType === "video"
      ? `📹 Declined video call${durStr ? ` (${durStr})` : ""}`
      : `📞 Declined voice call${durStr ? ` (${durStr})` : ""}`;
  } else {
    summaryText = callType === "video"
      ? `📹 Video call (${durStr || "0s"})`
      : `📞 Voice call (${durStr || "0s"})`;
  }

  const callMessage: ChatMessage = {
    id: callMsgId,
    senderId: callerId,
    receiverId: receiverId,
    text: summaryText,
    timestamp: ts,
    read: false,
    callInfo: {
      type: callType,
      status,
      duration,
    },
  };

  try {
    const msgRef = runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/messages/${callMsgId}`);
    const existingSnap = await runtime.dbFns.get(msgRef);
    if (existingSnap.exists()) return;

    await runtime.dbFns.set(msgRef, callMessage);

    await Promise.all([
      runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `userChats/${callerId}/${receiverId}`), {
        lastMessage: summaryText,
        timestamp: ts,
      }).catch(() => {}),
      runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `userChats/${receiverId}/${callerId}`), {
        lastMessage: summaryText,
        timestamp: ts,
      }).catch(() => {}),
    ]);
  } catch (err) {
    console.warn("logCallHistory warning:", err);
  }
}
