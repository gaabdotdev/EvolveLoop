# V4.0 — Inventário de inconsistências da CLI/TUI atual

**Data:** 2026-11-22  
**Repo:** `seagrass` (`EvolveLoop`)  
**Método:** inspeção estática do código + docs in-repo; **sem inventar contratos**.  
**Fontes de planejamento:** `V4.0-Identity.md` §4 (modelo mental); `V4-Tests-and-Benchmarks.md` §3 (V4.0 Identity).  
**Entrypoint observado:** `bin/evolve` → `orchestrator/dist/cli/evolve.js` (`orchestrator/src/cli/evolve.ts`).  
**Superfícies UX:** (A) shell conversacional `v3/evolve-shell/`; (B) Ink TUI `cli/tui/`; (C) subcomandos JSON/`print` em `evolve.ts` + `v35-commands.ts` / `v36-commands.ts`; (D) board read-only `v3/tui/status-board.ts`.

**Wiki grounding:** `ground.sh` scout/search OK; pack EvolveLoop UX **ausente** no corpus (GAP wiki). Contratos abaixo são só do código/docs do repo.

**Legenda de confiança:** `alta` = tipo/string literal no código; `média` = comportamento inferido de fluxo; `GAP` = planning doc pede conceito sem exposição UX verificável.

---

## 1. Conceitos (V4.0) vs nomes usados na UI/CLI

| Conceito V4.0 | Significado planning | Nomes no código / UI | Superfície | Notas |
|---|---|---|---|---|
| **Workspace** | contexto de trabalho | `cwd`; `workspace_id`; `WorkspaceLease`; mensagem `Workspace novo…`; banner `workspace_display`; grupo CLI `workspace` (V3.5) | shell, TUI, CLI | Coerente como path/cwd; lease é detalhe interno exposto pouco. |
| **Task** | objetivo delegado pelo usuário | `TaskState` / `OrchestrationTask`; CLI `task add\|show\|approve-plan`; placeholder TUI “Descreva a **tarefa**”; painel `│ Tarefa:` | shell, TUI, CLI | **Conflito:** painel mostra `work_id` sob rótulo “Tarefa” (ver §2). |
| **Plan** | decomposição do trabalho | `task_kind: "plan"`; evento/condição `PLAN_APPROVED`; CLI `task approve-plan` / `hierarchy approve`; cartão **Goal Contract** (não “Plan”) | CLI, TUI review | Usuário vê “Goal Contract”, não “Plan”. |
| **Agent** | executor especializado | `AgentRecord` / `AgentState`; CLI `agents …`; footer “**Workers**”; adapters (`cursor-agent`, harness) | CLI, TUI footer | “Agent” (registry) ≠ “Workers” (HUD) ≠ “adapter/harness”. |
| **Orchestrator** | coordena agentes | **MSO** (estados oficiais); `CoordinatorService`; CLI `coordinator`; daemon UDS | shell, CLI | Usuário vê “MSO”, não “Orchestrator”. |
| **Session** | contexto execução/terminal de um agente | `MsoSession`; `ProcessSessionRecord` (harness); CLI `adapters sessions` / `harness sessions`; slash `/status` “Sessão · contrato”; Grill-Me `session.ts` | shell, TUI, CLI | Várias “sessões” sem rótulo unificado. |
| **Agent Handle** | acesso à sessão do agente | — | — | **GAP:** nenhum tipo/comando `AgentHandle` / `handle` de produto (só “handlers” de código). |
| **Approval** | decisão que exige autorização | `ApprovalRequest` / `ApprovalState`; CLI `approvals list\|approve\|reject`; `approve-plan`; consentimento harness; cartão Goal Contract Confirm | CLI (V3.5), TUI parcial | TUI não expõe fila `approvals`; confirma Goal Contract / consent. |
| **Delivery** | resultado final + evidências | `DeliveryCard` / `DeliveryStatus`; título `Entrega Final · {PASS\|BLOCKED\|FAILED}` | TUI Ink | Shell conversacional **não** usa o mesmo cartão; devolve `message_pt` + estado MSO. |

### Conceitos extras (não estão no modelo V4.0 §4, mas dominam a CLI)

| Nome no código/UI | Onde | Relação com V4.0 |
|---|---|---|
| **Goal / Goal Contract / Goal Document / Meta** | `goal-contract/`, painel `│ Meta:`, Grill-Me | Sobreposição com Task + Plan |
| **Work / work_id** | TaskGraph, MSO, ledger | Camada entre Goal e Tasks; às vezes rotulada “Tarefa” |
| **Job / SkillJob** | `jobs/job-store.ts`, `cli/run-jobs.ts` | Pipeline Capability IR legado; status `pending\|completed\|failed` |
| **Intent** | `evolve intent`, TUI input | Entrada NL → Goal Contract |
| **Circuit / Fire-5** | `evolve circuit` | Validação/execução V0, paralelo ao shell |
| **Harness / Adapter** | `adapters/`, consent | Runtime do “Agent” efetivo |

