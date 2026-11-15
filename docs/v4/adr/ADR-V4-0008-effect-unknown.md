# ADR-V4-0008 — Effect Ledger and UNKNOWN

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (semantics); M03 (ledger) |
| Constitution | §4.4, §7.3, §14 (no exactly-once), §15.2 Effect Ledger |
| M18 | F05, F06, D05, D07, D08, D19 |
| Contracts | `effect.ts` (`decideRetry`, `EFFECT_TRANSITIONS`) |

## Context

§15.2: how to represent partial confirmation, UNKNOWN, compensation and per-integration reconciliation?

V3 idempotency store cannot represent "started, outcome unknown" (F06): `beginOrReplay` returns `fresh` without persisting a reservation. Fencing on tip protects CP result commit, not external effects (F05). Executors must not be believed for COMMITTED/NOT_EXECUTED (D05).

## Decision

**No exactly-once claim.** The platform offers at-most-once *dispatch decisions* per `effect_id`, plus idempotency keys, reconciliation and compensation where the target supports them.

States (normative comments in `effect.ts`): PLANNED → AUTHORIZED → DISPATCHED → COMMITTED | REJECTED | UNKNOWN | PARTIAL | NOT_EXECUTED, with ESCALATED and COMPENSATED.

Rules:

1. **Write-ahead DISPATCHED:** the DISPATCHED transition is made durable **before** the request leaves the platform. A crash therefore yields UNKNOWN (or DISPATCHED, which `decideRetry` treats like UNKNOWN), never silence.
2. **Executor report alone ≤ UNKNOWN** (D05). COMMITTED / REJECTED / NOT_EXECUTED require CP-side observation or reconciliation evidence (`INV-EFF-03`). `validateEffectRecord` rejects evidenceless `NOT_EXECUTED` so a lying executor cannot induce a fresh `effect_id` for the same intent. `decideRetry(NOT_EXECUTED)` remains `FORBIDDEN` (terminal; a proven non-execution needs a *new* authorized effect, not a silent redispatch of the same id).
3. **`decideRetry` is normative** (implementations must return the same action):
   - UNKNOWN/DISPATCHED + idempotency key → `RETRY_WITH_SAME_IDEMPOTENCY_KEY`
   - else if status query → `RECONCILE_FIRST`
   - else → `ESCALATE` (`INV-EFF-04` forbids staying silently UNKNOWN when neither path exists)
   - `fork_inherited` + EXTERNAL → `FORBIDDEN`
4. At most one in-flight attempt per idempotency key (F06). Keys compared without lossy transformation.
5. Integration capabilities (`supports_idempotency_key`, `supports_status_query`, `supports_compensation`) are declared per target — they drive the function, not hope.
6. UNKNOWN rate is a M12 metric (D07); this ADR does not implement quarantine (M10/M12).

## Consequences

- M03 owns the ledger. M04 recovery calls `retryDecision`. M06 evidence for COMMITTED is independent of the executor when the target can be queried.
- Tests must include: kill between dispatch and confirm; concurrent begins; executor lies COMMITTED/NOT_EXECUTED.

## Alternatives rejected

- **Assume exactly-once via a transaction coordinator with git/GitHub:** those APIs are not transactional with us.
- **Treat executor "done" as COMMITTED:** D05.
- **Blind retry on UNKNOWN:** constitution §7.3 forbids it.
