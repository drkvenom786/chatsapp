import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  onUsersChange,
  onMessagesChange,
  sendMessage,
  setTyping,
  generateChatRoomId,
  escapeHtml,
  deleteMessageForMe,
  deleteMessageForEveryone,
  markMessagesAsRead,
  editMessage,
  clearChatForMe,
  loadFirebase,
  startRingtone,
  stopRingtone,
  sendCallPushNotification,
  blockUser,
  unblockUser,
  onBlockedUsersChange,
  toggleMessageReaction,
  removeUserChat,
  logCallHistory,
  type ChatMessage,
} from "@/lib/firebase";
import { CloudflareRealtimeApp } from "@/lib/cloudflareCalls";
import {
  useMessages,
  useTypingStatus,
  useUserOnlineStatus,
  useUnreadCounts,
  useRecentChats,
} from "@/hooks/useChat";
import MessageContextMenu from "@/components/MessageContextMenu";
import FullEmojiPicker from "@/components/FullEmojiPicker";
import AudioPlayer from "@/components/AudioPlayer";
import SlideUpAccept from "@/components/SlideUpAccept";
import ContactProfileModal from "@/components/ContactProfileModal";
import {
  useTheme,
  getSentBubbleClasses,
  getReceivedBubbleClasses,
  getAccentBgClass,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
} from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { getApiUrl, getMediaUrl, getApiHeaders } from "@/lib/api";
import {
  Search,
  ArrowLeft,
  Loader2,
  MessageCircle,
  X,
  MoreVertical,
  Trash2,
  Ban,
  Reply,
  Plus,
  Send,
  Heart,
  Sparkles,
  Edit2,
  ChevronDown,
  AlertCircle,
  Check,
  CheckCheck,
  Phone,
  PhoneOff,
  Volume1,
  Volume2,
  PhoneMissed,
  PhoneOutgoing,
  PhoneIncoming,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  Download,
  Eye,
  Clock,
  Lock,
  Info,
} from "lucide-react";

interface ChatPageProps {
  currentUser: any;
  onBack?: () => void;
  onSelectContact?: (userId: string) => void;
  onGoToContacts?: () => void;
}

interface User {
  uid: string;
  name?: string;
  username?: string;
  displayName?: string;
  email?: string;
  online?: boolean;
  lastSeen?: number;
  bio?: string;
}


// Helper to detect if message text contains ONLY emojis (up to 5 emojis)
function getEmojiOnlyInfo(text?: string): { isOnlyEmoji: boolean; count: number } {
  if (!text) return { isOnlyEmoji: false, count: 0 };
  const trimmed = text.trim();
  if (!trimmed) return { isOnlyEmoji: false, count: 0 };

  const emojiRegex = /(\p{RI}\p{RI}|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:[\u{1F3FB}-\u{1F3FF}])?)*|[\u{1F1E6}-\u{1F1FF}]{2}|[\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\uFE0F?)/gu;

  const withoutSpaces = trimmed.replace(/\s+/g, "");
  const withoutEmojis = withoutSpaces.replace(emojiRegex, "");

  if (withoutEmojis.length > 0) {
    return { isOnlyEmoji: false, count: 0 };
  }

  const matches = withoutSpaces.match(emojiRegex);
  const count = matches ? matches.length : 0;
  return { isOnlyEmoji: count > 0 && count <= 5, count };
}

