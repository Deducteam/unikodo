// Build a slim, client-facing search index from the full symbol dataset.
//
// The browser page and the ⌘K command palette load this static file instead of
// the full ~700KB dataset. One entry per character; short keys to keep it small.
// Run automatically via the predev / prebuild npm hooks.
//
//   s  slug            v  value (glyph)        n  primary (familiar) name
//   u  unicode name    b  block               c  primary code point
//   sc schemes[]       a  isAscii

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const db = read("src/data/symbols.json");
const names = read("src/data/names.json");
const blocks = read("src/data/blocks.json").sort((a, b) => a.start - b.start);

const SCHEME_ORDER = ["unicode-math", "latex", "typst", "unicode", "ascii"];
const rank = (id) => {
  const i = SCHEME_ORDER.indexOf(id);
  return i === -1 ? SCHEME_ORDER.length : i;
};

// unicode-math's own categorisation: fold each math class into a friendly
// category, used as a browse facet (a genuine property of the symbol, unlike
// the naming scheme).
const MATH_CATEGORY = {
  mathalpha: "Alphabetic",
  mathrel: "Relations",
  mathbin: "Binary operators",
  mathop: "Operators",
  mathord: "Ordinary",
  mathopen: "Delimiters",
  mathclose: "Delimiters",
  mathfence: "Delimiters",
  mathpunct: "Punctuation",
  mathaccent: "Accents",
  mathaccentwide: "Accents",
  mathaccentoverlay: "Accents",
  mathbotaccent: "Accents",
  mathbotaccentwide: "Accents",
  mathover: "Accents",
  mathunder: "Accents",
};

function lookupBlock(cp) {
  let lo = 0,
    hi = blocks.length - 1,
    found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid].start <= cp) {
      found = blocks[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found && cp <= found.end ? found.name : null;
}

// Prefer a familiar name for the grid label: latex, then unicode-math, then the
// rest in canonical order.
const NAME_PREF = ["latex", "unicode-math", "typst", "ascii", "unicode"];
function pickName(entries) {
  for (const scheme of NAME_PREF) {
    const hit = entries.find((e) => e.scheme === scheme);
    if (hit) return hit.name;
  }
  return entries[0].name;
}

const groups = new Map();
for (const s of db.symbols) {
  const g = groups.get(s.value);
  if (g) g.push(s);
  else groups.set(s.value, [s]);
}

const index = [];
for (const [value, entries] of groups) {
  const codepoints = Array.from(value).map((c) => c.codePointAt(0));
  const cp = codepoints[0];
  const single = codepoints.length === 1;
  const slug = codepoints.map((c) => c.toString(16)).join("-");
  const schemes = [...new Set(entries.map((e) => e.scheme))].sort(
    (a, b) => rank(a) - rank(b),
  );
  const cls =
    entries.find((e) => e.scheme === "unicode-math" && e.class)?.class ??
    entries.find((e) => e.class)?.class ??
    null;
  index.push({
    s: slug,
    v: value,
    n: pickName(entries),
    u: single ? names[String(cp)] ?? null : null,
    b: single ? lookupBlock(cp) : null,
    c: single ? cp : null,
    sc: schemes,
    a: entries[0].ascii,
    mc: cls ? MATH_CATEGORY[cls] ?? null : null,
  });
}

index.sort((a, b) => (a.c ?? 1 / 0) - (b.c ?? 1 / 0));

const outDir = path.join(root, "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "search-index.json"), JSON.stringify(index));
console.log(`search-index.json: ${index.length} characters`);
