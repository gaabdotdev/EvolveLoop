# AUD-MEM-05 — Cold storage scale sample + p95 (BM-09)

**Status:** PASS  
**UTC:** 2026-11-22T02:04:29Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Escala cold storage + p95. Brief permite amostra honesta +
`NÃO_HABILITADO` se 100k inviável nesta sessão.

## Honesty

| Marker | Valor |
|--------|-------|
| `COLD_SCALE_100K_THIS_SESSION` | **NÃO_HABILITADO** (`cold-storage.ts`) |
| Prior 100k | `docs/v3/evidence/20261122T005507Z/gates/EXIT-03.md` (SCALE_N=100000, meets_100k=true) |

## Amostra desta sessão (BM-09)

| Campo | Valor |
|-------|-------|
| sample_n | **500** |
| put_p95_ms | ~0.13–0.40 (medido no vitest; ver stdout em tests) |
| get_p95_ms | ~0.09–0.31 |
| Soft gate | p95 &lt; 200 ms |
| Roundtrip | SHA-256 CAS OK |

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| E1 | `ColdStorage` put/get Zstd+SHA-256 | **REAL** | Integrity mismatch rejeitado. |
| E2 | `migrateToCold` pointers | **REAL** | SQLite operacional sem raw payload. |
| E3 | EXIT-03 prior | **REAL** | 100k já evidenciado; não re-corrido aqui. |

## Veredito

**PASS** — amostra N=500 + p95 medido; 100k honestamente `NÃO_HABILITADO` nesta sessão com ponteiro a EXIT-03.
