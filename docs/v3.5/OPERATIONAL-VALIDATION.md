# EvolveLoop V3.5 — Operational Validation

**Branch:** `feature/v3.5-runtime`  
**Base tag preserved:** `v3.5-runtime` → `07973fe…` (immutable; fixes are newer commits)  
**v3-complete preserved:** `6b69c3f…`  
**Live E2E run id:** `live-e2e-1794526866904`

## Capability classification (post live E2E)

| Componente | Implementação | Testes atuais | Lacunas | Validação |
|---|---|---|---|---|
| Security model | IMPLEMENTED | unit + op | — | PASS |
| Sandbox bubblewrap | IMPLEMENTED | adversarial op + live | cgroup v2 controllers not wired; max_pids not via RLIMIT_NPROC | PASS (Linux) |
| Harness contracts | IMPLEMENTED | consent + inspect | — | PASS |
| Harness LLM real body | IMPLEMENTED | live E2E | Claude still loggedOut; cursor-agent session used | **PASS** |
| Coordinator daemon | IMPLEMENTED | crash/SIGKILL/IPC + live | — | PASS |
| Git worktrees | IMPLEMENTED | real wt/merge/rollback + live | — | PASS |
| Post-merge validation | IMPLEMENTED | discovers npm test/build/typecheck | — | PASS |
| Approvals concurrency | IMPLEMENTED | decideOnce races + live scope/replay | — | PASS |
| E2E engineering stack | IMPLEMENTED | op-e2e + **live LLM** | — | **PASS** |

## Live E2E summary

1. Disposable multi-module shop fixture (`catalog`/`pricing`/`cart`) with incomplete `applyDiscounts`.
2. Coordinator `service start` (detached) + Goal Contract + TaskGraph + agents.
3. Real git worktree + ownership claim.
4. Bubblewrap `agent-workspace` profile: workspace read OK; primary write denied.
5. Harness: `/home/gaab/.local/bin/agent` session auth (`agent status` logged in); `EVOLVELOOP_HARNESS_CONSENT=true` scoped to process.
6. Implementer LLM wrote real `src/pricing/discount.js`; Core `npm test` → 9/9 PASS (no deterministic solver).
7. CLI reconnect while daemon stayed RUNNING.
8. Independent reviewer session (`cli_mode=ask`, distinct session id) → `VERDICT: APPROVE`.
9. Approval Broker `git.mutate` pending → approve via CLI → scope mismatch denied → consume → replay denied.
10. Real git integrate + post-merge npm build/test/typecheck PASS.
11. Separate rollback fixture restored checkpoint HEAD.

Evidence: `docs/v3.5/evidence/live-e2e/`.

## Bugs fixed during live validation

1. **antigravity/cursor-agent argv** — `--prompt-file` invalid for `agent`; replaced with `-p --trust --workspace …` (+ `--force` for consented engineering; `--mode ask` for review).
2. **Doctor auth** — Gate H eligibility via `agent status` session, not only `CURSOR_API_KEY`.
3. **Harness stdio** — file-backed stdout/stderr so evidence survives wait timeout / parent exit.
4. **Adapter invoke CLI** — `--workspace`, `--wait-ms`, `--note` forwarded to drivers.

## Architecture note — provider vs sandbox

- **Harness provider path:** cursor-agent runs outside bubblewrap with host `HOME` (session auth under `~/.config/cursor`) and network to Cursor API; process tracked in `process-sessions`.
- **Engineering isolation:** bubblewrap `agent-workspace` (network deny, primary checkout protected) used for confinement proofs and post-harness validation.
- `--trust` = workspace trust for non-interactive disposable dirs; **not** authentication.
- `--force` = tool allowlist for consented live engineering; **not** authentication.

## How to reproduce

```bash
cd /home/gaab/Downloads/EvolveLoop-v35/orchestrator
npm run build
npm test -- --run tests/unit/v35-*.test.ts tests/integration/v35-*.test.ts tests/integration/v35-op-*.test.ts
node dist/cli/evolve.js runtime doctor --data-dir ./v35-live-e2e-data
# Live (requires agent login + consent scoped to shell):
EVOLVELOOP_HARNESS_CONSENT=true node scripts/v35-live-e2e.mjs
# If implement already proven, resume review/merge:
EVOLVELOOP_HARNESS_CONSENT=true node scripts/v35-live-e2e-resume.mjs
```

## Knowledge grounding

`knowledge_grounding: applied with GAP` — `WIKI_ROOT` pointed at karpathyWiki for this run; hybrid search returned no V3.5 hits (`GAP: no_hits`). Proceeded with repo ADRs + code + live evidence. Append EvolveLoop `log.md` after commit.
