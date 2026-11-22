# V4.3 — Candidatos a redundância (remover / fundir / ocultar / justificar)

**Status:** inventário — **fechado em** [`redundancy-report.md`](./redundancy-report.md) (P1-7, 2026-11-22)  
**Data:** 2026-11-22  
**Alvo:** `V4.3-Consolidation.md` §2.2 (redução de complexidade)  
**Regra:** preservar interfaces avançadas necessárias a diagnóstico/automação; **não** apagar só para encolher a superfície; cada candidato tem ação proposta + risco.  
**Nota:** este ficheiro permanece como inventário histórico; decisões finais pathadas estão no relatório.

**Fontes cruzadas:** `docs/v4/V4.1/tui-command-audit.md`; `docs/v4/V4.2/command-taxonomy-current.md`; `integration-audit.md`; código `help-usage.ts`, `slash-commands.ts`, `evolve.ts`, `v35-commands.ts`, `v36-commands.ts`.

---

## 0. Legenda de ação

| Ação | Significado |
|---|---|
| **Remover** | Apagar superfície (só se zero dependência + deprecation cumprida) |
| **Fundir** | Um facade produto; outro vira alias / redirect |
| **Ocultar** | Sair de L0/L1; manter em `help advanced` / JSON |
| **Justificar** | Manter; documentar porquê (automação, lease, legado suportado) |
| **Alinhar copy** | Sem mudar API — só rótulos |

**Camadas (herança V4.2):** L0 journey help · L1 slash Ink · L2 advanced JSON · L3 legado/ops.

---

## 1. Comandos / grupos CLI

| ID | Overlap | Superfícies | Ação proposta | Risco se remover cedo | Evidência |
|---|---|---|---|---|---|
| R1 | Status | `evolve status`, `progress`, `/status`, `tui status`, `coordinator status`, `runtime status`, `service status` | **Fundir** default = Task/Session produto; **Ocultar** resto em L2; qualificar nomes | Scripts que parseiam JSON de status específicos | V4.1 P2-2 PENDENTE; `evolve.ts`; `status-board.ts` |
| R2 | Sessions | `adapters sessions` vs `harness sessions` | **Fundir** sob Handles/Session de processo; um deprecated alias | Automações harness | `v35-commands.ts`; audit V4.1 §4.1 |
| R3 | Inspect | `agents inspect` vs `harness inspect` vs `workspace inspect` | **Justificar** + sempre qualificar entidade; não unificar stores | Colisão semântica | `agents-surface.ts`; v35 |
| R4 | Logs | `agents logs` vs `service logs` | **Justificar** namespaces distintos; reforçar help | Confusão se fundir | `help-usage.ts`; V4.1 |
| R5 | Pause | Ink `/pause`+Ctrl+P · `evolve pause` · `workflow pause` · `project pause-admission` | **Alinhar copy** + **Ocultar** workflow/project; decidir se Ink pause deve **persistir** (S1) | Quebrar pause de workflow | `task-controls.ts`; `evolve.ts:518` |
| R6 | Resume | `evolve resume` · Home resume · history show · continuity apply · Ctrl+P | **Fundir** narrativa (“retomar Task” vs “handoff Agent” vs “detect session”); **não** fundir stores | Retomada errada | `evolve.ts:376-377`; `home-resume.ts`; continuity |
| R7 | Workspace | `evolve workspace` (integration) · `evolve use/switch` · `project` · `worktree` · `--workspace` | **Justificar** + manter alias `integration` (V4.2); **Ocultar** integration de L0 | Breaking rename | `workspace-product-surface.ts`; `normalizeWorkspaceIntegrationGroup` |
| R8 | Iniciar Task | NL TUI · `intent` · `goal` · `task` · `circuit` | **Ocultar** goal/task/circuit de L0; **Justificar** para automação | Jobs/circuit em CI | V4.1 P0-2 / P2-1 |
| R9 | Config | `/config` · `evolve config` · profile YAML · workspace config.yaml · credentials paths | **Justificar** fachada prefs; **não** merge ficheiros credenciais nesta fatia (V4.2 LIMITATION) | Secrets | `config-surface.ts`; `credentials-paths.ts` |
| R10 | Agents singular/plural | `agent` → `agents` normalize | **Justificar** alias | — | `normalizeAgentsGroup` |
| R11 | Help | journey vs advanced JSON denso | **Justificar** dual; opcional afilar advanced (P2) | Descoberta ops | `help-usage.ts` |

---

## 2. Telas / entrypoints interativos

