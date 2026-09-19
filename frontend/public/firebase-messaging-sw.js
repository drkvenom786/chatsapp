// ============================================================================
// chatsapp.pro - Main Service Worker for PWA Cache & Background FCM Messaging
// ============================================================================

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
importScripts("/sw-crypto.js");

// Extract Firebase configuration dynamically from registration URL query parameters
const _swUrl = new URL(self.location.href);
const _sp = _swUrl.searchParams;

const firebaseConfig = {
  apiKey: _sp.get("apiKey") || "",
  authDomain: _sp.get("authDomain") || "",
  databaseURL: _sp.get("databaseURL") || "",
  projectId: _sp.get("projectId") || "",
  storageBucket: _sp.get("storageBucket") || "",
  messagingSenderId: _sp.get("messagingSenderId") || "",
  appId: _sp.get("appId") || "",
};

let messaging = null;

function setupBackgroundMessaging(msgInstance) {
  if (!msgInstance) return;
  msgInstance.onBackgroundMessage((payload) => {
    console.log("[Main SW] Background payload received:", payload);
    return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      const isFocused = clientList.some((client) => client.focused && client.visibilityState === "visible");
      if (isFocused) return;

      const isCall = payload.data?.type === "incoming_call";
      const title = payload.notification?.title || payload.data?.title || (isCall ? "📞 Incoming Call" : "New Message");
      let body = payload.data?.body || payload.notification?.body || "";
      const tag = payload.data?.msgId || payload.data?.tag || (isCall ? "chatsapp_call" : "chatsapp_msg");
      const icon = payload.data?.icon || payload.notification?.icon || "/icons/icon-192x192.png";

      const encryptedPreview = payload.data?.encryptedPreview || payload.encryptedPreview;
      const nonce = payload.data?.nonce || payload.nonce;
      const senderPubKey = payload.data?.senderPubKey || payload.senderPubKey;
      const hideContent = (payload.data?.hideContent || payload.hideContent) === "true";

      if (hideContent) {
        const senderName = payload.data?.senderName || payload.senderName;
        body = senderName ? `${senderName} sent you a message` : "New message";
      } else if (encryptedPreview && nonce && senderPubKey && self.decryptNotificationPayload) {
        try {
          const decrypted = await self.decryptNotificationPayload(encryptedPreview, nonce, senderPubKey);
          if (decrypted) body = decrypted;
        } catch (e) {
          console.warn("[Main SW] Decrypt failed:", e);
        }
      }

      if (!body) body = "New message";

      const options = {
        body: body,
        icon: icon,
        badge: "/icons/icon-192x192.png",
        tag: tag,
        renotify: true,
        requireInteraction: isCall,
        vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
        data: {
          url: payload.data?.url || "/",
          ...(payload.data || {}),
        },
      };

      return self.registration.showNotification(title, options);
    });
  });
}

function initFirebase(cfg) {
  if (!cfg || !cfg.apiKey) return;
  if (typeof firebase !== "undefined" && (!firebase.apps || firebase.apps.length === 0)) {
    try {
      firebase.initializeApp(cfg);
      messaging = firebase.messaging();
      setupBackgroundMessaging(messaging);
    } catch (e) {
      console.warn("SW Firebase initialization warning:", e);
    }
  }
}

if (firebaseConfig.apiKey) {
  initFirebase(firebaseConfig);
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_FIREBASE_CONFIG") {
    initFirebase(event.data.config);
  }
});

const CACHE_NAME = "chatsapp-pro-v10";
const ASSET_CACHE = ["/", "/index.html", "/manifest.json", "/icons/icon.svg", "/icons/icon-192x192.png", "/icons/icon-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSET_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("firebase") || event.request.url.includes("identitytoolkit")) return;

  const url = new URL(event.request.url);

  // Stale-While-Revalidate / Cache-First for static bundles, styles, scripts and icons
  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".json");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          fetch(event.request)
            .then((networkRes) => {
              if (networkRes.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkRes));
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-First with immediate offline fallback for documents and pages
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) =>
          cached ||
          (event.request.destination === "document" || event.request.mode === "navigate"
            ? caches.match("/index.html")
            : null)
        )
      )
  );
});


self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      const isFocused = clientList.some((client) => client.focused && client.visibilityState === "visible");
      if (isFocused) {
        return;
      }

      try {
        const payload = event.data.json();
        const isCall = payload.data?.type === "incoming_call" || payload.type === "incoming_call";
        const title = payload.notification?.title || payload.data?.title || payload.title || (isCall ? "📞 Incoming Call" : "New Message");
        let body = payload.notification?.body || payload.data?.body || payload.body || "";
        const tag = payload.data?.msgId || payload.data?.tag || (isCall ? "chatsapp_call" : "chatsapp_msg");

        // E2EE Decryption in Service Worker
        const encryptedPreview = payload.data?.encryptedPreview || payload.encryptedPreview;
        const nonce = payload.data?.nonce || payload.nonce;
        const senderPubKey = payload.data?.senderPubKey || payload.senderPubKey;
        const hideContent = (payload.data?.hideContent || payload.hideContent) === "true";

        if (hideContent) {
          const senderName = payload.data?.senderName || payload.senderName;
          body = senderName ? `${senderName} sent you a message` : "New message";
        } else if (encryptedPreview && nonce && senderPubKey && self.decryptNotificationPayload) {
          try {
            const decrypted = await self.decryptNotificationPayload(encryptedPreview, nonce, senderPubKey);
            if (decrypted) {
              body = decrypted;
            }
          } catch (e) {
            console.warn("[Main SW] Push decrypt failed:", e);
          }
        }

        const options = {
          body: body,
          icon: payload.data?.icon || payload.notification?.icon || "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          tag: tag,
          renotify: true,
          requireInteraction: isCall,
          vibrate: isCall ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
          data: {
            url: payload.data?.url || "/",
            ...(payload.data || {}),
          },
        };
        return self.registration.showNotification(title, options);
      } catch (err) {
        console.warn("Push parse error:", err);
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          if (client.url.startsWith(self.registration.scope) || client.url.includes(location.origin)) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
