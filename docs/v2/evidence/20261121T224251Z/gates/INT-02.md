# INT-02

- **STATUS:** PASS_LIVE
- **ts:** 20261121T224251Z
- **comando:** `node scripts/v2-int02-probe.mjs ; cd orchestrator && npx vitest run tests/unit/v2-int-02-live-laya.test.ts`
- **exit:** 0
- **log:** `docs/v2/evidence/20261121T224251Z/raw/INT-02.log` / twin `.txt`
## Live benchmark (Ollama bonsai-64k)

- probe_exit: 0 (`scripts/v2-int02-probe.mjs`)
- cases: 6 (pt-BR+en, tarefas EvolveLoop reais: grill-me, ownership, merge AST, backpressure, quarantine)
- invention_count: baseline=0, candidate=0
- calibration_ok: true / true
- abstention_rate_candidate: 1 (modelo gerou CoT; parser fail-closed → abstain; 0% invenção)
- verdict: PLUGGABLE_KEEP_BASELINE

```
/home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v2/evidence/20261121T224251Z/raw/INT-02-probe.log:INT02_STATUS=READY
/home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v2/evidence/20261121T224251Z/raw/INT-02.log:INT02_STATUS=PASS_LIVE
```
