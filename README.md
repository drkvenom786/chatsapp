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

### 2. Configure Environment Variables

Both `backend/` and `frontend/` provide `.env.example` templates.

#### Backend Configuration
Copy `backend/.env.example` to `backend/.dev.vars` (for local development):
```bash
cp backend/.env.example backend/.dev.vars
```

#### Frontend Configuration
Copy `frontend/.env.example` to `frontend/.env.local`:
```bash
cp frontend/.env.example frontend/.env.local
```

### 3. Local Development

Install dependencies and start development servers:

```bash
# Run frontend development server
npm run dev

# Run backend Cloudflare Worker locally (port 8787)
npm run dev:backend
```

---

## Deployment

### Frontend (Netlify)

This repository includes a root `netlify.toml` configured for automatic deployment:

1. Import this repository in [Netlify](https://app.netlify.com).
2. Netlify will automatically detect the configuration:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
3. Configure your site's environment variables in the Netlify Dashboard under **Site configuration** -> **Environment variables** (refer to `frontend/.env.example`).
4. Click **Deploy site**.

### Backend (Cloudflare Workers)

```bash
cd backend
npm install

# Create R2 bucket for media storage
npx wrangler r2 bucket create dschat-media

# Deploy to Cloudflare Workers
npm run deploy
```

Configure your Worker variables and secrets via the Cloudflare Dashboard under **Workers & Pages** -> **Settings** -> **Variables and Secrets** (refer to `backend/.env.example`).

---

## Security

- All API keys, tokens, and credentials are configured strictly via environment variables.
- No secrets or credentials are stored within repository code or tracking history.
- Local configuration files (`.env.local`, `.dev.vars`) are excluded from Git via `.gitignore`.

---

## License

This project is licensed under the [MIT License](LICENSE).
