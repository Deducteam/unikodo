// Server-side symbol data layer.
//
// Loads the symbol database exported from `unikodo-core`
// (`cargo run -p unikodo-core --example dump_json`) and groups the flat
// (scheme, name) entries into *characters*: one entry per inserted value, with
// every way to name it across schemes. Enriched with authoritative Unicode
// block + character names fetched from unicode.org.
//
// This module imports the full ~700KB dataset, so import it only from Server
// Components / build scripts — never from a Client Component (the browser uses
// the slim `/search-index.json` instead).

import rawData from "@/data/symbols.json";
import namesData from "@/data/names.json";
import blocksData from "@/data/blocks.json";
import { schemeRank } from "@/lib/schemes";
import { valueToSlug } from "@/lib/slug";

export interface RawSymbol {
  scheme: string;
  name: string;
  value: string;
  class: string | null;
  description: string;
  codepoint: number | null;
  usv: string | null;
  ascii: boolean;
}

export interface SchemeMeta {
  id: string;
  display: string;
  description: string;
  defaultTrigger: string;
}

interface SymbolDB {
  schemes: SchemeMeta[];
  symbols: RawSymbol[];
}

interface Block {
  start: number;
  end: number;
  name: string;
}

const db = rawData as unknown as SymbolDB;
const names = namesData as Record<string, string>;
const blocks = (blocksData as Block[]).slice().sort((a, b) => a.start - b.start);

/** One way to name a character: a name within a scheme. */
export interface NameEntry {
  scheme: string;
  name: string;
  class: string | null;
  description: string;
}

/** A single character (inserted value) and every way to name it. */
export interface CharacterEntry {
  /** The inserted text — usually one character, occasionally char + selector. */
  value: string;
  /** URL slug: hex code points joined by "-". */
  slug: string;
  /** Code points making up the value. */
  codepoints: number[];
  /** Primary (first) code point. */
  codepoint: number;
  /** "U+XXXX" of the primary code point. */
  usv: string;
  /** Authoritative Unicode name (e.g. "LESS-THAN OR EQUAL TO"), if known. */
  unicodeName: string | null;
  /** Unicode block name, if known. */
  block: string | null;
  /** unicode-math math class (e.g. "mathrel"), if any. */
  mathClass: string | null;
  /** Whether the value is a single ASCII character. */
  isAscii: boolean;
  /** Every (scheme, name) producing this value, ordered by scheme then name. */
  names: NameEntry[];
  /** Distinct scheme ids that name this character, in canonical order. */
  schemes: string[];
  /** Best human-readable label. */
  displayName: string;
}

/** Friendly labels for unicode-math math classes. */
export const CLASS_LABELS: Record<string, string> = {
  mathord: "Ordinary",
  mathop: "Operator",
  mathbin: "Binary operator",
  mathrel: "Relation",
  mathopen: "Opening",
  mathclose: "Closing",
  mathpunct: "Punctuation",
  mathalpha: "Alphabetic",
  mathfence: "Fence",
  mathaccent: "Accent",
  mathaccentwide: "Wide accent",
  mathaccentoverlay: "Overlay accent",
  mathbotaccent: "Bottom accent",
  mathbotaccentwide: "Wide bottom accent",
  mathover: "Over symbol",
  mathunder: "Under symbol",
};

function lookupBlock(cp: number): string | null {
  // Binary search for the last block whose start <= cp.
  let lo = 0;
  let hi = blocks.length - 1;
  let found: Block | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid].start <= cp) {
      found = blocks[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found && cp <= found.end ? found.name : null;
}

/** Pull a readable phrase out of a unicode-math description like
 * "/leq /le r: less-than-or-equal" -> "less-than-or-equal". */
function parseUnicodeMathDesc(desc: string): string | null {
  if (!desc) return null;
  const m = desc.match(/:\s*(.+)$/);
  const text = (m ? m[1] : desc).trim();
  return text.length ? text : null;
}

function buildCharacters(): CharacterEntry[] {
  const groups = new Map<string, RawSymbol[]>();
  for (const s of db.symbols) {
    const g = groups.get(s.value);
    if (g) g.push(s);
    else groups.set(s.value, [s]);
  }

  const chars: CharacterEntry[] = [];
  for (const [value, entries] of groups) {
    const codepoints = Array.from(value).map((c) => c.codePointAt(0)!);
    const codepoint = codepoints[0];
    const usv =
      codepoints.length === 1
        ? `U+${codepoint.toString(16).toUpperCase().padStart(4, "0")}`
        : codepoints
            .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`)
            .join(" ");

    const unicodeName =
      codepoints.length === 1 ? names[String(codepoint)] ?? null : null;

    const names_ = entries
      .map((e) => ({
        scheme: e.scheme,
        name: e.name,
        class: e.class,
        description: e.description,
      }))
      .sort(
        (a, b) =>
          schemeRank(a.scheme) - schemeRank(b.scheme) ||
          a.name.localeCompare(b.name),
      );

    const schemes = [...new Set(names_.map((n) => n.scheme))].sort(
      (a, b) => schemeRank(a) - schemeRank(b),
    );

    const um = entries.find((e) => e.scheme === "unicode-math");
    const latex = entries.find((e) => e.scheme === "latex");
    const mathClass = um?.class ?? null;

    const displayName =
      unicodeName ??
      (latex?.description || null) ??
      parseUnicodeMathDesc(um?.description ?? "") ??
      names_[0].name;

    chars.push({
      value,
      slug: valueToSlug(value),
      codepoints,
      codepoint,
      usv,
      unicodeName,
      block: codepoints.length === 1 ? lookupBlock(codepoint) : null,
      mathClass,
      isAscii: entries[0].ascii,
      names: names_,
      schemes,
      displayName,
    });
  }

  // Stable, pleasant order: by primary code point.
  chars.sort((a, b) => a.codepoint - b.codepoint);
  return chars;
}

let _characters: CharacterEntry[] | null = null;
let _bySlug: Map<string, CharacterEntry> | null = null;

export function allCharacters(): CharacterEntry[] {
  if (!_characters) _characters = buildCharacters();
  return _characters;
}

function bySlug(): Map<string, CharacterEntry> {
  if (!_bySlug) {
    _bySlug = new Map(allCharacters().map((c) => [c.slug, c]));
  }
  return _bySlug;
}

export function getCharacter(slug: string): CharacterEntry | undefined {
  return bySlug().get(slug);
}

/** Total number of distinct characters in the catalogue. */
export function characterCount(): number {
  return allCharacters().length;
}

/** Characters that share a block with the given one (for "related"). */
export function getRelated(entry: CharacterEntry, limit = 24): CharacterEntry[] {
  if (!entry.block) return [];
  return allCharacters()
    .filter((c) => c.block === entry.block && c.value !== entry.value)
    .slice(0, limit);
}
