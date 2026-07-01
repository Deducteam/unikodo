import Link from "next/link";

import { cn } from "@/lib/utils";
import { Glyph } from "@/components/glyph";
import { CornerMarkers } from "@/components/andromeda/corner-markers";

// A square symbol tile that links to the character's detail page. Used by the
// "related symbols" grid. Takes plain primitives so both server (CharacterEntry)
// and client (SearchEntry) callers can render it.
export function GlyphTile({
  slug,
  value,
  label,
  usv,
  className,
}: {
  slug: string;
  value: string;
  label?: string;
  usv?: string | null;
  className?: string;
}) {
  return (
    <Link
      href={`/symbol/${slug}`}
      title={label ? `${value}  ${label}` : value}
      className={cn(
        "group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border border-wire-subtle bg-card p-2 transition-colors hover:border-wire-bright hover:bg-elevated",
        className,
      )}
    >
      <span className="pointer-events-none absolute opacity-0 transition-opacity group-hover:opacity-100">
        <CornerMarkers className="border-[var(--andromeda-accent-300)]" />
      </span>

      <Glyph
        value={value}
        className="text-[26px] text-ink transition-transform duration-150 group-hover:scale-110 group-hover:text-brand-100"
      />

      {label && (
        <span className="line-clamp-1 max-w-full px-1 text-center text-[10px] leading-tight text-ink-muted group-hover:text-ink-secondary">
          {label}
        </span>
      )}

      {usv && (
        <span className="absolute bottom-1 left-1.5 text-[8px] tabular-nums text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
          {usv}
        </span>
      )}
    </Link>
  );
}
