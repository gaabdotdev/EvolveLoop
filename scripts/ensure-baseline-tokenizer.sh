#!/usr/bin/env bash
# Espelha o passo CI "Install measurement tokenizer": venv local com tiktoken==0.8.0.
# Uso: bash scripts/ensure-baseline-tokenizer.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REQ="$ROOT/docs/v22/baseline/requirements.txt"
VENV="$ROOT/docs/v22/baseline/.venv"
PY="$VENV/bin/python"

if [[ ! -f "$REQ" ]]; then
  echo "ensure-baseline-tokenizer: missing $REQ" >&2
  exit 1
fi

if [[ ! -x "$PY" ]]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/pip" install -q -r "$REQ"
"$PY" -c "import tiktoken; assert tiktoken.get_encoding('cl100k_base')"
echo "ensure-baseline-tokenizer: ok ($PY)"
