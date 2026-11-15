# Integration Status

**Branch:** `feature/v4-integration`  
**Baseline:** `03937c175368715e893193fcfad09aac8474286b` (provisional — V3.7 **BLOCKED** G17; never claim APPROVED)  
**Integrator (M19):** A-M19-1 (Wave 1) + freeze merge + Wave 2 integrate (2026-11-15T14:18Z) + Wave 3 integrate (2026-11-15T15:15Z) + Continuity vertical (A-M19-5) + Wave 4 integrate (2026-11-15T15:34Z) + M17 early integrate (2026-11-15T15:45Z) + M11 integrate (2026-11-15T16:00Z) + M18 Wave5 integrate (2026-11-15T16:07Z) + M10-full integrate (2026-11-15T16:16Z) + M15 F02 daemon integrate (2026-11-15T16:22Z)  
**Integration HEAD at this record:** M15 F02 status commit (this file); merge hash in M15 F02 sequence below  
**Knowledge:** `WIKI_ROOT` unset → GAP; grounding = repo docs + ACCEPTED tips only

M19 may integrate **only** orchestrator-ACCEPTED deliveries. Shared catalog is **FROZEN** (ADR-V4-0001) as of the M00 CONTRACT-FREEZE stamp; semantic changes require RFC.

| Meta | Accepted? | Source tip | Integrated via | Notes |
|------|-----------|------------|----------------|-------|
| M00 Architecture | **ACCEPTED** (package) | `1dea128` on `feature/v4/m00-architecture` | merge `e44252f` | contracts, ADRs 0001–0017, architecture, v4 tests |
| M18 Wave 1 Security | **ACCEPTED** | `47155ec` on `feature/v4/m18-security` | merge `2fc17c2` | threat model + Wave 1 delivery; owner remains M18 |
| M00 CONTRACT-FREEZE | **ACCEPTED** (FROZEN + R1–R16) | `4fbadf8` (includes stamp `e4fb8ad`) | merge `061dbd4` | `CONTRACT-FREEZE.md`; catalog stability **FROZEN**; B1–B3 closed |
| M02 Ledger & Checkpoints | **ACCEPTED** | `374769d5baed65f41367a0a7f5deb48e1bb4b632` on `feature/v4/m02-ledger-checkpoints` | merge `780a622175bac06ed6d172d85c6b61d3632fae5c` | ledger, checkpoint, artifacts, `adapters/v37/ledger.ts` |
| M01 Goal & Work | **ACCEPTED** | `f72ad763a57824abd2a31704342ddfa7b021e385` on `feature/v4/m01-goal-work` | merge `e815407b2fab074fb02691cea1b4ae434087fc4c` | `goal/**`, `work/**` |
| M03 Effect Ledger | **ACCEPTED** | `91dbdf36b19dbe6e31367aff76d93ad1b03586d1` on `feature/v4/m03-effect-ledger` | merge `d2c85d674d7c25707677c4594f69d3b247ad3a79` | `effects/**` |
| M06 WorkProof-min | **ACCEPTED** | `272869592f80a4964a9195083fbdea60ada15474` on `feature/v4/m06-workproof-min` | merge `8c801ae5fad9f161e4f503baefa077e64f78af95` | `proof/**` |
| M10 Policy foundations | **ACCEPTED** | `78fa4bcf4d996970152d9c0878a30413619b33b9` on `feature/v4/m10-policy-foundations` | merge `32ec79398375aa453241acbb219b300d2df09d8f` | `policy/**`, `adapters/v37/{identity,policy}.ts`; barrel union `b5bdd01` |
| M12 Observability init | **ACCEPTED** | `72c5f5b400e75e749bf45836e3bdd2c12903befb` on `feature/v4/m12-obs-init` | merge `df4fbf401b6dcad9b0e74d20109ab98bb87d0af0` | `observability/**` |
| M04 Capsule/Handoff/Recovery | **ACCEPTED** | `14aa02b005528bf0e2637ec12d26c797260cbcd5` on `feature/v4/m04-continuity` | merge `26831b0065b32306f710d377b6db14002fd43265` | `continuity/**` |
| M05 Time Travel | **ACCEPTED** | `b27b2cbc5936ff82be189ff4a16896517437c9d4` on `feature/v4/m05-timetravel` | merge `33229c590da3ce63b7208717fb32dbb7348f45c7` | `timetravel/**` |
| M07 Dynamic Planning | **ACCEPTED** | `0e9b581fe275e82a56339b8cb9bf1173349f8795` on `feature/v4/m07-planning` | merge `cfead011364e1ae39fa613c6469dbfbb4c0e12b5` | `planning/**` |
| M08 Capability Intelligence | **ACCEPTED** (delivery) | `13fac49fce6eb7f44d8628407111d5f305a6ae2a` on `feature/v4/m08-capability` | merge `07bd808f15f9662040b205948be304cd63889113` | `capability/**`; methodology `cprof-methodology.provisional.v0` remains **PROVISIONAL** |
| M17 Benchmarks (early) | **INTEGRATED** | `69d15ce0ef553c13881a12e4e08f0b0effa3e79f` on `feature/v4/m17-benchmarks-early` | merge `0daf462ac967a632fd23faae62c82c4d376b9d99` | `docs/v4/benchmarks/**` + `benchmarks/**`; fair baseline DECLARED_UNAVAILABLE; M08 methodology still **PROVISIONAL**; M09 not launched; Phase 4 **PARTIAL** |
| M11 Trust & Provenance | **INTEGRATED** | `f1222f6d518dffc030991a992cdcc9e5e5b5acfb` on `feature/v4/m11-provenance` | merge `290b453a32d54f38e89ea41a537b85be7365a966` | `provenance/**`; engine `9b56c81`; Wave 5; M09 not launched; Phase 4 **PARTIAL** |
| M18 Wave 5 RO | **INTEGRATED** | `5e8bc7022f3f5403a34d98932785586ff4b23f17` on `feature/v4/m18-wave5-ro` | merge `0c6d1c919eabce9e2065aec1d19efc0b0b048558` | docs-only `docs/v4/security/**`; F02/F07/F14/D13/D16/D17 + score honesty; OPEN residuals RR-W5-01..11 **not inverted**; M09 not launched; Phase 4 **PARTIAL** |
| M10 Policy full (F02) | **INTEGRATED** | `fd8adf730ef3789b1f1ef4f9a8110661f09664e5` on `feature/v4/m10-policy-full` | merge `04a104b68efd46e5f3b127fbaa3839f595166de8` | `policy/**`, `adapters/v37/policy.ts`, narrow `cli/v35-commands.ts`; CLI store fallback refused under V4 posture; F02 **PARTIALLY MITIGATED**; V3 daemon actor residual **OPEN** at that cut (later M15 F02); M09 not launched; Phase 4 **PARTIAL** |
| M15 F02 daemon | **INTEGRATED** | `cbb38d2e0e28860f8f88adef5c2261cce3aa725e` on `feature/v4/m15-f02-daemon` | merge `6e78bce4d5de768cbe714907393f6a9b85c4ff66` | `v4/api/daemon-approvals.ts`, narrow `daemon.ts` approve/reject; daemon actor write refused under V4 posture; F02 **PARTIALLY MITIGATED**; live daemon has no in-process PDP; privileged IPC token not operator identity; M09 not launched; Phase 4 **PARTIAL** |

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

