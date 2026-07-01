// Per-scheme presentation: label, trigger, and a categorical color (a CSS var
// defined in globals.css). Kept free of the heavy symbol dataset so client
// components (badges, filters) can import it without bundling the data.

export const SCHEME_ORDER = [
  "unicode-math",
  "latex",
  "typst",
  "unicode",
  "ascii",
] as const;

export type SchemeId = (typeof SCHEME_ORDER)[number];

export interface SchemeStyle {
  id: SchemeId;
  /** Full label, e.g. for headings. */
  label: string;
  /** Default trigger an editor types before the name ("" = inline, no trigger). */
  trigger: string;
  /** CSS custom property holding this scheme's categorical color. */
  colorVar: `var(--scheme-${SchemeId})`;
}

export const SCHEMES: Record<SchemeId, SchemeStyle> = {
  "unicode-math": {
    id: "unicode-math",
    label: "unicode-math",
    trigger: "\\",
    colorVar: "var(--scheme-unicode-math)",
  },
  latex: {
    id: "latex",
    label: "LaTeX",
    trigger: "\\",
    colorVar: "var(--scheme-latex)",
  },
  typst: {
    id: "typst",
    label: "Typst",
    trigger: "\\",
    colorVar: "var(--scheme-typst)",
  },
  unicode: {
    id: "unicode",
    label: "Unicode",
    trigger: "U+",
    colorVar: "var(--scheme-unicode)",
  },
  ascii: {
    id: "ascii",
    label: "ASCII",
    trigger: "",
    colorVar: "var(--scheme-ascii)",
  },
};

export function schemeStyle(id: string): SchemeStyle | undefined {
  return SCHEMES[id as SchemeId];
}

/** Rank a scheme by SCHEME_ORDER (unknown schemes sort last). */
export function schemeRank(id: string): number {
  const i = (SCHEME_ORDER as readonly string[]).indexOf(id);
  return i === -1 ? SCHEME_ORDER.length : i;
}
