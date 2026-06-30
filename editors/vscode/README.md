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

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `unikodo.serverPath` | `unikodo-lsp` | Path to the language server binary. |
| `unikodo.languages` | `["*"]` | Language IDs to enable completions for; `["*"]` means all files. |