## Landed coherently (Wave 1 + freeze)

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

Worktrees already contain freeze tip `e4fb8ad` (local `--no-ff` import). They do **not** contain `4fbadf8` (CONTRACTS.md FROZEN note) nor integration merge `061dbd4`. No rebase/`--no-ff` was performed (M19 FF-only only). Integration used `--no-ff` of ACCEPTED tips (same object database) instead of rewriting implementer history.

## Merge sequence (2026-11-15) — Wave 2

Pre-merge HEAD `db0f6da67ff6192eded3e6c0a7eed7830104f258`. Order per `ORCHESTRATOR-DIRECTIVE-M19-WAVE2-INTEGRATE.md`. All six `git merge --no-ff` used full hashes from linked worktrees.

```text
db0f6da  feature/v4-integration (pre-Wave-2-merge)
   + merge --no-ff 374769d5  →  780a622175bac06ed6d172d85c6b61d3632fae5c
   + merge --no-ff f72ad763  →  e815407b2fab074fb02691cea1b4ae434087fc4c
   + merge --no-ff 91dbdf36  →  d2c85d674d7c25707677c4594f69d3b247ad3a79
   + merge --no-ff 27286959  →  8c801ae5fad9f161e4f503baefa077e64f78af95
   + merge --no-ff 78fa4bcf  →  32ec79398375aa453241acbb219b300d2df09d8f
   + barrel union (M10 lacked index.ts)
   →  b5bdd01009044d91166e9e7ee69b09305d18862b
   + merge --no-ff 72c5f5b4  →  df4fbf401b6dcad9b0e74d20109ab98bb87d0af0
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff 374769d5baed65f41367a0a7f5deb48e1bb4b632` | clean (ort); 30 files, +2761 | `780a622175bac06ed6d172d85c6b61d3632fae5c` |
| 2 | `git merge --no-ff f72ad763a57824abd2a31704342ddfa7b021e385` | clean (ort); 19 files, +2357 | `e815407b2fab074fb02691cea1b4ae434087fc4c` |
| 3 | `git merge --no-ff 91dbdf36b19dbe6e31367aff76d93ad1b03586d1` | clean (ort); 11 files, +1759 | `d2c85d674d7c25707677c4594f69d3b247ad3a79` |
| 4 | `git merge --no-ff 272869592f80a4964a9195083fbdea60ada15474` | clean (ort); 21 files, +2251 | `8c801ae5fad9f161e4f503baefa077e64f78af95` |
| 5 | `git merge --no-ff 78fa4bcf4d996970152d9c0878a30413619b33b9` | clean (ort); 20 files, +1958 | `32ec79398375aa453241acbb219b300d2df09d8f` |
| 5b | union `adapters/v37/index.ts` | no git conflict; M10 lacked barrel | `b5bdd01009044d91166e9e7ee69b09305d18862b` |
| 6 | `git merge --no-ff 72c5f5b400e75e749bf45836e3bdd2c12903befb` | clean (ort); 13 files, +1330 | `df4fbf401b6dcad9b0e74d20109ab98bb87d0af0` |
| 7 | `cd orchestrator && npx vitest run tests/v4` | **200/200 PASS** (29 files) | — |

