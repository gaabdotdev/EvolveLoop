# V3-ORCH-04 Evidence — Execução Especulativa Competitiva (Best-of-N)

- **ts:** 20261121T234517Z
- **task:** M11-V3-ORCH-04-BEST-OF-N (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T234517Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` exists. Contrato = brief MSO M11-V3-ORCH-04 + docs/v3.7 Speculative Execution (opt-in; cancel losers).

## Implementação

| Peça | Path |
|------|------|
| Best-of-N race/promote/cancel | `orchestrator/src/v3/parallel/best-of-n.ts` |
| Exports parallel | `orchestrator/src/v3/parallel/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-orch-04-best-of-n.test.ts` |

### Contrato mínimo fechado

- `triggerBestOfN(blockedTask, N, gate, hooks)` — gate **armed** obrigatório (disabled by default)
- Admissão: task `BLOCKED` + `critically_blocked` / `criticality=critical` (salvo `require_critical=false`)
- Rejeita `GATE_NOT_ARMED`, `NOT_BLOCKED`, `NOT_CRITICALLY_BLOCKED`, `INVALID_N`, `N_EXCEEDS_MAX`, `COST_CAP_EXCEEDED`
- Race N executors com `AbortSignal`; promove o **primeiro** que passa validator **determinístico**
- Cancela losers (`abort`); status `promoted` | `all_failed` | `rejected` | `cancelled_external`
- **Não** é V1-TOK-13 `speculative-pipeline` (draft→test→cloud escalate)

### Cenários cobertos

1. helpers isBlockedTask / isCriticallyBlocked
2. GATE_NOT_ARMED
3. NOT_BLOCKED / NOT_CRITICALLY_BLOCKED
4. INVALID_N / N_EXCEEDS_MAX / COST_CAP_EXCEEDED
5. assertBestOfNAdmission throws
6. reject sem spawn quando gate fechado
7. promote first + cancel losers (AbortSignal)
8. skip invalid → promote next validated
9. all_failed
10. cancelled_external via AbortSignal
11. require_critical=false permite non-critical
12. loser nunca promove após winner

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-ORCH-04 | `npx vitest run tests/unit/v3-orch-04-best-of-n.test.ts` | **0** | `vitest-v3-orch-04.txt` / `.log` / `.exit` |
| Regressão ORCH (v3-01..04 + v2 parallel) | `npx vitest run tests/unit/v3-orch-0{1,2,3,4}-*.test.ts tests/unit/v2-orch-{01,02,03,04}-*.test.ts` | **0** | `vitest-regression-orch.txt` / `.exit` |

## STATUS

**PASS**
