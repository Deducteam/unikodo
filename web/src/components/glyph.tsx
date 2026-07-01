import * as React from "react";

// A broad math/symbol font stack so exotic glyphs render well, falling back to
// the UI's JetBrains Mono and finally a generic serif.
export const GLYPH_FONT_STACK =
  '"STIX Two Math","Cambria Math","Latin Modern Math","Asana Math","TeX Gyre Pagella Math","Noto Sans Math","Noto Sans Symbols2","Noto Sans Symbols","Segoe UI Symbol",var(--font-jetbrains-mono),serif';

// Make invisible / combining code points legible: whitespace shows as ␣, and a
// lone combining mark is placed on a dotted circle (◌) so it has a base to
// attach to. Copy actions always use the raw value, never this display form.
export function toDisplayGlyph(value: string): string {
  if (!value) return value;
  if (/^\s+$/u.test(value)) return "␣";
  const first = Array.from(value)[0];
  if (/^\p{M}$/u.test(first)) return "◌" + value;
  return value;
}

export function Glyph({
  value,
  raw = false,
  className,
  style,
  ...props
}: {
  value: string;
  /** Render the literal value without the ␣/◌ legibility transform. */
  raw?: boolean;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={className}
      style={{ fontFamily: GLYPH_FONT_STACK, lineHeight: 1, ...style }}
      {...props}
    >
      {raw ? value : toDisplayGlyph(value)}
    </span>
  );
}
