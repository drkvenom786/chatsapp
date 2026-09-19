export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Dynamic CORS Configuration
    const requestOrigin = request.headers.get("Origin") || "*";
    const allowedOrigin = env.ALLOWED_ORIGINS
      ? (env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).includes(requestOrigin) ? requestOrigin : env.ALLOWED_ORIGINS.split(",")[0].trim())
      : "*";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Range, X-File-Name, X-Requested-With, X-Backend-Key",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, ETag",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Backend Access Key Protection (configured via environment variable BACKEND_ACCESS_KEY)
    const expectedKey = env.BACKEND_ACCESS_KEY || env.API_SECRET_KEY || "";
    if (expectedKey) {
      const isExempt = url.pathname === "/" || url.pathname === "/health" || url.pathname.startsWith("/api/media/");
      if (!isExempt) {
        const clientKey = request.headers.get("x-backend-key") || url.searchParams.get("access_key") || (request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
        if (clientKey !== expectedKey) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Invalid or missing backend access key." }),
            { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }
    }

    // Health Check / Root endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "dschat-backend-worker",
          timestamp: new Date().toISOString(),
          endpoints: [
            "/api/config",
            "/api/lookup-username",
            "/api/send-notification",
            "/api/upload-media",
            "/api/media/:key",
            "/api/delete-media",
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // API route: Dynamic Frontend Config (reads strictly from environment variables)
    if (url.pathname === "/api/config") {
      return new Response(
        JSON.stringify({
          apiKey: env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || "",
          authDomain: env.FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN || "",
          databaseURL: env.FIREBASE_DATABASE_URL || env.VITE_FIREBASE_DATABASE_URL || "",
          projectId: env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || "",
          storageBucket: env.FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET || "",
          messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
          appId: env.FIREBASE_APP_ID || env.VITE_FIREBASE_APP_ID || "",
          vapidKey: env.FIREBASE_VAPID_KEY || env.VITE_FIREBASE_VAPID_KEY || "",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders, "Cache-Control": "public, max-age=3600" },
        }
      );
    }

    // API route: Username -> Email lookup
    if (url.pathname === "/api/lookup-username") {
      const usernameParam = url.searchParams.get("username") || "";
      const cleanInput = usernameParam.trim().toLowerCase();

      if (!cleanInput) {
        return new Response(JSON.stringify({ success: false, error: "Username is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const dbUrl = (env.FIREBASE_DATABASE_URL || env.VITE_FIREBASE_DATABASE_URL || "").replace(/\/$/, "");
      const apiKey = env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || "";

      if (!dbUrl) {
        return new Response(JSON.stringify({ success: false, error: "FIREBASE_DATABASE_URL is not configured in backend environment." }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      let idToken = "";

      if (apiKey) {
        try {
          const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ returnSecureToken: true }),
          });
          if (authRes.ok) {
            const authData = await authRes.json();
            if (authData.idToken) {
              idToken = authData.idToken;
            }
          }
        } catch (e) {
          console.warn("Worker auth token error:", e);
        }
      }

      const authParam = idToken ? `?auth=${idToken}` : "";

      // 1. Direct check /usernames/${cleanInput}.json
      try {
        const usernameRes = await fetch(`${dbUrl}/usernames/${encodeURIComponent(cleanInput)}.json${authParam}`);
        if (usernameRes.ok) {
          const usernameData = await usernameRes.json();
          if (usernameData && usernameData.email) {
            return new Response(JSON.stringify({ success: true, email: usernameData.email }), {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        }
      } catch (e) {
        console.warn("Worker username direct lookup error:", e);
      }

      // 2. Scan /users.json for exact matching username, name, or displayName
      try {
        const usersRes = await fetch(`${dbUrl}/users.json${authParam}`);
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData && typeof usersData === "object") {
            for (const u of Object.values(usersData)) {
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
                return new Response(JSON.stringify({ success: true, email: u.email }), {
                  status: 200,
                  headers: { "Content-Type": "application/json", ...corsHeaders },
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn("Worker users scan error:", e);
      }

      return new Response(JSON.stringify({ success: false, error: "Username not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // API route: Push Notification endpoint
    if (url.pathname === "/api/send-notification") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      try {
        const payload = await request.json();
        const {
          token,
          title,
          body,
          icon,
          data,
          encryptedPreview,
          nonce,
          version,
          hideContent,
          senderName,
          senderId,
          senderPubKey,
        } = payload;

        const effectiveSenderPubKey = senderPubKey || data?.senderPubKey || "";

        if (!token || !title) {
          return new Response(JSON.stringify({ error: "Missing required fields: token and title" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const fcmServerKey = env.FCM_SERVER_KEY || env.VITE_FIREBASE_SERVER_KEY;
        const serviceAccountJson = env.FIREBASE_SERVICE_ACCOUNT;

        // Preview body: use provided preview text so phone notifications show the actual message
        const previewText = (body && typeof body === "string" && body.trim().length > 0)
          ? body.trim()
          : (senderName ? `${senderName} sent you a message` : "New message");
        const isHideContent = hideContent === true || hideContent === "true";
        const finalBody = isHideContent
          ? `${senderName || "Someone"} sent you a message`
          : previewText;

        // Derive app base URL strictly from environment (FRONTEND_URL) or request Origin
        const frontendBaseUrl = (env.FRONTEND_URL || env.APP_BASE_URL || request.headers.get("origin") || "").replace(/\/$/, "");

        const toAbsoluteUrl = (pathOrUrl) => {
          if (!pathOrUrl) return frontendBaseUrl ? `${frontendBaseUrl}/icons/icon-192x192.png` : "/icons/icon-192x192.png";
          if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
          return frontendBaseUrl ? `${frontendBaseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}` : pathOrUrl;
        };

        const fullIcon = toAbsoluteUrl(icon);
        const fullBadge = toAbsoluteUrl("/icons/icon-192x192.png");
        const targetUrl = (data && data.url) ? String(data.url) : (frontendBaseUrl ? `${frontendBaseUrl}/` : "/");
        const msgTag = (data && data.msgId) ? String(data.msgId) : String(Date.now());

        const rawData = {
          title: String(title),
          body: String(finalBody),
          icon: fullIcon,
          badge: fullBadge,
          url: targetUrl,
          msgId: msgTag,
          tag: (data && data.tag) ? String(data.tag) : msgTag,
          timestamp: String(Date.now()),
          hideContent: isHideContent ? "true" : "false",
          ...(data || {}),
          ...(encryptedPreview ? { encryptedPreview: String(encryptedPreview), nonce: String(nonce || ""), version: String(version || 1) } : {}),
          ...(effectiveSenderPubKey ? { senderPubKey: String(effectiveSenderPubKey) } : {}),
          ...(senderName ? { senderName: String(senderName) } : {}),
          ...(senderId ? { senderId: String(senderId) } : {}),
        };

        // For FCM HTTP v1: all data values must strictly be strings
        const fcmData = {};
        for (const [k, v] of Object.entries(rawData)) {
          if (v !== undefined && v !== null) {
            fcmData[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
          }
        }

        // Method 1: Legacy FCM Server Key
        if (fcmServerKey) {
          const fcmRes = await fetch("https://fcm.googleapis.com/fcm/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `key=${fcmServerKey}`,
            },
            body: JSON.stringify({
              to: token,
              priority: "high",
              content_available: true,
              notification: {
                title: title,
                body: finalBody,
                icon: fullIcon,
                click_action: targetUrl,
              },
              data: fcmData,
            }),
          });

          const resultText = await fcmRes.text();
          return new Response(resultText, {
            status: fcmRes.status,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        // Method 2: HTTP v1 API with Service Account JSON
        if (serviceAccountJson) {
          try {
            const sa = typeof serviceAccountJson === "string" ? JSON.parse(serviceAccountJson) : serviceAccountJson;
            const accessToken = await getAccessToken(sa);

            const v1Res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  token: token,
                  notification: {
                    title: title,
                    body: finalBody,
                  },
                  webpush: {
                    headers: {
                      Urgency: "high",
                      TTL: "86400",
                    },
                    notification: {
                      title: title,
                      body: finalBody,
                      icon: fullIcon,
                      badge: fullBadge,
                      tag: msgTag,
                      renotify: true,
                    },
                    fcm_options: {
                      link: targetUrl,
                    },
                  },
                  android: {
                    priority: "high",
                  },
                  data: fcmData,
                },
              }),
            });

            const resultText = await v1Res.text();
            return new Response(resultText, {
              status: v1Res.status,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          } catch (saErr) {
            console.error("Service Account FCM error:", saErr);
            return new Response(JSON.stringify({ error: "Failed to authenticate with Firebase Service Account", details: String(saErr) }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        }

        // Fallback response if no server key or service account is configured
        return new Response(
          JSON.stringify({
            status: "success",
            message: "Notification payload received by Cloudflare Worker. Set FCM_SERVER_KEY or FIREBASE_SERVICE_ACCOUNT in Worker secrets to send push notifications to devices.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid request payload", details: String(err) }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // API route: Upload Media to Cloudflare R2
    if (url.pathname === "/api/upload-media") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: corsHeaders,
        });
      }

      try {
        if (!env.MEDIA_BUCKET) {
          return new Response(JSON.stringify({ error: "Cloudflare R2 Bucket (MEDIA_BUCKET) is not bound in wrangler.toml." }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        const contentType = request.headers.get("content-type") || "";
        let fileData, fileName, mimeType, fileLength;

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file");
          if (!file || typeof file === "string") {
            return new Response(JSON.stringify({ error: "No file provided in form-data" }), {
              status: 400,
              headers: corsHeaders,
            });
          }
          fileName = file.name || "upload";
          mimeType = file.type || "application/octet-stream";
          fileData = await file.arrayBuffer();
          fileLength = file.size;
        } else {
          fileName = request.headers.get("x-file-name") || `file_${Date.now()}`;
          mimeType = contentType || "application/octet-stream";
          fileData = await request.arrayBuffer();
          fileLength = fileData.byteLength;
        }

        const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
        const cleanExt = ext ? ext.replace(/[^a-zA-Z0-9]/g, "") : "";
        const uniqueId = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const key = cleanExt ? `${uniqueId}.${cleanExt}` : uniqueId;

        await env.MEDIA_BUCKET.put(key, fileData, {
          httpMetadata: {
            contentType: mimeType,
          },
        });

        let mediaType = "file";
        if (mimeType.startsWith("image/")) mediaType = "image";
        else if (mimeType.startsWith("video/")) mediaType = "video";
        else if (mimeType.startsWith("audio/")) mediaType = "audio";
        else {
          const lowerExt = cleanExt.toLowerCase();
          if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic"].includes(lowerExt)) mediaType = "image";
          else if (["mp4", "webm", "mov", "avi", "mkv", "3gp"].includes(lowerExt)) mediaType = "video";
          else if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(lowerExt)) mediaType = "audio";
        }

        const mediaPath = `/api/media/${key}`;
        const originUrl = new URL(request.url).origin;
        const fullMediaUrl = env.PUBLIC_MEDIA_URL ? `${env.PUBLIC_MEDIA_URL.replace(/\/$/, "")}${mediaPath}` : `${originUrl}${mediaPath}`;

        return new Response(
          JSON.stringify({
            success: true,
            mediaUrl: mediaPath,
            fullMediaUrl,
            mediaKey: key,
            mediaName: fileName,
            mediaSize: fileLength,
            mediaType,
          }),
          {
            status: 200,
            headers: corsHeaders,
          }
        );
      } catch (err) {
        console.error("R2 Upload Error:", err);
        return new Response(JSON.stringify({ error: "Upload failed", details: String(err) }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // API route: Serve Media from Cloudflare R2
    if (url.pathname.startsWith("/api/media/")) {
      const key = url.pathname.substring("/api/media/".length);
      if (!key) {
        return new Response("Key required", { status: 400, headers: corsHeaders });
      }

      if (!env.MEDIA_BUCKET) {
        return new Response("Cloudflare R2 Bucket (MEDIA_BUCKET) is not bound.", { status: 500, headers: corsHeaders });
      }

      try {
        const object = await env.MEDIA_BUCKET.get(key);
        if (!object) {
          return new Response("File not found", { status: 404, headers: corsHeaders });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        if (object.httpEtag) {
          headers.set("etag", object.httpEtag);
        }
        headers.set("Access-Control-Allow-Origin", allowedOrigin);
        headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(object.body, { headers });
      } catch (err) {
        console.error("R2 Fetch Error:", err);
        return new Response("Error fetching media", { status: 500, headers: corsHeaders });
      }
    }

    // API route: Delete Media from Cloudflare R2
    if (url.pathname === "/api/delete-media") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: corsHeaders,
        });
      }

      try {
        const payload = await request.json().catch(() => ({}));
        const { key } = payload;

        if (key && env.MEDIA_BUCKET) {
          await env.MEDIA_BUCKET.delete(key);
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: corsHeaders,
        });
      } catch (err) {
        console.error("R2 Delete Error:", err);
        return new Response(JSON.stringify({ error: "Delete failed", details: String(err) }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    return new Response(
      JSON.stringify({ error: "Endpoint not found", path: url.pathname }),
      { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  },
};

// Helper: Convert Pem key string to ArrayBuffer for WebCrypto
function pemToArrayBuffer(pem) {
  const b64Lines = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryDerString = atob(b64Lines);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }
  return binaryDer.buffer;
}

function base64url(source) {
  let encodedSource = btoa(String.fromCharCode(...new Uint8Array(source)));
  return encodedSource.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function stringToBase64url(str) {
  return base64url(new TextEncoder().encode(str));
}

// Generate OAuth 2.0 access token for Google Firebase HTTP v1 API
async function getAccessToken(serviceAccount) {
  const jwtHeader = JSON.stringify({ alg: "RS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  });

  const unsignedToken = `${stringToBase64url(jwtHeader)}.${stringToBase64url(jwtClaim)}`;
  const binaryKey = pemToArrayBuffer(serviceAccount.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const jwt = `${unsignedToken}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || "Could not retrieve access token from Google");
  }
  return data.access_token;
}
