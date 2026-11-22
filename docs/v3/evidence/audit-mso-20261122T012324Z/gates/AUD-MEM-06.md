# AUD-MEM-06 — Sanitização federada

**Status:** PASS  
**UTC:** 2026-11-22T02:04:29Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Promoção cross-project / global exige sanitize fail-closed
(`allow_federation=true`); secrets/paths/vars/domains → 0% leak.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| F1 | `federated-sanitize.ts` | **REAL** | strip defaults true; residual gate. |
| F2 | `promoteToGlobal` | **REAL** | Sem `allow_federation` → DENIED. |
| F3 | `v3-mem-07-federated-sanitize.test.ts` | **REAL** | 9 tests adversarial 0% leak. |
| F4 | `audit-mem-01-06` AUD-MEM-06 | **REAL** | Revalida deny + promote sanitized. |

## Veredito

**PASS** — sanitização federada fail-closed comprovada.
