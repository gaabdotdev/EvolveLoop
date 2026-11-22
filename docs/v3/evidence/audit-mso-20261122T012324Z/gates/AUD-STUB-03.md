# AUD-STUB-03 — Auditoria de Subsistemas Avançados (V2/V3)

**Status:** PASS  
**UTC:** 2026-11-22T01:44:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Verificar módulo a módulo se Laya/Decision Engine, Memory Consolidation Engine,
Mutation Testing, Evolution Pipeline (Shadow Replay), Skill-to-Code,
Constrained Decoding (GBNF) e Deterministic Simulation possuem implementação
funcional real ou apenas interfaces/retornos default.

Classificações: **REAL** | **STUB** | **PARCIAL** | **NÃO_HABILITADO**.

## Wiki grounding

- Scout/search: hits fora de EvolveLoop (GaabWiki memory / KernelBot).
- **GAP:** contratos AUD-STUB-03 não sintetizados na wiki; classificação baseada
  no código verificado neste repo (`orchestrator/src/v3/**`).

## Tabela por módulo

| Módulo | Classificação | Path:linha (prova) | Teste / probe |
|--------|---------------|--------------------|---------------|
| Laya / Decision Engine | **PARCIAL** | Adapter real: `laya-decision-engine.ts:86-241` (`LayaDecisionEngine` — live client / heuristic / honest `ENGINE_STUB`). Runtime: `decision-engine.ts:171-298` (`StrictRuntimeDecisionEngine`). Stub honesto V0: `decision-engine.ts:62-80` (`LayaDecisionEngineStub` → `abstain`+`ENGINE_STUB`, nunca `selected`). Host: `pluggable-host.ts:28-120`. Default deferred ainda stub: `index.ts:137-146` (`createDeferredProviderStubs`). | `v2-int-02-laya-benchmark.test.ts`, `v2-int-02-live-laya.test.ts` (`INT02_STATUS=PASS_LIVE`, invention=0), `v0-adapt-memory.test.ts` (stub fail-closed) |
| Memory Consolidation Engine | **REAL** | `memory/consolidation.ts:147-301` (`ConsolidationEngine` — extract/dedupe/create\|update\|skip, status sempre `PROPOSED`). Heurística: `:90-111`. Stub extractor **rótulo honesto** `extraction:"stub"`: `:129-135`. Runner: `:315-371`. Ollama opcional: `memory/ollama-lesson-adapter.ts:60`. | `v2-mem-01-consolidation.test.ts` (10 passed) |
| Mutation Testing (selective) | **REAL** | `evaluation/selective-mutation.ts:71-266` (`SelectiveMutator` — boolean/boundary/return_null in-memory). Battery: `:315-418` (`runMutationBattery` → `WEAK_TESTS` se survivors). Gate: `:447-494`. | `v2-qual-02-mutation.test.ts` (12 passed) |
| Evolution Pipeline + Shadow Replay | **REAL** | `evolution/pipeline.ts:307+` (`EvolutionPipeline` observe/propose/validate). Shadow Replay: `:419-472` (`shadowReplay`). Promote exige pass: `:478-501`. Rollback one-command: `:507-533` (`SHADOW_REPLAY_ROLLBACK_COMMAND`). | `v2-evol-01-evolution-pipeline.test.ts`, `v3-evol-01-shadow-replay.test.ts` |
| Skill-to-Code (crystallizer) | **REAL** | `token-economy/crystallizer.ts:76-185` (`CrystallizerRegistry` — N≥3 → crystallize → `zero_token_script` / `tokens_used:0`). Threshold: `:8`. | `v1-crystallizer.test.ts` (1 passed) |
| Constrained Decoding (GBNF) | **PARCIAL** | Request plumbing only: `constrained-decoding.ts:67-124` (`buildConstrainedLocalRequest`). **Não** há decoder live GBNF/XGrammar. Honesty fix: `enforcement: "request_plumbing_only"` (`:43-59`, `:78`). `constrained:true` = grammar *anexada*, não enforced. | `v1-constrained-decoding.test.ts` (4 passed; inclui assert `enforcement`) |
| Deterministic Simulation (DST) | **REAL** | `evaluation/deterministic-sim.ts:101-337` (`SimulationWorld` clock/fs/proc/net/locks/fencing). Battery: `:375-414` (`runScenarios`). Gate ≥10k: `:512-524` + `DST_MIN_SCENARIOS=10000` (`:26`). | `v3-test-02-dst.test.ts` (7 passed; 10k scenarios 0 deadlock / 0 split-brain) |

## Stubs ocultos / fingem sucesso

| Achado | Antes | Ação |
|--------|-------|------|
| GBNF `constrained:true` podia ser lido como decode enforced | Flag ambígua sem marcador de enforcement | **FIXED** — `enforcement: "request_plumbing_only"` sempre; teste dedicado |
| `LayaDecisionEngineStub` reason “deferred to V2” | Mensagem desatualizada (V2 já tem adapter) | **FIXED** — reason/limitations apontam para `LayaDecisionEngine`; continua `ENGINE_STUB`/`abstain` |
| Demais stubs (`StubLessonExtractor`, deferred Laya slot, offline Laya abstain) | Já honestos | Nenhuma mudança de comportamento |

**Nenhum stub remanescente retorna `selected` / PASS falso.** Stubs explícitos não foram marcados como “concluídos”.

## Testes

Arquivo: `gates/AUD-STUB-03-tests.txt`

```
Test Files  11 passed (11)
Tests       72 passed (72)
EXIT_CODE=0
```

Suites: `v2-int-02-laya-benchmark`, `v2-int-02-live-laya`, `v2-mem-01-consolidation`,
`v2-qual-02-mutation`, `v2-evol-01-evolution-pipeline`, `v3-evol-01-shadow-replay`,
`v1-crystallizer`, `v1-constrained-decoding`, `v3-test-02-dst`, `v0-adapt-memory`,
`v1-model-layers`.

## Diffstat

Ver `gates/AUD-STUB-03-diffstat.txt`.

## Veredito

- 5/7 módulos **REAL** (Consolidation, Mutation, Evolution/Shadow Replay, Skill-to-Code, DST).
- 2/7 **PARCIAL** (Laya: adapter real + slot V0 stub; GBNF: plumbing only, sem decode live).
- 0 stubs ocultos fingindo sucesso após honesty fixes.
- Critério “não marcar STUB como concluído” respeitado (Laya stub V0 e GBNF sem decoder permanecem não-concluídos).

**PASS** — auditoria completa com provas path:linha + batteries; honesty fixes aplicados.
