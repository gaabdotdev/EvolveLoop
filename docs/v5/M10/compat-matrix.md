# V5 — Matriz de compatibilidade (M10)

**Status:** append sobre V4.3 + REMED  
**Herança:** `docs/v4/V4.3/compat-matrix.md`  
**Regra:** não inventar passes; Node = `engines` do package.

---

## 1. Runtime / Node

| Item | Resultado | Evidência |
|------|-----------|-----------|
| Contrato `engines.node >=22.5.0` | **Pass** | `orchestrator/package.json` |
| Host gate `v22.15.0` | **Pass** | `node -v` (2026-11-22) |
| CI matrix Node 22 + 24 | **Pass** (contrato CI) | `.github/workflows/ci.yml` |
| Node &lt;22.5 | **LIMITATION** | Fora de `engines` |

---

## 2. V5 domain surfaces vs V4 journey

| Item | Resultado | Evidência |
|------|-----------|-----------|
| Dual-label Work/Task | **Pass** (unit) | `v5-m01-work-runtime.test.ts`; `v5-m07-experience.test.ts` |
| Legacy `evolve work status --data-dir` | **Pass** | `evolve-cli.integration.test.ts` (fix M10: defer product surface) |
| Product `evolve work status` (sem data-dir) | **Pass** | `v5-m07-experience.test.ts` |
| Attempt fail ≠ Work fail | **Pass** | `v5-m02-attempt-binding.test.ts`; M10 cenário |
| Agent replace mid-work | **Pass** | `v5-m02-orchestration-contracts.test.ts`; M10 |

---

## 3. Integrations honesty

| Item | Resultado | Evidência |
|------|-----------|-----------|
| MCP ≠ host runtime | **LIMITATION** | `docs/v5/M04/LIMITATION-mcp.md` |
| ACP server | **LIMITATION / GAP** | `docs/v5/M02/LIMITATION-acp-deferred.md` |
| CLI + TUI leem mesmo work-runtime | **Pass** (unit) | M07 experience + work-surface |
| Live Cursor+Antigravity multi-harness | **LIMITATION** | `LIMITATION-multi-harness.md` |

---

## 4. Security / reliability slices

| Item | Resultado | Evidência |
|------|-----------|-----------|
| Tool deny-default | **Pass** | `v5-m04-tool-registry.test.ts` |
| No secrets em export Studio | **Pass** | `v5-m09` + `v5-m10` |
| Process fence | **Pass** (POSIX) | `remed-m2-lifecycle-controls.test.ts` |

---

## 5. Resumo

| Critério | Estado V5-M10 |
|----------|---------------|
| Node ≥22.5 documentado + host OK | **Pass** |
| Journey V4 CLI `--data-dir` | **Pass** (após fix defer status) |
| Multi-harness live | **LIMITATION** |
| Human UX externo | **LIMITATION** (N=0) |

Ver também append em `docs/v4/V4.3/compat-matrix.md`.
