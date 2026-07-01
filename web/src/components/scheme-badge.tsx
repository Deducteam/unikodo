import { cn } from "@/lib/utils";
import { schemeStyle } from "@/lib/schemes";

// A scheme chip: a flat categorical color dot + the scheme's label. Client-safe
// — pulls only the lightweight scheme metadata, never the symbol dataset. The
// dots are flat swatches (no glow) so they read as quiet wayfinding, not LEDs.
export function SchemeBadge({
  scheme,
  withLabel = true,
  className,
}: {
  scheme: string;
  withLabel?: boolean;
  className?: string;
}) {
  const style = schemeStyle(scheme);
  const color = style?.colorVar ?? "var(--scheme-unicode)";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-wire-subtle bg-overlay px-2 py-0.5 text-[11px] tracking-[0.04em] text-ink-secondary",
        className,
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full opacity-80"
        style={{ background: color }}
      />
      {withLabel && (style?.label ?? scheme)}
    </span>
  );
}
