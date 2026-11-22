# V4.3 — Matriz de compatibilidade + migração (P1-5)

**Status:** extensão V4.2; LIMITATIONs baratas fechadas ou explícitas  
**Data:** 2026-11-22  
**Herança:** `docs/v4/V4.2/tests/compat-matrix.md`; `docs/v4/V4.2/tests/migration-notes.md`  
**Regra:** não inventar passes; Node suportado = `engines` do package.

---

## 1. Runtime / Node (documentado)

| Item | Resultado | Evidência |
|---|---|---|
| Node **≥ 20** (suportado) | **Pass** (contrato) | `orchestrator/package.json` → `"engines": { "node": ">=20" }`; help advanced note |
| Node 22.x (dev host) | **Pass** | V4.2 smoke `node -v` v22.15.0 |
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
| Node suportado documentado | **≥20** explícito |
| Shells / Zellij | Parcial — Zellij LIMITATION |
| Paths especiais | Parcial — non-ASCII LIMITATION |
| Config / migrate | Validate OK; migrate LIMITATION |
| Install limpa + update | Documentado em quickstart / rollback (P1-6) |

---

*MSO TASK V43-M3 — P1-5*
