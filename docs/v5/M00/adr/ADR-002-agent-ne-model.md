# ADR-002 — Agent ≠ Model

**Status:** aceite (blueprint V5-M00)  
**Data:** 2026-11-22

---

## Contexto

`AgentRecord` pode carregar `provider_id` / `model_id` (`agent-registry/types.ts:67-68`). Em paralelo, `ModelProvider` (ex.: FreeLLMAPI em `model-providers/freellmapi.ts`) é uma stack de catálogo/health/completions.

Confundir os dois leva a: tratar “trocar modelo” como “trocar agente”; ou declarar Agent “pronto” só porque o LLM responde.

## Decisão

1. **Agent** = instância de execução com lifecycle (`AgentState`, heartbeats, replace, permissions, task/work binding).  
2. **Model** = capacidade de geração/estimativa via `ModelProvider`; pode ser partilhado por muitos Agents.  
3. Trocar modelo **não** implica automaticamente `REPLACED`; replace de Agent **não** exige trocar modelo.  
4. Superfícies CLI: `evolve freellm …` ≠ `evolve agents …`.

## Consequências

- Health FreeLLMAPI down ≠ falha de Work (já alinhado a notas de setup “optional backends”).  
- Budget/token ledger pode referenciar provider sem fundir identidades.  
- Agent Studio / SDK futuros (GAP) devem expor ambos os conceitos separadamente.

## Alternativas rejeitadas

- Agent = wrapper de ModelProvider.  
- Eliminar `provider_id` do AgentRecord (útil como metadado; não como identidade).
