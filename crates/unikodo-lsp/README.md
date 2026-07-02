# unikodo-lsp

The [unikodo](https://github.com/Deducteam/unikodo) language server: Unicode
(math) symbol completions for any LSP-capable editor. Type a short name and get
the character — `\alpha` → α, `\BbbR` → ℝ, `\sum` → ∑ — across the unicode-math,
LaTeX, Typst, Unicode code-point, and ASCII naming schemes.

```sh
cargo install unikodo-lsp
```

It speaks LSP over stdio. Point any editor's LSP client at the `unikodo-lsp`
binary, or install the VS Code / Zed extensions (which download it for you).
Configuration (naming schemes, triggers, ASCII, dedupe) is documented in the
[repository](https://github.com/Deducteam/unikodo).
