# V4.3 — Auditoria de integração (identidade × TUI × runtime)

**Status:** mapa pós-V4.0–V4.2 (pré-implementação Consolidation)  
**Data:** 2026-11-22  
**Alvo:** `V4.3-Consolidation.md` §2.1 (ponta a ponta) + §5 (estado exibido = persistido/operacional)  
**Testes:** `V4-Tests-and-Benchmarks.md` §6  
**Regra:** não inventar gaps — citar path. Precedência: código > docs.

---

## 0. Resumo executivo

| Domínio | Estado pós V4.1/V4.2 | Veredito |
|---|---|---|
| Vocabulário produto na Ink TUI | Task / Plan / Agents / Session / Delivery / Approval em grande parte alinhados | **Parcial** — shell clássico e internos ainda usam Workers / Goal Contract / MSO |
| Delivery honestidade | `deriveDeliveryStatus` → PASS só com verification; kick → UNVERIFIED | **OK com ressalva** — status é **derivado na UI**, não entidade persistida |
| Pause / cancel TUI | Labels honestos (`task-controls.ts`); pause = React state | **Divergência** — pause **não** grava em StateDb / MSO |
| Home / history / prefs | Surfaces produto existem | **OK parcial** — retomada com limitações explícitas |
| Agent Handles | Opcionais; lifecycle active/replaced; attach soft-fail | **OK parcial** — E2E resiliência §6 ainda LIMITATION (TTY live / falhas) |
| Dual entry UX | Ink default TTY; REPL classic; `evolve tui run/status` | **Ruído residual** — três “interatividades” |
| Gate Consolidation §7 | E2E + resiliência + benchmarks + release docs | **Não atingido** nesta M1 (só auditoria) |

---

## 1. Identidade vs superfície (vocabulário)

### 1.1 Alvo (V4.0 glossário + ADRs Q1–Q2)

Conceitos estáveis: Workspace, Task, Plan, Agent, Orchestrator, Session, Agent Handle, Approval, Delivery.

### 1.2 Onde a Ink TUI já alinha (evidência)

| Conceito | Apresentação | Path |
|---|---|---|
| Task | Footer / Home / slash `/status` | `footer-compact.ts`; `home-resume.ts`; `slash-handlers.ts` |
| Plan | Cartão + `/plan` (view-model sobre Goal Contract) | `GoalContractReview.tsx`; `plan-display.ts` |
| Agents | Compact footer / Delivery (não “Workers”) | `footer-compact.ts:3`; `delivery-card-view.ts:3` |
| Session | Tradução fases MSO → “Session: …” | `footer-compact.ts:76-90`; `ExecutionLive.tsx` |
| Delivery | PASS / BLOCKED / FAILED / **UNVERIFIED** | `delivery-status.ts:6` |
| Approval | Painel + `/approvals` + facade | `ApprovalPanel.tsx`; `v3/approvals/facade.ts` |
| Handles | CLI `agents attach/inspect/logs`; prefs | `agents-surface.ts`; `preference.ts` |

### 1.3 Divergências identidade ainda no runtime (IDs)

| ID | Divergência | Evidência | Impacto |
|---|---|---|---|
| I1 | Footer **clássico** ainda rotula **Workers** | `v3/evolve-shell/footer.ts:180-192` | REPL / classic path contradiz glossário Agent |
| I2 | Utilizador vê **MSO** em mensagens/tokens; produto = Orchestrator (Q6 / V4.1 P2-4 PENDENTE) | `shell-start-execution.ts:332-342`; `slash-handlers.ts:77`; `delivery-card-view.ts:93` | Modelo mental “quem orquestra” |
| I3 | REPL / workspace-session ainda dizem **Goal Contract**; Ink diz **Plan** | `repl.ts:513+`; `workspace-session.ts:52-54` vs `GoalContractReview.tsx:97` | Duas línguas na mesma jornada conforme entrypoint |
| I4 | Quatro grafias/semânticas de sucesso: `TRUE_PASS` (Task) · `TRUE_FULL_PASS` (Work/Evidence) · `TRUE-FULL-PASS` (MSO) · Delivery `PASS`/`UNVERIFIED` | `goal-contract/types.ts`; `mso/states.ts`; `evidence-validator.ts`; `delivery-status.ts` | Risco de falso “passou” se UI misturar camadas |
| I5 | Campo interno `tokens_workers` / `tok_workers` vs rótulo Agents | `App.tsx:531-532`; `ledger-aggregate.ts:4` | Nome de API ≠ produto (OK se só interno; confunde em JSON CLI) |
| I6 | Setup copy “Pronto.” (sucesso de setup ≠ Task/Session) | `first-run-setup.ts:290-291` | Aceitável se scoped a setup; não mapear a MSO |

**Nota:** V4.0 inventário e V4.1 audits pré-código estão **parcialmente obsoletos** (slash jornada, Plan, Handles, history, prefs existem). Esta auditoria prevalece para Consolidation.

