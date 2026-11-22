# V4.3 — Usabilidade / compreensão humana (final)

**Data (UTC):** 2026-11-22T18:38Z  
**Spec:** `V4-Tests-and-Benchmarks.md` §6 indicadores compreensão/conclusão; Consolidation §5  
**Regra:** se N=0 → **LIMITATION** explícita; **não inventar** %; dry-run ≠ cohort.

---

## 1. Cohort humano

| Campo | Valor |
|---|---|
| Participantes externos (N) | **0** |
| Tempo / erros / conclusão sem ajuda | **LIMITATION** — não medidos |
| % taxa de conclusão sem ajuda | **LIMITATION** — proibido inventar |
| % compreensão de estados | **LIMITATION** — proibido inventar |
| Comandos consultados por humanos | **LIMITATION** |

**Decisão de gate:** sem usabilidade humana N≥1 → **não** “liberar” limpo (ver `gate-report.md` → **liberar com ressalvas**).

Herança: V4.0 `comprehension-test-results.md` N=0; V4.1 `usability-results.md` N=0; V4.2 gate N=0.

---

## 2. Dry-run do autor (separado — ≠ métrica humana)

Operador: autor da implementação (não conta como cohort).

| Tarefa | Dry-run | Notas |
|---|---|---|
| Iniciar tarefa | help + intent unit | Sem TTY timed |
| Entender plano | `/plan` + Plan copy P1 | |
| Pausar / retomar | Ctrl+P / `evolve pause\|resume` unit | Persistido StateDb |
| Aprovar | ApprovalFacade + painel | |
| Ver entrega | `evolve delivery show\|validate` | UNVERIFIED sem evidência |
| Handles | closeViewer ≠ kill | Soft-fail |

**Dry-run ≠ evidência de usabilidade humana.**

---

## 3. Cobertura automática (proxy)

- `v43-p0-*.ts`, `v43-p1-*.ts`, `v43-p2-*.ts`  
- Docs: `e2e-full.md`, `resilience.md`, `regression.md`

---

*MSO TASK V43-M4 — P2-3*
