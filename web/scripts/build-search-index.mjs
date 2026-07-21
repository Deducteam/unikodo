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
//   cs letter case (u=upper, l=lower; null if caseless)
//   sk shape kind (Ellipses/Triangles/Quadrilaterals/Other; shapes only, else null)

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
  mathbin: "Operators",
  mathop: "Binders",
  mathord: "Ordinary",
  mathopen: "Brackets",
  mathclose: "Brackets",
  mathfence: "Brackets",
  mathpunct: "Punctuation",
};

// Accents (combining marks that decorate a base glyph) are not something unikodo
// offers — they don't stand alone as an inserted symbol. Drop every accent class
// from the web index entirely, so they never surface in browse or search.
const ACCENT_CLASSES = new Set([
  "mathaccent", "mathaccentwide", "mathaccentoverlay",
  "mathbotaccent", "mathbotaccentwide", "mathover", "mathunder",
]);

// The broader family of modifier characters — combining marks (name "COMBINING",
// or any Combining-* block) and the spacing modifier letters — are likewise
// decorations of a base glyph, not standalone symbols. Excluded from the index.
const MODIFIER_BLOCKS = new Set([
  "Combining Diacritical Marks",
  "Combining Diacritical Marks Extended",
  "Combining Diacritical Marks Supplement",
  "Combining Diacritical Marks for Symbols",
  "Combining Half Marks",
  "Spacing Modifier Letters",
]);

// ---------------------------------------------------------------------------
// Curated semantic categories. A glyph may carry several (arrows∩relations,
// set∩relations, shapes∩binops); ~300 of ~2850 are multi-tagged. Predicates
// read the unicode-math class (folded to `mc` above), the Unicode block, the
// Unicode name, and the glyph itself — never the naming scheme, which is how a
// symbol is written, not what it is. Two families:
//   Letters  (mathalpha, plus the styled digits) — split by *style* + *script*.
//   Symbols  (everything else) — Arrows, Relations, Operators, Binders, Brackets,
//            Shapes, Punctuation, Miscellaneous(fallback). Shapes additionally
//            carry a geometric *kind* (Ellipses / Triangles / Quadrilaterals /
//            Other).

