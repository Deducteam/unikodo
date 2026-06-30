# Unikodo for VSCode

A VSCode extension that provides Unicode (math) symbol completions by launching
the [`unikodo-lsp`](../../crates/unikodo-lsp) language server.

## Prerequisites

`unikodo-lsp` must be available. From the repository root:

```sh
cargo install --path crates/unikodo-lsp
```

This installs it onto your Cargo `bin` directory (usually on your `PATH`). If you
keep it elsewhere, set `unikodo.serverPath`.

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

Type a backslash followed by a `unicode-math` macro name — e.g. `\leq`, `\BbbR`,
`\rightarrow` — and accept the completion to insert the character (`≤`, `ℝ`, `→`).
Enable the `ascii` scheme to also get inline digraphs like `=>` → `⇒`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `unikodo.serverPath` | `unikodo-lsp` | Path to the language server binary. |
| `unikodo.languages` | `["*"]` | Language IDs to enable completions for; `["*"]` means all files. |
| `unikodo.enabledSchemes` | `["unicode-math"]` | Naming schemes to offer. Built-ins: `unicode-math`, `ascii`. |
| `unikodo.includeAscii` | `false` | Also offer names whose target character is ASCII. |