| ID | Overlap | Ação proposta | Evidência |
|---|---|---|---|
| T1 | Ink TUI vs Classic REPL | **Justificar** dual (TTY vs non-TTY); **Alinhar copy** REPL → Plan/Agents (I1/I3) | `tui/index.ts:67-72`; `repl.ts` |
| T2 | `evolve tui run` (Core interactive) vs Ink | **Ocultar** de jornada; documentar “ops Core” | `v3/tui/interactive.ts`; `evolve.ts` |
| T3 | `evolve tui status` vs `/status` vs Home | **Fundir** narrativa read-only; board = L2 | `status-board.ts` |
| T4 | Delivery card Ink vs mensagem REPL pós-kick | **Alinhar** — REPL deve ecoar UNVERIFIED/VALIDATING, não “sucesso” genérico | `shell-start-execution.ts:335-342`; `delivery-status.ts` |
| T5 | ApprovalPanel TUI vs `evolve approvals` CLI vs Goal confirm | **Justificar** facade (ADR Q4); não duplicar stores | `ApprovalPanel.tsx`; `facade.ts` |
| T6 | `/clear` histórico visual | **Justificar** cosmético **ou** **Ocultar** se confundir com apagar Task | `slash-commands.ts` |

---

## 3. Estados / rótulos / métricas

| ID | Overlap | Ação proposta | Evidência |
|---|---|---|---|
| E1 | Workers (classic footer) vs Agents (Ink) | **Alinhar copy** classic → Agents | `footer.ts:180-192` vs `footer-compact.ts` |
| E2 | MSO vs Orchestrator na UI | **Alinhar copy** (V4.1 P2-4); literais runtime MSO **Justificar** | Q6; `shell-start-execution.ts` |
| E3 | Goal Contract (REPL/docs internos) vs Plan (Ink) | **Alinhar copy** superfícies utilizador; IDs internos **Justificar** | ADR Q2; `repl.ts` |
| E4 | Delivery UNVERIFIED vs MSO VALIDATING vs TRUE-FULL-PASS | **Justificar** três camadas; documentar mapa 1:1 na UI | `delivery-status.ts`; state-matrix V4.0 |
| E5 | TUI `phase` vs MSO state | **Justificar** (UI-only); nunca exibir phase como Session | `App.tsx` |
| E6 | Pause local vs estados MSO/Agent | **Fundir** comportamento (persistir) **ou** **Alinhar copy** “pausa só desta janela” | S1 `integration-audit.md` |
| E7 | `tokens_workers` field vs rótulo Agents | **Justificar** campo interno; evitar expor nome Workers em JSON produto | `App.tsx`; `ledger-aggregate.ts` |
| E8 | IDLE informal vs INIT oficial | Já mapeado → INIT / “Aguardando entrada” | **Justificar** | `banner.ts`; `status-panel.ts` |

---

## 4. Matriz de decisão rápida (Consolidation)

| Manter visível (L0/L1) | Progressivo (L2) | Candidato deprecar após alias |
|---|---|---|
| `evolve` Ink, help journey, setup, intent (ou NL), status produto, pause/resume Task, approvals, agents produto, delivery, history, config prefs, use/switch | daemon, coordinator, harness, adapters, continuity, recovery, ledger, events, circuit, workflow, sandbox, runtime, … | Nomes ambíguos sem qualifier; segundo caminho Session se facade existir; “Workers” copy |

**Proibido (§3 Consolidation):** remover interfaces avançadas **só** para reduzir superfície; iniciar nova geração por rename.

---

## 5. Já resolvido (não listar como gap novo)

| Item | Resolução | Path docs/código |
|---|---|---|
| Slash jornada ausente | DONE V4.1 | `slash-commands.ts` |
| `/config` só provider | DONE parcial V4.2 (prefs+handles) | `slash-handlers.ts`; `config-surface.ts` |
| Sem history browse | DONE V4.2 | `task-history.ts` |
| `workspace` sem nota integration | DONE alias + help | `help-usage.ts`; normalize integration |
| Delivery PASS mentiroso | DONE V4.1 | `delivery-status.ts` |

---

## 6. Critério para fechar um candidato

Um candidato R*/T*/E* só fecha com **uma** de:

1. Patch + teste que prova uma superfície canónica; **ou**
2. Nota explícita “justificado — automações / lease / LIMITATION” com path; **ou**
3. Deprecation documentada + janela de compat (Tests §6 regressão comandos públicos).

---

*MSO TASK V43-M1 — candidatos; implementação = backlog P0–P2.*
