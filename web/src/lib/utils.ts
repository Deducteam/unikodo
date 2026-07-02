import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class merger: clsx for conditionals, tailwind-merge for conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A glyph's canonical label: its Unicode code point(s), from the index slug
 * (hex code points joined by "-"). "2192" → "U+2192"; multi-code-point glyphs
 * (e.g. a base + combining mark) render each, space-separated.
 */
export function codePoints(slug: string): string {
  return slug
    .split("-")
    .map((h) => "U+" + h.toUpperCase().padStart(4, "0"))
    .join(" ");
}
