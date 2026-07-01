// A symbol's inserted value can be one character or several (a base character
// plus a Unicode variation selector). We key detail-page URLs on the value's
// code points, lowercase hex, joined by "-": e.g. "≤" -> "2264",
// "↔︎" (U+2194 U+FE0E) -> "2194-fe0e". Reversible and URL-safe.

export function valueToSlug(value: string): string {
  return Array.from(value)
    .map((ch) => ch.codePointAt(0)!.toString(16))
    .join("-");
}

export function slugToValue(slug: string): string {
  return slug
    .split("-")
    .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
    .join("");
}
