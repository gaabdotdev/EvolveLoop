# EvolveLoop V3.5 — Operational Validation

**Branch:** `feature/v3.5-runtime`  
**Base tag preserved:** `v3.5-runtime` → `07973fe…` (immutable; fixes are newer commits)  
**v3-complete preserved:** `6b69c3f…`

## Capability classification (post-validation)

| Componente | Implementação | Testes atuais | Lacunas | Validação |
|---|---|---|---|---|
| Security model | IMPLEMENTED | unit + op | — | PASS |
| Sandbox bubblewrap | IMPLEMENTED | adversarial op | cgroup v2 controllers not wired; max_pids not via RLIMIT_NPROC | PASS (Linux) |
| Harness contracts | IMPLEMENTED | consent + inspect | — | PASS |
| Harness LLM real body | PARTIAL/BLOCKED | auth probe | Claude `loggedIn=false`; CURSOR_API_KEY unset | BLOCKED (auth) |
| Coordinator daemon | IMPLEMENTED | crash/SIGKILL/IPC | — | PASS |
| Git worktrees | IMPLEMENTED | real wt/merge/rollback | — | PASS |
| Post-merge validation | IMPLEMENTED | discovers npm test/build | — | PASS |
| Approvals concurrency | IMPLEMENTED | decideOnce races | — | PASS |
| E2E engineering stack | IMPLEMENTED | op-e2e | LLM patch simulated when auth blocked | PASS* |

\* E2E stack real except LLM code generation when auth blocked.

## Bugs fixed during validation

1. **Debian merged-/usr mounts** — binding `/bin` as dir broke dynamic linker; fixed with `--ro-bind /usr` + `--symlink usr/bin /bin` (+ lib/lib64/sbin).
2. **`prlimit --nproc`** — user-wide NPROC caused `Creating new namespace failed: Resource temporarily unavailable`; removed NPROC mapping.
3. **Post-merge `node -e exit(0)`** — replaced with `discoverPostMergeChecks` / `runPostMergeValidation` (real npm test/build).
4. **Integration without branch** — now fails closed (no directory-copy PASS).
5. **Doctor** — live sandbox exec + auth probes + structured PASS/WARNING/FAIL/BLOCKED/UNAVAILABLE.

## How to reproduce

```bash
cd /home/gaab/Downloads/EvolveLoop-v35/orchestrator
npm run build
npm test -- --run tests/unit/v35-*.test.ts tests/integration/v35-op-*.test.ts
node dist/cli/evolve.js runtime doctor --data-dir /tmp/v35-op-data
```

## External dependency for Gate H (LLM)

```bash
claude /login
# OR export CURSOR_API_KEY=… for agent
export EVOLVELOOP_HARNESS_CONSENT=true   # scoped to validation shell only
```

Then re-run `tests/integration/v35-op-harness-consent.test.ts` and an authenticated LLM fixture.
