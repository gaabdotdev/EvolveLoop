# V0 branch archive list

**Meta:** V0-REPO-01  
**Mainline:** `chore/v0-consolidation`  
**Policy:** archive by documentation only — **do not** force-delete remotes or rewrite history.

## Consolidated into mainline

| Branch | Tip SHA (at archive note) | Role | Status on mainline |
|--------|---------------------------|------|--------------------|
| `feature/bench-obs-v1` | `1635d745a7aecb4dd29ad8d2b342d3a7e924a135` | Measurement Plane / Gate L | Fully ancestor of HEAD (`commits not in HEAD = 0`) |
| `feature/v3.5-runtime` | `0992cd248ad2df556fa620c64a2899ccb1aca3cd` | V3.5 Runtime (sandbox, daemon, approvals) | Runtime selectively merged; tip still has docs/evidence commits not cherry-picked as a whole |
| `feature/v3.6-multi-workflow` | `5c1df880efeb84f354993c14851596a616f085d4` | V3.6 Global Ops / multi-workflow | Ops plane selectively merged; tip retains docs/evidence + live E2E commits beyond selective merge |

## Archive disposition

- Keep local and remote refs as historical pointers.
- Do **not** `git push --force`, `git branch -D` on remotes, or rewrite shared history for cleanup.
- Prefer reading runtime from `chore/v0-consolidation` (→ future `main`); use archived tips only for archaeology of docs/evidence blobs.
- Optional later (human-owned): retag tips as `archive/bench-obs-v1`, `archive/v3.5-runtime`, `archive/v3.6-multi-workflow` without deleting remotes.

## Mainline compile gate

Orchestrator entry: `orchestrator/package.json` → `npm run build` (`tsc`).
