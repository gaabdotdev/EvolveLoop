# V4.1 — Agent Handles

**Status:** implementado (P1)  
**Data:** 2026-11-22  
**ADR:** [`adr/Q3-agent-handle.md`](./adr/Q3-agent-handle.md)  
**Contrato:** D3 — opcional; default **off**; jornada completa sem Handles.

---

## 1. O que é

**Agent Handle** = fachada UX sobre um `AgentRecord` (+ Session de processo opcional) para `inspect` / `attach` / `logs`, **sem** confundir visualização com ciclo de vida do Agent.

| Conceito | Significado |
|---|---|
| Agent state | `AgentState` no registry (`ACTIVE`, `REPLACED`, …) |
| Session (produto) | Contexto MSO / orquestração |
| ProcessSession | Terminal/processo do harness — detalhe sob Handles |
| Handle lifecycle | `active` \| `replaced` (histórico) \| `terminal` |

**Agent state ≠ Session/terminal state** — o `inspect` humano diz isto explicitamente.

---

## 2. Preferência (default OFF)

| Fonte | Como |
|---|---|
| Default | `false` |
| Profile | `preferences.agent_handles.enabled` em `profiles/default.yaml` |
| Workspace | `.evolveloop/config.yaml` → `agent_handles.enabled` |
| Env | `EVOLVELOOP_AGENT_HANDLES=true\|false` (vence) |

Com **OFF:**

- Nenhuma janela/sessão auxiliar automática.
- `evolve agents` / `inspect` funcionam (texto humano).
- `attach` responde soft-fail (não quebra a Task).
- Jornada TUI completa.

---

## 3. Comandos

```bash
evolve agents                 # lista no contexto ativo (work_id / workspace)
evolve agents inspect <id>    # Agent state ≠ Session
evolve agents attach <id>     # só útil com Handles ON
evolve agents logs <id>       # ≠ evolve service logs (daemon)

# Alias cosmético (mesma implementação):
evolve agent inspect <id>
```

Flags úteis: `--workspace`, `--work-id`, `--data-dir` (default: `<workspace>/.evolveloop/v3`), `--format json`.

Legado (`register`, `heartbeat`, `reconcile`, `adopt`) permanece no mesmo grupo.

---

## 4. Backends de attach

Ordem:

1. **tmux** (se `which tmux`)
2. **Zellij** (se `which zellij`)
3. **CLI fallback** — imprime inspect + logs; Task/Agent **não** falham

Backend ausente **nunca** é requisito para executar Tasks.

---

## 5. Fechar viewer ≠ kill

Contrato testado:

- `closeViewer()` / `closeAgentViewer(id)` → `killed_agent: false`, `session_cancelled: false`
- **Proibido** mapear fechar attach / Ctrl+D detach → `adapters session-cancel` ou kill do Agent
- Ctrl+D na TUI = detach de navegação (sair da UI), não destruição do Agent

---

## 6. Agent substituído (continuity)

Quando `AgentState === REPLACED` ou `replaced_by` está preenchido:

- Handle = **histórico / substituído**
- O Agent ativo (sucessor) aponta a Session atual
- `inspect` / `logs` rotulam o Handle como substituído

Isto é **apresentação** sobre continuity/`REPLACED` — não reescreve o motor.

---

## 7. Módulos

| Path | Papel |
|---|---|
| `orchestrator/src/v3/agent-handles/` | preferência, inspect, attach, logs, presentation |
| `orchestrator/src/cli/agents-surface.ts` | CLI produto |
| `profiles/default.yaml` | default off |

Testes: `orchestrator/tests/unit/v41-p1-handles-approvals.test.ts`.

---

*Fim — agent-handles.md*
