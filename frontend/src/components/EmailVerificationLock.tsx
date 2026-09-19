import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mail, RefreshCw, LogOut, CheckCircle2 } from "lucide-react";
import { sendVerificationEmailToUser, reloadCurrentUser, type User } from "@/lib/firebase";
import {
  useTheme,
  getAccentPageBgClass,
  getAccentTextClass,
  getAccentBgClass,
  getAccentBorderClass,
} from "@/contexts/ThemeContext";
import { toast } from "sonner";

interface EmailVerificationLockProps {
  currentUser: User;
  onVerifiedSuccess: (verifiedEmail: string) => void;
  onLogout: () => void;
}

export default function EmailVerificationLock({
  currentUser,
  onVerifiedSuccess,
  onLogout,
}: EmailVerificationLockProps) {
  const { accentColor } = useTheme();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const isCheckingRef = useRef(false);

  const handleCheckStatus = async (silent = false) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    if (!silent) setChecking(true);

    try {
      const updatedUser = await reloadCurrentUser();
      if (updatedUser?.emailVerified) {
        onVerifiedSuccess(updatedUser.email || currentUser.email || "");
        return;
      }
      if (!silent) {
        toast.error("Email not verified yet. Please check your inbox or spam folder.");
      }
    } catch (err: any) {
      if (!silent) {
        toast.error(err.message || "Failed to check email verification status");
      }
    } finally {
      isCheckingRef.current = false;
      if (!silent) setChecking(false);
    }
  };

  // Automatically check verification when user returns to tab or every 4 seconds
  useEffect(() => {
    const handleActive = () => {
      if (document.visibilityState === "visible") {
        handleCheckStatus(true);
      }
    };

    window.addEventListener("focus", handleActive);
    document.addEventListener("visibilitychange", handleActive);
    const interval = setInterval(handleActive, 4000);

    return () => {
      window.removeEventListener("focus", handleActive);
      document.removeEventListener("visibilitychange", handleActive);
      clearInterval(interval);
    };
  }, []);

  const handleResend = async () => {
    setResending(true);
    try {
      await sendVerificationEmailToUser();
      toast.success(`Verification link sent to ${currentUser.email}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification email");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 bg-gradient-to-br ${getAccentPageBgClass(accentColor)} flex items-center justify-center p-4`}>
      <div className={`w-full max-w-md bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border ${getAccentBorderClass(accentColor)} rounded-3xl p-6 md:p-8 shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200`}>
        
        {/* Email Icon */}
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-black/5 dark:bg-white/10 ${getAccentTextClass(accentColor)} mx-auto`}>
          <Mail className="w-10 h-10 animate-bounce" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground">Verify Your Email</h2>
          <p className="text-sm text-muted-foreground mt-2">
            We've sent a verification email to:
          </p>
          <p className={`text-base font-semibold ${getAccentTextClass(accentColor)} mt-1 break-all`}>
            {currentUser.email}
          </p>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Please check your inbox or spam folder, click the verification link, then tap <strong>"I've Verified My Email"</strong> below to continue to login.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            onClick={() => handleCheckStatus(false)}
            disabled={checking}
            className={`w-full ${getAccentBgClass(accentColor)} text-white font-semibold h-12 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer`}
          >
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            I've Verified My Email
          </Button>

          <Button
            variant="outline"
            onClick={handleResend}
            disabled={resending}
            className={`w-full border-black/10 dark:border-white/10 text-foreground font-medium h-11 rounded-xl cursor-pointer flex items-center justify-center gap-2 text-xs md:text-sm`}
          >
            {resending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className={`w-4 h-4 ${getAccentTextClass(accentColor)}`} />}
            Resend Verification Link
          </Button>

          <Button
            variant="ghost"
            onClick={onLogout}
            className="w-full text-muted-foreground hover:text-foreground h-10 rounded-xl cursor-pointer flex items-center justify-center gap-2 text-xs"
          >
            <LogOut className="w-4 h-4" />
            Sign Out / Use Another Account
          </Button>
        </div>
      </div>
    </div>
  );
}
