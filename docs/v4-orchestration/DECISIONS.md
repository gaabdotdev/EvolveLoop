# Orchestrator Decisions Log

| ID | Date | Decision | Rationale | Status |
|----|------|----------|-----------|--------|
| OD-001 | 2026-11-15 | Use `03937c1` (`recovery/v37-full-cert` tip) as **provisional** V4 baseline | Best available V3.7-integrated tip; cert still BLOCKED on G17 | ACTIVE |
| OD-002 | 2026-11-15 | Do not modify `recovery/v37-full-cert` worktree/branch | Mission §1.2 | ACTIVE |
| OD-003 | 2026-11-15 | Create `feature/v4-integration` + per-meta worktrees from provisional tip | Isolation + M19-only merges | ACTIVE |
| OD-004 | 2026-11-15 | Symlink `orchestrator/node_modules` from cert worktree into V4 worktrees | Disk ~99% full | ACTIVE |
| OD-005 | 2026-11-15 | Wave 1 = M00 + M18 only | Contracts before broad implementation | ACTIVE |
| OD-006 | 2026-11-15 | Runtime: `cursor-agent --yolo` in meta worktrees; high models for M00/M18 | Architecture/security criticality | ACTIVE |
| OD-007 | 2026-11-15 | Treat constitution examples as non-final schemas | Constitution § interpretation | ACTIVE |
| OD-008 | 2026-11-15 | Open technical questions (Event Ledger style, capsule signing, etc.) → ADRs by M00, not orchestrator invention | Mission + constitution §15.2 | ACTIVE |
