"use client";

import * as React from "react";
import Link from "next/link";
import { MagnifyingGlass, X } from "@phosphor-icons/react";

import { cn, codePoints } from "@/lib/utils";
import { loadSearchIndex, searchEntries, type SearchEntry } from "@/lib/search";
import { FEATURED_GLYPHS } from "@/lib/featured";
import { Glyph } from "@/components/glyph";
import { CornerMarkers } from "@/components/andromeda/corner-markers";
import { PreviewPanel } from "@/components/browse/preview-panel";

const PAGE = 240;

// Curated taxonomy — tags computed at build time (see build-search-index.mjs),
// a genuine property of the symbol, not the scheme that names it. A flat set of
// always-visible base categories; selecting "Alphanumeric" reveals the letter
// Script/Case/Style axes and "Shapes" a geometric Kind axis (both animated)
// beneath the pill row.
const BASE_CATS = [
  "Alphanumeric", "Arrows", "Relations", "Operators", "Binders",
  "Brackets", "Shapes", "Punctuation", "Miscellaneous",
];

// Shared ?cat= links minted under the previous taxonomy keep working. Retired
// categories with no single successor ("Set & Logic", "Accents") fall through
// to no category at all.
const LEGACY_CATS: Record<string, string> = {
  "Alphabetic": "Alphanumeric",
  "Big operators": "Binders",
  "Binary ops": "Operators",
  "Delimiters": "Brackets",
  "Ordinary": "Miscellaneous",
};

// Letter script codes → display label + a stable display order. Single-select:
// a letter belongs to exactly one script.
const SCRIPT_LABELS: Record<string, string> = {
  Latin: "Latin", Greek: "Greek", Hebrew: "Hebrew", Digit: "Numerals",
};
const SCRIPT_ORDER = Object.keys(SCRIPT_LABELS);

// Letter styles decomposed into primitive, composable tags. The dataset stores
// one combined code per glyph (bfit = bold italic, itsans = italic sans, …); the
// browser exposes the primitives and AND-combines a multi-selection, so
// "Bold Italic" is Bold + Italic rather than its own pill. "Upright" is the slope
// axis for the *roman* letters only (serif/sans): up = not italic. The distinct
// alphabets (Double-struck, Fraktur, Script, Mono) are NOT upright — pick them by
// their own chip. Fraktur & Script keep a bold variant (bffrak/bfscr), so bold
// blackletter/script reads as Bold + Fraktur/Script, never as Upright.
const STYLE_TAGS: Record<string, string[]> = {
  up: ["up"], it: ["it"], bf: ["bf", "up"], bfit: ["bf", "it"],
  sans: ["sans", "up"], itsans: ["sans", "it"], bfsans: ["sans", "bf", "up"],
  bfitsans: ["sans", "bf", "it"],
  tt: ["tt"], bb: ["bb"], frak: ["frak"], scr: ["scr"],
  bffrak: ["frak", "bf"], bfscr: ["scr", "bf"],
};
const STYLE_FACETS: [string, string][] = [
  ["up", "Upright"], ["it", "Italic"], ["bf", "Bold"], ["sans", "Sans"],
  ["tt", "Mono"], ["bb", "Double-struck"], ["frak", "Fraktur"], ["scr", "Script"],
];

// Letter case axis — single-select (a glyph is one or the other, or caseless).
const CASE_LABELS: Record<string, string> = { u: "Upper", l: "Lower" };
const CASE_ORDER = Object.keys(CASE_LABELS);

// Shape kind axis — single-select, revealed when "Shapes" is picked. The `sk`
// codes are already display labels, so the map is an identity (keeps RefineFacet's
// [code, count] + labels shape).
const SHAPE_KIND_LABELS: Record<string, string> = {
  Ellipses: "Ellipses", Triangles: "Triangles",
  Quadrilaterals: "Quadrilaterals", Other: "Other",
};
const SHAPE_KIND_ORDER = Object.keys(SHAPE_KIND_LABELS);
const styleTags = (st: string | null) => (st ? STYLE_TAGS[st] ?? [] : []);
const hasStyles = (st: string | null, tags: string[]) => {
  const owned = styleTags(st);
  return tags.every((t) => owned.includes(t));
};

