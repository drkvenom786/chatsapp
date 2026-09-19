import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  restoreIdentityFromBackup,
  setupNewIdentity,
  generateChatBackupSecret,
  type IdentityBackupRecord,
} from "@/lib/crypto/keyManagement";
import { saveIdentityBackup } from "@/lib/firebase";
import { toast } from "sonner";
import {
  KeyRound,
  ShieldAlert,
  Loader2,
  Unlock,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  useTheme,
  getAccentBgClass,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
} from "@/contexts/ThemeContext";

interface E2EERecoveryModalProps {
  currentUser: any;
  identityRecord: IdentityBackupRecord;
  onComplete: () => void;
}

export default function E2EERecoveryModal({
  currentUser,
  identityRecord,
  onComplete,
}: E2EERecoveryModalProps) {
  const { accentColor } = useTheme();
  const [secretInput, setSecretInput] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSecret = secretInput.trim();
    if (!cleanSecret) {
      toast.error("Please enter your Chat Backup Secret or Custom Key");
      return;
    }

    setLoading(true);
    try {
      // 1. Derive key locally and decrypt private key
      await restoreIdentityFromBackup(currentUser.uid, cleanSecret, identityRecord);

      toast.success("Identity restored! Encrypted chats unlocked. 🔓");
      onComplete();
    } catch (err: any) {
      console.error("Identity recovery error:", err);
      toast.error(err.message || "Incorrect secret key. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetIdentity = async () => {
    setResetting(true);
    try {
      const newSecret = generateChatBackupSecret();
      const { backupRecord } = await setupNewIdentity(currentUser.uid, newSecret);
      await saveIdentityBackup(currentUser.uid, backupRecord);

      toast.warning("New encryption identity created. Save your new Chat Backup Secret:", {
        description: newSecret,
        duration: 20000,
      });

      onComplete();
    } catch (err: any) {
      console.error("Reset identity error:", err);
      toast.error("Failed to reset encryption identity");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 text-foreground border border-border shadow-2xl rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className={`mx-auto w-14 h-14 rounded-2xl ${getAccentLightBgClass(accentColor)} ${getAccentTextClass(accentColor)} flex items-center justify-center shadow-inner`}>
            <KeyRound className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Unlock Encrypted Chats
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
            You are signing in from a new device or browser. Enter your memorable key (or emergency secret) to decrypt and restore your messages.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleRestore} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Your Memorable Key or Emergency Secret
            </label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                placeholder="e.g. MySecretPin2026 or CHATSAPP-XXXX..."
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                disabled={loading}
                className={`pr-10 h-11 text-sm bg-white dark:bg-slate-900 ${getAccentBorderClass(accentColor)}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !secretInput.trim()}
            className={`w-full ${getAccentBgClass(accentColor)} text-white font-semibold h-11 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying &amp; Unlocking Keys...
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                Unlock Encrypted Chats
              </>
            )}
          </Button>
        </form>

        {/* Forgotten Secret / Reset Option */}
        <div className="pt-2 border-t border-border space-y-3">
          {!showResetWarning ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowResetWarning(true)}
                className="text-xs text-muted-foreground hover:text-foreground font-medium underline underline-offset-4 cursor-pointer"
              >
                Lost or forgot your Chat Backup Secret?
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Cannot Recover Old Chats
              </div>
              <p className="leading-relaxed">
                Because ChatsApp uses true end-to-end encryption, our servers cannot decrypt your private keys. If you have no trusted device and lost your secret, past encrypted chats cannot be restored.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={resetting}
                  onClick={handleResetIdentity}
                  className="flex-1 text-xs h-9 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {resetting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Create New Identity
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResetWarning(false)}
                  className="text-xs h-9 rounded-xl cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
