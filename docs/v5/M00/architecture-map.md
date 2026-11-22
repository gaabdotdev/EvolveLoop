# Architecture Map — estado atual (pré-V5)

**Meta:** V5-M00 · Discovery only  
**HEAD:** `53ad05911118408d48f334bf991fb299e7c2d5b2`  
**Regra:** só o que existe no código; **GAP** quando a fronteira V5 não tem correspondente.

---

## 1. Vista em camadas

```text
┌─────────────────────────────────────────────────────────────────┐
│  Surfaces (produto)                                              │
│  evolve CLI / Ink TUI / REPL · agents · delivery · history ·    │
│  config prefs · freellm · help (complexidade progressiva V4)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Orchestration core (v3)                                         │
│  Goal Contract · TaskGraph · MSO (StateDb) · Coordinator ·      │
│  Continuity (Handoff) · Approvals · Work Ledger · Event Log     │
└───────────────┬─────────────────────────────┬───────────────────┘
                │                             │
┌───────────────▼──────────────┐  ┌───────────▼───────────────────┐
│  Agents & handles            │  │  Execution / adapters         │
│  AgentRegistry (JSON)        │  │  Adapter catalog + drivers    │
│  Agent Handles (UX, OFF)     │  │  ProcessSessionStore          │
│  Continuity REPLACED         │  │  cli-process (dry-run/real)   │
│  lifecycle/run-controls      │  │  ExecutionRunner (sandbox)    │
└──────────────────────────────┘  │  Harness facade               │
                                  └───────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  Persistence                                                     │
│  SQLite WAL `.evolveloop/state.db` (schema v6)                   │
│  JSON tree sob --data-dir (V3DataPaths)                          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  Models / knowledge (≠ Agent)                                    │
│  ModelProviders (Ollama, OpenRouter, FreeLLMAPI)                 │
│  KnowledgeBackend wiki · Policy / Capability gate                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Entrypoints e superfícies

| Superfície | Path | Notas |
|------------|------|-------|
| CLI principal | `orchestrator/src/cli/evolve.ts` | Sem args / `shell` / `repl` → Ink TUI se TTY, senão REPL |
| Help journey | `orchestrator/src/cli/help-usage.ts` | L0 produto vs grupos legados |
| Agents surface | `orchestrator/src/cli/agents-surface.ts` | Handles / inspect |
| Delivery surface | `orchestrator/src/cli/delivery-surface.ts:1-52` | `show\|validate`; provenance M5 |
| First-run | `orchestrator/src/v3/evolve-shell/first-run-setup.ts` | Handles ON/OFF; FreeLLM probe |
| Profile | `profiles/default.yaml:6-26` | `knowledge.backend: wiki`; `memory.enabled: false`; handles OFF |

Grupos runtime/legado (amostra em `evolve.ts`): `daemon`, `delivery`, `harness`, `circuit`, `goal`, `work`, `task`, `continuity`, `adapters`, `models`, `budget`, `recovery`, …

---

## 3. Módulos core (fronteiras)

### 3.1 StateDb (SQLite WAL)

- Path: `orchestrator/src/v3/state-db/`
- Schema: `schema.ts:1-7` (WAL + `synchronous=FULL`); versão `"6"` em `schema.ts:233`
- Recusa `:memory:`: `store.ts:75-90` (`DISK_REQUIRED`)
- Tabelas: `goal_contracts`, `token_ledger`, `circuit_runs`, `workspace_leases`, `mso_sessions`/`mso_transitions`, `outbox`, `task_graph_nodes`, `inbox_messages`, `work_ledger_entries`, `goal_documents`, `events`, `task_substates`, `evidence_records`
- API: contratos, MSO, leases/fencing, outbox, evidence upsert/list, ledger, events

**Fronteira:** persistência transacional “dura” do workspace; não é o store de Agent instances (isso é JSON).

### 3.2 Data-dir JSON (`V3DataPaths`)

```8:53:orchestrator/src/v3/paths.ts
export interface V3DataPaths {
  root; goalContractsDir; taskGraphsDir; agentsDir; ...
  approvalsDir; processSessionsDir; workspacesDir; ...
}
```

**Fronteira:** artefactos por `work_id` / ficheiros append-only; sobrevive a fecho da TUI (`coordinator/types.ts` nota explícita).

### 3.3 Goal Contract + TaskGraph + Work state

- `goal-contract/types.ts`: `WorkState`, `TaskState`, `AcceptanceCriterion` — **não** há `interface Work`
- `task-graph/types.ts:17-47`: `OrchestrationTask` com `work_id`, `owner_agent_id`, `evidence_ids`
- Produto V4.1: Task UX = fachada sobre Goal Contract (ADR Q2) — IDs internos intactos

### 3.4 Agent Registry + Continuity

- `agent-registry/types.ts:4-86`: `AgentRecord`, `AgentState` incl. `REPLACED`, `provider_id`/`model_id` opcionais
- Store: `agents/{work_id}.json`
- Continuity: `HandoffPackage` (`continuity/types.ts:17-59`) — session limit ≠ task terminal; **não** copia transcripts privados

### 3.5 Agent Handles (UX)

- Fachada sobre `AgentRecord`; preferência default OFF (`profiles/default.yaml:24-26`)
- Attach exact `agent_id` ↔ `ProcessSession` (`agent-handles/attach.ts`); close viewer ≠ kill
- Docs: `docs/v4/V4.1/agent-handles.md`; ADR Q3

### 3.6 ProcessSession + Adapters + Lifecycle

- `ProcessSessionRecord` (`adapters/drivers/process-sessions.ts:21-50`): `work_id`, `task_id`, `adapter_id`, `agent_id?`, PID/pgid/`starttime` fence
- CLI driver dry-run vs real + consent (`cli-process.ts:1-5`, `96-119`)
- Lifecycle WIP remediação: `lifecycle/run-controls.ts` — pause/resume/cancel com fence; `no_live_targets` honesto
- Harness facade: `harness/runtime.ts:1-4`, `execution_path` ∈ `real_eligible|dry_run|probe_only|blocked` (`:60-71`)

### 3.7 ExecutionRunner

- `execution-runner/types.ts`: port sync/async; status `ok|timeout|failed|cancelled|blocked`
- HOME efémero por run (não é persistência de Work)

### 3.8 Approvals + Delivery + Evidence

- Approvals: JSON + `ApprovalFacade` (ADR Q4)
- Delivery status/provenance: `cli/tui/delivery-status.ts:6-22` — `PASS|ATTESTED|…`; provenance `local_execution|external_attestation|absent|invalid|stale`
- Evidence: dual — ficheiros `evaluation/evidence` + linhas `EvidenceRecordRow` no StateDb
- **GAP:** sem `interface Delivery` / store de produto “Delivery aggregate” aparte da derivação a partir de evidence

### 3.9 Models / FreeLLMAPI / MCP

- FreeLLMAPI: `model-providers/freellmapi.ts` — `ModelProvider`, `provider_id = "freellmapi"`
- MCP: action `mcp.invoke` em security (`security/types.ts`); catalog adapter `mcp` level `"unknown"` — Core **não** inventaria sessões Cursor
- **GAP:** ACP (Agent Client Protocol) — **0** matches em `orchestrator/`

---

## 4. Fronteiras explícitas (o que NÃO atravessa)

| De | Para | Regra actual |
|----|------|--------------|
| Agent Handle viewer | Processo OS | Fechar ≠ kill |
| Agent morte / REPLACED | Task/Work state | Continuity preserva `verified_task_state` |
| ModelProvider | AgentRecord | Campos `provider_id`/`model_id` no registo; providers são stack separada |
| Host MCP | Core | Honesty `unknown`; não mediado |
| Dry-run harness | Rede/processo real | Sem `EVOLVELOOP_HARNESS_CONSENT` + mode real |
| TUI close | CoordinatorState | Ficheiro persiste |

---

## 5. Persistente vs efémero (resumo)

**Persiste:** StateDb; data-dir (agents, handoffs, ledger, evidence, process-session *records*, approvals, coordinator); stdout/stderr file-backed de harness spawn.

**Efêmero:** transcript privado do modelo; PID vivo; `ephemeral_home` do runner; viewer TTY; inventário MCP do host.

---

## 6. Docs V4 como mapa de produto (não de runtime)

| Fase | Foco | Path |
|------|------|------|
| V4.0 Identity | Task · Orchestrator · Delivery; CLI-first | `docs/v4/V4.0/` |
| V4.1 Experience | Handles, Task fachada, Approval facade, Delivery copy | `docs/v4/V4.1/` |
| V4.2 Operational | Prefs / validate / history | `docs/v4/V4.2/` |
| V4.3 + REMED | Consolidation; pause/ProcessSession/provenance | `docs/v4/V4.3/`, `remediation/gate-report.md` |

Veredito V4.3/REMED: **liberar com ressalvas** (humano N=0; TTY LIMITATION; wiki pack ausente) — não é baseline “limpo” para V5.
