"use client";

import * as React from "react";
import Link from "next/link";
import { CaretDown, Check, MagnifyingGlass, X } from "@phosphor-icons/react";

import { cn, codePoints } from "@/lib/utils";
import { loadSearchIndex, searchEntries, type SearchEntry } from "@/lib/search";
import { FEATURED_GLYPHS } from "@/lib/featured";
import { Glyph } from "@/components/glyph";
import { CornerMarkers } from "@/components/andromeda/corner-markers";
import { PreviewPanel } from "@/components/browse/preview-panel";

const PAGE = 240;

// Curated taxonomy — tags computed at build time (see build-search-index.mjs),
// a genuine property of the symbol, not the scheme that names it. A flat set of
// always-visible *base* categories; selecting one reveals refinements below it.
// "Alphabetic" is one base pill (the whole ~1,100-glyph letter family); its
// breakdown — named sub-types + Style/Script axes — appears only once selected.
const BASE_CATS = [
  "Alphabetic", "Arrows", "Relations", "Set & Logic", "Big operators",
  "Binary ops", "Delimiters", "Accents", "Shapes", "Punctuation", "Ordinary",
];
const LETTER_SUBCATS = [
  "Greek", "Blackboard", "Fraktur", "Script", "Styled Latin", "Numerals",
];

// Letter style/script codes → display label + a stable display order.
const STYLE_LABELS: Record<string, string> = {
  up: "Upright", it: "Italic", bf: "Bold", bfit: "Bold Italic",
  sans: "Sans", itsans: "Sans Italic", bfsans: "Sans Bold",
  bfitsans: "Sans Bold Italic", tt: "Mono", bb: "Double-struck",
  frak: "Fraktur", scr: "Script",
};
const STYLE_ORDER = Object.keys(STYLE_LABELS);
const SCRIPT_LABELS: Record<string, string> = {
  Latin: "Latin", Greek: "Greek", Hebrew: "Hebrew", Digit: "Digits",
};
const SCRIPT_ORDER = Object.keys(SCRIPT_LABELS);

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
const inOrder = (counts: Record<string, number>, order: string[]) =>
  order.filter((k) => counts[k]).map((k) => [k, counts[k]] as [string, number]);
const byCount = (a: [string, number], b: [string, number]) =>
  b[1] - a[1] || a[0].localeCompare(b[0]);

