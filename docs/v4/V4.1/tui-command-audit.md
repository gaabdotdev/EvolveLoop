# V4.1 — Auditoria TUI / comandos

**Status:** inventário acionável (pré-redesign)  
**Data:** 2026-11-22  
**Regra:** não inventar comportamento — citar path:linha. Não criar comandos duplicados se já houver equivalente (`V4.1-Experience.md` §4).

---

## 1. Entrypoints TUI / shell

| Superfície | Papel | Path | Como entra |
|---|---|---|---|
| **CLI bin** | Wrapper | `bin/evolve:1-21` | `evolve …` → `orchestrator/dist/cli/evolve.js` |
| **Router CLI** | Grupos/subcomandos | `orchestrator/src/cli/evolve.ts` (`main` ~224+, `usage` 134-209) | args / default shell |
| **Ink TUI** | Jornada interativa TTY | `orchestrator/src/cli/tui/index.ts:67-95` → `App.tsx` | `evolve` sem args se `shouldUseInkTui()` |
| **Shell REPL** | Fallback conversacional | `orchestrator/src/v3/evolve-shell/repl.ts` | non-TTY / `EVOLVELOOP_FORCE_CLASSIC_REPL=1` / `FORCE_INK=0` |
| **Status board** | Snapshot read-only | `orchestrator/src/v3/tui/status-board.ts:48+` | `evolve tui status` (`evolve.ts:1165-1174`) |
| **Interactive Core TUI** | Loop readline operacional | `orchestrator/src/v3/tui/interactive.ts:1-50` | `evolve tui run` (`evolve.ts:1176-1181`) |
| **Keybindings shell** | Pause/interrupt/detach | `orchestrator/src/v3/evolve-shell/keybindings.ts:8-40` | raw-mode no REPL |
| **Keybindings Ink** | Ctrl+P/C/D | `orchestrator/src/cli/tui/App.tsx:184-199` | `useInput` |

**Nota:** existem **duas** “TUIs” nomeadas — Ink (`cli/tui/`) vs Core interactive (`v3/tui/interactive.ts`). A jornada-alvo V4.1 centra-se na Ink + shell; `tui run` é camada operacional/avançada.

---

## 2. Slash commands (Ink apenas)

Fonte: `cli/tui/slash-commands.ts:5-16`; handlers `slash-handlers.ts`.

