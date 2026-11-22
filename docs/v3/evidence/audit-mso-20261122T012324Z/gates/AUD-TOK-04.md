# AUD-TOK-04 — outline/read_lines + cache_hit ≥70%

**Status:** PASS  
**UTC:** 2026-11-22T02:04:04Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3  
**BM overlap:** BM cache_hit / context slicing

## Escopo

Economia via `outlineFile`+`readLines` (sem `read_file` irrestrito).  
`cache_hit` ≥70% **se mensurável**; senão gap honesto.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| A1 | `engineering/workspace.ts:5,82-106` | **REAL** | Agent reads = outline+readLines; unrestricted deny. |
| A2 | `token-economy/context-slicing.ts` | **REAL** | Cap readLines; vitest 7/7. |
| A3 | V1 context_slicing | **REAL** | reduction **98.41%** estimated (full vs outline+lines). |
| A4 | V1 prefix_pinning | **REAL** | cache_hits 4/5 turns = **80%** ≥70%; after warm 4/4=100%. Honesty: simulated identical prefix (KV-cache concept). |

## Cache_hit (mensurável)

De `metrics.json` techniques.prefix_pinning:

- rate_all_turns = 0.80 (≥0.70)
- rate_after_turn1 = 1.00
- honesty notes: "simulated identical prefix hashes"

Artefacto: `gates/AUD-TOK-v1-snapshot.json` → `prefix_pinning_cache_hit`.

## Veredito

**PASS** — slicing REAL + cache_hit 80% mensurável (**estimated**/simulado pin hash; não billing KV real).
