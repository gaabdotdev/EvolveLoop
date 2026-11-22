#!/usr/bin/env bash
# V1-GATE-COMPAT — FreeLLMAPI + adapters + fault injection harness.
# Repo-local only. No rm -rf of user data; no force push / hard reset.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}/orchestrator"

echo "=== V1-GATE-COMPAT: npm run build ==="
npm run build

echo "=== V1-GATE-COMPAT: vitest gate suite ==="
npx vitest run --config vitest.v1-gate-compat.config.ts
EC=$?

cd "${REPO_ROOT}"
echo "=== V1-GATE-COMPAT: write docs/v1/evidence/gate-compat-<ts>/ ==="
node scripts/v1-gate-compat.mjs --vitest-exit="${EC}"
DOC_EC=$?

echo "=== git diff --stat ==="
git diff --stat || true

# Prefer vitest exit; doc writer non-zero also fails the gate
FINAL=0
if [[ "${EC}" -ne 0 ]]; then FINAL="${EC}"; fi
if [[ "${DOC_EC}" -ne 0 && "${FINAL}" -eq 0 ]]; then FINAL="${DOC_EC}"; fi

echo "harness_exit=${FINAL} vitest_exit=${EC} doc_exit=${DOC_EC}"
exit "${FINAL}"
