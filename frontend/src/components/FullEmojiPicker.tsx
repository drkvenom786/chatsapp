// Version 1.0.6 - Clean Emojis with Dynamic Theme Support
import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import {
  useTheme,
  getAccentTextClass,
  getAccentLightBgClass,
  getAccentBorderClass,
  getAccentRingClass,
} from "@/contexts/ThemeContext";

interface FullEmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥹", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍",
      "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩",
      "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭",
      "😮‍💨", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🫣", "🤗",
      "🫡", "🤔", "🤭", "🤫", "🤥", "😶", "😶‍🌫️", "😐", "😑", "😬", "🫠", "🙄", "😯", "😦", "😧", "😮",
      "😲", "🥱", "😴", "🤤", "😪", "😵", "😵‍💫", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑",
      "🤠", "😈", "👿", "👹", "👺", "🤡", "💩", "👻", "💀", "☠️", "👽", "👾", "🤖", "🎃"
    ]
  },
  {
    name: "Gestures",
    icon: "👋",
    emojis: [
      "👋", "🤚", "🖐", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉",
      "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝",
      "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀",
      "👁", "👅", "👄", "🫦", "👶", "🧒", "👦", "👧", "🧑", "👨", "👩", "🧓", "👴", "👵"
    ]
  },
  {
    name: "Hearts & Symbols",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈️",
      "♉️", "♊️", "♋️", "♌️", "♍️", "♎️", "♏️", "♐️", "♑️", "♒️", "♓️", "🔥", "💥", "✨", "🌟", "⭐️",
      "⚡️", "💥", "💯", "💢", "♨️", "🛑", "⛔️", "⭕️", "❌", "❓", "❗", "❕", "❔", "⚠️", "👑", "💎"
    ]
  },
  {
    name: "Food & Drinks",
    icon: "🍔",
    emojis: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥",
      "🥝", "🍅", "🥑", "🥦", "🥒", "🌶", "🌽", "🥕", "🥐", "🍞", "🥖", "🥨", "🧀", "🍳", "🥞", "🧇",
      "🥓", "🥩", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🌮", "🌯", "🥗", "🥘", "🍝", "🍜",
      "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧",
      "🍫", "🍬", "🍭", "🍡", "🍿", "☕️", "🍵", "🧃", "🥤", "🧋", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸"
    ]
  },
  {
    name: "Objects & Travel",
    icon: "🚀",
    emojis: [
      "📱", "💻", "⌨️", "🖥", "🕹", "📷", "📹", "📺", "📻", "🎙", "🔔", "⏰", "⏱", "💡", "🔦", "📖",
      "📚", "🏷", "✉️", "📦", "📫", "✏️", "✒️", "📝", "📁", "📅", "📊", "📌", "📎", "✂️", "🔒", "🔓",
      "🔑", "🔨", "🪓", "💣", "🛡", "⚙️", "🔧", "🚗", "🚕", "🚙", "🚌", "🏎", "🚑", "🚒", "🚲", "🛵",
      "🏍", "🚨", "✈️", "🚀", "🛸", "🚁", "⛵️", "🚢", "🗺", "⛵️", "🏝", "🌋", "🏔", "🏟", "🎡", "🎢"
    ]
  }
];

export default function FullEmojiPicker({ onSelectEmoji, onClose }: FullEmojiPickerProps) {
  const { accentColor } = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return EMOJI_CATEGORIES[activeTab].emojis;
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    return all.filter((e) => e.includes(search.trim()));
  }, [search, activeTab]);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm glass-lg rounded-3xl p-4 shadow-2xl border ${getAccentBorderClass(accentColor)} bg-white/95 dark:bg-slate-900/95 flex flex-col gap-3 animate-in zoom-in-95 duration-150 max-h-[480px]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
          <h3 className="font-bold text-sm text-foreground">Choose Reaction Emoji</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all emojis..."
            className={`w-full pl-9 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs focus:outline-none focus:ring-1 ${getAccentRingClass(accentColor)}`}
          />
        </div>

        {/* Category Tabs */}
        {!search.trim() && (
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`text-xl p-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === idx
                    ? `${getAccentLightBgClass(accentColor)} scale-110 shadow-sm border border-black/5 dark:border-white/10`
                    : "opacity-60 hover:opacity-100"
                }`}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji Grid */}
        <div className="grid grid-cols-7 gap-1 overflow-y-auto p-1 max-h-64 flex-1">
          {filteredEmojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              type="button"
              onClick={() => {
                onSelectEmoji(emoji);
                onClose();
              }}
              className={`text-2xl hover:scale-130 active:scale-95 transition-transform p-1.5 flex items-center justify-center rounded-xl hover:${getAccentLightBgClass(accentColor)} cursor-pointer leading-none`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