Ancestry after step 6: tips `374769d`, `f72ad76`, `91dbdf3`, `2728695`, `78fa4bc`, and `72c5f5b` are all ancestors of `feature/v4-integration`.

## Conflicts resolved (Wave 2)

No git merge conflicts on any of the six `--no-ff` merges (ort, disjoint ownership trees).

**Composition (not a git conflict):** M10 did not ship `orchestrator/src/v4/adapters/v37/index.ts`. After merge `32ec793`, that path still held only the M02 ledger binding. Per directive: union exports — keep M02 `bindV37LedgerAdapters` / `V37LedgerBindings` **and** re-export M10 `identity` / `policy` modules (files present after merge). Commit `b5bdd01`. Implementer ownership trees were not rewritten.

## Landed coherently (Wave 2)

- `orchestrator/src/v4/ledger/**`, `checkpoint/**`, `artifacts/**`, `adapters/v37/ledger.ts`
- `orchestrator/src/v4/goal/**`, `work/**`
- `orchestrator/src/v4/effects/**`
- `orchestrator/src/v4/proof/**`
- `orchestrator/src/v4/policy/**`, `adapters/v37/{identity,policy}.ts`, `docs/v4/policy/**`
- `orchestrator/src/v4/observability/**`
- `orchestrator/src/v4/adapters/v37/index.ts` — union barrel (M02 + M10)

