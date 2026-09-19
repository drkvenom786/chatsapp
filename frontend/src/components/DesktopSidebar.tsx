import { MessageCircle, Users, User, Settings, LogOut, Sun, Moon, Heart } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  useTheme,
  getAccentBgClass,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
} from "@/contexts/ThemeContext";

interface DesktopSidebarProps {
  activeTab: "chat" | "contacts" | "profile" | "settings";
  onTabChange: (tab: "chat" | "contacts" | "profile" | "settings") => void;
  currentUser: any;
  onLogout: () => void;
}

export default function DesktopSidebar({
  activeTab,
  onTabChange,
  currentUser,
  onLogout,
}: DesktopSidebarProps) {
  const { theme, toggleTheme, accentColor } = useTheme();

  const tabs = [
    { id: "chat" as const, icon: MessageCircle, label: "Messages" },
    { id: "contacts" as const, icon: Users, label: "People" },
    { id: "profile" as const, icon: User, label: "Profile" },
    { id: "settings" as const, icon: Settings, label: "Settings" },
  ];

  const displayName = currentUser?.displayName || currentUser?.name || currentUser?.email?.split("@")[0] || "User";

  return (
    <aside className={`hidden md:flex flex-col w-64 lg:w-72 h-screen glass-sm border-r ${getAccentBorderClass(accentColor)} p-4 shrink-0 justify-between select-none z-30`}>
      {/* Top Header & Branding */}
      <div>
        <div className="flex items-center gap-3 px-3 py-4 mb-6 border-b border-black/5 dark:border-white/10">
          <div className={`relative flex items-center justify-center w-10 h-10 rounded-2xl ${getAccentBgClass(accentColor)} text-white shadow-lg`}>
            <Heart className="w-5 h-5 fill-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none text-foreground tracking-tight">ChatsApp</h1>
            <p className={`text-xs ${getAccentTextClass(accentColor)} font-medium mt-1 flex items-center gap-1`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
              Realtime Messaging
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl font-medium text-sm transition-all duration-200 cursor-pointer
                  ${
                    isActive
                      ? `${getAccentBgClass(accentColor)} text-white shadow-md font-semibold translate-x-1`
                      : `text-muted-foreground hover:text-foreground ${getAccentLightBgClass(accentColor)}`
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-white" : getAccentTextClass(accentColor)}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Actions Card */}
      <div className="pt-4 border-t border-black/5 dark:border-white/10 space-y-3">
        {/* User Card */}
        <div className={`flex items-center gap-3 p-3 rounded-2xl ${getAccentLightBgClass(accentColor)} border border-black/5 dark:border-white/10 group`}>
          <Avatar className="h-10 w-10 border-2 border-black/10">
            <AvatarFallback className={`bg-white/80 dark:bg-black/30 ${getAccentTextClass(accentColor)} font-bold text-sm`}>
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate text-foreground group-hover:opacity-80 transition-opacity">
              {displayName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              @{currentUser?.username || currentUser?.displayName || currentUser?.email?.split("@")[0] || "user"}
            </p>
          </div>
        </div>

        {/* Action Buttons: Theme & Logout */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-black/10 dark:border-white/10 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer"
            title="Toggle theme"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4 text-amber-500" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span>Dark</span>
              </>
            )}
          </button>

          <button
            onClick={onLogout}
            className="flex items-center justify-center p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