export function Browser({
  initialQuery = "",
  initialCategory = "",
}: {
  initialQuery?: string;
  initialCategory?: string;
}) {
  const [index, setIndex] = React.useState<SearchEntry[] | null>(null);
  const [query, setQuery] = React.useState(initialQuery);
  const [category, setCategory] = React.useState(
    BASE_CATS.includes(initialCategory) ? initialCategory : "",
  );
  const [subType, setSubType] = React.useState(""); // letter sub-category
  const [style, setStyle] = React.useState("");
  const [script, setScript] = React.useState("");
  const [block, setBlock] = React.useState("");
  const [mathClass, setMathClass] = React.useState("");
  const [includeAscii, setIncludeAscii] = React.useState(false);
  const [visible, setVisible] = React.useState(PAGE);
  const [focused, setFocused] = React.useState<SearchEntry | null>(null);

  React.useEffect(() => {
    loadSearchIndex().then(setIndex);
  }, []);

  const letterMode = category === "Alphabetic";

  // Switch the base category, dropping every refinement — they belong to the
  // previous category's context.
  const selectCategory = React.useCallback((c: string) => {
    setCategory((cur) => (cur === c ? "" : c));
    setSubType("");
    setStyle("");
    setScript("");
    setBlock("");
    setMathClass("");
  }, []);

  // Switch the letter sub-type (Greek / Blackboard / …), resetting the finer
  // Style + Script axes so they re-evaluate within the new sub-type.
  const selectSubType = React.useCallback((c: string) => {
    setSubType((cur) => (cur === c ? "" : c));
    setStyle("");
    setScript("");
  }, []);

  // Base set = the ASCII toggle applied. Base-category counts live here so the
  // pills report how many symbols each holds under the current toggle.
  const base = React.useMemo(() => {
    if (!index) return [];
    return includeAscii ? index : index.filter((e) => !e.a);
  }, [index, includeAscii]);

  const categoryCounts = React.useMemo(
    () => count(base.flatMap((e) => e.ct), (t) => t),
    [base],
  );

  // The active category narrows the universe the refine row + grid work over.
  const inCategory = React.useMemo(
    () => (category ? base.filter((e) => e.ct.includes(category)) : base),
    [base, category],
  );

  // Refine options, scoped so their counts stay honest. Letter facets exclude
  // their own axis (standard faceted search) so counts reflect the other picks.
  const refine = React.useMemo(() => {
    if (letterMode) {
      const bySub = subType
        ? inCategory.filter((e) => e.ct.includes(subType))
        : inCategory;
      const forStyle = script ? bySub.filter((e) => e.sr === script) : bySub;
      const forScript = style ? bySub.filter((e) => e.st === style) : bySub;
      const forType = inCategory.filter(
        (e) => (!style || e.st === style) && (!script || e.sr === script),
      );
      const typeCounts: Record<string, number> = {};
      for (const c of LETTER_SUBCATS)
        typeCounts[c] = forType.filter((e) => e.ct.includes(c)).length;
      return {
        types: typeCounts,
        styles: inOrder(count(forStyle, (e) => e.st), STYLE_ORDER),
        scripts: inOrder(count(forScript, (e) => e.sr), SCRIPT_ORDER),
        blocks: [] as [string, number][],
        classes: [] as [string, number][],
      };
    }
    return {
      types: {} as Record<string, number>,
      styles: [] as [string, number][],
      scripts: [] as [string, number][],
      blocks: Object.entries(count(inCategory, (e) => e.b)).sort(byCount),
      classes: Object.entries(count(inCategory, (e) => e.mc)).sort(byCount),
    };
  }, [inCategory, letterMode, subType, style, script]);

  const filtered = React.useMemo(() => {
    let list = inCategory;
    if (letterMode) {
      if (subType) list = list.filter((e) => e.ct.includes(subType));
      if (style) list = list.filter((e) => e.st === style);
      if (script) list = list.filter((e) => e.sr === script);
    } else {
      if (block) list = list.filter((e) => e.b === block);
      if (mathClass) list = list.filter((e) => e.mc === mathClass);
    }
    if (query.trim()) list = searchEntries(list, query, 6000);
    else if (!category) list = featuredFirst(list);
    return list;
  }, [inCategory, letterMode, subType, style, script, block, mathClass, query, category]);

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
    query.trim() || category || subType || style || script || block || mathClass,
  );
  function clearAll() {
    setQuery("");
    setCategory("");
    setSubType("");
    setStyle("");
    setScript("");
    setBlock("");
    setMathClass("");
  }

  // Count of letter sub-types with any members — hide the Type row if it can't
  // actually branch (e.g. a Script/Style pick left a single sub-type).
  const liveTypes = LETTER_SUBCATS.filter((c) => refine.types[c]).length;
  const shown = filtered.slice(0, visible);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* Preview rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <PreviewPanel entry={focused} />
        </div>
      </aside>

      <div className="min-w-0">
        {/* ---------------- Filter bar ---------------- */}
        <div className="mb-5 space-y-3">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
          <PillRow label="Category">
            {BASE_CATS.map((c) => (
              <Pill
                key={c}
                active={category === c}
                count={index ? categoryCounts[c] ?? 0 : undefined}
                disabled={Boolean(index) && !categoryCounts[c]}
                onClick={() => selectCategory(c)}
              >
                {c}
              </Pill>
            ))}
          </PillRow>

          {/* Refinements — only once a base category is selected */}
          {index && letterMode && (
            <div className="space-y-2">
              {liveTypes > 1 && (
                <PillRow label="Type">
                  {LETTER_SUBCATS.map((c) => (
                    <Pill
                      key={c}
                      active={subType === c}
                      count={refine.types[c] ?? 0}
                      disabled={!refine.types[c]}
                      onClick={() => selectSubType(c)}
                    >
                      {c}
                    </Pill>
                  ))}
                </PillRow>
              )}
              <RefineFacet
                label="Script"
                options={refine.scripts}
                labels={SCRIPT_LABELS}
                value={script}
                onChange={setScript}
              />
              <RefineFacet
                label="Style"
                options={refine.styles}
                labels={STYLE_LABELS}
                value={style}
                onChange={setStyle}
              />
            </div>
          )}
          {index && category && !letterMode && (
            <PillRow label="Refine">
              <FacetSelect
                label="All blocks"
                value={block}
                onChange={setBlock}
                options={refine.blocks}
              />
              <FacetSelect
                label="All classes"
                value={mathClass}
                onChange={setMathClass}
                options={refine.classes}
              />
            </PillRow>
          )}

          {/* ASCII toggle + result count */}
          <div className="flex flex-wrap items-center gap-2 border-t border-wire-subtle pt-3">
            <button
              onClick={() => setIncludeAscii((v) => !v)}
              title="Include characters whose value is a plain ASCII character"
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] transition-colors",
                includeAscii
                  ? "border-wire-bright bg-elevated text-ink"
                  : "border-wire-subtle bg-card text-ink-muted hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "grid size-3 place-items-center rounded-[2px] border",
                  includeAscii
                    ? "border-[var(--andromeda-accent-400)] bg-[var(--andromeda-accent-alpha)]"
                    : "border-wire",
                )}
              >
                {includeAscii && (
                  <Check size={9} weight="bold" className="text-brand-100" />
                )}
              </span>
              ASCII
            </button>

            <div className="ml-auto flex items-center gap-3 text-[12px] text-ink-muted">
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

            {visible < filtered.length && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setVisible((v) => v + PAGE)}
                  className="cursor-pointer rounded-sm border border-wire bg-card px-5 py-2.5 text-[13px] text-ink-secondary transition-colors hover:border-wire-bright hover:bg-elevated hover:text-ink"
                >
                  Load more · showing{" "}
                  <span className="tabular-nums text-ink">{shown.length}</span> of{" "}
                  <span className="tabular-nums text-ink">
                    {filtered.length.toLocaleString("en-US")}
                  </span>
                </button>
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
  count,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] transition-colors",
        disabled
          ? "cursor-not-allowed border-wire-subtle bg-card text-ink-faint opacity-40"
          : active
            ? "cursor-pointer border-[var(--andromeda-accent-400)] bg-elevated text-ink"
            : "cursor-pointer border-wire-subtle bg-card text-ink-muted hover:border-wire hover:text-ink",
      )}
    >
      <span>{children}</span>
      {count != null && (
        <span
          className={cn(
            "tabular-nums text-[11px]",
            active ? "text-ink-secondary" : "text-ink-faint",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// A letter refine facet (Style / Script) as a labelled pill row. Hidden when it
// offers no real choice (one option ⇒ nothing to narrow).
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
  if (options.length < 2) return null;
  return (
    <PillRow label={label}>
      {options.map(([code, n]) => (
        <Pill
          key={code}
          active={value === code}
          count={n}
          onClick={() => onChange(value === code ? "" : code)}
        >
          {labels[code] ?? code}
        </Pill>
      ))}
    </PillRow>
  );
}

function FacetSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, number][];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full appearance-none rounded-sm border border-wire bg-card pl-3 pr-8 text-[12px] text-ink-secondary outline-none focus:border-[var(--andromeda-accent-500)] sm:w-52"
      >
        <option value="">
          {label} ({options.length})
        </option>
        {options.map(([name, n]) => (
          <option key={name} value={name}>
            {name} ({n})
          </option>
        ))}
      </select>
      <CaretDown
        size={13}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
    </div>
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
