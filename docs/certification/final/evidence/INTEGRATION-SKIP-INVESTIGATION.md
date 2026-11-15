# Integration skip investigation

**Date:** 2026-11-15  
**Branch:** `recovery/v37-full-cert`  
**Suite:** `npm run test:integration` → `62 passed | 1 skipped`

## Which test is skipped?

| Field | Value |
|-------|--------|
| File | `orchestrator/tests/integration/v22-graphify-b3.integration.test.ts` |
| Case | `runs single-task smoke when graphify CLI and monorepo graph exist` |
| Mechanism | `ctx.skip()` (Vitest) — **not** silent empty PASS |

## Skip conditions (both required to run)

1. `graphify` CLI on `PATH` (`graphify --version` succeeds).
2. File `graphify-out/graph.json` exists at repo root.

On this certification host (2026-11-15):

- `graphify` **not found** (`command -v graphify` empty; not in `~/.local/bin`).
- `graphify-out/graph.json` **absent**.

The second test in the same file (`harness module is present for CI bench script`) **runs and PASSes** — it only asserts the Python harness module exists under `docs/internal/historical/evals/.../graphify_b3_harness.py`.

## Requirement covered

GOAL-008 / V22-BENCH B3 graphify retrieval path (historical Measurement Plane / V22 efficiency line). It is **not** a V3.7 Distributed Fabric mandatory gate (G9–G17). Cross-ref: `docs/certification/CROSS-VERSION-VALIDATION.md` — “V22 Graphify B3 | skip when CLI absent | PASS (honest skip)”.

## Classification

**Optional / outside mandatory V3.7 certification gates.**

- Blocked by **external optional dependency** (graphify CLI + prebuilt monorepo graph), not by a fabric defect.
- Equivalent structural evidence: harness file presence test PASS.
- Historical honesty rule: ISSUE-TEST-SILENT-SKIP-001 — skip is preferred over empty PASS.

## Actions taken

- **Did not** remove the test.
- **Did not** change expected suite counts silently.
- **Did not** install graphify solely to force a green counter (would not prove fabric G17/G13).
- Documented here for certification closure.

## Impact on APPROVED criteria

Does **not** block V3.7 APPROVED by itself. Remaining mandatory blocker remains **G17** (second independent Linux host) when other fabric criteria are met.
