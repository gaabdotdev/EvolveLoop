# V4.3 — E2E completo (§6)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §6 — Testes ponta a ponta  
**Harness:** `orchestrator/tests/unit/v43-p2-e2e-resilience.test.ts` (+ P0 smoke)  
**Regra:** não inventar passes TTY live; unit ≠ E2E interativo Ink.

---

## Cenários §6

| # | Cenário | Como reproduzir | Resultado / evidência | Status |
|---|---|---|---|---|
| 1 | Tarefa simples | `runIntentFlow` → Goal Contract | Contrato em state.db | **PASS** (unit) |
| 2 | Multi-agent (simulado) | `AgentRegistryStore` master + 2 workers | 3 ACTIVE; replace marca REPLACED | **PASS** (unit) |
| 3 | Aprovação | `ApprovalFacade` approve | Pending → approved | **PASS** (unit) |
| 4 | Falha provider | `deriveDeliveryStatus({ adapter_status: "error" })` | Delivery **FAILED** ≠ PASS | **PASS** (unit) |
| 5 | Falha agente + substituição | `replaceAgent(from, to)` | from=REPLACED; to=ACTIVE; continuity 3 linhas | **PASS** (unit) |
| 6 | Interrupção processo principal | `taskControlMessage("interrupt"\|"cancel")` + `clearJourneyPauseOnCancel` | Labels destrutivas; pause limpa | **PASS** (unit) |
| 7 | Desconexão Agent Handle | `closeViewer()` / `closeAgentViewer` | `killed_agent=false`, `session_cancelled=false` | **PASS** (unit) |
| 8 | Retomada após interrupção | `pauseJourneyTask` → `resumeJourneyTask` ×2 | Persistido; resume idempotente | **PASS** (unit) |
| 9 | Entrega testes OK | `attachDeliveryVerification` exit 0 | Delivery **PASS** | **PASS** (unit) |
| 10 | Entrega testes falhando | exit ≠ 0 | Delivery **FAILED** | **PASS** (unit) |
| 11 | Cancelamento e limpeza | cancel control + clear pause | Sem falso sucesso; pause limpa | **PASS** (unit) |
| 12 | Sem evidência | kick sem verification | **UNVERIFIED** (não inventa PASS) | **PASS** (unit) |

Instalação limpa / update: cobertos por docs `compat-matrix.md` + `migration-notes.md` + regressão CLI (`v43-p0-regression-handles.test.ts`); **não** é install from-scratch timed nesta máquina.

---

## LIMITATION — TTY live / Ink E2E

| Item | Nota |
|---|---|
| Sessão Ink interativa completa (Home → Grill → Plan → kick → Delivery) | **LIMITATION** — sem harness TTY gravado; smoke cobre APIs/surfaces da jornada |
| Attach tmux/Zellij a pane Agent vivo | **LIMITATION** — ver `docs/v4/V4.1/tests/agent-handles-matrix.md` |
| Kill SIGKILL do processo CLI mid-lease MSO | **LIMITATION** — pause persistido parcial; kill hard não E2E aqui |
| Multi-agent com providers reais | **Simulado** via registry — não claim de orquestração live |

Não declarar “E2E TTY completo” só com este ficheiro.

---

## Comandos

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v43-p2-e2e-resilience.test.ts \
  tests/unit/v43-p0-e2e-smoke.test.ts
```

Artefactos: este ficheiro; `resilience.md`; `regression.md`; saída vitest.

---

*MSO TASK V43-M4 — P2-1*
