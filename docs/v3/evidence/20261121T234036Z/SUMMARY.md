# V3-ORCH-03 Evidence — Orquestração Hierárquica Delimitada (Sub-MSOs)

- **ts:** 20261121T234036Z
- **task:** M10-V3-ORCH-03-SUB-MSO (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T234036Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` exists. Contrato = brief MSO M10-V3-ORCH-03.

## Implementação

| Peça | Path |
|------|------|
| spawnSubMso + enforce | `orchestrator/src/v3/mso/sub-mso.ts` |
| Exports MSO | `orchestrator/src/v3/mso/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-orch-03-sub-mso.test.ts` |

### Contrato mínimo fechado

- `spawnSubMso(parentCaps, budget, opts?)` → Sub-MSO **efêmera** com capabilities **atenuadas** (⊆ parent) e orçamento herdado
- Rejeita `CAPABILITY_ESCALATION` se `requested_caps` ∉ parent
- Rejeita `BUDGET_ESCALATION` se `max_tokens` > `parent_remaining_tokens`
- `enforceSpend` / `assertSpend` — rejeita `BUDGET_EXCEEDED` quando spend projetado > max_tokens (não muta em reject)
- `enforceCapability` / `assertCapability` — rejeita `CAPABILITY_NOT_DELEGATED` se fora do set atenuado
- `spawnNestedSubMso` — atenuação recursiva; orçamento ≤ remaining do pai
- `terminateSubMso` — bloqueia spend/capability posteriores (`TERMINATED`)

### Cenários cobertos

1. spawn com subset + budget herdado
2. spawn sem requested_caps copia parent (ainda ⊆)
3. CAPABILITY_ESCALATION no spawn
4. BUDGET_ESCALATION vs parent_remaining
5. enforceSpend dentro/acima do budget
6. assertSpend throws BUDGET_EXCEEDED
7. enforceCapability allow/deny (incl. cap do pai não herdada)
8. nested Sub-MSO attenuation + budget bound
9. terminate → TERMINATED
10. attenuate deterministic/sorted
11. invalid parent/budget
12. prova E2E: não excede budget nem escala permissões

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-ORCH-03 | `npx vitest run tests/unit/v3-orch-03-sub-mso.test.ts` | **0** | `vitest-v3-orch-03.txt` / `.log` / `.exit` |
| Regressão ORCH (v3-01/02 + v2 parallel) | `npx vitest run tests/unit/v3-orch-01-*.test.ts tests/unit/v3-orch-02-*.test.ts tests/unit/v2-orch-{01,02,03,04}-*.test.ts` | **0** | `vitest-regression-orch.txt` / `.exit` |

## STATUS

**PASS**
