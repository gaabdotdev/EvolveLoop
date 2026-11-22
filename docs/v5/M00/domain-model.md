# Domain Model V5 — mapeamento ao código atual + GAP

**Regra:** se não há tipo/store no código → **GAP**. Não inventar entidades “já implementadas”.

---

## 1. Diagrama de domínio-alvo

```text
Workspace
  └── Work  (âncora persistente)          [GAP produto / parcial infra]
        ├── Task*                         [parcial — OrchestrationTask + UX Goal Contract]
        │     └── Attempt*                [GAP domínio]
        │           └── Agent? (executor) [AgentRecord]
        ├── Session views                 [GAP unificado; 3 tipos hoje]
        ├── Evidence*                     [presente — dual store]
        └── Delivery (projection)         [GAP entity; status/provenance presentes]
```

`*` = cardinalidade 0..n

---

## 2. Entidade a entidade

### 2.1 Work

| | |
|--|--|
| **Definição V5** | Unidade persistente de esforço coordenado; sobrevive a Agents e UI |
| **Código atual** | `WorkState` (`goal-contract/types.ts:24-31`); `CoordinatorWorkRecord` (`coordinator/types.ts:9-18`); `WorkLedgerEntry` (`work-ledger/types.ts`); colunas/`work_id` em StateDb |
| **Tipo canónico `Work` / `interface Work`** | **GAP** |
| **Produto V4** | Work é interno; Task é a unidade UX (ADR Q2) |
| **Persistência** | Parcial — IDs + state + ledger + coordinator `works[]` |
| **Notas** | Infra alinhável a Work-first; falta aggregate + API PWR |

### 2.2 Task

| | |
|--|--|
| **Definição V5** | Unidade de trabalho planeável sob um Work (grafo, owner, critérios) |
| **Código atual** | `OrchestrationTask` (`task-graph/types.ts:17-47`); `TaskState` (`goal-contract/types.ts:15-22`); Task UX = Goal Contract (ADR Q2) |
| **GAP** | Nome “Task” sobrecarregado (produto vs nó TaskGraph vs painel legado `work_id`) |
| **Persistência** | TaskGraph JSON + projeção `task_graph_nodes` / `task_substates` no StateDb |

### 2.3 Attempt

| | |
|--|--|
| **Definição V5** | Uma tentativa concreta de um Agent (ou native run) sobre uma Task; substituível |
| **Código atual** | `FailedAttemptRecord` em token-economy (orçamento) — **não** é domínio Attempt |
| **Tipo domínio Attempt** | **GAP** |
| **Próximo vizinho** | ProcessSession por task; AgentRecord heartbeat; ExecutionRunnerResult efémero |

### 2.4 Agent

| | |
|--|--|
| **Definição V5** | Executor substituível ligado a Work/Task; ≠ Model |
| **Código atual** | `AgentRecord` (`agent-registry/types.ts:59-86`); estados incl. `REPLACED` |
| **GAP** | Nenhum para existência; GAP de “Agent Runtime” formal e Attempt binding |
| **Persistência** | `agents/{work_id}.json` |
| **Handles** | UX opcional (`agent-handles/`); default OFF |

### 2.5 Session

| | |
|--|--|
| **Definição V5** | Contexto de execução observável (orquestração e/ou OS) |
| **Código atual (3)** | (1) `MsoSession` StateDb (`state-db/types.ts:138-148`); (2) `ProcessSessionRecord` (`process-sessions.ts:29-50`); (3) `AgentRecord.session_id` |
| **Tipo único Session** | **GAP** |
| **Produto V4** | Session ≈ fases MSO traduzidas (ADR Q2) |

### 2.6 Evidence

| | |
|--|--|
| **Definição V5** | Prova verificável ligada a Work/Task/Delivery |
| **Código atual** | `EvidenceRecordRow` + status `VALID\|STALE\|INVALID` (`state-db/types.ts:224-237`); evidence JSON em data-dir; `evidence_ids` em Task/Handoff/Criteria |
| **GAP** | Dualidade JSON+SQLite; API unificada de produto |
| **Delivery link** | kind `delivery_verification` em `delivery-verify.ts` |

### 2.7 Delivery

| | |
|--|--|
| **Definição V5** | Resultado aceitável do Work/Task com alterações + verificação + limitações |
| **Código atual** | `DeliveryStatus`, `DeliveryEvidenceProvenance`, `DeliveryVerification` (`delivery-status.ts:6-41`); superfícies CLI/TUI |
| **`interface Delivery` store** | **GAP** (view/derivação, não aggregate) |
| **Regra honesty** | PASS só `local_execution` + exit 0; attestation → ATTESTED ≠ PASS; absent → UNVERIFIED |
| **Vizinho** | `DelegationContract.deliverables: string[]` — não é Delivery de produto |

### 2.8 Workspace

| | |
|--|--|
| **Definição V5** | Âmbito FS/projeto onde Works vivem |
| **Código atual** | `WorkspaceLease` (StateDb); `WorkspaceIntegrationRecord`; `EngineeringWorkspace`; path workspaceRoot; ambiguidade CLI `workspace` (taxonomy V4.2) |
| **Tipo único Workspace produto** | **GAP** |
| **Persistência** | Lease + dirs; não um aggregate “Workspace document” |

---

## 3. Matriz rápida

| Entidade V5 | Presente? | Path principal | GAP? |
|-------------|-----------|----------------|------|
| Work | Infra parcial | `goal-contract`, `coordinator`, `work-ledger` | **GAP** tipo/produto |
| Task | Sim (duplo sentido) | `task-graph`, ADR Q2 | Sobrecarga semântica |
| Attempt | Não (domínio) | token-economy only | **GAP** |
| Agent | Sim | `agent-registry` | — |
| Session | Parcial (3 tipos) | state-db / process-sessions / agent | **GAP** unificado |
| Evidence | Sim (dual) | state-db + evidence dir | Unificação |
| Delivery | Status/provenance | `cli/tui/delivery-*` | **GAP** entity |
| Workspace | Conceitos múltiplos | lease / integration / engineering | **GAP** unificado |

---

## 4. Relações críticas (tese)

1. **Work 1—\* Agent** — Agents attached; replace não apaga Work (`REPLACED` + Handoff).  
2. **Task 1—\* Attempt** — **GAP**; hoje Task → owner Agent + ProcessSessions.  
3. **Attempt 0..1 Agent** — Attempt pode ser native run sem Agent Handle.  
4. **Evidence \*— Work/Task** — presente via IDs.  
5. **Delivery ← Evidence** — derivação actual; aggregate futuro opcional.  
6. **Agent.provider_id / model_id** — ligação a Model **sem** confundir identidades (ADR-002).

---

## 5. Palavras-chave

`GAP` · `Work-first` · `HandoffPackage` · `OrchestrationTask` · `DeliveryEvidenceProvenance` · `ProcessSessionRecord` · `MsoSession`
