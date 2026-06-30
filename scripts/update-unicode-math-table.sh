#!/usr/bin/env bash
# Refresh the vendored unicode-math-table.tex from upstream unicode-math.
#
# After running, validate with:  cargo test -p unikodo-core
# (update the expected_snapshot_count test if the count changed intentionally).
set -euo pipefail

URL="https://raw.githubusercontent.com/wspr/unicode-math/master/unicode-math-table.tex"
DEST="$(cd "$(dirname "$0")/.." && pwd)/crates/unikodo-core/data/unicode-math-table.tex"

echo "Fetching $URL"
curl -fsSL "$URL" -o "$DEST"

count="$(grep -c '^\\UnicodeMathSymbol' "$DEST")"
echo "Wrote $DEST"
echo "Symbols: $count"
echo "Next: cargo test -p unikodo-core"
