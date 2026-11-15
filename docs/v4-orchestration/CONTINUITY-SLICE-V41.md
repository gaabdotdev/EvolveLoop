# V4.1 Continuity vertical — capsule handoff / recovery / fork

| Field | Value |
|-------|-------|
| Meta | M19 (integration) |
| Agent | A-M19-5 |
| Branch | `feature/v4-integration` |
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-integration` |
| Self-status | **DELIVERED** (orchestrator validation; not self-ACCEPTED) |
| V4 APPROVED | **not claimed** |
| Pre-delivery HEAD | `9efa4d5490f014f3c817da1b005b16b67dad42e2` (`docs(v4/orch): draft Wave 4 status (blocked on Continuity gate)`) |
| Delivery tip | `PENDING_COMMIT` |
| Knowledge | Wiki **GAP** (`WIKI_ROOT` / `RAG_REPO_ROOT` unset); contracts from this repo |

`git_tip: PENDING_COMMIT`

## What was proven (automated)

Two tests in `orchestrator/tests/v4/vertical/continuity-handoff.test.ts` compose **public** exports only. `src/v4/contracts/**` was not edited. Product ownership trees (M01–M06, M10, M12, M04, M05) were not rewritten.

```text
Work on M02 FileEventLedger (GoalWorkEngine.ingest / acceptGoal / planTasks)
  → M04 seal capsule (allowlist-only; Ed25519; refs-only grants)
  → M04 verify nested {handoff.permissions, next_action} → INV-CAP-07 (raw object)
  → M04 accept forged task_refs=VERIFIED via handoffAccept
      (grants re-derived: filesystem.write ⊆ policy, git.push dropped;
       Work from Event Ledger, not task_refs; ledger bytes unchanged)
  → crash/recovery: reopen FileEventLedger + EffectLedger + FileReplayStore
      from VERIFIED checkpoint; DISPATCHED preserved; no invented CONFIRMED/COMMITTED
  → M05 fork at checkpoint (new work_id; grants not inherited; EXTERNAL fork_inherited)
  → M05 replay RECORDED does not re-dispatch EXTERNAL (auto_reapplied_external=false)
  → optional M06: self-report UNVERIFIED; independent proof capped PARTIAL by open inherited EXTERNAL
  → optional M12: emitFromControlPlane handoff.accepted retains OBSERVED
```

## Steps exercised

1. `GoalWorkEngine` on `openM02().ledger` (`FileEventLedger`, not `IsolatedEventBuffer`). Durable `works/<work_id>/events.jsonl`. `V4_CLI_STORE_FALLBACK === false`.
2. Human `acceptGoal` + `planTasks`; executor `RUNNING` / `SUCCEEDED_UNVERIFIED` (not `VERIFIED`).
3. `putAndRegisterArtifact` (code + deterministic test report) then M03 EXTERNAL `git.push` to `DISPATCHED`.
4. M10 `GrantRegistry.issue` bound to the **base** `work_id`. `FileCheckpointStore.create` → **VERIFIED** (no `context_hint`).
5. `CapsuleService.seal` — allowlisted fields only; `authority_model = POLICY_REDERIVED_AT_ACCEPT`; `delegable_grants` keys = `grant_ref,scope,expires_at`; Ed25519 via `signerFromHandle` (R14).
6. `verify` on resigned nested `{ handoff: { permissions, next_action } }` → `INV-CAP-07` at those paths; `accept` throws `CapsuleVerifyFailed`.
7. `handoffAccept` of a capsule whose `task_refs` were forged to `VERIFIED`: `authority_source=POLICY_REDERIVED`, `work_state_source=EVENT_LEDGER`, `effective_grant_refs = [WRITE_GRANT]` only (PUSH_GRANT denied by default), bound tasks are not `VERIFIED`, ledger head/bytes unchanged, executor context has no `permissions` / `next_action`.
8. M12 `emitFromControlPlane` `handoff.accepted` with `provenance.kind = OBSERVED`.
9. Process restart of file-backed stores (`openM02` + `EffectLedger.recoverFromDisk` + `FileReplayStore`). `recoverAtVerifiedCheckpoint`: same checkpoint id, `recovered_without_invented_confirmed_state`, `confirmed_task_ids=[]`, open effect still `DISPATCHED` (not invented `COMMITTED`), event ids preserved, replay token still consumed (`REPLAY_REUSED` on second accept).
10. `TimeTravelService.fork`: new `work_id`; `authorization.grants_copied=false`; consume of the base grant on the fork `work_id` → `work_mismatch`; inherited EXTERNAL `fork_inherited=true` → `decideRetry` `FORBIDDEN`; `beginDispatch` `BLIND_RETRY_BLOCKED`. Base log unchanged.
11. `replay({ mode: "RECORDED" })`: `auto_reapplied_external=false`, `determinism_claim="none"`. `REPLAY_IS_ABSOLUTE_DETERMINISM === false`.
12. Optional M06 on the fork: executor `recordSelfReport` → `UNVERIFIED` (not `PROVEN`); independent `DeterministicVerifier` → `PARTIAL` because the inherited EXTERNAL remains open.

## Test evidence

```bash
export PATH="/usr/bin:/bin:$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
cd orchestrator
npx vitest run tests/v4/vertical   # 4 passed
npx vitest run tests/v4            # 236 passed (37 files)
```

No `npm install`. No V3.7 cert / recovery edits.

| Suite | Files | Tests |
|-------|-------|-------|
| `tests/v4/vertical` | 2 | **4** |
| `tests/v4` (full) | 37 | **236** |

Wave 3 integrate baseline before this slice was 234/234 (36 files).

## Composition (public barrels)

| Step | Module | Symbol |
|------|--------|--------|
| Intent / ids | `src/v4/goal` | `markText`, `allocateId` |
| Work commands | `src/v4/work` | `GoalWorkEngine`, `InMemoryWorkRepository` |
| Event ledger | `src/v4/ledger` | `openM02`, `FileEventLedger`, `putAndRegisterArtifact` |
| Checkpoint / artifacts | `openM02()` runtime | `checkpoints.create`, `artifacts.listMeta` |
| Effects | `src/v4/effects` | `EffectLedger` (`events:` M02 ledger) |
| Capsule | `src/v4/continuity` | `CapsuleService`, `handoffAccept`, `recoverAtVerifiedCheckpoint`, `FileReplayStore`, `signerFromHandle` |
| Time travel | `src/v4/timetravel` | `TimeTravelService` (`fork`, `replay`) |
| Policy | `src/v4/policy` | `DenyByDefaultPolicyEngine`, `GrantRegistry` |
| Proof | `src/v4/proof` | `WorkProofBuilder`, `DeterministicVerifier` |
| Observability | `src/v4/observability` | `ObservabilitySink.emitFromControlPlane` |
| Identity | `adapters/v37` | `HandleSigningAdapter` |

## GAPs / non-blockers (not invented)

- **Wiki:** `WIKI_ROOT` unset; grounding = repo contracts + ACCEPTED M04/M05 tips.
- **M01 vs M02 payload fold** (same GAP as V4.0 slice): M01 `task.planned` is `{ task }`; M02 fold reads `{ task_id, state }`. M01 `task.state_changed` uses `to`; M02 fold reads `state`. M03 `effect.state_changed` uses `to`; M02 fold reads `state`. The **log is still the source of truth** (`checkEventStream` green). Bound Work after accept is the M02 projection (empty `task_states` here) — still **not** the forged `task_refs`. No product rewrite.
- **M13 Execution Gateway** is out of Wave 3. Lease bind is not required (`lease_required: false`).
- **M10 GrantRegistry** is in-memory. Crash simulation reopens file-backed M02/M03/M04 replay stores and keeps the same policy/grant objects (not a durable grant store).
- **M06 on fork** is honest, not PROVEN: inherited EXTERNAL stays `DISPATCHED` / `fork_inherited`, so `deriveFinalStatus` caps **PARTIAL**.
- **V3.7 G17** remains BLOCKED. This slice does not certify V4.

## Non-claims

- Not V4 APPROVED.
- Not Impossible Handoff (M16).
- No absolute replay determinism (constitution §14).
- Hash chain is tamper-evidence, not non-repudiation (R1).
- Capsule is not a grant (INV-CAP-07). Work is not written from `task_refs` (INV-CAP-08).
