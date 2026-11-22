# V4.2 — Operational Excellence (mapa e backlog)

**Tema:** configuração, workspaces, comandos, observabilidade e operação diária  
**Papel:** entregável de auditoria **antes** de implementar (MSO TASK V42-M1).  
**Data:** 2026-11-22  
**Repo:** `seagrass`  
**Precedência:** código verificado > docs V4.0/V4.1 > planning. Onde o código não expõe → **GAP**.

## Índice

| Doc | Conteúdo |
|---|---|
| [`operational-audit.md`](./operational-audit.md) | Estado atual vs alvo §2: config, workspace, comandos, obs, histórico, perf/a11y — gaps com path |
| [`command-taxonomy-current.md`](./command-taxonomy-current.md) | Taxonomia atual (jornada / progressiva / legado) + conflitos e descoberta |
| [`implementation-backlog.md`](./implementation-backlog.md) | Itens P0/P1/P2 → critérios §5 + testes §5; arquivos a tocar |
| [`gate-report.md`](./gate-report.md) | Gate V4.2 §7/§9 — **liberar com ressalvas** |
| [`baseline/`](./baseline/) | Re-medida vs V4.0 + comparative-report |
| [`tests/`](./tests/) | Evidências funcionais, vitest, indicators, a11y, migration, compat |

## Fontes

- Planning: `~/Downloads/EvolveLoop-V4-Planning-Documents/V4.2-Operational-Excellence.md`
- Testes / gate: `…/V4-Tests-and-Benchmarks.md` §5 (V4.2), §7 gate, §8–§9 formato
- Identity (V4.0): `docs/v4/V4.0/` (glossário Workspace, baseline, state-matrix)
- Experience (V4.1): `docs/v4/V4.1/` (journey, handles, help-usage, gate com ressalvas)
- Código: `orchestrator/src/cli/*`, `config/profile.ts`, `v3/evolve-shell/*`, `v3/agent-handles/preference.ts`, `v3/workspace/*`, `profiles/default.yaml`

## Ordem sugerida de trabalho

1. Ler `operational-audit.md` (gaps por domínio).
2. Ler `command-taxonomy-current.md` (superfície e colisões de nome).
3. Executar backlog P0 → P1 → P2 (**sem** reescrever motor de agentes; **sem** dashboard gráfico).

## Dependências

- V4.0 Identity fechada (documentação + baseline).
- V4.1 Experience liberada **com ressalvas** (`docs/v4/V4.1/gate-report.md`) — usabilidade humana N=0; Handles opcionais.
- Baseline de performance: `docs/v4/V4.0/baseline/` (comparar em V4.2, não reinventar).

## Wiki

Scout/search OK; pack **EvolveLoop** ausente no vault (`PACK_NOT_FOUND`). Contratos abaixo só do repo + planning (GAP wiki herdado).

---

*MSO TASK V42-M1 — só documentação; sem implementação de código.*
