# ADR Q3 — Agent Handle: desenho

**Status:** aceite (V4.1 P1)  
**Data:** 2026-11-22  
**Fecha:** `docs/v4/V4.0/decisions-and-open-questions.md` §B Q3  
**Relacionado:** D3; `interaction-principles.md` §6; glossário Agent Handle

---

## Contexto

Q3 pedia escolher: (a) wrapper UX sobre `ProcessSession`/`session_id`, (b) novo id estável ligado a `AgentRecord`, (c) adiar.

Identity já fixa Handles como opcionais (default off). Falta API de produto: preferência, `inspect`/`attach`/`logs`, backends tmux/Zellij, e garantia de que fechar viewer ≠ matar Agent.

## Decisão

1. **Handle = fachada UX** sobre `AgentRecord` + Session de processo opcional (`ProcessSessionRecord` / harness sessions).
2. **Não** criar store/id persistido novo nesta fatia: o identificador de produto é `agent_id`; Session é detalhe (`session_id` / process session).
3. **Preferência** `preferences.agent_handles.enabled` no profile (default **false**); override workspace em `.evolveloop/config.yaml` (`agent_handles.enabled`).
4. Com **off:** nenhum attach/janela extra; jornada completa via TUI/CLI; `inspect` humano continua disponível.
5. Com **on:** `evolve agents attach|logs <id>` tentam backend tmux → Zellij → **fallback CLI** (inspect/logs texto). Backend ausente **não** falha a Task.
6. **Fechar viewer / detach de attach NUNCA** chama `adapters session-cancel` nem mata o Agent.

## Consequências

- Comandos sob o grupo existente `agents` (+ alias cosmético `agent` → `agents`).
- Apresentação distingue Agent state ≠ Session/terminal state; `REPLACED` = histórico/substituído.
- tmux/Zellij nunca são requisito de execução.

## Alternativas rejeitadas

- (b) Novo id estável agora (overengineering; AgentRecord já existe).
- Exigir tmux/Zellij para Tasks.
- Ligar Ctrl+D / fechar viewer → `session-cancel`.
