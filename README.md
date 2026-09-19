# ChatsApp

> A modern, secure, private real-time messaging progressive web app (PWA) with end-to-end encryption (E2EE), WebRTC voice calls, and media attachments.

---

## Architecture Overview

ChatsApp is architected as a decoupled monorepo separating static frontend client delivery from serverless edge backend logic:

```
chatsapp/
├── backend/          # Serverless Edge API running on Cloudflare Workers
│   ├── src/index.js  # Edge endpoints, R2 media storage, FCM push notifications
│   ├── wrangler.toml # Cloudflare Worker & R2 bucket bindings
│   └── package.json  # Backend scripts
│
├── frontend/         # React + Vite + Tailwind CSS + PWA Client
│   ├── src/          # Components, pages, encryption routines, WebRTC handlers
│   ├── public/       # PWA icons, manifest, service workers
│   └── netlify.toml  # Netlify build & SPA routing configuration
│
├── netlify.toml      # Root monorepo build configuration for Netlify
└── package.json      # Monorepo management scripts
```

---

## Features

- **End-to-End Encryption (E2EE)**: Messages and previews encrypted on device with cryptographic keys.
- **Realtime Messaging**: Instant messaging and presence synchronization powered by Firebase Realtime Database.
- **Voice Calling**: Low-latency peer communication powered by WebRTC and Cloudflare Calls.
- **Cloudflare R2 Media Storage**: Secure, scalable file uploads for photos, videos, voice notes, and documents.
- **Push Notifications**: Background push notifications supported via Firebase Cloud Messaging (FCM).
- **Progressive Web App (PWA)**: Installable on iOS, Android, and Desktop with offline caching.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Sonner |
| **Backend** | Cloudflare Workers, Cloudflare R2, WebCrypto API |
| **Realtime & Auth** | Firebase Authentication, Firebase Realtime Database |
| **Media & Calls** | Cloudflare R2 Object Storage, Cloudflare Calls WebRTC |
| **Hosting** | Netlify (Frontend), Cloudflare Workers (Backend) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for Cloudflare Workers)

### 1. Clone the Repository

```bash
git clone https://github.com/drkvenom786/chatsapp.git
cd chatsapp
```

## Environment Variables & Configuration Guide

ChatsApp is designed with **zero hardcoded secrets** in the repository. All services rely strictly on environment variables and secrets.

### 1. Variables Breakdown

#### Frontend Variables (`frontend/.env.local` / Netlify / GitHub Variables)
| Variable | Description | Example / Format |
|---|---|---|
| `VITE_BACKEND_URL` | Deployed Cloudflare Worker URL | `https://chatsapp-backend.<subdomain>.workers.dev` |
| `VITE_BACKEND_ACCESS_KEY` | Access key required to query protected backend API routes | `YOUR-SECRET-KEY` |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL | `https://your-project-default-rtdb.firebaseio.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `your-project` |
| `VITE_FIREBASE_STORAGE_BUCKET`| Firebase Storage Bucket | `your-project.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID | `1:123456789012:web:...` |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics Measurement ID (Optional) | `G-XXXXXXXXXX` |
| `VITE_FIREBASE_VAPID_KEY` | Web Push VAPID Key (from Firebase Cloud Messaging) | `B...` |
| `VITE_CLOUDFLARE_CALLS_APP_ID` | Cloudflare Calls App ID (for WebRTC Voice Calls) | `e94d29...` |
| `VITE_CLOUDFLARE_CALLS_BASE_URL` | Cloudflare Calls Base API URL | `https://rtc.live.cloudflare.com/v1` |

#### Backend Variables & Secrets (`backend/.dev.vars` / Cloudflare Workers)
| Name | Type | Description |
|---|---|---|
| `BACKEND_ACCESS_KEY` | Secret | Secret key that must match frontend's `VITE_BACKEND_ACCESS_KEY` |
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Single-line JSON of your Firebase Admin SDK service account key |
| `ALLOWED_ORIGINS` | Variable | Comma-separated allowed frontend domains, or `*` for all |
| `FRONTEND_URL` | Variable | Public frontend domain for push notification click actions |
| `MEDIA_BUCKET` | R2 Binding | Cloudflare R2 bucket binding name (configured in `wrangler.toml`) |

