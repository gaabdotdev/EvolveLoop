# `.agents/` — mirrors (não SSOT)

**Fonte de verdade:** `.cursor/` (`skills/`, `commands/`, `rules/`, `hooks/`).

| Path | Papel |
|------|--------|
| `.cursor/skills/` | Contratos normativos das skills |
| `.agents/agents/` | Espelhos humanos curtos (apontam para a skill SSOT) |
| `.agents/skills/` | Symlinks locais (gitignored) → SSOT |
| `.agents/rules/` | Corpo das rules derivado de `.cursor/rules/*.mdc` |
| `Agents/` | Legado medido pelo baseline V22 — **não** reescrever no sync default |

Regenerar espelhos:

```bash
bash scripts/sync-agents-from-cursor.sh
# opcional (quebra goldens V22 se o conteúdo mudar):
SYNC_LEGACY_AGENTS=1 bash scripts/sync-agents-from-cursor.sh
```

Em conflito, `.cursor/` ganha sempre.
