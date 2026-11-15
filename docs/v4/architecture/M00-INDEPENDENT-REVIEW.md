# M00 independent review

| Field | Value |
|-------|-------|
| Subject | META M00 package on `feature/v4/m00-architecture` |
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m00` |
| Reviewer role | Adversarial architecture review against `M00-MISSION.md` + constitution §1,3,5,6,7,15.2,17 + M18 §9 |
| Verdict | **ACCEPT_WITH_RESIDUAL_RISKS** |
| Date | 2026-11-15 |

## 0. Independence limitation (honest)

M00-MISSION §Method asks for an independent subagent with **separate context**. This note was produced as a structured adversarial pass over the files on disk after implementation, in the same worktree. It is **not** a different-model/different-session audit (prior Wave 1 M00 launches died on Pro API quota). The orchestrator SHOULD still dispatch a true separate-context reviewer before marking contracts FROZEN. Findings below were checked against code, not against memory of intent.

## 1. Acceptance checklist (mission)

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Architecture doc + mermaid | Met | `docs/v4/architecture/ARCHITECTURE.md` |
| Domain model + invariants for all §5 concepts | Met | `DOMAIN-MODEL.md` + `orchestrator/src/v4/contracts/*` |
| Versioned contracts | Met | catalog v1.0.0, all 15 kinds PROPOSED |
| ADR register for §15.2 | Met | ADR-V4-0001–0017; deferred items have gates |
| Ownership map M00–M20, matrix chapters covered | Met | `OWNERSHIP-MAP.md` vs `REQUIREMENTS-MATRIX.md` |
| Integration contracts + conformance hooks | Met | `ports.ts`, `tests/v4/conformance`, `tests/v4/contracts` (23 tests, vitest run green) |
| Acceptance criteria per meta | Met | `ACCEPTANCE-CRITERIA.md` |
| V3.7 adapter boundary, no cert edits | Met | `adapters-v37.ts` type-only picks; `recovery/v37-full-cert` untouched |
| No secrets in tracked files | Met (spot) | no `.env`; secret scan is heuristic |
| No exactly-once claims | Met | ADR-V4-0008; `decideRetry` escalates |
| M18 §9 six items | Met | see §3 |
| No merge to `feature/v4-integration` | Met | branch isolation |
| No engines (Goal Compiler, ledgers, UI, …) | Met | contracts/docs/tests only |
| Delivery report | Met | `M00-DELIVERY.md` |

## 2. Traceability spot-checks

- Constitution “work belongs to the platform” → `INV-WORK-01` (`owner: "platform"`). Confirmed in `work.ts`.
- §8.3 honesty → `deriveFinalStatus` / `isIndependent`; SELF_REPORTED cannot qualify. Confirmed in `work-proof.ts`, `evidence.ts`.
- V3 `TRUE_PASS` ↛ V4 `VERIFIED`. Confirmed `adapters-v37.ts` maps to `SUCCEEDED_UNVERIFIED`.
- Capsule ≠ grant: `FORBIDDEN_CAPSULE_AUTHORITY_FIELDS` + `CapsuleServicePort.accept`. Confirmed `capsule.ts`, `ports.ts`. Tests reject `permissions` / `verified_task_state` / `next_action`.
- Id grammar rejects `../`, `%2f`, NUL. Confirmed `isValidId` + tests.

## 3. M18 §9 six items

| # | Item | Status | Where |
|---|------|--------|-------|
| 1 | Capsule ≠ grant (F01) | **Addressed** | ADR-V4-0006, INV-CAP-07/08, `accept` |
| 2 | V4 trust domain vs ADR-V37-0003 (F02) | **Addressed** | ADR-V4-0016 (SO_PEERCRED drift named) |
| 3 | Event identity/order/tamper-evidence (F07) | **Addressed with residual R1** | ADR-V4-0003, INV-EVT-06 |
| 4 | Canonical id grammar (F08) | **Addressed** | ADR-V4-0015, `isValidId` |
| 5 | Data vs control (F12, F09) | **Addressed with residual R3** | ADR-V4-0017, INV-EVD-04, INV-EVT-05, INV-CAP-07 |
| 6 | Multi-tenancy OOS V4.0–V4.2 | **Addressed** | ADR-V4-0014, INV-TENANT-01 |

## 4. Findings

### R1 — Hash chain is not a signature (MEDIUM, residual of F07)

`event_digest` chaining detects *inconsistent* edits. An adversary with Control Plane data-dir write (in-scope for F07, out of scope as “CP host compromise” per M18 §2 / ADR-V4-0016) can rewrite the **entire** chain consistently. ADR-V4-0003 explicitly defers per-event signatures to M18 Phase 5 and relies on CP host integrity for V4.0.

**Required before freeze if orchestrator wants a stronger bar:** M02 publishes a signed head / checkpoint digest that independent verifiers pin. Not an M00 engine. **Disposition:** accept as documented residual; do not pretend INV-EVT-06 equals non-repudiation.

### R2 — INV-CAP-08 is procedural (LOW)

`task_refs` still exist on the capsule (orientation snapshots). Nothing in `validateExecutionCapsule` can prove an implementation will not write them into Work State. Enforcement is `CapsuleServicePort.accept` contract text + M04 tests.

**Disposition:** acceptable for contracts-only meta; M04 ★ tests (M18 S1) must include “forged task state in capsule does not change ledger”.

### R3 — `WorkEvent.payload` is an untyped `Record` (MEDIUM)

Header-level trust fields are rejected (INV-EVT-05). Per-type payload schemas are deferred to producing metas. A future `handoff.requested` payload could reintroduce `next_action` as CONTROL (F12 second-order). Comment in `work-event.ts` assigns the duty; it is not a validator.

**Disposition:** freeze-OK if M02/M04 payload RFCs are required before those event types ship. Orchestrator should not treat EVENT_TYPE_CATALOG as a complete payload schema.

### R4 — `authority_model` is producer-asserted (LOW)

A forger can set `POLICY_REDERIVED_AT_ACCEPT` while also… failing INV-CAP-07 if they add `permissions`. The constant is documentation-in-band. Real control is forbidden fields + accept re-derivation + Policy.

**Disposition:** no change required.

### R5 — Secret scan heuristic (LOW, already documented)

`scanForSecrets` is denylist + key names. M00 states a clean scan is not proof of absence. M18 S8 remains the gate.

### R6 — Policy language and capability formula deferred (INFO)

ADR-V4-0010 / 0011 have decision dates. Not silent invention. Decision contracts exist so Wave 2 can proceed.

### R7 — M18 doc copies (INFO)

`docs/v4/security/*` are copies of M18 commits `a733630`/`47155ec`. Drift possible. README says M18 wins.

### R8 — Same-session review (PROCESS)

See §0. Not a substitute for M20 or for the orchestrator’s independent architecture review named in MASTER-PLAN Wave 1 exit.

## 5. What was *not* found

- No V3.7 certification files modified in this worktree’s M00-owned paths.
- No `npm install`, no `node_modules` duplication.
- No marketplace design, no Control Center UI, no Goal Compiler.
- No claim that V3.7 or V4 is APPROVED.

## 6. Recommendation to orchestrator

Mark M00 **ACCEPTED for Wave 2** with residuals R1 and R3 on the freeze record. Dispatch a separate-context architecture reviewer if quota allows; treat that review as able to reopen freeze, not as a rubber stamp of this note.
