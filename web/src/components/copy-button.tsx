"use client";

import * as React from "react";
import { Check, Copy } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label,
  className,
  iconSize = 14,
}: {
  value: string;
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function copy() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1300);
    });
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-wire bg-transparent px-2 py-1 text-[11px] tracking-wide text-ink-muted transition-colors hover:border-wire-bright hover:bg-elevated hover:text-ink cursor-pointer",
        copied && "border-[var(--andromeda-accent-500)] text-brand-200",
        className,
      )}
    >
      {copied ? (
        <Check size={iconSize} weight="bold" />
      ) : (
        <Copy size={iconSize} />
      )}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
