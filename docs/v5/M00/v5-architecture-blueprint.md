# V5 Architecture Blueprint (alvo — **não** implementar neste Meta)

**Tese:** *Agents replaceable / Work persistent* (Work-first)  
**Natureza:** especificação de arquitetura-alvo. Qualquer componente marcado **GAP** **não** existe hoje como descrito.  
**Proibido em M00:** Persistent Work Runtime, registries novos, SDK, Agent Studio, reescrita estrutural.

---

## 1. Princípios-alvo

1. **Work-first** — a unidade durável é o Work; Agents são workers substituíveis (ADR-001).
2. **Agent ≠ Model** — ModelProvider alimenta/estima; Agent é instância de execução com lifecycle (ADR-002).
3. **Harness mode ≠ Native mode** — caminhos distintos, honesty obrigatória (ADR-003).
4. **MCP ≠ ACP ≠ CLI ≠ API** — superfícies de integração não equivalentes (ADR-004).
5. **Capability honesty** — nunca forjar PASS / inventariar o que o Core não medeia (ADR-005).

---

## 2. Diagrama-alvo (lógico)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Extensions (opcional, tardio)                                     │
│  SDK · Agent Studio · plugins — GAP até Meta ≥09                  │
└───────────────────────────────┬──────────────────────────────────┘
                                │ consumes public contracts only
┌───────────────────────────────▼──────────────────────────────────┐
│ Surfaces                                                          │
│  CLI / TUI (V4 journey preserved) · API (GAP) · MCP host (partial)│
│  ACP client/server (GAP)                                          │
└───────────────────────────────┬──────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│ Runtime                                                           │
│  Persistent Work Runtime (GAP-PWR)                                │
│    Work · Task · Attempt · Evidence · Delivery projections        │
│  Agent Runtime — spawn/replace/handoff (evolui continuity atual)  │
│  Session Runtime — ProcessSession + MSO (unificar vista; GAP)     │
└───────────────┬─────────────────────────────┬────────────────────┘
                │                             │
┌───────────────▼──────────────┐  ┌───────────▼────────────────────┐
│ Core                         │  │ Adapters                       │
│  Domain services             │  │  Harness adapters (CLI process)│
│  Policy / Capability gate    │  │  Native executors (engine/shell)│
│  StateDb + Work projections  │  │  ModelProviders (≠ Agent)      │
│  Approvals / Continuity      │  │  MCP: honesty-first (não = ACP)│
└──────────────────────────────┘  └────────────────────────────────┘
```

---

## 3. Core

| Componente-alvo | Reutiliza hoje | GAP |
|-----------------|----------------|-----|
| Work aggregate | `work_id`, `WorkState`, `CoordinatorWorkRecord`, ledger | Tipo/produto `Work`; PWR API |
| Task (filho de Work) | `OrchestrationTask` + fachada Goal Contract (Q2) | Reconciliar UX Task vs Work-first sem partir V4 |
| Attempt | token `FailedAttemptRecord` apenas | Entidade Attempt por Agent/Task |
| Evidence service | StateDb `evidence_records` + JSON evidence | API única; statuses já existem |
| Delivery projection | `DeliveryStatus` + provenance M5 | Aggregate Delivery opcional |
| Policy / capability | `security/capability-gate.ts`, profiles | Manter honesty; não fingir MCP mediado |
| Continuity | `HandoffPackage`, `REPLACED` | Formalizar “replaceability SLA” |

**Work-first:** Core **não** trata Agent como raiz de persistência. Fechar TUI / matar Agent / REPLACED **não** apaga Work.

---

## 4. Adapters

| Modo | Descrição-alvo | Base actual |
|------|----------------|-------------|
| **Harness mode** | Core spawna/supervisiona CLI de terceiros (Claude Code, Codex, …); dry-run default; consent para real | `cli-process.ts`, `harness/runtime.ts`, catalog |
| **Native mode** | Execução via ExecutionRunner / engine / deterministic providers sob mediação Core | `execution-runner/`, providers deterministic, sandbox |
| **Model adapters** | FreeLLMAPI, Ollama, OpenRouter — **não** são Agents | `model-providers/` |
| **Host IDE tools** | Cursor Task/MCP — inventário honesty `unknown`/`partial` | `adapters/catalog.ts` |

**GAP:** adapter ACP; bridge MCP Core-mediated; swap cross-provider automático (`unsupported` hoje).

---

## 5. Runtime

### 5.1 Persistent Work Runtime (**GAP** — Meta 01+)

Responsabilidades-alvo (especificação apenas):

- Abrir / pausar / retomar / cancelar **Work**
- Anexar Tasks / Attempts / Evidence / Delivery views
- Sobreviver a: exit TUI, morte Agent, restart CLI, replace Agent
- Expor leitura estável para history / delivery / handles

**Não** confundir com: JobStore legado, circuit run isolado, ou Intent efémero.

### 5.2 Agent Runtime (evolução)

- Partir de `AgentRegistry` + Continuity + lifecycle ProcessSession
- Contrato: Agent pode ser `REPLACED` sem invalidar Work/Task verificados
- Handles continuam **opcionais** (default OFF)

### 5.3 Session Runtime (vista unificada — **GAP**)

Vista de produto sobre:

- `MsoSession` (orquestração)
- `ProcessSessionRecord` (OS)
- `agent.session_id` (binding)

Sem fundir stores prematuramente — **projeção** primeiro.

---

## 6. Extensions (tardias)

| Extensão | Meta sugerido | Nota |
|----------|---------------|------|
| SDK público | ≥09 | Só após contratos Work/Attempt estáveis |
| Agent Studio | ≥09 | Fora de M00; não bloquear core |
| Plugins | existente parcial `plugins/` | Não expandir sem honesty |

---

## 7. Relação com V4 journey

V5 **não** descarta a jornada V4 (Workspace → Task → Plan → Approval → Delivery).  
Migração conceptual:

| V4 produto | V5 domínio | Nota |
|------------|------------|------|
| Task (fachada Goal Contract) | Task **dentro de** Work | Compat: Task continua label UX; Work torna-se âncora |
| Agent Handle | Agent + Session view | Sem mudança forçada de default OFF |
| Delivery cartão | Delivery projection + provenance | Manter regras M5 |
| Session (MSO) | Session view | Honestidade de fases |

Ver `migration-strategy.md`.

---

## 8. O que o blueprint **recusa**

- Equivaler MCP a ACP ou a “ter agente”
- Declarar harness `real_eligible` sem CLI + consent
- PASS sem `local_execution` (já lei V4.1/M5)
- Apagar stores V4 / WIP REMED para “limpar” V5
- Implementar PWR / SDK / Studio em Meta 00

---

## 9. Palavras-chave (indexação)

`Work-first` · `harness mode` · `native mode` · `GAP` · `MCP` · `ACP` · `capability honesty` · `Agents replaceable` · `Work persistent`
