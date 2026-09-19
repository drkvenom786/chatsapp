# ChatsApp Frontend (Netlify / Static Hosting)

Standalone React + Vite + Tailwind PWA client for **ChatsApp**, designed for effortless hosting on Netlify, Vercel, or any static hosting provider.

---

## Features
- **Standalone Client**: Zero Node.js server dependencies; 100% pure client-side static build.
- **Dynamic Backend Binding**: Connects to your Cloudflare Worker via the `VITE_BACKEND_URL` environment variable.
- **Zero Hardcoded Secrets**: All Firebase keys and backend URLs are injected at build/runtime via environment variables.
- **End-to-End Encryption**: Retains all client-side encryption and crypto routines.
- **PWA Ready**: Offline caching, installable web app manifest, and push notifications.

---

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. (Optional) Run with local backend:
   If your Cloudflare Worker is running locally on port `8787` (`npm run dev` in `backend/`), the Vite development server will automatically proxy all `/api/*` calls to it!

3. Start development server:
   ```bash
   npm run dev
   ```

---

## Deployment to Netlify

### Option 1: Via Netlify CLI
1. Install Netlify CLI (if not already installed):
   ```bash
   npm install -g netlify-cli
   ```
2. Build and deploy:
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

### Option 2: Via Git (GitHub / GitLab / Bitbucket)
1. Push the `frontend` folder (or your repository) to GitHub.
2. In the Netlify Dashboard, click **Add new site** -> **Import an existing project**.
3. Select your repository.
4. Set the build settings:
   - **Base directory**: `frontend` (if in a monorepo, or leave empty if root)
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Under **Environment variables**, add:
   - `VITE_BACKEND_URL`: Your deployed Cloudflare Worker URL (e.g., `https://your-worker.workers.dev`)
   - `VITE_BACKEND_ACCESS_KEY`: Backend access key configured for your Cloudflare Worker
   - `VITE_FIREBASE_API_KEY`: Your Firebase web API key
   - `VITE_FIREBASE_AUTH_DOMAIN`: `your_project.firebaseapp.com`
   - `VITE_FIREBASE_DATABASE_URL`: `https://your_project-default-rtdb.firebaseio.com`
   - `VITE_FIREBASE_PROJECT_ID`: `your_firebase_project_id`
   - `VITE_FIREBASE_STORAGE_BUCKET`: `your_project.firebasestorage.app`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`: `your_messaging_sender_id`
   - `VITE_FIREBASE_APP_ID`: `your_app_id`
   - `VITE_FIREBASE_MEASUREMENT_ID`: `your_measurement_id`
   - `VITE_FIREBASE_VAPID_KEY`: `your_vapid_key`
   - `VITE_APP_URL`: Your Netlify site URL (e.g., `https://your-app.netlify.app`)
6. Click **Deploy site**.