// A letter's style, read from its Unicode name. The alphabet-defining styles
// (double-struck, fraktur, script, monospace) win over slope; fraktur & script
// additionally keep a bold variant (bffrak/bfscr) — Unicode has bold blackletter
// and bold script, but no italic and no bold double-struck/monospace.
function styleOf(name) {
  const bold = name.includes("BOLD");
  if (name.includes("DOUBLE-STRUCK")) return "bb";
  if (name.includes("FRAKTUR") || name.includes("BLACK-LETTER"))
    return bold ? "bffrak" : "frak";
  if (name.includes("SCRIPT")) return bold ? "bfscr" : "scr";
  if (name.includes("MONOSPACE")) return "tt";
  const sans = name.includes("SANS-SERIF");
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

const SHAPE_KW = ["SQUARE", "TRIANGLE", "CIRCLE", "DIAMOND", "LOZENGE", "STAR",
  "PENTAGON", "HEXAGON", "RHOMBUS", "ELLIPSE", "PARALLELOGRAM"];
// Match a shape word as a *whole word* (+ optional plural "S"), so "STAR" tags ★
// but not START-/STARK-named glyphs (␁ SYMBOL FOR START OF HEADING, ⧦ GLEICH
// STARK) and "CIRCLE" doesn't fire on SEMICIRCLE arrows, while "TWO JOINED
// SQUARES" still counts.
const SHAPE_KW_RE = new RegExp(`\\b(${SHAPE_KW.join("|")})S?\\b`);
const SHAPE_BLOCKS = new Set(["Geometric Shapes", "Geometric Shapes Extended"]);
// Reject operators/relations that merely embed a shape word, e.g. √ SQUARE ROOT,
// ⊏ SQUARE IMAGE OF, ≛ STAR EQUALS, ⋆ STAR OPERATOR, ⊛ CIRCLED ...
const SHAPE_EXCLUDE =
  /CIRCLED|SQUARED|ROOT|IMAGE OF|ORIGINAL OF|EQUALS|OPERATOR|MULTIPLICATION|SUBSET/;

// Sub-kind of a shape glyph, by geometric family — the refinement axis shown when
// "Shapes" is selected. A circle is the degenerate ellipse; squares, rectangles,
// diamonds, lozenges, rhombi and parallelograms are four-sided; the black/white
// "pointers" (▶◀) are triangles by another name. Stars, polygons (pentagon,
// hexagon), arcs and anything else fall to "Other". Applied only to Shapes glyphs.
function shapeKind(name) {
  if (/CIRCLE|ELLIPSE|FISHEYE|BULLSEYE|BULLET/.test(name)) return "Ellipses";
  if (/TRIANGLE|POINTER/.test(name)) return "Triangles";
  if (/SQUARE|RECTANGLE|DIAMOND|LOZENGE|RHOMBUS|PARALLELOGRAM/.test(name))
    return "Quadrilaterals";
  return "Other";
}
const PUNCT_KW = ["COMMA", "SEMICOLON", "COLON", "ELLIPSIS", "FULL STOP",
  "PERIOD", "QUESTION MARK", "EXCLAMATION", "INTERROBANG", "MIDDLE DOT", "PRIME",
  "ASTERISM", "LEADER", "DASH", "HYPHEN", "QUOTATION", "PER MILLE",
  "PER TEN THOUSAND", "PILCROW", "REFERENCE MARK"];

// Symbols frequently used as *binders* (they bind a variable), beyond the large
// mathop operators already tagged "Binders" (∑ ∏ ∫ ⋃ ⋂ ⨁ …): the quantifiers
// ∀ ∃ ∄; λ Λ (lambda / type abstraction); Π Σ (dependent function / pair types);
// μ ν (least / greatest fixed points); ε (Hilbert choice); ℩ (definite description).
// Matched by exact glyph, so only the plain letters count — not every styled λ/Π
// variant — and the tag is additive (a Greek binder letter keeps Alphanumeric +
// Greek and gains Binders). λ etc. also live under Alphanumeric; that's intended.
const BINDER_CHARS = new Set(Array.from("∀∃∄λΛΠΣμνε℩"));

// Compute the category tags (+ style/script for letters, kind for shapes) for one
// glyph. `value` is the glyph itself (for the curated binder set); `name` the
// upper-case Unicode name; `mc` the friendly class; `block` the Unicode block.
function classify(value, name, mc, block) {
  const cat = [];
  // unicode-math classes a few punctuation marks mathalpha because they occur
  // *inside* words (the hyphen ‐); route those to the symbol branch below so
  // they land under Punctuation rather than posing as Latin letters.
  const letterish =
    (mc === "Alphabetic" || name.includes("DIGIT")) &&
    !PUNCT_KW.some((k) => name.includes(k));
  if (letterish) {
    const st = styleOf(name);
    const sr = scriptOf(name);
    // Case from the Unicode name (CAPITAL / SMALL); null for caseless glyphs
    // (digits, Hebrew letterlikes, ∇, …).
    const cs = name.includes("CAPITAL") ? "u" : name.includes("SMALL") ? "l" : null;
    const special = st === "bb" || st.includes("frak") || st.includes("scr");
    if (sr === "Greek") cat.push("Greek");
    if (sr === "Digit") cat.push("Numerals");
    if (st === "bb") cat.push("Blackboard");
    if (st.includes("frak")) cat.push("Fraktur");
    if (st.includes("scr")) cat.push("Script");
    if (sr === "Latin" && !special) cat.push("Styled Latin");
    if (cat.length === 0) cat.push("Styled Latin"); // Hebrew letterlikes, etc.
    // Binder LETTERS (λ Λ Π Σ μ ν, ℩) also carry Binders — additive with Greek.
    if (BINDER_CHARS.has(value)) cat.push("Binders");
    // "Alphanumeric" is the always-visible *base* category (it spans letters and
    // numerals); the specific tags above (Greek / Blackboard / …) are refinements
    // shown once it's selected.
    cat.unshift("Alphanumeric");
    return { cat, st, sr, cs, sk: null };
  }
  const isArrow =
    name.includes("ARROW") || name.includes("HARPOON") ||
    (block !== null && block.includes("Arrow"));
  if (isArrow) cat.push("Arrows");
  // For these symbol classes the friendly `mc` label *is* the browse category, so
  // the preview "Class" row and "Categories" row agree (unlike mathalpha→
  // Alphanumeric and mathord→Miscellaneous, which intentionally differ). "Binders"
  // (mathop) = the large variable-binding operators ∑ ∏ ∫ ⋃ ⋂ ⨁; "Operators"
  // (mathbin) = the between-operands signs + − × ÷ ∘ ∧ ∨.
  if (mc === "Relations" && !isArrow) cat.push("Relations");
  if (mc === "Operators") cat.push("Operators");
  if (mc === "Binders") cat.push("Binders");
  // Binder SYMBOLS outside the mathop class — the quantifiers ∀ ∃ ∄ (mathord),
  // which would otherwise fall through to Miscellaneous.
  if (BINDER_CHARS.has(value) && !cat.includes("Binders")) cat.push("Binders");
  if (mc === "Brackets") cat.push("Brackets");
  const isShape =
    (block !== null && SHAPE_BLOCKS.has(block)) ||
    (SHAPE_KW_RE.test(name) && !SHAPE_EXCLUDE.test(name));
  if (isShape) cat.push("Shapes");
  if (mc === "Punctuation" || PUNCT_KW.some((k) => name.includes(k)))
    cat.push("Punctuation");
  if (cat.length === 0) cat.push("Miscellaneous");
  return { cat, st: null, sr: null, cs: null, sk: isShape ? shapeKind(name) : null };
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
  if (cls && ACCENT_CLASSES.has(cls)) continue; // accents are unsupported
  // Drop combining marks & spacing modifier letters — modifiers, not standalone.
  const uName = names[String(cp)] ?? "";
  const uBlock = lookupBlock(cp);
  if (uName.includes("COMBINING") || (uBlock && MODIFIER_BLOCKS.has(uBlock)))
    continue;
  const mc = cls ? MATH_CATEGORY[cls] ?? null : null;

  // For categorisation, use the upper-case Unicode name (falling back to a
  // scheme description) and the first code point's block — available even for
  // the few multi-code-point glyphs that don't get a stored `u`/`b`.
  const desc = entries.find((e) => e.description)?.description ?? "";
  const nameForCat = (names[String(cp)] ?? desc).toUpperCase();
  const { cat, st, sr, cs, sk } = classify(value, nameForCat, mc, lookupBlock(cp));

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
    cs,
    sk,
  });
}

index.sort((a, b) => (a.c ?? 1 / 0) - (b.c ?? 1 / 0));

const outDir = path.join(root, "public");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "search-index.json"), JSON.stringify(index));
console.log(`search-index.json: ${index.length} characters`);
