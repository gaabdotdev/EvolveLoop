# EvolveLoop V4.1 — Referência avançada

**Público:** operadores, scripts, diagnóstico, camada progressiva  
**Cotidiano:** [`user-guide-everyday.md`](./user-guide-everyday.md)  
**Data:** 2026-11-22

---

## 1. Help avançado

```bash
evolve help advanced
```

Imprime o mapa JSON de **grupos** (shell, circuit, adapters, harness, budget, …). Não é a superfície da jornada diária.

### Dual TUI (V4.3)

| Entrypoint | Papel |
|---|---|
| `evolve` (Ink / REPL) | Jornada default |
| `evolve tui status` | Ops Core StatusBoard (coordinator/works) |
| `evolve tui run` | Ops Core interactive — **não** promover a L0 |

### Status / sessions (nomes qualificados)

| Comando | Eixo |
|---|---|
| `evolve status` / `/status` | Task/Session produto |
| `evolve progress` | TaskGraph companion |
| `coordinator\|runtime\|service status` | L2 ops |
| `adapters sessions` | L2 process sessions (driver) |
| `harness sessions` | L2 harness (≠ adapters; ≠ Session produto) |
| `agents attach` | Session de processo sob Handles (opcional) |

---

## 2. Agent Handles

Preferência (default **false**):

| Fonte | Chave |
|---|---|
| Profile | `preferences.agent_handles.enabled` |
| Workspace | `.evolveloop/config.yaml` → `agent_handles.enabled` |
| Env | `EVOLVELOOP_AGENT_HANDLES=true\|false` (vence) |

```bash
evolve agents                  # lista humana
evolve agents inspect <id>     # Agent state ≠ Session
evolve agents attach <id>      # tmux → Zellij → fallback CLI
evolve agents logs <id>        # ≠ evolve service logs
evolve agent inspect <id>      # alias cosmético
```

Contratos:

- Backend ausente **não** bloqueia Tasks.
- Fechar viewer ≠ kill Agent (`closeViewer` / Ctrl+D).
- Agent `REPLACED` → Handle histórico; sucessor aponta sessão atual.

Detalhe: [`agent-handles.md`](./agent-handles.md) · ADR [`adr/Q3-agent-handle.md`](./adr/Q3-agent-handle.md).

---

## 3. Approvals (CLI + fachada)

```bash
evolve approvals list
evolve approvals approve --id <id>
evolve approvals reject --id <id>
```

TUI: painel Approval + `/approvals`. ADR: [`adr/Q4-approval-facade.md`](./adr/Q4-approval-facade.md).

---

## 4. Pause / cancel — três camadas

| Camada | Superfície | Nota |
|---|---|---|
| Task / jornada (default UX) | Ctrl+P, `/pause`, `/cancel`, `pausar` | O que o usuário cotidiano usa |
| Session trivial | `evolve pause` / `evolve resume` | Zero-token SQLite |
| Workflow avançado | `evolve workflow pause\|resume` (V3.6) | Camada ops — não confundir com Pause Task |

Detach (`Ctrl+D`) = navegação; **não** `session-cancel`.

---

## 5. Slash TUI (completo)

| Slash | Função |
|---|---|
| `/plan` | Plan ativo ou stub honesto |
| `/approvals` | Fila Approval |
| `/agents` | Lista / ponte CLI |
| `/pause` | Pause Task |
| `/cancel` | Cancel Task (destrutivo, confirma) |
| `/delivery` | Cartão Delivery |
| `/status` | Task · Session · Plan · tokens |
| `/diff` | `git diff --stat` |
| `/config` | Provider / API key (0600) |
| `/clear` | Limpar histórico visual |

---

## 6. Grupos legados (amostra)

Úteis em scripts; **não** obrigatórios no ciclo cotidiano:

- `intent`, `goal`, `task`, `circuit`, `grill`
- `work`, `hierarchy`, `continuity`, `exec`
- `coordinator`, `adapters`, `harness`
- `service`, `runtime`, `sandbox`, `workspace` (V3.5)
- `workflow`, ops V3.6
- `models`, `context`, `route`, `budget`, `embeddings`, `lock`, `recovery`, `worktree`, `parallel`, `battery`, `engineering`, `eval`

Lista canónica: `evolve help advanced`.

---

## 7. Delivery / evidência

- `PASS` na UI só com verificação (comando + exit 0).
- `TRUE-FULL-PASS` de runtime **sem** verification anexada → **UNVERIFIED** na Delivery.
- ADR: [`adr/Q1-success-copy.md`](./adr/Q1-success-copy.md).

---

## 8. Keybindings

Ver também `docs/v0/CLI-KEYBINDINGS.md` e footer TUI:

`Ctrl+P Pause Task · Ctrl+C Stop (destrutivo) · Ctrl+D Detach (≠ kill)`

---

*Fim — user-guide-advanced (P2-6).*