## Test evidence (Wave 2 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  29 passed (29)
     Tests  200 passed (200)
Duration    1.43s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

## Merge sequence (2026-11-15) — Wave 3

Pre-merge HEAD `93f30f4c4aff3353e50e42953bbce3d7cc0b3fb5`. Order per `ORCHESTRATOR-DIRECTIVE-M19-WAVE3-INTEGRATE.md`. Both `git merge --no-ff` used full hashes from linked worktrees.

```text
93f30f4  feature/v4-integration (pre-Wave-3-merge)
   + merge --no-ff 14aa02b  →  26831b0065b32306f710d377b6db14002fd43265
   + merge --no-ff b27b2cb  →  33229c590da3ce63b7208717fb32dbb7348f45c7
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff 14aa02b005528bf0e2637ec12d26c797260cbcd5` | clean (ort); 16 files, +1760 | `26831b0065b32306f710d377b6db14002fd43265` |
| 2 | `git merge --no-ff b27b2cbc5936ff82be189ff4a16896517437c9d4` | clean (ort); 16 files, +2083 | `33229c590da3ce63b7208717fb32dbb7348f45c7` |
| 3 | `cd orchestrator && npx vitest run tests/v4` | **234/234 PASS** (36 files) | — |

Ancestry after step 2: tips `14aa02b` and `b27b2cb` are both ancestors of `feature/v4-integration`.

## Conflicts resolved (Wave 3)

No git merge conflicts on either `--no-ff` merge (ort, disjoint ownership trees: `continuity/**` vs `timetravel/**`). No barrel union required; `adapters/v37/index.ts` unchanged (M02+M10 union from Wave 2).

## Landed coherently (Wave 3)

- `orchestrator/src/v4/continuity/**` (CapsuleService seal/verify/accept, handoff, recovery)
- `orchestrator/tests/v4/continuity/**` (17 tests)
- `orchestrator/src/v4/timetravel/**` (inspect, fork, replay)
- `orchestrator/tests/v4/timetravel/**` (15 tests)

## Test evidence (Wave 3 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  36 passed (36)
     Tests  234 passed (234)
Duration    1.75s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Additive vs Wave 2 record: 200 tests / 29 files → 234 tests / 36 files. Delta includes M04 (17) + M05 (15) plus the 2-test vertical slice already on integration before this batch (`tests/v4/vertical/intent-to-workproof.test.ts`).

## Continuity vertical (2026-11-15) — DELIVERED, not ACCEPTED

Follow-on to Wave 3 per `ORCHESTRATOR-DIRECTIVE-CONTINUITY-GATE.md`. Composition tests only; no product rewrites; `contracts/**` untouched.

| Check | Result |
|-------|--------|
| `tests/v4/vertical` | **4 passed** (2 files; +2 vs V4.0 slice) |
| `tests/v4` | **236 passed** (37 files) |
| Slice record | `docs/v4-orchestration/CONTINUITY-SLICE-V41.md` |
| npm install / V3.7 cert / self-ACCEPTED / V4 APPROVED | **none** |

## Merge sequence (2026-11-15) — Wave 4

Pre-merge HEAD `bddd9f1a19318f27609756b83863bc5ae97cc01f`. Order per `ORCHESTRATOR-DIRECTIVE-M19-WAVE4-INTEGRATE.md`. Both `git merge --no-ff` used full hashes from linked worktrees.

```text
bddd9f1  feature/v4-integration (pre-Wave-4-merge)
   + merge --no-ff 0e9b581  →  cfead011364e1ae39fa613c6469dbfbb4c0e12b5
   + merge --no-ff 13fac49  →  07bd808f15f9662040b205948be304cd63889113
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff 0e9b581fe275e82a56339b8cb9bf1173349f8795` | clean (ort); 14 files, +1734 | `cfead011364e1ae39fa613c6469dbfbb4c0e12b5` |
| 2 | `git merge --no-ff 13fac49fce6eb7f44d8628407111d5f305a6ae2a` | clean (ort); 18 files, +1595 | `07bd808f15f9662040b205948be304cd63889113` |
| 3 | `cd orchestrator && npx vitest run tests/v4` | **284/284 PASS** (46 files) | — |