// Lead the default (unfiltered) grid with the curated showcase glyphs, in their
// curated order, then everything else in its existing (code-point) order. Keeps
// the first screen — and the preview it seeds — on the math unikodo is for.
function featuredFirst(list: SearchEntry[]): SearchEntry[] {
  const rank = new Map(FEATURED_GLYPHS.map((g, i) => [g, i]));
  const featured: SearchEntry[] = [];
  const rest: SearchEntry[] = [];
  for (const e of list) (rank.has(e.v) ? featured : rest).push(e);
  if (!featured.length) return list;
  featured.sort((a, b) => rank.get(a.v)! - rank.get(b.v)!);
  return [...featured, ...rest];
}

const count = <T,>(items: T[], key: (t: T) => string | null) => {
  const c: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    if (k) c[k] = (c[k] ?? 0) + 1;
  }
  return c;
};

export function Browser({
  initialQuery = "",
  initialCategory = "",
}: {
  initialQuery?: string;
  initialCategory?: string;
}) {
  const [index, setIndex] = React.useState<SearchEntry[] | null>(null);
  const [query, setQuery] = React.useState(initialQuery);
  const [category, setCategory] = React.useState(() => {
    const cat = LEGACY_CATS[initialCategory] ?? initialCategory;
    return BASE_CATS.includes(cat) ? cat : "";
  });
  const [script, setScript] = React.useState(""); // single-select letter script
  const [styles, setStyles] = React.useState<string[]>([]); // multi-select style
  const [caseSel, setCaseSel] = React.useState(""); // single-select letter case
  const [shapeKind, setShapeKind] = React.useState(""); // single-select shape kind
  const [visible, setVisible] = React.useState(PAGE);
  const [focused, setFocused] = React.useState<SearchEntry | null>(null);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    loadSearchIndex().then(setIndex);
  }, []);

  const letterMode = category === "Alphanumeric";
  const shapeMode = category === "Shapes";

  // Switch the base category, dropping the per-category refinements — they belong
  // to the previous category's context.
  const selectCategory = React.useCallback((c: string) => {
    setCategory((cur) => (cur === c ? "" : c));
    setScript("");
    setStyles([]);
    setCaseSel("");
    setShapeKind("");
  }, []);

  // Toggle one primitive style tag in the multi-selection.
  const toggleStyle = React.useCallback((code: string) => {
    setStyles((cur) =>
      cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
    );
  }, []);

  // ASCII characters are part of the catalogue by default — no toggle.
  const base = React.useMemo(() => index ?? [], [index]);

  const categoryCounts = React.useMemo(
    () => count(base.flatMap((e) => e.ct), (t) => t),
    [base],
  );

  // The active category narrows the universe the refine row + grid work over.
  const inCategory = React.useMemo(
    () => (category ? base.filter((e) => e.ct.includes(category)) : base),
    [base, category],
  );

  // Letter facets, scoped so their counts stay honest. Each axis excludes its
  // own selection (standard faceted search) so counts reflect the other picks.
  const refine = React.useMemo(() => {
    if (!letterMode) {
      return {
        styles: [] as { code: string; label: string; n: number }[],
        scripts: [] as [string, number][],
        cases: [] as [string, number][],
      };
    }
    const okScript = (e: SearchEntry) => !script || e.sr === script;
    const okStyles = (e: SearchEntry) => hasStyles(e.st, styles);
    const okCase = (e: SearchEntry) => !caseSel || e.cs === caseSel;

    // Every axis's counts hold the *other* two axes fixed (faceted search), and
    // list all their chips — 0-count ones render greyed, never removed, so chips
    // never shift position as the other axes narrow things.
    const forStyle = inCategory.filter((e) => okScript(e) && okCase(e));
    const styleOpts = STYLE_FACETS.map(([code, label]) => {
      const others = styles.filter((c) => c !== code);
      const n = forStyle.filter((e) => hasStyles(e.st, [...others, code])).length;
      return { code, label, n };
    });
    const forScript = inCategory.filter((e) => okStyles(e) && okCase(e));
    const scriptCounts = count(forScript, (e) => e.sr);
    const forCase = inCategory.filter((e) => okScript(e) && okStyles(e));
    const caseCounts = count(forCase, (e) => e.cs);
    return {
      styles: styleOpts,
      scripts: SCRIPT_ORDER.map((k) => [k, scriptCounts[k] ?? 0] as [string, number]),
      cases: CASE_ORDER.map((k) => [k, caseCounts[k] ?? 0] as [string, number]),
    };
  }, [inCategory, letterMode, script, styles, caseSel]);

  // Shape kinds — a single axis, so no cross-faceting: just count each geometric
  // family within the Shapes category. Every kind stays listed; empty ones grey.
  const shapeKindOpts = React.useMemo(() => {
    if (!shapeMode) return [] as [string, number][];
    const counts = count(inCategory, (e) => e.sk);
    return SHAPE_KIND_ORDER.map((k) => [k, counts[k] ?? 0] as [string, number]);
  }, [inCategory, shapeMode]);

  const filtered = React.useMemo(() => {
    let list = inCategory;
    if (letterMode) {
      if (script) list = list.filter((e) => e.sr === script);
      if (styles.length) list = list.filter((e) => hasStyles(e.st, styles));
      if (caseSel) list = list.filter((e) => e.cs === caseSel);
    }
    if (shapeMode && shapeKind) list = list.filter((e) => e.sk === shapeKind);
    if (query.trim()) list = searchEntries(list, query, 6000);
    else if (!category) list = featuredFirst(list);
    return list;
  }, [inCategory, letterMode, script, styles, caseSel, shapeMode, shapeKind, query, category]);

  // Reset pagination + keyboard focus whenever the result set changes.
  const [prevFiltered, setPrevFiltered] = React.useState(filtered);
  if (prevFiltered !== filtered) {
    setPrevFiltered(filtered);
    setVisible(PAGE);
    setFocused(filtered[0] ?? null);
  }

  // Keep the URL shareable: search text + active category.
  React.useEffect(() => {
    const id = setTimeout(() => {
      const u = new URL(window.location.href);
      if (query) u.searchParams.set("q", query);
      else u.searchParams.delete("q");
      if (category) u.searchParams.set("cat", category);
      else u.searchParams.delete("cat");
      window.history.replaceState(null, "", u);
    }, 300);
    return () => clearTimeout(id);
  }, [query, category]);

  const hasFilters = Boolean(
    query.trim() || category || script || styles.length || caseSel || shapeKind,
  );
  function clearAll() {
    setQuery("");
    setCategory("");
    setScript("");
    setStyles([]);
    setCaseSel("");
    setShapeKind("");
  }

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  // Infinite scroll: reveal the next page as a sentinel below the grid nears the
  // viewport. Re-arms on every `visible` change so that if the sentinel is still
  // in view after a page loads (tall viewport / short page), it keeps filling.
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visible]);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* Preview rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <PreviewPanel entry={focused} />
        </div>
      </aside>

      <div className="min-w-0">
        {/* ---------------- Filter bar ----------------
            Spacing is per-child (not space-y) so the collapsed refinement
            wrappers contribute no phantom margins; their gap animates open
            with the row (the pt-3 inside each overflow-hidden). */}
        <div className="mb-5">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search symbols"
              placeholder="Search by name, code point, or glyph…"
              className="h-10 w-full rounded-sm border border-wire bg-card pl-9 pr-9 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-[var(--andromeda-accent-500)]"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-ink-muted hover:text-ink"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Base category pills */}
          <div className="mt-3">
            <PillRow label="Category">
              {BASE_CATS.map((c) => (
                <Pill
                  key={c}
                  active={category === c}
                  disabled={Boolean(index) && !categoryCounts[c]}
                  onClick={() => selectCategory(c)}
                >
                  {c}
                </Pill>
              ))}
            </PillRow>
          </div>

          {/* Letter refinements (Script + Style) — revealed, animated, once
              "Alphanumeric" is selected. The wrapper stays mounted so the
              grid-rows height transition can play on open. */}
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
              index && letterMode
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-2 pt-3">
                <RefineFacet
                  label="Script"
                  options={refine.scripts}
                  labels={SCRIPT_LABELS}
                  value={script}
                  onChange={setScript}
                />
                <RefineFacet
                  label="Case"
                  options={refine.cases}
                  labels={CASE_LABELS}
                  value={caseSel}
                  onChange={setCaseSel}
                />
                <StyleFacet
                  options={refine.styles}
                  selected={styles}
                  onToggle={toggleStyle}
                />
              </div>
            </div>
          </div>

          {/* Shape-kind refinement — revealed, animated, once "Shapes" is
              selected. Same grid-rows transition as the letter refinements. */}
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
              index && shapeMode
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <div className="pt-3">
                <RefineFacet
                  label="Kind"
                  options={shapeKindOpts}
                  labels={SHAPE_KIND_LABELS}
                  value={shapeKind}
                  onChange={setShapeKind}
                />
              </div>
            </div>
          </div>

          {/* Result count + clear */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-wire-subtle pt-3 text-[12px] text-ink-muted">
            <span className="tabular-nums">
              {index
                ? `${filtered.length.toLocaleString("en-US")} symbols`
                : "loading…"}
            </span>
            {hasFilters && (
              <button
                onClick={clearAll}
                className="flex cursor-pointer items-center gap-1 text-ink-faint hover:text-ink"
              >
                <X size={12} /> clear
              </button>
            )}
          </div>
        </div>

        {/* ---------------- Grid ---------------- */}
        {!index ? (
          <GridSkeleton />
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-sm border border-dashed border-wire py-20 text-center">
            <div className="space-y-1">
              <div className="text-[15px] text-ink">No symbols found</div>
              <div className="text-[13px] text-ink-muted">
                Try a different name, code point, or clear the filters.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
              {shown.map((e) => (
                <BrowseTile
                  key={e.s}
                  entry={e}
                  selected={focused?.s === e.s}
                  onPreview={() => setFocused(e)}
                />
              ))}
            </div>

            {hasMore && (
              <div
                ref={sentinelRef}
                className="mt-6 flex justify-center py-4 text-[12px] tabular-nums text-ink-faint"
              >
                showing {shown.length.toLocaleString("en-US")} of{" "}
                {filtered.length.toLocaleString("en-US")}…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// A label column + a wrapping area of chips/controls to its right, so wrapped
// chips stay indented past the label rather than sliding under it.
function PillRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span className="label-caps w-16 shrink-0 pt-[7px]">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-sm border px-2.5 py-1 text-[12px] transition-colors",
        disabled
          ? "cursor-not-allowed border-wire-subtle bg-card text-ink-faint opacity-40"
          : active
            ? "cursor-pointer border-[var(--andromeda-accent-400)] bg-elevated text-ink"
            : "cursor-pointer border-wire-subtle bg-card text-ink-muted hover:border-wire hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

// The letter Script facet — single-select. Every script stays on the axis;
// those with no members under the current filters are greyed, not removed.
function RefineFacet({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: [string, number][];
  labels: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <PillRow label={label}>
      {options.map(([code, n]) => (
        <Pill
          key={code}
          active={value === code}
          disabled={n === 0 && value !== code}
          onClick={() => onChange(value === code ? "" : code)}
        >
          {labels[code] ?? code}
        </Pill>
      ))}
    </PillRow>
  );
}

// The letter Style facet — multi-select, AND-combined. Every primitive stays on
// the axis; combinations that would match nothing (e.g. Fraktur + Bold) render
// greyed and unclickable rather than disappearing, so chips never shift.
function StyleFacet({
  options,
  selected,
  onToggle,
}: {
  options: { code: string; label: string; n: number }[];
  selected: string[];
  onToggle: (code: string) => void;
}) {
  if (!options.length) return null;
  return (
    <PillRow label="Style">
      {options.map((o) => (
        <Pill
          key={o.code}
          active={selected.includes(o.code)}
          disabled={o.n === 0 && !selected.includes(o.code)}
          onClick={() => onToggle(o.code)}
        >
          {o.label}
        </Pill>
      ))}
    </PillRow>
  );
}

function BrowseTile({
  entry,
  selected,
  onPreview,
}: {
  entry: SearchEntry;
  selected: boolean;
  onPreview: () => void;
}) {
  return (
    <Link
      href={`/symbol/${entry.s}`}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      title={entry.u ?? entry.n}
      style={{ contentVisibility: "auto", containIntrinsicSize: "72px" }}
      className={cn(
        "group relative flex aspect-square flex-col items-center justify-center gap-1 rounded-sm border bg-card transition-colors",
        selected
          ? "border-[var(--andromeda-accent-400)] bg-elevated"
          : "border-wire-subtle hover:border-wire-bright hover:bg-elevated",
      )}
    >
      {selected && (
        <CornerMarkers className="border-[var(--andromeda-accent-300)]" />
      )}
      <Glyph
        value={entry.v}
        className="text-[24px] text-ink transition-transform duration-150 group-hover:scale-110 group-hover:text-brand-100"
      />
      <span className="line-clamp-1 max-w-full px-1 text-center text-[9px] leading-none text-ink-faint tabular-nums">
        {codePoints(entry.s)}
      </span>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
      {Array.from({ length: 60 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square animate-pulse rounded-sm border border-wire-subtle bg-card"
        />
      ))}
    </div>
  );
}
