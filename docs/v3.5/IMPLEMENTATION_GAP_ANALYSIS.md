# EvolveLoop V3.5 — Implementation Gap Analysis

**Base:** tag `v3-complete` → commit `6b69c3f8dfde36b0f0282accff3aae3595dcc6fd`  
**Branch:** `feature/v3.5-runtime` (worktree `/home/gaab/Downloads/EvolveLoop-v35`)  
**Audit date:** 2026-11-12  
**Spec:** `docs/v3.5/SPEC.md`  
**Knowledge grounding:** `GAP` — `WIKI_ROOT` / `RAG_REPO_ROOT` unset; grounding via vault/RAG blocked. Proceeding with repo ADRs + code evidence.

**Baseline verification:** `npm run build` PASS; `tests/unit/coordinator.test.ts` PASS.

---

## Summary

V3 delivers durable Core contracts (Goals, TaskGraph, Agents, locks, recovery, worktrees, adapter declarations, Engineering Loop deterministic demo). V3.5 gaps are concentrated in **OS sandbox**, **persistent service/IPC**, **process-tree supervision**, **approval broker**, and **honest harness runtime consolidation** — not in Core rewrite.

| Área | Estado no HEAD `v3-complete` |
|------|------------------------------|
| Core (Goals/Tasks/Agents/Locks/Recovery) | Funcional — **reutilizar** |
| Worktree Git | Funcional — **não é sandbox OS** |
| EngineeringWorkspace | Confinement `realpath` + spawn host — **lacuna OS** |
| CoordinatorService | Marca PID/estado — **não é daemon/IPC** |
| CliProcessAdapterDriver | Dry-run default + consent env — **parcial** |
| ProcessSessionStore | SIGTERM no PID principal — **sem árvore/PID-reuse** |
| Sandbox OS module | **Ausente** |
| Approval Broker | **Ausente** |
| CLI service/runtime/sandbox/approvals | **Ausente** (há `coordinator`/`adapters`) |

---

## Gap matrix

| Requisito | Implementação existente | Lacuna real | Ação | Teste/evidência |
|-----------|-------------------------|-------------|------|-----------------|
| Sandbox OS Linux | Nenhum módulo `sandbox/` | Sem namespaces/cgroups/bwrap; worktree ≠ sandbox | Backend bubblewrap + interface; fail-closed | Adversarial: traversal, symlink, net deny, bwrap missing |
| Filesystem policy enforced at exec | `capability-authority` + `EngineeringWorkspace.resolveSafe` | Confirmação só em API FS; filhos herdam host | Aplicar binds RO/RW via bwrap; negar home/secrets | Escape tests sob sandbox |
| Process tree cancel | `ProcessSessionStore.cancel` → `kill(pid,SIGTERM)` | Sem PGID/cgroup; sem PID reuse guard | Supervisor com `detached`/PGID + `/proc` starttime | Cancel tree + PID reuse |
| Network deny-by-default | Authority flag `allowNetwork` | Não aplica ao processo filho | bwrap `--unshare-net` por profile | Egress blocked test |
| Env/secrets minimize | Workspace `run` passa subset PATH/HOME/LANG | Harness pode herdar mais; sem redaction pipeline | Env allowlist + secret inject scoped | Leakage negative tests |
| Persistent Coordinator | `start()` persiste PID; `coordinator-supervise.sh` externo | Sem IPC; estados `paused`/`crashed` não usados; sem leader lock | Daemon + Unix socket + lease + lifecycle FSM | Kill CLI / kill coordinator / restart |
| Systemd integration | Template operator-only | Não instalável via CLI | `evolve service install` gera unit user + fallback foreground | Status/start/stop |
| Harness contract levels | `supported\|partial\|unsupported\|unknown` | Falta `PROBE_ONLY\|DRY_RUN\|BLOCKED` da spec | Estender matriz + classificação honesta | Contract tests por adapter |
| ≥2 harness real paths | Cursor Jobs + CLI process (consent) | Real depende de CLI/credenciais | Manter dry-run/probe; real quando disponível; senão BLOCKED | Probe + optional live |
| Session registry durable | JSON sob `process-sessions/` | Sem reconcile após restart do coordinator | Registry + supervisor loop | Restart reconcile |
| Workspace ownership/integration | WorktreeManager + EngineeringWorkspace | Sem merge queue, conflict ownership, rollback scoped | IntegrationCoordinator + ownership ledger | Concurrent conflict + human dirty + rollback |
| Approval Broker | Flags `confirm` / PLAN_APPROVED / env consent | Sem requests persistentes escopados | ApprovalStore + policy hooks + CLI | Approve/reject/expire/cancel/replay |
| CLI ops surface | `evolve coordinator|adapters|worktree|…` | Sem service/runtime/sandbox/approvals/workspace integrate | Extender `evolve.ts` | Help/exit codes |
| TUI as client | `tui status/run` local reads | Não é cliente IPC do serviço | TUI consulta IPC; sem SSOT local | Close TUI workflow continues |
| E2E integrated runtime | Engineering loop deterministic | Não cobre sandbox+service+approval+merge | Suite `tests/integration/v35-e2e*` | Evidence JSON gates |

---

## Snapshot observations revalidated

| Observação do snapshot | Status no HEAD |
|------------------------|----------------|
| Coordinator depende de caller/supervisor | **Confirmado** — `service.ts` comentário + `start()` só marca PID |
| WorktreeManager ≠ OS sandbox | **Confirmado** — `LIMITATIONS` explícitas |
| EngineeringWorkspace realpath + host spawn | **Confirmado** — `run()` = `spawnSync` host |
| CliProcess dry-run + consent | **Confirmado** |
| ProcessSession cancel = PID principal | **Confirmado** — sem descendants/PID reuse |
| CursorJobs = ExecutionBridge | **Confirmado** |
| Engineering Loop workers determinísticos | **Confirmado** — `loop.ts` LIMITATIONS |

---

## Environment primitives (Linux host audit)

| Primitive | Disponível |
|-----------|------------|
| `bwrap` (bubblewrap) | `/usr/bin/bwrap` |
| `unshare` | `/usr/bin/unshare` |
| cgroup v2 | `/sys/fs/cgroup` presente |
| `systemd --user` | `degraded` (presente, não healthy) |
| Caps efetivas | não privilegiado (`CapEff=0`) |

**Decisão preliminar sandbox:** bubblewrap rootless como backend Linux inicial (ADR a formalizar na Fase 2). Fail-closed se `bwrap` ausente e profile exigir sandbox.

---

## Protection notes

- Tag `v3-complete` preservada (`6b69c3f…`).
- Branch `feature/bench-obs-v1` **não** incorporada (worktree separado).
- Sem push; commits locais por fase/gate.

---

## Next (automatic)

Fase 1 → Security model + Policy enforcement + ADR threat model → Fase 2 sandbox → … até gates S/H/C/W/A/O/E2E/R.
