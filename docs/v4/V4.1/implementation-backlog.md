# V4.1 — Backlog de implementação (pós-mapa)

**Status:** P0 + P1 + P2 essencial (P2-1/3/5/6) implementados (V41-M4, 2026-11-22); P2-2/P2-4 polish residual  
**Data:** 2026-11-22  
**Fontes:** `V4.1-Experience.md` §8 (aceitação); `V4-Tests-and-Benchmarks.md` §4 (testes V4.1); journey-map + tui-command-audit; V4.0 (D2–D9, Q1–Q7)  
**Regra:** não reescrever o motor de agentes; preferir fachada UX + rótulos + unificação de superfície; fechar Q1–Q4 com ADR curto **antes** de tocar stores sensíveis.  
**ADRs P0:** `docs/v4/V4.1/adr/Q1-success-copy.md`, `docs/v4/V4.1/adr/Q2-task-entity.md`.
**ADRs P1:** `docs/v4/V4.1/adr/Q3-agent-handle.md`, `docs/v4/V4.1/adr/Q4-approval-facade.md`; handles: `docs/v4/V4.1/agent-handles.md`.
**Gate:** `docs/v4/V4.1/gate-report.md` — **liberar com ressalvas** (usabilidade humana N=0).

---

## 0. Legenda

| Prioridade | Significado |
|---|---|
| **P0** | Bloqueia critérios §8 da jornada cotidiana (abrir→entrega) ou bug de contrato (Delivery/PASS) |
| **P1** | Agent Handles opcionais + unificação Approval/navegação; necessário ao gate V4.1 (§7 testes) |
| **P2** | Complexidade progressiva, polish visual, camada avançada, métricas de usabilidade |

| Coluna | Significado |
|---|---|
| **§8** | Critério(s) de aceite `V4.1-Experience.md` |
| **§4** | Teste(s) `V4-Tests-and-Benchmarks.md` §4 (jornada / Handles / usabilidade) |
| **Arquivos** | Pontos de partida verificados (não lista exaustiva de diff) |

