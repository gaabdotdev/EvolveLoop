# V4.3 — E2E / resiliência smoke (mínimo P0)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §6 (subconjunto); Consolidation §5  
**Harness barato:** `orchestrator/tests/unit/v43-p0-e2e-smoke.test.ts` (+ pause/delivery/handles units)  
**Regra:** não inventar passes TTY live; unit ≠ E2E interativo.

---

## Cenários

| # | Cenário | Como reproduzir | Resultado / evidência | Status |
|---|---|---|---|---|
| 1 | Tarefa simples | `runIntentFlow` → Goal Contract; TUI: `evolve` + NL | Contrato em state.db | **PASS** (unit) |
| 2 | Aprovação | `ApprovalFacade` approve; TUI `/approvals` | Pending → approved | **PASS** (unit) |
| 3 | Falha provider simulada | `deriveDeliveryStatus({ adapter_status: "error" })` | Delivery **FAILED** (≠ PASS) | **PASS** (unit) |
| 4 | Cancel / pause | `pauseJourneyTask` / `resumeJourneyTask`; TUI Ctrl+P; `evolve pause\|resume` | StateDb `journey_task_pause`; resume idempotente | **PASS** (unit) |
| 5 | Handles OFF | default profile / attach OFF | Soft-fail; `killed_agent=false` | **PASS** (unit) |
| 6 | Handles ON soft-fail | attach sem tmux/Zellij | `cli_fallback`; Task não quebra | **PASS** (unit) |
| 7 | Desconectar viewer | `closeViewer()` / `closeAgentViewer` | `killed_agent=false`, `session_cancelled=false` | **PASS** (unit) |
| 8 | Entrega testes OK/FAIL | `validateDelivery` / `attachDeliveryVerification` | PASS só exit 0; FAILED se ≠0; sem evidência → UNVERIFIED | **PASS** (unit) |

---

## LIMITATION — TTY live / Ink E2E

| Item | Nota |
|---|---|
| Sessão Ink interativa completa (Home → Grill → Plan → kick → Delivery) | **LIMITATION** — sem harness TTY gravado nesta máquina; smoke cobre APIs/surfaces usadas pela jornada |
| Attach tmux a pane Agent vivo | **LIMITATION** — ver `docs/v4/V4.1/tests/agent-handles-matrix.md` |
| Reinício CLI mid-execução com lease MSO | Parcial via pause persistido; kill de processo principal não coberto E2E aqui |

Não declarar gate Consolidation §7 completo só com este smoke.

---

## Comandos de verificação

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v43-*.ts
```

---

*MSO TASK V43-M2 — P0-3 smoke.*
