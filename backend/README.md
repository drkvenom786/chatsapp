# ChatsApp Backend (Cloudflare Worker)

Serverless backend for **ChatsApp** running on Cloudflare Workers with Cloudflare R2 bucket storage and Firebase Cloud Messaging (FCM).

---

## Features
- **Zero Hardcoded Keys**: All configuration dynamically injected via Cloudflare environment variables and secrets.
- **Full CORS Support**: Allows preflight and requests from your frontend hosted on Netlify, Vercel, or custom domains.
- **R2 Media Management**: Uploads, streams, and deletes media files (images, audio, video, attachments).
- **FCM Push Notifications**: Supports HTTP v1 (Google Service Account) and legacy FCM server keys.
- **Username Lookup**: Realtime Database query helper for username-to-email resolution.

---

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run local development worker:
   ```bash
   npm run dev
   ```
   This will start your worker locally at `http://localhost:8787` using variables from `.dev.vars`.

---

## Deployment to Cloudflare Workers

### 1. Login to Cloudflare
```bash
npx wrangler login
```

### 2. Create the R2 Storage Bucket
```bash
npx wrangler r2 bucket create dschat-media
```

### 3. Deploy the Worker
```bash
npm run deploy
```
Wrangler will output your deployed Worker URL, for example:
`https://chatsapp-backend.<your-subdomain>.workers.dev`

### 4. Set Environment Variables in Cloudflare
In the Cloudflare Dashboard:
Go to **Workers & Pages** -> **chatsapp-backend** -> **Settings** -> **Variables and Secrets**.

Add the following **Environment Variables**:
- `FIREBASE_API_KEY`: Your Firebase web API key
- `FIREBASE_AUTH_DOMAIN`: `<project>.firebaseapp.com`
- `FIREBASE_DATABASE_URL`: `https://<project>-default-rtdb.firebaseio.com`
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_STORAGE_BUCKET`: `<project>.firebasestorage.app`
- `FIREBASE_MESSAGING_SENDER_ID`: Your sender ID
- `FIREBASE_APP_ID`: Your Firebase web app ID
- `FIREBASE_VAPID_KEY`: Your web push VAPID key
- `FRONTEND_URL`: Your Netlify frontend URL (e.g., `https://your-chatsapp.netlify.app`)

### 5. Add Secrets
To secure your backend and configure push notifications, set the required secrets:
```bash
# Backend Access Key (Required to authenticate API requests from your frontend)
npx wrangler secret put BACKEND_ACCESS_KEY

# Push Notifications: HTTP v1 Firebase Service Account JSON (paste single-line JSON string)
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT

# Optional: Legacy FCM Server Key
npx wrangler secret put FCM_SERVER_KEY
```

---

## Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/` or `/health` | Backend health check & active endpoint list |
| `GET` | `/api/config` | Firebase public configuration for frontend initialization |
| `GET` | `/api/lookup-username?username=...` | Username to email lookup |
| `POST` | `/api/send-notification` | Sends FCM push notification |
| `POST` | `/api/upload-media` | Uploads media file to Cloudflare R2 |
| `GET` | `/api/media/:key` | Serves media file from Cloudflare R2 with caching & CORS |
| `POST` | `/api/delete-media` | Deletes media file from Cloudflare R2 |
