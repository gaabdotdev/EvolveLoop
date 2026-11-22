# AUD-TOK-02 — Redução ≥75% vs baseline

**Status:** PASS  
**UTC:** 2026-11-22T02:04:04Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3  
**BM overlap:** BM redução ≥75% / V1-GATE-TOK / TOK_PAR

## Escopo

Se existir evidência reprodutível de redução ≥75% vs baseline V0 → PASS.  
Senão PARCIAL + gap honesto. Live LLM savings: nunca inventar.

## Evidência existente (não reinventada)

Fonte canónica: `docs/v1/evidence/gate-tok-20261121T210140Z/` (`latest` → mesmo).

| Campo | Valor | Honesty |
|-------|-------|---------|
| baseline_total (V0 combined) | 11630 | estimated (chars/4) |
| phase_total (V1 thin) | 2845 | estimated |
| reduction_pct | **75.54%** ≥ 75% | estimated |
| live_llm_savings | **UNAVAILABLE** | reported as gap |
| FreeLLMAPI / OpenRouter live | **UNAVAILABLE** | 401/offline |

Counterfactual sem crystallizer (audit-only, NÃO base de PASS): 61.40%.

Supplemental V2 TOK_PAR: min_reduction≈87.86% sob parallel=4 — estimated (`docs/v2/evidence/latest/gates/TOK_PAR.md`).

## Snapshot

`gates/AUD-TOK-v1-snapshot.json` → `combined_gate`.

## Veredito

**PASS** — evidência V1-GATE-TOK existe e mede 75.54% ≥75% (**estimated**).  
Live provider savings: **UNAVAILABLE** (FreeLLMAPI 401 neste host).
