# V4.3 — Release checklist

**Data:** 2026-11-22
**Atenção:** marcar itens só com evidência. **Não** assinalar “estável” sem gate §9.
**Gate:** [`gate-report.md`](./gate-report.md) → **liberar com ressalvas**.

---

## Pré-release

- [x] `cd orchestrator && npm run build` exit 0
- [x] `npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v4{1,2,3}-*.ts` exit 0 (`automated-test-results.md`)
- [x] Journey help: Task/Session, Ink default, tui=ops (`formatJourneyHelp`)
- [x] Advanced glossary: status L2 qualificados; sessions adapters≠harness
- [x] Copy UI: Agents / Orchestrator / Plan (sem Workers/MSO default)
- [x] Docs: quickstart, troubleshooting, known-limits, compat-matrix, migration-notes, identity-copy-map, redundancy-report, rollback-plan, deferred-decisions
- [x] P0 DONE + P1 DONE + P2 DONE no `implementation-backlog.md`
- [x] Handles default OFF (não forçar ON)
- [x] L3 groups ainda no advanced help
- [x] Credenciais: LIMITATION duas casas documentada (L-CREDS; sem unificar)

## Gate §7 / §9

- [x] E2E completo P2-1 — `tests/e2e-full.md` + vitest (**LIMITATION** TTY)
- [x] Benchmarks P2-2 — `baseline/comparative-final.md` (N=5)
- [x] Humano N≥1 P2-3 — **LIMITATION** N=0 em `usability-final.md`
- [x] Decisão: **liberar com ressalvas** (`gate-report.md`) — **não** liberar limpo

## Rollback

Ver [`rollback-plan.md`](./rollback-plan.md).

---

*MSO TASK V43-M4 — checklist actualizado com resultados P2/gate*

---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

**Gate REMED:** [`remediation/gate-report.md`](./remediation/gate-report.md) → **liberar com ressalvas** (N=0 humano; TTY Ink LIMITATION).

- [x] `npm run build` exit 0 (HEAD `53ad059…`, Node `v22.15.0`)
- [x] `npm test` **suite completa** 252/1408 pass exit 0 (não só v4*)
- [x] `npm run test:bench` 18 pass
- [x] `validate-v22-artifacts.sh` VERDICT PASS
- [x] pytest agent-setup (11) + wiki fixture (2) via venv
- [x] remed-m1…m6 57 pass + PTY `--help`
- [x] LIMITATIONs documentadas; **não** marcar estável / liberar limpo
