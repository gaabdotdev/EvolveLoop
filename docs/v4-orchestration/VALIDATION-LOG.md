# Validation Log

| Timestamp | Target | Result | Evidence | Notes |
|-----------|--------|--------|----------|-------|
| 2026-11-15T09:37Z | Phase 0 inventory | PASS | `INVENTORY.md` | V3.7 BLOCKED G17 confirmed |
| 2026-11-15T13:04Z | M18 Wave 1 threat model | **ACCEPTED** | `a733630`, `47155ec` | F01/F02 spot-checked |
| 2026-11-15T13:20Z | M00 Architecture & Contracts | **ACCEPTED** (freeze deferred) | tip `1dea128`; vitest `tests/v4` **23/23 PASS**; ADRs 0001–0017; M18 §9 table | Independent review same-context → freeze not granted |
| 2026-11-15T13:51Z | M19 Wave 1 integrate M00+M18 | **ACCEPTED** | HEAD `5967f7b`; merges `e44252f`/`2fc17c2`; ancestors `1dea128`+`47155ec`; orchestrator re-ran vitest **23/23**; cert `03937c1` untouched | — |
| 2026-11-15T13:54Z | M00 contract freeze | **REWORK** | Review `e1b6764` **FREEZE_REJECTED** B1–B3 | Wave 2 blocked |
| 2026-11-15T14:00Z | M00 freeze rework B1–B3 | **ACCEPTED** (rework scope) | `af118a0`/`842c4c6`; vitest **28/28** | — |
| 2026-11-15T14:03Z | M00 freeze re-review #2 | **ACCEPTED** | `a78321e` FREEZE_APPROVED_WITH_RESERVATIONS; stamp `e4fb8ad`/`4fbadf8` | R1–R16 binding |
| 2026-11-15T14:09Z | M19 merge CONTRACT-FREEZE | **ACCEPTED** | merge `061dbd4`; HEAD `3b78241`; vitest **28/28** | — |
| 2026-11-15T14:14Z | M03 Effect Ledger | **ACCEPTED** | `91dbdf3`; ownership `effects/**` only; vitest **54/54** | Soft gap: no M03-DELIVERY.md |
| 2026-11-15T14:14Z | M10 Policy foundations | **ACCEPTED** | `00e03df`+`78fa4bc`; vitest **63/63**; F02/R13/R14/R15-related foundations | Local types for Grant/Approval (R8) |
| 2026-11-15T14:14Z | M12 Observability init | **ACCEPTED** | `4491d82`+`72c5f5b`; vitest **59/59**; R15 defaults | MP wrap only |
| 2026-11-15T14:16Z | M01 Goal/Work | **ACCEPTED** | `8d14e2b`+`f72ad76`; ownership `goal/**`+`work/**`; vitest **44/44** | Isolated buffer ≠ M02 ledger |
| 2026-11-15T14:16Z | M06 WorkProof-min | **ACCEPTED** | `3dd5463`+`2728695`; ownership `proof/**`; vitest **54/54** | Honesty/independence guards |
| 2026-11-15T14:17Z | M02 Ledger/Checkpoints | **ACCEPTED** | `9291d24`+`374769d`; ownership ledger/checkpoint/artifacts/+`adapters/v37/ledger.ts`; vitest **66/66** | Watch merge conflict `adapters/v37/index.ts` vs M10 |
| 2026-11-15T14:20Z | M19 Wave 2 integrate | **ACCEPTED / INTEGRATED** | merges M02→M01→M03→M06→M10→M12; barrel `b5bdd01`; HEAD `d8ab952`; orch recheck vitest **200/200** | G17 still blocks APPROVED |
| 2026-11-15T14:27Z | M19 vertical Intent→WorkProof | **ACCEPTED** | tip `cf37912` (slice `f52c980`); M02 `FileEventLedger`; honesty UNVERIFIED→PROVEN + PARTIAL cap; vitest **2/2** vertical + **202/202** full | Phase 2 gate green; G17 still blocks APPROVED |

Validation outcomes for metas: `ACCEPTED` | `REWORK` | `BLOCKED` | `REJECTED` only.

### M00 validation detail

| Check | Result |
|-------|--------|
| Scope = contracts/docs/tests only (no engines) | PASS |
| Commits on `feature/v4/m00-architecture` | PASS (`55a810a`…`1dea128`) |
| Architecture + domain + ownership + catalog | PASS |
| §15.2 → ADRs (default or deferred+gate) | PASS |
| M18 §9 six items addressed | PASS (ADR 0006/0014–0017 + invariants) |
| `npx vitest run tests/v4` | PASS 23/23 |
| Capsule ≠ grant (`FORBIDDEN_CAPSULE_*` / accept port) | PASS (code present) |
| No merge to integration / no V3.7 cert edits | PASS |
| True separate-context architecture review | **NOT DONE** (quota); review file admits same-context |
| Contract freeze (FROZEN) | **DEFERRED** until separate-context review ACCEPTED |

**Gate:** M19 may integrate M00 when convenient. **Wave 2 implementation** may start against `PROPOSED` contracts only after freeze OR with explicit orchestrator waiver noting PROPOSED risk. Default policy: **no Wave 2 consolidation until freeze**.
