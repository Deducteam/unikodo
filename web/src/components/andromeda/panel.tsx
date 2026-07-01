import * as React from "react";

import { cn } from "@/lib/utils";
import { CornerMarkers } from "@/components/andromeda/corner-markers";

type PanelVariant = "default" | "glow" | "inset";

const VARIANTS: Record<PanelVariant, string> = {
  default: "bg-card border-wire",
  glow: "border-wire [background-image:var(--andromeda-gradient-accent-sweep)]",
  inset: "bg-overlay border-wire-subtle",
};

export function Panel({
  variant = "default",
  markers = false,
  className,
  children,
  ...props
}: {
  variant?: PanelVariant;
  markers?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative rounded-sm border", VARIANTS[variant], className)}
      {...props}
    >
      {markers && <CornerMarkers />}
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  children,
  className,
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 border-b border-wire px-4 py-2",
        className,
      )}
    >
      {title ? <span className="label-caps">{title}</span> : <span />}
      {children}
    </div>
  );
}
