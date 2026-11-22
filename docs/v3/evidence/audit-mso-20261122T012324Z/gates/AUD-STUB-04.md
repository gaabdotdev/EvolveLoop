# AUD-STUB-04 — Auditoria de Testes Tautológicos

**Status:** PASS  
**UTC:** 2026-11-22T01:50:30Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Fault injection manual em funções críticas (transição MSO, validação de contrato,
bloqueio de symlink/path escape, fencing token, Evidence Validator) e comprovação
de que a suíte **FALHA** (exit≠0) para cada quebra, com restauração e verde final.

## Wiki grounding

- Scout/search: hits fora de EvolveLoop.
- **GAP:** contratos AUD-STUB-04 não sintetizados na wiki; procedimento baseado no
  código verificado neste repo + evidência de vitest nesta campanha.

## Funções selecionadas (8)

| ID | Função | Path:linha | Quebra intencional | Teste alvo | Fault EC | Restore EC |
|----|--------|------------|--------------------|------------|----------|------------|
| F1 | `canTransitionMso` | `mso/states.ts:39` | `return true` (arestas ilegais permitidas) | `v0-orch-persistence.test.ts` | 1 | 0 |
| F2 | `transitionMso` | `state-db/store.ts:920` | skip do guard `canTransitionMso` | `v0-orch-persistence.test.ts` | 1 | 0 |
| F3 | `evaluateTrueFullPass` | `goal-contract/types.ts:105` | sempre `eligible: true` | `goal-contract.test.ts` | 1 | 0 |
| F4 | `assertWorkspacePath` | `execution-runner/runner.ts:127` | return abs sem checks de escape/symlink | `audit-adversarial` + `v0-execution-runner` | 1 | 0 |
| F5 | `checkWorkspaceFencing` | `state-db/store.ts:780` | aceita qualquer token stale | `v0-orch-persistence.test.ts` | 1 | 0 |
| F6 | `isSensitive` | `circuit/evidence-validator.ts:105` | sempre `false` | `v0-evidence-token-ledger.test.ts` | 1 | 0 |
| F7 | `runEvidenceValidator` | `circuit/evidence-validator.ts:142` | short-circuit `TRUE_FULL_PASS` | `v0-evidence-token-ledger.test.ts` | 1 | 0 |
| F8 | `authorized` | `circuit/evidence-validator.ts:109` | sempre `true` (allowlist bypass) | `v0-evidence-token-ledger.test.ts` | 1 | 0 |

**Detecção:** 8/8 quebras provocaram falha da suíte. Nenhuma função auditada é tautológica
no sentido de “quebra silenciosa com testes ainda verdes”.

## Procedimento

Para cada ID:

1. Backup do fonte pré-fault (`.evolveloop/aud-stub-04-bak/`).
2. Aplicar quebra mínima e localizada.
3. `npx vitest run <testes alvo>` → gravar `EXIT_CODE≠0`.
4. Restaurar ficheiro a partir do backup.
5. Re-correr os mesmos testes → `EXIT_CODE=0`.

Baseline pré-campanha e suite final (5 ficheiros / 41 testes): **EXIT_CODE=0**.

## Artefactos

| Artefacto | Conteúdo |
|-----------|----------|
| `gates/AUD-STUB-04-tests.txt` | Log completo baseline / cada fault / restore / final |
| `gates/AUD-STUB-04-diffstat.txt` | `git diff` enquanto quebrado + prova de identidade pós-restore |

## Tree final

- Scan `AUD-STUB-04 FAULT` nos 5 fontes: **nenhum residual**.
- `cmp` backup vs tree final: **idêntico** para `states.ts`, `store.ts`, `types.ts`,
  `runner.ts`, `evidence-validator.ts`.
- Nenhuma fault injection deixada no código.

## Veredito

As 8 funções críticas têm cobertura que **detecta** as quebras injetadas (suíte falha).
Estado restaurado verde (`FINAL_EXIT_CODE=0`). Critério anti-tautologia satisfeito.

**PASS**
