# EvolveLoop V3.6 — Gap Analysis

**Date:** 2026-11-12  
**Base:** `feature/v3.6-multi-workflow` @ `0992cd2` (V3.5 operational hardening)  
**Tags verified:** `v3-complete` → `6b69c3f`; `v3.5-runtime` → `07973fe` (immutable)  
**Bench branch:** `feature/bench-obs-v1@92a8f3e` — **not incorporated**

## Authority boundary

| Plane | Authority |
|-------|-----------|
| **Global Ops Plane** (`orchestrator/src/v3/ops/`) | Project/Workflow registries, admission, queue, fairness, deps, hierarchical reservations, team *plans*, quality gate *policy/run*, ops CLI/TUI |
| **Execution Plane** (V3.5 Coordinator/Core) | GoalContract, TaskGraph, agents, tick, harness, sandbox, worktrees, Approval Broker |
| **Measurement Plane** | Optional; unavailable metrics stay `UNAVAILABLE` |

Global Scheduler **does not** spawn harnesses, bypass sandbox, or elevate authority via priority.

## Component matrix

| Component | Estado real | Reutilizar | Alterar | Criar | Risco |
|-----------|-------------|------------|---------|-------|-------|
| Core / Engineering Loop | `v3/engineering/` | Sim | Integração pós-admissão | — | Médio |
| Coordinator Daemon | `v3/coordinator/` | Sim | Opcional tick ops | **Não** 2º daemon líder | Alto se duplicar |
| Task Scheduler | `v3/parallel/` + TaskGraph | Sim | — | — | Confundir com workflow scheduler |
| Agent Registry | `v3/agent-registry/` | Sim | Consome team plan | — | Baixo |
| Harness Runtime | `v3/harness/` | Sim | — | — | Médio |
| Security / Authority | `v3/security/` + `authority/` | Sim | — | Isolation guard ops | Alto |
| Sandbox | `v3/sandbox/` | Sim | — | — | Médio |
| Workspace / Worktree | `v3/workspace/`, `worktrees/` | Sim | Por projeto `data_dir` | Project Registry | Médio |
| Approval Broker | `v3/approvals/` | Sim | — | — | Médio |
| Continuity / Recovery | `v3/continuity/`, `recovery/` | Sim | + global reconcile | Global recovery | Médio |
| EventBus / Evidence | V3 event-log + evidence | Sim | — | Decisions JSON | Baixo |
| CLI / TUI | `cli/evolve.ts`, `v3/tui/` | Sim | Wire V3.6 groups | `v36-commands`, `ops-tui` | Baixo |
| Persistence | Atomic JSON + JSONL | Sim | Ops dirs | Ops layout | Médio (sem SQL) |
| **Project Registry** | Ausente | — | — | `project-registry.ts` | Médio |
| **Workflow Registry / FSM** | Ausente | — | — | `workflow-registry.ts` | Médio |
| **Global Scheduler** | Ausente | — | — | `global-ops-service.ts` | Alto |
| **Resource Manager** | Budgets locais | Parcial | — | `resource-manager.ts` | Médio |
| **Adaptive Teams** | Hierarchy spawn | Parcial | — | `team-composer.ts` | Médio |
| **Quality Gates** | Eval battery parcial | Parcial | — | `quality-gates.ts` | Médio |
| **Operations Center** | Status board | Parcial | — | CLI+TUI ops | Médio |

## Decisão de topologia

**Global Operations Service** = módulo + CLI no mesmo produto, estado em `--ops-dir` (host), invocando Core via `CoordinatorService.registerWork` no `data_dir` do projeto. **Não** é um segundo Coordinator com leader lock.

## GAPs abertos

- Wiki hybrid search: `no_hits` para silo EvolveLoop; pack `evolveloop` ausente.
- Live LLM E2E: BLOCKED sem `EVOLVELOOP_HARNESS_CONSENT` + credencial.
- Benchmark branch não ligada (contrato: opcional).
- Preempção segura de processos: só unidades pausáveis; kill arbitrário **não** implementado (conforme spec).
