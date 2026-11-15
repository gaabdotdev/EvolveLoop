# Wave 3 status — V4.1 Continuity

**Prerequisite:** Phase 2 gate **PASSED** (vertical Intent→WorkProof ACCEPTED @ `cf37912`).  
**Baseline tip for new worktrees:** `feature/v4-integration` HEAD (includes Wave 2 + vertical).  
**Global:** V3.7 G17 still BLOCKED — no V4 APPROVED.

| Meta | Focus | Status | Notes |
|------|-------|--------|-------|
| M04 | Capsule, Handoff & Recovery | **RUNNING** | worktree @ `4117d21`; F01 capsule≠grant |
| M05 | Time Travel, Replay & Fork | **RUNNING** | worktree @ `4117d21`; ADR-0007 |
| M03-full | Effect Ledger continuity extensions | PENDING | Only if M03 gaps remain after Wave 2 |
| M06-handoff | WorkProof across capsule handoff | PENDING | After M04 |
| M12-cont | Observability continuity | PENDING | After M04/M05 signals exist |
| M18 | Continuity threat review (RO) | PENDING | Parallel read-only later |

## Launch gate (orchestrator)

- [x] Vertical slice ACCEPTED
- [x] Wave 3 prompts authored (`prompts/M04-MISSION.md`, `M05-MISSION.md`, `WAVE3-COMMON.md`)
- [x] Wave 2 implementer worktrees removed (tips already ancestors; disk reclaim)
- [x] Worktrees M04/M05 from integration tip `4117d21`
- [x] Agents launched (Grok — quota on heavier models)

Do **not** launch M07+ until Continuity handoff/recovery slice is green (MASTER-PLAN Phase 3 gate).
