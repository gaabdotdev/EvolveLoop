#!/usr/bin/env bash
# Install `evolve` onto PATH via symlink to repo bin/evolve (V0-CLI-01).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_SRC="${ROOT}/bin/evolve"
TARGET_DIR="${EVOLVE_INSTALL_DIR:-${HOME}/.local/bin}"

if [[ ! -x "${BIN_SRC}" ]]; then
  chmod +x "${BIN_SRC}"
fi

if [[ ! -f "${ROOT}/orchestrator/dist/cli/evolve.js" ]]; then
  echo "Building orchestrator…"
  (cd "${ROOT}/orchestrator" && npm run build)
fi

mkdir -p "${TARGET_DIR}"
ln -sfn "${BIN_SRC}" "${TARGET_DIR}/evolve"
echo "Installed: ${TARGET_DIR}/evolve → ${BIN_SRC}"
echo "Ensure ${TARGET_DIR} is on PATH."
echo "State dir per workspace: <cwd>/.evolveloop/"