---

## 2. Sinônimos e conflitos

| Conflito | Termos | Evidência | Impacto UX |
|---|---|---|---|
| Objetivo do usuário | Task · Intent · Goal · Meta · Goal Contract · Goal Document | TUI placeholder “tarefa”; `GoalContractReview` “Goal Contract”; painel “Meta” = `objective` | Usuário não sabe qual entidade “é” a tarefa. |
| Unidade de execução | Task · Work · Job · Circuit `task-id` | `TaskState` vs `work_id` vs `SkillJob.status` vs `evolve circuit --task-id` | Mesmo fluxo usa IDs diferentes. |
| Sucesso terminal | `TRUE_PASS` (task) · `TRUE_FULL_PASS` (work) · `TRUE-FULL-PASS` (MSO, hífen) · Delivery `PASS` · Criterion `PASS` | `goal-contract/types.ts`; `mso/states.ts`; `delivery-card-view.ts` | Quatro grafias/semânticas de “passou”. |
| “Tarefa” ≠ task_id | Painel `Tarefa:` ← `latest_mso_session.work_id` | `status-panel.ts:44-56` | Rótulo mente: mostra work, não task. |
| Sessão | MSO session · ProcessSession · Grill session · “Sessão” no slash | `state-db/types.ts` `MsoSession`; `process-sessions.ts`; `slash-commands.ts` hint | Attach/detach fala de daemon, não de Agent Handle. |
| Aprovação | `ApprovalState` · `approve-plan` (task → `TRUE_PASS`) · `confirm_mso` · harness consent · Goal review | `approvals/types.ts`; `task-graph/store.ts` (approve marca `TRUE_PASS`); TUI `GoalContractReview` | Quatro gates distintos sob linguagem próxima. |
| Agente vs worker vs adapter | `agents` CLI · footer `Workers` · `adapter_id` | `agent-registry/types.ts`; `footer-compact.ts`; `shell-start-execution.ts` | Hierarquia invisível na TUI. |
| Plan vs Goal Contract | Planning “Plan” · UI “Goal Contract” · interno `PLAN_APPROVED` | V4.0 §4 vs `GoalContractReview.tsx:70` vs `task-graph/types.ts:73` | Conceito Plan sem rótulo de produto. |
| Cancelamento | `CANCELLED` (task/agent/approval) · `cancelled` (process session) · TUI “Confirmação cancelada.” · `cancel apply` | Grafias `CANCELLED` vs `cancelled` | Inconsistência ortográfica EN. |
| IDLE | MSO **não** tem IDLE; painel mapeia IDLE→INIT; banner INIT→“Pronto” | `status-panel.ts:23`; `banner.ts:76`; `mso/states.ts` | Estado informal “Pronto” ≠ máquina oficial. |

---

## 3. Estados observados (com evidência)

### 3.1 Task (`TaskState`)

**Arquivo:** `orchestrator/src/v3/goal-contract/types.ts:15-22`

| Estado | Literal |
|---|---|
| PENDING | `PENDING` |
| IN_PROGRESS | `IN_PROGRESS` |
| PARTIAL_PASS | `PARTIAL_PASS` |
| TRUE_PASS | `TRUE_PASS` |
| BLOCKED | `BLOCKED` |
| FAILED | `FAILED` |
| CANCELLED | `CANCELLED` |

**Nota:** `approveDomainPlan` / approve-plan seta task de plano para `TRUE_PASS` (`task-graph/store.ts` ~L97), não um estado `PLAN_APPROVED` no enum — `PLAN_APPROVED` é condição/documentação (`task-graph/types.ts:73-88`).

### 3.2 Work (`WorkState`) — paralelo à “task” de produto

**Arquivo:** `orchestrator/src/v3/goal-contract/types.ts:24-31`

`NOT_PASS` · `IN_PROGRESS` · `VERIFICATION` · `RECOVERY` · `BLOCKED` · `CANCELLED` · `TRUE_FULL_PASS`

### 3.3 Agent (`AgentState`)

**Arquivo:** `orchestrator/src/v3/agent-registry/types.ts:5-16`

`INITIALIZING` · `ACTIVE` · `WAITING` · `YIELDING` · `LIMIT_REACHED` · `FAILED` · `STALE` · `ORPHANED` · `REPLACED` · `COMPLETED` · `CANCELLED`

