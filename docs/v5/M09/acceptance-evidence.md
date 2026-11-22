# M09 — Acceptance evidence

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m09-agent-studio.test.ts
find ../docs/v5/M09 -type f | sort
git diff --check
```

| Criterion | Evidence |
|-----------|----------|
| Agent schema IO | `loadAgentConfig` / `saveAgentConfig` / import/export |
| No secrets | `stripSecrets` |
| Team JSON | `saveTeamComposition` / `loadTeamComposition` |
| Workflow YAML | `loadWorkflowYaml` |
| Pause reject | `validateAgentConfigCapabilities` on codex/antigravity |
| LIMITATION | `LIMITATION-visual-builder.md` |
