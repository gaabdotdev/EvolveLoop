# Orchestrator directive — M19 Wave 3 integrate

**To:** M19 (`feature/v4-integration`)  
**From:** V4 Master Orchestrator  
**When:** 2026-11-15T15:14Z  

M04 and M05 are **orchestrator-ACCEPTED**. Integrate only these tips.

## Tips (order)

| Order | Meta | Worktree | Tip |
|------:|------|----------|-----|
| 1 | M04 | `/home/gaab/Downloads/EvolveLoop-v4-m04` | `14aa02b` (`feature/v4/m04-continuity`) |
| 2 | M05 | `/home/gaab/Downloads/EvolveLoop-v4-m05` | `b27b2cb` (`feature/v4/m05-timetravel`) |

Ownership is disjoint (`continuity/**` vs `timetravel/**`). Prefer `git merge --no-ff` full hashes from linked worktrees.

## Procedure

1. PATH `/usr/bin:/bin` + nvm node if needed for vitest.
2. Commit pending orch docs if dirty.
3. Merge M04 then M05.
4. `cd orchestrator && npx vitest run tests/v4` must pass (expect ≥ 202 + 17 + 15 ≈ 234 if additive).
5. Update `INTEGRATION-STATUS.md`.
6. Do **not** claim V4 APPROVED (G17). Continuity vertical gate is a **follow-on** (`ORCHESTRATOR-DIRECTIVE-CONTINUITY-GATE.md`) after this integrate.
