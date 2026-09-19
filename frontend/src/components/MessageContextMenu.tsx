import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Trash2, Edit2, Reply, Plus, X, Download } from "lucide-react";
import { toast } from "sonner";
import FullEmojiPicker from "@/components/FullEmojiPicker";
import { getMediaUrl } from "@/lib/api";
import {
  useTheme,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
  getAccentBgClass,
} from "@/contexts/ThemeContext";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageContextMenuProps {
  messageId: string;
  isCallHistory?: boolean;
  messageText: string;
  isOwn: boolean;
  isDeleted?: boolean;
  mediaUrl?: string;
  mediaName?: string;
  onDeleteForMe: (messageId: string) => Promise<void>;
  onDeleteForEveryone: (messageId: string) => Promise<void>;
  onEdit?: (messageId: string, text: string) => void;
  onReply?: (messageId: string, text: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onClose: () => void;
}

export default function MessageContextMenu({
  messageId,
  messageText,
  isOwn,
  isDeleted = false,
  isCallHistory = false,
  mediaUrl,
  mediaName,
  onDeleteForMe,
  onDeleteForEveryone,
  onEdit,
  onReply,
  onReact,
  onClose,
}: MessageContextMenuProps) {
  const { accentColor } = useTheme();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"me" | "everyone" | null>(null);
  const [showFullPicker, setShowFullPicker] = useState(false);

  const handleSaveToLocal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (mediaUrl) {
      const a = document.createElement("a");
      a.href = getMediaUrl(mediaUrl);
      a.download = mediaName || "download";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    onClose();
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(messageText);
    } catch {
      toast.error("Failed to copy message");
    }
    onClose();
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onEdit) {
      onEdit(messageId, messageText);
    }
    onClose();
  };

  const handleExecuteDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmMode || isDeleting) return;

    setIsDeleting(true);
    try {
      if (confirmMode === "me") {
        await onDeleteForMe(messageId);
      } else {
        await onDeleteForEveryone(messageId);
      }
      onClose();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete message");
      setIsDeleting(false);
      setConfirmMode(null);
    }
  };

  if (showFullPicker && onReact) {
    return (
      <FullEmojiPicker
        onSelectEmoji={(emoji) => {
          onReact(messageId, emoji);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-xs glass-lg rounded-3xl p-4 shadow-2xl border ${getAccentBorderClass(accentColor)} bg-white/95 dark:bg-slate-900/95 overflow-hidden animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {!confirmMode ? (
          <div className="space-y-1">
            {/* Quick Emoji Bar */}
            {!isDeleted && !isCallHistory && onReact && (
              <div className={`${getAccentLightBgClass(accentColor)} p-2.5 rounded-2xl mb-3 border border-black/5 dark:border-white/10 shadow-inner`}>
                <div className="flex items-center justify-around gap-1">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReact(messageId, emoji);
                        onClose();
                      }}
                      className="text-2xl hover:scale-130 active:scale-95 transition-transform p-1 cursor-pointer leading-none"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFullPicker(true);
                    }}
                    className={`w-7 h-7 rounded-full ${getAccentLightBgClass(accentColor)} flex items-center justify-center ${getAccentTextClass(accentColor)} transition-transform active:scale-95 cursor-pointer shrink-0 border border-black/5 dark:border-white/10`}
                    title="All Emojis"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-3 py-1 border-b border-black/5 dark:border-white/10 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{isCallHistory ? "Call Options" : "Message Options"}</span>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Reply Action */}
            {!isDeleted && !isCallHistory && onReply && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(messageId, messageText);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:${getAccentLightBgClass(accentColor)} transition-colors text-left cursor-pointer`}
              >
                <Reply className={`w-4 h-4 ${getAccentTextClass(accentColor)}`} />
                <span>Reply to Message</span>
              </button>
            )}

            {/* Save / Download Media Action */}
            {!isDeleted && !isCallHistory && mediaUrl && (
              <button
                type="button"
                onClick={handleSaveToLocal}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:${getAccentLightBgClass(accentColor)} transition-colors text-left cursor-pointer`}
              >
                <Download className={`w-4 h-4 ${getAccentTextClass(accentColor)}`} />
                <span>Save to Device</span>
              </button>
            )}

            {/* Copy Action */}
            {!isDeleted && !isCallHistory && (
              <button
                type="button"
                onClick={handleCopy}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:${getAccentLightBgClass(accentColor)} transition-colors text-left cursor-pointer`}
              >
                <Copy className={`w-4 h-4 ${getAccentTextClass(accentColor)}`} />
                <span>Copy Message</span>
              </button>
            )}

            {/* Edit Action (if own message) */}
            {isOwn && !isDeleted && !isCallHistory && onEdit && (
              <button
                type="button"
                onClick={handleEdit}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:${getAccentLightBgClass(accentColor)} transition-colors text-left cursor-pointer`}
              >
                <Edit2 className={`w-4 h-4 ${getAccentTextClass(accentColor)}`} />
                <span>Edit Message</span>
              </button>
            )}

            {/* Delete for Me */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmMode("me");
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors text-left cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isCallHistory ? "Delete Call Log" : "Delete for Me"}</span>
            </button>

            {/* Delete for Everyone (if own message) */}
            {isOwn && !isDeleted && !isCallHistory && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmMode("everyone");
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors text-left cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete for Everyone</span>
              </button>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-4">
            <h3 className="font-bold text-base text-foreground">Confirm Delete</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {confirmMode === "me"
                ? isCallHistory ? "This will remove this call log from your chat history." : "This will remove the message from your device."
                : "This will remove the message for all participants in this chat."}
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmMode(null);
                }}
                className="flex-1 rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isDeleting}
                onClick={handleExecuteDelete}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold shadow-md cursor-pointer"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
