# AUD-SEC-02 — Zero-trust env + redação 100% secrets

**Status:** PASS  
**UTC:** 2026-11-22T01:54:28Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Garantir que o runner não herda API keys / HOME real, e que `redactSecrets`
remove canários e padrões de secret em logs/evidence.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| B1 | `execution-runner/runner.ts` `scrubEnv` | **REAL** | Allowlist estrita (`PATH`/`LANG`/`TERM` + HOME efémero). `AWS_SECRET_ACCESS_KEY` e HOME real não aparecem no stdout do filho. |
| B2 | `evidence/secret-redaction` `redactSecrets` | **REAL** | Canário `EVIDENCE_SECRET_CANARY` + `sk-…` → `REDACTED`. |
| B3 | Runner stdout path | **REAL** | Echo do canário no child → stdout já redigido. |

## Testes

- `security/audit-adversarial` V0-SEC-03 (env scrub + redaction + runner stdout)
- `evidence/secret-redaction.test.ts` (4 passed)

**EXIT_CODE=0** (batch `AUD-SEC-tests.txt`).

## Veredito

**PASS** — zero-trust env + redação determinística verificados.
