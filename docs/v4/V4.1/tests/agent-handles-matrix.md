# V4.1 — Agent Handles matrix

**Data (UTC):** 2026-11-22T17:34Z  
**Commit HEAD:** `577b63cdc986eecd4c7943cf627ad1672cfeb935` (+ working tree V4.1)  
**Spec:** `V4-Tests-and-Benchmarks.md` §4 — Testes específicos de Agent Handles

---

## Backends nesta máquina

| Backend | `which` | Versão | Notas |
|---|---|---|---|
| tmux | `/usr/bin/tmux` (exit 0) | `tmux 3.5a` | Presente |
| Zellij | not found (exit 1) | — | Ausente |
| CLI fallback | sempre | — | inspect+logs text |

---

## Casos e resultados reais

Fixture: workspace temp com `AgentRegistryStore` — agents `a-active` (ACTIVE) e `a-old` (REPLACED → a-active).

| Caso | Comando / API | Exit / assert | Observado |
|---|---|---|---|
| Default OFF | `DEFAULT_PROFILE.preferences.agent_handles.enabled` | unit | `false` |
| List OFF | `EVOLVELOOP_AGENT_HANDLES=false node dist/cli/evolve.js agents --workspace $TMP --work-id w-dogfood` | **0** | Handles: OFF; lista Agents; sem sessão extra |
| Inspect Agent≠Session | `… agents inspect a-active …` | **0** | Explicit: `Agent state (ACTIVE) ≠ Session/terminal state` |
| Replaced | `… agents inspect a-old …` | **0** | `Handle: substituído (histórico)` · `replaced_by: a-active` |
| Attach OFF | `EVOLVELOOP_AGENT_HANDLES=false … attach a-active` | **0** | Soft-fail: “não abre sessão extra”; `killed_agent` N/A |
| Attach ON + tmux | `EVOLVELOOP_AGENT_HANDLES=true … attach a-active` | **0** | “tmux detetado mas sem sessão interativa — fallback CLI”; Task não falha |
| Attach sem backend | `attachAgentHandle(…, hasBinary:()=>false)` | ok=true | `backend: cli_fallback`; msg: “tmux/Zellij ausentes — fallback CLI” |
| Attach mock tmux | `hasBinary: tmux`, `runAttach: ok` | ok=true | `backend: tmux`; `killed_agent: false` |
| Viewer ≠ kill | `result.closeViewer()` / `closeAgentViewer(id)` | killed=false, session_cancelled=false | Mensagem: “fechar ≠ kill / session-cancel” |
| Logs ≠ service logs | `… agents logs a-active` | **0** | Header: `(≠ evolve service logs — isso é daemon systemd)` |
| Handles OFF sem janelas | preferência false | unit + CLI | Nenhuma sessão auxiliar aberta automaticamente |

---

## Permissões / isolamento

| Item | Resultado |
|---|---|
| Expor sessão não cancela Agent | **PASS** (closeViewer contract) |
| Attach OFF não exige tmux | **PASS** |
| Backend ausente não bloqueia Task | **PASS** (cli_fallback) |

**LIMITATION:** attach interativo real a uma sessão tmux viva (com pane Agent) **não** foi gravado — nesta máquina o attach CLI caiu em fallback por ausência de sessão de processo associada. Contrato viewer≠kill validado via API.

---

## Unit tests relacionados

`orchestrator/tests/unit/v41-p1-handles-approvals.test.ts` — preferência OFF, workspace override, attach OFF, mock tmux closeViewer, REPLACED presentation.

---

## V4.3 P0-5 revalidação (2026-11-22)

| Contrato | Resultado | Evidência |
|---|---|---|
| `closeViewer` ≠ kill / session-cancel | **PASS** | `v43-p0-regression-handles.test.ts` + `closeAgentViewer` |
| REPLACED ≠ ativo | **PASS** | `classifyHandleLifecycle` → `replaced` |
| Handles ON sem backend → soft-fail | **PASS** | `cli_fallback`; Task intacta |
| Viewer disconnect documentado | **PASS** (API) / **LIMITATION** (TTY live) | `docs/v4/V4.3/tests/e2e-smoke.md` §7 |

Handles permanecem **default OFF** — não forçar ON.

---

*Fim — agent-handles-matrix.md*
