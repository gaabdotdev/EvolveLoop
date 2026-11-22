# Agents / Cursor single source of truth

**Meta:** V0-REPO-03  

## Decision

| Path | Role |
|------|------|
| **`.cursor/`** | **Canonical SSOT** — edit here (`skills/`, `commands/`, `rules/*.mdc`, `hooks/`) |
| `.agents/` | Generated / linked mirrors — not the edit surface |
| `global-skills/` | Shared skill pack; linked into `.agents/skills/` when not already covered by `.cursor/skills/` |
| `Agents/` | Legacy V22 baseline corpus — **do not** rewrite in default sync |

## Sync (eliminate manual duplication)

```bash
bash scripts/sync-agents-from-cursor.sh
# optional (breaks V22 path-token goldens if content shape changes):
SYNC_LEGACY_AGENTS=1 bash scripts/sync-agents-from-cursor.sh
```

What the script does:

1. Symlinks `.agents/skills/*` → `.cursor/skills/*` and missing names from `global-skills/`
2. Regenerates `.agents/rules/*.md` from `.cursor/rules/*.mdc` (frontmatter stripped)
3. Rewrites `.agents/skills.json` to point at SSOT paths
4. Leaves `Agents/` untouched unless `SYNC_LEGACY_AGENTS=1`

Conflict rule: **`.cursor/` always wins.**

Human-facing summary also lives in `.agents/README.md`.
