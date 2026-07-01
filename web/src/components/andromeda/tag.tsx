import * as React from "react";

import { cn } from "@/lib/utils";

type TagTone = "default" | "accent" | "outline" | "orange";

const TONES: Record<TagTone, string> = {
  default: "border-wire-subtle bg-overlay text-ink-secondary",
  accent:
    "border-[var(--andromeda-accent-500)] bg-[var(--andromeda-accent-alpha)] text-brand-100",
  outline: "border-wire bg-transparent text-ink-muted",
  orange:
    "border-[var(--andromeda-orange-500)] bg-[var(--andromeda-orange-alpha)] text-orange-100",
};

export function Tag({
  tone = "default",
  className,
  children,
  ...props
}: {
  tone?: TagTone;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] tracking-[0.04em]",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