---

## 2. Estados exibidos vs persistidos

### 2.1 Fontes de verdade persistidas

| Entidade | Store | Path |
|---|---|---|
| MSO Session + transitions | StateDb SQLite | `v3/state-db/store.ts` (`createMsoSession`, `transitionMso`, `listMsoSessionsForWorkspace`) |
| Goal Contract / TaskGraph | StateDb | `store.ts` (header: MSO, contracts, TaskGraph, …) |
| Agent registry | Agent store (registry) | `v3/agent-registry/types.ts` (`AgentState`) |
| Process Session | Harness / adapters | `adapters/drivers/process-sessions.ts` |
| Approvals | Approvals store + facade | `v3/approvals/` |
| Token ledger | StateDb / ledger | `token-economy/honest-telemetry.ts` |
| Handles preference | profile YAML + workspace config + env | `agent-handles/preference.ts` |
| History browse | lê StateDb (contracts + MSO) | `cli/tui/task-history.ts` |

### 2.2 Matriz: o que a UI mostra vs o que está gravado

| Superfície | O que mostra | Persistido? | Coerência | Evidência |
|---|---|---|---|---|
| Banner `Estado:` | MSO (INIT/IDLE → “Aguardando entrada”) | Sim (MSO), com map UI | **OK** (D9) | `banner.ts:75-80`; `status-panel.ts:21-29` |
| Compact footer Session | Tradução de `mso_state` | Sim (MSO) | **OK** se telemetria lida do snapshot | `footer-compact.ts:76-90` |
| Compact footer Task | objective / extras | Contrato persistido | **OK parcial** | `home-resume.ts`; ADR Q2 |
| Ink **pause** (Ctrl+P / `/pause`) | “Task em pausa” | **Não** — `useState(paused)` | **DIVERGÊNCIA** | `App.tsx:115`, `278-284`, `607-637`; `task-controls.ts` |
| Delivery card | PASS/UNVERIFIED/… | **Derivado** no fim do kick; não tabela Delivery | **OK honestidade** / **GAP persistência** | `App.tsx:516-534`; `delivery-status.ts:51-66`; kick deixa `verification: undefined` |
| Kick success path | UI → Delivery UNVERIFIED; MSO → **VALIDATING** | MSO sim | **OK** (processo ≠ validado) | `shell-start-execution.ts:325-346` |
| Adapter fail | UI FAILED/BLOCKED; MSO BLOCKED | Sim | **OK** | `shell-start-execution.ts:349-356`; `App.tsx:535-546` |
| Home resume | Tasks a partir de contract + MSO | Sim (leitura) | **OK** com limitações | `home-resume.ts:39+`; `task-history.ts:113-128` |
| History TRUE-FULL-PASS | “inspeção apenas” | Sim | **OK** | `task-history.ts:113-125` |
| Handle REPLACED | lifecycle + continuity limitation | Agent record + handoff | **OK** | `presentation.ts:31-36`; `limitation-ui.ts` |
| TUI `phase` | provider/ready/grill/review/busy/delivery | **Só UI** | Esperado — **≠** MSO | `App.tsx` phases |
| `/clear` | limpa histórico visual | Não (cosmético) | OK se copy clara | `slash-commands.ts` |

### 2.3 Gaps críticos (exibido ≠ operacional) — IDs

| ID | Gap | Evidência | Critério Consolidation §5 / Tests §6 |
|---|---|---|---|
| S1 | Pause TUI **não** persiste; reinício CLI / outro processo não vê pausa | `App.tsx` `paused` state only | “estado exibido corresponde ao persistido”; retomada após interrupção |
| S2 | Delivery status **não** é entidade StateDb; refresh Home não reconstrói o mesmo cartão sem re-derivar | `App.tsx` setDelivery local; sem `DeliveryRecord` | E2E entrega; não falso sucesso |
| S3 | Kick path **nunca** anexa `verification` → Delivery nunca PASS neste caminho sem trabalho extra | `App.tsx:522-523` | “entrega com testes aprovados/falhando” §6 |
| S4 | MSO `VALIDATING` + Delivery `UNVERIFIED` é coerente, mas fácil de ler como “ainda a validar” vs “acabou sem validar” | `shell-start-execution.ts:342` vs `deliveryStatusTitle` UNVERIFIED | Compreensão de estados |
| S5 | `evolve pause` / `resume` CLI (trivial) ≠ pause Ink ≠ `workflow pause` ≠ continuity | `evolve.ts:518-519`; `task-controls.ts:29` | Interrupção / retomada §6 |
| S6 | Session Process (`running`…) vs AgentState vs MSO — três máquinas; Handles separam Agent≠Session mas TUI default pouco lista AgentState | `presentation.ts:51-65`; V4.1 residual | Substituição / handle desconectado §6 |

---

## 3. Fluxos ponta a ponta (integração)

### 3.1 Jornada principal (Ink)

