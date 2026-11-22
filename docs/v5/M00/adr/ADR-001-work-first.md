# ADR-001 — Work-first (Work persistente; Agent substituível)

**Status:** aceite (blueprint V5-M00; **não** implementado)  
**Data:** 2026-11-22  
**Tese:** *Agents replaceable / Work persistent*

---

## Contexto

V4.1 ADR Q2 fixou **Task (produto)** como fachada sobre Goal Contract, com `work_id` interno. Continuity já prova que Agent pode ser `REPLACED` sem terminalizar a Task (`continuity/types.ts`; `AgentState.REPLACED`).

A tese V5 inverte a âncora de persistência de produto: o que deve sobreviver a UI, processo e Agent é o **Work**.

## Decisão

1. A **unidade durável** do domínio V5 é **Work**.  
2. **Agent** é executor substituível ligado a Work/Task; morte/replace do Agent ≠ cancelamento do Work.  
3. **Task** permanece útil (grafo + UX V4); passa a ser interpretada como filho conceptual de Work.  
4. Persistent Work Runtime é o serviço-alvo que materializa esta decisão — **GAP** até Meta 01+; **proibido** em M00.

## Consequências

- History / resume / delivery devem poder âncorar em Work mesmo sem Agent ACTIVE.  
- ADR Q2 **não** é apagado: é **estendido** (Task UX + Work âncora). Supersede UX exige Meta dedicado.  
- Implementações que tratem AgentRegistry como raiz de verdade estão desalinhadas.

## Alternativas rejeitadas

- Manter Task-only como âncora permanente (insuficiente para “Work persistent”).  
- Reescrever stores agora (proibido / overengineering).  
- Equivaler Work a Goal Contract id (contratos versionam aceitação; Work coordena ciclo de vida).