Ancestry after step 2: tips `0e9b581` and `13fac49` are both ancestors of `feature/v4-integration`.

## Conflicts resolved (Wave 4)

No git merge conflicts on either `--no-ff` merge (ort, disjoint ownership trees: `planning/**` vs `capability/**`). No barrel union required; `adapters/v37/index.ts` unchanged (M02+M10 union from Wave 2).

## Landed coherently (Wave 4)

- `orchestrator/src/v4/planning/**` (PlanningEngine propose/accept/replan)
- `orchestrator/tests/v4/planning/**` (18 tests)
- `orchestrator/src/v4/capability/**` (store, ingest, routing-forbidden, PROVISIONAL methodology)
- `orchestrator/tests/v4/capability/**` (30 tests)

## Test evidence (Wave 4 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  46 passed (46)
     Tests  284 passed (284)
Duration    2.10s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Additive vs Continuity vertical record: 236 tests / 37 files → 284 tests / 46 files. Delta = M07 (18) + M08 (30).

M09 **not launched** (directive: wait for M08 methodology + M17 baseline ACCEPTED). M08 methodology in this tree is still **PROVISIONAL**.

## Merge sequence (2026-11-15) — M17 early

Pre-merge HEAD `4bc70d53e38429b265eb0fc1977c0a5f17cd7130`. Per `ORCHESTRATOR-DIRECTIVE-M19-M17-INTEGRATE.md`. Worktree `/home/gaab/Downloads/EvolveLoop-v4-m17` HEAD was `69d15ce` (ancestor = descendant of named tip; uncommitted DELIVERY pin line was **not** in HEAD and was **not** merged).

```text
4bc70d5  feature/v4-integration (pre-M17-merge)
   + merge --no-ff 69d15ce  →  0daf462ac967a632fd23faae62c82c4d376b9d99
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff 69d15ce0ef553c13881a12e4e08f0b0effa3e79f` | clean (ort); 20 files, +1921 | `0daf462ac967a632fd23faae62c82c4d376b9d99` |
| 2 | `cd orchestrator && npx vitest run tests/v4` | **306/306 PASS** (50 files) | — |

Ancestry after step 1: tip `69d15ce` is an ancestor of `feature/v4-integration`.

## Conflicts resolved (M17)

No git merge conflicts (ort, disjoint ownership: `docs/v4/benchmarks/**` + `orchestrator/{src,tests}/v4/benchmarks/**`). No barrel union; `adapters/v37/index.ts` unchanged.

## Landed coherently (M17)

- `docs/v4/benchmarks/**` (PROTOCOL, SCHEMA, IMPROVEMENT-BAR, M08-EVIDENCE, M17-DELIVERY, README)
- `docs/v4/benchmarks/artifacts/el-v4-fair-baseline.declared-unavailable.v0.json`
- `orchestrator/src/v4/benchmarks/**` (protocol, schema, improvement, routing-forbidden, honesty)
- `orchestrator/tests/v4/benchmarks/**` (22 tests)

## Test evidence (M17 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  50 passed (50)
     Tests  306 passed (306)
Duration    2.73s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Additive vs Wave 4 record: 284 tests / 46 files → 306 tests / 50 files. Delta = M17 (22 tests / 4 files).

M09 **not launched** (directive: M08 methodology remains PROVISIONAL; M17 baseline is DECLARED_UNAVAILABLE and must not drive L2/L3 score routing).

## Merge sequence (2026-11-15) — M11 provenance