```text
evolve (TTY) → HomeResume → NL Task → Grill? → Plan confirm
  → startAuthorizedExecution → activity → Delivery card
  → /history | prefs | approvals | agents (Handles opcionais)
```

| Etapa | Runtime | Divergência residual |
|---|---|---|
| Abrir | `shouldUseInkTui` | Classic REPL se FORCE / non-TTY (`tui/index.ts:67-72`) |
| Iniciar | `runIntentFlow` persist contract | CLI `intent`/`goal`/`task`/`circuit` ainda existem (progressivo) |
| Plan | view-model; IDs Goal Contract intactos | REPL copy “Goal Contract” |
| Executar | StateDb MSO + adapter | Stream técnico off default (V4.1) |
| Entregar | `deriveDeliveryStatus` | S2/S3 |
| Retomar | history/home + limitações | Resume parcial documentado V4.2 |

### 3.2 Handles (isolamento ciclo de vida)

| Contrato Consolidation §5 | Estado | Evidência |
|---|---|---|
| Handles opcionais | **OK** — default OFF | `profiles/default.yaml`; `preference.ts` |
| Fechar viewer ≠ matar Agent | **OK** (unit/matrix V4.1) | `attach.ts` `closeViewer`; `docs/v4/V4.1/tests/agent-handles-matrix.md` |
| Substituído ≠ ativo | **OK** apresentação | `classifyHandleLifecycle` `presentation.ts:31-36` |
| Backend ausente não bloqueia | **OK** soft-fail | V4.1 `backend-matrix.md` |
| E2E desconexão / reinício CLI durante execução | **LIMITATION** | Sem gravação TTY live completa (gate V4.1/V4.2) |

### 3.3 Persistência sob falha (pré-check §6)

| Cenário §6 | Observado no código / docs | Status |
|---|---|---|
| Falha provider | Adapter → BLOCKED + mensagem | Parcial (paths existem; E2E harness LIMITATION) |
| Falha agente / substituição | continuity + REPLACED lifecycle | Parcial (UI limitation-ui; E2E LIMITATION) |
| Interrupção processo principal | Lease MSO / daemon detach | Precisa cenário reproduzível V4.3 |
| Falha persistência | StateDb erros | Sem teste resiliência dedicado inventariado |
| Idempotência retomada | history limitações explícitas | Parcial |
| Evidências / consumo não inventados | HonestMetric + Delivery UNVERIFIED | OK unitário (M19 / v41 / v42) |

---

## 4. Mensagens e documentação vs comportamento

| Afirmação possível | Realidade | Path |
|---|---|---|
| “Entrega PASS” após kick OK | **Não** — UNVERIFIED sem verification | `delivery-status.ts`; `App.tsx:516-524` |
| “Session concluída (verificada)” no footer | Só se `mso_state === TRUE-FULL-PASS` | `footer-compact.ts:88` |
| “Task em pausa” | Pausa **local** à sessão Ink | `App.tsx` + `task-controls.ts` |
| “Pronto” no setup | Setup readiness, não MSO | `first-run-setup.ts:290-291` |
| Help journey “CLI-only + Handles off” | Alinhado | `help-usage.ts` |
| Docs V4.1 `tui-command-audit` “slash ausentes” | **Obsoleto** — slash jornada presente | `slash-commands.ts:20-44` |
| Docs V4.2 `command-taxonomy` “`/history` ausente” | **Obsoleto** — `/history` existe | `slash-commands.ts:31` |

---

## 5. Superfícies paralelas (risco de divergência)

| Superfície | Papel | Path | Risco Consolidation |
|---|---|---|---|
| Ink TUI | Jornada default TTY | `cli/tui/` | Fonte de verdade UX |
| Classic REPL | Fallback | `v3/evolve-shell/repl.ts` | Copy/vocabulário atrasado (I1, I3) |
| `evolve tui status` | Board read-only | `v3/tui/status-board.ts` | Terceiro “status” |
| `evolve tui run` | Interactive Core | `v3/tui/interactive.ts` | Segunda TUI nomeada |
| JSON CLI groups | Automação | `evolve.ts` + v35/v36 | Preservar; não promover a L0 |

---

## 6. O que já está integrado (não reabrir sem evidência)

- Delivery não default PASS (ADR Q1) — `delivery-status.ts`
- Plan como fachada de Goal Contract (ADR Q2) — `plan-display.ts`
- Handles API + preferência (ADR Q3) — `agent-handles/`
- Approval facade (ADR Q4) — `approvals/facade.ts`
- Prefs / validate / history / use / proveniência compacta — V4.2 P0–P1
- Baseline + comparative V4.2 — `docs/v4/V4.2/baseline/`

---

## 7. Wiki / GAP meta

| Item | Estado |
|---|---|
| Pack EvolveLoop no vault | **GAP** `PACK_NOT_FOUND` |
| Contratos desta auditoria | Repo + planning apenas |

---

*MSO TASK V43-M1 — auditoria; sem patch de código.*
