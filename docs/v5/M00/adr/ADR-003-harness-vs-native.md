# ADR-003 — Harness mode vs Native mode

**Status:** aceite (blueprint V5-M00)  
**Data:** 2026-11-22

---

## Contexto

O Core já distingue execução via harness CLI (`cli_process`, dry-run/consent) de execução nativa (`execution-runner`, sandbox, engine). A UI e docs podem colapsar ambos em “correr o agente”, o que forja capacidade.

Evidência: `harness/runtime.ts:1-4`, `execution_path` (`:60-71`); `cli-process.ts` dry-run default.

## Decisão

1. Existem **dois modos** de primeira classe: **harness mode** e **native mode** (ver `integration-strategy.md`).  
2. Cada operação declara o modo; relatórios não misturam “dry_run” com “real_eligible”.  
3. Consentimento harness (`EVOLVELOOP_HARNESS_CONSENT`) **não** autoriza native capability bypass, e vice-versa.  
4. Capability matrix por adapter permanece a fonte de honesty para harness.

## Consequências

- Testes e gates devem fixar o modo sob teste.  
- Replace/cross-provider no harness pode permanecer `unsupported` sem bloquear native.  
- Persistent Work Runtime (futuro) regista Attempts com `execution_mode`.

## Alternativas rejeitadas

- Um único “execution mode” opaco.  
- Tratar jobs_pickup Cursor como native mediado completo.
