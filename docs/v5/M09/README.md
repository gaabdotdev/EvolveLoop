# V5-M09 — Agent Studio (slice — NOT full UI product)

**Status:** implementado (mínimo verificável)  
**Depende de:** M02 capability profiles, M04 tools, adapters catalog  
**Tese:** Config declarativa + team + workflow canónico único + validação capability-aware

> **Nota vs roadmap M00:** o blueprint M00 rotulava M09 como “Extensions Boundary” (agora M08 neste MSO). Este M09 entrega **Agent Studio declarative** sem UI visual.

---

## Objectivo

Permitir definir agentes, equipas e workflows em YAML/JSON sem secrets, com validação que rejeita claims de capacidades unsupported (ex.: pause).

## Entregas

| Item | Path | Notas |
|------|------|-------|
| Agent schema | `agent-studio/schema.ts` | name, adapter, model_ref, tools_allowlist, limits |
| load/save/import/export | `config-io.ts` | strip secrets |
| Team composition | `team.ts` | agents[] + roles JSON |
| Workflow model | `workflow.ts` | nodes, edges, approvals — ONE model; YAML load |
| Capability validation | `validate.ts` | pause → catalog `cancel`; reject if unsupported |
| Paths | `agentStudioDir` | Aditivo |

## Fluxo

```text
AgentConfig YAML
  → loadAgentConfig → stripSecrets
  → validateAgentConfigCapabilities(adapter profile)
  → reject if capabilities_claimed.pause && cancel unsupported

Workflow YAML
  → loadWorkflowYaml → WorkflowModel { nodes, edges, approvals }
  → no second visual engine
```

## Aceitação mínima

- [x] Schema agent YAML/JSON
- [x] load/save/import/export sem secrets
- [x] Team composition JSON
- [x] Workflow canónico único (YAML)
- [x] Reject unsupported pause claim
- [x] LIMITATION visual builder / marketplace

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m09-agent-studio.test.ts
```

## O que NÃO foi feito

- Visual workflow builder  
- Templates marketplace  
- Ink/Agent Studio UI product  
