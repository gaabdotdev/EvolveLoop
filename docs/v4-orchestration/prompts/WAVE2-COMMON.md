# Wave 2 (V4.0) — common constraints

**Gate:** Contracts must be **FROZEN** (or orchestrator waiver). Do not start implementation until `docs/v4/architecture/CONTRACT-FREEZE.md` exists with status FROZEN, or orchestrator directive says otherwise.

**Baseline tip after M19 integrate:** follow `feature/v4-integration` HEAD.

**Rules for all Wave 2 metas:**

1. Isolated worktree + branch `feature/v4/<id>-<slug>` from integration HEAD.
2. Import contracts only from `orchestrator/src/v4/contracts/`.
3. Own only paths in `OWNERSHIP-MAP.md`.
4. No V3.7 cert edits; adapters only.
5. No exactly-once claims; honor Effect UNKNOWN / decideRetry.
6. Capsule ≠ grant; policy deny-by-default foundations where applicable.
7. Disk tight: no npm install; symlink node_modules.
8. Subagents + independent review of own module.
9. Deliver commits + tests + delivery report; no self-ACCEPTED; no merge to integration.

## Metas this wave

| Meta | Focus | Paths |
|------|-------|-------|
| M01 | Goal Compiler & Work State | `orchestrator/src/v4/goal/**`, `work/**` |
| M02 | Event Ledger, Persistence, Checkpoints | `ledger/**`, `checkpoint/**`, `artifacts/**` |
| M03 | Effect Ledger (initial) | `effects/**` |
| M06 | WorkProof mínimo | `proof/**` |
| M10 | Policy foundations | `policy/**` (+ adapter stubs) |
| M12 | Observability init | `observability/**` wrapping MP |

Vertical slice target: Intent → Goal Contract → Work → Task → Execution → Event/Checkpoint → Effect/Artifact → Verification → WorkProof.
