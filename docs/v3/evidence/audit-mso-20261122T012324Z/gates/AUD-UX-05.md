# AUD-UX-05 — Shadow Replay 3 candidatos + Decision Engine

**Status:** PASS  
**UTC:** 2026-11-22T02:11:06Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Shadow Replay: 1 benéfico / 1 neutro / 1 regressão → só benéfico promove; Decision Engine 0% invenção + calibração + abstenção.

## Achados

| ID | Prova | Resultado |
|----|-------|-----------|
| S1 | `v3-evol-01-shadow-replay.test.ts` (7) | **PASS** — 3 candidatos; promote gated |
| S2 | Prior EXIT-03 / EVOL-01 | promote rejeitado sem Shadow Replay pass |
| D1 | `v2-int-02-laya-benchmark.test.ts` (8) | offline 0% invention |
| D2 | `v2-int-02-live-laya.test.ts` LIVE | `INT02_STATUS=PASS_LIVE`; invention_baseline=0; invention_candidate=0; calibration_*=true; case_count=6; latency_mean_ms≈6980 |

Excerpt: `gates/AUD-UX-05-int02-excerpt.txt`

## Veredito

**PASS** — Shadow Replay 3 candidatos + Decision Engine live (Ollama) com invention=0 e calibração OK.
