# ORCH-01

- **STATUS:** PASS_LIVE
- **ts:** 20261121T224251Z
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-orch-01-live-worktrees.test.ts`
- **exit:** 0
- **log:** `docs/v2/evidence/20261121T224251Z/raw/ORCH-01.log` / twin `.txt`
## Live asserts
- 5 git worktrees reais sob `.tmp/v2-orch-01-live/`
- FileOwnershipLock: conflitantes serializam; disjuntas avançam em paralelo
- zero corrupção de markers/arquivos
