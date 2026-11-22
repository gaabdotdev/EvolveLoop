# V4.2 — Taxonomia de comandos (estado atual)

**Status:** inventário pós-V4.1 (P2-1 journey help)  
**Data:** 2026-11-22  
**Fontes de código:** `help-usage.ts`, `evolve.ts`, `v35-commands.ts`, `v36-commands.ts`, `slash-commands.ts`, `agents-surface.ts`  
**Prévia:** `docs/v4/V4.1/tui-command-audit.md` (não duplicar motor — atualizar classificação operacional)

---

## 1. Camadas de descoberta

| Camada | Entrada | Formato | Path |
|---|---|---|---|
| **L0 Jornada** | `evolve` / `evolve help` / `evolve --help` | Texto curto PT | `formatJourneyHelp` `help-usage.ts:9-30`; `usage("journey")` `evolve.ts:146-153` |
| **L1 Slash TUI** | `/` no Ink | Menu + hints | `slash-commands.ts:18-33` |
| **L2 Advanced** | `evolve help advanced` | JSON de grupos | `formatAdvancedHelp` `help-usage.ts:34-121` |
| **L3 Legado / ops** | grupos V3.5/V3.6 + engine | JSON / side-effects | `v35`/`v36` + handlers em `evolve.ts` |

---

## 2. Jornada cotidiana (L0) — mapa por tarefa do utilizador

Alinhado a V4.2 §2.3 “organizar por tarefa”.

| Tarefa do utilizador | Comando / atalho atual | Adequação V4.2 | Notas |
|---|---|---|---|
| Abrir | `evolve` (Ink ou REPL) | OK | `evolve.ts:172-193` |
| Onboarding / readiness | `evolve setup` | Parcial | Não cobre preferências produto (Handles) |
| Ver workspace ativo | Home + footer path; `evolve use active` | OK (P1) | Troca: `evolve use` / `--workspace` |
| Iniciar Task | NL TUI / `evolve intent --text` | OK (V4.1) | |
| Ver Plan | `/plan` | OK | |
| Acompanhar | footer L1; `/status` | Parcial | Proveniência compacta fraca |
| Aprovar | `/approvals`; `evolve approvals *` | OK | |
| Pausar / cancelar / retomar | `/pause` `/cancel`; Ctrl+P; `evolve pause\|resume` | Parcial | `resume` ≠ lista histórica |
| Entrega | `/delivery` | OK | |
| Agents / Handles | `/agents`; `evolve agents …` | OK | Preferência OFF default |
| Provider / API key | `/config` | Parcial | Nome “config” demasiado largo |
| Histórico de Tasks | `evolve history` / `/history` | OK (P0/P1) | show com evidências |
| Preferências produto | `evolve config` / `/config handles` | OK (P0) | |
| Trocar workspace/projeto | `evolve use` / `--workspace` | OK (P1) | `workspace` CLI = integration |
| Ajuda avançada | `evolve help advanced` | OK como escape | JSON denso |

---

## 3. Slash commands (Ink)

Fonte: `slash-commands.ts:18-33`.

| Slash | Hint | Tarefa | Conflito / gap |
|---|---|---|---|
| `/plan` | Mostrar Plan da Task | Plano | — |
| `/approvals` | Fila Approval | Intervir | — |
| `/agents` | Agents no contexto | Supervisão | — |
| `/pause` | Pausar Task | Intervir | ≠ `workflow pause` |
| `/cancel` | Cancelar Task | Intervir | Destrutivo — OK explícito |
| `/delivery` | Cartão Delivery | Entrega | — |
| `/status` | Task · Session · Plan · tokens | Acompanhar | Tokens sem provenance no compact |
| `/diff` | git diff --stat | Evidência local | — |
| `/config` | Provider / API key | Setup parcial | **Nome** sugere preferências gerais |
| `/clear` | Limpar histórico visual | Cosmético | Não apaga Tasks |

**Ausentes (relevantes V4.2):** `/prefs`, `/workspace`, `/history`, `/handles`.

---

## 4. Grupos CLI — classificação operacional

### 4.1 Camada jornada / quotidiano

