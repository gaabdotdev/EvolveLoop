# V4.1 — Experience (mapa e backlog)

**Tema:** jornada principal, TUI e interação diária  
**Papel:** entregável 1 do `V4.1-Experience.md` §7 — auditar e mapear **antes** de implementar.  
**Data:** 2026-11-22  
**Repo:** `seagrass`  
**Precedência:** código verificado > docs V4.0 > planning. Onde o código não expõe → **GAP**.

## Índice

| Doc | Conteúdo |
|---|---|
| [`journey-map-current-vs-target.md`](./journey-map-current-vs-target.md) | Jornada abrir→iniciar→plano→acompanhar→intervir→entrega: atual vs alvo + gaps |
| [`tui-command-audit.md`](./tui-command-audit.md) | Comandos `evolve`; equivalentes agents/inspect/attach/logs; duplicatas; entrypoints TUI |
| [`implementation-backlog.md`](./implementation-backlog.md) | Itens P0/P1/P2 → critérios §8 + testes §4; arquivos a tocar |
| [`agent-handles.md`](./agent-handles.md) | Handles on/off, backends, fallback, viewer≠kill (P1) |
| [`user-guide-everyday.md`](./user-guide-everyday.md) | Guia uso cotidiano (P2-6) |
| [`user-guide-advanced.md`](./user-guide-advanced.md) | Referência avançada (P2-6) |
| [`gate-report.md`](./gate-report.md) | Gate V4.1 — liberar com ressalvas |
| [`tests/`](./tests/) | Evidências §4 (journey, handles, vitest, usabilidade N=0, backends, indicadores) |
| [`adr/Q3-agent-handle.md`](./adr/Q3-agent-handle.md) | ADR Q3 Handle |
| [`adr/Q4-approval-facade.md`](./adr/Q4-approval-facade.md) | ADR Q4 Approval fachada |

## Fontes

- Planning: `~/Downloads/EvolveLoop-V4-Planning-Documents/V4.1-Experience.md`
- Testes: `…/V4-Tests-and-Benchmarks.md` §4 (V4.1)
- Identity (V4.0): `docs/v4/V4.0/` (glossário, state-matrix, interaction-principles, inventário, terminal-visual-guide, decisões)

## Ordem sugerida de trabalho

1. Ler journey-map (gaps da jornada).
2. Ler tui-command-audit (superfície e duplicatas).
3. Executar backlog P0 → P1 → P2 (sem reescrever o motor de agentes).

## Wiki

Scout/search OK; pack **EvolveLoop** ausente no vault (`PACK_NOT_FOUND`). Contratos abaixo só do repo + planning (GAP wiki herdado de V4.0).

---

*MSO TASK V41-M1 — só documentação.*
