# V0 repo consolidation (REPO metas)

| ID | Intent | Evidence on `chore/v0-consolidation` |
|----|--------|--------------------------------------|
| **V0-REPO-01** | Single compilable mainline from bench-obs + V3.5 + V3.6; archive divergent branches | Runtime merge in history; archive list in [`BRANCH-ARCHIVE.md`](./BRANCH-ARCHIVE.md); `npm run build` in `orchestrator/` |
| **V0-REPO-02** | Remove root temp; permanent security suite for adversarial audit; drop heavy frontend-pro CSVs | No root `*tmp*` / `.audit*`; suite at `orchestrator/tests/unit/security/`; `.cursor/skills/frontend-pro/data` → symlink to `global-skills/ui-ux-pro-max/data` |
| **V0-REPO-03** | Elect SSOT between `.agents/` and `.cursor/` | [`.cursor/` is SSOT](./AGENTS-SSOT.md); `scripts/sync-agents-from-cursor.sh` |
