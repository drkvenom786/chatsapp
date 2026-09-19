import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp, signIn, sendPasswordReset } from "@/lib/firebase";
import { toast } from "sonner";
import { Loader2, MessageCircle, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import {
  useTheme,
  getAccentPageBgClass,
  getAccentTextClass,
  getAccentBgClass,
  getAccentBorderClass,
} from "@/contexts/ThemeContext";

interface LoginProps {
  onLoginSuccess?: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const { accentColor } = useTheme();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSuccessEmail, setResetSuccessEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("chatsapp_verified_email") || "";
    } catch {
      return "";
    }
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = username.trim();
    if (!cleanInput) {
      toast.error("Please enter your email or username");
      return;
    }

    setResetLoading(true);
    try {
      const sentEmail = await sendPasswordReset(cleanInput);
      setResetSuccessEmail(sentEmail);
    } catch (error: any) {
      console.error("Password reset error:", error);
      const code = error?.code || "";
      if (code === "auth/user-not-found") {
        toast.error("No account found with this email");
      } else if (code === "auth/invalid-email") {
        toast.error("Invalid email address format");
      } else {
        toast.error(error?.message || "Failed to send password reset email");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      toast.error(isSignUp ? "Username is required" : "Email is required");
      setLoading(false);
      return;
    }

    if (!password) {
      toast.error("Password is required");
      setLoading(false);
      return;
    }

    const errorMessages: Record<string, string> = {
      "auth/email-already-in-use": "Email or Username is already registered",
      "auth/invalid-email": "Invalid email address format",
      "auth/weak-password": "Password should be at least 6 characters",
      "auth/user-not-found": "Invalid email or password",
      "auth/wrong-password": "Invalid email or password",
      "auth/invalid-credential": "Invalid email or password",
      "auth/network-request-failed": "Network error, please try again",
      "auth/too-many-requests": "Too many failed attempts. Try again later",
    };

    try {
      if (isSignUp) {
        if (cleanUsername.includes("@") || cleanUsername.toLowerCase().endsWith(".com")) {
          toast.error("Username should not contain '@' or email domain");
          setLoading(false);
          return;
        }

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) {
          toast.error("Email is required");
          setLoading(false);
          return;
        }

        try {
          localStorage.setItem("chatsapp_pending_verification", "true");
          localStorage.setItem("chatsapp_verified_email", cleanEmail);
        } catch {}

        await signUp(cleanUsername, cleanEmail, password);
      } else {
        try {
          localStorage.removeItem("chatsapp_pending_verification");
          localStorage.removeItem("chatsapp_verified_email");
        } catch {}

        await signIn(cleanUsername, password);
      }
      onLoginSuccess?.();
    } catch (error: any) {
      console.error("Auth error:", error);
      const code = error?.code || "";
      const msg = errorMessages[code] || error?.message || "Authentication failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${getAccentPageBgClass(accentColor)} flex items-center justify-center p-4 md:p-8`}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center justify-center w-14 h-14 md:w-16 md:h-16 rounded-2xl glass mb-4">
            <MessageCircle className={`w-8 h-8 ${getAccentTextClass(accentColor)}`} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">ChatsApp</h1>
          <p className="text-sm md:text-base text-muted-foreground italic">Connect instantly, message beautifully</p>
        </div>

        {/* Login / Reset Card */}
        <div className="glass rounded-3xl p-6 md:p-8 space-y-6 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          {resetSuccessEmail ? (
            <div className="text-center py-2 space-y-4 animate-slide-up">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-1">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <h2 className="text-2xl font-bold text-foreground">Password Reset Link Sent!</h2>

              <p className="text-sm text-muted-foreground leading-relaxed px-2">
                We have sent a password reset link to <span className="font-semibold text-foreground">{resetSuccessEmail}</span>.
                <br />
                Please check your <strong className="text-foreground">inbox</strong> and <strong className="text-foreground">spam folder</strong>.
              </p>

              <div className="pt-4">
                <Button
                  type="button"
                  onClick={() => {
                    setResetSuccessEmail(null);
                    setIsForgotPassword(false);
                  }}
                  className={`w-full ${getAccentBgClass(accentColor)} text-white font-semibold h-11 rounded-xl transition-smooth shadow-lg cursor-pointer`}
                >
                  ← Go Back to Sign In
                </Button>
              </div>
            </div>
          ) : isForgotPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-foreground">Reset Password</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter your email address or username and we will send you a password reset link. Please check your inbox &amp; spam folder.
                </p>
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-foreground mb-2">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={resetLoading}
                  className={`bg-white/50 dark:bg-white/5 ${getAccentBorderClass(accentColor)}`}
                />
              </div>

              <Button
                type="submit"
                disabled={resetLoading}
                className={`w-full ${getAccentBgClass(accentColor)} text-white font-semibold h-11 rounded-xl transition-smooth shadow-lg cursor-pointer flex items-center justify-center`}
              >
                {resetLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending Reset Link...
                  </>
                ) : (
                  "Send Password Reset Link"
                )}
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(false)}
                  className={`text-xs ${getAccentTextClass(accentColor)} font-semibold hover:underline cursor-pointer`}
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username / Email field */}
              <div>
                <label className="block text-xs md:text-sm font-medium text-foreground mb-2">
                  {isSignUp ? "Username" : "Email Address"}
                </label>
                <Input
                  type={isSignUp ? "text" : "email"}
                  placeholder={isSignUp ? "username" : "name@example.com"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className={`bg-white/50 dark:bg-white/5 ${getAccentBorderClass(accentColor)}`}
                />
              </div>

              {/* Email field (only for sign up) */}
              {isSignUp && (
                <div>
                  <label className="block text-xs md:text-sm font-medium text-foreground mb-2">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className={`bg-white/50 dark:bg-white/5 ${getAccentBorderClass(accentColor)}`}
                  />
                </div>
              )}

              {/* Password field */}
              <div>
                <label className="block text-xs md:text-sm font-medium text-foreground mb-2">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className={`bg-white/50 dark:bg-white/5 ${getAccentBorderClass(accentColor)} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!isSignUp && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className={`text-xs ${getAccentTextClass(accentColor)} font-medium hover:underline cursor-pointer`}
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
              </div>

              {/* Confirm Password field (only for sign up) */}
              {isSignUp && (
                <div>
                  <label className="block text-xs md:text-sm font-medium text-foreground mb-2">
                    Confirm Password
                  </label>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    className={`bg-white/50 dark:bg-white/5 ${getAccentBorderClass(accentColor)}`}
                  />
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={loading}
                className={`w-full ${getAccentBgClass(accentColor)} text-white font-semibold h-11 rounded-xl transition-smooth shadow-lg cursor-pointer flex items-center justify-center gap-2`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isSignUp ? "Creating account..." : "Signing in..."}
                  </>
                ) : isSignUp ? (
                  "Create Account"
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          )}

          {/* Switch mode */}
          {!isForgotPassword && (
            <div className="text-center pt-2 border-t border-black/5 dark:border-white/10">
              <p className="text-xs text-muted-foreground">
                {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className={`font-semibold ${getAccentTextClass(accentColor)} hover:underline cursor-pointer`}
                >
                  {isSignUp ? "Sign In" : "Sign Up"}
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
