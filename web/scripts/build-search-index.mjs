// Build a slim, client-facing search index from the full symbol dataset.
//
// The browser page and the ⌘K command palette load this static file instead of
// the full ~700KB dataset. One entry per character; short keys to keep it small.
// Run automatically via the predev / prebuild npm hooks.
//
//   s  slug            v  value (glyph)        n  primary (familiar) name
//   u  unicode name    b  block               c  primary code point
//   sc schemes[]       a  isAscii              mc unicode-math class (friendly)
//   ct category tags[] st letter style         sr letter script

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

// ---------------------------------------------------------------------------
// Curated semantic categories. A glyph may carry several (arrows∩relations,
// set∩relations, shapes∩binops); ~300 of ~2850 are multi-tagged. Predicates
// read the unicode-math class (folded to `mc` above), the Unicode block, the
// Unicode name, and the glyph itself — never the naming scheme, which is how a
// symbol is written, not what it is. Two families:
//   Letters  (mathalpha, plus the styled digits) — split by *style* + *script*.
//   Symbols  (everything else) — Arrows, Relations, Set & Logic, Big operators,
//            Binary ops, Delimiters, Accents, Shapes, Punctuation, Ordinary.

// A letter's style, read from its Unicode name. The alphabet-defining styles
// (double-struck, fraktur, script, monospace) win over weight/slope so e.g.
// "BOLD SCRIPT CAPITAL A" is script, not bold.
function styleOf(name) {
  if (name.includes("DOUBLE-STRUCK")) return "bb";
  if (name.includes("FRAKTUR") || name.includes("BLACK-LETTER")) return "frak";
  if (name.includes("SCRIPT")) return "scr";
  if (name.includes("MONOSPACE")) return "tt";
  const sans = name.includes("SANS-SERIF");
  const bold = name.includes("BOLD");
  const ital = name.includes("ITALIC");
  if (sans) return bold && ital ? "bfitsans" : bold ? "bfsans" : ital ? "itsans" : "sans";
  if (bold && ital) return "bfit";
  if (bold) return "bf";
  if (ital) return "it";
  return "up";
}

// A letter's script/alphabet. The Mathematical Alphanumeric letters are named
// e.g. "MATHEMATICAL BOLD SMALL ALPHA" — no "GREEK" token — so Greek and Hebrew
// are also matched by their letter names.
const GREEK_NAMES =
  /\b(ALPHA|BETA|GAMMA|DELTA|EPSILON|ZETA|ETA|THETA|IOTA|KAPPA|LAMDA|LAMBDA|MU|NU|XI|OMICRON|PI|RHO|SIGMA|TAU|UPSILON|PHI|CHI|PSI|OMEGA|DIGAMMA|NABLA)\b/;
const HEBREW_NAMES = /\b(ALEF|ALEPH|BET|GIMEL|DALET)\b/;
function scriptOf(name) {
  if (name.includes("GREEK") || GREEK_NAMES.test(name)) return "Greek";
  if (name.includes("HEBREW") || HEBREW_NAMES.test(name)) return "Hebrew";
  if (name.includes("DIGIT")) return "Digit";
  return "Latin";
}

// Set-theory & logic: a curated glyph set (covers the operators whose names are
// ambiguous, e.g. the logic gates ⊻⊼⊽) plus name keywords for the rest.
const SETLOGIC_CHARS = new Set(
  Array.from(
    "∈∉∊∋∌∍⊂⊃⊄⊅⊆⊇⊈⊉⊊⊋⊏⊐⊑⊒⊓⊔∪∩⋃⋂⨆⨅⊎∀∃∄∅¬∧∨⋀⋁⊻⊼⊽⊤⊥⊢⊣⊦⊧⊨⊩⊪⊫⊬⊭⊮⊯∴∵∁⫫",
  ),
);
const SETLOGIC_KW = [
  "ELEMENT OF", "CONTAINS AS MEMBER", "SUBSET", "SUPERSET", "UNION",
  "INTERSECTION", "FOR ALL", "THERE EXISTS", "EMPTY SET", "LOGICAL AND",
  "LOGICAL OR", "TURNSTILE", "MODELS", "TACK", "NOT SIGN", "COMPLEMENT",
  "BECAUSE", "THEREFORE", "FORCES", "N-ARY UNION", "N-ARY INTERSECTION",
];
const SHAPE_KW = ["SQUARE", "TRIANGLE", "CIRCLE", "DIAMOND", "LOZENGE", "STAR",
  "PENTAGON", "HEXAGON", "RHOMBUS", "ELLIPSE", "PARALLELOGRAM"];
