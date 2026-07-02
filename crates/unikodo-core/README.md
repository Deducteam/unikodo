# unikodo-core

The symbol database and completion-matching engine behind
[unikodo](https://github.com/Deducteam/unikodo) — a language server that turns
short names (`\alpha`, `\BbbR`, `pi`) into the Unicode characters they denote.

This crate embeds a table of Unicode (math) symbols and their names across
several schemes (unicode-math, LaTeX, Typst, Unicode code points, ASCII) and
provides the prefix matching the server uses. The LSP server lives in
[`unikodo-lsp`](https://crates.io/crates/unikodo-lsp); editor extensions and
docs are in the [repository](https://github.com/Deducteam/unikodo).
