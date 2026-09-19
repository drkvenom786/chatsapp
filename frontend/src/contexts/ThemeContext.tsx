import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Theme = "light" | "dark";
export type AccentColor = "rose" | "violet" | "emerald" | "sky" | "amber" | "indigo";
export type SentBubbleColor = "classic" | "rose" | "emerald" | "sky" | "violet" | "amber" | "slate";
export type ReceivedBubbleColor = "classic" | "default" | "soft-rose" | "soft-sky" | "soft-emerald" | "soft-violet" | "slate";

interface ThemeContextType {
  theme: Theme;
  accentColor: AccentColor;
  sentBubbleColor: SentBubbleColor;
  receivedBubbleColor: ReceivedBubbleColor;
  toggleTheme: () => void;
  setAccentColor: (color: AccentColor) => void;
  setSentBubbleColor: (color: SentBubbleColor) => void;
  setReceivedBubbleColor: (color: ReceivedBubbleColor) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  accentColor: "rose",
  sentBubbleColor: "classic",
  receivedBubbleColor: "classic",
  toggleTheme: () => {},
  setAccentColor: () => {},
  setSentBubbleColor: () => {},
  setReceivedBubbleColor: () => {},
});

export function getAccentBgClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "bg-violet-500 hover:bg-violet-600 shadow-violet-500/25";
    case "emerald":
      return "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25";
    case "sky":
      return "bg-sky-500 hover:bg-sky-600 shadow-sky-500/25";
    case "amber":
      return "bg-amber-500 hover:bg-amber-600 shadow-amber-500/25";
    case "indigo":
      return "bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/25";
    case "rose":
    default:
      return "bg-rose-500 hover:bg-rose-600 shadow-rose-500/25";
  }
}

export function getAccentTextClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "text-violet-500 dark:text-violet-400";
    case "emerald":
      return "text-emerald-500 dark:text-emerald-400";
    case "sky":
      return "text-sky-500 dark:text-sky-400";
    case "amber":
      return "text-amber-500 dark:text-amber-400";
    case "indigo":
      return "text-indigo-500 dark:text-indigo-400";
    case "rose":
    default:
      return "text-rose-500 dark:text-rose-400";
  }
}

export function getAccentLightBgClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "bg-violet-50/60 dark:bg-violet-950/40";
    case "emerald":
      return "bg-emerald-50/60 dark:bg-emerald-950/40";
    case "sky":
      return "bg-sky-50/60 dark:bg-sky-950/40";
    case "amber":
      return "bg-amber-50/60 dark:bg-amber-950/40";
    case "indigo":
      return "bg-indigo-50/60 dark:bg-indigo-950/40";
    case "rose":
    default:
      return "bg-rose-50/60 dark:bg-rose-950/40";
  }
}

export function getAccentBorderClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "border-violet-100 dark:border-violet-900/60";
    case "emerald":
      return "border-emerald-100 dark:border-emerald-900/60";
    case "sky":
      return "border-sky-100 dark:border-sky-900/60";
    case "amber":
      return "border-amber-100 dark:border-amber-900/60";
    case "indigo":
      return "border-indigo-100 dark:border-indigo-900/60";
    case "rose":
    default:
      return "border-rose-100 dark:border-rose-900/60";
  }
}

export function getAccentGradientClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "from-violet-500 to-purple-600";
    case "emerald":
      return "from-emerald-500 to-teal-600";
    case "sky":
      return "from-sky-500 to-blue-600";
    case "amber":
      return "from-amber-500 to-orange-600";
    case "indigo":
      return "from-indigo-500 to-blue-700";
    case "rose":
    default:
      return "from-rose-500 to-pink-600";
  }
}

export function getAccentRingClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "focus:ring-violet-500";
    case "emerald":
      return "focus:ring-emerald-500";
    case "sky":
      return "focus:ring-sky-500";
    case "amber":
      return "focus:ring-amber-500";
    case "indigo":
      return "focus:ring-indigo-500";
    case "rose":
    default:
      return "focus:ring-rose-500";
  }
}

