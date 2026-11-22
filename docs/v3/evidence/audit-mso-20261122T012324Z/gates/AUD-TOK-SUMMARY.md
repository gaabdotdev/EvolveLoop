# AUD-TOK-SUMMARY — AUD-TOK-01..05 (+ BM-01..04 overlap)

**UTC:** 2026-11-22T02:04:04Z  
**Evidence root:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Batch:** MSO AUD-TOK-BATCH tentativa 1/3  
**Overall:** PASS

## Per-meta

| ID | Status | Prova principal |
|----|--------|-----------------|
| AUD-TOK-01 | PASS | FreeLLMAPI 401→UNAVAILABLE/null; ledger reconcile OK |
| AUD-TOK-02 | PASS | V1-GATE-TOK 75.54% ≥75% (**estimated**); live_llm=UNAVAILABLE |
| AUD-TOK-03 | PASS | O(1) snapshot 5×1652 bytes estáveis |
| AUD-TOK-04 | PASS | outline/read_lines 98.41%; cache_hit 80% ≥70% |
| AUD-TOK-05 | PASS | zero-token + GBNF honest + speculative + crystallizer 0 |

## BM-01..04 overlap (mapeamento auditado)

| BM (overlap) | Meta AUD-TOK | Resultado |
|--------------|--------------|-----------|
| BM redução ≥75% | TOK-02 | PASS estimated 75.54% |
| BM O(1) snapshot | TOK-03 | PASS 5 iters |
| BM cache_hit ≥70% | TOK-04 | PASS 80% (pin simulado) |
| BM zero-token / crystallizer | TOK-05 | PASS tokens_used=0 path |

## FreeLLMAPI (host)

```
catalog.state=needsKey (HTTP 401)
invoke.code=NEEDSKEY
tokens_in/out=null
cost_provenance=UNAVAILABLE
silent_zero=OK_NULL
```

Artefactos: `AUD-TOK-freellmapi-probe.json`, `AUD-TOK-ledger-reconcile.json`.

## Vitest

Arquivo: `gates/AUD-TOK-tests.txt`

```
Test Files  10 passed (10)
Tests       52 passed (52)
EXIT_CODE=0
```

Suites: v0-evidence-token-ledger, v0-token-economy, v1-gate-tok, v1-context-slicing,
v1-stateless-snapshot, v1-crystallizer, v1-prefix-pinning, v1-constrained-decoding,
v1-speculative-pipeline, v1-prod-02-freellmapi.

## Honesty markers

- Redução V1: **estimated** (chars/4) — não billing provider
- live_llm_savings / OpenRouter / FreeLLMAPI live: **UNAVAILABLE**
- GBNF: `request_plumbing_only` + ollama offline validate loop
- cache_hit: pin hash idêntico simulado (conceito KV), não hit de API cobrada
- crystallizer 0-token: caminho de script local (tokens_used=0 explícito)

## Diffstat

`gates/AUD-TOK-diffstat.txt` — **sem edits em src neste batch** (auditoria + evidência).

## Wiki

- Pack EvolveLoop: PACK_NOT_FOUND; scout hits fora do domínio.
- **GAP:** contratos AUD-TOK não sintetizados na wiki; prova = código + evidências V1/V2 + probes.
- Precedência: código verificado > wiki.

## MSO_RESULT

MSO_RESULT: AUD-TOK-BATCH | STATUS: PASS
