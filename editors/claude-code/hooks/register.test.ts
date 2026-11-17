import { describe, expect, test } from 'claude-code/testing'
import type { PluginOptions, PromptAutocompleteInput, PromptAutocompleteSuggestion } from 'claude-code'

type Rows = readonly PromptAutocompleteSuggestion[]

// Raise prompt.autocomplete for a prompt box holding `text`, the cursor at its
// end, as Claude Code does as you type; beneath the mod, the engine adds no rows.
// (The kit's typings don't list this event on `$.prompt`; its runtime does.)
const typing = ($: any, on: any) => {
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  return async (text: string): Promise<Rows> => {
    const token = text.split(/\s/).pop() ?? ''
    const e: PromptAutocompleteInput = { text, cursor: text.length, token, start: text.length - token.length }
    return (await $.prompt.autocomplete(e)).suggestions
  }
}

const schemes = (...enabledSchemes: string[]): { options: PluginOptions } => ({ options: { enabledSchemes } })

const UNICODE_MATH = schemes('unicode-math')

describe('defaults (abacus, unicode-math, greek)', () => {
  test('short names complete, each row naming its scheme', async ($, on) => {
    const type = typing($, on)
    expect((await type('\\N'))[0]).toEqual({ text: 'ℕ', label: 'ℕ  \\N', description: 'natural numbers · Abacus' })
    expect((await type('\\all'))[0]?.text).toBe('∀')
    expect((await type('\\alpha'))[0]?.text).toBe('α')
  })

  test('a partial name offers the rest', async ($, on) => {
    expect((await typing($, on)('\\vare'))[0]?.text).toBe('ε')
  })

  test('unicode-math names complete too', async ($, on) => {
    expect((await typing($, on)('\\BbbR'))[0]?.text).toBe('ℝ')
  })
})

describe('unicode-math alone', () => {
  test('the name typed comes first, then longer names that start with it', UNICODE_MATH, async ($, on) => {
    const rows = await typing($, on)('so \\leq')
    expect(rows[0]).toEqual({ text: '≤', label: '≤  \\leq', description: '/leq /le r: less-than-or-equal' })
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.every(r => r.label?.includes('\\leq'))).toBe(true)
  })

  test('an exact match ranks first whatever its case', UNICODE_MATH, async ($, on) => {
    expect((await typing($, on)('\\leftrightarrow'))[0]?.label).toBe('↔  \\leftrightarrow')
  })

  test('text glued before the backslash is written back', UNICODE_MATH, async ($, on) => {
    expect((await typing($, on)('f(\\BbbR'))[0]?.text).toBe('f(ℝ')
  })

  test('at most twelve rows', UNICODE_MATH, async ($, on) => {
    expect((await typing($, on)('\\l')).length).toBe(12)
  })

  test('ASCII values, a bare trigger, or no match: no rows', UNICODE_MATH, async ($, on) => {
    const type = typing($, on)
    expect(await type('\\mathexclam')).toEqual([])
    expect(await type('\\')).toEqual([])
    expect(await type('\\zzzz')).toEqual([])
    expect(await type('alpha')).toEqual([])
  })

  test('a scheme left out offers nothing', UNICODE_MATH, async ($, on) => {
    const type = typing($, on)
    expect(await type('\\alpha')).toEqual([])
    expect(await type('U+3B1')).toEqual([])
  })
})

describe('options', () => {
  test('includeAscii offers ASCII values', { options: { includeAscii: true } }, async ($, on) => {
    expect((await typing($, on)('\\mathexclam'))[0]?.text).toBe('!')
  })

  test('greek, abacus, typst and latex complete', schemes('greek', 'abacus', 'typst', 'latex'), async ($, on) => {
    const type = typing($, on)
    expect((await type('\\alpha'))[0]?.text).toBe('α')
    expect((await type('\\restrict'))[0]?.text).toBe('↾')
    expect((await type('\\arrow.r.double'))[0]?.text).toBe('⇒')
    expect((await type('\\leq'))[0]?.text).toBe('≤')
  })

  test('schemes as one string, as `claude plugin configure` stores them', { options: { enabledSchemes: 'abacus, greek' } as unknown as PluginOptions }, async ($, on) => {
    expect((await typing($, on)('\\alpha'))[0]?.text).toBe('α')
  })

  test('several schemes tag each row with its scheme', schemes('unicode-math', 'greek'), async ($, on) => {
    expect((await typing($, on)('\\alpha'))[0]?.description).toMatch(/· Greek$/)
  })

  test('the same name and glyph from two schemes is one row', schemes('latex', 'unicode-math'), async ($, on) => {
    const rows = await typing($, on)('\\leq')
    expect(rows.filter(r => r.label === '≤  \\leq').length).toBe(1)
    expect(rows[0]?.description).toMatch(/· LaTeX$/)
  })

  test('dedupe off keeps both', { options: { enabledSchemes: ['latex', 'unicode-math'], dedupe: false } }, async ($, on) => {
    expect((await typing($, on)('\\leq')).filter(r => r.label === '≤  \\leq').length).toBe(2)
  })

  test('unicode: U+ and a hex code point', schemes('unicode'), async ($, on) => {
    const type = typing($, on)
    expect(await type('x U+3b1')).toEqual([{ text: 'α', label: 'α  U+3b1', description: 'U+03B1' }])
    expect(await type('U+')).toEqual([])
    expect(await type('U+D800')).toEqual([])
    expect(await type('U+110000')).toEqual([])
  })

  test('ascii: digraphs match with no trigger', schemes('ascii'), async ($, on) => {
    const type = typing($, on)
    expect((await type('a->'))[0]).toEqual({ text: 'a→', label: '→  ->', description: 'rightwards arrow' })
    expect(await type('abc')).toEqual([])
  })
})
