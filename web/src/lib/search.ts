// Client-side search over the slim index (`/search-index.json`). Kept free of
// the heavy dataset so it can run in the browser (command palette + browser).

export interface SearchEntry {
  /** slug (hex code points joined by "-") */
  s: string;
  /** value (the glyph) */
  v: string;
  /** primary, familiar name */
  n: string;
  /** Unicode name */
  u: string | null;
  /** Unicode block */
  b: string | null;
  /** primary code point */
  c: number | null;
  /** schemes that name it */
  sc: string[];
  /** is a single ASCII character */
  a: boolean;
  /** unicode-math category (friendly), if any */
  mc: string | null;
}

let cache: SearchEntry[] | null = null;
let inflight: Promise<SearchEntry[]> | null = null;

export async function loadSearchIndex(): Promise<SearchEntry[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/search-index.json")
      .then((r) => r.json())
      .then((data: SearchEntry[]) => {
        cache = data;
        return data;
      });
  }
  return inflight;
}

function usvOf(cp: number | null): string {
  return cp == null ? "" : `u+${cp.toString(16)}`;
}

/**
 * Score an entry against a lowercased query. Higher is better; 0 = no match.
 * Ranks exact glyph / name / codepoint hits above prefix hits above substring
 * hits, and weights the typed name above the Unicode name and block.
 */
export function scoreEntry(e: SearchEntry, q: string): number {
  if (!q) return 1;
  // Direct glyph paste.
  if (e.v === q) return 1000;

  const name = e.n.toLowerCase();
  const uname = (e.u ?? "").toLowerCase();
  const block = (e.b ?? "").toLowerCase();
  const usv = usvOf(e.c);

  // Code-point queries: "u+2264", "2264", "0x2264".
  const hex = q.replace(/^(u\+|0x)/, "");
  if (/^[0-9a-f]+$/.test(hex) && e.c != null) {
    if (e.c === parseInt(hex, 16)) return 900;
    if (usv.includes(q)) return 400;
  }

  let score = 0;
  if (name === q) score = Math.max(score, 800);
  else if (name.startsWith(q)) score = Math.max(score, 600);
  else if (name.includes(q)) score = Math.max(score, 300);

  if (uname === q) score = Math.max(score, 700);
  else if (uname.startsWith(q)) score = Math.max(score, 450);
  else if (uname.includes(q)) score = Math.max(score, 220);

  if (block.includes(q)) score = Math.max(score, 80);

  // Shorter names rank a touch higher among equal-tier matches.
  if (score > 0) score += Math.max(0, 40 - name.length);
  return score;
}

export function searchEntries(
  all: SearchEntry[],
  query: string,
  limit = 50,
): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of all) {
    const score = scoreEntry(e, q);
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || (a.e.c ?? 0) - (b.e.c ?? 0));
  return scored.slice(0, limit).map((x) => x.e);
}