Dependências: **Q1**/**Q2** fechados em ADR V4.1; abertos **Q3** Handle; **Q4** fachada vs migração Approval — `docs/v4/V4.0/decisions-and-open-questions.md` §B.

---

## 1. P0 — Jornada utilizável sem docs

### P0-1 — Home de retomada (abrir) — **DONE** (V41-M2)

| | |
|---|---|
| **Problema** | Abertura cai em `provider`/`ready` sem Tasks em andamento / que exigem intervenção (`App.tsx:60-64`, `82`, `141`; journey §1.1). |
| **Alvo** | Workspace ativo + lista curta de Tasks + CTA iniciar/retomar; sem painel de métricas (`V4.1` §3.1). |
| **§8** | Iniciar tarefa comum sem consultar documentação; TUI utilizável. |
| **§4** | Jornada 1–2 (abrir; identificar workspace/estado). |
| **Arquivos** | `HomeResume.tsx`, `home-resume.ts`, `App.tsx`; `banner.ts` (INIT→Aguardando entrada, D9). |
| **Feito** | Home com workspace + Tasks curtas + CTA; sem métricas. |
| **Não fazer** | Dashboard de métricas; listar todos os grupos `usage()`. |

### P0-2 — Entrada única NL → Task (iniciar) — **DONE** (V41-M2)

| | |
|---|---|
| **Problema** | NL TUI + `intent` / `goal` / `task` / `circuit` competem; rótulos Goal/Meta vs Task (inventário §1–§2; journey §1.2). |
| **Alvo** | Uma entrada principal; Grill-Me só quando altera plano/risco; vocabulário **Task** (D2). |
| **§8** | Iniciar sem docs. |
| **§4** | Jornada 3–4 (tarefa simples; ambígua + perguntas). |
| **Arquivos** | `App.tsx` (placeholder/copy Task; Grill budget); ADR Q2. |
| **Feito** | Placeholder/erros usam Task; Grill só se `grillInterviewBudget > 0`; CLI legada intacta. |
| **Não fazer** | Apagar CLI `task`/`goal`/`circuit` nesta fatia — relegar a camada progressiva (P2). |

### P0-3 — Plano legível (rótulo Plan + secções) — **DONE** (V41-M2)

| | |
|---|---|
| **Problema** | `GoalContractReview` não se chama Plan; riscos/custos/Agents não são secções padrão (journey §1.3). |
| **Alvo** | Cartão **Plan**: objetivo, critérios, etapas, Agents relevantes, riscos/permissões, autónomo vs Approval (V4.1 §3.3; D2/D7 Q7). |
| **§8** | Approval com contexto (quando Plan exige OK). |
| **§4** | Jornada 5 (revisar plano e iniciar). |
| **Arquivos** | `GoalContractReview.tsx` + `plan-display.ts` (view-model). |
| **Feito** | Título Plan + secções padrão; runtime Goal Contract IDs inalterados. |
| **Não fazer** | Unificar literais runtime de sucesso (D6) — só apresentação. |

### P0-4 — Estado Task/Session L1 sem log no default (acompanhar) — **DONE** (V41-M2)

| | |
|---|---|
| **Problema** | Footer `[mso_state]` + `Workers`; shell streama `MSO → …`; painel `Tarefa:` = `work_id` (`footer-compact.ts:73-80`; `status-panel.ts:44-56`; journey §1.4). |
| **Alvo** | Distinguir Task / Agent / Session; bloqueio legível sem logs brutos; Workers→**Agents** (D2/D4/D7). |
| **§8** | Distinguir estado Task/Agent/Session; identificar bloqueios sem logs brutos. |
| **§4** | Jornada 6; usabilidade “descobrir por que parou”. |
| **Arquivos** | `footer-compact.ts`; `FooterBar.tsx`; `ExecutionLive.tsx`; `status-panel.ts`; `banner.ts`; `slash-handlers.ts`. |
| **Feito** | L1 Task/Session/Agents; stream técnico off default; painel sem `Tarefa:=work_id`. |
| **Não fazer** | Remover stream técnico — mover para L5 / verbose. |

### P0-5 — Delivery PASS só com evidência — **DONE** (V41-M2)

| | |
|---|---|
| **Problema** | Default `PASS` se kick started e não BLOCKED (`App.tsx:282-287`); tokens “Workers” (`delivery-card-view.ts:38`); D5 viola. |
| **Alvo** | Separar processo terminou ≠ objetivo validado; PASS só com verificação (V4.1 §3.6; D5; Q1 copy). |
| **§8** | Resultados verificados vs não verificados. |
| **§4** | Jornada 9 (entrega com alterações/testes/evidências). |
| **Arquivos** | `delivery-status.ts`; `App.tsx`; `DeliveryCard.tsx`; `delivery-card-view.ts`; ADR Q1. |
| **Feito** | `deriveDeliveryStatus` → UNVERIFIED sem verification; copy Agents; processo≠objetivo. |
| **Não fazer** | Inventar evidência; unificar literais de store (D6). |

### P0-6 — Terminal estreito / degradação — **DONE** (V41-M2)

| | |
|---|---|
| **Problema** | Guia visual define empilhar L0→L3 (`terminal-visual-guide.md` §4); comportamento degradado não auditado como feature de produto nesta M1. |
| **Alvo** | Utilizável em dimensões suportadas; informar degradação (`V4.1` §8). |
| **§8** | TUI em dimensões suportadas + degradação. |
| **§4** | (overlap V4.2 resize; smoke V4.1 usabilidade). |
| **Arquivos** | `layout-narrow.ts`; `App.tsx`; footer/Plan/Delivery empilháveis. |
| **Feito** | Aviso `<72` cols; stack L0–L3; padding reduzido nos cartões. |

---

## 2. P1 — Intervenção, Approvals, Handles

### P1-1 — Fila Approval unificada na TUI — **DONE** (V41-M3)

| | |
|---|---|
| **Problema** | `evolve approvals *` só CLI (`v35-commands.ts:292-368`); gates paralelos Goal/consent/`approve-plan`/`confirm_mso` (journey §1.5; D8/Q4). |
| **Alvo** | L0: Approval pendente com o quê/porquê/impacto; ações approve/reject/pause/cancel claras. |
| **§8** | Approval contextual; bloqueios sem logs. |
| **§4** | Jornada 7–8 (aprovação; pause/cancel/retomar). |
| **Arquivos** | Novo painel Approval (Ink); bridge a `ApprovalStore`; `App.tsx` keybindings; **não** mapear Ctrl+D detach → kill Agent. |
| **ADR** | Q4: preferir **fachada** sobre gates existentes antes de migrar consent. |
| **Feito** | `ApprovalPanel` + `ApprovalFacade`; Ctrl+D ≠ kill. |

### P1-2 — Pause/cancel de Task vs pause UI vs workflow — **DONE** (V41-M3)

| | |
|---|---|
| **Problema** | Ctrl+P = `setPaused` local (`App.tsx:195-198`); CLI `pause`/`resume`; `workflow pause` (audit §4.1). |
| **Alvo** | Um pause de **Task/jornada** na UX default; resto avançado. |
| **§8** | Intervenção explícita; destrutivo ≠ navegação. |
| **§4** | Jornada 8. |
| **Arquivos** | `App.tsx`; `keybindings.ts:33-34`; handlers `pause`/`resume` em `evolve.ts`; docs keybindings. |
| **Feito** | Ctrl+P = Pause Task; cancel destrutivo vs detach navegação (`task-controls.ts`). |

### P1-3 — Preferência Agent Handles (default off) — **DONE** (V41-M3)

| | |
|---|---|
| **Problema** | GAP total de preferência/tipo (`tui-command-audit.md` §6; D3). |
| **Alvo** | On/off persistente; jornada completa com off; sem abrir sessões extras se off. |
| **§8** | Handles ligados/desligados; não requisito. |
| **§4** | Jornada 10–11; Handles “desativados”. |
| **Arquivos** | profile/`profiles` ou config workspace; setup first-run (overlap V4.2 — mínimo V4.1: flag + leitura); docs uso. |
| **ADR** | Q3 (`adr/Q3-agent-handle.md`). |
| **Feito** | Flag profile/workspace/env; default off. |

### P1-4 — Superfície `agents` + inspect humano (sem duplicar) — **DONE** (V41-M3)

| | |
|---|---|
| **Problema** | `agents list` exige `--work-id` JSON (`evolve.ts:842-853`); inspect JSON (`v35-commands.ts:371-384`). |
| **Alvo** | `evolve agents` no contexto Task/Workspace ativo; inspect distingue Agent vs Session (terminal). |
| **§8** | Distinguir estados; Handles opcionais. |
| **§4** | Handles: inspect identidade/estado/sessão; usabilidade “inspecionar agente”. |
| **Arquivos** | `evolve.ts` grupo `agents`; `v35-commands.ts` inspect; view humana (print text); TUI slash opcional `/agents`. |
| **Regra** | Alias cosmético `agent`→`agents`; **não** dois namespaces. |
| **Feito** | `agents-surface.ts` list/inspect humano. |

### P1-5 — `attach` + `logs` por Agent (só se Handles on) — **DONE** (V41-M3)

| | |
|---|---|
| **Problema** | Sem `attach`/`logs` de produto; `service logs` = daemon (`v35-commands.ts:145-153`); `session-cancel` é destrutivo (`evolve.ts:1154-1161`). |
| **Alvo** | attach → sessão correta; fechar viewer ≠ kill; logs ≠ `service logs`; backend ausente → fallback CLI (V4.1 §4). |
| **§8** | Fechar visualização ≠ encerrar Agent; Handles opcionais. |
| **§4** | Todos os testes específicos de Handles (attach, reconnect, substituído, backend ausente, permissões). |
| **Arquivos** | novos subcomandos sob `agents` (attach/logs); adapter tmux/Zellij opcional; reusar `adapters sessions` / harness sessions como detalhe Session; **proibido** ligar detach viewer → `session-cancel`. |
| **Não fazer** | Exigir tmux/Zellij para executar Tasks. |
| **Feito** | attach/logs + fallback CLI; viewer close ≠ kill (testes). |

### P1-6 — Continuity / Agent substituído (apresentação Handle) — **DONE** (V41-M3)

| | |
|---|---|
| **Problema** | `continuity` CLI existe; UX Handle histórico ausente. |
| **Alvo** | Handle antigo = histórico/substituído; ativo aponta sessão atual. |
| **§8** / **§4** | Handles: agente substituído. |
| **Arquivos** | `continuity/*`; registry `AgentState` `REPLACED`; camada Handle (P1-3..5). |
| **Feito** | `presentation.ts` substituído vs ativo. |

---

## 3. P2 — Progressivo, polish, evidência de usabilidade

### P2-1 — Classificar `usage()` em default / progressivo / legado — **DONE** (V41-M4)

| | |
|---|---|
| **Problema** | Dezenas de grupos no `usage()` (`evolve.ts:134-195`) opostos a “entrada limpa”. |
| **Alvo** | Help curto da jornada; avançado sob `evolve help advanced` ou secção. |
| **§8** | Iniciar sem docs. |
| **§4** | Usabilidade (comandos consultados); benchmarks “nº de comandos”. |
| **Arquivos** | `help-usage.ts`; `evolve.ts` `usage()`; docs uso cotidiano. |
| **Feito** | `evolve --help` / `evolve help` = jornada; `evolve help advanced` = JSON grupos. |
| **ADR** | Q5 (Job/Circuit na superfície) — residual. |

### P2-2 — Unificar overlaps de status/sessions (facade) — **PENDENTE** (fora do P2 essencial M4)

| | |
|---|---|
| **Problema** | `status` / `progress` / `/status` / `tui status` / `coordinator|runtime|service status`; `adapters sessions` vs `harness sessions` (audit §4.1). |
| **Alvo** | Default = Task/Session produto; um caminho Session de processo sob Handles. |
| **§4** | Reduzir regressões/confusão; benchmarks. |
| **Arquivos** | `evolve.ts`; `status-board.ts`; `v35-commands.ts`; docs depreciação. |

### P2-3 — Slash de jornada (`/plan`, `/approvals`, `/agents`, …) — **DONE** (V41-M4)

| | |
|---|---|
| **Problema** | Só `/config|/diff|/status|/clear` (`slash-commands.ts:5-16`). |
| **Alvo** | Atalhos alinhados à jornada sem obrigar memorizar CLI. |
| **§4** | Usabilidade. |
| **Arquivos** | `slash-commands.ts`; `slash-handlers.ts`; `App.tsx`. |
| **Feito** | `/plan` `/approvals` `/agents` `/pause` `/cancel` `/delivery` (+ stubs honestos). |

### P2-4 — Copy Orchestrator vs MSO; rótulos Guide visual — **PENDENTE** (fora do P2 essencial M4)

| | |
|---|---|
| **Problema** | Usuário vê MSO; produto = Orchestrator (D2/Q6); cores/símbolos parcialmente alinhados. |
| **Alvo** | Aplicar `terminal-visual-guide.md` + decisão Q6. |
| **§8** | Clareza de estados. |
| **§4** | Compreensão / usabilidade. |
| **Arquivos** | `banner.ts`; footers; Delivery; mensagens `shell-start-execution.ts`. |

### P2-5 — Matriz de evidência / dogfood §4 — **DONE** (V41-M4)

| | |
|---|---|
| **Problema** | V41-M1 = estático; gate V4.1 exige cenários gravados + Handles. |
| **Alvo** | Script/roteiro + registro no formato §8 benchmarks; baseline já em `docs/v4/V4.0/baseline/`. |
| **§4** | Evidência exigida (gravação, matriz backend, viewer≠kill). |
| **Arquivos** | `docs/v4/V4.1/tests/*`; gate `docs/v4/V4.1/gate-report.md`. |
| **Feito** | journey / handles / automated / usability(N=0) / backend / indicators. |

### P2-6 — Documentação curta de uso (entregável §7.7) — **DONE** (V41-M4)

| | |
|---|---|
| **Alvo** | Cotidiano + referência avançada (após P0/P1 estáveis). |
| **Arquivos** | `docs/v4/V4.1/user-guide-everyday.md`; `docs/v4/V4.1/user-guide-advanced.md`. |
| **Feito** | Guias cotidianos + avançado. |

---

## 4. Matriz §8 ↔ itens

| Critério aceite §8 | Itens |
|---|---|
| Iniciar tarefa comum sem docs | P0-1, P0-2, P2-1 |
| Distinguir estado Task / Agent / Session | P0-4, P1-4 |
| Bloqueios/ações sem logs brutos | P0-4, P1-1 |
| Approval com contexto e consequência | P0-3, P1-1 |
| Entrega: verificados vs não verificados | P0-5 |
| Handles on/off; não requisito | P1-3, P1-5; teste jornada 10 |
| Fechar viewer ≠ matar Agent | P1-5, P1-6 |
| TUI dimensões + degradação | P0-6 |

---

## 5. Matriz §4 testes ↔ itens

| Bloco §4 | Itens |
|---|---|
| Jornada funcional 1–11 | P0-1…P0-5, P1-1…P1-3, P1-5 |
| Handles específicos | P1-3…P1-6 |
| Usabilidade (sem explicar comandos) | P0-*, P1-1, P2-1, P2-3 |
| Benchmarks (tempo, nº comandos, attach) | P2-5 (+ medições pós-P0) |
| Evidência (gravação, matriz backend) | P2-5 |

---

## 6. Ordem sugerida de execução

```text
ADR Q2 (Task entity) + Q1 (copy sucesso)
  → P0-5 Delivery PASS          (contrato quebrado hoje)
  → P0-4 estado L1 + Workers→Agents
  → P0-3 Plan label/secções
  → P0-2 entrada NL / Grill
  → P0-1 home retomada
  → P0-6 terminal estreito
ADR Q4 (Approval facade) → P1-1 + P1-2
ADR Q3 (Handle) → P1-3 → P1-4 → P1-5 → P1-6
P2-* (usage, slash, docs, dogfood)
```

**Proibido nesta fase V4.1 Experience:** reescrever Execution Engine / registry core sem necessidade demonstrada (`V4.1-Experience.md` §6).

---

## 7. Fora deste backlog (outras versões)

| Tema | Versão |
|---|---|
| Onboarding limpo, preferências, workspace switch, histórico rico | V4.2 |
| E2E resiliência, regressão ampla, benchmarks comparativos finais | V4.3 |
| Identity glossário/estados (já documentados) | V4.0 (feito; gate com ressalvas) |

---

*Fim — implementation backlog (V41-M1). Nenhum código de produto alterado nesta tarefa.*
