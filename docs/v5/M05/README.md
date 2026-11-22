# V5-M05 — Human Governance

**Status:** implementado (mínimo mas real)  
**Depende de:** M04 Tool Freedom, Approvals store, lifecycle REMED-M2  
**Tese:** Policy JSON + `checkPolicy(action)` + approvals Work/Attempt + BudgetGuard fail-closed + AuditLog append-only

> **Nota vs roadmap M00:** o blueprint M00 rotulava M05 como “Evidence & Delivery”. Este MSO entrega **Human Governance**; Evidence/Delivery projection está em **M06** deste slice.

---

## Objectivo

Governança humana mínima: política scoped com `checkPolicy`, bridge de approvals a Work/Attempt, budget fail-closed, audit log, policy deny a bloquear tools (sobre M04), e wrapper fino de pause/resume/cancel que consulta policy antes de invocar REMED.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| PolicyStore JSON | `governance/policy-store.ts` | `checkPolicy(action)`; scopes `workspace` \| `work` (work > workspace) |
| BudgetGuard | `governance/budget-guard.ts` | tokens/attempts; `fail_closed_block` |
| AuditLog | `governance/audit-log.ts` | JSONL append-only |
| Approvals bridge | `approvals-bridge.ts` + `ApprovalFacade.create` | `work_id` + `attempt_id` |
| Tool policy | `tool-policy.ts` | policy deny → M04 `authorizeToolUse` |
| Lifecycle wrapper | `lifecycle-controls.ts` | `pauseOwnedRunsUnderPolicy` — reusa REMED-M2 |
| Compat shim | `human-governance/` | re-export de `governance/` |
| Paths | `governanceDir` | Aditivo |

## pause / resume / cancel (REMED-M2)

Já implementados e provados em `orchestrator/src/v3/lifecycle/run-controls.ts` (REMED-M2).  
M05 **não** cria segundo control plane: documenta + re-exporta + wrapper `*UnderPolicy` que chama `checkPolicy({ type: "lifecycle", control })` e só então invoca REMED. Se policy tem `deny_lifecycle_actions: ["pause"]`, o wrapper devolve `PolicyDenied` sem sinal OS.

## Aceitação mínima

- [x] PolicyStore JSON + `checkPolicy(action)`
- [x] Bridge Work/Attempt em approvals facade
- [x] Lifecycle REMED reutilizado + wrapper com policy gate
- [x] Policy deny bloqueia tool via tool-registry authorize
- [x] Budget exceeded fail-closed
- [x] Audit append-only com entry escrita

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m05-governance.test.ts \
  tests/unit/v5-m04-tool-registry.test.ts
```

## O que NÃO foi feito

- UI de policy editor / Agent Studio  
- Substituir capability-gate ou DelegationRegistry  
- Inventar tokens não medidos  
- Reimplementar pause/resume/cancel (proibido — reutilizar REMED)
