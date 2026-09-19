import { MessageCircle, Users, User, Settings } from "lucide-react";
import { useTheme, getAccentTextClass, getAccentBgClass } from "@/contexts/ThemeContext";

interface BottomNavigationProps {
  activeTab: "chat" | "contacts" | "profile" | "settings";
  onTabChange: (tab: "chat" | "contacts" | "profile" | "settings") => void;
}

export default function BottomNavigation({
  activeTab,
  onTabChange,
}: BottomNavigationProps) {
  const { accentColor } = useTheme();

  const tabs = [
    { id: "chat" as const, icon: MessageCircle, label: "Messages" },
    { id: "contacts" as const, icon: Users, label: "People" },
    { id: "profile" as const, icon: User, label: "Profile" },
    { id: "settings" as const, icon: Settings, label: "Settings" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 glass-sm border-t border-black/10 dark:border-white/10 md:hidden z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-20">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex flex-col items-center justify-center w-full h-full gap-1
                transition-smooth duration-200 relative cursor-pointer
                ${
                  isActive
                    ? getAccentTextClass(accentColor)
                    : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] uppercase tracking-tighter font-bold">{tab.label}</span>
              {isActive && (
                <div className={`absolute bottom-2 w-1.5 h-1.5 ${getAccentBgClass(accentColor)} rounded-full`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
