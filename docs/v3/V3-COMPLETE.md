# EvolveLoop V3 — COMPLETE

**Status:** `V3_COMPLETE`  
**Gate evidence:** `docs/v3/evidence/gate.v3-global.json`  
**Predecessor tags:** `v3.3-freeze` → `v3.4-engineering` → **this freeze**

## What V3 is

A local-first coordination layer over the V2 execution kernel that can:

1. Explore unknown multi-module repositories  
2. Plan and decompose engineering work (Goal Contract + TaskGraph)  
3. Delegate with authority boundaries  
4. Apply real multi-file changes in isolated workspaces  
5. Run pre-existing and new tests; detect regressions  
6. Perform independent review (separate agent identity)  
7. Recover via handoff/continuity without claiming exactly-once  
8. Evaluate `TRUE_FULL_PASS` only from durable, integrity-checked evidence  
9. Classify harnesses honestly (`PARTIAL` / `DRY_RUN` / `PROBE_ONLY` / `BLOCKED`)  
10. Report cost-per-verified-completion and held-out task results  

## Gate matrix (A–F)

| Gate | Criterion | State | Evidence |
|------|-----------|-------|----------|
| A | Generalization (≥3 repos, ≥10 tasks, multi-file, baselines) | PASS | `gate.v3-generalization.json` |
| B | Reliability (failure injection + recovery on real task) | PASS | `gate.v3-reliability.json` |
| C | Evaluator integrity (adversarial TRUE_FULL_PASS) | PASS | `gate.v3-evaluator.json` |
| D | Harnesses (contracts + ≥1 real Core path; consent honored) | PASS | `gate.v3-harnesses.json` |
| E | Benchmarks (held-out + cost/verified metrics) | PASS | `gate.v3-benchmarks.json` |
| F | Release (tests + docs + reproducible evidence) | PASS | `gate.v3-global.json` |

## Reproduce

```bash
cd orchestrator && npx tsc
cd .. && node scripts/v3/run-v3-finalization-gate.mjs
# expect global_status: V3_COMPLETE
```

Related tests:

```bash
cd orchestrator
npx vitest run \
  tests/integration/v3-eval-battery.integration.test.ts \
  tests/unit/verified-pass-adversarial.test.ts \
  tests/unit/engineering-loop.test.ts \
  tests/unit/v33-resilience.test.ts \
  tests/unit/v33-consent-ownership.test.ts
```

## Limitations (honest)

- Evaluation fixtures use **DETERMINISTIC_SOLVER** workers (not live LLM codegen) to prove Core orchestration on real multi-file trees.  
- Token/cost numbers in the gate are **deterministic proxies** unless live provider metering is attached.  
- Claude/Codex/Antigravity remain `DRY_RUN` / `PROBE_ONLY` / `BLOCKED` without `EVOLVELOOP_HARNESS_CONSENT=true` and available CLIs.  
- Workspace confinement is **realpath-based**, not a full OS sandbox.  
- Git worktrees isolate trees; they are not OS sandboxes.  
- Cancel applies to Core-owned coordination/process handles — not arbitrary external IDE sessions.

## Architecture pointers

- Engineering Loop: `orchestrator/src/v3/engineering/`  
- Evaluation battery: `orchestrator/src/v3/evaluation/` + `benchmarks/v3/tasks.json`  
- Verified pass: `orchestrator/src/v3/evaluation/verified-pass.ts`  
- Failure batteries: `orchestrator/src/v3/failure-injection/`  
- Harness matrix: `orchestrator/src/v3/engineering/harness-matrix.ts`  
- Master document: `docs/v3/EVOLVELOOP_V3_MASTER_DOCUMENT_v0.6.md`  
- ADRs: `docs/v3/adr/`  

## Post-V3

No V3.5 planning is opened by this freeze. Any later version requires a new charter **after** this `V3_COMPLETE` reference.
