# Unikodo for Claude Code

A [Claude Code](https://claude.com/claude-code) mod that provides Unicode (math)
symbol completions in the prompt box: type `\leq` and take `≤` from the list
under the prompt, as you would a file or command suggestion.

## Install

At a Claude Code prompt:

```
/plugin install unikodo --marketplace Deducteam/unikodo
```

Answer `y` to add the marketplace, then pick a scope (user installs it for every
session). Nothing else to download: the mod carries the symbol database itself.
Update with `claude plugin update unikodo@unikodo`.

## Installing the mod (dev)

Add your checkout as a marketplace and install from it; Claude Code then reads
the mod from this folder, so `/reload-plugins` picks up an edit:

```sh
claude plugin marketplace add /path/to/unikodo
claude plugin install unikodo@unikodo
```

Run the tests with `claude plugin test editors/claude-code` and check the mod
with `claude plugin validate .` from the repository root.

## Usage

Type a trigger and a name, e.g. `\all`, `\N`, `\alpha`, and pick a row (Tab): it replaces
the `\name` with the character, keeping any text glued in front of it
(`f(\alpha` → `f(α`). Rows appear once a letter follows the trigger; at most
twelve show at a time, the name you typed in full first, then shorter names,
then alphabetical, as the language server ranks them for an editor.

## Configuration

The same options as the language server, set when you install the mod, later
with `/plugin configure unikodo@unikodo`, or in `settings.json`:

```json
{
  "pluginConfigs": {
    "unikodo@unikodo": {
      "options": {
        "enabledSchemes": ["abacus", "unicode-math", "greek"],
        "includeAscii": false,
        "dedupe": true
      }
    }
  }
}
```

Built-in schemes: `unicode-math`, `greek`, `latex`, `typst`, `abacus` (trigger
`\`), `unicode` (code points, trigger `U+`), and `ascii` (inline `->` → `→`).
The mod turns on `abacus`, `unicode-math` and `greek` by default, wider than the
server's `unicode-math` alone, so short names like `\N` (ℕ), `\all` (∀) and
`\alpha` (α) work straight after installing. Each row names its scheme, and
identical completions collapse to the first in `enabledSchemes` order
(`dedupe`).

## Notes

Claude Code's prompt is not an LSP client, so the mod is a port of the server's
completion logic (`completions_at` in `crates/unikodo-lsp`) to a Claude Code
hooks module, over a table generated from `unikodo-core`:

```sh
scripts/update-claude-code-symbols.py   # rewrites hooks/symbols.ts; CI checks it is current
```

Differences from the editors: `triggers` overrides are not supported (each
scheme uses its default trigger), and `abacus`'s `\esc` inserts the pair `«»`
with the cursor after it, since a prompt-box completion cannot place the cursor.