Pre-merge HEAD `7443609ee89ad68ddc6d2d9e5101a18fd3a58ed6`. Per `ORCHESTRATOR-DIRECTIVE-M19-M11-INTEGRATE.md`. Worktree `/home/gaab/Downloads/EvolveLoop-v4-m11` tip `f1222f6` (engine `9b56c81`).

```text
7443609  feature/v4-integration (pre-M11-merge)
   + merge --no-ff f1222f6  →  290b453a32d54f38e89ea41a537b85be7365a966
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff f1222f6d518dffc030991a992cdcc9e5e5b5acfb` | clean (ort); 14 files, +2288 | `290b453a32d54f38e89ea41a537b85be7365a966` |
| 2 | `cd orchestrator && npx vitest run tests/v4` | **337/337 PASS** (55 files) | — |

Ancestry after step 1: tip `f1222f6` is an ancestor of `feature/v4-integration`.

## Conflicts resolved (M11)

No git merge conflicts (ort, disjoint ownership: `orchestrator/src/v4/provenance/**` + `orchestrator/tests/v4/provenance/**`). No barrel union; `adapters/v37/index.ts` unchanged.

## Landed coherently (M11)

- `orchestrator/src/v4/provenance/**` (graph, extract, stream, refs, types, guarantees)
- `orchestrator/tests/v4/provenance/**` (31 tests)

## Test evidence (M11 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  55 passed (55)
     Tests  337 passed (337)
Duration    2.43s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Additive vs M17 record: 306 tests / 50 files → 337 tests / 55 files. Delta = M11 (31 tests / 5 files).

M09 **not launched**. Phase 4 remains **PARTIAL**. V4 not APPROVED.

## Merge sequence (2026-11-15) — M18 Wave 5 RO

Pre-merge HEAD `de1b7c34d1cb656132780ce5118264ac787ee0ef`. Per `ORCHESTRATOR-DIRECTIVE-M19-M18-WAVE5-INTEGRATE.md`. Worktree `/home/gaab/Downloads/EvolveLoop-v4-m18` tip `5e8bc70`.

```text
de1b7c3  feature/v4-integration (pre-M18-Wave5-merge)
   + merge --no-ff 5e8bc70  →  0c6d1c919eabce9e2065aec1d19efc0b0b048558
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff 5e8bc7022f3f5403a34d98932785586ff4b23f17` | clean (ort); 3 files, +278/−3 | `0c6d1c919eabce9e2065aec1d19efc0b0b048558` |
| 2 | `cd orchestrator && npx vitest run tests/v4` | **337/337 PASS** (55 files) | — |

Ancestry after step 1: tip `5e8bc70` is an ancestor of `feature/v4-integration`.

## Conflicts resolved (M18 Wave 5)

No git merge conflicts (ort, docs-only `docs/v4/security/**`). No product code. No barrel union; `adapters/v37/index.ts` unchanged.

## Landed coherently (M18 Wave 5)

- `docs/v4/security/M18-WAVE5-RO.md` (F02/F07/F14/D13/D16/D17 dispositions; score honesty RR-W5-INV-*; residual register RR-W5-01..11)
- `docs/v4/security/README.md`
- `docs/v4/security/THREAT-MODEL-V4-INITIAL.md` (Wave 5 appendix)

OPEN residuals stay OPEN (including F02 V3 CLI `store.approve(actor)` = RR-W5-01). PARTIALLY MITIGATED / READ-MODEL ONLY / HONEST pins are not inverted to closed.

## Test evidence (M18 Wave 5 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  55 passed (55)
     Tests  337 passed (337)
Duration    2.33s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Docs-only merge: 337 tests / 55 files unchanged vs M11 record.

M09 **not launched**. Phase 4 remains **PARTIAL**. V4 not APPROVED.

## Merge sequence (2026-11-15) — M10-full F02

Pre-merge HEAD `53f04af08cca1d9475fc69d727654cf3a5b3e2ca`. Per `ORCHESTRATOR-DIRECTIVE-M19-M10-FULL-INTEGRATE.md`. Worktree `/home/gaab/Downloads/EvolveLoop-v4-m10` tip `fd8adf7` (engine `52b555c`).

