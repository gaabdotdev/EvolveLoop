# Integration Status

**Branch:** `feature/v4-integration`  
**Baseline:** `03937c175368715e893193fcfad09aac8474286b` (provisional — V3.7 **BLOCKED** G17; never claim APPROVED)  
**Integrator (M19):** A-M19-1 (Wave 1) + freeze merge (2026-11-15T14:07Z)  
**Integration HEAD at this record:** merge `061dbd4542c726ee90d4bda320c4fd3e703f332b` (status file may sit on a follow-up docs commit)  
**Knowledge:** `WIKI_ROOT` unset → GAP; grounding = repo docs + ACCEPTED tips only

M19 may integrate **only** orchestrator-ACCEPTED deliveries. Shared catalog is **FROZEN** (ADR-V4-0001) as of the M00 CONTRACT-FREEZE stamp; semantic changes require RFC.

| Meta | Accepted? | Source tip | Integrated via | Notes |
|------|-----------|------------|----------------|-------|
| M00 Architecture | **ACCEPTED** (package) | `1dea128` on `feature/v4/m00-architecture` | merge `e44252f` | contracts, ADRs 0001–0017, architecture, v4 tests |
| M18 Wave 1 Security | **ACCEPTED** | `47155ec` on `feature/v4/m18-security` | merge `2fc17c2` | threat model + Wave 1 delivery; owner remains M18 |
| M00 CONTRACT-FREEZE | **ACCEPTED** (FROZEN + R1–R16) | `4fbadf8` (includes stamp `e4fb8ad`) | merge `061dbd4` | `CONTRACT-FREEZE.md`; catalog stability **FROZEN**; B1–B3 closed |

## Merge sequence (2026-11-15) — Wave 1

Prefer M00 then M18 (overlap on `docs/v4/security/**`).

```text
0667a8f  feature/v4-integration (pre-merge)
   + merge --no-ff 1dea128  →  e44252f658b5805e461217f6718312a0ea072318
   + merge --no-ff 47155ec  →  2fc17c2f5709614c9945f4465c4e12898fb4a8a8
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff 1dea128` | clean (ort); 55 files, +5681 | `e44252f` |
| 2 | `git merge --no-ff 47155ec` | clean (ort); empty tree delta | `2fc17c2` |
| 3 | `cd orchestrator && npx vitest run tests/v4` | **23/23 PASS** (2 files) | — |

Ancestry: `1dea128` and `47155ec` are both ancestors of `feature/v4-integration` after step 2.

## Merge sequence (2026-11-15) — CONTRACT-FREEZE

```text
e57e8c1  feature/v4-integration (pre-freeze-merge)
   + merge --no-ff feature/v4/m00-architecture (4fbadf8)
   →  061dbd4542c726ee90d4bda320c4fd3e703f332b
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff feature/v4/m00-architecture` | clean (ort); 22 files, +919/−43 | `061dbd4` |
| 2 | `cd orchestrator && npx vitest run tests/v4` | **28/28 PASS** (2 files) | — |

Ancestry after step 1: `4fbadf8`, stamp `e4fb8ad`, review `a78321e`, and rework `af118a0`/`842c4c6` are ancestors of `feature/v4-integration`.

Tip contents verified on merge HEAD:

- `docs/v4/architecture/CONTRACT-FREEZE.md` present — Status **FROZEN**
- `orchestrator/src/v4/contracts/catalog.ts` — all shared kinds `stability: "FROZEN"`
- `docs/v4/contracts/CONTRACTS.md` notes catalog FROZEN at `e4fb8ad`

## Why M18 merge was empty

M00 already carried **byte-identical** copies of the three M18 Wave 1 docs (see `docs/v4/security/README.md`: canonical owner **M18**). Blob IDs matched:

| Path | Blob (M00 `1dea128` = M18 `47155ec`) |
|------|--------------------------------------|
| `docs/v4/security/M18-WAVE1-DELIVERY.md` | `2de0356` |
| `docs/v4/security/M18-WAVE1-INDEPENDENT-REVIEW.md` | `b292194` |
| `docs/v4/security/THREAT-MODEL-V4-INITIAL.md` | `219f2fd` |

M18 merge records the canonical branch in history without rewriting those files.

## Landed coherently

- `orchestrator/src/v4/contracts/**` (catalog **FROZEN**; B1–B3 capsule/evidence/effect fixes)
- `orchestrator/tests/v4/{contracts,conformance}/**` (28 tests)
- `docs/v4/{architecture,adr,contracts}/**` including `CONTRACT-FREEZE.md`, freeze reviews, rework delivery
- `docs/v4/security/**` (M18 canonical + M00 README pointer)

## Test evidence (freeze merge)

```text
RUN  v2.1.9  orchestrator/
✓ tests/v4/conformance/conformance.test.ts (4 tests)
✓ tests/v4/contracts/contracts.test.ts (24 tests)
Test Files  2 passed (2)
     Tests  28 passed (28)
Duration    499ms
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink.

Wave 1 evidence (historical): 23/23 PASS at `2fc17c2`.

## Wave 2 worktree fast-forward

Attempted `git -C <worktree> merge --ff-only feature/v4-integration` after merge `061dbd4`. **All six refused** (diverged: local freeze import vs integration freeze merge).

| Worktree | Branch HEAD | FF | Reason |
|----------|-------------|----|--------|
| EvolveLoop-v4-m01 | `1991b64` import freeze `e4fb8ad` | **NO** | diverged; unique merge not in integration |
| EvolveLoop-v4-m02 | `6a948e6` import freeze `e4fb8ad` | **NO** | same |
| EvolveLoop-v4-m03 | `6a948e6` import freeze `e4fb8ad` | **NO** | same |
| EvolveLoop-v4-m06 | `8130064` import freeze `e4fb8ad` | **NO** | same |
| EvolveLoop-v4-m10 | `8130064` import freeze `e4fb8ad` | **NO** | same |
| EvolveLoop-v4-m12 | `8130064` import freeze `e4fb8ad` | **NO** | same |

Worktrees already contain freeze tip `e4fb8ad` (local `--no-ff` import). They do **not** contain `4fbadf8` (CONTRACTS.md FROZEN note) nor integration merge `061dbd4`. No rebase/`--no-ff` was performed (M19 FF-only only).

## Conflicts deferred

None on the freeze merge. No semantic domain disputes. No composition conflicts (paths/imports/docs index).

## Limitations / not claimed

- V3.7 remains **BLOCKED** G17; baseline is provisional; **not APPROVED**.
- `recovery/v37-full-cert` and V3.7 evidence **not** edited.
- Wave 2 engines not integrated (implementers RUNNING on diverged worktrees).
- Wiki CLI unavailable (`WIKI_ROOT` unset).
- Freeze reservations R1–R16 in `CONTRACT-FREEZE.md` remain binding; do not claim they are encoded away.
