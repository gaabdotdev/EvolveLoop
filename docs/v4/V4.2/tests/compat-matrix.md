# V4.2 — Matriz de compatibilidade (smoke)

**Status:** P1-6 + P2-2 actualização M4  
**Data:** 2026-11-22  
**Regra:** não inventar passes; marcar N/A / LIMITATION quando não exercitado.  
**Relacionado:** `docs/v4/V4.1/tests/backend-matrix.md`; `layout-narrow.ts`; `v42-p1-*.ts`; `v42-p2-perf-a11y.test.ts`; `navigation-a11y.md`

---

## 1. Runtime / Node

| Item | Resultado | Evidência |
|---|---|---|
| Node ≥ 20 (recomendado) | **Pass** nesta máquina | `node -v` v22.15.0; smoke `v42-p1-compat` |
| Node 18 / 19 | **LIMITATION** | Não corrido nesta entrega; orchestrator recomenda 20+ |
| Multi-arch (arm64) | **N/A** | Host amd64 apenas |

---

## 2. Shells / multiplexers

| Item | Resultado | Evidência |
|---|---|---|
| Shell interativo zsh/bash | **Pass** (dev host) | Sessão de desenvolvimento; CLI `evolve` via Node |
| tmux presente | **Pass** (presença) | V4.1 backend-matrix: tmux 3.5a |
| Zellij | **LIMITATION / N/A** | Binário ausente nesta máquina (V4.1) |
| Handles OFF sem multiplexer | **Pass** (regressão V4.1) | attach soft-fail; jornada não bloqueia |

---

## 3. Paths especiais

| Item | Resultado | Evidência |
|---|---|---|
| Path com espaço | **Pass** (smoke unit) | `v42-p1-compat`: tmp dir `ws with space` |
| Non-ASCII path | **LIMITATION** | Não exercitado |
| Symlink workspace | **LIMITATION** | `realpath` em `confirmWorkspaceUse`; sem matriz dedicada |

---

## 4. Terminal layout

| Item | Resultado | Evidência |
|---|---|---|
| Narrow cols &lt; 72 | **Pass** (unit) | `resolveLayoutMode(40)` → narrow + notice |
| Rows baixas (altura &lt; 12) | **Pass** (unit + wire App) | `LOW_ROWS`; `v42-p2`; `navigation-a11y.md` |
| NO_COLOR | **Pass** (unit) | `v42-p2` + `colors.ts` |
| Teclado live timed / taxa erro | **LIMITATION** | N=0 humanos |

---

## 5. Config antiga / migração

| Item | Resultado | Evidência |
|---|---|---|
| Profile YAML inválido → issues acionáveis | **Pass** (P0) | `evolve config validate` / `v42-p0` |
| Migração automática de schema antigo | **LIMITATION** | Sem migrator; ver `migration-notes.md` |
| Credenciais duas casas documentadas | **Pass** (doc+help) | P2-4; `credentials-paths.ts`; help journey |

---

## 6. Isolamento Workspace

| Item | Resultado | Evidência |
|---|---|---|
| state.db scoped por path | **Pass** (unit) | `v42-p1-isolation` |
| Mensagem UX de isolamento | **Pass** | `evolve use` / `history` limitations |

---

## 7. Gate §5 compat (resumo)

| Critério §5 | Estado |
|---|---|
| Node suportado | Parcial — 20+ verificado; multi-versão LIMITATION |
| Shells / tmux / Zellij | Parcial — tmux presença OK; Zellij N/A |
| Paths especiais | Parcial — espaço OK; non-ASCII LIMITATION |
| Terminal estreito / baixo | **Cols+rows unit Pass**; live TTY LIMITATION |
| Config antiga | Parcial — validate OK; migrate LIMITATION |

---

*MSO TASK V42-M3 + M4 — compat-matrix.md*
