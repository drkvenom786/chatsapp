import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-smooth disabled:pointer-events-none disabled:opacity-55",
          variant === "default" && "bg-rose-500 text-white hover:bg-rose-600 shadow-sm shadow-rose-200 dark:shadow-none",
          variant === "outline" && "border border-border bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
          variant === "ghost" && "bg-transparent hover:bg-black/5 dark:hover:bg-white/10",
          size === "default" && "h-10 px-4 py-2",
          size === "icon" && "h-10 w-10 p-0",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
