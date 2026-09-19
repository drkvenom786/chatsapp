import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-white/80 px-3 text-sm outline-none transition-smooth placeholder:text-muted-foreground focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 dark:bg-white/5",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