| Slash | Hint atual | Equivalente CLI / gap |
|---|---|---|
| `/config` | Provider / API key | setup / provider; muda fase `provider` (`App.tsx:210-212`) |
| `/diff` | git diff --stat | Delivery diff; sem `evolve diff` de produto |
| `/status` | Sessão · contrato · tokens | `evolve status` / `progress` / `tui status` — **rótulos MSO**, não Task de produto |
| `/clear` | Limpar histórico visual | cosmético (inventário §5 #8) |

**Ausentes no slash (alvo jornada):** `/plan`, `/approvals`, `/agents`, `/pause`, `/cancel`, `/delivery`.

---

## 3. Grupos `evolve` públicos (`usage()`)

Fonte canónica: `evolve.ts:134-195` + `V35_USAGE_GROUPS` (`v35-commands.ts:391-398`) + `V36_USAGE_GROUPS` (`v36-commands.ts:25-39`).

### 3.1 Camada jornada (devem ser descobertos primeiro)

| Grupo | Subcomandos (usage) | Notas de jornada |
|---|---|---|
| *(default)* | shell / Ink | Abrir |
| `setup` | first-run | Onboarding (V4.2 overlap) |
| `intent` | texto → Goal Contract | Iniciar (NL) |
| `status` / `pause` / `resume` / `progress` | trivial zero-token | Acompanhar / intervir (parcial) |
| `goal` | create, show, evaluate, criterion | Plan/Task legado |
| `task` | add, approve-plan, show | Task Graph |
| `approvals` | list, inspect, approve, reject | Intervir (CLI only) |
| `agents` | register, heartbeat, list, reconcile, adopt, **inspect** | Supervisão JSON |
| `tui` | status, run | Board / interactive Core |

### 3.2 Camada avançada / operacional (progressiva)

| Grupo | Evidência usage | Relação com Handles / sessão |
|---|---|---|
| `daemon` | start, status, ping | detach ≠ kill runs (`evolve.ts:200`) |
| `coordinator` | start, stop, tick, status | Orchestrator interno |
| `service` | install… **logs**, foreground | logs de **daemon systemd**, não Agent |
| `adapters` | … **sessions**, **session-cancel** | ProcessSession |
| `harness` | list, inspect, **sessions**, matrix | overlap com adapters |
| `continuity` | handoff, apply, show | substituição Agent |
| `cancel` | apply | cancelamento de fatia |
| `workflow` (V3.6) | pause, resume, … | outro eixo de pause |
| `circuit`, `grill`, `exec`, `work`, `hierarchy`, `ledger`, `events`, `models`, `context`, `route`, `budget`, `limits`, `embeddings`, `lock`, `recovery`, `worktree`, `parallel`, `battery`, `engineering`, `eval`, `freellm`, `project`, `scheduler`, `resources`, `operations`, `runtime`, `sandbox`, `workspace` | usage | Fora do modelo mental default de 9 conceitos |

---

## 4. Equivalentes a `agents` / `inspect` / `attach` / `logs`

Alvo conceptual (`V4.1-Experience.md` §4):

```bash
evolve agents
evolve agent inspect <id>
evolve agent attach <id>
evolve agent logs <id>
```

| Alvo | Equivalente atual | Path:linha | Adequado? | Ação V4.1 |
|---|---|---|---|---|
| `evolve agents` | `evolve agents list --work-id …` | `evolve.ts:842-852` | Parcial — exige `--work-id`; JSON | Alias UX `evolve agents` → list no contexto do workspace/Task ativo |
| `evolve agent inspect <id>` | `evolve agents inspect --id … --run/--work-id …` | `v35-commands.ts:371-384`; gate early `evolve.ts:380-381` | Sim (JSON) — **não** distingue estado Agent vs terminal | Manter; camada humana + campos Session/Handle |
| `evolve agent attach <id>` | **Nenhum** comando de produto | Closest: Ctrl+D daemon detach (`keybindings.ts:36-40`); `attachIdentity` processo (`process-sessions.ts`); observer `attachEvolveLoopObserver` (não UX) | **GAP** | Novo **só se** Handles on; senão documentar fallback inspect/logs na CLI |
| `evolve agent logs <id>` | **Nenhum** log por agent_id | `evolve service logs` = notes/heartbeat daemon (`v35-commands.ts:145-153`); activity window TUI = linhas live, não histórico por agent | **GAP** / parcial | Preferir reusar stream/activity + ficheiros de sessão harness antes de novo verbo; evitar colidir com `service logs` |
| listar sessões de processo | `evolve adapters sessions --work-id` / `harness sessions --run` | `evolve.ts:1145-1152`; `v35-commands.ts:221-228` | Sim (ProcessSession) | Expor sob Handles como detalhe Session, não como “Agent” |
| cancelar sessão processo | `adapters session-cancel` | `evolve.ts:1154-1161` | Destrutivo — ≠ fechar viewer | Nunca mapear “fechar attach” → session-cancel |

### 4.1 Duplicatas / overlaps a não multiplicar

| Overlap | Comandos | Risco | Recomendação |
|---|---|---|---|
| Sessions list | `adapters sessions` **e** `harness sessions` | Dois caminhos para ProcessSession | Um facade produto; outro alias deprecated |
| Inspect | `agents inspect` vs `harness inspect` (adapter) vs `workspace inspect` | Mesmo verbo, entidades diferentes | Qualificar sempre: Agent / Adapter / Workspace |
| Pause | CLI `pause`/`resume` vs Ctrl+P TUI vs `workflow pause` vs `project pause-admission` | Usuário não sabe o que pausou | Um pause de **Task/jornada** na UX; resto avançado |
| Status | `status`, `progress`, `/status`, `tui status`, `coordinator status`, `runtime status`, `service status` | Ruído | Default = estado Task/Session; resto sob demanda |
| Logs | `service logs` vs activity TUI vs ledger/events | Nome “logs” ambíguo | `agent logs` ≠ `service logs` — namespaces distintos |
| TUI entry | `evolve` Ink vs `evolve tui run` | Duas interatividades | Documentar: Ink = jornada; `tui run` = ops Core |

**Regra:** não adicionar `evolve agent …` **e** `evolve agents …` com semânticas diferentes sem alias único; preferir o grupo já existente `agents` + subcomandos `inspect|attach|logs` (singular no planning é cosmético).

---

## 5. Inventário de componentes Ink (jornada)

| Componente / módulo | Path | Etapa jornada |
|---|---|---|
| `EvolveInkApp` | `cli/tui/App.tsx` | todas (phases) |
| `ProviderSetup` | `ProviderSetup.tsx` | abrir |
| `MultilineInput` | `MultilineInput.tsx` | iniciar |
| `GrillQuestionSelect` | `GrillQuestionSelect.tsx` | iniciar |
| `GoalContractReview` | `GoalContractReview.tsx` | plano |
| `ExecutionLive` | `ExecutionLive.tsx` | acompanhar |
| `DeliveryCard` / `delivery-card-view` | `DeliveryCard.tsx`, `delivery-card-view.ts` | entrega |
| `FooterBar` / `footer-compact` | `FooterBar.tsx`, `footer-compact.ts` | acompanhar |
| `activity-window` | `activity-window.ts` | acompanhar |
| `slash-*` | `slash-commands.ts`, `slash-handlers.ts` | sob demanda |
| Shell start | `v3/evolve-shell/shell-start-execution.ts` | executar |
| Banner / status-panel (shell) | `banner.ts`, `status-panel.ts` | abrir/acompanhar |

Phases locais TUI (`App.tsx:60-64`): `provider` → `ready` → `grill_q` → `review` → `busy` → `delivery` — **≠** estados MSO (`state-matrix.md` §3.3).

---

## 6. Preferência Agent Handles

| Item | Estado |
|---|---|
| Flag profile / CLI | **GAP** — não encontrada no inventário V4.0 nem nesta auditoria |
| Backend tmux/Zellij | **GAP** — sem integração Handle |
| Default off | Contrato D3 / V4.1 §4 — a implementar |

---

## 7. Checklist rápido para implementação

- [ ] Inventário usage() classificado: default / progressivo / legado
- [ ] Decidir nomes finais: `agents inspect` vs `agent inspect` (alias)
- [ ] Não reutilizar `service logs` como Agent logs
- [ ] Não ligar “fechar terminal” a `session-cancel`
- [ ] Unificar apresentação Approval (store + Goal review + consent)
- [ ] Renomear Workers → Agents no footer/delivery (`footer-compact.ts:80`; `delivery-card-view.ts:38`)

---

*Fim — TUI/command audit (V41-M1).*
