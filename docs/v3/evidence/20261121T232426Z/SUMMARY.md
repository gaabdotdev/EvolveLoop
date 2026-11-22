# V3-MEM-07 Evidence — Federated Global Memory + Automatic Sanitization

- **ts:** 20261121T232426Z
- **task:** M7-V3-MEM-07-FEDERATED-SANITIZE (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T232426Z`
- **prereq V3-MEM-01..06:** PASS (regressão nesta pasta) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` exists. Search/scout CLI arg-order GAP. Contrato = brief MSO M7-V3-MEM-07 / META-WS-006 + padrões MEM-01..06.

## Implementação

| Peça | Path |
|------|------|
| Federated sanitize | `orchestrator/src/v3/memory/federated-sanitize.ts` |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-07-federated-sanitize.test.ts` |

### Contrato mínimo fechado

- `sanitizeForFederation(text, policy)`
  - strip determinístico: secrets (Bearer/sk/ghp/PEM/AKIA/…), paths (unix/win/fileURI/rel/.env), private vars (`process.env`, `PRIVATE_*`, `export KEY=`), domains (URL/email/FQDN)
  - canaries extras via `extra_canaries`
  - `leak_free` só se residual scan pós-sanitize = 0
- `promoteToGlobal(memory, policy)`
  - exige `allow_federation=true` e `source_project_id` ≠ `global`
  - sanitiza title/body/source/payload(+extras); recusa `RESIDUAL_LEAK_DETECTED` se residual
  - artefato global com `project_id: "global"`; remoções auditadas via fingerprint sha256 (0% raw leak no JSON)
- Fail-closed: strip_* default true; federation gate reescaneia **todas** categorias mesmo se strip desligado

### Cenários cobertos (adversariais)

1. Secrets + paths + private vars + domains → 0% leak
2. PEM + export env + relative/~ paths + canary → 0% leak
3. Residuals detectados em texto sujo
4. promote sem `allow_federation` → DENIED
5. promote sanitiza e aceita leak-free → scope global
6. `strip_paths=false` + path residual → REFUSE
7. `throwOnRefuse` → FederatedSanitizeError
8. defaults strip-all fail-closed
9. source already global → SOURCE_PROJECT_REQUIRED

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-07 | `npx vitest run tests/unit/v3-mem-07-federated-sanitize.test.ts` | **0** | `vitest-v3-mem-07.txt` / `.log` / `.exit` |
| Regressão MEM-01..06 | `npx vitest run tests/unit/v3-mem-0{1,2,3,4,5,6}*.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
