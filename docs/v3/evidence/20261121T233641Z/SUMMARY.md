# V3-ORCH-02 Evidence — Dynamic DAG Auto-Replanning

- **ts:** 20261121T233641Z
- **task:** M9-V3-ORCH-02-DYNAMIC-DAG (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T233641Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` exists. Contrato = brief MSO M9-V3-ORCH-02.

## Implementação

| Peça | Path |
|------|------|
| proposeDagMutation + validateMutationDeterministic | `orchestrator/src/v3/task-graph/dynamic-dag.ts` |
| Exports task-graph | `orchestrator/src/v3/task-graph/index.ts` |
| Re-exports MSO | `orchestrator/src/v3/mso/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-orch-02-dynamic-dag.test.ts` |

### Contrato mínimo fechado

- `proposeDagMutation({ work_id, proposer_*, ops })` — proposta estrutural com `proposal_id` sha256 determinístico (body canónico; sem apply)
- `validateMutationDeterministic({ proposal, nodes, budget, permissions })` — validação MSO determinística; **rejeita**:
  - `CYCLE` — grafo projetado cíclico (topo MSO)
  - `BUDGET_MAX_TASKS` / `BUDGET_MAX_DEPTH` / `BUDGET_MAX_FAN_OUT` / `BUDGET_MAX_MUTATIONS` / `BUDGET_TOKENS`
  - `PERMISSION_ROLE` / `PERMISSION_OP` / `PERMISSION_SCOPE` (subtree)
- Ops: `add_task` | `remove_task` | `set_depends_on` | `add_dependency` | `remove_dependency`
- Mesmos inputs → mesmos `accepted`/`codes`/`reasons` (ordenados)

### Cenários cobertos

1. proposal_id determinístico (proposed_at fora do hash)
2. add_task acíclico aceite dentro do orçamento
3. CYCLE via add_dependency / set_depends_on mútuo
4. BUDGET_MAX_TASKS / DEPTH / FAN_OUT / MUTATIONS / TOKENS
5. PERMISSION_ROLE / OP / SCOPE (subtree)
6. subtree add_task sob proposer aceite
7. validação repetível byte-igual
8. remove_task limpa deps; EMPTY_OPS rejeitado

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-ORCH-02 | `npx vitest run tests/unit/v3-orch-02-dynamic-dag.test.ts` | **0** | `vitest-v3-orch-02.txt` / `.log` / `.exit` |
| Regressão ORCH (v3-01 + v2 parallel) | `npx vitest run tests/unit/v3-orch-01-critical-path.test.ts tests/unit/v2-orch-{01,02,03,04}-*.test.ts` | **0** | `vitest-regression-orch.txt` / `.exit` |

## STATUS

**PASS**
