# EvolveLoop V4 — Domain model and invariants (M00)

Constitution §5 names concepts, not schemas. This file binds each concept to the v1 contract, invariants, and the ADR that justifies remaining choices.

Invariants are enforced by `validate*` / normative functions in `orchestrator/src/v4/contracts/`. Cross-object checks (`checkProofCoverage`, `checkCheckpointAgainst`, `validateTaskGraph`, `checkEventStream`) must be called by implementations.

## Entities

### Work

Durable unit owned by the platform. Projection of the per-work event stream.

| Id | Rule |
|----|------|
| INV-WORK-01 | `owner` is the constant `"platform"` |
| INV-WORK-03 | `last_event_seq` is the projection high-water mark |
| INV-WORK-04 | `COMPLETED` requires a WorkProof reference (`outcome`) — proof status is separate |
| INV-WORK-05 | a fork is a new `work_id` |

States: CREATED → … → COMPLETED/FAILED/CANCELLED (`WORK_TRANSITIONS`). Progress epistemic status (`ProgressStatus`) is CONFIRMED / ATTEMPTED / HYPOTHESIS / UNKNOWN / UNVERIFIED.

### Goal Contract

Versioned intent, constraints, acceptance. Immutable per version; vN supersedes vN-1 (`INV-GC-05`).

| Id | Rule |
|----|------|
| INV-GC-02 | ACCEPTED ⇒ ≥1 mandatory criterion |
| INV-GC-03 | ACCEPTED ⇒ no OPEN blocking ambiguities; ASSUMED ambiguities cite a visible assumption |
| INV-GC-04 | unique `criterion_id` |
| INV-GC-06 | verification methods ⊆ non-self kinds (no SELF_REPORTED) |

`execution.autonomy` is vocabulary; **effective** authority is Policy (ADR-V4-0011, D06). Executors cannot version the Goal Contract (D15 — M01).

### Task

Unit of work with dependencies. Executors never set VERIFIED.

| Id | Rule |
|----|------|
| INV-TASK-01 | no self-dependency |
| INV-TASK-02 | dependencies exist in the same work |
| INV-TASK-03 | VERIFIED requires evidence |
| INV-TASK-04 | CONFIRMED progress ⇔ VERIFIED (or OBSOLETE after having been verified) |
| INV-TASK-05 | graph is acyclic |

### Execution

One attempt by one executor. `result_claim` is audit-only (INV-EXEC-04 by construction — not an authoritative field).

| Id | Rule |
|----|------|
| INV-EXEC-02 | terminal state requires `ended_at` |
| INV-EXEC-03 | cost provenance mandatory; UNAVAILABLE ⇒ `amount` null |
| INV-EXEC-05 | FAILED/TIMED_OUT/LOST classified (`FailureClass`) |

LOST ⇒ effects it dispatched may be UNKNOWN (ADR-V4-0008).

### Executor

Replaceable agent/model/provider/runtime/worker/tool/human. Declared capabilities are claims. `trust_state` mirrors V3.7 `TrustState`. No self-declared scores (`INV-EXECR-02`). Conformance C0–C3 (ADR-V4-0013). `isAssignable` ⇔ `trusted`.

### Execution Capsule

Portable package for another executor to continue. **Not a grant** (ADR-V4-0006).

| Id | Rule |
|----|------|
| INV-CAP-01 | `manifest_sha256` matches canonical digest |
| INV-CAP-02 | no secret material; grant refs only |
| INV-CAP-03 | `not_preserved` declared |
| INV-CAP-04 | `open_effects` only open states |
| INV-CAP-05 | format major compatible |
| INV-CAP-06 | grant refs not expired at verify |
| INV-CAP-07 | `authority_model = POLICY_REDERIVED_AT_ACCEPT`; V3 permission/control fields forbidden |
| INV-CAP-08 | `task_refs` are snapshots; Work State is never written from the capsule |
| INV-CAP-09 | executor text is UNTRUSTED_DATA (ADR-V4-0017) |