| Grupo | Subcomandos (usage) | Classificação |
|---|---|---|
| *(default)* shell/Ink | — | Jornada |
| `setup` | first-run | Onboarding |
| `intent` | texto → Goal Contract | Iniciar |
| `status` / `pause` / `resume` / `progress` | trivial | Acompanhar / intervir (parcial) |
| `approvals` | list, inspect, approve, reject | Intervir |
| `agents` / `agent` | list, inspect, attach, logs (+ legado) | Supervisão |
| `help` | journey \| advanced | Descoberta |

### 4.2 Camada “projeto / workspace” (ambígua — prioridade V4.2)

| Grupo | Significado real | Risco |
|---|---|---|
| `workspace` | Integration + worktrees (`list/inspect/diff/integrate/rollback`) | Utilizador pensa “meu projeto ativo” |
| `project` | Registry ops (add/list/inspect/doctor/archive/…) | Terceiro conceito |
| `worktree` | create/list/remove | Quarto eixo de path |
| `--workspace` flag | Resolve cwd de estado | Correto mas pouco ensinado |

### 4.3 Camada continuidade / histórico (não confundir)

| Grupo | Significado | Não é |
|---|---|---|
| `continuity` | Handoff de Agent | Histórico de Tasks do utilizador |
| `recovery` | Plan/apply recovery | Browse de falhas amigável |
| `events` | Coordination event log | Timeline produto |
| `ledger` | Work ledger / token | Dashboard métricas (proibido reintroduzir) |
| `goal` / `goal-db` | Contratos persistidos | UI de histórico |

### 4.4 Camada avançada / operacional (progressiva)

Mantida em `formatAdvancedHelp` — exemplos: `daemon`, `coordinator`, `service`, `adapters`, `harness`, `runtime`, `sandbox`, `circuit`, `grill`, `exec`, `hierarchy`, `models`, `context`, `route`, `budget`, `limits`, `embeddings`, `lock`, `parallel`, `battery`, `engineering`, `eval`, `freellm`, `scheduler`, `resources`, `operations`, `tui`, …

**Regra V4.2:** não promover estes para L0; documentar ou alias só se tarefa do utilizador o exigir.

---

## 5. Overlaps e conflitos (não multiplicar)

| Overlap | Comandos | Recomendação V4.2 |
|---|---|---|
| Sessions | `adapters sessions` vs `harness sessions` | Um facade; outro deprecated (herdado V4.1) |
| Inspect | `agents` vs `harness` vs `workspace` | Qualificar entidade sempre |
| Logs | `agents logs` vs `service logs` | Já documentado V4.1 — reforçar em help journey se necessário |
| Pause | Task UI vs `workflow pause` vs daemon | Manter distinção V4.1 P1-2 |
| Config | `/config` provider vs profile YAML vs workspace config.yaml vs credentials paths | **Unificar fachada** “preferências” (P0 backlog) |
| Resume | `evolve resume` trivial vs Home resume vs continuity apply | Renomear/documentar papéis |

---

## 6. Compatibilidade e breaking changes

| Item | Estado | Ação V4.2 |
|---|---|---|
| Grupos legados no advanced help | Presentes | Manter; não apagar sem deprecation note |
| `normalizeAgentsGroup` / alias `agent` | Presente | Manter |
| Renomear `workspace` CLI | Breaking se feito cedo | Preferir **fachada** `evolve projects` / copy Home; deprecar rótulo depois |
| Journey help version string advanced ainda `0.1.0-v0-cli` | `help-usage.ts:103` | Cosmético P2 |

---

## 7. Matriz descoberta vs critério §5

| Critério | Evidência atual |
|---|---|
| Atalhos críticos documentados | `formatJourneyHelp` + guias V4.1 |
| Sem conflito | Conflitos semânticos residual (workspace/project/config) |
| Ajuda contextual + exemplos mínimos | Journey texto OK; advanced JSON sem exemplos de tarefa |
| Compatibilidade documentada | Parcial (notes em advanced); falta changelog de incompat |

---

*V42-M1 — taxonomia; implementação em backlog.*