export default function Chat({
  currentUser,
  onBack,
  onSelectContact,
  onGoToContacts,
}: ChatPageProps) {
  const { accentColor, sentBubbleColor, receivedBubbleColor } = useTheme();
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const cached = localStorage.getItem("chatsapp_cached_users");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [inputText, setInputText] = useState("");
  const { recentChats } = useRecentChats(currentUser?.uid);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showContactProfile, setShowContactProfile] = useState(false);
  const [menuConfig, setMenuConfig] = useState<{ id: string; text: string; isOwn: boolean } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [offlinePendingQueue, setOfflinePendingQueue] = useState<ChatMessage[]>([]);
  const [selectedUserForAction, setSelectedUserForAction] = useState<User | null>(null);
  const chatHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isChatHoldTriggeredRef = useRef<boolean>(false);

  const handleChatTouchStart = (user: User) => {
    isChatHoldTriggeredRef.current = false;
    if (chatHoldTimerRef.current) clearTimeout(chatHoldTimerRef.current);
    chatHoldTimerRef.current = setTimeout(() => {
      isChatHoldTriggeredRef.current = true;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(40);
      }
      setSelectedUserForAction(user);
    }, 450);
  };

  const handleChatTouchEndOrCancel = () => {
    if (chatHoldTimerRef.current) {
      clearTimeout(chatHoldTimerRef.current);
      chatHoldTimerRef.current = null;
    }
  };

  const handleChatClick = (user: User) => {
    if (isChatHoldTriggeredRef.current) {
      isChatHoldTriggeredRef.current = false;
      return;
    }
    selectUser(user);
  };

  const [removedUserIds, setRemovedUserIds] = useState<Set<string>>(() => new Set());

  const handleRemoveChatFromScreen = async (userToRemove: User) => {
    if (!currentUser?.uid || !userToRemove.uid) return;

    const targetUid = userToRemove.uid;

    // 1. Immediately remove from local state
    setRemovedUserIds((prev) => new Set(prev).add(targetUid));

    // 2. Deselect if currently open
    if (selectedUser?.uid === targetUid) {
      setSelectedUser(null);
      sessionStorage.removeItem("selectedContactId");
      if (onBack) onBack();
    }

    setSelectedUserForAction(null);

    // 3. Perform background database removal
    try {
      await removeUserChat(currentUser.uid, targetUid);
    } catch (e) {
      console.warn("Background removeUserChat warning:", e);
    }
  };

  // Cloudflare R2 Media Draft State
  const [attachedMedia, setAttachedMedia] = useState<{
    file: File;
    previewUrl: string;
    mediaName: string;
    mediaSize: number;
    mediaType: "image" | "video" | "audio" | "file";
  } | null>(null);
  const [expandedMediaUrl, setExpandedMediaUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) fileInputRef.current.value = "";

    const localPreviewUrl = (file.type.startsWith("image/") || file.type.startsWith("video/"))
      ? URL.createObjectURL(file)
      : "";

    let fileMediaType: "image" | "video" | "audio" | "file" = "file";
    if (file.type.startsWith("image/")) fileMediaType = "image";
    else if (file.type.startsWith("video/")) fileMediaType = "video";
    else if (file.type.startsWith("audio/")) fileMediaType = "audio";

    setAttachedMedia({
      file,
      previewUrl: localPreviewUrl,
      mediaName: file.name,
      mediaSize: file.size,
      mediaType: fileMediaType,
    });
  };

  const processAndSendMessage = async (msg: ChatMessage) => {
    let uploadedMediaPayload: Partial<ChatMessage> = {};

    if (msg.localFile) {
      try {
        const formData = new FormData();
        formData.append("file", msg.localFile);

        const res = await fetch(getApiUrl("/api/upload-media"), {
          method: "POST",
          headers: getApiHeaders(),
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.mediaUrl) {
            uploadedMediaPayload = {
              mediaUrl: data.mediaUrl,
              mediaKey: data.mediaKey,
              mediaName: data.mediaName || msg.mediaName,
              mediaSize: data.mediaSize || msg.mediaSize,
              mediaType: data.mediaType || msg.mediaType,
            };
          }
        }
      } catch (err) {
        console.error("Background R2 upload error:", err);
      }
    }

    // Turn off spinner once R2 upload completes
    setOfflinePendingQueue((prev) =>
      prev.map((item) =>
        item.id === msg.id
          ? {
              ...item,
              ...uploadedMediaPayload,
              isUploadingMedia: false,
            }
          : item
      )
    );

    // If online, post to Firebase
    if (navigator.onLine) {
      try {
        const finalMediaUrl = uploadedMediaPayload.mediaUrl || (msg.mediaUrl && !msg.localFile ? msg.mediaUrl : "");
        await sendMessage({
          id: msg.id,
          senderId: msg.senderId,
          receiverId: msg.receiverId,
          text: msg.text || "",
          timestamp: msg.timestamp,
          ...(finalMediaUrl
            ? {
                mediaUrl: finalMediaUrl,
                mediaKey: uploadedMediaPayload.mediaKey || msg.mediaKey,
                mediaName: uploadedMediaPayload.mediaName || msg.mediaName,
                mediaSize: uploadedMediaPayload.mediaSize || msg.mediaSize,
                mediaType: uploadedMediaPayload.mediaType || msg.mediaType,
              }
            : {}),
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
        });

        // Sent to Firebase! Remove from local pending queue
        setOfflinePendingQueue((prev) => prev.filter((item) => item.id !== msg.id));
      } catch (err) {
        console.error("Firebase send message error:", err);
      }
    }
  };

  // WebRTC Calling States
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "active">("idle");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [callerInfo, setCallerInfo] = useState<{ uid: string; name: string } | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isLoudSpeaker, setIsLoudSpeaker] = useState(true);
  const callStartTimeRef = useRef<number>(0);
  const callTypeRef = useRef<"audio" | "video">("audio");
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callStateRef = useRef<"idle" | "calling" | "incoming" | "active">("idle");
  callStateRef.current = callState;

  const toggleSpeaker = () => {
    const nextVal = !isLoudSpeaker;
    setIsLoudSpeaker(nextVal);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = nextVal ? 1.0 : 0.25;
    }
    // Volume adjusted silently
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callState === "active") {
      setCallDuration(0);
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)}:${pad(secs)}`;
  };

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { messages, loading: messagesLoading } = useMessages(
    currentUser?.uid || "",
    selectedUser?.uid || ""
  );

  const displayedMessages = useMemo(() => {
    const pendingForSelected = offlinePendingQueue.filter(
      (m) =>
        (m.senderId === currentUser?.uid && m.receiverId === selectedUser?.uid) ||
        (m.senderId === selectedUser?.uid && m.receiverId === currentUser?.uid)
    );
    if (pendingForSelected.length === 0) return messages;

    const matchedFirebaseIds = new Set<string>();

    const unsyncedPending = pendingForSelected.filter((pending) => {
      // 1. Direct ID match
      if (messages.some((m) => m.id === pending.id)) return false;

      // 2. Check if a message in Firebase matches this pending item
      const matchingFirebaseMsg = messages.find((m) => {
        if (!m.id || matchedFirebaseIds.has(m.id)) return false;
        if (m.senderId !== pending.senderId) return false;

        // Match media
        if (pending.mediaKey && m.mediaKey === pending.mediaKey) return true;
        if (
          pending.mediaName &&
          m.mediaName === pending.mediaName &&
          Math.abs((m.timestamp || 0) - (pending.timestamp || 0)) < 10000
        ) {
          return true;
        }

        // Match text & timestamp proximity
        if (
          pending.text &&
          m.text === pending.text &&
          Math.abs((m.timestamp || 0) - (pending.timestamp || 0)) < 10000
        ) {
          return true;
        }

        return false;
      });

      if (matchingFirebaseMsg && matchingFirebaseMsg.id) {
        matchedFirebaseIds.add(matchingFirebaseMsg.id);
        return false; // Already in Firebase, don't duplicate
      }

      return true; // Still pending / unsynced
    });

    return [...messages, ...unsyncedPending].sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, offlinePendingQueue, currentUser?.uid, selectedUser?.uid]);

  const isTyping = useTypingStatus(
    currentUser?.uid || "",
    selectedUser?.uid || ""
  );

  const selectedUserOnline = useUserOnlineStatus(selectedUser?.uid || "", currentUser?.uid || "");
  const [blockedUsers, setBlockedUsers] = useState<Record<string, boolean>>({});
  const isBlocked = Boolean(selectedUser?.uid && blockedUsers[selectedUser.uid]);

  const [replyingToMessage, setReplyingToMessage] = useState<{ id: string; senderName: string; text: string } | null>(null);
  const [activeEmojiPickerMsgId, setActiveEmojiPickerMsgId] = useState<string | null>(null);
  const [closedHoverBarMsgId, setClosedHoverBarMsgId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({});
  const touchStartRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const handleTouchStart = (msgId: string, e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        id: msgId,
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (msgId: string, isOutgoing: boolean, e: React.TouchEvent) => {
    if (!touchStartRef.current || touchStartRef.current.id !== msgId) return;
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = e.touches[0].clientY - touchStartRef.current.y;

    if (isOutgoing) {
      if (deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY)) {
        const offset = Math.max(deltaX, -85);
        setSwipeOffset((prev) => ({ ...prev, [msgId]: offset }));
      }
    } else {
      if (deltaX > 0 && deltaX > Math.abs(deltaY)) {
        const offset = Math.min(deltaX, 85);
        setSwipeOffset((prev) => ({ ...prev, [msgId]: offset }));
      }
    }
  };

  const handleTouchEnd = (msg: ChatMessage, senderName: string) => {
    if (!touchStartRef.current || touchStartRef.current.id !== msg.id) return;
    const offset = swipeOffset[msg.id || ""] || 0;

    if (Math.abs(offset) > 45 && msg.id) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(25);
      }
      setReplyingToMessage({
        id: msg.id,
        senderName,
        text: msg.text,
      });
    }

    setSwipeOffset((prev) => ({ ...prev, [msg.id || ""]: 0 }));
    touchStartRef.current = null;
  };

  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onBlockedUsersChange(currentUser.uid, (map) => {
      setBlockedUsers(map || {});
    });
    return unsub;
  }, [currentUser?.uid]);

  // Auto-send pending offline messages when connection returns
  useEffect(() => {
    const handleOnline = async () => {
      if ((offlinePendingQueue?.length || 0) > 0 && selectedUser?.uid) {
        // Pending messages resent silently
        const queue = [...offlinePendingQueue];
        setOfflinePendingQueue([]);
        for (const msg of queue) {
          try {
            await sendMessage({
              senderId: currentUser.uid,
              receiverId: selectedUser.uid,
              text: msg.text,
            });
          } catch (e) {
            console.error("Resend error:", e);
          }
        }
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [offlinePendingQueue, selectedUser?.uid, currentUser?.uid]);

  // Read message listener
  useEffect(() => {
    if (selectedUser?.uid && (messages?.length || 0) > 0) {
      markMessagesAsRead(currentUser.uid, selectedUser.uid).catch(() => {});
    }
  }, [selectedUser?.uid, messages, currentUser?.uid]);

  useEffect(() => {
    const unsubscribe = onUsersChange((usersMap) => {
      const usersList: User[] = Object.entries(usersMap)
        .filter(([uid]) => uid !== currentUser?.uid)
        .map(([uid, data]: [string, any]) => ({
          uid,
          name: data.name || data.email?.split("@")[0] || "User",
          username: data.username || (data.name ? data.name.toLowerCase().replace(/\s+/g, "_") : data.email?.split("@")[0]),
          displayName: data.displayName || data.name,
          email: data.email,
          online: data.visibility === "online" ? true : data.online || false,
          lastSeen: data.lastSeen,
          bio: data.bio || "",
        }));
      setUsers(usersList);
      try {
        localStorage.setItem("chatsapp_cached_users", JSON.stringify(usersList));
      } catch {}
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const activeContact = useMemo(() => {
    if (!selectedUser?.uid) return selectedUser;
    const live = users.find((u) => u.uid === selectedUser.uid);
    return live ? { ...selectedUser, ...live } : selectedUser;
  }, [users, selectedUser]);



  useEffect(() => {
    const savedContactId = sessionStorage.getItem("selectedContactId");
    if (savedContactId && (users?.length || 0) > 0 && !selectedUser) {
      const found = users.find((u) => u.uid === savedContactId);
      if (found) setSelectedUser(found);
    }
  }, [users, selectedUser]);

  useEffect(() => {
    if (selectedUser?.uid && onSelectContact) {
      onSelectContact(selectedUser.uid);
    }
  }, [selectedUser?.uid, onSelectContact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Prevent mobile virtual keyboard from panning window up off-screen
  useEffect(() => {
    const lockScroll = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener("scroll", lockScroll);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", lockScroll);
      window.visualViewport.addEventListener("scroll", lockScroll);
    }

    return () => {
      window.removeEventListener("scroll", lockScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", lockScroll);
        window.visualViewport.removeEventListener("scroll", lockScroll);
      }
    };
  }, []);

  // Handle Hardware / Gesture Back Button on Mobile
  useEffect(() => {
    if (!selectedUser) return;

    window.history.pushState({ view: "chatRoom" }, "");

    const handlePopState = () => {
      setSelectedUser(null);
      sessionStorage.removeItem("selectedContactId");
      if (onBack) onBack();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [selectedUser, onBack]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // WebRTC Voice / Video Call Engine
  const startCall = async (type: "audio" | "video") => {
    if (!selectedUser?.uid) return;
    if (isBlocked) {
      toast.error("Unblock this contact before starting a call");
      return;
    }
    setCallState("calling");
    setCallType(type);
    callStartTimeRef.current = Date.now();
    callTypeRef.current = type;
    callStateRef.current = "calling";

    // Auto-timeout after 1 minute (60 seconds) if receiver doesn't answer
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current === "calling") {
        // Call timed out silently
        void endCall(true);
      }
    }, 60000);

    let stream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      }
    } catch (e: any) {
      if (type === "video") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setCallType("audio");
          toast.info("Connecting as Voice Call (Camera unavailable)");
        } catch (audioErr: any) {
          toast.error("Microphone access blocked. Please enable mic permission in browser site settings.");
          setCallState("idle");
          return;
        }
      } else {
        toast.error("Microphone access blocked. Please enable mic permission in browser site settings.");
        setCallState("idle");
        return;
      }
    }

    if (!stream) {
      toast.error("Microphone or camera permission required for calls");
      setCallState("idle");
      return;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current && (stream.getVideoTracks()?.length || 0) > 0) {
      localVideoRef.current.srcObject = stream;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
        ],
      });
      pcRef.current = pc;

      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream!));
      }

      pc.ontrack = (event) => {
        console.log("Chat startCall ontrack:", event.track.kind, event.streams);
        let remoteStream = event.streams && event.streams[0];
        if (!remoteStream) {
          remoteStream = new MediaStream();
          remoteStream.addTrack(event.track);
        }

        if (event.track.kind === "audio" || (remoteStream.getAudioTracks()?.length || 0) > 0) {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = isLoudSpeaker ? 1.0 : 0.25;
            remoteAudioRef.current.play().catch((e) => console.warn("remoteAudio play warning:", e));
          }
        }

        if (event.track.kind === "video" || (remoteStream.getVideoTracks()?.length || 0) > 0) {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.muted = false;
            remoteVideoRef.current.play().catch((e) => console.warn("remoteVideo play warning:", e));
          }
        }
      };

      const runtime = await loadFirebase();
      if (!runtime) {
        toast.error("Database connection unavailable");
        endCall();
        return;
      }

      const chatRoomId = generateChatRoomId(currentUser.uid, selectedUser.uid);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candObj = JSON.parse(JSON.stringify(event.candidate));
          runtime.dbFns.push(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/callerCandidates`), candObj).catch(() => {});
        }
      };

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      let cfSessionId = "";
      try {
        const cfRes = await createCloudflareCallSession(offer);
        if (cfRes?.sessionId) {
          cfSessionId = cfRes.sessionId;
          console.log("Cloudflare Calls SFU Session initialized:", cfSessionId);
        }
      } catch (cfErr) {
        console.warn("Cloudflare Calls SFU init warning:", cfErr);
      }

      const offerData = {
        type: String(offer.type),
        sdp: String(offer.sdp),
      };

      const callPayload = {
        from: currentUser.uid,
        fromName: currentUser.displayName || currentUser.name || "Friend",
        target: selectedUser.uid,
        type,
        status: "calling",
        offer: offerData,
        cfSessionId,
        chatRoomId,
        timestamp: Date.now(),
      };

      // Write to users/$targetUid/incomingCall, userCalls/$targetUid, calls/$targetUid, and chats/$chatRoomId/call
      try {
        await Promise.all([
          runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `users/${selectedUser.uid}/incomingCall`), callPayload).catch(() => {}),
          runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `calls/${selectedUser.uid}`), callPayload).catch(() => {}),
          runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call`), callPayload).catch(() => {}),
        ]);
        void sendCallPushNotification(selectedUser.uid, currentUser.displayName || currentUser.name || currentUser.email || "Friend", type, currentUser.uid);
      } catch (dbErr) {
        console.warn("DB call set warning:", dbErr);
      }

      // Listen for Receiver SDP Answer from all locations
      const handleAnswerSnapshot = async (snapshot: any) => {
        const answerVal = snapshot.val();
        if (answerVal && pcRef.current && !pcRef.current.currentRemoteDescription) {
          if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
          }
          stopRingtone();
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answerVal)).catch(console.warn);
          setCallState("active");
        }
      };

      runtime.dbFns.onValue(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/answer`), handleAnswerSnapshot);
      const handleCallStatus = (snapshot: any) => {
        const call = snapshot.val();
        if (call?.status === "declined") {
          void endCall(false, "declined");
        } else if (call?.status === "ended" || call?.status === "cancelled") {
          void endCall();
        }
      };
      runtime.dbFns.onValue(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call`), handleCallStatus);
      runtime.dbFns.onValue(runtime.dbFns.ref(runtime.db, `calls/${selectedUser.uid}`), handleCallStatus);
      runtime.dbFns.onValue(runtime.dbFns.ref(runtime.db, `users/${selectedUser.uid}/incomingCall`), handleCallStatus);

      // Listen for Receiver ICE Candidates from all locations
      const listenReceiverCandidates = (path: string) => {
        const candRef = runtime.dbFns.ref(runtime.db, path);
        runtime.dbFns.onChildAdded(candRef, (snapshot: any) => {
          const candidateData = snapshot.val();
          if (candidateData && pcRef.current) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(candidateData)).catch(console.warn);
          }
        });
      };

      listenReceiverCandidates(`chats/${chatRoomId}/call/receiverCandidates`);

      startRingtone();
      // Calling started
    } catch (err: any) {
      console.error("startCall WebRTC error:", err);
      toast.error(err?.message || "Call failed to initiate");
      endCall();
    }
  };

  const acceptCall = async () => {
    stopRingtone();
    if (!callerInfo?.offer) {
      toast.error("Invalid call offer");
      endCall();
      return;
    }

    setCallState("active");
    let stream: MediaStream | null = null;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video",
        });
      }
    } catch (err) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setCallType("audio");
        toast.info("Connecting as Voice Call (Camera unavailable)");
      } catch (audioErr) {
        toast.error("Microphone access blocked. Please enable mic permission in browser site settings.");
        endCall();
        return;
      }
    }

    if (!stream) {
      toast.error("Microphone or camera permission required for calls");
      endCall();
      return;
    }

    localStreamRef.current = stream;
    if (localVideoRef.current && (stream.getVideoTracks()?.length || 0) > 0) {
      localVideoRef.current.srcObject = stream;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream!));

      pc.ontrack = (event) => {
        console.log("Chat acceptCall ontrack:", event.track.kind, event.streams);
        let remoteStream = event.streams && event.streams[0];
        if (!remoteStream) {
          remoteStream = new MediaStream();
          remoteStream.addTrack(event.track);
        }

        if (event.track.kind === "audio" || (remoteStream.getAudioTracks()?.length || 0) > 0) {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1.0;
            remoteAudioRef.current.play().catch((e) => console.warn("remoteAudio play warning:", e));
          }
        }

        if (event.track.kind === "video" || (remoteStream.getVideoTracks()?.length || 0) > 0) {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.muted = false;
            remoteVideoRef.current.play().catch((e) => console.warn("remoteVideo play warning:", e));
          }
        }
      };

      const runtime = await loadFirebase();
      if (!runtime) return;

      const chatRoomId = callerInfo.chatRoomId || generateChatRoomId(callerInfo.uid, currentUser.uid);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candObj = JSON.parse(JSON.stringify(event.candidate));
          runtime.dbFns.push(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/receiverCandidates`), candObj).catch(() => {});
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.offer));
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(answer);

      const answerData = {
        type: String(answer.type),
        sdp: String(answer.sdp),
      };

      await Promise.all([
        runtime.dbFns.set(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/answer`), answerData).catch(() => {}),
        runtime.dbFns.update(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call`), { status: "accepted" }).catch(() => {}),
      ]);

      // Listen for caller ICE Candidates
      const candRef = runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call/callerCandidates`);
      runtime.dbFns.onChildAdded(candRef, (snapshot: any) => {
        const candidateData = snapshot.val();
        if (candidateData && pcRef.current) {
          pcRef.current.addIceCandidate(new RTCIceCandidate(candidateData)).catch(console.warn);
        }
      });

      // Call connected silently
    } catch (e) {
      console.error("acceptCall WebRTC error:", e);
      toast.error("Call failed to connect");
      endCall();
    }
  };

  const endCall = async (isTimeout = false, forcedStatus?: "missed" | "declined" | "completed") => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (selectedUser?.uid && currentUser?.uid) {
      const currentCallState = callStateRef.current;
      const status = forcedStatus || (currentCallState === "active" ? "completed" : (currentCallState === "calling" || isTimeout) ? "missed" : "declined");
      const ringSeconds = callStartTimeRef.current ? Math.max(1, Math.round((Date.now() - callStartTimeRef.current) / 1000)) : 60;
      const duration = currentCallState === "active" ? callDuration : ringSeconds;
      logCallHistory(
        currentUser.uid,
        selectedUser.uid,
        callType,
        status,
        duration,
        callStartTimeRef.current || Date.now()
      ).catch(() => {});
    }
    endCallCleanup();
    try {
      if (selectedUser?.uid && currentUser?.uid) {
        const chatRoomId = generateChatRoomId(currentUser.uid, selectedUser.uid);
        const runtime = await loadFirebase();
        if (runtime) {
          await Promise.all([
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `chats/${chatRoomId}/call`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `userCalls/${selectedUser.uid}`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `calls/${selectedUser.uid}`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${selectedUser.uid}/incomingCall`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${selectedUser.uid}/callAnswer`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${selectedUser.uid}/callerCandidates`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${selectedUser.uid}/receiverCandidates`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `userCalls/${currentUser.uid}`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `calls/${currentUser.uid}`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/incomingCall`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/callAnswer`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/callerCandidates`)).catch(() => {}),
            runtime.dbFns.remove(runtime.dbFns.ref(runtime.db, `users/${currentUser.uid}/receiverCandidates`)).catch(() => {}),
          ]);
        }
      }
    } catch (err) {
      console.error("endCall error:", err);
    }
  };

  const endCallCleanup = () => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    stopRingtone();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    callStateRef.current = "idle";
    setCallState("idle");
    setCallerInfo(null);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoDisabled(!videoTrack.enabled);
      }
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !attachedMedia) || !selectedUser) return;

    const textToSend = inputText.trim();
    const mediaDraft = attachedMedia;
    const isEditing = Boolean(editingMessageId);
    const targetEditId = editingMessageId;

    setInputText("");
    setAttachedMedia(null);
    setEditingMessageId(null);
    setEditingText("");
    setTyping(currentUser.uid, selectedUser.uid, false);

    if (isEditing && targetEditId) {
      try {
        await editMessage(currentUser.uid, selectedUser.uid, targetEditId, textToSend);
      } catch (err) {
        console.warn("Edit message error:", err);
      }
      return;
    }

    const currentReply = replyingToMessage;
    setReplyingToMessage(null);

    const pendingId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pendingMsg: ChatMessage = {
      id: pendingId,
      senderId: currentUser.uid,
      receiverId: selectedUser.uid,
      text: textToSend,
      mediaUrl: mediaDraft?.previewUrl || "",
      mediaName: mediaDraft?.mediaName,
      mediaSize: mediaDraft?.mediaSize,
      mediaType: mediaDraft?.mediaType,
      localFile: mediaDraft?.file,
      isUploadingMedia: Boolean(mediaDraft?.file),
      timestamp: Date.now(),
      failed: true,
      ...(currentReply ? { replyTo: currentReply } : {}),
    };

    // Immediately show on chat screen with spinner & stopwatch icon
    setOfflinePendingQueue((prev) => [...prev, pendingMsg]);

    // Process upload to R2 and send to Firebase in background
    processAndSendMessage(pendingMsg);
  };

  // Cleanup typing indicator when component unmounts or selected user changes
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (currentUser?.uid && selectedUser?.uid) {
        setTyping(currentUser.uid, selectedUser.uid, false).catch(() => {});
      }
    };
  }, [currentUser?.uid, selectedUser?.uid]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputText(value);

    if (!selectedUser) return;

    if (value.trim().length > 0) {
      setTyping(currentUser.uid, selectedUser.uid, true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setTyping(currentUser.uid, selectedUser.uid, false);
      }, 1500);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      setTyping(currentUser.uid, selectedUser.uid, false);
    }
  };

  const handleClearChat = async () => {
    if (!selectedUser) return;
    try {
      await clearChatForMe(currentUser.uid, selectedUser.uid);
      setShowHeaderMenu(false);
      toast.success("Chat cleared for you");
    } catch (error) {
      toast.error("Failed to clear chat");
    }
  };

  const handleToggleBlockUser = async () => {
    if (!selectedUser?.uid || !currentUser?.uid) return;
    try {
      if (isBlocked) {
        await unblockUser(currentUser.uid, selectedUser.uid);
        toast.success(`Unblocked ${selectedUser.name || "user"}`);
      } else {
        await blockUser(currentUser.uid, selectedUser.uid);
        toast.success(`Blocked ${selectedUser.name || "user"}`);
      }
      setShowHeaderMenu(false);
    } catch (err) {
      toast.error("Failed to update block status");
    }
  };

  const selectUser = (user: User) => {
    setSelectedUser(user);
    sessionStorage.setItem("selectedContactId", user.uid);
    if (currentUser?.uid && user.uid) {
      markMessagesAsRead(currentUser.uid, user.uid);
    }
    if (onSelectContact) onSelectContact(user.uid);
  };

  const deselectUser = () => {
    setSelectedUser(null);
    sessionStorage.removeItem("selectedContactId");
    if (onBack) onBack();
  };

  const chattedUsers = useMemo(() => {
    const chattedUidSet = new Set<string>();
    Object.keys(recentChats || {}).forEach((uid) => chattedUidSet.add(uid));
    if (selectedUser?.uid) chattedUidSet.add(selectedUser.uid);

    const query = searchTerm.trim().toLowerCase();
    if (query.length > 0) {
      users.forEach((u) => {
        if (
          u.name?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query)
        ) {
          chattedUidSet.add(u.uid);
        }
      });
    }

    const usersMap = new Map(users.map((u) => [u.uid, u]));

    const list: User[] = Array.from(chattedUidSet)
      .filter((uid) => Boolean(uid) && uid !== currentUser?.uid && !removedUserIds.has(uid))
      .map((uid) => {
        const existingUser = usersMap.get(uid);
        if (existingUser) return existingUser;
        if (selectedUser?.uid === uid) return selectedUser;
        return {
          uid,
          name: recentChats[uid]?.partnerName || "User",
          email: "",
          online: false,
        };
      })
      .filter((u) => {
        if (!query) return true;
        return (
          u.name?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const timeA = recentChats[a.uid]?.timestamp || (a.uid === selectedUser?.uid ? Date.now() : 0);
        const timeB = recentChats[b.uid]?.timestamp || (b.uid === selectedUser?.uid ? Date.now() : 0);
        return timeB - timeA;
      });

    return list;
  }, [users, recentChats, selectedUser, searchTerm, currentUser?.uid, removedUserIds]);

  const chattedUserUids = useMemo(() => chattedUsers.map((u) => u.uid), [chattedUsers]);
  const unreadCounts = useUnreadCounts(currentUser?.uid, chattedUserUids);

  const formatRecentTime = (timestamp?: number) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  useEffect(() => {
    if (currentUser?.uid && selectedUser?.uid && (messages?.length || 0) > 0) {
      markMessagesAsRead(currentUser.uid, selectedUser.uid);
    }
  }, [messages, currentUser?.uid, selectedUser?.uid]);

  const renderChatRoom = () => (
    <div className="flex flex-col w-full h-full min-h-0 flex-1 bg-[#efeae2] dark:bg-slate-950 relative overflow-hidden">
      {/* Active WebRTC Voice/Video Call Overlay */}
      {callState !== "idle" && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl z-[150] flex flex-col items-center justify-between p-6 animate-in fade-in zoom-in duration-300 select-none">
          {/* Remote Audio Track Player */}
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

          <div className="flex flex-col items-center gap-3 mt-8">
            <div className="relative">
              <Avatar className="w-28 h-28 md:w-32 md:h-32 border-4 border-rose-500/40 shadow-[0_0_50px_rgba(244,63,94,0.35)]">
                <AvatarFallback className="bg-rose-900 text-white text-3xl md:text-4xl font-extrabold">
                  {String(callState === "incoming" ? callerInfo?.name : selectedUser?.name || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {(callState === "calling" || callState === "incoming") && (
                <div className="absolute inset-0 rounded-full border-2 border-rose-500/80 animate-ping pointer-events-none" />
              )}
            </div>
            <h3 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mt-2">
              {callState === "incoming" ? callerInfo?.name : selectedUser?.name}
            </h3>
            <p className="text-sm font-semibold tracking-wider flex items-center gap-2">
              {callState === "calling" && (
                <span className="text-emerald-400 animate-pulse flex items-center gap-1.5 font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  Calling...
                </span>
              )}
              {callState === "incoming" && (
                <span className="text-rose-400 animate-pulse flex items-center gap-1.5 font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                  Incoming {callType === "video" ? "Video" : "Voice"} Call...
                </span>
              )}
              {callState === "active" && (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3.5 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Connected • {formatCallDuration(callDuration)}
                </span>
              )}
            </p>
          </div>

          {/* Local / Remote Video Streams */}
          {callType === "video" && (callState === "calling" || callState === "active") && (
            <div className="relative w-full max-w-lg h-64 bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl my-4">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-3 right-3 w-28 h-20 bg-slate-950/90 rounded-xl overflow-hidden border border-white/20 shadow-xl">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Call Controls */}
          <div className="flex items-center gap-6 mb-8">
            {callState === "incoming" ? (
              <>
                {/* Desktop Direct Tap */}
                <div className="hidden md:flex items-center gap-6">
                  <Button
                    onClick={() => endCall(false, "declined")}
                    className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </Button>
                  <Button
                    onClick={acceptCall}
                    className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl flex items-center justify-center animate-bounce cursor-pointer active:scale-95 transition-transform"
                  >
                    <Phone className="w-7 h-7" />
                  </Button>
                </div>

                {/* Mobile Slide Up to Answer */}
                <div className="flex md:hidden items-end gap-8">
                  <div className="flex flex-col items-center gap-1.5 pb-2">
                    <Button
                      onClick={() => endCall(false, "declined")}
                      className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                    >
                      <PhoneOff className="w-6 h-6" />
                    </Button>
                    <span className="text-[11px] font-semibold text-rose-400">Decline</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <SlideUpAccept onAccept={acceptCall} callType={callType} />
                    <span className="text-[11px] font-semibold text-emerald-400 mt-1.5">Slide to Answer</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Button
                  onClick={toggleMic}
                  variant="ghost"
                  className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                    isMicMuted ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-800 text-white hover:bg-slate-700"
                  }`}
                >
                  {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </Button>
                {callType === "video" && (
                  <Button
                    onClick={toggleVideo}
                    variant="ghost"
                    className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                      isVideoDisabled ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-slate-800 text-white hover:bg-slate-700"
                    }`}
                  >
                    {isVideoDisabled ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </Button>
                )}
                {/* Speaker button only appears when call is accepted! */}
                {callState === "active" && (
                  <Button
                    onClick={toggleSpeaker}
                    variant="ghost"
                    className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                      isLoudSpeaker ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-800 text-white hover:bg-slate-700"
                    }`}
                    title={isLoudSpeaker ? "Speaker: Loud (100%)" : "Speaker: Low (25%)"}
                  >
                    {isLoudSpeaker ? <Volume2 className="w-6 h-6" /> : <Volume1 className="w-6 h-6" />}
                  </Button>
                )}
                <Button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  <PhoneOff className="w-7 h-7" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fixed Chat Header */}
      <div className="shrink-0 w-full z-40 bg-[#f0f2f5] dark:bg-slate-900 px-3 md:px-4 py-2.5 flex items-center justify-between shadow-sm border-b border-slate-200/80 dark:border-slate-800 h-[60px] select-none">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={deselectUser}
            className="md:hidden rounded-full hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ArrowLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
          </Button>

          <div
            onClick={() => setShowContactProfile(true)}
            className="flex items-center gap-3 min-w-0 cursor-pointer select-none no-underline outline-none focus:outline-none focus:ring-0 active:bg-transparent [-webkit-tap-highlight-color:transparent]"
          >
            <Avatar className="h-10 w-10 border border-rose-200 dark:border-rose-900 select-none pointer-events-none">
              <AvatarFallback className="bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-400 font-bold select-none">
                {String(selectedUser?.name || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 select-none">
              <p className="font-bold text-base truncate text-slate-800 dark:text-slate-100 leading-tight no-underline select-none">
                {selectedUser?.name || "Unknown"}
              </p>
              <p className="text-xs flex items-center gap-1 select-none">
                {isTyping ? (
                  <span className="text-rose-500 font-semibold animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block"></span>
                    typing...
                  </span>
                ) : selectedUserOnline ? (
                  <span className="text-emerald-500 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    online
                  </span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">offline</span>
                )}
                <span className="text-muted-foreground/50 mx-1">•</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5 text-[10px]">
                  <Lock className="w-2.5 h-2.5" /> E2EE
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 relative" ref={headerMenuRef}>
          {/* Voice Call Button */}
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            onClick={() => startCall("audio")}
            title="Voice Call"
          >
            <Phone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
          >
            <MoreVertical className="w-5 h-5 text-rose-500" />
          </Button>

          {showHeaderMenu && (
            <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-rose-100 dark:border-rose-900 py-1 z-[100] animate-in fade-in zoom-in duration-200">
              <button
                onClick={() => {
                  setShowHeaderMenu(false);
                  setShowContactProfile(true);
                }}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Info className="w-4 h-4 text-slate-500" />
                Contact info
              </button>
              <button
                onClick={handleClearChat}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                <Trash2 className="w-4 h-4" />
                Clear Chat
              </button>
              <button
                onClick={handleToggleBlockUser}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                <Ban className="w-4 h-4" />
                {isBlocked ? "Unblock User" : "Block User"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="space-y-3 pb-4">
          {messagesLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
            </div>
          ) : (!displayedMessages || displayedMessages.length === 0) ? (
            <div className="flex justify-center my-8">
              <div className="bg-white/80 dark:bg-slate-900/80 px-4 py-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
                <p className="text-muted-foreground italic text-sm">
                  No messages here yet. Say hello! 👋
                </p>
              </div>
            </div>
          ) : (
            displayedMessages.map((msg) => {
              const isOutgoing = msg.senderId === currentUser.uid;
              const isDeleted = msg.deletedForEveryone;
              const emojiInfo = (!isDeleted && !msg.mediaUrl && !msg.callInfo && !msg.replyTo && msg.text)
                ? getEmojiOnlyInfo(msg.text)
                : { isOnlyEmoji: false, count: 0 };
              const isEmojiOnly = emojiInfo.isOnlyEmoji;
              const isPending = Boolean(msg.failed || (msg.id && String(msg.id).startsWith("offline_")));
              const hasActiveReactions = !isDeleted && Boolean(
                msg.reactions && Object.values(msg.reactions).some((uidsMap) => Object.values(uidsMap || {}).some(Boolean))
              );

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOutgoing ? "justify-end" : "justify-start"} group animate-slide-up relative ${hasActiveReactions ? "mb-4 z-20" : "mb-1.5"}`}
                >
                  <div
                    onTouchStart={(e) => msg.id && handleTouchStart(msg.id, e)}
                    onTouchMove={(e) => msg.id && handleTouchMove(msg.id, isOutgoing, e)}
                    onTouchEnd={() => msg.id && handleTouchEnd(msg, isOutgoing ? "You" : selectedUser?.name || "Friend")}
                    style={{ transform: `translateX(${swipeOffset[msg.id || ""] || 0}px)` }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const id = msg.id || "";
                      const text = msg.text || "";
                      const isOwn = isOutgoing;

                      if (longPressTimer.current) clearTimeout(longPressTimer.current);
                      longPressTimer.current = setTimeout(() => {
                        setMenuConfig({ id, text, isOwn });
                        if (navigator.vibrate) navigator.vibrate(40);
                        longPressTimer.current = null;
                      }, 450);
                    }}
                    onPointerUp={() => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                      if (msg.id && closedHoverBarMsgId === msg.id) {
                        setClosedHoverBarMsgId(null);
                      }
                    }}
                    onMouseLeave={() => {
                      if (msg.id && closedHoverBarMsgId === msg.id) {
                        setClosedHoverBarMsgId(null);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenuConfig({
                        id: msg.id || "",
                        text: msg.text || "",
                        isOwn: isOutgoing,
                      });
                    }}
                    className={`
                      max-w-[85%] md:max-w-[70%] relative group/msg cursor-pointer select-none transition-all duration-75
                      ${
                        isEmojiOnly
                          ? "bg-transparent border-0 shadow-none p-1"
                          : `px-3.5 py-2 rounded-2xl shadow-sm ${
                              isOutgoing
                                ? `${getSentBubbleClasses(sentBubbleColor)} rounded-tr-none`
                                : `${getReceivedBubbleClasses(receivedBubbleColor)} rounded-tl-none`
                            }`
                      }
                    `}
                  >

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuConfig({
                          id: msg.id || "",
                          text: msg.text || "",
                          isOwn: isOutgoing,
                        });
                      }}
                      className="absolute -top-2 right-2 opacity-0 group-hover/msg:opacity-100 transition-opacity bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full p-1 shadow-md text-slate-500 hover:text-rose-500 z-10 cursor-pointer"
                      title="Options"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Quoted Reply Box */}
                    {msg.replyTo && (
                      <div className="bg-black/5 dark:bg-white/10 border-l-4 border-rose-500 rounded-r-lg px-2.5 py-1.5 mb-1.5 text-xs select-none">
                        <p className="font-bold text-rose-500 text-[11px]">{msg.replyTo.senderName || "Friend"}</p>
                        <p className="truncate opacity-90">{msg.replyTo.text}</p>
                      </div>
                    )}

                    {/* Media Content */}
                    {!isDeleted && msg.mediaUrl && (
                      <div className="relative mb-2 max-w-full overflow-hidden rounded-2xl">
                        {msg.mediaType === "image" && (
                          <div className="relative group">
                            <img
                              src={getMediaUrl(msg.mediaUrl)}
                              alt={msg.mediaName || "Photo"}
                              className={`max-w-full max-h-80 rounded-2xl object-cover border border-black/10 cursor-pointer hover:opacity-95 transition-all shadow-sm ${
                                msg.isUploadingMedia ? "brightness-75" : ""
                              }`}
                              onClick={() => setExpandedMediaUrl(getMediaUrl(msg.mediaUrl))}
                            />
                            {!msg.isUploadingMedia && (
                              <button
                                type="button"
                                onClick={() => setExpandedMediaUrl(getMediaUrl(msg.mediaUrl))}
                                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                                title="Expand Image"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                        {msg.mediaType === "video" && (
                          <video
                            src={getMediaUrl(msg.mediaUrl)}
                            controls={!msg.isUploadingMedia}
                            className={`max-w-full max-h-80 rounded-2xl border border-black/10 shadow-sm ${
                              msg.isUploadingMedia ? "brightness-75" : ""
                            }`}
                          />
                        )}
                        {msg.mediaType === "audio" && (
                          <AudioPlayer
                            src={getMediaUrl(msg.mediaUrl)}
                            fileName={msg.mediaName}
                            fileSize={msg.mediaSize}
                            isOutgoing={isOutgoing}
                            disabled={msg.isUploadingMedia}
                          />
                        )}
                        {msg.mediaType === "file" && (
                          <a
                            href={msg.isUploadingMedia ? "#" : getMediaUrl(msg.mediaUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={msg.mediaName || "file"}
                            className="flex items-center gap-3 p-3 rounded-2xl bg-black/5 dark:bg-white/10 border border-black/10 hover:bg-black/10 dark:hover:bg-white/15 transition-colors group"
                          >
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="text-xs font-bold truncate text-foreground">{msg.mediaName || "Document"}</p>
                              {msg.mediaSize && (
                                <p className="text-[10px] text-muted-foreground">{formatFileSize(msg.mediaSize)}</p>
                              )}
                            </div>
                            {!msg.isUploadingMedia && (
                              <Download className="w-4 h-4 text-muted-foreground group-hover:text-rose-500 transition-colors shrink-0" />
                            )}
                          </a>
                        )}

                        {/* Circular Progress Spinner Overlay on Media in Chat Screen while uploading */}
                        {msg.isUploadingMedia && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-2xl flex items-center justify-center z-20">
                            <div className="p-3 rounded-full bg-black/60 text-white shadow-xl flex items-center justify-center">
                              <Loader2 className="w-6 h-6 animate-spin text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.callInfo ? (
                      <div className="flex items-center gap-3 py-1 select-none min-w-[200px]">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            msg.callInfo.status === "missed"
                              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                              : msg.callInfo.status === "declined"
                              ? "bg-slate-500/15 text-slate-500"
                              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {msg.callInfo.type === "video" ? (
                            msg.callInfo.status === "missed" ? (
                              <VideoOff className="w-5 h-5 text-rose-500" />
                            ) : (
                              <Video className="w-5 h-5" />
                            )
                          ) : msg.callInfo.status === "missed" ? (
                            <PhoneMissed className="w-5 h-5 text-rose-500" />
                          ) : isOutgoing ? (
                            <PhoneOutgoing className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <PhoneIncoming className="w-5 h-5 text-emerald-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-semibold text-foreground leading-tight">
                            {msg.callInfo.type === "video" ? "Video call" : "Voice call"}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            {(() => {
                              const d = msg.callInfo?.duration;
                              const durBadge = d !== undefined && d > 0
                                ? (Math.floor(d / 60) > 0 && d % 60 > 0
                                    ? ` (${Math.floor(d / 60)}m ${d % 60}s)`
                                    : Math.floor(d / 60) > 0
                                    ? ` (${Math.floor(d / 60)}m)`
                                    : ` (${d}s)`)
                                : "";
                              if (msg.callInfo?.status === "missed") {
                                return <span className="text-rose-500 font-medium">Missed{durBadge}</span>;
                              }
                              if (msg.callInfo?.status === "declined") {
                                return <span className="text-slate-500 font-medium">Declined{durBadge}</span>;
                              }
                              return (
                                <span>
                                  {isOutgoing ? "Outgoing" : "Incoming"}
                                  {durBadge}
                                </span>
                              );
                            })()}
                          </p>
                        </div>
                        {selectedUser && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startCall(msg.callInfo!.type);
                            }}
                            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title={`Call back (${msg.callInfo.type})`}
                          >
                            {msg.callInfo.type === "video" ? (
                              <Video className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Phone className="w-4 h-4 text-emerald-500" />
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                    (msg.text || isDeleted) && (
                      isEmojiOnly ? (
                        <div className="py-1 select-text text-center">
                          <span
                            className={`inline-block select-text transform transition-transform hover:scale-110 duration-150 filter drop-shadow-sm ${
                              emojiInfo.count === 1
                                ? "text-[52px] sm:text-[60px] leading-tight"
                                : emojiInfo.count === 2
                                ? "text-[40px] sm:text-[46px] leading-tight"
                                : "text-[32px] sm:text-[36px] leading-tight"
                            }`}
                          >
                            {msg.text}
                          </span>
                        </div>
                      ) : (
                        <p className={`text-sm break-words whitespace-pre-wrap leading-relaxed ${isDeleted ? "italic font-normal text-slate-500/80 dark:text-slate-400/80 flex items-center gap-1.5" : ""}`}>
                          {isDeleted && <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0 inline" />}
                          <span>{isDeleted ? "This message was deleted" : msg.text}</span>
                        </p>
                      )
                    ))
                    }

                    {/* Floating Reaction Badge (No Background) */}
                    {!isDeleted && !msg.callInfo && msg.reactions && Object.keys(msg.reactions).length > 0 && (() => {
                      const activeReactions = Object.entries(msg.reactions).filter(([_, uidsMap]) =>
                        Object.values(uidsMap || {}).some(Boolean)
                      );
                      if (activeReactions.length === 0) return null;

                      return (
                        <div
                          className={`absolute -bottom-3 ${isOutgoing ? "left-3" : "right-3"} z-[50] flex items-center gap-1 animate-in zoom-in-75 duration-150 select-none drop-shadow-sm`}
                        >
                          {activeReactions.map(([emoji, uidsMap]) => {
                            const count = Object.values(uidsMap || {}).filter(Boolean).length;
                            const hasReacted = Boolean(uidsMap && uidsMap[currentUser.uid]);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedUser?.uid && msg.id) {
                                    toggleMessageReaction(currentUser.uid, selectedUser.uid, msg.id, emoji);
                                  }
                                }}
                                className={`inline-flex items-center gap-0.5 cursor-pointer hover:scale-125 transition-transform ${
                                  hasReacted ? "scale-110 font-bold" : ""
                                }`}
                              >
                                <span className="text-base leading-none">{emoji}</span>
                                {count > 1 && (
                                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 leading-none">
                                    {count}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}

                    <div className={`flex items-center justify-end gap-1 ${
                      isEmojiOnly
                        ? "mt-0.5 px-1.5 py-0.5 rounded-full bg-black/25 dark:bg-black/40 backdrop-blur-[2px] w-fit ml-auto shadow-sm"
                        : "mt-1"
                    }`}>
                      {!isDeleted && msg.edited && (
                        <span className={`text-[10px] italic mr-1 select-none ${
                          isEmojiOnly ? "text-white/80" : "text-slate-500/80 dark:text-slate-400/80"
                        }`}>
                          edited
                        </span>
                      )}
                      <span className={`text-[10px] ${
                        isEmojiOnly ? "text-white/90 font-medium" : "text-slate-500 dark:text-slate-300"
                      }`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {isOutgoing && !isDeleted && !msg.callInfo && (
                        <span className="inline-flex items-center ml-1">
                          {isPending ? (
                            <Clock className={`w-3.5 h-3.5 animate-pulse ${isEmojiOnly ? "text-white/80" : "text-slate-400"}`} title="Sending when online..." />
                          ) : msg.blocked ? (
                            <Check className={`w-4 h-4 font-bold ${isEmojiOnly ? "text-white/80" : "text-slate-400"}`} title="Sent" />
                          ) : msg.read ? (
                            <CheckCheck className={`w-4 h-4 font-bold ${isEmojiOnly ? "text-sky-400" : "text-sky-500"}`} title="Read" />
                          ) : selectedUserOnline ? (
                            <CheckCheck className={`w-4 h-4 font-bold ${isEmojiOnly ? "text-white/80" : "text-slate-400"}`} title="Delivered" />
                          ) : (
                            <Check className={`w-4 h-4 font-bold ${isEmojiOnly ? "text-white/80" : "text-slate-400"}`} title="Sent" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Replying Message Banner */}
      {replyingToMessage && (
        <div className="shrink-0 bg-rose-50 dark:bg-rose-950/80 px-4 py-2 border-t border-rose-200 dark:border-rose-900 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                Replying to {replyingToMessage.senderName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{replyingToMessage.text}</p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setReplyingToMessage(null)}
            className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Editing Message Banner */}
      {editingMessageId && (
        <div className="bg-rose-50 dark:bg-rose-950/80 px-4 py-2 border-t border-rose-200 dark:border-rose-900 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 min-w-0">
            <Edit2 className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Editing Message</p>
              <p className="text-xs text-muted-foreground truncate">{editingText}</p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setEditingMessageId(null);
              setEditingText("");
              setInputText("");
            }}
            className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Attached Media Draft Banner */}
      {attachedMedia && (
        <div className="shrink-0 bg-rose-50 dark:bg-rose-950/80 px-4 py-2 border-t border-rose-200 dark:border-rose-900 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-3 min-w-0">
            {attachedMedia.mediaType === "image" && attachedMedia.previewUrl ? (
              <img src={attachedMedia.previewUrl} alt="Preview" className="w-10 h-10 object-cover rounded-xl border border-rose-300 dark:border-rose-800 shrink-0" />
            ) : attachedMedia.mediaType === "video" ? (
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Film className="w-5 h-5" />
              </div>
            ) : attachedMedia.mediaType === "audio" ? (
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Music className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 truncate">
                {attachedMedia.mediaName}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {formatFileSize(attachedMedia.mediaSize)} • Ready to send
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setAttachedMedia(null)}
            className="h-7 w-7 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Input Area */}
      {isBlocked ? (
        <div className="shrink-0 bg-[#f0f2f5] dark:bg-slate-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-center gap-3 animate-in fade-in duration-200">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            You blocked this contact.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleToggleBlockUser}
            className="rounded-full text-xs border-rose-500 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 font-bold"
          >
            Unblock
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSendMessage} className="shrink-0 bg-[#f0f2f5] dark:bg-slate-900 px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200/80 dark:border-slate-800 flex items-center gap-2 z-30">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 shrink-0 cursor-pointer transition-colors"
            title="Attach Media or File"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          <Input
            value={inputText}
            onChange={handleInputChange}
            placeholder={attachedMedia ? "Add a caption..." : "Type a message..."}
            className="bg-white dark:bg-slate-800 rounded-full border-none focus-visible:ring-1 focus-visible:ring-rose-500"
          />
          <Button type="submit" size="icon" disabled={!inputText.trim() && !attachedMedia} className="rounded-full bg-rose-500 hover:bg-rose-600 text-white shrink-0 cursor-pointer">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      )}

      {/* Full Image Lightbox Modal */}
      {expandedMediaUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setExpandedMediaUrl(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedMediaUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={expandedMediaUrl}
            alt="Enlarged view"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Context Menu Modal */}
      {menuConfig && selectedUser && (() => {
        const targetMsg = displayedMessages.find((m) => m.id === menuConfig.id);
        const isCallHistory = Boolean(targetMsg?.callInfo);
        return (
          <MessageContextMenu
            messageId={menuConfig.id}
            messageText={menuConfig.text}
            isOwn={menuConfig.isOwn}
            isDeleted={targetMsg?.deletedForEveryone || false}
            isCallHistory={isCallHistory}
            mediaUrl={getMediaUrl(targetMsg?.mediaUrl)}
            mediaName={targetMsg?.mediaName}
            onDeleteForMe={async (msgId) => {
              await deleteMessageForMe(currentUser.uid, selectedUser.uid, msgId);
              setMenuConfig(null);
            }}
            onDeleteForEveryone={async (msgId) => {
              await deleteMessageForEveryone(currentUser.uid, selectedUser.uid, msgId);
              setMenuConfig(null);
            }}
            onEdit={(msgId, text) => {
              setEditingMessageId(msgId);
              setEditingText(text);
              setInputText(text);
              setMenuConfig(null);
            }}
            onReply={(msgId, text) => {
              const msg = displayedMessages.find((m) => m.id === msgId);
              const senderName = msg?.senderId === currentUser.uid ? "You" : selectedUser.name || "Friend";
              setReplyingToMessage({ id: msgId, senderName, text });
              setMenuConfig(null);
            }}
            onReact={(msgId, emoji) => {
              toggleMessageReaction(currentUser.uid, selectedUser.uid, msgId, emoji);
              setMenuConfig(null);
            }}
            onClose={() => setMenuConfig(null)}
          />
        );
      })()}

      {/* Full Emoji Picker Modal */}
      {activeEmojiPickerMsgId && selectedUser && (
        <FullEmojiPicker
          onSelectEmoji={(emoji) => {
            toggleMessageReaction(currentUser.uid, selectedUser.uid, activeEmojiPickerMsgId, emoji);
            setActiveEmojiPickerMsgId(null);
          }}
          onClose={() => setActiveEmojiPickerMsgId(null)}
        />
      )}
    </div>
  );

  return (
    <div className="h-full min-h-0 flex w-full bg-background overflow-hidden">
      {/* Contacts List Column */}
      <div className={`w-full md:w-80 lg:w-96 border-r ${getAccentBorderClass(accentColor)} flex flex-col shrink-0 ${selectedUser ? "hidden md:flex" : "flex"}`}>
        <div className={`p-4 border-b ${getAccentBorderClass(accentColor)}`}>
          <h1 className="text-xl font-bold text-foreground mb-3">Chats</h1>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search contacts..."
              className="pl-9 bg-muted/50 rounded-xl"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {chattedUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center h-full my-8 text-muted-foreground">
                <MessageCircle className={`w-12 h-12 ${getAccentTextClass(accentColor)} mb-3 animate-pulse`} />
                <p className="font-bold text-foreground text-base">No conversations yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Explore people to start messaging!
                </p>
                {onGoToContacts && (
                  <Button
                    onClick={onGoToContacts}
                    className={`mt-4 ${getAccentBgClass(accentColor)} text-white rounded-full text-xs font-bold px-4 py-2 cursor-pointer shadow-md`}
                  >
                    Find People
                  </Button>
                )}
              </div>
            ) : (
              chattedUsers.map((u) => {
                const recent = recentChats[u.uid];
                const lastMsg = recent?.lastMessage;
                const formattedTime = formatRecentTime(recent?.timestamp);

                return (
                  <div key={u.uid} className="relative group">
                    <button
                      type="button"
                      onClick={() => handleChatClick(u)}
                      onMouseDown={() => handleChatTouchStart(u)}
                      onMouseUp={handleChatTouchEndOrCancel}
                      onMouseLeave={handleChatTouchEndOrCancel}
                      onTouchStart={() => handleChatTouchStart(u)}
                      onTouchEnd={handleChatTouchEndOrCancel}
                      onTouchMove={handleChatTouchEndOrCancel}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSelectedUserForAction(u);
                      }}
                      className={`w-full p-3 rounded-2xl flex items-center gap-3 transition-colors select-none text-left cursor-pointer ${
                        selectedUser?.uid === u.uid ? getAccentLightBgClass(accentColor) : "hover:bg-muted/50"
                      }`}
                    >
                      <Avatar className="h-12 w-12 border border-black/10 shrink-0 pointer-events-none">
                        <AvatarFallback className={`bg-white/80 dark:bg-black/30 ${getAccentTextClass(accentColor)} font-bold`}>
                          {String(u.name || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left min-w-0 pointer-events-none">
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <p className="font-semibold text-foreground truncate text-sm">{u.name}</p>
                          {formattedTime && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{formattedTime}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 min-w-0 mt-0.5">
                          <p className="text-xs text-muted-foreground truncate flex-1">
                            {lastMsg || `@${u.username || u.displayName || u.email?.split("@")[0] || u.name || "user"}`}
                          </p>
                          {Boolean(unreadCounts[u.uid]) && (
                            <span className={`shrink-0 ${getAccentBgClass(accentColor)} text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full shadow-sm animate-in zoom-in-75 duration-150`}>
                              {unreadCounts[u.uid] > 99 ? "99+" : unreadCounts[u.uid]}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Desktop hover action trigger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUserForAction(u);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground transition-opacity cursor-pointer shrink-0"
                        title="Chat Options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Active Chat Column */}
      <div className={`flex-1 h-full min-h-0 min-w-0 ${!selectedUser ? "hidden md:flex" : "flex flex-col"}`}>
        {selectedUser ? (
          renderChatRoom()
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-900/50">
            <MessageCircle className="w-16 h-16 text-rose-300 dark:text-rose-900 mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-1">Select a conversation</h2>
            <p className="text-sm text-muted-foreground">Pick a friend from the left list to start messaging</p>
          </div>
        )}
      </div>

      {/* Hold Person Action Modal */}
      {selectedUserForAction && (
        <div
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedUserForAction(null)}
        >
          <div
            className="bg-background border border-border rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <Avatar className="h-12 w-12 border border-black/10 shrink-0">
                <AvatarFallback className={`bg-white/80 dark:bg-black/30 ${getAccentTextClass(accentColor)} font-bold text-lg`}>
                  {String(selectedUserForAction.name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-foreground truncate text-base">
                  {selectedUserForAction.name || "User"}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  @{selectedUserForAction.username || selectedUserForAction.displayName || selectedUserForAction.email?.split("@")[0] || selectedUserForAction.name || "user"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleRemoveChatFromScreen(selectedUserForAction)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-semibold text-sm hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors cursor-pointer text-left"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Remove Chat from Screen</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!currentUser?.uid || !selectedUserForAction.uid) return;
                  try {
                    await clearChatForMe(currentUser.uid, selectedUserForAction.uid);
                    toast.success("Messages cleared for you");
                  } catch (e) {
                    toast.error("Failed to clear messages");
                  } finally {
                    setSelectedUserForAction(null);
                  }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/60 text-foreground font-medium text-sm hover:bg-muted transition-colors cursor-pointer text-left"
              >
                <Sparkles className="w-4 h-4 shrink-0 text-amber-500" />
                <span>Clear Message History</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (!currentUser?.uid || !selectedUserForAction.uid) return;
                  const targetUid = selectedUserForAction.uid;
                  const targetName = selectedUserForAction.name || "user";
                  const currentlyBlocked = Boolean(blockedUsers[targetUid]);
                  try {
                    if (currentlyBlocked) {
                      await unblockUser(currentUser.uid, targetUid);
                      toast.success(`Unblocked ${targetName}`);
                    } else {
                      await blockUser(currentUser.uid, targetUid);
                      toast.success(`Blocked ${targetName}`);
                    }
                  } catch (e) {
                    toast.error("Failed to update block status");
                  } finally {
                    setSelectedUserForAction(null);
                  }
                }}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/60 text-foreground font-medium text-sm hover:bg-muted transition-colors cursor-pointer text-left"
              >
                <Ban className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span>{blockedUsers[selectedUserForAction.uid] ? "Unblock Contact" : "Block Contact"}</span>
              </button>
            </div>

            <Button
              variant="outline"
              onClick={() => setSelectedUserForAction(null)}
              className="w-full rounded-2xl mt-2 font-medium text-xs py-2.5 h-auto cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {/* Contact Profile Modal */}
      <ContactProfileModal
        isOpen={showContactProfile}
        onClose={() => setShowContactProfile(false)}
        contact={activeContact}
        isOnline={Boolean(selectedUserOnline)}
        isBlocked={isBlocked}
        onToggleBlock={handleToggleBlockUser}
        onStartVoiceCall={() => startCall("audio")}
        onClearChat={handleClearChat}
        messages={displayedMessages}
      />
    </div>
  );
}