```text
53f04af  feature/v4-integration (pre-M10-full-merge)
   + merge --no-ff fd8adf7  →  04a104b68efd46e5f3b127fbaa3839f595166de8
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff fd8adf730ef3789b1f1ef4f9a8110661f09664e5` | clean (ort); 6 files, +264/−15 | `04a104b68efd46e5f3b127fbaa3839f595166de8` |
| 2 | `cd orchestrator && npx vitest run tests/v4` | **343/343 PASS** (55 files) | — |

Ancestry after step 1: tip `fd8adf7` is an ancestor of `feature/v4-integration`.

## Conflicts resolved (M10-full)

No git merge conflicts (ort, ownership: `policy/**`, `adapters/v37/policy.ts`, narrow `cli/v35-commands.ts`, `tests/v4/policy/**`). No barrel union; `adapters/v37/index.ts` unchanged.

## Landed coherently (M10-full)

- `orchestrator/src/v4/policy/match.ts` (partial F14 realpath on absolute non-glob paths)
- `orchestrator/src/v4/policy/M10-FULL-DELIVERY.md`
- `orchestrator/src/v4/adapters/v37/policy.ts` (token-only credential; `CALLER_ASSERTED_IDENTITY_REJECTED`)
- `orchestrator/src/cli/v35-commands.ts` (approve/reject store-fallback refused under V4 posture)
- `orchestrator/tests/v4/policy/{f02-self-approve,r13-r14-match}.test.ts`

F02 is **PARTIALLY MITIGATED** on the V4 PDP + V4-posture CLI filesystem fallback. Do **not** claim F02 globally closed. V3 daemon `approvals.approve` actor-from-IPC residual remains **OPEN** (RR-W5-01 remainder). RR-W5-02 remains **OPEN**.

## Test evidence (M10-full integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  55 passed (55)
     Tests  343 passed (343)
Duration    2.38s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Additive vs M18 Wave 5 record: 337 tests / 55 files → 343 tests / 55 files. Delta = M10-full policy tests on existing files (+6).

M09 **not launched**. Phase 4 remains **PARTIAL**. V4 not APPROVED. F02 not globally closed.

## Merge sequence (2026-11-15) — M15 F02 daemon

Pre-merge HEAD `a4c14786e31bef9cbbc6583eed96499685b69852`. Per `ORCHESTRATOR-DIRECTIVE-M19-M15-F02-INTEGRATE.md`. Worktree `/home/gaab/Downloads/EvolveLoop-v4-m15` tip `cbb38d2` (engine `c34367d`).

```text
a4c1478  feature/v4-integration (pre-M15-F02-merge)
   + merge --no-ff cbb38d2  →  6e78bce4d5de768cbe714907393f6a9b85c4ff66
```

| Step | Command | Result | Hash |
|------|---------|--------|------|
| 1 | `git merge --no-ff cbb38d2e0e28860f8f88adef5c2261cce3aa725e` | clean (ort); 4 files, +389/−4 | `6e78bce4d5de768cbe714907393f6a9b85c4ff66` |
| 2 | `cd orchestrator && npx vitest run tests/v4` | **353/353 PASS** (56 files) | — |

Ancestry after step 1: tip `cbb38d2` is an ancestor of `feature/v4-integration`.

## Conflicts resolved (M15 F02)

No git merge conflicts (ort, ownership: `v4/api/daemon-approvals.ts`, `v4/api/M15-F02-DELIVERY.md`, `tests/v4/api/f02-daemon-actor.test.ts`, narrow `v3/coordinator/daemon.ts` approve/reject). CLI `applyCliApprovalStoreFallback` unchanged. No barrel union; `adapters/v37/index.ts` unchanged.

## Landed coherently (M15 F02)

