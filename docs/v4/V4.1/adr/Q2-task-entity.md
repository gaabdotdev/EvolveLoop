# ADR Q2 — Task de produto = qual entidade de runtime?

**Status:** aceite (V4.1 P0 — fachada UX)  
**Data:** 2026-11-22  
**Fecha:** `docs/v4/V4.0/decisions-and-open-questions.md` §B Q2  
**Relacionado:** D2; glossário Task/Plan

---

## Contexto

O painel legado rotula `work_id` como “Tarefa”. Intent/Goal Contract/Work/TaskGraph competem. Q2 pedia escolher: (a) Goal Contract id, (b) Work, (c) nó TaskGraph, (d) fachada nova.

Fluxo TUI quotidiano: NL → Grill (opcional) → Goal Contract → confirm MSO → Session.

## Decisão

1. **Task (produto)** é uma **fachada de UX** sobre o Goal Contract ativo (+ Session MSO associada quando existir).
2. **IDs de runtime não mudam** nesta fatia: `goal_contract_id`, `work_id`, `session_id` permanecem internos.
3. Na UI default:
   - **Task** = título curto do objetivo / contrato (nunca só `work_id`).
   - **Plan** = cartão de revisão do contrato (ex-Goal Contract Review).
   - **Session** = fases MSO traduzidas.
   - **Agents** = executores (ex-Workers no HUD).
4. CLI legada `task` / `goal` / `circuit` **não** é apagada (P2/complexidade progressiva).

## Consequências

- Home de retomada lista Tasks a partir de contratos/sessões detectados, com CTA iniciar/retomar.
- Placeholder e erros usam “Task”; Grill-Me só quando o budget de entrevista > 0.
- Migração de stores / IDs estáveis fica para V4.2+ se necessário.

## Alternativas rejeitadas

- (b) Rotular Work/`work_id` como Task (já confundiu o painel).
- (c) Expor TaskGraph como unidade default (demasiado interno).
- Criar nova entidade persistida agora (overengineering para P0).
