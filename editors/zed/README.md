# Unikodo for Zed

A Zed extension that provides Unicode (math) symbol completions by launching the
[`unikodo-lsp`](../../crates/unikodo-lsp) language server.

## Prerequisites

`unikodo-lsp` must be on your `PATH`. From the repository root:

```sh
cargo install --path crates/unikodo-lsp
```

## Installing the extension (dev)

1. In Zed, open the command palette and run **`zed: install dev extension`**.
2. Select this directory (`editors/zed`).

Zed will compile the extension to WebAssembly and load it.

## Usage

By default the server is attached to **Markdown** and **Plain Text** documents.
Type a backslash followed by a `unicode-math` macro name (e.g. `\leq`, `\BbbR`)
and accept the completion to insert the character.

To enable it for more languages, add them under `[language_servers.unikodo]` in
`extension.toml` and reinstall the dev extension.

## Configuration

Configure naming schemes in your Zed `settings.json`:

```json
{
  "lsp": {
    "unikodo": {
      "initialization_options": {
        "enabledSchemes": ["unicode-math", "latex", "lean", "rocq", "typst", "ascii"],
        "includeAscii": false,
        "prefixes": { "typst": ";" },
        "dedupe": true
      }
    }
  }
}
```

Built-in schemes: `unicode-math`, `latex`, `lean`, `rocq`, `typst` (all prefix
`\`), and `ascii` (inline `=>` → `⇒`). `prefixes` overrides the prefix per scheme;
`dedupe` (default `true`) collapses identical completions across schemes. Only
`unicode-math` is on by default.

## Notes

This extension is built with [`zed_extension_api`](https://crates.io/crates/zed_extension_api)
and is intentionally kept out of the top-level Cargo workspace (it targets
`wasm32`). A natural enhancement is to download a prebuilt `unikodo-lsp` from
GitHub releases when it is not already installed.