**Exposição UI:** CLI `agents list|inspect` (JSON). TUI default **não** lista AgentState.

### 3.4 Session (várias máquinas)

| Tipo | Estados | Evidência |
|---|---|---|
| **MSO session** | `INIT` · `LOADING_GOALS` · `ANALYZING` · `DECOMPOSING` · `DELEGATING` · `WAITING_AGENTS` · `VALIDATING` · `BLOCKED` · `RECOVERING` · `TRUE-FULL-PASS` | `mso/states.ts:6-17` (+ matriz L22-33) |
| **Process / harness session** | `running` · `exited` · `cancelled` · `dry_run` · `orphaned` | `adapters/drivers/process-sessions.ts:28` |
| **Continuity handoff** | `pending` · `applied` · `paused_no_substitute` · `cancelled` | `continuity/types.ts:59` |
| **TUI phase (UI only)** | `ready` · `grill_q` · `review` · `busy` · `delivery` (+ provider setup) | `cli/tui/App.tsx` (fase local, ≠ MSO) |

### 3.5 Approval (`ApprovalState`)

**Arquivo:** `orchestrator/src/v3/approvals/types.ts:8-13`

`PENDING` · `APPROVED` · `REJECTED` · `EXPIRED` · `CANCELLED`

**Comando:** `evolve approvals list|inspect|approve|reject` (`v35-commands.ts:292-397`).

### 3.6 Delivery (TUI)

**Arquivo:** `cli/tui/delivery-card-view.ts:5`

`PASS` · `BLOCKED` · `FAILED`

**Derivação atual:** `App.tsx:282-287` — default `PASS` se kick “started” e não BLOCKED/fail regex; **não** exige `TRUE-FULL-PASS` nem verification.

### 3.7 Job (legado Capability)

**Arquivo:** `jobs/job-store.ts:34` — `pending` · `completed` · `failed`

### 3.8 Criterion

**Arquivo:** `goal-contract/types.ts:6-13` — `NOT_STARTED` · `IN_PROGRESS` · `PASS` · `FAIL` · `NOT_PASS` · `BLOCKED` · `NOT_APPLICABLE`

---

## 4. Mensagens amostradas (erro / sucesso / espera / bloqueio / cancelamento)

### Sucesso / progresso positivo

| Mensagem (amostra) | Arquivo:linha |
|---|---|
| `Delegação concluída com status ok. TRUE-FULL-PASS exige Evidence Validator…` | `shell-start-execution.ts:337` |
| `Execução autorizada devolvida (VALIDATING). Revise o diff e rode testes se necessário.` | `shell-start-execution.ts:342` |
| `Entrega Final · PASS` | `delivery-card-view.ts:56` / `DeliveryCard.tsx:100` |
| `Pronto. Setup concluído.` | `first-run-setup.ts:265` |
| `Pronto com avisos (N). Credenciais nunca aparecem em logs.` | `first-run-setup.ts:264` |
| Banner `Estado: Pronto` (quando MSO INIT/IDLE) | `banner.ts:75-77` |
| `↪ Desconectado do daemon (MSO continua rodando em background).` | `keybindings.ts:36-37` |
| `Histórico visual limpo.` | `slash-handlers.ts:60` |
| `MSO sessão {id} criada (INIT).` | `shell-start-execution.ts:134` |
| `Ollama local pronto (localhost:11434)` | `provider-readiness.ts:147` |

### Espera / idle

| Mensagem | Arquivo:linha |
|---|---|
| `aguardando resposta do modelo (Ns)...` | `activity-window.ts:92` |
| `último sinal há Ns` | `activity-window.ts:97` |
| `Já existe sessão MSO ativa (… · {state}). Use 'status' ou aguarde.` | `shell-start-execution.ts:98` |
| `⏸ Novas delegações pausadas (aguardando tarefas ativas)` | `keybindings.ts:33-34` |
| TUI `Em pausa (Ctrl+P).` / `Retomado.` | `App.tsx:197` |

### Bloqueio

| Mensagem | Arquivo:linha |
|---|---|
| `Execução bloqueada pelo adapter: {code}.…` | `shell-start-execution.ts:363` |
| `Adapter indisponível (…): …. MSO → BLOCKED.` | `shell-start-execution.ts:255` |
| `Nenhum Goal Contract com MSO confirmado.…` | `shell-start-execution.ts:84-85` |
| `Entrega Final · BLOCKED` | via `DeliveryStatus` |
| Consent harness: texto pré-spawn em `shell-start-execution.ts:156-158` | |

