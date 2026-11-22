# ORCH-02 — Merge Queue + AST-Aware Merge

- **STATUS:** INSUFFICIENT_FOR_EXIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Merge Queue + AST-Aware Merge resolve ≥90% conflitos sintáticos sem LLM; testes pós-rebase bloqueiam commit quebrado
- **test_file:** `orchestrator/tests/unit/v2-orch-02-merge-queue.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-orch-02-merge-queue.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Fila determinística (`enqueue_seq | created_at | task_id`).
- Merge sintático disjunto TS → `MERGED` / `ast-internal` / sem LLM (`semantic_needed=false`).
- Conflito no mesmo símbolo → `NEEDS_SEMANTIC_TASK`.
- Testes integrados falhando → `TESTS_FAILED`, sem commit.
- Mergiraf ausente → fallback AST; `syntactic_ratio >= 0.9` no caso fixture.
- `processNext` serializa cabeça da fila.

## LIMITATION

§4.1/§6 pedem Merge Queue com **≥90% AST sem LLM** no cenário de **3–5 worktrees** com conflitos reais pós-rebase. O unitário prova o motor em fixtures sintéticos e ratio≥0.9 num único enqueue — **não** um corpus live de merges paralelos.
