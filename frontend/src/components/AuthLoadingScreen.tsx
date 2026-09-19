import { MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import {
  useTheme,
  getAccentPageBgClass,
  getAccentBgClass,
  getAccentTextClass,
} from "@/contexts/ThemeContext";

export default function AuthLoadingScreen() {
  const { accentColor } = useTheme();

  return (
    <div
      className={`min-h-screen bg-gradient-to-br ${getAccentPageBgClass(
        accentColor
      )} flex flex-col items-center justify-center p-6 relative overflow-hidden select-none`}
    >
      {/* Background ambient glowing spheres */}
      <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-rose-500/10 blur-3xl animate-pulse" />
      <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl animate-pulse delay-700" />

      {/* Main Glass Card */}
      <div className="glass rounded-3xl p-8 md:p-10 max-w-sm w-full text-center space-y-6 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
        {/* Animated Brand Icon */}
        <div className="relative inline-flex items-center justify-center mb-1">
          <div
            className={`absolute inset-0 rounded-3xl ${getAccentBgClass(
              accentColor
            )} blur-xl opacity-50 animate-pulse`}
          />
          <div
            className={`relative w-20 h-20 rounded-3xl ${getAccentBgClass(
              accentColor
            )} flex items-center justify-center text-white shadow-xl transform transition-transform duration-500 hover:scale-105`}
          >
            <MessageCircle className="w-10 h-10 animate-bounce" />
            <Sparkles className="w-4 h-4 absolute top-2 right-2 text-yellow-300 animate-spin" />
          </div>
        </div>

        {/* Title & Status */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            ChatsApp
          </h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-xs font-medium text-muted-foreground">
            <ShieldCheck className={`w-3.5 h-3.5 ${getAccentTextClass(accentColor)}`} />
            <span>Verifying session...</span>
          </div>
        </div>

        {/* Animated Progress Pulse */}
        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1.5 overflow-hidden relative">
          <div
            className={`h-full ${getAccentBgClass(
              accentColor
            )} rounded-full w-2/3 animate-pulse transition-all duration-500`}
          />
        </div>

        {/* Micro-copy footer */}
        <p className="text-xs text-muted-foreground/80 italic font-light">
          "Connecting securely to your chats..."
        </p>
      </div>
    </div>
  );
}
