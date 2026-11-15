# V4 Phase 0 — Repository Inventory

**Date:** 2026-11-15  
**Orchestrator role:** Program Validator (no product implementation)  
**Wiki grounding:** `WIKI_ROOT` / `RAG_REPO_ROOT` unset → `GAP` (repo docs + code + sibling worktrees only)

## Repository

| Field | Value |
|-------|-------|
| Main checkout | `/home/gaab/Downloads/EvolveLoop` |
| Main branch (dirty, do not use for V4 impl) | `feature/bench-obs-v1` @ `92a8f3eca229a57760be11fd9186c015dab08423` |
| OS | Linux |
| Node | v22.15.0 |
| Python | 3.13.5 |
| Package manager | npm (`orchestrator/package-lock.json`) |
| Primary package | `@agents/orchestrator` v2.0.0 |
| Test runner | vitest (`npm test`, `test:unit`, `test:integration`) |

## Agent runtimes (verified)

| Runtime | Path | Version |
|---------|------|---------|
| Antigravity (`agy`) | `/home/gaab/.local/bin/agy` | 1.5.9 |
| Cursor Agent (`cursor-agent` / `agent`) | `/home/gaab/.local/bin/cursor-agent` | 2026.11.13-eacade1 |

Flags for disposable worktrees only: `agy --dangerously-skip-permissions`, `cursor-agent --yolo`.

## Worktrees (must not modify V3.7 cert)

| Path | Branch | HEAD | Role |
|------|--------|------|------|
| `/home/gaab/Downloads/EvolveLoop-v37-cert` | `recovery/v37-full-cert` | `03937c175368715e893193fcfad09aac8474286b` | V3.7 certification — **READ-ONLY for V4** |
| `/home/gaab/Downloads/EvolveLoop-v35` | `feature/v3.5-runtime` | `0992cd2` | Historical V3.5 |
| `/home/gaab/orca/workspaces/EvolveLoop/brant` | `feature/v3.6-multi-workflow` | `5c1df88` | Historical V3.6 |
| `/home/gaab/Downloads/EvolveLoop-v4-integration` | `feature/v4-integration` | (tracks provisional baseline) | V4 integration spine |
| `/home/gaab/Downloads/EvolveLoop-v4-m00` | `feature/v4/m00-architecture` | same baseline | M00 |
| `/home/gaab/Downloads/EvolveLoop-v4-m18` | `feature/v4/m18-security` | same baseline | M18 |

## V3.7 real status (not the constitution’s hypothetical premise)

| Field | Evidence |
|-------|----------|
| Global verdict | **BLOCKED** — not APPROVED |
| Primary blocker | **G17** multi-host live E2E (`gaab-1` offline) |
| Cert tip (provisional baseline for V4) | `03937c175368715e893193fcfad09aac8474286b` |
| Canonical baseline file in cert tree | `docs/v3.7/evidence/canonical-baseline-commit.txt` → `9d13978ac199a05f2096b6e7f36829f4f2c333d1` |
| Sources | `docs/certification/EXECUTIVE-VERDICT.md`, `docs/certification/final/evidence/FINAL-CERTIFICATION-REPORT.md`, `docs/certification/TRUE-FULL-PASS-ACCEPTANCE-MATRIX.md` |

**Rule:** V4 may proceed in parallel against this **provisional** tip. Final V4 `APPROVED` requires certified V3.7 hash. Do not alter `recovery/v37-full-cert` or its evidence.

## Architecture snapshot (provisional tip)

Present under `orchestrator/src/`: `v3/`, `telemetry/measurement-plane/`, fabric-related modules on cert tip, `persistence/`, `policy/`, `evidence/`, `events/`, `registry/`, `scheduler/`, `executors/`, `cli/`.

Tests: `orchestrator/tests/{unit,integration,evals,contracts,fixtures}`.

## Disk constraint

Filesystem `/` ~99% full (~2.4–2.5 GiB free). Worktrees share git objects; `node_modules` symlinked from cert worktree. Agents must avoid duplicating large installs.

## Normative docs (V4)

- `docs/v4/EvolveLoop_V4_Product_Architectural_Constitution.md`
- `docs/v4/EvolveLoop_V4_Orchestrator_Mission.md`
