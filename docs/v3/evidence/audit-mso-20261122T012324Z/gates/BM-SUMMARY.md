# BM-SUMMARY — BM-01..10 (de evidência AUD-* existente)

**UTC:** 2026-11-22T02:28:30Z  
**Evidence root:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Policy:** só citar métricas já presentes em AUD-*/EXIT-*; sem inventar.

| ID | Status | Fonte principal |
|----|--------|-----------------|
| BM-01 | PASS (estimated) | AUD-TOK-02 75.54% |
| BM-02 | PASS | AUD-TOK-03 O(1) |
| BM-03 | PARTIAL | AUD-TOK-04 cache_hit 80%; format=json 100/100; GBNF decoder not live |
| BM-04 | PASS | AUD-TOK-05 |
| BM-05 | PASS | AUD-SEC-01..03,05 |
| BM-06 | PASS | AUD-SEC-06 + AUD-STUB-04 |
| BM-07 | PASS | AUD-ORCH-04/06 |
| BM-08 | PASS | AUD-MEM-04 |
| BM-09 | PASS (honesty) | AUD-MEM-05/06 + EXIT-03 100k |
| BM-10 | PASS | AUD-UX-01 live (pass@1=0.875; pass³=1.0; 8 tasks) |

**Overall BM suite:** PARTIAL (BM-03 PARTIAL — GBNF live gap; BM-10 PASS)
