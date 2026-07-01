import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "accentSoft";
type ButtonSize = "sm" | "default" | "lg" | "icon";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium " +
  "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:shrink-0 cursor-pointer";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-brand-200",
  outline:
    "border border-wire bg-transparent text-ink hover:border-wire-bright hover:bg-elevated",
  secondary: "bg-active text-ink hover:bg-elevated",
  ghost: "bg-transparent text-ink-secondary hover:bg-elevated hover:text-ink",
  destructive: "bg-destructive text-[#1a0808] hover:bg-red-200",
  accentSoft:
    "border border-[var(--andromeda-accent-500)] bg-[var(--andromeda-accent-alpha)] text-brand-100 hover:bg-[rgba(255,255,255,0.16)]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  default: "h-9 px-4 text-[13px]",
  lg: "h-11 px-6 text-sm",
  icon: "size-9",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  ),
);
Button.displayName = "Button";
