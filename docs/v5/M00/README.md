# V5 Meta 00 — Architecture Discovery & Blueprint

**Status:** COMPLETE (documentação apenas; **sem** implementação de runtime V5)  
**Data (UTC):** 2026-11-22T21:18:59Z  
**Repo HEAD:** `53ad05911118408d48f334bf991fb299e7c2d5b2`  
**WIP pré-existente:** ~62 ficheiros de remediação V4.3 — **preservados** (não tocados neste Meta)  
**Tese estratégica (utilizador):** *Agents replaceable / Work persistent*

---

## Escopo deste Meta

| Permitido | Proibido |
|-----------|----------|
| Descoberta de arquitetura atual | Reescrita estrutural V5 |
| Blueprint / ADRs / roadmap | Persistent Work Runtime, SDK, Agent Studio |
| Citar código com path:linha | Inventar componentes inexistentes |
| Declarar **GAP** | Apagar WIP; enfraquecer testes; `git push` |

---

## Índice dos entregáveis

| # | Ficheiro | Conteúdo |
|---|----------|----------|
| 1 | [architecture-map.md](./architecture-map.md) | Mapa da arquitetura atual (módulos, fronteiras) |
| 2 | [current-state-assessment.md](./current-state-assessment.md) | Reutilizar / inadequado / gaps vs tese V5 |
| 3 | [v5-architecture-blueprint.md](./v5-architecture-blueprint.md) | Arquitetura-alvo (core / adapters / runtime / extensions) — **não** implementar |
| 4 | [domain-model.md](./domain-model.md) | Work, Task, Attempt, Agent, Session, Evidence, Delivery, Workspace |
| 5 | [component-dependency-map.md](./component-dependency-map.md) | Dependências entre componentes atuais |
| 6 | [integration-strategy.md](./integration-strategy.md) | Harness mode vs native; ACP/CLI/MCP/API (não equivaler) |
| 7 | [migration-strategy.md](./migration-strategy.md) | V4→V5 compatibilidade |
| 8 | [adr/](./adr/) | ADRs (Work-first, agent≠model, harness vs native, MCP≠ACP, capability honesty) |
| 9 | [implementation-roadmap.md](./implementation-roadmap.md) | Meta 01–10 + dependências |
| 10 | [dependency-matrix.md](./dependency-matrix.md) | Matriz Meta × componentes × riscos |
| 11 | [risk-register.md](./risk-register.md) | Riscos e mitigações |
| 12 | [validation-plan.md](./validation-plan.md) | Gates A–J — critérios verificáveis (sem fingir PASS) |
| 13 | Este README | Índice + estado Meta 00 |

### ADRs

| ADR | Título |
|-----|--------|
| [ADR-001](./adr/ADR-001-work-first.md) | Work-first (Work persistente; Agent substituível) |
| [ADR-002](./adr/ADR-002-agent-ne-model.md) | Agent ≠ Model |
| [ADR-003](./adr/ADR-003-harness-vs-native.md) | Harness mode vs Native mode |
| [ADR-004](./adr/ADR-004-mcp-ne-acp.md) | MCP ≠ ACP ≠ CLI ≠ API |
| [ADR-005](./adr/ADR-005-capability-honesty.md) | Capability honesty (sem PASS forjado) |

---

## Fontes usadas

### Código (obrigatório)

- `orchestrator/src/v3/state-db/`, `adapters/`, `agent-handles/`, `lifecycle/`, `execution-runner/`
- `approvals/`, `continuity/`, `work-ledger/`, `agent-registry/`, `harness/`, `model-providers/freellmapi.ts`
- `orchestrator/src/cli/evolve.ts`, `delivery-surface.ts`, `tui/delivery-*.ts`
- `profiles/default.yaml`, `AGENTS.md`, `README.md`

### Docs V4

- Identity V4.0 · Experience V4.1 · Operational V4.2 · Consolidation + Remediation V4.3

### Wiki

```
PACK_NOT_FOUND: EvolveLoop
GAP: no_hits (search architecture/state-db/…)
```

**Precedência:** código verificado > docs V4 > wiki (ausente). Contrato inventado = **GAP**.

### Documento estratégico V5

Texto completo **não** encontrado no repo nem nos transcripts além da tese nomeada e deste brief M00.  
**GAP-DOC-V5:** blueprint assume a tese *Agents replaceable / Work persistent* + ADRs pedidos; se existir documento externo mais detalhado, Meta 00 deve ser reconciliado sem reescrever runtime.

---

## Estado Meta 00

| Critério | Estado |
|----------|--------|
| Pasta `docs/v5/M00/` criada | DONE |
| 13 entregáveis + ≥5 ADRs | DONE |
| Zero alteração estrutural de runtime V5 neste Meta | DONE (só `docs/v5/**` + eventual wiki log) |
| WIP remediação V4 preservado | DONE |
| Meta 01+ código | **NÃO iniciado** |
