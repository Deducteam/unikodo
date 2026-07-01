"use client";

import * as React from "react";
import Link from "next/link";
import { CaretDown, Check, MagnifyingGlass, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { loadSearchIndex, searchEntries, type SearchEntry } from "@/lib/search";
import { FEATURED_GLYPHS } from "@/lib/featured";
import { Glyph } from "@/components/glyph";
import { CornerMarkers } from "@/components/andromeda/corner-markers";
import { PreviewPanel } from "@/components/browse/preview-panel";

const PAGE = 240;

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

export function Browser({ initialQuery = "" }: { initialQuery?: string }) {
  const [index, setIndex] = React.useState<SearchEntry[] | null>(null);
  const [query, setQuery] = React.useState(initialQuery);
  const [block, setBlock] = React.useState("");
  const [mathClass, setMathClass] = React.useState("");
  const [includeAscii, setIncludeAscii] = React.useState(false);
  const [visible, setVisible] = React.useState(PAGE);
  const [focused, setFocused] = React.useState<SearchEntry | null>(null);

  React.useEffect(() => {
    loadSearchIndex().then(setIndex);
  }, []);

  // Facets are genuine properties of a symbol: its Unicode block (from the
  // Unicode Standard) and its unicode-math category. Naming schemes are NOT a
  // facet — they describe how a symbol is named, not what it is.
  const facets = React.useMemo(() => {
    const blockCounts: Record<string, number> = {};
    const classCounts: Record<string, number> = {};
    let asciiCount = 0;
    if (index) {
      for (const e of index) {
        if (e.b) blockCounts[e.b] = (blockCounts[e.b] ?? 0) + 1;
        if (e.mc) classCounts[e.mc] = (classCounts[e.mc] ?? 0) + 1;
        if (e.a) asciiCount++;
      }
    }
    const byCount = (a: [string, number], b: [string, number]) =>
      b[1] - a[1] || a[0].localeCompare(b[0]);
    return {
      blocks: Object.entries(blockCounts).sort(byCount),
      classes: Object.entries(classCounts).sort(byCount),
      asciiCount,
    };
  }, [index]);

  const filtered = React.useMemo(() => {
    if (!index) return [];
    let list = index;
    if (!includeAscii) list = list.filter((e) => !e.a);
    if (block) list = list.filter((e) => e.b === block);
    if (mathClass) list = list.filter((e) => e.mc === mathClass);
    if (query.trim()) list = searchEntries(list, query, 6000);
    else if (!block && !mathClass) list = featuredFirst(list);
    return list;
  }, [index, includeAscii, block, mathClass, query]);

  // Reset pagination + keyboard focus whenever the result set changes.
  const [prevFiltered, setPrevFiltered] = React.useState(filtered);
  if (prevFiltered !== filtered) {
    setPrevFiltered(filtered);
    setVisible(PAGE);
    setFocused(filtered[0] ?? null);
  }

  // Keep the URL shareable.
  React.useEffect(() => {
    const id = setTimeout(() => {
      const u = new URL(window.location.href);
      if (query) u.searchParams.set("q", query);
      else u.searchParams.delete("q");
      window.history.replaceState(null, "", u);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const hasFilters = Boolean(query.trim() || block || mathClass);
  function clearAll() {
    setQuery("");
    setBlock("");
    setMathClass("");
  }

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
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <FacetSelect
              label="All blocks"
              value={block}
              onChange={setBlock}
              options={facets.blocks}
            />
            <FacetSelect
              label="All classes"
              value={mathClass}
              onChange={setMathClass}
              options={facets.classes}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIncludeAscii((v) => !v)}
              title="Include characters whose value is a plain ASCII character"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] transition-colors cursor-pointer",
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
              <span className="text-ink-faint">{facets.asciiCount}</span>
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
                  className="flex items-center gap-1 text-ink-faint hover:text-ink cursor-pointer"
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
                  className="rounded-sm border border-wire bg-card px-5 py-2.5 text-[13px] text-ink-secondary transition-colors hover:border-wire-bright hover:bg-elevated hover:text-ink cursor-pointer"
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
        className="h-10 w-full appearance-none rounded-sm border border-wire bg-card pl-3 pr-8 text-[13px] text-ink-secondary outline-none focus:border-[var(--andromeda-accent-500)] sm:w-52"
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
      <span className="line-clamp-1 max-w-full px-1 text-center text-[9px] leading-none text-ink-muted">
        {entry.n}
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
