# V4.3 — Matriz de compatibilidade + migração (P1-5)

**Status:** extensão V4.2; LIMITATIONs baratas fechadas ou explícitas
**Data:** 2026-11-22
**Herança:** `docs/v4/V4.2/tests/compat-matrix.md`; `docs/v4/V4.2/tests/migration-notes.md`
**Regra:** não inventar passes; Node suportado = `engines` do package.

---

## 1. Runtime / Node (documentado)

| Item | Resultado | Evidência |
|---|---|---|
| Node **≥ 22.5.0** (suportado) | **Pass** (contrato) | `orchestrator/package.json` → `"engines": { "node": ">=22.5.0" }`; `node:sqlite` + `better-sqlite3@13` |
| Node 22.x ≥22.5 (mínimo) | **Pass** | StateDb / CI matrix `node-version: 22` |
| Node 24.x (CI matrix) | **Pass** | CI `node-version: 24` |
| Node 20 / 21 / 22.0–22.4 | **LIMITATION** | Fora de `engines`; `node:sqlite` indisponível ou incompleto |
| Node 18 / 19 | **LIMITATION** | Fora de `engines`; não exercitado; sem suporte declarado |
| Multi-arch arm64 | **N/A** | Host amd64 apenas (herdado) |

---

## 2. Shells / multiplexers

| Item | Resultado | Evidência |
|---|---|---|
| zsh/bash interativo | **Pass** (dev) | CLI `evolve` |
| tmux | **Pass** (presença) | V4.1 backend-matrix |
| Zellij | **LIMITATION / N/A** | Binário ausente no host de gate (herdado) |
| Handles OFF sem multiplexer | **Pass** | soft-fail attach; jornada não bloqueia |

---

## 3. Paths especiais

| Item | Resultado | Evidência |
|---|---|---|
| Path com espaço | **Pass** (unit) | `v42-p1-compat` |
| Non-ASCII path | **LIMITATION** | Não exercitado nesta fatia (herdado; barato = doc) |
| Symlink workspace | **LIMITATION** | `realpath` em use; sem matriz dedicada |

---

## 4. Terminal

| Item | Resultado | Evidência |
|---|---|---|
| Narrow cols &lt; 72 | **Pass** (unit) | `layout-narrow.ts` / v42 |
| Rows baixas | **Pass** (unit) | `LOW_ROWS` |
| NO_COLOR | **Pass** (unit) | `colors.ts` |
| Dual TUI: Ink vs `tui run` | **Pass** (doc+help) | P1-4; `help-usage.ts` |

---

## 5. Config / migração (fechar barato)

| Item | Resultado | Evidência |
|---|---|---|
| Profile inválido → issues | **Pass** | `evolve config validate` |
| Migrator automático schema | **LIMITATION** | Sem migrator — ver `migration-notes.md` V4.3 |
| Credenciais duas casas | **LIMITATION** (herdada) | P2-5; paths no help |
| Comandos públicos após P1 copy | **Pass** (smoke) | `v43-p1-*.ts`; regressão P0 |

---

## 6. Isolamento Workspace

| Item | Resultado | Evidência |
|---|---|---|
| state.db por path | **Pass** | v42-p1-isolation |
| Status produto ≠ L2 boards | **Pass** (doc) | glossary help advanced |

---

## 7. Resumo gate compat

| Critério | Estado V4.3 |
|---|---|
| Node suportado documentado | **≥22.5.0** explícito |
| Shells / Zellij | Parcial — Zellij LIMITATION |
| Paths especiais | Parcial — non-ASCII LIMITATION |
| Config / migrate | Validate OK; migrate LIMITATION |
| Install limpa + update | Documentado em quickstart / rollback (P1-6) |

---

*MSO TASK V43-M3 — P1-5*

---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

| Item | Resultado | Evidência |
|---|---|---|
| Node actual `v22.15.0` ≥22.5 | **Pass** | `node -v`; remed-m1/m6; CI matrix 22+24 |
| tmux ON (`3.5a`) | **Pass** | `tmux -V`; remed-m3 + host |
| Handles OFF / backend-off path | **Pass** | remed-m6 soft-fail attach |
| Path com espaços | **Pass** | remed-m6 StateDb + confirmWorkspaceUse |
| Narrow + NO_COLOR | **Pass** | remed-m6 + PTY `--help` |
| Zellij | **LIMITATION** | ausente neste host |
| Non-ASCII path | **LIMITATION** | não exercitado (herdado) |

HEAD: `53ad059…` · ver [`remediation/gate-report.md`](./remediation/gate-report.md).

---

## APPEND — V5-M10 (2026-11-22T22:34:00Z)

| Item | Resultado | Evidência |
|---|---|---|
| Node `engines >=22.5.0` + host `v22.15.0` | **Pass** | `orchestrator/package.json`; `node -v` |
| V5 units `v5-m*.ts` | **Pass** | 12 files / 64 tests / exit 0 |
| Full `npm test` pós-fix CLI | **Pass** | 264 files / 1472 passed / exit 0 (`/tmp/v5-m10-full-test.txt`) |
| Legacy `work status --data-dir` | **Pass** | `evolve-cli.integration.test.ts`; defer em `work-surface.ts` |
| Tool deny-default / no-secret export / process fence | **Pass** (slice) | `docs/v5/M10/security-assessment.md` |
| Live multi-harness Cursor+Antigravity | **LIMITATION** | `docs/v5/M10/LIMITATION-multi-harness.md` |
| Human validation N | **0 / LIMITATION** | `docs/v5/M10/LIMITATION-human-validation.md` |

Detalhe: [`docs/v5/M10/compat-matrix.md`](../../v5/M10/compat-matrix.md) · gates [`docs/v5/M10/gates.md`](../../v5/M10/gates.md).
