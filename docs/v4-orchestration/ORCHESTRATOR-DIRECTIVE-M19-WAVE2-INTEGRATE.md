# Orchestrator directive — M19 Wave 2 integrate

**To:** M19 integrator (`feature/v4-integration` @ `/home/gaab/Downloads/EvolveLoop-v4-integration`)  
**From:** V4 Master Orchestrator  
**When:** 2026-11-15T14:18Z  

All Wave 2 implementer deliveries below are **orchestrator-ACCEPTED**. Integrate **only** these tips. Do not re-validate product logic beyond post-merge vitest. Do not touch V3.7 cert / recovery / G17 surfaces.

## ACCEPTED tips (merge in this order)

| Order | Meta | Branch | Tip (short) | Ownership |
|------:|------|--------|-------------|-----------|
| 1 | M02 | `feature/v4/m02-ledger-checkpoints` | `374769d` | `ledger/**`, `checkpoint/**`, `artifacts/**`, `adapters/v37/ledger.ts` (+index export) |
| 2 | M01 | `feature/v4/m01-goal-work` | `f72ad76` | `goal/**`, `work/**` |
| 3 | M03 | `feature/v4/m03-effect-ledger` | `91dbdf3` | `effects/**` |
| 4 | M06 | `feature/v4/m06-workproof-min` | `2728695` | `proof/**` |
| 5 | M10 | `feature/v4/m10-policy-foundations` | `78fa4bc` | `policy/**`, `adapters/v37/{identity,policy}.ts`, `docs/v4/policy/**` |
| 6 | M12 | `feature/v4/m12-obs-init` | `72c5f5b` | observability ownership as delivered |

Worktrees (same machine): `/home/gaab/Downloads/EvolveLoop-v4-{m01,m02,m03,m06,m10,m12}`.

## Procedure

1. Stay in integration worktree. Commit any pending orch-doc edits first if dirty (orchestration only).
2. For each tip: `git merge --no-ff <tip>` (or branch tip). Prefer fetching from local worktree refs already sharing the freeze ancestor.
3. If `orchestrator/src/v4/adapters/v37/index.ts` conflicts (M02 vs M10): **union exports** — keep M02 `ledger` binding **and** M10 `identity`/`policy` exports. Do not drop either side.
4. After each merge (or once at end if clean):  
   `cd orchestrator && npx vitest run tests/v4`  
   Failures → stop; report; do not force.
5. Never `npm install` unless required; never edit ACCEPTED implementer ownership trees to “fix” product — only merge + minimal conflict resolution.
6. Update `docs/v4-orchestration/INTEGRATION-STATUS.md` with merge hashes and test counts.
7. Do **not** claim V4 APPROVED (V3.7 G17 still BLOCKED).

## Done when

- All six tips are ancestors of `feature/v4-integration`
- `tests/v4` green on integration HEAD
- INTEGRATION-STATUS records each merge hash
