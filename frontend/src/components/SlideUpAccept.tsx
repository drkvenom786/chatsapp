import React, { useState, useRef } from "react";
import { Phone, Video, ChevronsUp } from "lucide-react";

interface SlideUpAcceptProps {
  onAccept: () => void;
  callType: "audio" | "video";
}

export default function SlideUpAccept({ onAccept, callType }: SlideUpAcceptProps) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const hasAccepted = useRef(false);

  const MAX_DRAG = 90;
  const THRESHOLD = 65;

  const handleStart = (clientY: number) => {
    startY.current = clientY;
    setIsDragging(true);
    hasAccepted.current = false;
  };

  const handleMove = (clientY: number) => {
    if (!isDragging || hasAccepted.current) return;
    const delta = startY.current - clientY;
    const clamped = Math.max(0, Math.min(MAX_DRAG, delta));
    setDragY(clamped);

    if (clamped >= THRESHOLD) {
      hasAccepted.current = true;
      setIsDragging(false);
      setDragY(0);
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([40, 30, 40]);
        }
      } catch (e) {}
      onAccept();
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!hasAccepted.current) {
      if (dragY >= THRESHOLD) {
        hasAccepted.current = true;
        setDragY(0);
        try {
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([40, 30, 40]);
          }
        } catch (e) {}
        onAccept();
      } else {
        setDragY(0);
      }
    }
  };

  const handleClick = () => {
    if (!hasAccepted.current && dragY < THRESHOLD) {
      // Guide user with small bounce if tapped without sliding
      setDragY(35);
      setTimeout(() => setDragY(0), 280);
    }
  };

  return (
    <div
      className="relative w-20 h-44 rounded-full bg-slate-900/70 dark:bg-slate-950/80 backdrop-blur-xl border border-white/20 p-2 flex flex-col items-center justify-between shadow-2xl touch-none select-none overflow-hidden"
      onTouchStart={(e) => handleStart(e.touches[0].clientY)}
      onTouchMove={(e) => handleMove(e.touches[0].clientY)}
      onTouchEnd={handleEnd}
      onMouseDown={(e) => handleStart(e.clientY)}
      onMouseMove={(e) => {
        if (e.buttons === 1) handleMove(e.clientY);
      }}
      onMouseUp={handleEnd}
      onClick={handleClick}
    >
      {/* Background glow filling upward as you slide */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500/40 via-emerald-500/20 to-transparent pointer-events-none transition-all duration-75"
        style={{ height: `${Math.min(100, (dragY / THRESHOLD) * 100)}%` }}
      />

      {/* Slide Up Prompt & Animated Chevrons */}
      <div className="flex flex-col items-center gap-1 pt-1.5 pointer-events-none z-10">
        <ChevronsUp className="w-5 h-5 text-emerald-400 animate-bounce" />
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 text-center leading-tight">
          Slide Up
        </span>
      </div>

      {/* Draggable Emerald Call Button */}
      <div
        style={{
          transform: `translateY(-${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
        className="w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white shadow-[0_0_25px_rgba(16,185,129,0.8)] flex items-center justify-center cursor-grab active:cursor-grabbing z-20 transition-shadow active:scale-105"
      >
        {callType === "video" ? (
          <Video className="w-7 h-7 text-white" />
        ) : (
          <Phone className="w-7 h-7 text-white" />
        )}
      </div>
    </div>
  );
}
