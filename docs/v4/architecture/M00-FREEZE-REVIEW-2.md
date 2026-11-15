# M00 freeze re-review — shared contracts for Wave 2 (round 2)

| Field | Value |
|-------|-------|
| Subject | META M00 package on `feature/v4/m00-architecture` after B1–B3 rework |
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m00` |
| Reviewed tip | `842c4c6129868e9ac3bcaeef5074fcfb28d82faa` (includes rework `af118a0309f0bd4514abbfad7c803f20112c2736`) |
| Prior reject | `e1b67640c588978303c2ac2056145b5021eeefd4` · `M00-FREEZE-REVIEW.md` · **FREEZE_REJECTED** (B1–B3) |
| Rework delivery | `docs/v4/architecture/M00-FREEZE-REWORK-DELIVERY.md` |
| Directive | `docs/v4-orchestration/ORCHESTRATOR-DIRECTIVE-M00-FREEZE-REWORK.md` |
| Reviewer | Independent architecture reviewer (separate context from the rework author). Did **not** author `af118a0` / `842c4c6`. Did **not** treat `M00-INDEPENDENT-REVIEW.md` or `M00-FREEZE-REWORK-DELIVERY.md` as authority. |
| Date | 2026-11-15 |
| Tests | `cd orchestrator && npx vitest run tests/v4` → **28 passed** (2 files) |
| **Verdict** | **FREEZE_APPROVED_WITH_RESERVATIONS** |

This review decides whether shared contracts may be stamped **FROZEN** for Wave 2 (Phase 2: M01, M02, M03, M06-min, M10-fund, M12-init) after the B1–B3 rework. It is **not** a product-engine review and does **not** merge to `feature/v4-integration`.

`M00-FREEZE-REVIEW.md` remains the round-1 record. This document supersedes it for freeze *disposition*. Reservations R1–R16 from that review are **not** waived; they become binding freeze residuals.

---

## 0. How this review tried to invalidate the freeze

Attack surface (round-1 blockers + the same freeze bar):

1. Reproduce the three mandatory probes against the *current* validators, not against the rework note.
2. Confirm ADR / DOMAIN-MODEL text actually matches the executable functions (ADR-V4-0001: TypeScript is source of truth).
3. Confirm `assertConforms` / `isIndependent` / `validateEffectRecord` no longer ship the round-1 holes to Wave 2 oracles.
4. Re-check R1–R16 so a clean freeze is not claimed by silence.
5. Confirm no engines, no V3.7 cert edits, no secrets, no exactly-once claims, tests green.

Findings below were checked against files at `842c4c6`, plus a throwaway `/tmp` probe of the validators (not committed).

---

## 1. Verdict

**FREEZE_APPROVED_WITH_RESERVATIONS.** The orchestrator **may** stamp `CONTRACT_CATALOG` / ADR-V4-0001 stability `FROZEN` on this tip’s contract set.

Round-1 blockers B1–B3 are **closed in the executable contracts**:

| ID | Round-1 hole | This tip |
|----|----------------|----------|
| B1 | Nested `{ handoff: { permissions, next_action } }` passed `validateExecutionCapsule` | **invalid** (`INV-CAP-07` at `handoff.permissions` and `handoff.next_action`); `assertConforms` also invalid. Allowlist-parse drops unknown keys. |
| B2 | Missing `subject_executor_ref` ⇒ `isIndependent === true` | **false**; `validateEvidence` fails `INV-EVD-01`; `deriveRequirementStatus` = `UNVERIFIED` (PROVEN unreachable). |
| B3 | `NOT_EXECUTED` + empty `evidence_ids` schema-valid | **invalid** (`INV-EFF-03`); with evidence: valid; `decideRetry` still `FORBIDDEN`. |

R1–R16 from round 1 remain. They were classified as non-blocking then and were **explicitly out of scope** of the rework directive (B1–B3 only). They are now **binding reservations** on a freeze of this tip: Wave 2 must not treat the missing fields as present, must not treat event-payload F12 names as CONTROL, and must not advertise hash-chain as non-repudiation.

A clean `FREEZE_APPROVED` is refused because those residuals are still true on disk.

---

## 2. Mandatory probes (reproduced independently)

Throwaway script: `/tmp/m00-freeze-rereview-probes.mts` via `npx vite-node` (not in git). Inputs match round 1 / the rework delivery. Result: `PROBES_PASS`.

### Probe 1 — nested capsule `{ handoff: { permissions, next_action } }`

```text
B1_NESTED valid= false
B1_NESTED issues= ["INV-CAP-07@handoff.next_action","INV-CAP-07@handoff.permissions"]
B1_ASSERT valid= false
B1_ALLOWLIST has_handoff= false
B1_ALLOWLIST has_v3_permissions= false
B1_UNKNOWN_KEYS_STILL_SCHEMA_VALID= true
```

`rejectForbiddenFields` walks objects/arrays at any depth (`field-class.ts`). `validateExecutionCapsule` and `assertConforms` fail closed on the nested V3 names.

Allowlist-parse (`allowlistParseExecutionCapsule`) drops `handoff`, `v3_permissions`, and nested `base_checkpoint.extra_control`. `CapsuleServicePort.accept` / `seal` document the MUST: verify the *raw* object, then allowlist-parse before executor context / Policy / Work State. ADR-V4-0001, ADR-V4-0006, ADR-V4-0017, INV-CAP-07, `CONTRACTS.md`, `INTEGRATION-CONTRACTS.md` agree that ignore ≠ forwarding.

**Residual of B1 (not a reopen):** unknown keys *without* a forbidden field name still pass `validateExecutionCapsule` (`B1_UNKNOWN_KEYS_STILL_SCHEMA_VALID= true`). That is the ADR-V4-0001 readability rule. F01 forwarding safety is the port MUST + `allowlistParseExecutionCapsule`, not `assertConforms` alone. M04 ★ tests must include “unknown keys are not forwarded”. Folded into R6; not B1.

### Probe 2 — evidence without `subject_executor_ref`

```text
B2_INDEP_OMIT_SUBJECT false
B2_VALIDATE valid= false
B2_VALIDATE issues= ["INV-EVD-01@subject_executor_ref"]
B2_DERIVED status= UNVERIFIED
B2_DERIVED gaps= ["not_independent:evd_abc123def","no_qualifying_pass"]
B2_INDEP_SAME_IDS false
B2_INDEP_VALID_FIXTURE true
```

`isIndependent` fails closed if `subject_executor_ref.executor_id` or `produced_by.executor_id` is missing. `validateEvidence` requires the field when `subject.kind` ∈ {CRITERION, TASK, EXECUTION}. `exclusionReason` in `deriveRequirementStatus` calls `isIndependent`, so omitted-subject evidence cannot qualify → PROVEN unreachable. Same-id comparison still returns false. ADR-V4-0009 and DOMAIN-MODEL INV-EVD-01 match the function.

ARTIFACT/EFFECT may omit the field; independence still fails closed if omitted. Acceptable: those subjects are not the PROVEN path for criteria.

### Probe 3 — `NOT_EXECUTED` with empty `evidence_ids`

```text
B3_NOT_EXECUTED_NO_EVIDENCE valid= false
B3_NOT_EXECUTED_NO_EVIDENCE issues= ["INV-EFF-03@evidence_ids"]
B3_NOT_EXECUTED_WITH_EVIDENCE valid= true
B3_RETRY {"action":"FORBIDDEN","reason":"terminal_create_new_effect_with_fresh_authorization"}
```

`EFFECT_STATES_REQUIRING_EVIDENCE` includes `NOT_EXECUTED`. DOMAIN-MODEL INV-EFF-03 and ADR-V4-0008 rule 2 list the same set. An evidenceless NOT_EXECUTED cannot be recorded, so it cannot induce a fresh `effect_id` via `decideRetry`’s terminal reason. A *proven* NOT_EXECUTED remains terminal on the same id (new attempt = new id + fresh authorization). No exactly-once claim.

**Not in M00 scope:** `evidence_ids` is a non-empty `string[]`; the validator does not resolve ids to ledger evidence. M03 must reject dangling / executor-only citations. Schema fail-closed is what freeze required.

---

## 3. Binding reservations (R1–R16, still true)

Round 1 said these become binding if B1–B3 were patched. They were **not** patched (rework delivery §4). Independently re-checked at this tip:

| ID | Topic | Status at `842c4c6` |
|----|--------|---------------------|
| R1 | Hash chain ≠ signature (F07 residual) | Unchanged. Do not advertise INV-EVT-06 as non-repudiation. |
| R2 | `WorkEvent.payload` untyped; F12 names accepted | **Confirmed this review:** `validEvent({ payload: { next_action, objective } })` → `validateWorkEvent` **valid= true**. INV-EVT-05 still only strips F09 self-trust labels (header + top-level payload keys), not F12 control names. Producing metas must RFC payload schemas before those event types become authoritative. |
| R3 | Capsule has no `expires_at` / replay token on the type; `accept` ctx is `{ now, policy_id }` | Unchanged. `CapsuleAcceptance.replay_id` exists; `ExecutionCapsule` itself has no expiry/replay fields. `delegable_grants[].expires_at` is not capsule anti-replay. Additive optional fields remain possible as a **minor** (ADR-V4-0001); M04 must not claim F01(c) is encoded on the 1.0.0 object. |
| R4 | `PolicyDecision` has no authenticated `decided_by` | Unchanged. Type has `decided_at` only. ADR-V4-0016 still names `decided_by` (derived from authN, never from request). M10-fund cannot audit “who authorized” (F02) from the frozen 1.0.0 object unless it adds the field as a minor. |
| R5 | ID grammar missing grant/approval/lease/correlation | Unchanged. `ID_PREFIX` has no `grant_` / `approval_` / `lease_` / `corr_`. Fixture still uses `grant_tmp_1`. `Task.depends_on` is `string[]` without `isValidId("task")`. M02/M10/M13 must not use these as path components until the grammar grows. |
| R6 | INV-CAP-08 is procedural | Strengthened, not closed. Recursive denylist is executable; forwarding of *non-forbidden* unknown keys is still a port MUST. M04 ★ tests (M18 S1) must include “forged task state does not change ledger” **and** “unknown keys not forwarded”. |
| R7 | `EventLedgerPort.append` drafts may carry `fencing.fencing_epoch` | Unchanged. M02 must ignore/reject caller-supplied epochs. |
| R8 | No `Grant` / `Approval` kind in the catalog | Unchanged. Do not treat `V37ApprovalRecord` as the V4 grant. |
| R9 | Dual owner `adapters/v37/identity.ts` = M10 **and** M13 | Unchanged in `OWNERSHIP-MAP.md`. Split or name a single writer before Wave 2 fights an RFC. |
| R10 | Secret scan is heuristic | Unchanged. Canary `sk-ant-` in tests is a pattern. |
| R11 | Canonical JSON v1 ≠ RFC 8785 | Unchanged. |
| R12 | Policy language / capability formula deferred | Unchanged. ADR-V4-0010/0011 have gates. OK. |
| R13 | INV-POL-04 only forbids ALLOW `*` **and** `*` together | Unchanged. M10 must tighten. |
| R14 | `V37SignaturePort.sign(private_key_pem: string)` | Unchanged. M10 must use handles. |
| R15 | MeasurementPlane F10 not encoded | Unchanged. M12-init must default missing provenance to UNKNOWN. |
| R16 | Numbering gaps (`INV-WORK-02`, `INV-EFF-01`, …) | Unchanged. Hygiene only. |

R2 is the only reservation this review **re-probed**. It is not a round-2 blocker: the freeze bar required nested *capsule* F12 (B1), not a payload denylist on every `WorkEvent`. Wave 2 event producers (M02) own typed payloads; experimental `x.mNN.*` must not mutate projections.

R3–R5 were “strongly recommended” in round 1 to avoid post-freeze RFC. The rework directive did not require them. ADR-V4-0001 already allows **optional-field minors**. This review treats R3–R5 as **Wave 2 additive minors** (M04 / M10 / M02) that do **not** require a full RFC if they only add optional fields and do not change 1.0.0 semantics. They **do** require an RFC if anyone needs to make them required on 1.0.0.

---

## 4. Checklist against the freeze bar

| Criterion | Result | Notes |
|-----------|--------|-------|
| Architecture + mermaid | Met | `ARCHITECTURE.md` |
| Domain model + invariants for constitution §5 concepts | **Met** (was Partial) | INV-EVD-01 / INV-EFF-03 / INV-CAP-07 now match the ADRs and the functions |
| Versioned contracts | Met | catalog `1.0.0`, all `PROPOSED` (correct — this review does not self-stamp) |
| ADR register §15.2 | Met | 0001–0017; deferred items have owner + gate + date |
| Ownership M00–M20 vs matrix | Met (R9 dual owner) | No orphan chapters |
| Integration ports + conformance hooks | Met as skeletons | 28 tests; behavioural ★ cases owned by later metas |
| Acceptance criteria per meta | Met | `ACCEPTANCE-CRITERIA.md` |
| V3.7 adapter boundary, no cert edits, no reimplementation | Met | `orchestrator/src/v4/` = `contracts/**` only; `TRUE_PASS` ↛ `VERIFIED` |
| No secrets in M00 tracked files | Met (spot) | Heuristic; canaries only in tests/docs |
| No exactly-once claims | Met | ADR-V4-0008; `decideRetry(NOT_EXECUTED)` still escalates/forbids |
| M18 §9 six items | **Closed enough to freeze, with residuals** | See table below |
| No merge to integration | Met | branch isolation |
| No product engines | Met | this review implemented none; disk still contracts-only |
| Tests | **28 passed** | `npx vitest run tests/v4` (node_modules symlink; no `npm install`) |
| Independent review | This file | Supersedes round 1 for disposition; does not waive R1–R16 |

### M18 §9 six items (this review)

| # | Item | Freeze status |
|---|------|----------------|
| 1 | Capsule ≠ grant (F01) | **Closed** for the M00 oracle (`validateExecutionCapsule` + recursive INV-CAP-07 + documented allowlist MUST). M04 must still implement the MUST (R6). |
| 2 | V4 trust domain vs ADR-V37-0003 (F02) | ADR-V4-0016 remains the right split. **R4:** `decided_by` still absent from `PolicyDecision`. Isolation mechanism still M13 with a Phase 2 gate. |
| 3 | Event identity/order/tamper-evidence (F07) | Hash chain + seq + id uniqueness present. Residual **R1**. |
| 4 | Canonical id grammar (F08) | Prefix grammar still rejects `../`, `%2f`, NUL at `isValidId`. Incomplete for grants/leases/approvals (**R5**). |
| 5 | Data vs control (F12, F09) | Nested capsule F12 **closed** (B1). Event-payload F12 names still accepted (**R2**). Header self-trust denylist works. |
| 6 | Multi-tenancy OOS V4.0–V4.2 | Closed (`INV-TENANT-01`, ADR-V4-0014). |

---

## 5. What was *not* found (failed attempts to invalidate)

- B1–B3 as originally specified: all three probes now fail closed. Negative tests exist in `contracts.test.ts` (nested handoff, omitted subject + PROVEN unreachable, evidenceless NOT_EXECUTED). Prior 23 tests remain; suite is 28/28.
- No exactly-once guarantee. `decideRetry` still escalates UNKNOWN without reconciliation; NOT_EXECUTED is terminal on the same id.
- No V3.7 fabric/ledger/artifact reimplementation under `orchestrator/src/v4/` (contracts + type-only adapter picks only). No edits to `recovery/v37-full-cert` in the rework commits.
- No Goal Compiler, ledgers, handoff engine, Control Center UI, marketplace.
- No claim that V3.7 or V4 is APPROVED. Baseline remains provisional `03937c1` (G17 BLOCKED).
- Catalog still `PROPOSED` on this tip (the rework did not self-freeze). Correct.
- `Work.owner` is still the constant `"platform"`. Capsule `authority_model` must equal `POLICY_REDERIVED_AT_ACCEPT`.
- Disk-tight: `node_modules` is a symlink to the V3.7 cert tree; this review did not run `npm install`.
- Rework scope stayed on `orchestrator/src/v4/contracts/**`, tests, and the named ADRs/docs. No engines.

---

## 6. What this freeze does *not* authorize

1. Rubber-stamp of `M00-INDEPENDENT-REVIEW.md` (`ACCEPT_WITH_RESIDUAL_RISKS`) or of `M00-FREEZE-REWORK-DELIVERY.md`. Those are implementer notes. This file is the freeze gate.
2. Treating `assertConforms` as a complete F01 gate. Capsule accept must verify raw + allowlist-parse (R6).
3. Treating `WorkEvent.payload.next_action` / `objective` as CONTROL (R2).
4. Using `grant_tmp_1`, free-string `lease_id` / `approval_id` / `correlation_id` as filesystem path components (R5).
5. Claiming INV-EVT-06 is non-repudiation (R1).
6. Merge to `feature/v4-integration` (M19). This review does not merge.
7. Implementing M01–M20 engines.

---

## 7. Commands and limitations of this review

| Command | Result |
|---------|--------|
| `git rev-parse HEAD` (before this file) | `842c4c6129868e9ac3bcaeef5074fcfb28d82faa` |
| `git rev-parse af118a0` | `af118a0309f0bd4514abbfad7c803f20112c2736` |
| `git rev-parse e1b6764` | `e1b67640c588978303c2ac2056145b5021eeefd4` |
| Probe 1 nested capsule | `validateExecutionCapsule` **invalid** |
| Probe 2 omit `subject_executor_ref` | `isIndependent` **false**; validation **invalid** |
| Probe 3 evidenceless `NOT_EXECUTED` | `validateEffectRecord` **invalid** |
| Residual R2 event payload F12 | `validateWorkEvent` **valid** (reservation, not blocker) |
| `cd orchestrator && npx vitest run tests/v4` | **28 passed** (2 files), vitest 2.1.9 |
| `npm install` | **not run** |
| merge to `feature/v4-integration` | **not run** |
| Wiki grounding | `WIKI_ROOT` unset → GAP; repo docs + code only |

Probe used a throwaway `/tmp` script against the same validators; it is not in git.

This review did not re-audit every V3.7 line cited by M18; it checked whether M00 *encoded* the six §9 properties after the rework. V3.7 remains BLOCKED; adapter ports stay provisional on `03937c1`.

---

## 8. Recommendation to orchestrator

1. Mark M00 contract freeze **APPROVED WITH RESERVATIONS**. Stamp `CONTRACT_CATALOG` stability `FROZEN` in a follow-up M00 commit if desired; this review does not edit the catalog.
2. Launch Wave 2 against this contract set **only** with R1–R16 attached to each producer meta’s prompt (especially R2→M02, R3/R6→M04, R4/R8/R13/R14→M10, R5/R7→M02/M13, R15→M12, R9 writer-split before M10/M13 collide).
3. Allow R3–R5 as optional-field **minors** without a full RFC, provided they do not change 1.0.0 required semantics. Do not silently make them required.
4. Keep R1 (hash chain vs signature) as a documented residual for the life of V4.0–V4.2 — it is not a reason to reject architecture, but it is a reason not to claim non-repudiation.
5. Do **not** reuse this file as a product-engine review. Do **not** merge this branch here.
