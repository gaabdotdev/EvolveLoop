# V2 Exit Evidence Pack — M0-B-V2-EXIT-EVIDENCE-PACK

- **ts:** 20261121T222859Z
- **task:** M0-B-V2-EXIT-EVIDENCE-PACK (tentativa 2/3 meta M0)
- **evidence_dir:** `docs/v2/evidence/20261121T222859Z`
- **fonte contrato:** plano mestre §4 + matriz §6 linha V2
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop — contrato = plano mestre + código/testes (GAP wiki)

## Vitest (bruto)

- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts`
- **exit:** 0
- **log:** `vitest-v2-unit.log` (on disk; `*.log` gitignored)
- **log_tracked:** `vitest-v2-unit.txt` (cópia idêntica do stdout)
- **resultado:** Test Files 16 passed / Tests 145 passed

Extensões unitárias nesta tentativa (só gaps fecháveis sem infra live):

- `v2-mem-01-consolidation.test.ts`: lote 20+ episódios + dedupe
- `v2-orch-01-file-ownership.test.ts`: 5 tarefas com interseção parcial (scheduler)

## GATES_TABLE

| GATE | STATUS |
|------|--------|
| ORCH-01 | INSUFFICIENT_FOR_EXIT |
| ORCH-02 | INSUFFICIENT_FOR_EXIT |
| ORCH-03 | PASS_UNIT |
| ORCH-04 | INSUFFICIENT_FOR_EXIT |
| INT-01 | PASS_UNIT |
| INT-02 | INSUFFICIENT_FOR_EXIT |
| INT-03 | PASS_UNIT |
| INT-04 | PASS_UNIT |
| MEM-01 | PASS_UNIT |
| MEM-02 | PASS_UNIT |
| MEM-03 | PASS_UNIT |
| SEC-01 | PASS_UNIT |
| SEC-02 | PASS_UNIT |
| QUAL-01 | PASS_UNIT |
| QUAL-02 | PASS_UNIT |
| EVOL-01 | PASS_UNIT |

## Matriz §6 linha V2 — checklist de exit

| Critério matriz | Gate(s) | Verdict |
|-----------------|---------|---------|
| Paralelismo 3+ nós (worktrees) | ORCH-01 | **NÃO** — só scheduler unit; sem 3–5 worktrees live |
| Merge Queue ≥90% AST sem LLM | ORCH-02 | **NÃO** — ratio≥0.9 só em fixture sintético, não corpus live paralelo |
| Saga + idempotência | ORCH-03 | **SIM** — PASS_UNIT |
| Backpressure sem OOM | ORCH-04 | **NÃO** — telemetria sintética; sem saturação VRAM/OOM live |
| Mutation + revisão independente + quarentena tainted | QUAL-02, QUAL-01, SEC-01 | **SIM** — PASS_UNIT |
| Teto V1 preservado sem regressão sob paralelismo | _(sem gate TOK nesta pasta)_ | **NÃO** — ausência de evidência token+paralelismo |
| Recall@5≥0.85, Precision@5≥0.80, 0% INVALIDATED | MEM-03 | **SIM (harness fixtures)** — PASS_UNIT; retrieval live não medido |
| Laya calibrado | INT-02 | **NÃO** — offline/stub; não tarefas reais |

## PREREQ_V2_EXIT

**NÃO_SATISFEITO**

Motivo: existem gates `INSUFFICIENT_FOR_EXIT` e/ou critérios da matriz §6 sem evidência live/PASS completo.

### O que falta (objetivo)

1. **ORCH-01 live:** 3–5 worktrees reais com interseção parcial + prova de serialização só em conflitos.
2. **ORCH-02 live:** corpus de merges sob paralelismo com `syntactic_ratio ≥ 0.9` sem LLM + testes pós-rebase.
3. **ORCH-04 live:** saturação rate-limit/VRAM real sem crash OOM.
4. **INT-02 live:** benchmark Laya pt/en em tarefas reais EvolveLoop (calibração + latência/memória).
5. **TOK / matriz economia:** prova de teto V1 preservado **sob paralelismo** (sem inventar métricas — precisa harness live/comparador).
6. (Opcional reforço) MEM-03 contra índice RAG live; INT-03 medição live de redução de rework.

V3-* **não** implementado nesta tarefa (Todo V3 permanece fora de escopo).
