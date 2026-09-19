import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import ErrorBoundary from "./components/ErrorBoundary";
import BottomNavigation from "./components/BottomNavigation";
import Login from "./pages/Login";
import Chat from "./pages/Chat";
import Contacts from "./pages/Contacts";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import { onAuthChange, setUserOnline, logout, requestFCMToken, onForegroundMessage, showNativeNotification, playNotificationSound, onUsersChange, onMessagesChange, onSessionChange, registerDevice, getIdentityBackup, saveIdentityBackup } from "@/lib/firebase";
import { toast } from "sonner";
import { Loader2, Heart } from "lucide-react";
import type { User } from "@/lib/firebase";

import DesktopSidebar from "./components/DesktopSidebar";
import GlobalCallManager from "./components/GlobalCallManager";
import EmailVerificationLock from "./components/EmailVerificationLock";
import E2EESetupModal from "./components/E2EESetupModal";
import E2EERecoveryModal from "./components/E2EERecoveryModal";
import { hasLocalIdentity, ensureUserIdentity, type IdentityBackupRecord } from "./lib/crypto/keyManagement";

type TabType = "chat" | "contacts" | "profile" | "settings";

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem("chatsapp_cached_user");
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState<TabType>("chat");
  const [showE2EESetup, setShowE2EESetup] = useState(false);
  const [showE2EERecovery, setShowE2EERecovery] = useState(false);
  const [identityRecord, setIdentityRecord] = useState<IdentityBackupRecord | null>(null);

  const handleLogout = async (customToastMsg?: unknown) => {
    const uid = currentUser?.uid;

    // Instantly reset UI state & clear storage so user returns to login screen with zero delay
    setCurrentUser(null);
    setActiveTab("chat");
    setShowE2EESetup(false);
    setShowE2EERecovery(false);
    setIdentityRecord(null);

    try {
      localStorage.removeItem("chatsapp_cached_user");
      localStorage.removeItem("userSessionId");
      sessionStorage.clear();
    } catch (e) {}

    if (customToastMsg !== null) {
      const toastText = typeof customToastMsg === "string" ? customToastMsg : "Logged out successfully";
      toast.success(toastText);
    }

    // Perform background Firebase logout & online status cleanup non-blocking
    if (uid) {
      setUserOnline(uid, false).catch(() => {});
    }
    logout().catch((error) => console.error("Logout failed:", error));
  };

  const handleVerifiedSuccess = (verifiedEmail: string) => {
    try {
      localStorage.removeItem("chatsapp_pending_verification");
      if (verifiedEmail) {
        localStorage.setItem("chatsapp_verified_email", verifiedEmail);
      }
    } catch {}
    handleLogout("Email verified successfully! Please sign in to your account.");
  };

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      if (user) {
        // If the user's email is verified and they were pending verification (e.g. verified in another tab or refreshed),
        // log them out and direct to login page instead of letting them enter directly.
        try {
          const isPending = localStorage.getItem("chatsapp_pending_verification") === "true";
          if (user.emailVerified && isPending) {
            localStorage.removeItem("chatsapp_pending_verification");
            if (user.email) {
              localStorage.setItem("chatsapp_verified_email", user.email);
            }
            handleLogout("Email verified successfully! Please sign in to your account.");
            return;
          }
        } catch {}

        setCurrentUser(user);
        try {
          localStorage.setItem("chatsapp_cached_user", JSON.stringify(user));
        } catch {}
        if (user.emailVerified) {
          setUserOnline(user.uid, true).catch(console.warn);
          requestFCMToken(user.uid).catch(console.warn);
        }
      } else {
        setCurrentUser(null);
        try {
          localStorage.removeItem("chatsapp_cached_user");
        } catch {}
      }
    });

    return unsubscribe;
  }, []);

  // Multi-Device Registration & E2EE Identity Verification
  useEffect(() => {
    if (!currentUser?.uid || !currentUser.emailVerified) return;

    registerDevice(currentUser.uid).catch(console.warn);

    ensureUserIdentity(currentUser.uid, getIdentityBackup, saveIdentityBackup)
      .then((res) => {
        if (res.needsUnlock && res.backupRecord) {
          setIdentityRecord(res.backupRecord);
          setShowE2EERecovery(true);
        } else if (res.needsSetup) {
          setShowE2EESetup(true);
        }
      })
      .catch((err) => {
        console.warn("E2EE identity initialization warning:", err);
      });
  }, [currentUser?.uid, currentUser?.emailVerified]);

  // Track page visibility state for accurate online/offline push notification targeting
  useEffect(() => {
    if (!currentUser?.uid || !currentUser.emailVerified) return;

    setUserOnline(currentUser.uid, !document.hidden).catch(console.warn);

    const handleVisibilityChange = () => {
      if (currentUser?.uid && currentUser.emailVerified) {
        setUserOnline(currentUser.uid, !document.hidden).catch(console.warn);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [currentUser?.uid, currentUser?.emailVerified]);

  // Realtime Incoming Message Audio Chime (sound only when active in foreground)
  useEffect(() => {
    if (!currentUser?.uid || !currentUser.emailVerified) return;

    let unsubUsers: (() => void) | null = null;
    const unsubChats: Map<string, () => void> = new Map();
    const lastSeenTimestamps: Map<string, number> = new Map();

    unsubUsers = onUsersChange((allUsers) => {
      Object.keys(allUsers).forEach((otherUid) => {
        if (otherUid === currentUser.uid || unsubChats.has(otherUid)) return;

        const unsub = onMessagesChange(currentUser.uid, otherUid, (msgList) => {
          if (!msgList || !Array.isArray(msgList) || msgList.length === 0) return;

          const latestMsg = msgList[msgList.length - 1];
          const lastSeen = lastSeenTimestamps.get(otherUid);

          if (lastSeen === undefined) {
            lastSeenTimestamps.set(otherUid, latestMsg.timestamp);
            return;
          }

          if (latestMsg.timestamp > lastSeen && latestMsg.senderId !== currentUser.uid && !latestMsg.read) {
            lastSeenTimestamps.set(otherUid, latestMsg.timestamp);
            playNotificationSound();
          }
        });

        unsubChats.set(otherUid, unsub);
      });
    });

    return () => {
      if (unsubUsers) unsubUsers();
      unsubChats.forEach((unsub) => unsub());
    };
  }, [currentUser?.uid, currentUser?.emailVerified]);

  // Single Device Concurrent Session Guard
  useEffect(() => {
    if (!currentUser?.uid || !currentUser.emailVerified) return;
    const unsub = onSessionChange(currentUser.uid, (isInvalid) => {
      if (isInvalid) {
        toast.error("Logged out: Account was logged in on another device.");
        handleLogout();
      }
    });
    return () => unsub();
  }, [currentUser?.uid, currentUser?.emailVerified]);

  const [isChatActive, setIsChatActive] = useState(() => Boolean(sessionStorage.getItem("selectedContactId")));

  useEffect(() => {
    const activeChat = sessionStorage.getItem("selectedContactId");
    setIsChatActive(Boolean(activeChat));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "chat") {
      window.history.pushState({ tab: activeTab }, "");
    }

    const handlePopState = () => {
      if (activeTab !== "chat") {
        setActiveTab("chat");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [activeTab]);

  const handleSelectContact = (userId: string) => {
    sessionStorage.setItem("selectedContactId", userId);
    setIsChatActive(true);
    setActiveTab("chat");
  };

  const handleBackToContacts = () => {
    sessionStorage.removeItem("selectedContactId");
    setIsChatActive(false);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          {currentUser && <GlobalCallManager currentUser={currentUser} />}
              {currentUser && showE2EESetup && (
                <E2EESetupModal
                  currentUser={currentUser}
                  onComplete={() => setShowE2EESetup(false)}
                  onLogout={() => handleLogout()}
                />
              )}
              {currentUser && showE2EERecovery && identityRecord && (
                <E2EERecoveryModal
                  currentUser={currentUser}
                  identityRecord={identityRecord}
                  onComplete={() => {
                    setShowE2EERecovery(false);
                    setIdentityRecord(null);
                  }}
                />
              )}
              {currentUser ? (
                !currentUser.emailVerified ? (
                  <EmailVerificationLock
                    currentUser={currentUser}
                    onVerifiedSuccess={handleVerifiedSuccess}
                    onLogout={() => handleLogout()}
                  />
                ) : (
                  <div className="fixed inset-0 h-full w-full flex flex-col md:flex-row bg-background overflow-hidden">
                    {/* Desktop Sidebar (visible on desktop/laptop) */}
                    <DesktopSidebar
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      currentUser={currentUser}
                      onLogout={() => handleLogout()}
                    />

                    {/* Main Content Area */}
                    <main className={`flex-1 h-full min-h-0 overflow-hidden relative ${activeTab !== "chat" || !isChatActive ? "pb-20 md:pb-0" : "pb-0"}`}>
                      {activeTab === "chat" && (
                        <Chat 
                          currentUser={currentUser} 
                          onBack={handleBackToContacts}
                          onSelectContact={handleSelectContact}
                          onGoToContacts={() => setActiveTab("contacts")}
                        />
                      )}
                      {activeTab === "contacts" && (
                        <Contacts
                          currentUser={currentUser}
                          onSelectContact={handleSelectContact}
                        />
                      )}
                      {activeTab === "profile" && <Profile currentUser={currentUser} />}
                      {activeTab === "settings" && (
                        <Settings currentUser={currentUser} onLogout={() => handleLogout()} />
                      )}
                    </main>

                    {/* Bottom Navigation (visible on mobile only) */}
                    {(!isChatActive || activeTab !== "chat") && (
                      <BottomNavigation activeTab={activeTab} onTabChange={setActiveTab} />
                    )}
                  </div>
                )
              ) : (
                <Login onLoginSuccess={() => {}} />
              )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
