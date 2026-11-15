# Wave 3 status — V4.1 Continuity

**Prerequisite:** Phase 2 gate **PASSED** (vertical Intent→WorkProof ACCEPTED @ `cf37912`).  
**Baseline tip for new worktrees:** `feature/v4-integration` HEAD (includes Wave 2 + vertical).  
**Global:** V3.7 G17 still BLOCKED — no V4 APPROVED.

| Meta | Focus | Status | Notes |
|------|-------|--------|-------|
| M04 | Capsule, Handoff & Recovery | PENDING | Depends on M01/M02/M03; F01 capsule≠grant |
| M05 | Time Travel, Replay & Fork | PENDING | Depends on M02; no absolute determinism claim |
| M03-full | Effect Ledger continuity extensions | PENDING | Only if M03 gaps remain after Wave 2 |
| M06-handoff | WorkProof across capsule handoff | PENDING | After M04 |
| M12-cont | Observability continuity | PENDING | After M04/M05 signals exist |
| M18 | Continuity threat review (RO) | PENDING | Parallel read-only later |

## Launch gate (orchestrator)

- [x] Vertical slice ACCEPTED
- [ ] Wave 3 prompts authored (`prompts/M04-MISSION.md`, `M05-MISSION.md`, `WAVE3-COMMON.md`)
- [ ] Worktrees created from integration tip (watch **disk** — B-DISK)
- [ ] Agents launched (prefer Grok if Opus/Sol/Sonnet/Codex/Gemini quota exhausted)

Do **not** launch M07+ until Continuity handoff/recovery slice is green (MASTER-PLAN Phase 3 gate).
