# ORCH-01 — File-Ownership Locking

- **STATUS:** INSUFFICIENT_FOR_EXIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Paralelismo 3+ nós: File-Ownership Locking serializa só tarefas conflitantes
- **test_file:** `orchestrator/tests/unit/v2-orch-01-file-ownership.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-orch-01-file-ownership.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- `taskScopePaths` / `pathsOverlap` (prefix intersection).
- Disjoint paths → ambos `IN_PROGRESS` (max_in_progress).
- Overlap / prefix overlap → um `IN_PROGRESS`, outro `queued_for_lock` / `PENDING`.
- Release de lock permite avanço do waiter.
- `max_in_progress` defere sem conflito de lock.
- **5 tarefas** com interseção parcial: só não-conflitantes avançam (`t1,t3,t4` vs `t2,t5` queued).

## LIMITATION

§4.1 exige 3–5 tarefas **simultâneas em worktrees reais** com interseção parcial. O unitário exercita só o scheduler/TaskGraphStore em tmp — **sem worktrees git paralelos live**. Não fecha o critério de paralelismo da matriz §6.
