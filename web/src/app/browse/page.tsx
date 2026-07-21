import type { Metadata } from "next";

import { Browser } from "@/components/browse/browser";

export const metadata: Metadata = {
  title: "Symbol browser",
  description:
    "Browse and search every Unicode symbol unikodo can name — arrows, relations, operators, binders, brackets, shapes, and the styled letter alphabets.",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const initialQuery = typeof sp.q === "string" ? sp.q : "";
  const initialCategory = typeof sp.cat === "string" ? sp.cat : "";

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">
      <Browser initialQuery={initialQuery} initialCategory={initialCategory} />
    </div>
  );
}
