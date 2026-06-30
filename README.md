# unikodo

**Flexible and friendly tooling for Unicode.**

unikodo helps you *type* Unicode — especially the non-ASCII mathematical symbols
used by proof assistants, LaTeX, and friends — by completing familiar
`unicode-math` macros into the characters themselves. Type `\leq` and accept the
completion to get `≤`; type `\BbbR` to get `ℝ`.

At its core is a small, editor-agnostic **LSP server**. Thin **VSCode** and
**Zed** extensions drive it, and any LSP-capable editor (Neovim, Emacs, …) can
use it too.

## Repository layout

```
unikodo/
├── crates/
│   ├── unikodo-core/    # symbol database + completion matching (no I/O)
│   │   └── data/unicode-math-table.tex   # vendored symbol data (LPPL)
│   └── unikodo-lsp/     # the `unikodo-lsp` LSP server binary
├── editors/
│   ├── vscode/          # VSCode extension (TypeScript)
│   └── zed/             # Zed extension (Rust → WebAssembly)
├── scripts/             # maintenance scripts
└── unicode-math-symbols.pdf   # human-readable symbol reference
```

## How it works

The symbol set comes from the [`unicode-math`](https://github.com/wspr/unicode-math)
package's `unicode-math-table.tex`, which maps each macro to a Unicode code
point, a math class, and a description. (The committed `unicode-math-symbols.pdf`
is the same data rendered per-font, for human browsing.) `unikodo-core` embeds
this table at compile time and parses it into an in-memory database.

Completion is triggered by a backslash: after `\`, the server offers macros
matching what you have typed and, on acceptance, replaces the `\macro` with the
character. By default only **non-ASCII** characters are offered (a completion for
`\lparen` → `(` is not worth much).

> **A note on names.** Macro names follow `unicode-math`'s scheme. Many are the
> familiar ones (`\leq`, `\rightarrow`, `\forall`, `\in`, `\BbbR`, …), but Greek
> and alphabetic letters use systematic names — for example α is `\mupalpha` and
> ℝ is `\BbbR`. Browse `unicode-math-symbols.pdf` to find a symbol's macro.

## Naming schemes

unikodo is built around multiple **naming schemes** — different vocabularies you
can type for the same characters — and lets you choose which are active:

| Scheme | Trigger | Examples |
| --- | --- | --- |
| `unicode-math` | prefix (default `\`) | `\leq` → `≤`, `\BbbR` → `ℝ` |
| `typst` | prefix (default `\`) | `\arrow.r.double` → `⇒`, `\alpha` → `α`, `\eq.not` → `≠` |
| `ascii` | inline digraph | `=>` → `⇒`, `->` → `→`, `<=` → `≤` |

The `typst` scheme uses [Typst](https://typst.app)'s `sym` names (via the
[`codex`](https://crates.io/crates/codex) crate) — dotted, order-independent
modifiers like `arrow.r.double`. It complements unicode-math nicely (e.g. plain
`\alpha`, which unicode-math lacks). The `ascii` set is a small starter list.
Prefix schemes share the `\` trigger by default, but each prefix is configurable.
Adding a scheme is just a name→character source tagged with a scheme id plus a
trigger model (prefix or inline operator).

## Configuration

Settings reach the server via `initializationOptions`, and live updates via
`workspace/didChangeConfiguration`:

| Key | Default | Meaning |
| --- | --- | --- |
| `enabledSchemes` | `["unicode-math"]` | Which schemes to offer, e.g. `["unicode-math", "typst"]`. `ascii` is opt-in (it registers many trigger characters). |
| `includeAscii` | `false` | Also offer names whose value is a single ASCII character. |
| `prefixes` | `{}` | Per-scheme prefix overrides, e.g. `{"typst": ";"}`. Prefix schemes default to `\`. |

In **VSCode**, set `unikodo.enabledSchemes` / `unikodo.includeAscii` /
`unikodo.prefixes`. In **Zed**, put them under `lsp.unikodo.initialization_options`
in your settings. For a raw LSP client, pass them as `initializationOptions` at
initialize.

## Build

```sh
cargo build --release   # builds unikodo-core + unikodo-lsp
cargo test              # runs the workspace tests
```

Install the server onto your `PATH`:

```sh
cargo install --path crates/unikodo-lsp
```

The binary is `unikodo-lsp`; it speaks LSP over stdio.

## Editor setup

### VSCode

See [`editors/vscode/README.md`](editors/vscode/README.md). Build the extension,
make sure `unikodo-lsp` is on your `PATH` (or set `unikodo.serverPath`), and
start typing `\…`.

### Zed

See [`editors/zed/README.md`](editors/zed/README.md). Install it as a dev
extension; it launches `unikodo-lsp` from your `PATH`.

### Any LSP client (Neovim, Emacs, …)

Run `unikodo-lsp` over stdio. For example, with Neovim's built-in LSP:

```lua
vim.lsp.start({ name = "unikodo", cmd = { "unikodo-lsp" } })
```

## Updating the symbol table

```sh
scripts/update-unicode-math-table.sh   # refetch unicode-math-table.tex
cargo test -p unikodo-core             # validate (adjust the count test if needed)
```

## Status

Early stage. Working today: the scheme-aware symbol database and an LSP server
serving completions across configurable naming schemes — **unicode-math** macros,
**Typst** `sym` names, and **ASCII** digraphs — plus VSCode and Zed extension
shims. Natural next steps include familiar aliases (`\alpha` for α via a dedicated
scheme), description/fuzzy search, and prebuilt server binaries for the
extensions to download.

## Licensing

unikodo is licensed under the [MIT License](LICENSE). The vendored
`crates/unikodo-core/data/unicode-math-table.tex` is part of `unicode-math` and
is distributed under the LaTeX Project Public License (LPPL) v1.3c or later; see
[`crates/unikodo-core/data/README.md`](crates/unikodo-core/data/README.md).
