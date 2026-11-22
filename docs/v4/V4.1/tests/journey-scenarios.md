# V4.1 — Journey scenarios (§4 passos 1–11)

**Data (UTC):** 2026-11-22T17:34Z  
**Commit base (HEAD):** `577b63cdc986eecd4c7943cf627ad1672cfeb935` (working tree com V4.1 P0–P2)  
**Máquina:** Linux 6.12.88+deb13-amd64 · Node v22.15.0  
**Spec:** `V4-Tests-and-Benchmarks.md` §4 — Testes funcionais de jornada  
**Método:** dogfood **automatizado** (vitest + CLI smoke) + inspeção de código TUI; **sem** gravação humana Ink TTY completa.

Regra: não inventar gravações humanas; marcar LIMITATION quando o passo exige TTY interativo.

---

## Ambiente

| Campo | Valor |
|---|---|
| Repo | `/home/gaab/orca/workspaces/EvolveLoop/seagrass` |
| Build | `cd orchestrator && npm run build` → exit 0 |
| Vitest v41 | 3 files / 35 tests pass (ver `automated-test-results.md`) |
| tmux | presente (`tmux 3.5a`) |
| zellij | **ausente** |

---

## Roteiro e resultados

| # | Passo §4 | Como exercitado nesta máquina | Resultado | Evidência |
|---|---|---|---|---|
| 1 | Abrir o CLI em instalação existente | `node dist/cli/evolve.js --help` exit 0; path default `evolve` → TUI/REPL documentado | **PASS** (smoke) | stdout jornada; `user-guide-everyday.md` |
| 2 | Identificar workspace e estado atual | Unit: `buildHomeResumeView` (`v41-p0-tui.test.ts`); `/status` slash | **PASS** (unit) | vitest P0 |
| 3 | Criar tarefa simples | Unit + código: entrada NL → Task; Grill budget | **PASS** (unit/code) | P0-2; LIMITATION: sem TTY NL live |
| 4 | Tarefa ambígua + perguntas | `grillInterviewBudget` / Grill só se budget>0 | **PASS** (unit/code) | P0-2; LIMITATION: sem sessão Grill live |
| 5 | Revisar plano e iniciar | `buildPlanDisplay` / `/plan` stub+card | **PASS** (unit) | `v41-p2-nav-docs.test.ts`; P0-3 |
| 6 | Acompanhar sem logs | Footer L1 Task/Session/Agents; stream técnico off default | **PASS** (unit) | `v41-p0-tui.test.ts` footer |
| 7 | Aprovação e decisão | `ApprovalFacade` + `/approvals` | **PASS** (unit) | `v41-p1-handles-approvals.test.ts` |
| 8 | Pausar, cancelar, retomar | `/pause` `/cancel` + `task-controls` + Ctrl+P labels | **PASS** (unit) | P1-2; P2-3 |
| 9 | Entrega com evidências | `deriveDeliveryStatus` — PASS só com verification | **PASS** (unit) | P0-5; `/delivery` |
| 10 | Fluxo Handles **OFF** | `EVOLVELOOP_AGENT_HANDLES=false` · attach soft-fail exit 0 | **PASS** (CLI dogfood) | `agent-handles-matrix.md` |
| 11 | Fluxo Handles **ON** | env true · attach → fallback CLI (tmux detetado sem sessão) exit 0 | **PASS** (CLI dogfood) | `agent-handles-matrix.md` |

---

## Dogfood CLI (comandos)

```bash
cd orchestrator
npm run build                                    # exit 0
node dist/cli/evolve.js --help                   # exit 0 — help curto jornada
node dist/cli/evolve.js help advanced            # exit 0 — JSON layer=advanced
node dist/cli/evolve.js agents                   # exit 0 — Handles OFF default
# registry temp + inspect/attach/logs: ver agent-handles-matrix.md
```

---

## LIMITATIONS

1. **Sem gravação/transcrição humana** da TUI Ink em TTY real nesta tarefa.  
2. Passos 3–4 (NL + Grill live) cobertos por unit/código, não por vídeo.  
3. Passo 9 Delivery com verification real de provider **não** foi corrido end-to-end com agente vivo — contrato unitário sim.  
4. Não inventar % de conclusão humana.

---

*Fim — journey-scenarios.md*
