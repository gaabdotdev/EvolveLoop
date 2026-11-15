# V4.0 vertical slice — Intent → WorkProof

| Field | Value |
|-------|-------|
| Meta | M19 (integration) |
| Agent | A-M19-3 |
| Branch | `feature/v4-integration` |
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-integration` |
| Self-status | **DELIVERED** (orchestrator validation; not self-ACCEPTED) |
| V4 APPROVED | **not claimed** |
| Pre-delivery HEAD | `6f07640` (`docs(v4/orch): register A-M19-3 vertical slice agent`) |
| Delivery tip | *stamped after commit — see `git_tip` below* |
| Knowledge | Wiki **GAP** (`WIKI_ROOT` / `RAG_REPO_ROOT` unset); contracts from this repo |

`git_tip: PENDING_STAMP`

## What was proven (automated)

Two tests in `orchestrator/tests/v4/vertical/intent-to-workproof.test.ts` compose **public** exports only. `src/v4/contracts/**` was not edited. Product ownership code was not rewritten.

```text
marked Intent (USER_DIRECT)
  → M01 GoalWorkEngine.ingest / acceptGoal / planTasks
  → WorkEvents appended to M02 FileEventLedger (not IsolatedEventBuffer)
  → M02 checkpoint.create
  → M02 putAndRegisterArtifact (code + deterministic test report)
  → M10 deny-by-default + L2 high-risk REQUIRE_APPROVAL → grant → consume
  → M03 EffectLedger plan / authorize / DISPATCHED / COMMITTED (CP-side evidence)
  → M06 self-report evidence → WorkProof UNVERIFIED (not PROVEN)
  → M06 independent DeterministicVerifier → WorkProof PROVEN
  → M12 wrapInboundEvent redaction + ObservabilitySink control-plane CE event
```

Second test: same path, effect left **DISPATCHED** → `deriveFinalStatus` caps **PARTIAL**.

## Steps exercised

1. `markText(..., "USER_DIRECT")` → `compileIntent` via `GoalWorkEngine.ingest`.
2. `GoalWorkEngine` constructed with `openM02().ledger` (`FileEventLedger`). Assert `instanceof FileEventLedger` and not `IsolatedEventBuffer`. Durable `works/<work_id>/events.jsonl` exists.
3. Human `acceptGoal` + `planTasks`; executor may `RUNNING` / `SUCCEEDED_UNVERIFIED` but not `VERIFIED`.
4. `checkEventStream` on M02 read: `work.created`, `goal_contract.versioned`, `goal_contract.accepted`, `task.planned`, `task.state_changed`, GENESIS hash chain, frozen `recorded_at`.
5. M10 via `V37PolicyAdapter`: unmatched `network.egress` → `DENY` / `deny_by_default_no_match`. Matching `filesystem.write` at risk=high + L2 → `REQUIRE_APPROVAL`. Operator token approve → grant. `consumeGrant` bound to the M03 `effect_id`. `V4_CLI_STORE_FALLBACK === false`.
6. `FileCheckpointStore.create` after M01 events (goal_contract_ref from `goal_contract.accepted`).
7. `putAndRegisterArtifact` for source + `DeterministicTestReport` (`evidence_kind: unit_test`).
8. M03 INTERNAL `filesystem.write` with the policy `decision_id`; CP-side evidence (not the worker) required to `COMMITTED`.
9. Honesty: executor `recordSelfReport` → `isIndependent === false` → `final_status === UNVERIFIED`. Independent verifier id `executor_v4detmin1` ≠ `executor_worker01` → successor proof `PROVEN` with `supersedes_proof_id`. Open `DISPATCHED` effect → `PARTIAL`.
10. M12: `wrapInboundEvent` redacts `Bearer a{20}` to `[REDACTED_SECRET]`; `emitFromControlPlane` `checkpoint.created` retains OBSERVED and does not persist the raw token.

## Test evidence

```bash
export PATH="/usr/bin:/bin:$PATH"
cd orchestrator
npx vitest run tests/v4/vertical   # 2 passed
npx vitest run tests/v4            # 202 passed (30 files)
```

No `npm install`. No V3.7 cert / recovery edits.

| Suite | Files | Tests |
|-------|-------|-------|
| `tests/v4/vertical` | 1 | **2** |
| `tests/v4` (full) | 30 | **202** |

Wave 2 baseline before this slice was 200/200.

## Composition (public barrels)

| Step | Module | Symbol |
|------|--------|--------|
| Intent / ids | `src/v4/goal` | `markText`, `allocateId` |
| Work commands | `src/v4/work` | `GoalWorkEngine`, `InMemoryWorkRepository` |
| Event ledger | `src/v4/ledger` | `openM02`, `FileEventLedger`, `putAndRegisterArtifact`, `workPath` |
| Checkpoint / artifacts | `openM02()` runtime | `checkpoints.create`, `artifacts.listMeta` |
| Effects | `src/v4/effects` | `EffectLedger` (`events:` M02 ledger) |
| Proof | `src/v4/proof` | `WorkProofBuilder`, `DeterministicVerifier`, memory stores |
| Policy | `src/v4/policy` + `adapters/v37` | `DenyByDefaultPolicyEngine`, `V37PolicyAdapter` |
| Observability | `src/v4/observability` | `wrapInboundEvent`, `ObservabilitySink` |

## GAPs / non-blockers (not invented)

- **Wiki:** `WIKI_ROOT` unset; grounding = repo contracts + ACCEPTED tips.
- **M13 Execution Gateway** is out of Wave 2. `Execution` records are test-composed and injected via `WorkProofBuilder.listExecutions` (the published port). Not a product Execution store.
- **M01 vs M02 payload fold:** M01 `work.created` payload is `{ work }`; M02 projection reads `{ goal_contract_ref }`. M01 `task.planned` is `{ task }`; M02 fold reads `{ task_id, state }`. M01 `work.state_changed` uses `to`; M02 fold reads `state`. The **log is still the source of truth** (`checkEventStream` green). Checkpoint `goal_contract_ref` is recovered from `goal_contract.accepted`. No product rewrite (directive: prefer test-side composition).
- **EffectLedgerPort** exposes `listOpen` only; the slice tracks planned `effect_id`s to feed `listEffects` (including COMMITTED).
- **V3.7 G17** remains BLOCKED. This slice does not certify V4.

## Non-claims

- Not V4 APPROVED.
- Not Impossible Handoff, capsule (M04), replay/fork (M05), marketplace, or CLI product surface.
- Hash chain is tamper-evidence, not non-repudiation (R1).
- Redaction is heuristic defence-in-depth (R10).
