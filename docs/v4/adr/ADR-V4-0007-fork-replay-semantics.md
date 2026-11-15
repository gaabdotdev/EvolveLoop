# ADR-V4-0007 — Fork and replay semantics

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (semantics); M05 (engine); M03 (effects); M10 (grants) |
| Constitution | §4.6, §7.4, §14 (no absolute replay determinism), §15.2 Fork/replay |
| M18 | D08 |
| Contracts | `Work.forked_from`, `EffectRecord.fork_inherited`, `decideRetry` |

## Context

§15.2: which data are copied, referenced, or re-executed? How to neutralize side effects?

Constitution forbids automatic re-application of external effects. Replay is not determinism of models.

## Decision

A **fork** is a **new Work** (`INV-WORK-05`) with `forked_from { work_id, checkpoint_id, event_seq }`.

| Kind | Fork behaviour |
|------|----------------|
| Event history of the base | **Referenced** (immutable). Not copied as live events of the fork. |
| Artifacts | **Referenced** by hash. |
| Goal Contract | New version on the fork (may start identical); base versions stay. |
| Checkpoints | New checkpoint ids; first checkpoint of the fork cites the base seq as origin. |
| Grants, credentials, leases | **Not inherited**. Fresh authorization required (D08). |
| External effects of the base | Recorded on the fork as `fork_inherited=true`. `decideRetry` → `FORBIDDEN` for `EXTERNAL`. Replay consumes recorded outputs, never re-dispatches. |
| Internal projections | Rebuilt for the fork from referenced events up to the checkpoint, then new events. |

**Replay** of a step is declared `RECORDED` (reuse captured inputs/outputs) or `REEXECUTE` (call the executor again). Side effects are never re-applied automatically. A `REEXECUTE` that needs an external effect creates a **new** `EffectRecord` (new id, new authorization).

## Consequences

- Time travel inspection (M05/M15) reads the base log; it does not mutate it.
- Comparison between fork and base is a M05/M17 concern using two work ids.

## Alternatives rejected

- **Copy-on-write of the entire data-dir:** duplicates grants/epochs (D19/F13 hazards).
- **Same work id with a branch seq:** destroys identity; WorkProof and provenance would mix histories.
