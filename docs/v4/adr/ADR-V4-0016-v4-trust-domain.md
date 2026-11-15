# ADR-V4-0016 — V4 executor trust domain (supersedes ADR-V37-0003 *for executors*)

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (boundary); M10 (approver authN); M13 (isolation); M15 (approval UI) |
| Constitution | §3 (executor cannot approve its own result), §4.10 L2, §9.2 |
| M18 | **TM-V4-F02** (CRITICAL under V4 adversary model) |
| Related | ADR-V37-0003 (V3.7 Coordinator IPC); this ADR does **not** rewrite V3.7 cert |

## Context

ADR-V37-0003 scopes V3.7 Coordinator IPC to a **single-user trusted host**: same-UID processes that can read the data-dir are out of scope (treated as operator-account compromise). Optional `SO_PEERCRED` is cited in that ADR and **is not implemented** (`rg -i peercred` over `orchestrator/src` is empty) — ADR/code drift.

V4 constitution introduces untrusted executors (third-party, ephemeral, other providers). M18 F02: any executor outside the OS sandbox, running as the operator UID with data-dir access, can self-approve L2 (`actor` is caller-supplied; CLI falls back to direct store write). Under ADV1/ADV2 this is CRITICAL: L2 collapses to L1.

V4 cannot reuse ADR-V37-0003's "same-UID is fine" assumption for **executors** without violating §3.

## Decision

1. **Split the trust domain.**
   | Domain | Who | ADR-V37-0003 applies? |
   |--------|-----|------------------------|
   | **Operator control** | Human operator tools (CLI, Control Center backend, Coordinator) on the Control Plane host | **Yes** — still a single-user trusted host for *operator* processes. V3.7 IPC remains. We do **not** claim `SO_PEERCRED` as a control until M10 implements it. |
   | **Executors** | Agents, models, harnesses, third-party runtimes, workers, ephemeral nodes | **No.** Executors are ADV1/ADV2. They MUST NOT share the Control Plane OS user, data-dir, IPC tokens, or approval store. |

2. **Isolation (property, mechanism is M13):** executors run in a distinct trust domain — separate OS user, container, or host. They cannot read `ipc.privileged.token`, approvals dir, ledger files, or CA keys. Sandbox profile `none` and "harness outside bwrap" (V3 R05) are **not** acceptable V4 defaults for untrusted executors.

3. **Approver identity (M10):** approver is an authenticated **HUMAN** (or POLICY_ENGINE) principal, distinct from any executor id. `decided_by` is derived from authentication, **never** from request payload. No store-write fallback that bypasses the token (F02 CLI path must die in the V4 adapter).

4. **Separation of duties:** an executor cannot approve its own result (§3). Policy rejects `subject.executor_id == approver` mapped identities.

5. **ADR-V37-0003 is not deleted.** It remains the V3.7 IPC contract. V4 *executor* security is this ADR. V3.7 cert artifacts are not edited.

6. Compromise of the Control Plane host and of the operator account remains out of scope for V4.0–V4.2 (M18 §2), consistent with ADR-V37-0003's host-compromise clause — **except** that "executor with same UID" is no longer classified as host compromise; it is a V4 product bug.

## Consequences

- M13 must provide an isolation story before any untrusted executor is dispatched in V4.0.
- M10 approval API cannot accept `actor` from the executor.
- M15 remote approval (when it exists) authenticates humans, not workers.
- Tests: self-approval by executor identity must fail (M18 S2).

## Alternatives rejected

- **Keep ADR-V37-0003 as the V4 executor model:** contradicts constitution §3 and M18 F02 CRITICAL.
- **Claim SO_PEERCRED as already providing the boundary:** it is not in the code.
- **In-memory-only CP secrets to stop same-UID executors:** rejected in ADR-V37-0003 for operator malware (`ptrace`); we isolate executors instead of pretending to stop a same-UID debugger of the CP.

## Residual uncertainty

Concrete isolation mechanism (user namespace vs container vs remote worker) is M13. Decision date: Phase 2 (whatever approval path V4.0 ships) — M18 marks S2 as ★2 for that path.