### Erro

| Mensagem | Arquivo:linha |
|---|---|
| `Erro ao iniciar execução: …` | `App.tsx:299` |
| `Erro: …` (intent) | `App.tsx:423` |
| `Intenção não gerou Goal Contract. Reformule.` | `App.tsx:395` |
| `evolve: missing …/evolve.js — run: (cd orchestrator && npm run build)` | `bin/evolve:17` |
| `Required: --data-dir <path>` (e dezenas de `Required: …`) | `evolve.ts:124+` |
| `Job {id} is not pending (status: …)` | `run-jobs.ts:71` |

### Cancelamento / interrupção

| Mensagem | Arquivo:linha |
|---|---|
| `Confirmação cancelada.` | `App.tsx:440` |
| `Interrompido (Ctrl+C).` | `App.tsx:186` |
| `⏹ Interrompendo… (Ctrl+C novamente para forçar)` | `keybindings.ts:27-28` |
| `✖ Encerramento forçado; execute evolve novamente para reconciliar.` | `keybindings.ts:30-31` |
| `Daemon OFF: fechar o terminal encerrará a sessão.…` | `keybindings.ts:39-40` |
| Goal review `[Esc] Cancelar` | `GoalContractReview.tsx:25` |

### Feedback operacional (amostra shell)

| Mensagem | Arquivo:linha |
|---|---|
| `Iniciando execução autorizada para {goal_contract_id}…` | `shell-start-execution.ts:104` |
| `MSO → VALIDATING (adapter status=…)` | `shell-start-execution.ts:332` |
| `Sessão MSO reconhecida: …` / `Projeto inicializado: …` | `workspace-session.ts:52-56` |
| `/status` body: `MSO: …` · `Contrato: vN` · tokens | `slash-handlers.ts:43-49` |
| Tag `[local · 0 tok]` | `grill-ux.ts:13` |

---

## 5. Mensagens / UI que afirmam sucesso sem evidência verificável

Critério (V4.0 Identity §3 + V4-Tests §3): declarar conclusão/sucesso sem alterações, testes, evidências ou limitações verificáveis.

| # | Afirmação | Por que sem evidência verificável | Evidência código |
|---|---|---|---|
| 1 | TUI `Entrega Final · **PASS**` após kick | Default `status = "PASS"` quando `kick.started` e não BLOCKED; shell deixa MSO em **VALIDATING**, não `TRUE-FULL-PASS`. Campo `verification` **nunca** é preenchido em `App.tsx` (`rg verification:` vazio) → cartão mostra `Verificação: —`. | `App.tsx:282-296`; `shell-start-execution.ts:334-346`; `delivery-card-view.ts:44` |
| 2 | Diff pode ser `(sem alterações)` sob título PASS | `gitDiffStat` vazio ainda renderiza sob “Entrega Final · PASS”. | `DeliveryCard.tsx:27-37,99-106` |
| 3 | `Delegação concluída com status ok` | “ok” do adapter ≠ critérios PASS / Evidence Validator; o próprio comentário admite não declarar TRUE-FULL-PASS, mas a prosa “concluída” sugere fim. | `shell-start-execution.ts:334-337` |
| 4 | Banner / estado **Pronto** | Mapeia `INIT`/`IDLE` → “Pronto” sem provar readiness de provider/sandbox/contrato. | `banner.ts:75-77` |
| 5 | `Pronto. Setup concluído.` | Setup “ready” não equivale a execução validada; mensagem absoluta. | `first-run-setup.ts:262-266` |
| 6 | Painel `Modelo/Provider: local/determinístico (0 tokens)` | Pode sugerir medição real 0 tok sem provenance `reported\|estimated\|UNAVAILABLE` no painel legado. | `status-panel.ts:45` |
| 7 | `MSG_DETACH_OK` — “MSO continua rodando em background” | Afirma continuidade sem checar processo/daemon vivo no momento da mensagem. | `keybindings.ts:36-37` |
| 8 | Slash `Histórico visual limpo.` | Sucesso cosmético OK; risco baixo — listado só se confundido com limpeza de estado durable. | `slash-handlers.ts:60` |
| 9 | Delivery `PASS` com tokens `—` | Tokens omitidos quando honesty UNAVAILABLE; status PASS permanece. | `App.tsx:289-296`; `formatDeliveryTokens` |

**Não listar como falso sucesso (controle positivo no código):** aviso explícito de que TRUE-FULL-PASS exige Evidence Validator (`shell-start-execution.ts:335-337`) — alinhado ao princípio, mas contradito pela TUI item #1.

---

## 6. Gaps: planning V4.0 vs exposição no código/CLI

