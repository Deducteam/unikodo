// unikodo for Claude Code: completions in the prompt box, as the LSP serves
// them to an editor. Claude Code's prompt is no LSP client, so this module is a
// port of the server's `completions_at` (crates/unikodo-lsp/src/main.rs) over
// the table in ./symbols.ts, which scripts/update-claude-code-symbols.py
// generates from unikodo-core.
import type { PluginOptions, PromptAutocompleteSuggestion, Register } from 'claude-code'
import { SCHEMES, TABLES, type Scheme } from './symbols'

// The rows offered at once; a one-letter query matches hundreds of names.
const MAX_ROWS = 12

type Item = { sort: string; typed: string; value: string; row: PromptAutocompleteSuggestion }

export const register: Register = (on, options) => {
  const config = readConfig(options)

  on('prompt.autocomplete', async ($, e, next) => {
    const below = (await next(e)).suggestions
    return { suggestions: [...complete(e.token, config), ...below] }
  })
}

type Config = {
  schemes: readonly Scheme[]
  includeAscii: boolean
  dedupe: boolean
  // The name alphabet of each enabled scheme that has no trigger (`ascii`).
  bareChars: ReadonlyMap<string, ReadonlySet<string>>
}

function readConfig(options: PluginOptions): Config {
  // A list from settings.json, or one string as `claude plugin configure`
  // stores it ("abacus, unicode-math").
  const raw = options.enabledSchemes ?? ['unicode-math']
  const wanted = typeof raw === 'string' ? raw.split(/[\s,]+/).filter(Boolean) : Array.isArray(raw) ? raw : []
  const schemes = [...new Set(wanted)].flatMap(id => SCHEMES.filter(s => s.id === id))
  const bareChars = new Map(
    schemes
      .filter(s => s.trigger === '')
      .map(s => [s.id, new Set((TABLES[s.id] ?? []).flatMap(([name]) => [...name]))] as const),
  )
  return {
    schemes,
    includeAscii: options.includeAscii === true,
    dedupe: options.dedupe !== false,
    bareChars,
  }
}

/**
 * The rows for `token`, the text from the last whitespace to the cursor, which a
 * taken row replaces whole: what precedes the trigger is written back in front
 * of the glyph.
 */
function complete(token: string, config: Config): PromptAutocompleteSuggestion[] {
  const tagged = config.schemes.length > 1
  let items: Item[] = []

  for (const scheme of config.schemes) {
    const found = tokenFor(token, scheme, config)
    if (!found) continue
    const lead = token.slice(0, found.start)

    if (scheme.id === 'unicode') {
      const item = codepointItem(found.query, scheme, lead, tagged)
      if (item) items.push(item)
      continue
    }
    // The LSP lists every name for a bare trigger and lets the editor filter;
    // a prompt has no room for that, so wait for the first letter.
    if (found.query === '') continue

    for (const [name, value, about, ascii] of TABLES[scheme.id] ?? []) {
      if ((config.includeAscii || !ascii) && name.startsWith(found.query)) {
        const typed = scheme.trigger + name
        items.push({
          sort: sortKey(name, found.query),
          typed,
          value,
          row: { text: lead + value, label: label(value, typed), description: describe(about, scheme, tagged) },
        })
      }
    }
  }

  // Identical completions (same typed name and glyph) from several schemes
  // collapse to the first by enabledSchemes order; different names for one
  // glyph (`\le`, `\leq`) stay.
  if (config.dedupe) {
    const seen = new Set<string>()
    items = items.filter(({ typed, value }) => {
      const key = `${typed}\u0000${value}`
      return seen.has(key) ? false : (seen.add(key), true)
    })
  }

  // The order an editor gives the LSP's sortText (stable, so ties keep the
  // enabledSchemes order).
  items.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
  return items.slice(0, MAX_ROWS).map(item => item.row)
}

/** The query after the scheme's trigger, and where the replaced text starts. */
function tokenFor(token: string, scheme: Scheme, config: Config): { query: string; start: number } | null {
  if (scheme.trigger !== '') {
    const start = token.lastIndexOf(scheme.trigger)
    return start < 0 ? null : { query: token.slice(start + scheme.trigger.length), start }
  }
  // No trigger: the longest run of the scheme's name characters at the cursor.
  const chars = config.bareChars.get(scheme.id)
  let start = token.length
  while (start > 0 && chars?.has(token[start - 1]!)) start--
  return start === token.length ? null : { query: token.slice(start), start }
}

/** An exact match first (ignoring case), then shorter names, then alphabetical. */
function sortKey(name: string, query: string): string {
  const rank = name.toLowerCase() === query.toLowerCase() ? '0' : '1'
  return `${rank}${String(Math.min(name.length, 9999)).padStart(4, '0')}${name}`
}

/** `U+` and a hex code point: the one character it names. */
function codepointItem(hex: string, scheme: Scheme, lead: string, tagged: boolean): Item | null {
  if (!/^[0-9A-Fa-f]+$/.test(hex)) return null
  const cp = parseInt(hex, 16)
  if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null
  const value = String.fromCodePoint(cp)
  const typed = scheme.trigger + hex
  const usv = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
  return {
    sort: cp.toString(16).toUpperCase().padStart(8, '0'),
    typed,
    value,
    row: { text: lead + value, label: label(value, typed), description: describe(usv, scheme, tagged) },
  }
}

// A control or format character would break the row's one line: show the name alone.
function label(value: string, typed: string): string {
  return /\p{C}/u.test(value) ? typed : `${value}  ${typed}`
}

function describe(about: string, scheme: Scheme, tagged: boolean): string {
  return tagged ? (about ? `${about} · ${scheme.display}` : scheme.display) : about
}
