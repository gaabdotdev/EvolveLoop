# SEC-02 — Credential Policies (domain + adapter + proxy)

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Políticas de credencial/domínio/adapter + SSRF deny
- **test_file:** `orchestrator/tests/unit/v2-sec-02-credential-policies.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-sec-02-credential-policies.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- DomainPolicy allow/deny; deny-by-default.
- AdapterSandboxProfile net/fs/env allowlist.
- CredentialProxy.authorize: inject headers só se allow; SSRF blocked; assertAuthorized throws.
- Sem regressão V1-SEC-02 `evaluateCredentialProxy`.

## LIMITATION

Políticas offline; não reexecuta bateria SSRF live de rede.
