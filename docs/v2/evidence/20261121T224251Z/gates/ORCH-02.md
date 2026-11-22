# ORCH-02

- **STATUS:** PASS_LIVE
- **ts:** 20261121T224251Z
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-orch-02-live-corpus.test.ts`
- **exit:** 0
- **log:** `docs/v2/evidence/20261121T224251Z/raw/ORCH-02.log` / twin `.txt`

## Live asserts

- Corpus 20 conflitos (18 sintáticos disjuntos + 2 semânticos mesmo-símbolo)
- **RATIO:** syntactic_resolved=18 / denom=(18+2) = **0.9**
- MergeQueue + AST-aware merge sem LLM; pós-merge `node check.mjs <n>` verde para n=1..18
