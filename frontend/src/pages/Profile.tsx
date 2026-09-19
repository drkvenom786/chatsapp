import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { updateUserProfile } from "@/lib/firebase";
import { toast } from "sonner";
import { Mail, Phone, Calendar, Edit2, Share2 } from "lucide-react";
import {
  useTheme,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
  getAccentBgClass,
} from "@/contexts/ThemeContext";

interface ProfileProps {
  currentUser: any;
}

export default function Profile({ currentUser }: ProfileProps) {
  const { accentColor } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentUser?.displayName || "");
  const [saving, setSaving] = useState(false);
  const joinDate = new Date(currentUser?.metadata?.creationTime || Date.now());
  const formattedDate = joinDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile(currentUser.uid, name.trim());
      toast.success("Profile updated");
      setEditing(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: "Chats Profile",
      text: `Message ${name || currentUser?.displayName || "me"} on ChatsApp`,
      url: window.location.origin,
    };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }

    await navigator.clipboard.writeText(shareData.url);
    toast.success("Profile link copied");
  };

  return (
    <div className={`flex flex-col h-full bg-background max-w-4xl mx-auto w-full border-x ${getAccentBorderClass(accentColor)}`}>
      {/* Header */}
      <div className="glass-sm border-b border-border p-4">
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
      </div>

      {/* Profile Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 pb-24">
          {/* Profile Header Card */}
          <div className="glass-lg rounded-3xl p-6 text-center">
            <Avatar className="h-24 w-24 border-4 border-black/10 mx-auto mb-4">
              <AvatarFallback className={`bg-white/80 dark:bg-black/30 ${getAccentTextClass(accentColor)} text-3xl font-bold`}>
                {currentUser?.displayName?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            {editing ? (
              <div className="mx-auto mb-3 max-w-xs space-y-3">
                <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                <div className="flex gap-2">
                  <Button className={`flex-1 ${getAccentBgClass(accentColor)} text-white`} onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 group">
                <h2 className="text-2xl font-bold text-foreground">
                  {currentUser?.displayName}
                </h2>
                <button 
                  onClick={() => setEditing(true)}
                  className={`p-1.5 rounded-full hover:${getAccentLightBgClass(accentColor)} ${getAccentTextClass(accentColor)} transition-colors cursor-pointer`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Contact Information */}
          <div className="glass-sm rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
              Account Details
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/20 dark:bg-white/5">
                <Mail className={`w-5 h-5 ${getAccentTextClass(accentColor)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Username</p>
                  <p className="text-sm font-medium truncate">
                    @{currentUser?.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || "user"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/20 dark:bg-white/5">
                <Phone className={`w-5 h-5 ${getAccentTextClass(accentColor)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-medium">Active</p>
                </div>
              </div>
            </div>
          </div>

          {/* Account Information */}
          <div className="glass-sm rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
              History
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/20 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <Calendar className={`w-5 h-5 ${getAccentTextClass(accentColor)}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">Member Since</p>
                    <p className="text-sm font-medium">{formattedDate}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleShare}
              className={`w-full border-black/10 dark:border-white/10 hover:${getAccentLightBgClass(accentColor)} font-semibold h-11 rounded-xl transition-smooth flex items-center justify-center gap-2 cursor-pointer`}
            >
              <Share2 className="w-4 h-4" />
              Share Profile
            </Button>
          </div>

          {/* Footer */}
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">
              Your profile is visible to your contacts
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
