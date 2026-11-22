# V3-ORCH-05 Evidence — Verificação Formal / Property-Based Fuzzing (MSO + fencing)

- **ts:** 20261121T235036Z
- **task:** M12-V3-ORCH-05-PBT-FUZZ (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T235036Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` exists. Contrato = brief MSO M12-V3-ORCH-05 + código `mso/states.ts` + `state-db` leases/fencing + ADR-V3-0006.

## Implementação

| Peça | Path |
|------|------|
| Seeded PBT helpers (Mulberry32) | `orchestrator/src/v3/mso/pbt-fuzz.ts` |
| Exports MSO | `orchestrator/src/v3/mso/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-orch-05-pbt-fuzz.test.ts` |

### Contrato mínimo fechado

- **Sem fast-check** no projeto → gerador determinístico seeded (`PBT_DEFAULT_SEED`)
- Transições MSO: `canTransitionMso` ≡ membership em `MSO_TRANSITIONS`; walks legais aceites por `StateDb.transitionMso`; edges ilegais → `MsoError INVALID_TRANSITION`
- Leases / `fencing_token`: após steal, writer com token obsoleto rejeitado (`checkWorkspaceFencing` → `stale_fencing_token`; `transitionMso` / `releaseWorkspaceLease` → `StateDbError`); `WorkLockStore.checkFencing` idem
- Seed fixo ⇒ sequência reproduzível para evidência

### Cenários cobertos

1. schema/seed reprodutível
2. oracle exaustivo matriz 10×10
3. enumeradores legal∪illegal particionam state²
4. fuzz 2000 pares seeded ≡ oracle
5. 200 legal walks (edges válidas)
6. illegal successors rejeitados pelo oracle
7. legal walks via `transitionMso` (StateDb)
8. illegal edges → `INVALID_TRANSITION` (estado inalterado)
9. 150 steal chains: stale token rejeitado; current token escreve
10. WorkLockStore acquire→expire→steal→stale deny

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-ORCH-05 | `npx vitest run tests/unit/v3-orch-05-pbt-fuzz.test.ts` | **0** | `vitest-v3-orch-05.txt` / `.log` / `.exit` |
| Regressão ORCH (v3-01..05 + v2 parallel) | `npx vitest run tests/unit/v3-orch-0{1,2,3,4,5}-*.test.ts tests/unit/v2-orch-{01,02,03,04}-*.test.ts` | **0** | `vitest-regression-orch.txt` / `.exit` |

## STATUS

**PASS**
