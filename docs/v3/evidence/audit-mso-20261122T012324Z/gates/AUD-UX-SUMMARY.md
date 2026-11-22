# AUD-UX-SUMMARY — AUD-UX-01..06 (+ BM-10)

**UTC:** 2026-11-22T02:28:30Z  
**Evidence root:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Batch:** MSO AUD-UX-BATCH + recoveries (UX-01, UX-03)  
**Overall:** PARTIAL (UX-01/03 PASS; UX-06 ainda bloqueada)

## Per-meta

| ID | Status | Prova principal |
|----|--------|-----------------|
| AUD-UX-01 | PASS | 8 live tasks KernelBot+OrbitBot; pass@1=0.875; pass³=1.0 |
| AUD-UX-02 | PASS | Unit UX + timing sintético &lt;2min; 4 perguntas |
| AUD-UX-03 | PASS | Ollama embed+infer live + cursor-agent+agy live; FreeLLMAPI 401 UNAVAILABLE |
| AUD-UX-04 | PASS | 429→INFRA no-burn + cooldown (fault + UX line) |
| AUD-UX-05 | PASS | Shadow Replay 3 cand. + INT02 PASS_LIVE invention=0 |
| AUD-UX-06 | BLOQUEADA/PARTIAL | Dogfooding 7–14d **não** feito — nunca PASS |

## Vitest

Arquivo: `gates/AUD-UX-tests.txt`

```
Test Files  8 passed (8)
Tests       50 passed (50)
EXIT_CODE=0
```

## Honesty markers

- UX-01/BM-10: métricas live reais (OB-T3 fail@1 registado; sem inventar)
- FreeLLMAPI: HTTP 401 needsKey
- UX-06: BLOQUEADA até intervenção humana

## Diffstat

`gates/AUD-UX-diffstat.txt`

## Wiki

- GAP: contratos AUD-UX ausentes na wiki; prova = brief MSO + código + probes.
- Precedência: código verificado > wiki.

## MSO_RESULT

MSO_RESULT: AUD-UX-BATCH | STATUS: PARTIAL
