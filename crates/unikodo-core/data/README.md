# Vendored symbol data

`unicode-math-table.tex` is the machine-readable symbol table from the
[`unicode-math`](https://github.com/wspr/unicode-math) LaTeX package by Will
Robertson et al. It maps every supported macro to a Unicode code point, a math
class, and a description — the same data rendered (per font) in the
`unicode-math-symbols.pdf` reference at the repository root.

`unikodo-core` embeds this file at compile time (`include_str!`) and parses it
into the in-memory symbol database (`src/db.rs`).

## Licence

`unicode-math` — and therefore this file — is distributed under the LaTeX
Project Public License (LPPL) v1.3c or later. The original copyright and licence
header is preserved verbatim at the top of the file. This vendored copy is
redistributed under those terms and is **not** covered by unikodo's own licence.

## Updating

From the repository root:

```sh
scripts/update-unicode-math-table.sh   # refetch from upstream
cargo test -p unikodo-core             # validate the parse + counts
```

The `expected_snapshot_count` test guards against accidental corruption; if the
count changes intentionally after an update, adjust it to match.
