#!/usr/bin/env bash
# Sync EvolveLoop agent mirrors from the Cursor SSOT.
#
# SSOT (edit here):
#   .cursor/skills/   — skill contracts (SKILL.md, provider.yaml, …)
#   .cursor/commands/ — slash commands
#   .cursor/rules/    — Cursor rules (*.mdc)
#   .cursor/hooks/    — hooks
#
# Generated / linked mirrors (do not hand-edit as primary):
#   .agents/skills/   — relative symlinks → .cursor/skills + global-skills (gitignored)
#   .agents/rules/    — body synced from .cursor/rules/*.mdc
#   Agents/           — Title-Case symlinks → .agents/agents/*.md
#
# Usage (from repo root):
#   bash scripts/sync-agents-from-cursor.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CURSOR_SKILLS="$REPO_ROOT/.cursor/skills"
CURSOR_RULES="$REPO_ROOT/.cursor/rules"
GLOBAL_SKILLS="$REPO_ROOT/global-skills"
AGENTS_DIR="$REPO_ROOT/.agents"
AGENTS_SKILLS="$AGENTS_DIR/skills"
AGENTS_RULES="$AGENTS_DIR/rules"
AGENTS_MIRRORS="$AGENTS_DIR/agents"
LEGACY_AGENTS="$REPO_ROOT/Agents"

echo "SSOT: .cursor/{skills,commands,rules,hooks}"
echo "REPO_ROOT=$REPO_ROOT"

mkdir -p "$AGENTS_SKILLS" "$AGENTS_RULES" "$AGENTS_MIRRORS" "$LEGACY_AGENTS"

relpath() {
  # $1 = target absolute, $2 = start directory absolute
  realpath --relative-to="$2" "$1"
}

link_skill() {
  local src="$1" dest="$2"
  local rel
  rel="$(relpath "$src" "$AGENTS_SKILLS")"
  ln -sfn "$rel" "$dest"
  echo "  skill-link: $(basename "$dest") -> $rel"
}

if [[ -d "$CURSOR_SKILLS" ]]; then
  for skill_dir in "$CURSOR_SKILLS"/*; do
    [[ -d "$skill_dir" ]] || continue
    link_skill "$skill_dir" "$AGENTS_SKILLS/$(basename "$skill_dir")"
  done
fi

if [[ -d "$GLOBAL_SKILLS" ]]; then
  for skill_dir in "$GLOBAL_SKILLS"/*; do
    [[ -d "$skill_dir" ]] || continue
    name="$(basename "$skill_dir")"
    if [[ -e "$AGENTS_SKILLS/$name" || -L "$AGENTS_SKILLS/$name" ]]; then
      continue
    fi
    link_skill "$skill_dir" "$AGENTS_SKILLS/$name"
  done
fi

if [[ -d "$AGENTS_SKILLS/orquestrar" || -L "$AGENTS_SKILLS/orquestrar" ]]; then
  ln -sfn "orquestrar" "$AGENTS_SKILLS/EvolveLoop"
  echo "  skill-alias: EvolveLoop -> orquestrar"
fi

# --- .agents/rules: derive from .cursor/rules/*.mdc (strip Cursor frontmatter) ---
python3 - "$CURSOR_RULES" "$AGENTS_RULES" "$REPO_ROOT" <<'PY'
import sys
from pathlib import Path

cursor_rules = Path(sys.argv[1])
agents_rules = Path(sys.argv[2])
repo = Path(sys.argv[3])
agents_rules.mkdir(parents=True, exist_ok=True)

for rule in sorted(cursor_rules.glob("*.mdc")):
    text = rule.read_text(encoding="utf-8")
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            text = text[end + 4:].lstrip("\n")
    dest = agents_rules / f"{rule.stem}.md"
    header = (
        f"# {rule.stem} — espelho de regra\n\n"
        f"**SSOT:** `.cursor/rules/{rule.stem}.mdc`\n"
        "**Não editar como fonte:** regenerar com `bash scripts/sync-agents-from-cursor.sh`.\n\n"
    )
    dest.write_text(header + text, encoding="utf-8")
    print(f"  rule-mirror: {dest.relative_to(repo)}")
PY

# --- Agents/ (legado): NÃO reescrever por defeito ---
# O corpus V22-GAP-P0 mede paths sob Agents/; reescrever para symlinks
# altera input_tokens e quebra os goldens em docs/v22/baseline/raw/.
# Para regenerar symlinks Title-Case → .agents/agents (fora de CI/baseline):
#   SYNC_LEGACY_AGENTS=1 bash scripts/sync-agents-from-cursor.sh
if [[ "${SYNC_LEGACY_AGENTS:-0}" == "1" ]]; then
  title_case() {
    local name="$1"
    local IFS='-'
    local -a parts
    local out="" p
    read -r -a parts <<< "${name//_/-}"
    for p in "${parts[@]}"; do
      [[ -z "$p" ]] && continue
      if [[ -n "$out" ]]; then
        out+="-"
      fi
      out+="$(printf '%s%s' "$(echo "${p:0:1}" | tr '[:lower:]' '[:upper:]')" "${p:1}")"
    done
    printf '%s' "$out"
  }

  if [[ -d "$AGENTS_MIRRORS" ]]; then
    shopt -s nullglob
    for mirror in "$AGENTS_MIRRORS"/*.md; do
      id="$(basename "$mirror" .md)"
      case "$id" in
        backend|wiki|wiki-mem) titled="$id" ;;
        *) titled="$(title_case "$id")" ;;
      esac
      dest="$LEGACY_AGENTS/${titled}.md"
      rel="$(relpath "$mirror" "$LEGACY_AGENTS")"
      rm -f "$dest"
      ln -sfn "$rel" "$dest"
      echo "  Agents-link: ${titled}.md -> $rel"
    done
    shopt -u nullglob
  fi
else
  echo "  skip: Agents/ (legado medido; set SYNC_LEGACY_AGENTS=1 para symlinks)"
fi

cat > "$AGENTS_DIR/skills.json" <<'EOF'
{
  "entries": [
    {
      "path": ".cursor/skills"
    },
    {
      "path": "global-skills"
    },
    {
      "path": "~/.cursor/skills"
    },
    {
      "path": "~/.agents/skills"
    }
  ]
}
EOF
echo "  wrote: .agents/skills.json"

cat > "$AGENTS_DIR/README.md" <<'EOF'
# `.agents/` — mirrors (não SSOT)

**Fonte de verdade:** `.cursor/` (`skills/`, `commands/`, `rules/`, `hooks/`).  
**Decisão canónica (V0-REPO-03):** `docs/v0/AGENTS-SSOT.md`.

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
EOF
echo "  wrote: .agents/README.md"

echo "OK: agents mirrors synced from .cursor SSOT"
