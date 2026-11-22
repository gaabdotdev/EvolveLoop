# V3-MEM-07 Evidence — Federated Global Memory + Automatic Sanitization

- **ts:** 20261121T232418Z
- **task:** M7-V3-MEM-07-FEDERATED-SANITIZE (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T232418Z`
- **prereq V3-MEM-01..06:** PASS (regressão nesta pasta) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; scout META-WS-006/federated sanitize → hits genéricos gaabwiki-memory (GAP). Contrato = brief MSO M7-V3-MEM-07 + padrões MEM-06 / `secret-redaction.ts`.

## Implementação

| Peça | Path |
|------|------|
| Federated sanitize | `orchestrator/src/v3/memory/federated-sanitize.ts` |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-07-federated-sanitize.test.ts` |

### Contrato mínimo fechado

- `sanitizeForFederation(text, policy)`
  - política explícita (`allow_federation`); strip defaults fail-closed (`secrets|paths|private_vars|domains = true`)
  - remoção determinística → `[REDACTED_SECRET|PATH|PRIVATE_VAR|DOMAIN]`
  - `leak_free` só com residual scan (gate) zerado
- `promoteToGlobal(memory, policy)`
  - recusa sem `allow_federation=true`
  - sanitiza title/body/source/payload; recusa se residual (`RESIDUAL_LEAK_DETECTED`)
  - escopo destino `project_id: "global"` + `source_project_id`
  - audit de removals no artefato global usa `sha256:` fingerprint (0% raw leak no JSON promovido)
- helpers: `detectFederationResiduals`, `assertLeakFree`, `fingerprintMatched`, `toSafeRemovals`

### Cenários cobertos (adversariais)

1. Secrets (Bearer/sk/ghp) + paths Unix/Windows + PRIVATE_API_KEY + domains/email → 0% leak
2. PEM + `export OPENAI_API_KEY` + `../.env` + `~/…/id_rsa` + canary → 0% leak
3. Residual detector flagra path/domain sujos
4. Promote sem política explícita → `FEDERATION_POLICY_DENIED`
5. Promote leak-free → `global` scope; surface JSON sem fragmentos sensíveis
6. `strip_paths:false` com path residual → promote recusado
7. `throwOnRefuse` → `FederatedSanitizeError`
8. Defaults strip-all; source já `global` recusado

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-07 | `npx vitest run tests/unit/v3-mem-07-federated-sanitize.test.ts` | **0** | `vitest-v3-mem-07.txt` / `.log` / `.exit` |
| Regressão MEM-01..06 | `npx vitest run tests/unit/v3-mem-0{1,2,3,4,5,6}*.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
