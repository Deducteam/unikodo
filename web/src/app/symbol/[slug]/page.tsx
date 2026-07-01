import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";

import {
  getCharacter,
  getRelated,
  CLASS_LABELS,
  type CharacterEntry,
} from "@/lib/symbols";
import { Panel, PanelHeader } from "@/components/andromeda/panel";
import { Tag } from "@/components/andromeda/tag";
import { Glyph } from "@/components/glyph";
import { GlyphTile } from "@/components/glyph-tile";
import { SchemeBadge } from "@/components/scheme-badge";
import { CopyButton } from "@/components/copy-button";
import { CornerMarkers } from "@/components/andromeda/corner-markers";
import { WaysToType } from "@/components/symbol/ways-to-type";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = getCharacter(slug);
  if (!entry) return { title: "Symbol not found" };
  return {
    title: `${entry.value}  ${entry.displayName}`,
    description: `${entry.value} (${entry.usv}) — ${entry.names.length} ways to name it across ${entry.schemes.length} naming schemes in unikodo.`,
  };
}

function encodings(entry: CharacterEntry) {
  const cps = entry.codepoints;
  const hex = (c: number, pad = 4) =>
    c.toString(16).toUpperCase().padStart(pad, "0");
  return [
    { term: "Code point", value: cps.map((c) => `U+${hex(c)}`).join(" ") },
    { term: "Decimal", value: cps.map((c) => String(c)).join(" ") },
    {
      term: "UTF-8",
      value: Array.from(Buffer.from(entry.value, "utf8"))
        .map((b) => hex(b, 2))
        .join(" "),
    },
    {
      term: "UTF-16",
      value: Array.from({ length: entry.value.length }, (_, i) =>
        hex(entry.value.charCodeAt(i)),
      ).join(" "),
    },
    { term: "HTML", value: cps.map((c) => `&#x${hex(c)};`).join("") },
    { term: "CSS", value: cps.map((c) => `\\${hex(c)}`).join(" ") },
    {
      term: "JavaScript",
      value: cps
        .map((c) => (c > 0xffff ? `\\u{${hex(c)}}` : `\\u${hex(c)}`))
        .join(""),
    },
  ];
}

export default async function SymbolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getCharacter(slug);
  if (!entry) notFound();

  const related = getRelated(entry, 28);
  const encs = encodings(entry);
  // Total ways to name it, matching the Names panel — which appends the dynamic
  // U+ code-point name for single-code-point characters (see WaysToType).
  const nameCount = entry.names.length + (entry.codepoints.length === 1 ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      {/* breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-[12px] text-ink-muted">
        <Link
          href="/browse"
          className="flex items-center gap-1.5 hover:text-brand-200"
        >
          <ArrowLeft size={13} /> Browser
        </Link>
        {entry.block && (
          <>
            <span className="text-ink-faint">/</span>
            <span className="truncate">{entry.block}</span>
          </>
        )}
      </div>

      {/* ============================ HERO ============================ */}
      <section className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Panel
          variant="glow"
          className="relative grid aspect-square place-items-center p-6"
        >
          <CornerMarkers className="border-[var(--andromeda-accent-400)]" size={16} />
          <Glyph
            value={entry.value}
            className="glow-accent text-[clamp(72px,18vw,150px)] leading-none text-ink"
          />
          <span className="absolute bottom-3 right-3 text-[11px] tabular-nums text-ink-faint">
            {entry.usv}
          </span>
        </Panel>

        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
            {entry.displayName}
          </h1>
          {entry.unicodeName && entry.unicodeName !== entry.displayName && (
            <div className="mt-1 text-[13px] text-ink-muted">
              {entry.unicodeName}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {entry.block && <Tag tone="default">{entry.block}</Tag>}
            {entry.mathClass && CLASS_LABELS[entry.mathClass] && (
              <Tag tone="accent">{CLASS_LABELS[entry.mathClass]}</Tag>
            )}
            <Tag tone="outline">{entry.isAscii ? "ASCII" : "Non-ASCII"}</Tag>
            <Tag tone="outline">
              {nameCount} {nameCount === 1 ? "name" : "names"}
            </Tag>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <CopyButton
              value={entry.value}
              label="Copy glyph"
              className="px-3 py-1.5 text-[12px]"
            />
            <CopyButton
              value={entry.usv}
              label="Copy code point"
              className="px-3 py-1.5 text-[12px]"
            />
          </div>

          <div className="mt-6">
            <div className="label-caps mb-2">Named by</div>
            <div className="flex flex-wrap gap-1.5">
              {entry.schemes.map((s) => (
                <SchemeBadge key={s} scheme={s} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===================== NAMES + ENCODINGS ======================= */}
      <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        <WaysToType entry={entry} />

        <Panel className="overflow-hidden">
          <PanelHeader title="Encodings" />
          <dl className="divide-y divide-wire-subtle">
            {encs.map((e) => (
              <div
                key={e.term}
                className="grid grid-cols-[88px_1fr_auto] items-center gap-2 px-4 py-2"
              >
                <dt className="label-caps">{e.term}</dt>
                <dd className="truncate text-[12.5px] tabular-nums text-ink-secondary">
                  {e.value}
                </dd>
                <CopyButton value={e.value} iconSize={12} />
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      {/* =========================== RELATED =========================== */}
      {related.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="label-caps mb-1 text-brand-300">Nearby</div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                More from {entry.block}
              </h2>
            </div>
            <Link
              href="/browse"
              className="flex items-center gap-1.5 text-[13px] text-brand-200 hover:text-brand-100"
            >
              Browse all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-12">
            {related.map((c) => (
              <GlyphTile
                key={c.slug}
                slug={c.slug}
                value={c.value}
                label={c.unicodeName ?? c.displayName}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
