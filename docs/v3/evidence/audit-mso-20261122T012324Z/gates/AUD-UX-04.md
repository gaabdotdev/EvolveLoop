# AUD-UX-04 — Queda FreeLLMAPI / 429 → INFRA + cooldown

**Status:** PASS  
**UTC:** 2026-11-22T02:11:06Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Derrubar FreeLLMAPI / simular 429 no meio da tarefa → erro de Infra **sem** consumir contador de 3 tentativas; cooldown + fallback + checkpoint.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| F1 | `v1-gate-compat-fault.test.ts` | **REAL** | 429 → `INFRA_QUOTA`; no burn; cooldown; fallback. |
| F2 | `provider-fault.ts` + failover | **REAL** | Fault mapping FreeLLMAPI → INFRA. |
| F3 | `v0-ux-cli-interactions` fallback line | **REAL** | `⚠ Infra: FreeLLMAPI 429 (cooldown …) · 0/3 tentativas consumidas`. |
| F4 | Kill físico processo :3001 | **NÃO_FEITO** | Host FreeLLMAPI já 401; kill físico não executado nesta sessão. |

## Veredito

**PASS** — comportamento INFRA/cooldown/no-burn comprovado por fault injection + UX line. Kill físico do processo = NÃO_FEITO (honestidade).
