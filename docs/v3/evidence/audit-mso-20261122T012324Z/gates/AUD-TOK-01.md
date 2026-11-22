# AUD-TOK-01 — Token Ledger vs providers (sem 0 silencioso)

**Status:** PASS  
**UTC:** 2026-11-22T02:04:04Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3  
**BM overlap:** honestidade de métricas (reported|estimated|UNAVAILABLE)

## Escopo

Reconciliar Token Ledger SQLite com resultados de providers.  
`UNAVAILABLE`/`estimated` nunca devem virar `0` silencioso de tokens.

## Wiki grounding

- Pack EvolveLoop: **PACK_NOT_FOUND** (GAP).
- Scout token ledger: hits fora do domínio EvolveLoop.
- Precedência: código verificado + probes neste repo.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| A1 | `freellmapi.ts:250-268` HTTP !ok | **REAL** | 401 → `cost_provenance=UNAVAILABLE`; sem `tokens_in/out` (ficam ausentes/null). |
| A2 | `cursor-adapter.ts:90-152` | **REAL** | Adapter Cursor: `tokens_*=null` + `UNAVAILABLE` em blocked/fail/ok sem usage. |
| A3 | `run-circuit.ts:250-330` | **REAL** | Offline/blocked/adapter: null + `UNAVAILABLE`; ledger copia provenance do adapter. |
| A4 | `state-db/store.ts:recordTokenLedger` | **REAL** | Persiste `?? null` — não coerces para 0. |
| A5 | Live probe FreeLLMAPI | **REAL** | catalog 401 `needsKey`; invoke `NEEDSKEY`; tokens null; ledger reconcile OK. |

## Provas

- `gates/AUD-TOK-freellmapi-probe.json` — live 401, `silent_zero=OK_NULL`
- `gates/AUD-TOK-ledger-reconcile.json` — provider↔SQLite match; `ok=true`
- Vitest: `v0-evidence-token-ledger`, `v1-prod-02-freellmapi`

## Veredito

**PASS** — FreeLLMAPI 401 classificado `UNAVAILABLE`/`needsKey` com tokens `null` (não 0). Ledger reconciliado com provider.
