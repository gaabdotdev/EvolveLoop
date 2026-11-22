# V3-TEST-01 Evidence — Metamorphic & Differential Multi-Model (MSO M18)

- **ts:** 20261122T002551Z
- **task:** M18-V3-TEST-01-METAMORPHIC (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T002551Z`
- **wiki grounding:** pack EvolveLoop PACK_NOT_FOUND / search metamorphic|V3-TEST-01 sem hits úteis. Contrato = metas V3 §2.4 + plano mestre §5.4 + brief MSO M18.

## Implementação

| Peça | Path |
|------|------|
| Metamorphic harness | `orchestrator/src/v3/evaluation/metamorphic.ts` |
| Export evaluation | `orchestrator/src/v3/evaluation/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-test-01-metamorphic.test.ts` |

### Contrato mínimo fechado

- `runMetamorphicHarness({ contract, paraphrases, router|models })` — 3 paráfrases equivalentes
- Stub decomposer: normalização de tokens + sinónimos → fingerprint estrutural estável
- Stub router fingerprint-stable (paráfrase-invariante); modo `surface_biased` para oráculo de viés
- Differential multi-modelo: detecta `routing_bias_detected` quando modelo diverge por wording
- Gate: `decomposition_stable` ∧ `true_full_pass_stable` ∧ `!routing_bias` → `PASS`
- Honesty: stubs determinísticos — **PASS_UNIT** (não claim live LLM)

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-TEST-01 | `npx vitest run tests/unit/v3-test-01-metamorphic.test.ts` | **0** | `vitest-v3-test-01.txt` / `.log` / `.exit` |
| Regressão QUAL+TEST | `npx vitest run …v3-test-01… …v2-qual-01… …v2-qual-02…` | **0** | `vitest-regression-test.txt` / `.exit` (33 passed) |

## STATUS

**PASS_UNIT** (3 paráfrases; decomposição estável; TRUE-FULL-PASS estável; bias oracle OK)
