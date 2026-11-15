# M00 freeze rework delivery — B1 / B2 / B3

| Field | Value |
|-------|-------|
| Meta | M00 — Architecture & Domain Contracts |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m00` · `feature/v4/m00-architecture` |
| Trigger | `M00-FREEZE-REVIEW.md` verdict **FREEZE_REJECTED**; directive `ORCHESTRATOR-DIRECTIVE-M00-FREEZE-REWORK.md` |
| Parent tip | `d1563d7` (REWORK directive) |
| Freeze stamp | **Not requested.** Contracts remain `PROPOSED`. |
| Merge to `feature/v4-integration` | **Not done** |
| Engines | **Not implemented** (`orchestrator/src/v4/` = `contracts/**` only) |
| `npm install` | **Not run** (`node_modules` symlink) |
| V3.7 cert | **Not edited** |
| Knowledge | `WIKI_ROOT` unset → GAP (B-WIKI); grounding = repo docs + code |

This is a localized contract patch so Wave 2 can be freeze-reviewed again. It is **not** a freeze and does **not** supersede `M00-FREEZE-REVIEW.md`. Reservations R1–R16 from that review remain unless noted.

---

## 1. Reproduction

Commands (worktree only):

```bash
cd orchestrator && npx vitest run tests/v4
```

| Step | Result |
|------|--------|
| Tests added against tip `d1563d7` **before** contract fixes | **4 failed / 24 passed** (28 collected). Failures: nested `handoff.permissions`/`next_action` still `valid=true`; `allowlistParseExecutionCapsule` missing; omitted `subject_executor_ref` ⇒ `isIndependent === true`; evidenceless `NOT_EXECUTED` ⇒ `valid=true`. |
| Same suite **after** fixes | **28 passed / 2 files** (vitest 2.1.9). Prior 23 tests still pass; 5 new tests (B1×2, B2×1, B3×2). |

Probe inputs (now encoded as tests, not `/tmp` scripts):

- B1: `validCapsule({ handoff: { next_action, permissions } })` → `validateExecutionCapsule` / `assertConforms` invalid (`INV-CAP-07` at `handoff.permissions` and `handoff.next_action`).
- B1: unknown keys `handoff`, `v3_permissions`, nested `base_checkpoint.extra_control` dropped by `allowlistParseExecutionCapsule`.
- B2: producer = worker, `subject_executor_ref` omitted → `isIndependent === false`, `validateEvidence` `INV-EVD-01`, `deriveRequirementStatus` = `UNVERIFIED` (PROVEN unreachable).
- B3: `state: "NOT_EXECUTED", evidence_ids: []` → `INV-EFF-03`. With evidence: valid; `decideRetry` still `FORBIDDEN`.

---

## 2. How each blocking issue is closed

### B1 — Capsule denylist was shallow (F01 / F12)

**Hole:** `rejectForbiddenFields` only tested root keys. Nested `{ handoff: { permissions, next_action } }` validated. ADR-V4-0001 "ignore unknown optional fields" was readable as license to *forward* extras.

**Close:**

1. `rejectForbiddenFields` walks objects/arrays at any depth (`field-class.ts`). Nested forbidden *names* fail `INV-CAP-07`.
2. `allowlistParseExecutionCapsule` picks the known ExecutionCapsule shape (including nested objects/arrays). Unknown keys are dropped and MUST NOT be forwarded.
3. `CapsuleServicePort.accept` / `seal` document the MUST: verify the *raw* object (so nested denylist fires), then allowlist-parse before executor context / Policy / Work State.
4. ADR-V4-0001: ignore = readability, not forwarding. ADR-V4-0006 / 0017, INV-CAP-07, `CONTRACTS.md`, `INTEGRATION-CONTRACTS.md` aligned.

Validation still fails (does not silently drop) when a forbidden name is present anywhere. Allowlist-parse is the forwarding gate for unknown keys that are *not* forbidden names (`v3_permissions`, `handoff` without those keys).

### B2 — `isIndependent` treated a missing subject as independent

**Hole:** `if (!e.subject_executor_ref) return true`. Omitting the subject qualified as independent and opened a PROVEN path.

**Close:**

1. `isIndependent` fails closed: missing `subject_executor_ref` or `produced_by.executor_id` ⇒ `false`.
2. `validateEvidence` requires `subject_executor_ref` when `subject.kind` ∈ {CRITERION, TASK, EXECUTION} (`INV-EVD-01`). ARTIFACT/EFFECT may omit the field; independence still fails closed if omitted.
3. Negative test: producer == worker, subject omitted, `isIndependent === false`, `deriveRequirementStatus` cannot return `PROVEN`.
4. ADR-V4-0009 and DOMAIN-MODEL INV-EVD-01 aligned.

### B3 — Evidenceless `NOT_EXECUTED` was schema-valid (D05 / ADR-V4-0008)

**Hole:** INV-EFF-03 listed only COMMITTED/REJECTED/PARTIAL/COMPENSATED. A lying executor could record `NOT_EXECUTED` with empty `evidence_ids`; `decideRetry` then says create a new `effect_id` → duplicate external dispatch.

**Close:**

1. `EFFECT_STATES_REQUIRING_EVIDENCE` includes `NOT_EXECUTED`. `validateEffectRecord` requires non-empty `evidence_ids` (`INV-EFF-03`).
2. `decideRetry(NOT_EXECUTED)` remains `FORBIDDEN` (same `effect_id` is terminal). A new attempt is a new id with fresh authorization — and cannot be justified by an evidenceless NOT_EXECUTED, because that record is now invalid.
3. DOMAIN-MODEL INV-EFF-03 and ADR-V4-0008 rule 2 aligned.

---

## 3. Commits

On `feature/v4/m00-architecture` (no merge to integration). Hash of the rework commit is the git object that introduces this file; see `git log -1 --oneline` after landing.

Scope:

```
orchestrator/src/v4/contracts/{field-class,capsule,evidence,effect,ports}.ts
orchestrator/tests/v4/contracts/{contracts.test.ts,fixtures.ts}
docs/v4/adr/ADR-V4-0001, 0006, 0008, 0009, 0017
docs/v4/architecture/{DOMAIN-MODEL,INTEGRATION-CONTRACTS,M00-FREEZE-REWORK-DELIVERY}.md
docs/v4/contracts/CONTRACTS.md
```

---

## 4. What this rework does *not* claim

- **Not FROZEN.** Wave 2 must not start against this tip as a frozen API until a *fresh* freeze review (not `M00-INDEPENDENT-REVIEW.md`) re-runs.
- **R1–R16** from `M00-FREEZE-REVIEW.md` are unchanged, including R2 (event payload F12 names), R3 (capsule `expires_at` / `replay_id` on the type), R4 (`PolicyDecision.decided_by`), R5 (grant/approval/lease id prefixes). They were recommended, not blocking; this patch stayed on B1–B3.
- Recursive denylist on capsules does **not** add an F12 denylist inside `WorkEvent.payload` (R2).
- No product engines, no V3.7 reimplementation, no exactly-once claim.

---

## 5. Request to orchestrator

Dispatch a **new** freeze review against this branch tip. Do not reuse `ACCEPT_WITH_RESIDUAL_RISKS`. Do not stamp `CONTRACT_CATALOG` `FROZEN` from this note.
