# V2 Exit Evidence Pack — M0-C-V2-LIVE-GATES-CLOSE

- **ts:** 20261121T224251Z
- **task:** M0-C-V2-LIVE-GATES-CLOSE (tentativa 3/3 meta M0)
- **evidence_dir:** `docs/v2/evidence/20261121T224251Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop — contrato = plano mestre + código/testes (GAP wiki)

## Vitest (bruto)

- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts`
- **exit:** 0
- **log:** `vitest-v2-unit.log` / twin `vitest-v2-unit.txt`

## GATES_TABLE

| GATE | STATUS |
|------|--------|
| ORCH-01 | PASS_LIVE |
| ORCH-02 | PASS_LIVE |
| ORCH-03 | PASS_UNIT |
| ORCH-04 | PASS_LIVE |
| INT-01 | PASS_UNIT |
| INT-02 | PASS_LIVE |
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
| TOK_PAR | PASS_LIVE |

## Matriz §6 linha V2 — checklist de exit

| Critério matriz | Gate(s) | Verdict |
|-----------------|---------|---------|
| Paralelismo 3+ nós (worktrees) | ORCH-01 | SIM |
| Merge Queue ≥90% AST sem LLM | ORCH-02 | SIM (ratio=0.9) |
| Saga + idempotência | ORCH-03 | SIM — PASS_UNIT |
| Backpressure sem OOM | ORCH-04 | SIM |
| Mutation + revisão + quarentena | QUAL/SEC | SIM — PASS_UNIT |
| Teto V1 sob paralelismo | TOK_PAR | SIM |
| Recall/Precision MEM-03 | MEM-03 | SIM — PASS_UNIT (harness) |
| Laya calibrado | INT-02 | SIM |

## Métricas brutas (não inventadas)

| Gate | Numerador/Denominador ou sinal | Fonte |
|------|--------------------------------|-------|
| ORCH-02 | syntactic=18 / (18+2)=**0.9** | `tests/unit/v2-orch-02-live-corpus.test.ts` + `raw/ORCH-02.txt` |
| ORCH-04 | max_in_progress 8→5; VRAM probe AVAILABLE (sysfs); crash=false | `raw/ORCH-04.txt` ORCH04_EVIDENCE_JSON |
| INT-02 | invention_count baseline=0 candidate=0; calibration_ok=true; abstention_rate=1; cases=6 | `raw/INT-02.txt` INT02_BENCH_JSON |
| TOK_PAR | min_reduction≈87.86% ≥75% sob parallel=4 (estimated chars/4) | `raw/tok-par/tok-parallel.json` |

## PREREQ_V2_EXIT

**SATISFEITO**

## M0C_EVIDENCE (machine)

```
ORCH01: STATUS=PASS_LIVE CMD=npx vitest run tests/unit/v2-orch-01-live-worktrees.test.ts EXIT=0
ORCH02: STATUS=PASS_LIVE CMD=npx vitest run tests/unit/v2-orch-02-live-corpus.test.ts EXIT=0 RATIO=0.9
ORCH04: STATUS=PASS_LIVE CMD=npx vitest run tests/unit/v2-orch-04-live-saturation.test.ts EXIT=0
INT02: STATUS=PASS_LIVE CMD=node scripts/v2-int02-probe.mjs EXIT=0
TOK_PAR: STATUS=PASS_LIVE CMD=node scripts/v2-tok-parallel.mjs EXIT=0
VITEST_V2_EXIT: 0
EVIDENCE_DIR: docs/v2/evidence/20261121T224251Z
PREREQ_V2_EXIT: SATISFEITO
```
