# V4.3 — Resiliência (§6)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §6 — Testes de resiliência  
**Harness:** `orchestrator/tests/unit/v43-p2-e2e-resilience.test.ts`  
**Regra:** falha honesta > falso sucesso; evidências não inventadas.

---

## Cenários

| # | Cenário | Como | Resultado | Status |
|---|---|---|---|---|
| 1 | Encerrar abruptamente processo de agente | Registry / Handles soft-fail; kill live | Soft-fail documentado; kill live **LIMITATION** | **PASS parcial** (unit) + LIMITATION TTY |
| 2 | Encerrar só a janela de visualização | `closeViewer()` | `killed_agent=false`; session não cancelada | **PASS** (unit) |
| 3 | Reiniciar CLI durante execução | Pause StateDb `journey_task_pause` + `evolve resume` | Pausa sobrevive restart se StateDb intacto | **PASS** (unit) + LIMITATION mid-lease kill |
| 4 | Indisponibilidade de provider | `adapter_status: "error"` | Delivery **FAILED** | **PASS** (unit) |
| 5 | Falha de persistência (simulada) | `chmod` dir `.evolveloop` após DB criada | Throw ou sem claim de sucesso inventado | **PASS** (unit; FS-dependent) |
| 6 | Idempotência de retomada | `resumeJourneyTask` ×2 | `paused=false` estável | **PASS** (unit) |
| 7 | Estados antigos ≠ ativos | Agent `REPLACED` → `classifyHandleLifecycle` | `replaced` / continuity UI; ≠ `active` | **PASS** (unit) |
| 8 | Evidências/consumo não inventados | Ledger vazio → HonestMetric UNAVAILABLE | Sem silent 0 reported | **PASS** (unit) |

---

## LIMITATION

- Kill real de processo agent / Ink mid-flight: sem harness OS signal nesta fatia.  
- Persistência fail depende de permissões FS (alguns mounts ignoram chmod em dir).  
- Viewer≠kill validado em API; pane tmux vivo = LIMITATION herdada V4.1.

---

## Comandos

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v43-p2-e2e-resilience.test.ts
```

---

*MSO TASK V43-M4 — P2-1*
