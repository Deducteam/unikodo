# Unikodo for VSCode

A VSCode extension that provides Unicode (math) symbol completions, powered by
the [`unikodo-lsp`](../../crates/unikodo-lsp) language server.

## Install

Install **Unikodo** from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=deducteam.unikodo)
or [Open VSX](https://open-vsx.org/extension/deducteam/unikodo), then start typing
`\…`. On first use the extension downloads the matching `unikodo-lsp` binary from
the repository's [GitHub releases](https://github.com/Deducteam/unikodo/releases)
and caches it — no Rust toolchain required.

To use your own server build instead, set `unikodo.serverPath` to `unikodo-lsp`
(resolved on your `PATH`) or to an absolute path. Build one with
`cargo install unikodo-lsp`.

## Building / running (dev)

Easiest — from the repository root, the helper script builds the server and
extension, wires them together in a throwaway profile (with the `ascii` scheme
enabled and a playground file), and launches an isolated VSCode window with no
other extensions:

```sh
scripts/dev-vscode.sh              # add --no-launch to set up without opening a window
```

Or by hand:

```sh
cd editors/vscode
npm install
npm run compile
```

Then press <kbd>F5</kbd> in VSCode (with this folder open) to launch an Extension
Development Host.

## Usage

Type a backslash followed by a name and accept the completion to insert the
character: `unicode-math` macros (`\leq` → `≤`, `\BbbR` → `ℝ`), or — with those
schemes enabled — `latex` names (`\alpha` → `α`) and Typst `sym` names
(`\arrow.r.double` → `⇒`). The `unicode` scheme inserts any code point (`U+2200` →
`∀`), and `ascii` gives inline digraphs (`=>` → `⇒`). Each scheme's trigger is
configurable (see `unikodo.triggers`); an empty trigger matches the bare name.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `unikodo.serverPath` | `""` | Path to the language server binary. Empty auto-downloads it from GitHub releases; `unikodo-lsp` resolves on your `PATH`; or an absolute path. |
| `unikodo.languages` | `["*"]` | Language IDs to enable completions for; `["*"]` means all files. |
| `unikodo.enabledSchemes` | `["unicode-math"]` | Naming schemes to offer. Built-ins: `unicode-math`, `greek`, `latex`, `typst`, `unicode`, `ascii`. |
| `unikodo.includeAscii` | `false` | Also offer names whose value is a single ASCII character. |
| `unikodo.triggers` | `{}` | Per-scheme trigger overrides, e.g. `{"typst": ";"}`. `""` = no trigger (match the bare name inline). |
| `unikodo.dedupe` | `true` | Collapse identical completions from multiple schemes (first by `enabledSchemes` wins). |
