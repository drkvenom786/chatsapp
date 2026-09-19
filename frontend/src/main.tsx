import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Unified Service Worker registration for PWA and FCM
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swParams = new URLSearchParams({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
    }).toString();

    navigator.serviceWorker
      .register(`/sw.js?${swParams}`)
      .then((registration) => {
        registration.update();
        if (registration.active) {
          registration.active.postMessage({
            type: "SET_FIREBASE_CONFIG",
            config: {
              apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
              databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
              projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
              storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
              messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
              appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
            },
          });
        }
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}
