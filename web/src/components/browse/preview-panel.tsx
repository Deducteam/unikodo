"use client";

import Link from "next/link";
import { ArrowRight, Cube } from "@phosphor-icons/react";

import { Panel } from "@/components/andromeda/panel";
import { Glyph } from "@/components/glyph";
import { SchemeBadge } from "@/components/scheme-badge";
import { CopyButton } from "@/components/copy-button";
import { buttonVariants } from "@/components/ui/button";
import { CornerMarkers } from "@/components/andromeda/corner-markers";
import { codePoints } from "@/lib/utils";
import type { SearchEntry } from "@/lib/search";

export function PreviewPanel({ entry }: { entry: SearchEntry | null }) {
  if (!entry) {
    return (
      <Panel className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <Cube size={28} className="text-ink-faint" />
        <p className="text-[13px] text-ink-muted">
          Hover a symbol to preview it here.
        </p>
      </Panel>
    );
  }

  return (
    <Panel variant="glow" className="overflow-hidden">
      <div className="relative flex items-center justify-center border-b border-wire px-6 py-10">
        <CornerMarkers className="border-[var(--andromeda-accent-500)]" />
        <Glyph
          value={entry.v}
          className="glow-accent text-[72px] leading-none text-ink"
        />
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="text-[15px] tabular-nums text-ink">
            {codePoints(entry.s)}
          </div>
          {entry.u && (
            <div className="mt-0.5 break-words text-[12px] text-ink-muted">
              {entry.u}
            </div>
          )}
        </div>

        <dl className="space-y-1.5 text-[12px]">
          <Row term="Categories" value={entry.ct.join(" · ")} />
          <Row term="Block" value={entry.b ?? "—"} />
          <Row term="Class" value={entry.mc ?? "—"} />
          <Row term="ASCII" value={entry.a ? "Yes" : "No"} />
        </dl>

        <div>
          <div className="label-caps mb-1.5">Named by</div>
          <div className="flex flex-wrap gap-1.5">
            {entry.sc.map((s) => (
              <SchemeBadge key={s} scheme={s} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/symbol/${entry.s}`}
            className={buttonVariants({ size: "sm", className: "flex-1" })}
          >
            Open details <ArrowRight size={14} weight="bold" />
          </Link>
          <CopyButton value={entry.v} label="Glyph" />
        </div>
      </div>
    </Panel>
  );
}

function Row({
  term,
  value,
  mono,
}: {
  term: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-faint">{term}</dt>
      <dd
        className={`truncate text-ink-secondary ${mono ? "tabular-nums" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
