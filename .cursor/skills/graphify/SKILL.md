---
name: graphify
description: >
  Wrapper EvolveLoop da skill Graphify pinada. O agente executa este ficheiro.
  Autoriza só AST local ou query com budget. Recusa o Step 1 e a Part B do
  upstream. Não liga EVOLVELOOP_GRAPHIFY.
metadata:
  version: "1.0.0"
  status: experimental
  capability: graphify-skill-subset
  type: worker
  command: graphify
disable-model-invocation: true
---

# Graphify — wrapper (o que o agente executa)

A cópia pinada está em `.cursor/skills/graphify/upstream/skill-pi.md` (branch `v8`, SHA `92741d162b2094ffc2fed58cfbd8ee823e9da62c`). Esse ficheiro é snapshot. Não é o procedimento. Não o edites. Não executes `references/*.md` que ele aponta.

ADR-0014: `EVOLVELOOP_GRAPHIFY` permanece default OFF. Este wrapper não define `EVOLVELOOP_GRAPHIFY` nem `GRAPHIFY_BIN`. Não há `KnowledgeBackendId`.

Ler este ficheiro não corre pipeline e não gera `graphify-out/`.

## Subset autorizado

Só um dos dois, e só quando o hard gate Graphify pedir o subset. Binário absoluto, sem exportar variáveis:

`/tmp/graphify-skill-hardgate-venv/bin/graphify`

1. **AST local:** `update <path> --no-cluster`. Sem `--wiki`, sem LLM, sem cloud, sem Neo4j.
2. **Query com budget:** `query "<pergunta>" --budget <inteiro>` quando o grafo já existe. O inteiro vem do chamador. Este wrapper não inventa o valor. Não reconstrói o grafo.

Se o binário não existir, para com `graphify_skill_status: blocked`. Não caias no Step 1.

## Recusas

Recusa o Step 1 de `upstream/skill-pi.md`: `uv tool install --upgrade`, `pip install` no sistema, `--break-system-packages`, e a criação de `graphify-out/` por esse passo.

Recusa a Part B (extração semântica por LLM, subagentes, Gemini, chaves).

Recusa também: `--wiki`, cloud, Neo4j, `app.graphify.com`, `EVOLVELOOP_GRAPHIFY=on`, commit de `graphify-out/`.

Um `update` posterior pode escrever `graphify-out/` no disco de trabalho. Esse directório não entra no commit.
