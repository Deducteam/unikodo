import type { Metadata } from "next";

import { Browser } from "@/components/browse/browser";

export const metadata: Metadata = {
  title: "Symbol browser",
  description:
    "Browse and search every Unicode symbol unikodo can name, filtered by Unicode block and unicode-math category.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const initialQuery = typeof sp.q === "string" ? sp.q : "";

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <Browser initialQuery={initialQuery} />
    </div>
  );
}