- `orchestrator/src/v4/api/daemon-approvals.ts` (`F02_DAEMON_ACTOR_REFUSED`; `applyDaemonApprovalActorWrite`)
- `orchestrator/src/v4/api/M15-F02-DELIVERY.md`
- `orchestrator/src/v3/coordinator/daemon.ts` (narrow approve/reject wrap)
- `orchestrator/tests/v4/api/f02-daemon-actor.test.ts`

F02 is **PARTIALLY MITIGATED** on the V4 PDP + V4-posture CLI filesystem fallback + V4-posture daemon actor write. Do **not** claim F02 globally closed. Live V3 daemon has no in-process PDP; privileged IPC token is not operator identity (RR-W5-01 remainder). RR-W5-02 remains **OPEN**.

## Test evidence (M15 F02 integrate)

```text
RUN  v2.1.9  /home/gaab/Downloads/EvolveLoop-v4-integration/orchestrator
Test Files  56 passed (56)
     Tests  353 passed (353)
Duration    2.41s
```

No `npm install`. `orchestrator/node_modules` remains the existing symlink to the V3.7-cert tree.

Additive vs M10-full record: 343 tests / 55 files → 353 tests / 56 files. Delta = M15 F02 daemon actor tests (+10 / +1 file).

M09 **not launched**. Phase 4 remains **PARTIAL**. V4 not APPROVED. F02 not globally closed.

## Limitations / not claimed

- V3.7 remains **BLOCKED** G17; baseline is provisional; **not APPROVED**.
- `recovery/v37-full-cert` and V3.7 evidence **not** edited.
- Wave 2 ACCEPTED tips (M01, M02, M03, M06, M10, M12) **are** ancestors of `feature/v4-integration`.
- Wave 3 ACCEPTED tips (M04, M05) **are** ancestors of `feature/v4-integration`.
- Wave 4 ACCEPTED tips (M07, M08) **are** ancestors of `feature/v4-integration`.
- M17 ACCEPTED tip (`69d15ce`) **is** an ancestor of `feature/v4-integration`.
- M11 ACCEPTED tip (`f1222f6`) **is** an ancestor of `feature/v4-integration`.
- M18 Wave 5 ACCEPTED tip (`5e8bc70`) **is** an ancestor of `feature/v4-integration`.
- M10-full ACCEPTED tip (`fd8adf7`) **is** an ancestor of `feature/v4-integration`.
- M15 F02 ACCEPTED tip (`cbb38d2`) **is** an ancestor of `feature/v4-integration`. Other metas remain out of this integrate batch.
- M18 Wave 5 OPEN residuals (RR-W5-01..11) remain OPEN / PARTIALLY MITIGATED / READ-MODEL ONLY except: RR-W5-01 **CLI store-fallback** (M10-full refuses under V4 posture) and RR-W5-01 **daemon actor write** (M15 F02 refuses under V4 posture). F02 overall is **PARTIALLY MITIGATED**; live daemon has no in-process PDP; privileged IPC token is not operator identity (RR-W5-01 remainder); RR-W5-02 remains **OPEN**. Do not claim F02 globally closed.
- Continuity vertical is **DELIVERED** for orchestrator validation (`CONTINUITY-SLICE-V41.md`); not self-ACCEPTED; not V4 APPROVED.
- M08 engine status is **PROVISIONAL** (`cprof-methodology.provisional.v0`); not an ACCEPTED methodology; not evidence of executor quality or L2/L3 routing.
- M17 canonical baseline is **DECLARED_UNAVAILABLE** (`el-v4-fair-baseline.declared-unavailable.v0`); honesty pins forbid production scores and L2/L3 routing.
- M09 **not launched**.
- Uncommitted M17 worktree pin (`Protocol/harness commit | add40aa` in `M17-DELIVERY.md`) was **not** part of tip `69d15ce` and was **not** merged.
- Wiki CLI unavailable (`WIKI_ROOT` unset).
- Freeze reservations R1–R16 in `CONTRACT-FREEZE.md` remain binding; do not claim they are encoded away.
