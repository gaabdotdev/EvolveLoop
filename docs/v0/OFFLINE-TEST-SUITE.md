# V0 Offline Deterministic Test Suite

Aggregated suite for **V0-TEST-A..E** + **V0-EXIT-01/03** (offline only).

## Command

```bash
cd orchestrator
npm run build
npm run test:v0-offline
```

Equivalent vitest include:

```text
tests/unit/v0-*.test.ts
tests/unit/security/audit-adversarial.test.ts
```

## Mapping

| Goal | Coverage files |
|------|----------------|
| V0-TEST-A | `v0-orch-persistence`, `v0-cli-grill`, `v0-intent-grill-sqlite`, `v0-token-economy` (stdout/fail-fast) |
| V0-TEST-B | `security/audit-adversarial` (+ execution-runner) |
| V0-TEST-C | `v0-chaos-reconciler`, `v0-orch-runtime` |
| V0-TEST-D | `v0-token-economy`, `v0-evidence-token-ledger`, fixture `tests/fixtures/v0-token-baseline-comparator.ts` |
| V0-TEST-E | `v0-adapt-memory` |
| V0-EXIT-01 | branch `chore/v0-consolidation` + `npm run build` + `npm run test:v0-offline` EXIT 0 |
| V0-EXIT-03 | chaos SIGKILL/Reconciler + security fixed + Token Ledger green |

## Live gaps (honest)

- **Offline suite** still does **not** run live agents. For live proofs use:
  ```bash
  export EVOLVELOOP_HARNESS_CONSENT=true
  bash scripts/v0-live-five-tasks.sh
  # or: (cd orchestrator && npm run test:v0-live)
  ```
- Evidence pack: `docs/v0/evidence/live-<UTC>/` (see `LATEST_PATH.txt`).
- **V0-EXIT-02 / V0-TEST-F / V0-TEST-D LIVE_GAP close** (recorded `live-20261121T185643Z`):
  - fire-5 live (cursor-agent, no offline-fixture): **5/5 TRUE_FULL_PASS** consecutive
  - pass@1 = **1.0**, pass^3 = **1.0** (stack 1+1+1; OpenRouter `MISSING_CREDENTIALS` honest)
  - Token Ledger: 10 rows, `cost_provenance=UNAVAILABLE` 10/10 (CLI usage absent)
  - Token reduction proxy (telegraphic+skill compress+stdout filter vs uncompressed baseline): **~57.65%** (≥50% target)
  - Do **not** treat chars/4 estimates as billing-grade PROVIDER_REPORTED costs
