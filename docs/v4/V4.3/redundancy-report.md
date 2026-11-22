# V4.3 — Relatório de redundâncias (P1-7)

**Status:** fecha inventário `redundancy-candidates.md`  
**Data:** 2026-11-22  
**Ações:** Remover | Fundir | Ocultar | Justificar | Alinhar copy  
**Evidência código:** `help-usage.ts`, `product-copy.ts`, footer/REPL/shell, P0 pause/delivery.

---

## 1. Comandos / grupos (R*)

| ID | Decisão | Como fechou | Path |
|---|---|---|---|
| **R1** Status | **Fundir** + **Ocultar** L2 | Default = `evolve status` / `/status` Task/Session; glossary qualifica `tui`/`coordinator`/`runtime`/`service` status | `help-usage.ts`; `trivial-bypass.ts` |
| **R2** Sessions | **Justificar** + qualificar | `adapters sessions` ≠ `harness sessions` ≠ Session produto; Handles = attach | glossary advanced; deferred D4 |
| **R3** Inspect | **Justificar** | Entidades distintas; nomes qualificados no help agents/harness/workspace | agents-surface; v35 |
| **R4** Logs | **Justificar** | `agents logs` ≠ `service logs` — namespaces no help | help-usage; V4.1 |
| **R5** Pause | **Alinhar** + **Fundir** eixo | Journey pause persistido StateDb (P0-1); workflow/project ≠ journey (help) | `journey-pause.ts`; trivial-bypass |
| **R6** Resume | **Fundir** narrativa | `evolve resume` + TUI + Home no eixo Task; continuity = handoff Agent (não fundir stores) | evolve resume; home-resume |
| **R7** Workspace | **Justificar** + **Ocultar** L0 | Alias `integration`; product = cwd/use | help; workspace-product-surface |
| **R8** Iniciar Task | **Ocultar** + **Justificar** | L0 = NL/intent; goal/task/circuit em advanced | help journey |
| **R9** Config | **Justificar** | Facade prefs; credenciais duas casas LIMITATION | config-surface; P2-5 |
| **R10** agent/agents | **Justificar** | Alias `normalizeAgentsGroup` | agents-surface |
| **R11** Help dual | **Justificar** | Journey vs advanced JSON | help-usage |

**Remover:** nenhum R* apagado (proibido Consolidation §3).

---

## 2. Telas (T*)

| ID | Decisão | Como fechou | Path |
|---|---|---|---|
| **T1** Ink vs REPL | **Justificar** + **Alinhar copy** | Dual TTY/non-TTY; REPL → Plan/Agents | footer.ts; repl.ts |
| **T2** `tui run` vs Ink | **Ocultar** jornada | Help: Ink default; tui = ops | help-usage; quickstart |
| **T3** `tui status` vs `/status` | **Fundir** narrativa | Board = L2 ops; produto = Task/Session | glossary; status-board |
| **T4** Delivery REPL | **Alinhar** | Shell kickoff não declara PASS; Session validando | shell-start-execution; delivery-status |
| **T5** Approvals | **Justificar** | Facade ADR Q4 | ApprovalPanel; facade.ts |
| **T6** `/clear` | **Justificar** | Cosmético histórico visual ≠ apagar Task | slash-commands |

---

## 3. Estados / rótulos (E*)

| ID | Decisão | Como fechou | Path |
|---|---|---|---|
| **E1** Workers vs Agents | **Alinhar copy** | Classic footer → Agents | footer.ts |
| **E2** MSO vs Orchestrator | **Alinhar copy** | HUD/slash/banner → Orchestrator; MSO L5 | product-copy; identity-copy-map |
| **E3** Goal Contract vs Plan | **Alinhar copy** | REPL/card → Plan; IDs intactos | repl.ts; goal-display |
| **E4** Delivery / VALIDATING / TRUE-FULL-PASS | **Justificar** + mapa | Três camadas documentadas; UI sem literal TRUE-FULL-PASS default | identity-copy-map; delivery-status |
| **E5** TUI phase vs MSO | **Justificar** | phase UI-only; Session = store | App.tsx (herdado) |
| **E6** Pause local | **Fundir** | Persistido P0-1 | journey-pause |
| **E7** tokens_workers | **Justificar** | Campo interno; UI Agents | ledger-aggregate; footer |
| **E8** IDLE vs INIT | **Justificar** | Já mapeado “Aguardando entrada” | banner; status-panel |

---

## 4. Resumo

| Acção | Contagem |
|---|---|
| Remover | 0 |
| Fundir | R1, R5 (eixo), R6 (narrativa), T3, E6 |
| Ocultar | R1 L2, R7 L0, R8 L0, T2 |
| Justificar | R2–R4, R7, R9–R11, T1, T5–T6, E4–E5, E7–E8 |
| Alinhar copy | T1, T4, E1–E3 |

Candidatos abertos só como **LIMITATION / adiados:** D4 fundir stores sessions; D1 credenciais; remoção L3.

---

*MSO TASK V43-M3 — P1-7 · supersede operacional de `redundancy-candidates.md`*
