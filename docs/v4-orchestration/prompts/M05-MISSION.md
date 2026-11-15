# META M05 — Time Travel, Replay & Fork

Leader for V4.1 Continuity (history path). Read `WAVE3-COMMON.md` first.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m05` |
| Branch | `feature/v4/m05-timetravel` |
| Ownership | `orchestrator/src/v4/timetravel/**` + `orchestrator/tests/v4/timetravel/**` |
| Contracts | FROZEN import only — Work `forked_from`, Effect `fork_inherited`, `decideRetry`, checkpoints |
| ADRs | ADR-V4-0007 (primary), 0003, 0008; constitution §14 |
| Chapters | §4.6, §7.4, §15.2 Fork/replay |

## Implement

1. **Inspect / time travel** — read-only views over M02 event log + checkpoints; never mutate the base log.
2. **Fork** — new `work_id` (`INV-WORK-05`) with `forked_from { work_id, checkpoint_id, event_seq }`; reference base history/artifacts by hash; **do not** copy grants/credentials/leases (D08); mark base EXTERNAL effects on the fork as `fork_inherited=true` (via M03 APIs) so `decideRetry` → `FORBIDDEN` for EXTERNAL; rebuild internal projections from referenced events up to checkpoint, then new events.
3. **Replay** — declare step mode `RECORDED` (reuse captured I/O) or `REEXECUTE` (new executor call). **Never** auto-reapply external side effects. A `REEXECUTE` that needs EXTERNAL creates a **new** EffectRecord (new id, new authorization).
4. Tests: fork identity ≠ base; inherited EXTERNAL cannot re-dispatch; RECORDED vs REEXECUTE behaviour; inspection does not append events.

## Do not

- Claim absolute replay determinism of models (§14).
- Edit FROZEN contracts / V3.7 cert / other metas' trees.
- Merge to integration. Self-ACCEPTED. `npm install`.

## Accept (orchestrator)

Fork + replay semantics match ADR-0007; side effects not auto-replayed; delivery report under `timetravel/`. Status = DELIVERED for validation.
