import React, { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  X,
  Phone,
  MessageCircle,
  Ban,
  Trash2,
  Lock,
  Copy,
  Check,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { useTheme, getAccentBgClass, getAccentTextClass } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { getMediaUrl } from "@/lib/api";

interface ContactProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: {
    uid: string;
    name?: string;
    username?: string;
    displayName?: string;
    online?: boolean;
    lastSeen?: number;
    bio?: string;
  } | null;
  isOnline?: boolean;
  isBlocked?: boolean;
  onToggleBlock?: () => void;
  onStartVoiceCall?: () => void;
  onClearChat?: () => void;
  messages?: any[];
}

export default function ContactProfileModal({
  isOpen,
  onClose,
  contact,
  isOnline = false,
  isBlocked = false,
  onToggleBlock,
  onStartVoiceCall,
  onClearChat,
  messages = [],
}: ContactProfileModalProps) {
  const { accentColor } = useTheme();
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  if (!isOpen || !contact) return null;

  const displayName = contact.name || contact.displayName || "User";
  const username = contact.username || contact.displayName || "user";
  const customBio = (contact.bio && contact.bio.trim()) ? contact.bio.trim() : "Hey there! I am using ChatsApp.";

  // Extract shared media from current conversation
  const sharedMedia = messages.filter(
    (m) => !m.deletedForEveryone && m.mediaUrl && (m.mediaType?.startsWith("image") || m.mediaUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i))
  );

  const handleCopyUsername = () => {
    if (!username) return;
    navigator.clipboard.writeText(`@${username}`);
    setCopiedUsername(true);
    toast.success("Username copied to clipboard");
    setTimeout(() => setCopiedUsername(false), 2000);
  };

  const handleCall = () => {
    onClose();
    if (onStartVoiceCall) {
      onStartVoiceCall();
    }
  };

  const handleMessage = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="relative w-full h-full md:max-w-md md:h-[90vh] md:max-h-[750px] bg-[#f0f2f5] dark:bg-slate-950 md:rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200/60 dark:border-slate-800">
        
        {/* Top Navigation Bar */}
        <div className="shrink-0 h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200/80 dark:border-slate-800 px-3 flex items-center justify-between z-10">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-0 active:bg-transparent [-webkit-tap-highlight-color:transparent]"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-base text-slate-800 dark:text-slate-100">
            Contact info
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors focus:outline-none focus:ring-0 active:bg-transparent [-webkit-tap-highlight-color:transparent]"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Profile Body */}
        <ScrollArea className="flex-1">
          <div className="space-y-3 pb-8">
            
            {/* Hero Profile Card */}
            <div className="bg-white dark:bg-slate-900 p-6 flex flex-col items-center text-center shadow-sm">
              <Avatar className="w-28 h-28 border-4 border-slate-100 dark:border-slate-800 shadow-md">
                <AvatarFallback className={`${getAccentBgClass(accentColor)} text-white text-4xl font-bold`}>
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <h2 className="mt-3.5 text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight select-text">
                {displayName}
              </h2>

              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground select-text">
                  @{username}
                </span>
                <button
                  onClick={handleCopyUsername}
                  className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors"
                  title="Copy username"
                >
                  {copiedUsername ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Online / Offline Status Badge */}
              <div className="mt-2.5">
                {isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Offline
                  </span>
                )}
              </div>

              {/* Quick Action Buttons Row (WhatsApp Style) */}
              <div className="mt-6 flex items-center justify-center gap-6 w-full max-w-xs">
                {/* Message Button */}
                <button
                  onClick={handleMessage}
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 transition-all active:scale-95 [-webkit-tap-highlight-color:transparent]"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getAccentBgClass(accentColor)} text-white shadow-sm`}>
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    Message
                  </span>
                </button>

                {/* Voice Call Button */}
                <button
                  onClick={handleCall}
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 transition-all active:scale-95 [-webkit-tap-highlight-color:transparent]"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-600 text-white shadow-sm">
                    <Phone className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    Audio
                  </span>
                </button>
              </div>
            </div>

            {/* Custom About / Bio Section */}
            <div className="bg-white dark:bg-slate-900 p-4 shadow-sm border-y border-slate-200/50 dark:border-slate-800/60">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                About
              </span>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed select-text">
                {customBio}
              </p>
            </div>

            {/* Shared Media Section */}
            <div className="bg-white dark:bg-slate-900 p-4 shadow-sm border-y border-slate-200/50 dark:border-slate-800/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> Media, links, and docs
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {sharedMedia.length} {sharedMedia.length === 1 ? "item" : "items"}
                </span>
              </div>

              {sharedMedia.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {sharedMedia.slice(0, 4).map((msg, i) => (
                    <div
                      key={msg.id || i}
                      onClick={() => setSelectedPreviewImage(getMediaUrl(msg.mediaUrl))}
                      className="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity relative group"
                    >
                      <img
                        src={getMediaUrl(msg.mediaUrl)}
                        alt="Shared media"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-1">
                  No media shared in this chat yet.
                </p>
              )}
            </div>

            {/* End-to-End Encryption Information Card */}
            <div className="bg-white dark:bg-slate-900 p-4 shadow-sm border-y border-slate-200/50 dark:border-slate-800/60 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  End-to-end encryption
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-normal">
                  Messages and voice calls are end-to-end encrypted. No one outside of this chat, not even ChatsApp, can read or listen to them.
                </p>
              </div>
            </div>

            {/* Privacy & Management Actions Card */}
            <div className="bg-white dark:bg-slate-900 shadow-sm border-y border-slate-200/50 dark:border-slate-800/60 divide-y divide-slate-100 dark:divide-slate-800/70">
              {/* Block / Unblock Contact */}
              {onToggleBlock && (
                <button
                  onClick={() => {
                    onToggleBlock();
                  }}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 transition-colors focus:outline-none active:bg-transparent [-webkit-tap-highlight-color:transparent]"
                >
                  <Ban className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">
                    {isBlocked ? `Unblock ${displayName}` : `Block ${displayName}`}
                  </span>
                </button>
              )}

              {/* Clear Chat History */}
              {onClearChat && (
                <button
                  onClick={() => {
                    onClose();
                    onClearChat();
                  }}
                  className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 transition-colors focus:outline-none active:bg-transparent [-webkit-tap-highlight-color:transparent]"
                >
                  <Trash2 className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">
                    Clear chat history
                  </span>
                </button>
              )}
            </div>

          </div>
        </ScrollArea>
      </div>

      {/* Full-screen Image Preview Lightbox */}
      {selectedPreviewImage && (
        <div
          onClick={() => setSelectedPreviewImage(null)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <button
            onClick={() => setSelectedPreviewImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={selectedPreviewImage}
            alt="Expanded preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
