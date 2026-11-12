# Relatório Final — Benchmark & Observability System

**Branch:** `feature/bench-obs-v1`  
**Feature id:** `bench-obs`  
**Data:** 2026-11-11  
**Preserva:** tag `v3-complete` (`6b69c3f`) — não reescrito

## Arquitetura

**Reutilizado:** EventBus, JsonlEventPersister (padrão), secret-redaction, VendorCacheUsage, V3 evaluation semantics, fixtures `v3-eval` (3 repos).

**Criado:** `orchestrator/src/telemetry/measurement-plane/` (contrato, collector, stores, adapters, metrics, trace, evaluation, benchmark runner, CLI handlers, engineering bridge).

**Live path:** `orchestrator/src/v3/evaluation/live/` — readiness probe, worker/reviewer prompts sem solvers, recovery handoff, suite A/B/C.

**Decisão:** ADR-BENCH-OBS-0001 — Measurement Plane sob `telemetry/`, dados em `{data-dir}/measurement/`, sem segundo EventBus.

## Instrumentação

- Adapter EventBus → envelope v1.0
- Hierarchy/delegation/spawn_requested vs spawned vs blocked
- Usage adapter com proveniência (PROVIDER_REPORTED / ESTIMATED / UNAVAILABLE)
- Collector modes: normal | benchmark | debug
- Bridge observe-only do Engineering Loop → measurement events

## Estratégias A/B/C

Comparáveis via Benchmark Runner + cases versionados em `benchmarks/bench-obs/`.

## Tokens e custos

- Sem provider live nesta sessão → `UNAVAILABLE` (correto)
- Proxy histórico (~25.9%) **não** é evidência de economia real (disclaimer na evidência complementar)
- Dedup + tabela `prices.v1.json`

## Live LLM

| Item | Estado |
|------|--------|
| Infraestrutura | PASS |
| Consent gate | PASS (não auto-habilita) |
| Execução live | BLOCKED (Claude não autenticado; API keys ausentes; consent unset) |
| Reviewer sessão separada | PASS (plumbing + testes) |
| Recovery handoff | PASS (plumbing + T04-like injection; sem LLM pós-handoff nesta sessão) |

## CLI

`evolve telemetry …`, `evolve benchmark …`, `evolve eval live-readiness|live-suite`

## Testes

```bash
npx vitest run tests/unit/measurement-plane tests/unit/live-llm-readiness.test.ts
```

## Evidência complementar

- `docs/benchmark/BENCHMARK_ACCEPTANCE_MATRIX.md`
- `docs/benchmark/evidence/gate.v3-benchmark-observability.json`
- Gate global complementar: `BLOCKED` enquanto Gate L live não executar

## Limitações honestas

- WIKI_ROOT pode estar unset
- TUI/dashboard adiado
- Gate L exige `EVOLVELOOP_HARNESS_CONSENT=true` + provider autenticado
- Solvers determinísticos preservados e **não** apresentados como autonomia LLM
