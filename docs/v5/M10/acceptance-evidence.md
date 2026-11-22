# M10 — Acceptance evidence

```bash
cd orchestrator
npm run build
# BUILD=0

npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m*.ts
# 12 files / 64 tests / exit 0

npm test 2>&1 | tee /tmp/v5-m10-full-test.txt; echo FULL=$?
# FULL=0 — 264 passed / 1472 tests / 2 skipped

find ../docs/v5 -maxdepth 2 -type f | sort | wc -l
git diff --check
```

| Criterion | Evidence |
|-----------|----------|
| Node engines ≥22.5 | `orchestrator/package.json`; host `v22.15.0` |
| Security assessment | `security-assessment.md` (deny-default, stripSecrets, process fence) |
| Compat V5 | `compat-matrix.md` + append `docs/v4/V4.3/compat-matrix.md` |
| Integrated scenario | `tests/unit/v5-m10-integrated-scenario.test.ts` |
| Gates A–J | `gates.md` |
| Gate decision | `gate-report.md` |
| Index M00–M10 | `docs/v5/README.md` |
| Human N=0 | `LIMITATION-human-validation.md` |
| Multi-harness | `LIMITATION-multi-harness.md` |
| Legacy CLI fix | `src/cli/work-surface.ts` defer status+`--data-dir` |

**Logs:** `/tmp/v5-m10-build.txt`, `/tmp/v5-m10-v5-tests.txt`, `/tmp/v5-m10-full-test.txt`
