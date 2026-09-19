import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Eye,
  Smartphone,
  HelpCircle,
  LogOut,
  ChevronRight,
  Moon,
  Sun,
  Code2,
  ExternalLink,
  Ghost,
  Palette,
  Check,
  Sparkles,
  ShieldCheck,
  Lock,
  Laptop,
} from "lucide-react";
import {
  useTheme,
  getSentBubbleClasses,
  getReceivedBubbleClasses,
  type SentBubbleColor,
  type ReceivedBubbleColor,
  type AccentColor,
} from "@/contexts/ThemeContext";
import {
  removeFCMToken,
  requestFCMToken,
  setUserOnline,
  loadFirebase,
  setUserAnonymous,
  setUserNotifications,
  getDevices,
  revokeDevice,
  type DeviceInfo,
} from "@/lib/firebase";
import { getOrCreateDeviceId } from "@/lib/crypto/deviceManager";
import { toast } from "sonner";

interface SettingsProps {
  currentUser: any;
  onLogout?: () => void;
}

export default function Settings({ currentUser, onLogout }: SettingsProps) {
  const {
    theme,
    toggleTheme,
    accentColor,
    setAccentColor,
    sentBubbleColor,
    setSentBubbleColor,
    receivedBubbleColor,
    setReceivedBubbleColor,
  } = useTheme();

  const [notifications, setNotifications] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [hideNotificationPreview, setHideNotificationPreview] = useState(() => {
    return localStorage.getItem("chatsapp_hide_preview") === "true";
  });
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>("");
  const developerUrl = "https://drkvenom786.github.io/webpage/";

  const ACCENT_OPTIONS: { id: AccentColor; label: string; bg: string }[] = [
    { id: "rose", label: "Rose", bg: "bg-rose-500" },
    { id: "violet", label: "Violet", bg: "bg-violet-500" },
    { id: "emerald", label: "Emerald", bg: "bg-emerald-500" },
    { id: "sky", label: "Sky", bg: "bg-sky-500" },
    { id: "amber", label: "Amber", bg: "bg-amber-500" },
    { id: "indigo", label: "Indigo", bg: "bg-indigo-500" },
  ];

  const SENT_OPTIONS: { id: SentBubbleColor; label: string }[] = [
    { id: "classic", label: "Classic Green" },
    { id: "rose", label: "Rose" },
    { id: "emerald", label: "Emerald" },
    { id: "sky", label: "Sky" },
    { id: "violet", label: "Violet" },
    { id: "amber", label: "Amber" },
    { id: "slate", label: "Slate" },
  ];

  const RECEIVED_OPTIONS: { id: ReceivedBubbleColor; label: string }[] = [
    { id: "classic", label: "Classic White" },
    { id: "default", label: "Translucent Glass" },
    { id: "soft-rose", label: "Soft Rose" },
    { id: "soft-sky", label: "Soft Sky" },
    { id: "soft-emerald", label: "Soft Emerald" },
    { id: "soft-violet", label: "Soft Violet" },
    { id: "slate", label: "Slate" },
  ];

  const loadDevices = async () => {
    if (currentUser?.uid) {
      try {
        const [devList, myDevId] = await Promise.all([
          getDevices(currentUser.uid),
          getOrCreateDeviceId(),
        ]);
        setDevices(devList.filter((d) => !d.revoked));
        setCurrentDeviceId(myDevId);
      } catch (err) {
        console.warn("Error loading devices:", err);
      }
    }
  };

  useEffect(() => {
    if (currentUser?.uid) {
      const fetchStatus = async () => {
        const runtime = await loadFirebase();
        if (runtime) {
          const userRef = runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}`);
          const snapshot = await runtime.dbFns.get(userRef);
          const userData = snapshot.val();
          if (userData) {
            setOnlineStatus(userData.visibility === "online");
            setAnonymousMode(userData.isAnonymous || false);
            setNotifications(userData.notificationsEnabled ?? (Notification.permission === "granted"));
            if (userData.hideNotificationPreview !== undefined) {
              setHideNotificationPreview(Boolean(userData.hideNotificationPreview));
            }
          }
        }
        await loadDevices();
      };
      fetchStatus();
    }
  }, [currentUser]);

  const handleRevokeDevice = async (targetDevId: string) => {
    if (!currentUser?.uid) return;
    try {
      await revokeDevice(currentUser.uid, targetDevId);
      toast.success("Device logged out successfully");
      await loadDevices();
    } catch (err) {
      toast.error("Failed to log out device");
    }
  };

  const handleHidePreviewToggle = async (enabled: boolean) => {
    setHideNotificationPreview(enabled);
    localStorage.setItem("chatsapp_hide_preview", enabled ? "true" : "false");
    if (currentUser?.uid) {
      const runtime = await loadFirebase();
      if (runtime) {
        await runtime.dbFns.update(
          runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}`),
          { hideNotificationPreview: enabled }
        );
      }
    }
    toast.success(enabled ? "Notification message previews hidden" : "Notification previews enabled");
  };

  const handleOnlineStatusChange = async (enabled: boolean) => {
    setOnlineStatus(enabled);
    if (currentUser?.uid) {
      try {
        await setUserOnline(currentUser.uid, enabled);
        toast.success(enabled ? "You are now online ❤️" : "You are now invisible 🌙");
      } catch (error) {
        toast.error("Failed to update status");
        setOnlineStatus(!enabled);
      }
    }
  };

  const handleAnonymousModeChange = async (enabled: boolean) => {
    setAnonymousMode(enabled);
    if (currentUser?.uid) {
      try {
        await setUserAnonymous(currentUser.uid, enabled);
        toast.success(enabled ? "You are now anonymous 👻" : "You are now visible 👤");
      } catch (error) {
        toast.error("Failed to update privacy");
        setAnonymousMode(!enabled);
      }
    }
  };

  const handleNotificationChange = async (enabled: boolean) => {
    if (typeof Notification === "undefined") {
      toast.error("Notifications are not supported on this device");
      return;
    }

    try {
      if (enabled) {
        const token = await requestFCMToken(currentUser.uid);
        const finalEnabled = Boolean(token) || Notification.permission === "granted";
        setNotifications(finalEnabled);
        await setUserNotifications(currentUser.uid, finalEnabled);
        toast.success("Notifications enabled! ❤️");
      } else {
        await removeFCMToken(currentUser.uid);
        setNotifications(false);
        await setUserNotifications(currentUser.uid, false);
        toast.success("Notifications disabled");
      }
    } catch (error: any) {
      toast.error(error.message || "Could not update notifications");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background max-w-4xl mx-auto w-full border-x border-rose-100/50 dark:border-rose-900/40">
      {/* Header */}
      <div className="glass-sm border-b border-rose-100 dark:border-rose-900 p-4">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      </div>

      {/* Settings Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 pb-24">
          {/* Profile Section */}
          <div className="glass-sm rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
              My Profile
            </h2>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-rose-500/30">
                <AvatarFallback className="bg-gradient-to-br from-rose-100 to-pink-100 dark:from-rose-900/30 dark:to-pink-900/30 text-rose-700 dark:text-rose-300 text-xl font-bold">
                  {currentUser?.displayName?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {currentUser?.displayName}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  @{currentUser?.username || currentUser?.displayName || currentUser?.email?.split("@")[0] || "user"}
                </p>
              </div>
            </div>
          </div>

          {/* Appearance & Chat Color Customization Section */}
          <div className="glass-sm rounded-2xl p-4 space-y-5">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Palette className="w-4 h-4 text-rose-500" />
              Appearance & Colors
            </h2>

            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between pb-3 border-b border-rose-100/60 dark:border-rose-900/40">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="w-5 h-5 text-rose-400" />
                ) : (
                  <Sun className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <span className="text-sm font-medium block text-left">Dark Mode</span>
                  <span className="text-xs text-muted-foreground">Toggle light / dark mode</span>
                </div>
              </div>
              <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
            </div>

            {/* Overall Website Theme Accent Selector */}
            <div className="space-y-2 pt-1 pb-3 border-b border-rose-100/60 dark:border-rose-900/40">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block text-left">
                Overall Website Theme Accent
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {ACCENT_OPTIONS.map((opt) => {
                  const isSelected = accentColor === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAccentColor(opt.id)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        isSelected
                          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/60 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${opt.bg} flex items-center justify-center`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="text-[11px] font-semibold text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Outgoing Message (Sent Chat) Color Customization */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Sent Chat Bubble Color (Outgoing)
                </span>
                <span className="text-[10px] text-muted-foreground">Live Preview</span>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl flex justify-end mb-2 border border-black/5 dark:border-white/5">
                <div className={`px-3.5 py-2 rounded-2xl rounded-tr-none text-xs ${getSentBubbleClasses(sentBubbleColor)}`}>
                  Hello! This is how your sent messages look. ✨
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {SENT_OPTIONS.map((opt) => {
                  const isSelected = sentBubbleColor === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSentBubbleColor(opt.id)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        isSelected
                          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/60 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${getSentBubbleClasses(opt.id)} flex items-center justify-center`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </div>
                      <span className="text-[11px] font-semibold text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Incoming Message (Received Chat) Color Customization */}
            <div className="space-y-2 pt-2 border-t border-rose-100/60 dark:border-rose-900/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Received Chat Bubble Color (Incoming)
                </span>
                <span className="text-[10px] text-muted-foreground">Live Preview</span>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl flex justify-start mb-2 border border-black/5 dark:border-white/5">
                <div className={`px-3.5 py-2 rounded-2xl rounded-tl-none text-xs ${getReceivedBubbleClasses(receivedBubbleColor)}`}>
                  Hey! This is how received messages look. 💬
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {RECEIVED_OPTIONS.map((opt) => {
                  const isSelected = receivedBubbleColor === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setReceivedBubbleColor(opt.id)}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        isSelected
                          ? "border-rose-500 bg-rose-50 dark:bg-rose-950/60 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full ${getReceivedBubbleClasses(opt.id)} flex items-center justify-center`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 stroke-[3]" />}
                      </div>
                      <span className="text-[11px] font-semibold text-foreground">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Privacy Section */}
          <div className="glass-sm rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
              Privacy &amp; Safety
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Online Status</span>
                </div>
                <Switch checked={onlineStatus} onCheckedChange={handleOnlineStatusChange} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Ghost className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Anonymous Mode</p>
                    <p className="text-[10px] text-muted-foreground italic">Hide from list, only find via username</p>
                  </div>
                </div>
                <Switch checked={anonymousMode} onCheckedChange={handleAnonymousModeChange} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Notification Preview</p>
                    <p className="text-[10px] text-muted-foreground italic">
                      {hideNotificationPreview ? "Hide message content" : "Show message content"}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={!hideNotificationPreview}
                  onCheckedChange={(checked) => handleHidePreviewToggle(!checked)}
                />
              </div>
            </div>
          </div>

          {/* Security & End-to-End Encryption Section */}
          <div className="glass-sm rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Security &amp; Encryption
            </h2>
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Lock className="w-5 h-5" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">End-to-End Encrypted</p>
                <p className="text-xs text-muted-foreground">
                  Chats are secured with X25519 key agreement &amp; AES-256-GCM.
                </p>
              </div>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="glass-sm rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
              Notifications
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Push Notifications</span>
                </div>
                <Switch checked={notifications} onCheckedChange={handleNotificationChange} />
              </div>

              <Button
                variant="outline"
                size="default"
                className="w-full rounded-xl border-rose-100 dark:border-rose-900 text-xs py-2 h-auto"
                onClick={async () => {
                  const permission = await Notification.requestPermission();
                  if (permission === "granted") {
                    await handleNotificationChange(true);
                    toast.success("Notifications ready! ❤️");
                  } else {
                    toast.error("Permission denied. Check browser settings.");
                  }
                }}
              >
                Fix Notifications (Reset Permission)
              </Button>
            </div>
          </div>

          {/* Active Devices Section */}
          <div className="glass-sm rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Laptop className="w-4 h-4 text-rose-500" />
              Active Devices
            </h2>
            <div className="space-y-2">
              {devices.length === 0 ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5">
                  <Smartphone className="w-5 h-5 text-muted-foreground" />
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium">This Device</p>
                    <p className="text-xs text-muted-foreground">Active now</p>
                  </div>
                </div>
              ) : (
                devices.map((dev) => {
                  const isCurrent = dev.deviceId === currentDeviceId;
                  return (
                    <div
                      key={dev.deviceId}
                      className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {dev.os === "Windows" || dev.os === "macOS" || dev.os === "Linux" ? (
                          <Laptop className="w-5 h-5 text-muted-foreground shrink-0" />
                        ) : (
                          <Smartphone className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                        <div className="text-left min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {dev.deviceName || "Web Device"}
                            {isCurrent && (
                              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                This Device
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isCurrent ? "Active now" : `Last active: ${new Date(dev.lastActive || dev.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>

                      {!isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeDevice(dev.deviceId)}
                          className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 h-8 px-2.5 rounded-lg"
                        >Logout</Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Help Section */}
          <div className="glass-sm rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
              Support
            </h2>
            <a
              href={developerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-between rounded-xl p-3 transition-smooth hover:bg-white/20 dark:hover:bg-white/10"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium">Help & Support</span>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
            <a
              href={developerUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex w-full items-center justify-between rounded-xl p-3 transition-smooth hover:bg-white/20 dark:hover:bg-white/10"
            >
              <div className="flex items-center gap-3">
                <Code2 className="w-5 h-5 text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium">Developer</p>
                  <p className="text-xs text-muted-foreground">VENOM</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          </div>

          {/* Logout & Account Actions */}
          <div className="glass-sm rounded-2xl p-4 space-y-3">
            <Button
              onClick={onLogout}
              className="w-full bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold h-11 rounded-xl transition-smooth flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>

          {/* Footer */}
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              ChatsApp v1.0.0
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
