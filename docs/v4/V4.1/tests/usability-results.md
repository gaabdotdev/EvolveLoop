# V4.1 — Usability results

**Data (UTC):** 2026-11-22T17:34Z  
**Spec:** `V4-Tests-and-Benchmarks.md` §4 — Testes de usabilidade  
**Regra da tarefa:** se N=0 humanos → **LIMITATION** explícita; **não inventar** %; dry-run separado.

---

## 1. Cohort humano

| Campo | Valor |
|---|---|
| Participantes externos (N) | **0** |
| Conclusão / tempo / erros humanos | **LIMITATION** — não medidos |
| % taxa de conclusão sem ajuda | **LIMITATION** — proibido inventar |
| Comandos consultados por humanos | **LIMITATION** |

**Decisão de gate:** sem usabilidade humana N≥1 → **não** “liberar” limpo (ver `gate-report.md`).

---

## 2. Dry-run do autor (separado — ≠ métrica humana)

Operador: autor da implementação (não conta como cohort §4).

| Tarefa representativa | Dry-run | Notas |
|---|---|---|
| Iniciar tarefa | Help curto lista NL + `intent`; TUI placeholder Task | Sem TTY timed study |
| Entender o plano | `/plan` + Plan card unit | |
| Descobrir por que parou | Footer L1 + `/approvals` + `/status` | Sem live BLOCKED timed |
| Aprovar ação | ApprovalFacade unit + painel | |
| Inspecionar agente | `evolve agents inspect` dogfood exit 0 | |
| Encontrar a entrega | `/delivery` + DeliveryCard unit | |

**Dry-run ≠ evidência de usabilidade humana.**

---

## 3. Cobertura automática (proxy, não substituto)

Vitest v41-* 35/35 pass; slash jornada parseado; help progressivo. Ver `automated-test-results.md` e `journey-scenarios.md`.

---

*Fim — usability-results.md*
