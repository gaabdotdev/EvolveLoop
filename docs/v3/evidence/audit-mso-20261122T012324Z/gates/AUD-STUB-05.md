# AUD-STUB-05 — Poda de Código Morto e Bloat

**Status:** PASS  
**UTC:** 2026-11-22T01:59:05Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

1. Rodar knip + ts-prune no `orchestrator/`; gravar reports brutos.
2. Remover apenas arquivos/exports mortos **comprovados** (sem `rm -rf`).
3. Comparar `.agents/` vs `.cursor/` skills — reportar duplicidade; remover só cópias órfãs comprovadas (preservar hard-gates).

## Wiki grounding

- Scout/search: hits fora de EvolveLoop (GaabWiki / KernelBot stubs).
- **GAP:** contratos AUD-STUB-05 não sintetizados na wiki; procedimento baseado no código verificado + knip/ts-prune neste repo.

## Tools

| Tool | Artefacto | Notas |
|------|-----------|-------|
| knip 6.47.0 | `gates/AUD-STUB-05-knip.txt` | Baseline: **Unused files (42)** |
| knip --files (pós) | `gates/AUD-STUB-05-knip-post.txt` | Pós-poda: **Unused files (22)** |
| ts-prune | `gates/AUD-STUB-05-ts-prune.txt` | Exports não referenciados (muitos APIs públicas / barrels) |

## Remoções comprovadas (20)

Cada ficheiro era um barrel `index.ts` listado por knip como unused file.  
Prova adicional: `rg`/análise de imports — **zero** importadores do path do package (`…/pkg` ou `…/pkg/index`); consumidores importam módulos concretos (`tracker.js`, `store.js`, etc.).

| Path | Motivo |
|------|--------|
| `orchestrator/src/knowledge/truth-source/index.ts` | barrel órfão |
| `orchestrator/src/v3/adapters/index.ts` | barrel órfão |
| `orchestrator/src/v3/adapters/drivers/index.ts` | barrel órfão |
| `orchestrator/src/v3/approvals/index.ts` | barrel órfão |
| `orchestrator/src/v3/budget/index.ts` | barrel órfão |
| `orchestrator/src/v3/context/index.ts` | barrel órfão |
| `orchestrator/src/v3/continuity/index.ts` | barrel órfão |
| `orchestrator/src/v3/coordinator/index.ts` | barrel órfão |
| `orchestrator/src/v3/event-log/index.ts` | barrel órfão |
| `orchestrator/src/v3/execution/index.ts` | barrel órfão |
| `orchestrator/src/v3/harness/index.ts` | barrel órfão |
| `orchestrator/src/v3/hierarchy/index.ts` | barrel órfão |
| `orchestrator/src/v3/intake/index.ts` | barrel órfão |
| `orchestrator/src/v3/locks/index.ts` | barrel órfão |
| `orchestrator/src/v3/model-catalog/index.ts` | barrel órfão |
| `orchestrator/src/v3/recovery/index.ts` | barrel órfão |
| `orchestrator/src/v3/routing/index.ts` | barrel órfão |
| `orchestrator/src/v3/tui/index.ts` | barrel órfão |
| `orchestrator/src/v3/work-ledger/index.ts` | barrel órfão |
| `orchestrator/src/v3/workspace/index.ts` | barrel órfão |

**Não removidos** (knip false positives / entrypoints intencionais): `scripts/v3-*-*.{mts,mjs}`, CLI `apply-context-budget.ts`, fixtures `tests/fixtures/v3-eval/**`, `vitest.v1-gate-compat.config.ts`.  
**Não removidos** (deps ativas): `tree-sitter-javascript` / `tree-sitter-typescript` (usados em `symbol-map.ts` via WASM).  
**Não removido** alias `loadMegaBrainProfile` (ainda usado em testes/backend).

Baseline orphan já staged fora desta poda pontual: `orchestrator/tests/quarantine/audit-tmp-adversarial.ts` (D).

## Skills `.agents/` vs `.cursor/`

Ver `gates/AUD-STUB-05-skills-dup.txt`.

- `.cursor/skills`: 25 dirs (SSOT).
- `.agents/skills`: 39 entries, **todas symlinks** → `.cursor/skills` ou `global-skills/` (0 cópias reais, 0 broken).
- Hard-gates preservados: `grill-me`, `image-to-code`, `wiki`.
- **Duplicidade residual de conteúdo: 0.** Nenhuma cópia órfã a remover.

## Testes

Arquivo: `gates/AUD-STUB-05-tests.txt`

| Suite | EXIT |
|-------|------|
| `npm run build` | **0** |
| Vitest focado (budget/work-ledger/recovery/truth-source/…) | **0** (7 files) |
| `tests/unit` excl. `v22-p0-*.test.ts` (tiktoken env) | **0** (184 files) |
| `tests/unit` completo | 1 — 3 files / 4 tests falham por `No module named 'tiktoken'` (pré-existente env; não causado pela poda) |

`UNIT_EXCL_P0_EXIT=0` + `BUILD_EXIT=0` + `FOCUSED_EXIT=0` satisfazem validação pós-poda.

## Diffstat

Ver `gates/AUD-STUB-05-diffstat.txt`. knip unused-files **42 → 22** (−20 barrels).

## Veredito

- Reports knip/ts-prune gravados.
- 20 barrels mortos comprovados eliminados (unlink/`git rm` pontual).
- Skills: espelho symlink limpo; hard-gates intactos; sem duplicidade residual.
- Build + unit (exceto P0 tiktoken) verdes.

**PASS**
