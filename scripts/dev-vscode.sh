#!/usr/bin/env bash
# Launch a minimal, isolated VSCode instance with the unikodo extension loaded,
# for manual testing.
#
# It builds the server + extension, points the extension at the freshly built
# unikodo-lsp binary, disables all *other* extensions, and uses a throwaway user
# profile (./.dev-vscode) so your real VSCode configuration is left untouched.
#
# Usage:   scripts/dev-vscode.sh             # build, set up profile, launch
#          scripts/dev-vscode.sh --no-launch # do everything except launch (dry run)
# Override the editor binary with e.g.  CODE=code-insiders scripts/dev-vscode.sh
# (also works with VSCodium: CODE=codium).
set -euo pipefail

LAUNCH=1
[ "${1:-}" = "--no-launch" ] && LAUNCH=0

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/editors/vscode"
PROFILE_DIR="$ROOT/.dev-vscode"
SCRATCH_DIR="$PROFILE_DIR/scratch"
USER_DATA_DIR="$PROFILE_DIR/user-data"
SETTINGS_DIR="$USER_DATA_DIR/User"

CODE="${CODE:-code}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: '$1' not found on PATH." >&2; exit 1; }; }
need cargo
need npm
if [ "$LAUNCH" = 1 ] && ! command -v "$CODE" >/dev/null 2>&1; then
  echo "error: '$CODE' (the VSCode CLI) not found on PATH." >&2
  echo "Install VSCode's shell command, or set CODE=/path/to/code (e.g. code-insiders, codium)." >&2
  exit 1
fi

echo ">> building unikodo-lsp (release)…"
cargo build --release -p unikodo-lsp --manifest-path "$ROOT/Cargo.toml"
SERVER="$ROOT/target/release/unikodo-lsp"
[ -x "$SERVER" ] || { echo "error: server binary not found at $SERVER" >&2; exit 1; }

echo ">> building the VSCode extension…"
(
  cd "$EXT_DIR"
  [ -d node_modules ] || npm install
  npm run compile
)

echo ">> writing isolated profile at $PROFILE_DIR …"
mkdir -p "$SETTINGS_DIR" "$SCRATCH_DIR"
cat >"$SETTINGS_DIR/settings.json" <<JSON
{
  "unikodo.serverPath": "$SERVER",
  "unikodo.enabledSchemes": ["unicode-math", "ascii"],
  "unikodo.includeAscii": false,
  "unikodo.languages": ["*"],
  "editor.mouseWheelZoom": true,
  "telemetry.telemetryLevel": "off",
  "update.mode": "none",
  "extensions.autoCheckUpdates": false,
  "workbench.startupEditor": "none",
  "window.title": "unikodo dev host"
}
JSON

# Zoom only the editor (buffer) font, never the whole UI:
#   Ctrl+scroll    -> editor.mouseWheelZoom (set above)
#   Ctrl + / - / 0 -> editor font zoom in/out/reset (rebound from the default UI zoom)
cat >"$SETTINGS_DIR/keybindings.json" <<'JSON'
[
  { "key": "ctrl+=",               "command": "editor.action.fontZoomIn" },
  { "key": "ctrl+shift+=",         "command": "editor.action.fontZoomIn" },
  { "key": "ctrl+numpad_add",      "command": "editor.action.fontZoomIn" },
  { "key": "ctrl+-",               "command": "editor.action.fontZoomOut" },
  { "key": "ctrl+numpad_subtract", "command": "editor.action.fontZoomOut" },
  { "key": "ctrl+0",               "command": "editor.action.fontZoomReset" },
  { "key": "ctrl+numpad0",         "command": "editor.action.fontZoomReset" },
  { "key": "ctrl+=",               "command": "-workbench.action.zoomIn" },
  { "key": "ctrl+shift+=",         "command": "-workbench.action.zoomIn" },
  { "key": "ctrl+numpad_add",      "command": "-workbench.action.zoomIn" },
  { "key": "ctrl+-",               "command": "-workbench.action.zoomOut" },
  { "key": "ctrl+numpad_subtract", "command": "-workbench.action.zoomOut" },
  { "key": "ctrl+0",               "command": "-workbench.action.zoomReset" },
  { "key": "ctrl+numpad0",         "command": "-workbench.action.zoomReset" }
]
JSON

# Playground file — created once, so your edits survive re-runs.
PLAYGROUND="$SCRATCH_DIR/playground.txt"
if [ ! -f "$PLAYGROUND" ]; then
  cat >"$PLAYGROUND" <<'TXT'
unikodo dev playground — type a name and accept the completion.

unicode-math (type a backslash, then the macro):
  \leq         ->  ≤
  \BbbR        ->  ℝ
  \rightarrow  ->  →
  \mupalpha    ->  α

ascii digraphs (this profile enables the "ascii" scheme):
  =>   ->  ⇒
  ->   ->  →
  <=   ->  ≤
  |->  ->  ↦

Scratch area (try typing here):

TXT
fi

CMD=(
  "$CODE"
  --user-data-dir "$USER_DATA_DIR"
  --extensions-dir "$PROFILE_DIR/extensions"
  --disable-extensions
  --extensionDevelopmentPath "$EXT_DIR"
  --new-window
  "$PLAYGROUND"
)

echo "   server : $SERVER"
echo "   profile: $PROFILE_DIR  (delete it to reset)"
if [ "$LAUNCH" = 0 ]; then
  echo ">> --no-launch: skipping editor start. Command would be:"
  printf '   %q' "${CMD[@]}"
  echo
  exit 0
fi

echo ">> launching VSCode…"
"${CMD[@]}"
