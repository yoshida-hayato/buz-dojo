#!/usr/bin/env bash
# Client bundle static scan: X secret names and stray Firebase apiKey literals.
# Does not read or touch Firebase Secrets. ASCII-only output.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v rg >/dev/null 2>&1; then
  echo "FAIL: ripgrep (rg) not found in PATH"
  exit 1
fi

# Hosting-facing trees only (exclude server functions and node_modules).
RG_BASE=(
  rg -n --no-heading
  --glob '*.js'
  --glob '*.html'
  --glob '!node_modules/**'
  --glob '!functions/**'
)

FAIL=0
report() {
  local label="$1"
  shift
  local out
  if out="$("$@" 2>/dev/null)" && [ -n "$out" ]; then
    echo "== ${label} =="
    echo "$out"
    echo
    FAIL=1
  fi
}

# SAP / SEISAN secret identifiers must not appear in client bundles.
report "X_API_KEY (client leak)" \
  "${RG_BASE[@]}" 'X_API_KEY' .

report "X_API_SECRET (client leak)" \
  "${RG_BASE[@]}" 'X_API_SECRET' .

report "X_ACCESS_TOKEN (client leak)" \
  "${RG_BASE[@]}" 'X_ACCESS_TOKEN' .

report "X_ACCESS_SECRET (client leak)" \
  "${RG_BASE[@]}" 'X_ACCESS_SECRET' .

report "X_SEISAN_ prefix (client leak)" \
  "${RG_BASE[@]}" 'X_SEISAN_' .

# Firebase Web apiKey literal: only config/firebase-config.js may define it.
report "apiKey literal outside config/firebase-config.js" \
  "${RG_BASE[@]}" 'apiKey:[[:space:]]*"AIza' . \
  --glob '!config/firebase-config.js'

if [ "$FAIL" -ne 0 ]; then
  echo "FAIL: client secret scan found hits (see above)."
  exit 1
fi

echo "OK: client secret scan clean (X_* names and stray apiKey literals)."
