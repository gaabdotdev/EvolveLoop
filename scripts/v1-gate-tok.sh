#!/usr/bin/env bash
# V1-GATE-TOK — token economy ceiling gate harness (attempt wrapper).
# Repo-local only. No rm -rf of user data; no force push / hard reset.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}/orchestrator"

echo "=== V1-GATE-TOK: npm run build ==="
npm run build

echo "=== V1-GATE-TOK: vitest (gate + token technique units) ==="
npx vitest run \
  tests/unit/v1-gate-tok.test.ts \
  tests/unit/v1-crystallizer.test.ts \
  tests/unit/v1-stateless-snapshot.test.ts \
  tests/unit/v1-prefix-pinning.test.ts \
  tests/unit/v1-nl-compress.test.ts \
  tests/unit/v1-constrained-decoding.test.ts \
  tests/unit/v1-speculative-pipeline.test.ts \
  tests/unit/v1-brain-hand.test.ts \
  tests/unit/v1-rag-prune.test.ts \
  tests/unit/v1-tombstone.test.ts \
  tests/unit/v1-context-slicing.test.ts

cd "${REPO_ROOT}"
echo "=== V1-GATE-TOK: measure + write docs/v1/evidence/<ts>/ ==="
node scripts/v1-gate-tok.mjs
EC=$?

echo "=== git diff --stat ==="
git diff --stat || true

echo "harness_exit=${EC}"
exit "${EC}"