### Checkpoint

Three layers (ADR-V4-0005): workflow (authoritative), workspace snapshot, context hint (non-authoritative).

| Id | Rule |
|----|------|
| INV-CKPT-01 | `event_seq` ≤ work head; same work |
| INV-CKPT-02 | `context_hint` is not required for recovery |
| INV-CKPT-03 | artifact refs content-addressed and resolvable |
| INV-CKPT-04 | open effects listed |
| INV-CKPT-05 | `state_digest` is sha256 |

### Effect Record

No exactly-once (ADR-V4-0008).

| Id | Rule |
|----|------|
| INV-EFF-02 | states ≥ AUTHORIZED cite a PolicyDecision |
| INV-EFF-03 | COMMITTED/REJECTED/PARTIAL/COMPENSATED cite evidence |
| INV-EFF-04 | UNKNOWN external without idempotency or query must be ESCALATED |
| INV-EFF-05 | COMPENSATED cites a different compensating effect |

`decideRetry` is normative.

### Artifact

Content-addressed, immutable. New content ⇒ new artifact. `INV-ART-01` sha256; `INV-ART-02` full git hash when present. Cross-project deny-by-default via `access.project_ids` (not tenancy).

### Evidence

| Id | Rule |
|----|------|
| INV-EVD-01 | SELF_REPORTED method ⇔ SELF_REPORTED provenance; independence uses executor ids |
| INV-EVD-02 | limitations non-empty |
| INV-EVD-03 | tested artifacts hash-identified |
| INV-EVD-04 | no self-asserted trust fields (F09) |
| INV-EVD-05 | no secret material (heuristic) |

### WorkProof

Honesty: `deriveFinalStatus` is the only path to PROVEN. Open effects cap at PARTIAL.

| Id | Rule |
|----|------|
| INV-PROOF-01 | `final_status` equals derivation |
| INV-PROOF-02 | every mandatory criterion of the cited Goal Contract version is covered |
| INV-PROOF-03 | PROVEN requirement has qualifying evidence |
| INV-PROOF-04 | PARTIAL/UNVERIFIED states gaps |
| INV-PROOF-05 | immutable; changes supersede |
| INV-PROOF-06 | no secret material (heuristic) |

### Policy / PolicyDecision

Deny-by-default. Decision TTL ≤ 5 min. Language deferred (ADR-V4-0011).

| Id | Rule |
|----|------|
| INV-POL-01 | `default_effect = DENY` |
| INV-POL-02 | decision TTL in (0, 5 min] |
| INV-POL-03 | non-DENY cites matched rules |
| INV-POL-04 | no ALLOW * for * |
| INV-POL-05 | L3 ALLOW has cost and time limits |

### Capability Profile

Disclosure frozen; formula deferred (ADR-V4-0010). INV-CPROF-01..04 (provenance, sample/uncertainty, no global rank, ACTIVE requires ACCEPTED methodology).

### Work Event

| Id | Rule |
|----|------|
| INV-EVT-01 | contiguous per-work `seq` from 1; one work per stream |
| INV-EVT-02 | `event_id` unique or digest-identical duplicate |
| INV-EVT-03 | `payload_digest` matches payload |
| INV-EVT-04 | type in catalog (or experimental `x.mNN.*`) |
| INV-EVT-05 | no self-asserted trust fields |
| INV-EVT-06 | hash chain (`GENESIS` → `event_digest`) |

### Tenancy

`INV-TENANT-01`: `tenant_id = "local"` (ADR-V4-0014).

## State machines

See `WORK_TRANSITIONS`, `TASK_TRANSITIONS`, `EXECUTION_TRANSITIONS`, `EFFECT_TRANSITIONS` in code. Implementations must use `isAllowedTransition` (or equivalent) before appending `*.state_changed`.
