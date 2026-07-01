import Link from "next/link";

import { Panel } from "@/components/andromeda/panel";
import { Glyph } from "@/components/glyph";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center px-4 py-28 text-center">
      <Panel
        variant="glow"
        markers
        className="mb-8 grid size-32 place-items-center"
      >
        <Glyph value="∅" className="glow-accent text-6xl text-ink" />
      </Panel>
      <div className="label-caps mb-2 text-brand-300">404 · the empty set</div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Nothing here
      </h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-secondary">
        That page or symbol doesn&apos;t exist — try browsing the catalogue.
      </p>
      <div className="mt-7 flex gap-3">
        <Link href="/browse" className={buttonVariants()}>
          Browse symbols
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Home
        </Link>
      </div>
    </div>
  );
}
