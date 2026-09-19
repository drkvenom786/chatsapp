import { useEffect, useState } from "react";
import {
  onMessagesChange,
  onOnlineStatusChange,
  onTypingChange,
  onRecentChatsChange,
  type ChatMessage,
} from "@/lib/firebase";

export function useMessages(currentUserId?: string, selectedUserId?: string | null) {
  const getCachedMessages = (): ChatMessage[] => {
    if (!currentUserId || !selectedUserId) return [];
    try {
      const roomKey = `chatsapp_msgs_${[currentUserId, selectedUserId].sort().join("_")}`;
      const cached = localStorage.getItem(roomKey);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => getCachedMessages());
  const [loading, setLoading] = useState(() => messages.length === 0);

  useEffect(() => {
    if (!currentUserId || !selectedUserId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const roomKey = `chatsapp_msgs_${[currentUserId, selectedUserId].sort().join("_")}`;
    try {
      const cached = localStorage.getItem(roomKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setMessages(parsed);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } catch {
      setLoading(true);
    }

    const unsub = onMessagesChange(currentUserId, selectedUserId, (list) => {
      const newMsgs = list || [];
      setMessages(newMsgs);
      setLoading(false);
      try {
        localStorage.setItem(roomKey, JSON.stringify(newMsgs.slice(-200)));
      } catch (e) {}
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [currentUserId, selectedUserId]);

  return { messages: messages || [], loading };
}

export function useTypingStatus(currentUserId?: string, selectedUserId?: string | null) {
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!currentUserId || !selectedUserId) {
      setIsTyping(false);
      return;
    }

    const unsub = onTypingChange(currentUserId, selectedUserId, setIsTyping);
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [currentUserId, selectedUserId]);

  return isTyping;
}

export function useUserOnlineStatus(userId?: string | null, observerUserId?: string | null) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    if (!userId) {
      setOnline(false);
      return;
    }

    const unsub = onOnlineStatusChange(userId, observerUserId || "", setOnline);
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [userId, observerUserId]);

  return online;
}

export function useUnreadCounts(currentUserId?: string, userIds: string[] = []) {
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!currentUserId || !userIds || userIds.length === 0) {
      setUnreadCounts({});
      return;
    }

    const unsubs: Array<() => void> = [];

    userIds.forEach((targetUid) => {
      const unsub = onMessagesChange(currentUserId, targetUid, (messages) => {
        const count = messages.filter(
          (m) =>
            m.receiverId === currentUserId &&
            !m.read &&
            !m.deletedForEveryone &&
            !m.deletedFor?.[currentUserId]
        ).length;

        setUnreadCounts((prev) => {
          if (prev[targetUid] === count) return prev;
          return { ...prev, [targetUid]: count };
        });
      });
      if (typeof unsub === "function") unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [currentUserId, JSON.stringify(userIds)]);

  return unreadCounts;
}

export function useRecentChats(currentUserId?: string) {
  const getCachedRecentChats = () => {
    if (!currentUserId) return {};
    try {
      const cached = localStorage.getItem(`chatsapp_recent_${currentUserId}`);
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  };

  const [recentChats, setRecentChats] = useState<Record<string, { lastMessage?: string; timestamp?: number; partnerName?: string }>>(() => getCachedRecentChats());
  const [loading, setLoading] = useState(() => Object.keys(recentChats).length === 0);

  useEffect(() => {
    if (!currentUserId) {
      setRecentChats({});
      setLoading(false);
      return;
    }

    const cacheKey = `chatsapp_recent_${currentUserId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setRecentChats(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}

    const unsub = onRecentChatsChange(currentUserId, (map) => {
      const newMap = map || {};
      setRecentChats(newMap);
      setLoading(false);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(newMap));
      } catch {}
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [currentUserId]);

  return { recentChats, loading };
}

