# V3-SEC-02 Evidence — DLP egress no Credential Proxy (MSO M14)

- **ts:** 20261122T000323Z
- **task:** M14-V3-SEC-02-DLP-EGRESS (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T000323Z`
- **wiki grounding:** pack EvolveLoop/seagrass PACK_NOT_FOUND; scout/search sem hits V3-SEC-02 DLP. Contrato = brief MSO M14 + código V1/V2 credential-proxy + padrões secret do federated-sanitize (espelhados localmente).

## Implementação

| Peça | Path |
|------|------|
| DLP egress inspector | `orchestrator/src/v3/security/dlp-egress.ts` |
| CredentialProxy wiring | `orchestrator/src/v3/security/credential-proxy.ts` |
| Export security | `orchestrator/src/v3/security/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-sec-02-dlp-egress.test.ts` |

### Contrato mínimo fechado

- `inspectEgress({ body, headers })` → `DlpEgressDecision` com `verdict: ALLOW|BLOCK`
- Razões estáveis: `secret:<id>`, `proprietary_marker:<id>`
- Secrets: PEM, Bearer, sk/pk/rk, ghp_/github_pat_, Slack xox*, AKIA, AIza, ENV assignments
- Proprietary markers: PROPRIETARY, CONFIDENTIAL, INTERNAL ONLY, DO NOT DISTRIBUTE, TRADE SECRET, `//@proprietary`, SPDX Proprietary, Copyright All Rights Reserved, COMPANY CONFIDENTIAL
- `CredentialProxy.authorize` com `body`/`headers`: DLP após DomainPolicy/AdapterNet; BLOCK ⇒ sem `injected_headers`
- Sem body/headers: comportamento V2 preservado (DLP skipped)
- Preview truncado para audit; sem rede live

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-SEC-02 | `npx vitest run tests/unit/v3-sec-02-dlp-egress.test.ts` | **0** | `vitest-v3-sec-02.txt` / `.log` / `.exit` |
| Regressão SEC (v3-02 + v2-02 + v1-02 + v3-01 + v1-01) | `npx vitest run tests/unit/v3-sec-02-dlp-egress.test.ts tests/unit/v2-sec-02-credential-policies.test.ts tests/unit/v1-sec-02-credential-proxy.test.ts tests/unit/v3-sec-01-microvm.test.ts tests/unit/v1-sec-01-bwrap-wrapper.test.ts` | **0** | `vitest-regression-sec.txt` / `.exit` |

## STATUS

**PASS** (23/23 unit; 69/70 regression with 1 skipped; synthetic DLP only — no live egress claimed)
