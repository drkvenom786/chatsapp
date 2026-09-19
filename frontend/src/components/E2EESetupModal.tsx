import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generateChatBackupSecret,
  setupNewIdentity,
} from "@/lib/crypto/keyManagement";
import { saveIdentityBackup } from "@/lib/firebase";
import { toast } from "sonner";
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Download,
  Check,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Key,
} from "lucide-react";
import {
  useTheme,
  getAccentBgClass,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
} from "@/contexts/ThemeContext";

interface E2EESetupModalProps {
  currentUser: any;
  onComplete: () => void;
  onLogout?: () => void;
}

export default function E2EESetupModal({
  currentUser,
  onComplete,
  onLogout,
}: E2EESetupModalProps) {
  const { accentColor } = useTheme();

  // Generated Master Recovery Key
  const [masterSecret, setMasterSecret] = useState<string>(() =>
    generateChatBackupSecret()
  );

  // User's own memorable key
  const [userKey, setUserKey] = useState("");
  const [confirmUserKey, setConfirmUserKey] = useState("");
  const [showUserKey, setShowUserKey] = useState(false);
  const [showConfirmKey, setShowConfirmKey] = useState(false);

  const [copiedMaster, setCopiedMaster] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isKeyValid =
    userKey.length >= 4 && userKey === confirmUserKey;

  const handleRegenerateMaster = () => {
    setMasterSecret(generateChatBackupSecret());
    setCopiedMaster(false);
  };

  const handleCopyMaster = () => {
    navigator.clipboard.writeText(masterSecret);
    setCopiedMaster(true);
    toast.success("Emergency Master Secret copied!");
    setTimeout(() => setCopiedMaster(false), 3000);
  };

  const handleDownloadBackup = () => {
    const element = document.createElement("a");
    const file = new Blob(
      [
        `=====================================================\n` +
        `CHATSAPP - END-TO-END ENCRYPTION RECOVERY KIT\n` +
        `=====================================================\n\n` +
        `Account: ${currentUser?.displayName || currentUser?.username || currentUser?.email || "ChatsApp User"}\n` +
        `User ID: ${currentUser?.uid}\n` +
        `Email: ${currentUser?.email || "N/A"}\n` +
        `Date: ${new Date().toLocaleString()}\n\n` +
        `1. YOUR EMERGENCY MASTER BACKUP SECRET:\n` +
        `${masterSecret}\n\n` +
        `2. YOUR PERSONAL MEMORABLE KEY:\n` +
        `[Encrypted and stored on the server. Only you know this key!]\n\n` +
        `=====================================================\n` +
        `HOW THIS WORKS:\n` +
        `• Your Master Secret is encrypted with your personal memorable key\n` +
        `  and stored securely on the server and in your browser.\n` +
        `• You only need to remember your personal key to log in.\n` +
        `• If you ever forget your personal key, you can use the\n` +
        `  Emergency Master Secret above to restore your encrypted chats.\n` +
        `• ChatsApp servers NEVER see your plaintext keys or secret.\n` +
        `=====================================================\n`
      ],
      { type: "text/plain" }
    );
    element.href = URL.createObjectURL(file);
    element.download = `chatsapp-recovery-kit-${currentUser?.uid?.substring(0, 6) || "user"}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success("Recovery kit downloaded!");
  };

  const handleEnableE2EE = async () => {
    if (userKey.length < 4) {
      toast.error("Please enter a personal key of at least 4 characters");
      return;
    }
    if (userKey !== confirmUserKey) {
      toast.error("Personal keys do not match. Please re-enter.");
      return;
    }
    if (!confirmed) {
      toast.error("Please confirm that you have noted your key");
      return;
    }

    setLoading(true);
    try {
      // 1. Generate identity, encrypt masterSecret with userKey, and encrypt private keys with masterSecret
      const { backupRecord } = await setupNewIdentity(
        currentUser.uid,
        masterSecret,
        userKey
      );

      // 2. Upload public key & encrypted record to Firebase RTDB (encryptedMasterSecret is stored on server safely)
      await saveIdentityBackup(currentUser.uid, backupRecord);

      toast.success("End-to-End Encryption enabled! 🔒");
      onComplete();
    } catch (err: any) {
      console.error("E2EE Setup error:", err);
      toast.error(err.message || "Failed to initialize encryption identity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 text-foreground border border-border shadow-2xl rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className={`mx-auto w-14 h-14 rounded-2xl ${getAccentLightBgClass(accentColor)} ${getAccentTextClass(accentColor)} flex items-center justify-center shadow-inner`}>
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            End-to-End Key Generation
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
            Generate and secure your encryption keys so only you and your recipients can read your chats.
          </p>
        </div>

        {/* Section 1: User's Memorable Key (Primary) */}
        <div className="space-y-3.5 bg-muted/30 dark:bg-slate-800/50 p-4 rounded-2xl border border-border">
          <div className="flex items-center gap-2">
            <Key className={`w-4 h-4 ${getAccentTextClass(accentColor)} shrink-0`} />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              1. Create Your Memorable Key
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Create an easy-to-remember key, PIN, or passphrase. You will use this key to decrypt and unlock your chats easily on any device.
          </p>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Your Memorable Key
            </label>
            <div className="relative">
              <Input
                type={showUserKey ? "text" : "password"}
                placeholder="e.g. MySecretPin2026"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                disabled={loading}
                className={`pr-10 h-11 text-sm bg-white dark:bg-slate-900 ${getAccentBorderClass(accentColor)}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowUserKey(!showUserKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showUserKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Confirm Your Key
            </label>
            <div className="relative">
              <Input
                type={showConfirmKey ? "text" : "password"}
                placeholder="Re-type your memorable key"
                value={confirmUserKey}
                onChange={(e) => setConfirmUserKey(e.target.value)}
                disabled={loading}
                className={`pr-10 h-11 text-sm bg-white dark:bg-slate-900 ${getAccentBorderClass(accentColor)}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmKey(!showConfirmKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showConfirmKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {confirmUserKey.length > 0 && (
              <div className="mt-1.5 text-xs font-medium flex items-center gap-1.5">
                {userKey === confirmUserKey ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Keys match
                  </span>
                ) : (
                  <span className="text-destructive">Keys do not match</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Generated Master Secret (Encrypted by user key & stored on server) */}
        <div className="space-y-3 bg-muted/20 dark:bg-slate-800/30 p-4 rounded-2xl border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                2. Generated Emergency Master Secret
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRegenerateMaster}
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              New
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This key is encrypted with your memorable key and saved to the server. You can also save it as an emergency recovery kit.
          </p>

          <div className="p-3 bg-white dark:bg-slate-900 border border-border rounded-xl flex items-center justify-between gap-2 shadow-inner">
            <span className="font-mono text-xs sm:text-sm font-bold tracking-wider text-foreground select-all break-all">
              {masterSecret}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopyMaster}
              title="Copy secret"
              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            >
              {copiedMaster ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>

          <div className="flex gap-2 pt-0.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyMaster}
              className="flex-1 text-xs h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              {copiedMaster ? "Copied!" : "Copy Emergency Key"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadBackup}
              className="flex-1 text-xs h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Download Kit (.txt)
            </Button>
          </div>
        </div>

        {/* Security Note */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900 dark:text-amber-100">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            Security &amp; Storage Notice
          </div>
          <p>
            Your Master Secret is encrypted with your memorable key using <strong>Argon2id + AES-256-GCM</strong> before sending to the server. The server <strong>never</strong> sees your plaintext key or secret.
          </p>
        </div>

        {/* Confirmation Checkbox */}
        <label className="flex items-start gap-3 p-3 rounded-2xl border border-border cursor-pointer hover:bg-muted/30 transition-colors">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
          />
          <span className="text-xs text-foreground select-none leading-snug">
            I understand that I can unlock my chats using my memorable key (or the emergency secret).
          </span>
        </label>

        {/* Submit Button */}
        <Button
          type="button"
          disabled={!confirmed || !isKeyValid || loading}
          onClick={handleEnableE2EE}
          className={`w-full ${getAccentBgClass(accentColor)} text-white font-semibold h-11 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50`}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Encrypting &amp; Securing Keys...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Enable End-to-End Encryption
            </>
          )}
        </Button>

        {onLogout && (
          <div className="text-center pt-1 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Sign Out / Switch Account
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
