# V5-M06 — Verification, Evidence & Delivery unification

**Status:** implementado (mínimo mas real)  
**Depende de:** M01 Work Runtime, Goal Contract, REMED-M5 delivery provenance  
**Tese:** Critérios avaliáveis; evidence read unificada; Delivery projection honest; verifier `local_command`

> **Nota vs roadmap M00:** o blueprint M00 rotulava M06 como “Integration Surfaces Honesty” (CLI/MCP/ACP). Este MSO entrega **Verification & Delivery**; honesty MCP stub está em M04; ACP continua LIMITATION (não fingir).

---

## Objectivo

Estender provenance M5 com API de produto: `evaluateWorkCriteria`, facade de evidence (incl. ignored stale/other-work), `getWorkDelivery`, e registry com native `local_command` + `CustomVerifier`.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| `evaluateWorkCriteria(workId)` | `verification/criteria.ts` (+ re-export work-runtime) | Goal Contract + evidence linkage StateDb |
| Evidence facade | `evidence-facade.ts` | `readWorkEvidenceProvenance` + `listIgnoredEvidenceForWork` |
| `getWorkDelivery(workId)` | `delivery-projection.ts` | PASS/FAIL/UNVERIFIED/ATTESTED/BLOCKED + provenance |
| Verifier registry | `verifier-registry.ts` | native `local_command` (wraps `validateDelivery`) + `CustomVerifier` |
| Paths | `verificationDir` | Aditivo |

## Fluxo

```text
evaluateWorkCriteria(workId)
  → Goal Contract criteria + evidence_ids ↔ StateDb links

getWorkDelivery(workId [, { run }])
  → projectDeliveryForWork / validateDelivery (REMED-M5)
  → status + provenance (nunca agent claim → PASS)

VerifierRegistry.run("local_command", { command })
  → validateDelivery({ run: command })  // delivery validate --run
  → may_contribute_to_pass só se local_execution && exit 0

readWorkEvidenceProvenance / listIgnoredEvidenceForWork
  → stale / other-work / association_mismatch em ignored[]
```

## Regras honesty (ADR-005 / REMED-M5)

- Agent claim **nunca** → PASS (`projectFromAgentClaim`)
- PASS só `local_execution` exit 0
- ATTESTED ≠ PASS
- Stale / other-work evidence ignorados (expostos na facade)
- `may_contribute_to_pass` ≠ Delivery PASS automático sem attach/projection

## Aceitação mínima

- [x] Verifier registry: `local_command` + `CustomVerifier`
- [x] evaluateWorkCriteria API + evidence linkage
- [x] getWorkDelivery API com statuses + provenance
- [x] Stale/other-work ignored via facade
- [x] Sem PASS forjado / sem local_execution

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m06-verification.test.ts \
  tests/unit/remed-m5-delivery-provenance.test.ts
```

## O que NÃO foi feito

- ACP server / full MCP host  
- Agent Studio / visual workflow / full SDK (M08/M09 fora de scope)  
- Rewrite dual evidence stores  
- Durable CustomVerifier plugin loader  
