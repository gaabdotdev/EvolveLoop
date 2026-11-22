# M07 — Acceptance evidence

## Commands

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m07-experience.test.ts
find ../docs/v5/M07 -type f | sort
git diff --check
```

## Checklist

| Criterion | Evidence |
|-----------|----------|
| work list + status | `PersistentWorkRuntime.listWorks` / `statusSummary` + work-surface |
| Simple/Advanced | `evolve mode` + `EXPERIENCE_HELP_LAYERS` / `describeHelpLayers` |
| CLI/TUI same state | `readSharedWorkState` |
| LIMITATION documented | `LIMITATION-workbench.md` |
