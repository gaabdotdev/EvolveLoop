# Current State Assessment — vs tese V5

**Tese:** *Agents replaceable / Work persistent*  
**HEAD:** `53ad05911118408d48f334bf991fb299e7c2d5b2`  
**WIP:** remediação V4.3 (~62 ficheiros) — tratar como baseline operacional parcial, **não** apagar.

---

## 1. Síntese

O sistema atual já trata o **Agent como substituível** em vários caminhos (estado `REPLACED`, HandoffPackage, Handles históricos). O **Work** existe como `work_id` + `WorkState` + ledger/coordinator, mas **não** como âncora de produto V5: a UX V4.1 fixou **Task = fachada de Goal Contract** (ADR Q2), deixando Work interno.

Conclusão: há **fundação reutilizável** para Work-first; falta um **Persistent Work Runtime** explícito e um domínio unificado (Attempt, Delivery store, Session única). **Não** justificar reescrita — evoluir com compatibilidade V4.

---

## 2. Reutilizar (alto valor)

| Activo | Evidência | Porquê para V5 |
|--------|-----------|----------------|
| StateDb WAL + schema v6 | `state-db/schema.ts`, `store.ts` | Persistência dura; leases/fencing; evidence rows |
| `work_id` em TaskGraph / Agent / Session process | `task-graph/types.ts`, `agent-registry/types.ts`, `process-sessions.ts` | Âncora latente de Work |
| Continuity + `REPLACED` | `continuity/types.ts:1-4`, `AgentState` | Tese “agents replaceable” parcialmente materializada |
| ProcessSession + lifecycle fence | `process-sessions.ts`, `lifecycle/run-controls.ts` | Controlo OS sem bare PID |
| Adapter capability matrix honesty | `adapters/catalog.ts` (`mcp: unknown`, etc.) | Base ADR capability honesty |
| Harness dry-run / consent | `cli-process.ts`, `harness/runtime.ts:60-71` | Harness mode sem mentir “real” |
| Delivery provenance M5 | `delivery-status.ts:6-22`, `delivery-surface.ts:1-5` | PASS só com `local_execution` |
| FreeLLMAPI como ModelProvider | `freellmapi.ts` | Separação Agent ≠ Model já possível |
| Agent Handles OFF default | `profiles/default.yaml:24-26` | Complexidade progressiva; viewer ≠ lifecycle |
| Work Ledger append-only | `work-ledger/types.ts` | Histórico operacional por work |
| Approvals facade | ADR Q4 + `approvals/` | Controlo humano sem migrar consent já |
| Testes REMED M1–M6 | `docs/v4/V4.3/remediation/gate-report.md` | Barreira de regressão a preservar |

---

## 3. Inadequado / frágil para Work-first (sem apagar)

| Área | Problema | Evidência |
|------|----------|-----------|
| Unidade de produto = Task/Goal | Contradiz Work-first V5 se promovido sem migração | ADR Q2 `docs/v4/V4.1/adr/Q2-task-entity.md:16-24` |
| Dual persistence (SQLite + JSON) | Dois “sistemas de verdade”; risco de drift | `state-db/` vs `paths.ts` |
| Sem `interface Work` / Attempt | Domínio V5 incompleto | Ver `domain-model.md` |
| Delivery derivada, não entidade | Re-derivar de evidence; histórico frágil | `delivery-verify.ts`; L-DELIVERY-ATTEST |
| Session polissémica | MSO session ≠ ProcessSession ≠ `agent.session_id` | Três tipos distintos |
| MCP host-only | Capability sem mediação Core | catalog `mcp` unknown |
| ACP inexistente | Não há protocolo cliente-agente unificado | GAP (0 matches) |
| Journey-map V4.1 § Handles | Doc desatualizado vs implementação | `journey-map-current-vs-target.md` vs `agent-handles.md` |
| Credenciais dual-home | L-CREDS / deferred D1 | `first-run-setup.ts` notes; V4.3 deferred |
| Wiki pack EvolveLoop | Grounding institucional falha | `PACK_NOT_FOUND`; L-WIKI |
| Usabilidade humana N=0 | Gate V4 “limpo” impossível | remediation gate-report §1 |

---

## 4. Gaps vs tese V5 (checklist)

| Gap ID | Descrição | Bloqueia Meta |
|--------|-----------|---------------|
| **GAP-WORK** | Sem entidade de produto `Work` persistente canónica | M01 |
| **GAP-ATTEMPT** | Sem Attempt de domínio (só `FailedAttemptRecord` em token budget) | M02 |
| **GAP-PWR** | Persistent Work Runtime (API/serviço) não existe — **não implementar em M00** | M01+ |
| **GAP-DELIVERY-ENTITY** | Delivery = view/status, não aggregate store | M05 |
| **GAP-SESSION-UNIFY** | Três “sessions” sem tipo unificado | M07 |
| **GAP-WORKSPACE-TYPE** | Lease / integration / engineering workspace — sem `Workspace` produto único | M07 |
| **GAP-ACP** | ACP ausente | M06 |
| **GAP-MCP-BRIDGE** | Sem bridge MCP Core-mediated | M06 (opcional; honesty first) |
| **GAP-DOC-V5** | Documento estratégico completo não no repo | Reconciliar docs |
| **GAP-WIKI-PACK** | Pack EvolveLoop ausente | Ops / grounding |
| **GAP-PROFILE-AGENTS** | Sem chave `agents:` em `profiles/default.yaml` | Config V5 |

---

## 5. Alinhamento parcial com a tese

### Agents replaceable — **parcialmente SIM**

- Estados `REPLACED` / `replace_of` / `replaced_by` em `AgentRecord`
- Handoff sem rewind de `verified_task_state`
- Handles: `historical` / close ≠ kill
- Cross-provider swap automático: catalog marca `cross_provider_swap: unsupported` — honesty OK, capacidade limitada

### Work persistent — **parcialmente SIM (infra), NÃO (produto)**

- Infra: `work_id` em quase tudo; coordinator `works[]`; ledger; StateDb
- Produto: utilizador pensa em Task (V4); Work não é a âncora UX
- Morte do Agent ≠ morte do Work **em continuity**, mas sem API “Work Runtime” explícita

---

## 6. Postura recomendada (só blueprint)

1. **Não** reescrever StateDb / adapters / Handles em big-bang.  
2. Introduzir Work-first como **camada de domínio + projeções** sobre stores existentes (Meta 01).  
3. Manter honesty de harness/MCP/Delivery como lei (ADRs 003–005).  
4. Tratar WIP REMED como **activo** a mergear/estabilizar antes de runtime V5 grande.  
5. Declarar sempre GAP quando o código não tiver a entidade — nunca inventar no blueprint como “já existe”.
