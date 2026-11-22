# Component Dependency Map (estado atual)

Dependências **observadas no código**. Setas: A → B significa “A usa / chama / persiste em B”.

---

## 1. Grafo resumido

```text
evolve.ts / TUI / REPL
  ├─→ evolve-shell / first-run-setup
  ├─→ agents-surface → agent-handles → agent-registry
  │                      └─→ process-sessions (exact agent_id)
  ├─→ delivery-surface → delivery-verify → StateDb.evidence_records
  ├─→ history / config prefs
  └─→ (legado) circuit, harness, continuity, work, task, …

MSO / Coordinator / Continuity
  ├─→ Goal Contract store / StateDb.goal_contracts
  ├─→ TaskGraph store / StateDb.task_graph_nodes
  ├─→ AgentRegistry
  ├─→ HandoffPackage (handoffsDir)
  └─→ Work Ledger (+ StateDb mirror)

lifecycle/run-controls
  └─→ ProcessSessionStore (pause/resume/cancel + starttime fence)

adapters
  ├─→ catalog (capability matrix)
  ├─→ drivers/cli-process → ProcessSessionStore
  └─→ harness/runtime → catalog + cli-probe + ProcessSessionStore

execution-runner
  └─→ sandbox / ephemeral_home (efémero)
  └─→ (opcional) onSpawned → ProcessSession

model-providers (FreeLLMAPI, Ollama, OpenRouter)
  └─→ (consumidos por circuit/shell/models CLI — ≠ AgentRegistry lifecycle)

security/capability-gate
  └─→ profiles (mcp.invoke require_approval)
```

---

## 2. Matriz de acoplamento

| Componente | Depende de | Dependido por | Acoplamento |
|------------|------------|---------------|-------------|
| StateDb | better-sqlite3 / FS path | delivery-verify, MSO, leases, evidence, history | **Alto** (núcleo) |
| V3DataPaths stores | FS data-dir | quase todo v3 | **Alto** |
| AgentRegistry | data-dir agents | Handles, Continuity, Task owner | **Alto** |
| ProcessSessionStore | data-dir | lifecycle, Handles attach, harness, cli-process | **Alto** |
| Continuity | AgentRegistry, Task state, evidence ids | replace flows | Médio |
| Agent Handles | Registry + ProcessSessions + prefs | CLI/TUI | Médio (opt-in) |
| Delivery view | StateDb evidence | CLI/TUI | Médio |
| Harness facade | catalog + drivers | CLI `harness` | Médio |
| ExecutionRunner | OS sandbox | native runs | Médio |
| FreeLLMAPI | HTTP local | freellm CLI, setup, HUD | Baixo–médio |
| MCP | policy only | — (sem runtime Core) | **Baixo** (honesty) |
| ACP | — | — | **Ausente (GAP)** |

---

## 3. Ciclos / riscos de dependência

| Risco | Descrição | Mitigação V5 |
|-------|-----------|--------------|
| Dual write SQLite↔JSON | Evidence / ledger / task graph em dois sítios | Projeções Work-first; uma API de leitura |
| Agent ↔ Session | `session_id` no Agent vs ProcessSession.agent_id | Exact bind (já); Session view unificada |
| TUI → React state vs StateDb | Historicamente divergiu (pause); REMED-M2 corrige caminho | Manter lifecycle como único caminho OS |
| Catalog honesty vs UI | UI pode “parecer” MCP-ready | ADR-005; nunca inventariar host MCP |

---

## 4. Fronteiras estáveis a preservar

1. **Handles → não → kill** (`agent-handles/attach.ts` contrato).  
2. **Handoff → não → private transcripts** (`continuity`).  
3. **Harness → dry-run sem consent**.  
4. **Delivery → não → PASS sem local_execution**.  
5. **StateDb → não → `:memory:`**.

---

## 5. Impacto se introduzir Persistent Work Runtime (futuro)

PWR (GAP) deveria depender de:

- StateDb + data-dir (leitura/escrita coordenada)
- Continuity / AgentRegistry (replace)
- Delivery/Evidence projections

**Não** deveria depender de:

- Ink TUI
- Agent Handles preference
- FreeLLMAPI reachability
- Host MCP sessions
