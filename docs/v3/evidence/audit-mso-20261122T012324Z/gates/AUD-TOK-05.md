# AUD-TOK-05 — Zero-token routing · GBNF · speculative · skill-to-code

**Status:** PASS  
**UTC:** 2026-11-22T02:04:04Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3  
**BM overlap:** BM crystallizer / zero-token / speculative

## Escopo

1. Zero-token routing (status/pause/progress + local validate)  
2. GBNF constrained decoding — honest (`request_plumbing_only` se sem decoder live)  
3. Speculative pipeline (green local → skip layer 2)  
4. Skill-to-Code crystallizer → 0 tokens após N=3

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| Z1 | `grill-me/trivial-bypass.ts` + `local-validation.ts` | **REAL** | Regex+SQLite; tsc/test antes de LLM. Vitest V0-TOK-02. |
| G1 | `constrained-decoding.ts:40,58-78` | **REAL / HONEST** | `enforcement=request_plumbing_only`; nunca afirma live GBNF. |
| G2 | V1 constrained metrics | **REAL** | n=100 parse_failure=0%; ollama=`UNAVAILABLE_offline_grammar_validate_loop`. |
| S1 | `speculative-pipeline.ts` + vitest | **REAL** | green_local_path → layer2 nunca chamado. |
| S2 | V1 speculative_local_resolution | **REAL** | rate 0.8; honesty=estimated; fixture set not live LLM. |
| C1 | `crystallizer.ts:50,110` | **REAL** | 4ª corrida `zero_token_script` tokens_used=0. |
| C2 | V1 crystallizer | **REAL** | zero_token_proven=true (estimated proxy). |

## FreeLLMAPI

Live 401 → **UNAVAILABLE** para savings reportados por provider (ver TOK-01 probe). Não inventar métricas live.

## Veredito

**PASS** — zero-token routing, GBNF honesto (plumbing-only / ollama UNAVAILABLE), speculative (estimated fixtures), skill-to-code 0-token proven.
