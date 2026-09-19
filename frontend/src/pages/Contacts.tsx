import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { onUsersChange } from "@/lib/firebase";
import { Search, Users, MessageCircle, UserX } from "lucide-react";
import {
  useTheme,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
  getAccentRingClass,
  getAccentBgClass,
} from "@/contexts/ThemeContext";

interface ContactsProps {
  currentUser: any;
  onSelectContact?: (userId: string) => void;
}

interface User {
  uid: string;
  name: string;
  email: string;
  online: boolean;
  isAnonymous?: boolean;
  lastSeen?: number;
  deleted?: boolean;
  bio?: string;
  username?: string;
  displayName?: string;
}

export default function Contacts({ currentUser, onSelectContact }: ContactsProps) {
  const { accentColor } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setUsers([]);
    if (!currentUser?.uid) return;

    const unsubscribe = onUsersChange((allUsers) => {
      const usersList = Object.entries(allUsers)
        .filter(([uid, userData]) => {
          if (!uid || uid === currentUser.uid) return false;
          if (!userData || typeof userData !== "object") return false;
          const data = userData as any;
          if (!data.name || data.deleted === true || data.status === "deleted" || data.disabled === true) return false;
          return true;
        })
        .map(([uid, userData]) => ({
          uid,
          ...(userData as object),
        } as User));
      setUsers(usersList);
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser?.uid]);

  const filteredUsers = users.filter((user) => {
    const username = user.email?.split("@")[0] || "";
    const query = searchQuery.trim().toLowerCase();
    const nameMatches = (user.name || "").toLowerCase().includes(query);
    const usernameMatches = username.toLowerCase() === query;

    if (user.isAnonymous) {
      return query.length > 0 && usernameMatches;
    }

    return query.length === 0 || nameMatches || usernameMatches;
  });

  return (
    <div className={`flex flex-col h-full bg-background max-w-4xl mx-auto w-full border-x ${getAccentBorderClass(accentColor)}`}>
      {/* Header */}
      <div className="glass-sm border-b border-black/5 dark:border-white/10 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className={`w-5 h-5 ${getAccentTextClass(accentColor)}`} />
            <h1 className="text-2xl font-bold text-foreground">People</h1>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getAccentLightBgClass(accentColor)} ${getAccentTextClass(accentColor)} border border-black/5 dark:border-white/10`}>
            {filteredUsers.length} active
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`pl-10 bg-white/50 dark:bg-white/5 ${getAccentBorderClass(accentColor)} rounded-2xl ${getAccentRingClass(accentColor)}`}
          />
        </div>
      </div>

      {/* Contacts List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-4 pb-24">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <UserX className="w-12 h-12 mx-auto mb-3 text-slate-400" />
              <p className="text-lg font-bold text-foreground">No users found</p>
              <p className="text-xs mt-1 text-muted-foreground">Search for a username to start chatting.</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <div
                key={user.uid}
                onClick={() => onSelectContact?.(user.uid)}
                className={`glass-sm rounded-3xl p-4 flex items-center justify-between hover:${getAccentLightBgClass(accentColor)} transition-smooth cursor-pointer group`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative">
                    <Avatar className="h-14 w-14 border-2 border-black/10">
                      <AvatarFallback className={`bg-white/80 dark:bg-black/30 ${getAccentTextClass(accentColor)} font-bold text-lg`}>
                        {(user.name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {user.online && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.bio ? user.bio : `@${user.username || user.displayName || user.name || user.email?.split("@")[0] || "user"}`}
                    </p>
                  </div>
                </div>

                <Button
                  size="sm"
                  className={`${getAccentBgClass(accentColor)} text-white rounded-2xl px-4 py-2 text-xs font-semibold shadow-md flex items-center gap-1.5 cursor-pointer`}
                >
                  <MessageCircle className="w-4 h-4 fill-white/20" />
                  Chat
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
