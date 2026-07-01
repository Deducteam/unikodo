import * as React from "react";

import { cn } from "@/lib/utils";
import { GLYPH_FONT_STACK } from "@/components/glyph";

// The unikodo logo: 𝕌 (U+1D54C, MATHEMATICAL DOUBLE-STRUCK CAPITAL U). Rendered
// through the same broad math-font stack the rest of the site uses for exotic
// glyphs, so it resolves wherever ℝ and ≤ do. Colour is inherited (monochrome
// by default); size via a text-* class on `className`.
export function UnikodoMark({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn("inline-block select-none leading-none", className)}
      style={{ fontFamily: GLYPH_FONT_STACK, ...style }}
      {...props}
    >
      𝕌
    </span>
  );
}
