# unikodo web

The web frontend for [unikodo](../README.md) — a showcase and **symbol browser**
for the Unicode characters unikodo can name for you, across every naming scheme.

Three surfaces (see `unikodo-web-sketch.jpg` in the repo root):

- **Home** (`/`) — the wordmark, a one-line pitch, and a live editor demo that
  auto-types a real `lambdapi`-checked proof (firing completion pop-ups that swap
  each macro for its glyph) and becomes an actual editor the moment you click or
  type. Below it: install and configuration snippets.
- **Browser** (`/browse`) — search plus **intrinsic** facets (Unicode block and
  unicode-math category, and an ASCII toggle) over every character, with a live
  preview rail. Naming schemes are shown, but are not filters — a scheme is how a
  symbol is *named*, not what it *is*.
- **Symbol detail** (`/symbol/[slug]`) — one character: every way to name it
  across schemes, Unicode metadata, encodings (UTF-8/16, HTML, CSS, JS), and
  nearby glyphs. The slug is the value's hex code points joined by `-`.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS v4**
- Built on the **[Andromeda](https://aicanvas.me)** design system's *structure*
  (JetBrains Mono, sharp corners, L-shaped corner markers, a blueprint grid) with
  the **Zedokai** palette (a Monokai Pro port for Zed): **Zedokai Darker (Filter
  Spectrum)** dark and **Zedokai Light (Filter Sun)** light. The theme follows the
  OS `prefers-color-scheme` and can be flipped with the header toggle (persisted
  to `localStorage`). A few **shadcn/ui** primitives sit on the same CSS-variable
  contract in `src/app/globals.css`.

## Develop

```sh
npm install
npm run dev          # http://localhost:3000
npm run build && npm run start
```

## Data

The catalogue is sourced from the same tables the LSP serves — not re-parsed in
JS. Two generated artifacts:

- `src/data/symbols.json` — every symbol + scheme metadata, exported from
  `unikodo-core`. Regenerate after changing the symbol tables:

  ```sh
  cargo run -p unikodo-core --example dump_json > web/src/data/symbols.json
  ```

  `src/data/blocks.json` and `src/data/names.json` are authoritative Unicode
  block ranges and character names (from unicode.org).

- `public/search-index.json` — a slim, client-facing index built from the above
  by `scripts/build-search-index.mjs`, run automatically via the `predev` /
  `prebuild` npm hooks. Gitignored; the browser fetches it.

`src/lib/symbols.ts` groups the flat `(scheme, name)` rows into *characters*
(one per inserted value, with every way to name it) and is imported only by
server components; client code uses the slim index via `src/lib/search.ts`.
