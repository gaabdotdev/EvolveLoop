# ADR-V4-0005 — Checkpoint boundaries

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (model); M02 (store) |
| Constitution | §5 Checkpoint, §7.2, §15.2 Checkpoint |
| Contracts | `checkpoint.ts` |

## Context

§15.2: limite entre checkpoint de workflow, snapshot de workspace e estado de conversa/contexto?

Mixing these layers is how V3 handoff packages became both "state" and "prompt". Recovery must survive missing model memory (constitution §3).

## Decision

A `Checkpoint` has **three layers**; only layer 1 is authoritative.

| Layer | Content | Authoritative? | Required for recovery? |
|-------|---------|----------------|------------------------|
| 1 Workflow state | `event_seq`, `state_digest`, `task_states`, `effect_summary`, `artifact_refs`, `goal_contract_ref` | **Yes** | **Yes** |
| 2 Workspace snapshot | optional content-addressed git commit / archive | No (evidence of files) | No, but needed to resume file-mutating tasks |
| 3 Context hint | optional `context_hint` ContentRef (conversation/compaction) | **No** (INV-CKPT-02) | **No** — recovery MUST NOT require it |

Open effects at the checkpoint **must** be listed (`INV-CKPT-04`) so recovery reconciles before acting (ADR-V4-0008).

`latestConsistent` returns only `consistency = VERIFIED` checkpoints.

## Consequences

- Capsules reference layer 1 (`base_checkpoint`) and may attach layer 2 as artifacts. Layer 3, if present, is `not_preserved` unless explicitly copied as UNTRUSTED_DATA (ADR-V4-0017).
- M15 may render context hints; they never drive Task state.

## Alternatives rejected

- **Single blob mixing chat + git + events:** un-verifiable; V3 HandoffPackage failure mode (F01/F12).
- **Requiring conversation state for recovery:** violates substitutability of executors.