| Conceito / requisito V4.0 | Gap observado | Confiança |
|---|---|---|
| **Agent Handle** (inspect/attach; opcional) | Sem tipo, comando, preferência ou UI. Closest: daemon detach + harness `sessions` / `session-cancel` (processos), não handles de agente. | alta |
| **Vocabulário único Task** | Goal/Meta/Work/Job/Intent competem; “Tarefa” no painel = `work_id`. | alta |
| **Plan** como conceito de usuário | Só Goal Contract + approve-plan interno; sem vista “Plan” na TUI. | alta |
| **Orchestrator** nomeado | Usuário vê MSO/Coordinator/daemon, nunca “Orchestrator”. | alta |
| **Estados inequívocos** task/agent/session/approval | ≥5 state machines com literais incompatíveis (`TRUE_PASS` vs `TRUE_FULL_PASS` vs `TRUE-FULL-PASS` vs Delivery `PASS`). | alta |
| **Approval na jornada TUI** | Store + CLI V3.5 existem; Ink TUI não lista/aprova `ApprovalRequest` (só review Goal + consent). | alta |
| **Delivery com evidências** | Cartão existe, mas verification/criteria/evidence_ids não alimentam o status PASS. | alta |
| **Estado antes de log** | Shell ainda emite stream de writes (`MSO → …`); TUI tem `ExecutionLive` + delivery — parcial. | média |
| **Agent Handles on/off** (V4.1 testes, mas identidade V4.0 exige contemplar) | Preferência inexistente no profile/CLI inventariados. | alta |
| **Wiki / glossário canónico EvolveLoop CLI** | Vault sem pack UX; `docs/concepts/README.md` lista Capability IR/PDA, não o modelo mental V4.0. | alta |

---

## 7. Contagens (baseline inventário — V4-Tests §3)

| Indicador | Valor neste inventário |
|---|---|
| Conceitos V4.0 §4 mapeados | 9 |
| Conceitos com gap de exposição | ≥4 (Handle, Plan-as-label, Orchestrator-as-label, Approval-in-TUI) |
| Clusters de sinônimos/conflitos (§2) | 10 |
| State machines distintas (§3) | 8+ (Task, Work, Agent, MSO, ProcessSession, Approval, Delivery, Job, Criterion, Continuity, TUI phase) |
| Mensagens amostradas (§4) | 30+ |
| Sucesso sem evidência verificável (§5) | 9 itens (1–7 e 9 materiais; 8 cosmético) |

---

## 8. Superfícies CLI (referência rápida)

Comando default: `evolve` (sem args) → Ink TUI se `shouldUseInkTui()`, senão REPL PT (`evolve.ts` header + `runInkEvolveShell` / `runEvolveShell`).

Grupos públicos em `usage()` (`evolve.ts:134-195`): `shell`, `setup`, `daemon`, `intent`, `status`, `pause`, `resume`, `progress`, `circuit`, `grill`, `goal`, `work`, `hierarchy`, `task`, `agents`, `continuity`, `exec`, `coordinator`, `approvals` (V3.5), `adapters`, `tui`, `harness`, `cancel`, … — superfície **muito** maior que o modelo mental V4.0 de 9 conceitos.

Slash TUI apenas: `/config` `/diff` `/status` `/clear` (`slash-commands.ts:5-16`).

---

## 9. Decisões abertas (não resolvidas neste inventário)

1. Qual literal de sucesso de produto: `TRUE_FULL_PASS`, `TRUE-FULL-PASS`, ou Delivery `PASS`?
2. “Task” de usuário = Goal Contract, Work, ou nó TaskGraph?
3. Agent Handle: novo conceito UX sobre `ProcessSession`/`session_id` do agent, ou fora de V4.0 até V4.1?
4. Unificar Approval (capability) com confirm Goal Contract e approve-plan?
5. Aposentadoria/deprecação visível de Job/SkillJob na CLI de produto?

---

## 10. Método e limites

- Inspeção: `bin/evolve`, `orchestrator/src/cli/**`, `orchestrator/src/v3/evolve-shell/**`, `orchestrator/src/v3/{mso,goal-contract,agent-registry,approvals,task-graph,adapters/drivers}/**`, `docs/v0/UX-CLI-GAP.md`, `docs/concepts/README.md`.
- **Não** executado: sessão TUI interativa completa; dogfood de aprovação live; attach tmux/Zellij (inexistente como Handle).
- Precedência: código verificado > planning doc. Onde planning pede e código não expõe → GAP (§6).

---

*Fim do inventário M1 — pré-requisito de critérios de aceite V4.0 Identity.*