const SHAPE_BLOCKS = new Set(["Geometric Shapes", "Geometric Shapes Extended"]);
// Reject operators/relations that merely embed a shape word, e.g. √ SQUARE ROOT,
// ⊏ SQUARE IMAGE OF, ≛ STAR EQUALS, ⋆ STAR OPERATOR, ⊛ CIRCLED ...
const SHAPE_EXCLUDE =
  /CIRCLED|SQUARED|ROOT|IMAGE OF|ORIGINAL OF|EQUALS|OPERATOR|MULTIPLICATION|SUBSET/;
const PUNCT_KW = ["COMMA", "SEMICOLON", "COLON", "ELLIPSIS", "FULL STOP",
  "PERIOD", "QUESTION MARK", "EXCLAMATION", "INTERROBANG", "MIDDLE DOT", "PRIME",
  "ASTERISM", "LEADER", "DASH", "HYPHEN", "QUOTATION", "PER MILLE",
  "PER TEN THOUSAND", "PILCROW", "REFERENCE MARK"];

// Compute the category tags (+ style/script for letters) for one glyph.
// `name` is the upper-case Unicode name; `mc` the friendly class; `block` the
// Unicode block name (may be null).
function classify(value, name, mc, block) {
  const cat = [];
  if (mc === "Alphabetic" || name.includes("DIGIT")) {
    const st = styleOf(name);
    const sr = scriptOf(name);
    if (sr === "Greek") cat.push("Greek");
    if (sr === "Digit") cat.push("Numerals");
    if (st === "bb") cat.push("Blackboard");
    if (st === "frak") cat.push("Fraktur");
    if (st === "scr") cat.push("Script");
    if (sr === "Latin" && st !== "bb" && st !== "frak" && st !== "scr")
      cat.push("Styled Latin");
    if (cat.length === 0) cat.push("Styled Latin"); // Hebrew letterlikes, etc.
    // "Alphabetic" is the always-visible *base* category; the specific tags
    // above (Greek / Blackboard / …) are refinements shown once it's selected.
    cat.unshift("Alphabetic");
    return { cat, st, sr };
  }
  const isArrow =
    name.includes("ARROW") || name.includes("HARPOON") ||
    (block !== null && block.includes("Arrow"));
  if (isArrow) cat.push("Arrows");
  if (
    Array.from(value).some((c) => SETLOGIC_CHARS.has(c)) ||
    SETLOGIC_KW.some((k) => name.includes(k))
  )
    cat.push("Set & Logic");
  if (mc === "Relations" && !isArrow) cat.push("Relations");
  if (mc === "Operators") cat.push("Big operators");
  if (mc === "Binary operators") cat.push("Binary ops");
  if (mc === "Delimiters") cat.push("Delimiters");
  if (mc === "Accents") cat.push("Accents");
  if (
    (block !== null && SHAPE_BLOCKS.has(block)) ||
    (SHAPE_KW.some((k) => name.includes(k)) && !SHAPE_EXCLUDE.test(name))
  )
    cat.push("Shapes");
  if (mc === "Punctuation" || PUNCT_KW.some((k) => name.includes(k)))
    cat.push("Punctuation");
  if (cat.length === 0) cat.push("Ordinary");
  return { cat, st: null, sr: null };
}

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
  const mc = cls ? MATH_CATEGORY[cls] ?? null : null;

  // For categorisation, use the upper-case Unicode name (falling back to a
  // scheme description) and the first code point's block — available even for
  // the few multi-code-point glyphs that don't get a stored `u`/`b`.
  const desc = entries.find((e) => e.description)?.description ?? "";
  const nameForCat = (names[String(cp)] ?? desc).toUpperCase();
  const { cat, st, sr } = classify(value, nameForCat, mc, lookupBlock(cp));

  index.push({
    s: slug,
    v: value,
    n: pickName(entries),
    u: single ? names[String(cp)] ?? null : null,
    b: single ? lookupBlock(cp) : null,
    c: single ? cp : null,
    sc: schemes,
    a: entries[0].ascii,
    mc,
    ct: cat,
    st,
    sr,
  });
}

index.sort((a, b) => (a.c ?? 1 / 0) - (b.c ?? 1 / 0));

const outDir = path.join(root, "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "search-index.json"), JSON.stringify(index));
console.log(`search-index.json: ${index.length} characters`);
