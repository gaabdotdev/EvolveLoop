# Graphify skill gate — HARD-GATE

**Âmbito:** projecto novo e este EvolveLoop, em toda a invocação `/evolve` com trabalho técnico.

**Objecto:** o subset definido em `.cursor/skills/graphify/SKILL.md`. A cópia `upstream/skill-pi.md` não é o procedimento.

**Contrato:** ADR-0014. `EVOLVELOOP_GRAPHIFY` fica default OFF. Este gate não define a flag e não a promove. Não introduz `KnowledgeBackendId`.

O hard gate de wiki, o de imagem e o grill-me permanecem nos seus documentos. `knowledge-grounding-gate.md` não é reescrito.

## Ordem

1. Correr o subset da skill Graphify (AST local ou query com `--budget`), no projecto novo e neste EvolveLoop.
2. A seguir, o retrieve wiki já especificado em [knowledge-grounding-gate.md](knowledge-grounding-gate.md).

Binário, se existir: `/tmp/graphify-skill-hardgate-venv/bin/graphify`. Não exportar `EVOLVELOOP_GRAPHIFY` nem `GRAPHIFY_BIN`.

Se esse CLI não existir, `graphify_skill_status: blocked` e a wiki segue. Não instalar no site-packages do sistema. Não executar o Step 1 nem a Part B do upstream.

## Campos no GATE_BUNDLE

| Campo | Valores |
|-------|---------|
| `graphify_skill` | `required` neste âmbito; `n/a` fora dele |
| `graphify_skill_status` | `pending` \| `applied` \| `blocked` \| `n/a` |
| `graphify_skill_path` | `.cursor/skills/graphify/SKILL.md` \| `n/a` |

`applied` só depois do subset autorizado. `blocked` não apaga `knowledge_grounding` e não impede o retrieve wiki.

## Rollback

Remover:

- `.cursor/skills/graphify/`
- `.cursor/skills/orquestrar/references/graphify-skill-gate.md`
- a secção `HARD-GATE — Graphify` em `.cursor/skills/orquestrar/SKILL.md`
- os campos `graphify_skill`, `graphify_skill_status` e `graphify_skill_path` em `.cursor/skills/orquestrar/references/gate-bundle.md`
- o venv `/tmp/graphify-skill-hardgate-venv`
