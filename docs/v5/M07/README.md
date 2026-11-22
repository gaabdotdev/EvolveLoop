# V5-M07 — Unified Experience (slice)

**Status:** implementado (mínimo verificável)  
**Depende de:** M01 Persistent Work Runtime  
**Tese:** Work-centric CLI + Simple/Advanced preference + CLI/TUI leem o mesmo Work state

> **Nota vs roadmap M00:** o blueprint M00 rotulava M07 como “Session & Workspace Views”. Este MSO entrega **Unified Experience** (CLI Work + mode preference + bridge). Session unify continua parcialmente coberto pelo dual-label Work/Task; Custom Workbench visual = LIMITATION.

---

## Objectivo

Completar a superfície `evolve work` (list + status summary), persistir preferência Simple/Advanced (ou documentar camadas de help), e garantir que TUI/CLI leem o mesmo `PersistentWorkRuntime`.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| `evolve work list` | `cli/work-surface.ts` | Lista Works do coordinator |
| `evolve work status` | idem + `runtime.statusSummary` | Workspace ou `--work-id` |
| Mode preference | `experience/mode-preference.ts` + `cli/mode-surface.ts` | `evolve mode simple\|advanced` → `.evolveloop/config.yaml` |
| Help layers | `cli/help-usage.ts` | Simple = journey; Advanced = help advanced |
| Work state bridge | `experience/work-state-bridge.ts` | `readSharedWorkState` / `workStatusForTui` |

## Fluxo

```text
evolve work list|status
  → readSharedWorkState → PersistentWorkRuntime.listWorks|statusSummary

evolve mode advanced
  → writeWorkspaceExperienceMode → experience.mode in config.yaml

TUI panel / CLI status
  → same WorkStatusSummary source (no second store)
```

## Aceitação mínima

- [x] `work list` + `work status` summary
- [x] Simple/Advanced preference persisted **ou** help layers documentadas + teste
- [x] Bridge CLI/TUI → mesmo work-runtime
- [x] LIMITATION Custom Workbench / full Ink redesign

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m07-experience.test.ts
```

## O que NÃO foi feito

- Custom Workbench visual / redesign Ink completo  
- Estudos de usabilidade humana (N=0)  
- Unificar stores MsoSession ⊕ ProcessSession (projeção só)  