export function getAccentPageBgClass(color: AccentColor | string) {
  switch (color) {
    case "violet":
      return "from-violet-50 via-white to-purple-50 dark:from-violet-950 dark:via-slate-900 dark:to-purple-950";
    case "emerald":
      return "from-emerald-50 via-white to-teal-50 dark:from-emerald-950 dark:via-slate-900 dark:to-teal-950";
    case "sky":
      return "from-sky-50 via-white to-blue-50 dark:from-sky-950 dark:via-slate-900 dark:to-blue-950";
    case "amber":
      return "from-amber-50 via-white to-orange-50 dark:from-amber-950 dark:via-slate-900 dark:to-orange-950";
    case "indigo":
      return "from-indigo-50 via-white to-blue-50 dark:from-indigo-950 dark:via-slate-900 dark:to-blue-950";
    case "rose":
    default:
      return "from-rose-50 via-white to-pink-50 dark:from-rose-950 dark:via-slate-900 dark:to-pink-950";
  }
}

export function getSentBubbleClasses(color: SentBubbleColor | string) {
  switch (color) {
    case "rose":
      return "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm";
    case "emerald":
      return "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm";
    case "sky":
      return "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-sm";
    case "violet":
      return "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-sm";
    case "amber":
      return "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm";
    case "slate":
      return "bg-slate-700 dark:bg-slate-600 text-white shadow-sm";
    case "classic":
    default:
      return "bg-[#d9fdd3] text-slate-900 dark:bg-[#005c4b] dark:text-white shadow-sm border border-emerald-300/40 dark:border-emerald-700/30";
  }
}

export function getReceivedBubbleClasses(color: ReceivedBubbleColor | string) {
  switch (color) {
    case "default":
      return "bg-black/5 dark:bg-white/10 text-foreground border border-black/10 dark:border-white/10";
    case "soft-rose":
      return "bg-rose-50 dark:bg-rose-950/80 text-rose-950 dark:text-rose-100 border border-rose-200 dark:border-rose-900";
    case "soft-sky":
      return "bg-sky-50 dark:bg-sky-950/80 text-sky-950 dark:text-sky-100 border border-sky-200 dark:border-sky-900";
    case "soft-emerald":
      return "bg-emerald-50 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-900";
    case "soft-violet":
      return "bg-violet-50 dark:bg-violet-950/80 text-violet-950 dark:text-violet-100 border border-violet-200 dark:border-violet-900";
    case "slate":
      return "bg-slate-200 dark:bg-slate-800 text-foreground border border-slate-300 dark:border-slate-700";
    case "classic":
    default:
      return "bg-white text-slate-900 dark:bg-[#202c33] dark:text-white border border-slate-200/80 dark:border-slate-700/60 shadow-sm";
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("theme") as Theme) || defaultTheme
  );
  const [accentColor, setAccentColorState] = useState<AccentColor>(
    () => (localStorage.getItem("accentColor") as AccentColor) || "rose"
  );
  const [sentBubbleColor, setSentBubbleColorState] = useState<SentBubbleColor>(() => {
    const saved = localStorage.getItem("sentBubbleColor") as SentBubbleColor;
    if (!saved || saved === "rose") return "classic";
    return saved;
  });
  const [receivedBubbleColor, setReceivedBubbleColorState] = useState<ReceivedBubbleColor>(() => {
    const saved = localStorage.getItem("receivedBubbleColor") as ReceivedBubbleColor;
    if (!saved || saved === "default") return "classic";
    return saved;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accentColor);
    localStorage.setItem("accentColor", accentColor);
  }, [accentColor]);

  const setAccentColor = (color: AccentColor) => {
    setAccentColorState(color);
    localStorage.setItem("accentColor", color);
    document.documentElement.setAttribute("data-accent", color);
  };

  const setSentBubbleColor = (color: SentBubbleColor) => {
    setSentBubbleColorState(color);
    localStorage.setItem("sentBubbleColor", color);
  };

  const setReceivedBubbleColor = (color: ReceivedBubbleColor) => {
    setReceivedBubbleColorState(color);
    localStorage.setItem("receivedBubbleColor", color);
  };

  const value = useMemo(
    () => ({
      theme,
      accentColor,
      sentBubbleColor,
      receivedBubbleColor,
      toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")),
      setAccentColor,
      setSentBubbleColor,
      setReceivedBubbleColor,
    }),
    [theme, accentColor, sentBubbleColor, receivedBubbleColor]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