---

### 2. How to Add Variables to GitHub Actions (Automated CI/CD)

GitHub Actions automatically builds and deploys both frontend and backend upon every `git push` to `main`.

#### Step A: Add Frontend Repository Variables
1. Go to your GitHub repository: **Settings** → **Secrets and variables** → **Actions**.
2. Click the **Variables** tab (next to Secrets).
3. Click **New repository variable** for each variable:
   - `VITE_BACKEND_URL`
   - `VITE_BACKEND_ACCESS_KEY`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_FIREBASE_VAPID_KEY`
   - `VITE_CLOUDFLARE_CALLS_APP_ID`
   - `VITE_CLOUDFLARE_CALLS_BASE_URL`

#### Step B: Add Deployment Secrets
Under the same **Settings** → **Secrets and variables** → **Actions**, switch to the **Secrets** tab and click **New repository secret**:
1. **Netlify Automated Deployment**:
   - `NETLIFY_AUTH_TOKEN`: Your Netlify Personal Access Token (generate at [app.netlify.com/user/applications#personal-access-tokens](https://app.netlify.com/user/applications#personal-access-tokens))
   - `NETLIFY_SITE_ID`: Your Netlify Site API ID (from Netlify **Site configuration** → **Site details**)
2. **Cloudflare Worker Automated Deployment**:
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API Token with Workers permissions (generate at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens))

---

### 3. How to Add Variables in Netlify (Direct Web Import)

If you choose to import the repository directly in the Netlify Dashboard instead of using GitHub Actions:
1. In the Netlify Dashboard, navigate to: **Site configuration** → **Environment variables**.
2. Click **Add a variable** → **Import from .env**.
3. Copy all lines from your local `frontend/.env.local` file and paste them in.
4. Click **Save**.

---

### 4. How to Add Secrets in Cloudflare Workers

For the backend edge worker, secrets must be set via the Wrangler CLI or the Cloudflare Dashboard:

#### Via Wrangler CLI (Recommended):
```bash
cd backend

# Set Backend Access Key
npx wrangler secret put BACKEND_ACCESS_KEY

# Set Firebase Service Account for FCM Push Notifications
# (Paste the full single-line JSON string when prompted)
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

#### Via Cloudflare Dashboard:
1. Go to **Workers & Pages** → click your Worker (`chatsapp-backend`).
2. Go to **Settings** → **Variables and Secrets**.
3. Under **Secrets**, click **Add** to store `BACKEND_ACCESS_KEY` and `FIREBASE_SERVICE_ACCOUNT`.

---

## Local Development

### 1. Clone the Repository
```bash
git clone https://github.com/drkvenom786/chatsapp.git
cd chatsapp
```

### 2. Set Up Local Environment Files
```bash
# Frontend setup
cp frontend/.env.example frontend/.env.local

# Backend setup
cp backend/.env.example backend/.dev.vars
```
Fill in your keys in `frontend/.env.local` and `backend/.dev.vars` (these files are automatically ignored by Git).

### 3. Start Development Servers
```bash
# Run frontend development server (Vite)
npm run dev

# Run backend Cloudflare Worker locally (port 8787)
npm run dev:backend
```

---

## Manual Deployment

### Deploy Backend (Cloudflare Worker)
```bash
cd backend
npm install

# Create R2 bucket for media storage
npx wrangler r2 bucket create chatsapp-media

# Deploy Worker
npm run deploy
```

### Deploy Frontend (Netlify CLI)
```bash
cd frontend
npm install
npm run build
npx netlify-cli deploy --prod --dir=dist
```

---

## Security

- All API keys, tokens, and credentials are configured strictly via environment variables.
- No secrets or credentials are stored within repository code or tracking history.
- Local configuration files (`.env.local`, `.dev.vars`) are excluded from Git via `.gitignore`.

---

## License

This project is licensed under the [MIT License](LICENSE).
