# EvolveLoop V3 — Implementation Status

**Finalization:** `V3_COMPLETE` — see `docs/v3/V3-COMPLETE.md` and `docs/v3/evidence/gate.v3-global.json`.  
**Acceptance matrix:** `docs/v3/V3_ACCEPTANCE_MATRIX.md`.

**Snapshot date:** 2026-11-11  
**Git branch:** `release/v2.1-freeze-preparation`  
**Master reference:** `docs/v3/EVOLVELOOP_V3_MASTER_DOCUMENT_v0.6.md`  
**Working tree:** may contain unrelated local WIP outside the V3 freeze set — freeze is defined by tag + evidence, not by a clean tree of every path.

Status vocabulary (mandatory):

| Status | Meaning |
|--------|---------|
| `IMPLEMENTED` | Real behavior wired into a flow + adequate tests |
| `PARTIALLY_IMPLEMENTED` | Real code exists but incomplete vs V3 contract |
| `EXPERIMENTAL` | Opt-in / measurement / flag-gated |
| `MOCK_ONLY` | Simulation only (tests or explicit mock mode) |
| `NOT_IMPLEMENTED` | Absent as a Core capability |
| `BLOCKED` | Cannot complete due to external dependency |
| `VERIFIED` | Implemented **and** reproduced in this session |

---

## 1. Baseline reproduction (this session)

| Check | Result | Evidence |
|-------|--------|----------|
| OS / Node / npm / Python | Linux 6.12.88+deb13-amd64 · Node v22.15.0 · npm 10.9.2 · Python 3.13.5 | shell |
| `scripts/v23/readiness.py --live` | `state: pronto` | JSON `pronto=true` |
| `ORCHESTRATOR_ROOT` in shell | unset until agents.env sourced; agents.env points to repo `orchestrator/` | `~/.cursor/agents.env` |
| `WIKI_ROOT` | unset at start → vault located at `/home/gaab/Documentos/gitHub/karpathyWiki` | grounding |
| Graphify subset CLI | `blocked` (`/tmp/graphify-skill-hardgate-venv/bin/graphify` absent) | gate |
| Wiki scout/search EvolveLoop | `no_hits` (corpus_size=837); silo `EvolveLoop/log.md` readable | GAP RAG pack |
| `npm run build` (orchestrator) | **PASS** (exit 0) | tsc |
| `npm run test:unit` | **273 pass / 4 fail / 277** (exit 1) | missing Python `tiktoken` |
| `npm run test:integration` | **20 pass / 1 fail / 21** (exit 1) | session-continuity integrity envelope |
| LICENSE | MIT | `LICENSE` L1 |
| Untracked literal jobs path | `orchestrator/${ORCHESTRATOR_JOBS_DIR:-$ORCHESTRATOR_ROOT/jobs}/` present | artefact; not product |

Unit failures are environmental (`tiktoken` import), not flaky. Integration failure: job without integrity envelope in session-continuity scenario.

**Baseline gate (Master §20.11):** **NOT approved** — build OK, suite not fully green, provider bootstrap still ambiguous until hardening lands, security hardening incomplete.

---

## 2. Capability map vs V3 pillars

| V3 capability | Status | Notes |
|---------------|--------|-------|
| Capability IR + validation | `IMPLEMENTED` | `orchestrator/src/ir/` |
| GraphStore (execution DAG) | `IMPLEMENTED` | Not Orchestration TaskGraph |
| Scheduler | `IMPLEMENTED` | No dedicated unit file; covered via engine |
| Capability / Provider Registry | `IMPLEMENTED` | ≠ Agent Registry |
| ProviderRouter | `IMPLEMENTED` | Lives beside MockProvider |
| PluginLoader | `IMPLEMENTED` | cursor-skill / deterministic / shell / mock |
| Deterministic providers | `PARTIALLY_IMPLEMENTED` | Works; confinement/env weak |
| CursorSkillProvider + jobs | `IMPLEMENTED` | Host bridge, not multi-harness adapters |
| PolicyEngine | `IMPLEMENTED` | Retries/gates/strategy |
| CapabilityAuthority | `PARTIALLY_IMPLEMENTED` | Permissive defaults; lexical paths |
| Evidence builders | `IMPLEMENTED` | Not Goal-Contract criteria binding |
| EventBus + JSONL | `IMPLEMENTED` | Per-run; not global Work Ledger |
| JobStore / pickup / resume | `IMPLEMENTED` | Integrity HMAC present |
| EngineCheckpoint | `PARTIALLY_IMPLEMENTED` | Graph snapshot; no hierarchy/handoff |
| MemoryStore | `IMPLEMENTED` | Feature-scoped; ≠ Work Ledger |
| KnowledgeStore / Wiki backend | `IMPLEMENTED` | External wiki CLI; no Nomic in Core |
| Session continuity (V22) | `PARTIALLY_IMPLEMENTED` | Process resume; 1 integration fail |
| Context budget/ranking (V22) | `PARTIALLY_IMPLEMENTED` / `EXPERIMENTAL` | Not full Context Intelligence |
| EvolveLoop V1 longitudinal | `IMPLEMENTED` (opt-in) | Distinct from V3 Coordinator |
| CLI `run-engine` / `run-jobs` | `PARTIALLY_IMPLEMENTED` | Internal runners; silent mock bootstrap |
| Product CLI/TUI | `PARTIALLY_IMPLEMENTED` | `evolve` CLI + `tui status` + minimal `tui run` |
| Coordinator Service (background) | `PARTIALLY_IMPLEMENTED` | supervise script + optional systemd user template |
| Goal Contract + Grill-Me in Core | `NOT_IMPLEMENTED` | Host skills exist; Core artefact absent |
| Orchestration TaskGraph | `NOT_IMPLEMENTED` | |
| Orquestrador-Mestre / leaders / planners | `NOT_IMPLEMENTED` | Small `Orchestrator` FSM ≠ Master |
| Agent Registry | `NOT_IMPLEMENTED` | |
| Delegation Contract | `NOT_IMPLEMENTED` | |
| Shared Work Ledger | `PARTIALLY_IMPLEMENTED` | JSONL + snapshot under `--data-dir/work-ledger/` |
| Continuity Engine / Handoff Package | `PARTIALLY_IMPLEMENTED` | Same-work substitute; cross-provider envelope only |
| Model Catalog / Jev / OmniRoute | `PARTIALLY_IMPLEMENTED` | Catalog + gated Jev paths; OmniRoute held (ADR-V3-0005) |
| Agent adapters (Claude/Codex/Antigravity/Cursor harness) | `PARTIALLY_IMPLEMENTED` | Catalog + drivers; Cursor invoke via ExecutionBridge; others fail-closed blocked |
| Nomic Embed Text semantic index | `NOT_IMPLEMENTED` | |
| TRUE_FULL_PASS global state machine | `NOT_IMPLEMENTED` | |
| License change (noncommercial) | `BLOCKED` | Product decision pending; MIT remains |

---

## 3. Critical findings (open until fixed + tested)

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| R1 | `run-engine` `setupProviders` silently registers `MockProvider` for non–cursor-skill IDs | High (result validity) | **VERIFIED fix:** `--provider-mode mock\|real` + fail-closed real (`provider-bootstrap.ts`); tests `provider-bootstrap.test.ts` |
| R2 | Authority `default_allow` + unknown caps treated as read-only | High | **VERIFIED fix:** allowlist + `unknown_capability_denied`; tests in `authority.test.ts` |
| R3 | Workspace path checks lexical only; FS follows symlinks | High | **VERIFIED fix:** realpath confinement; symlink unit test |
| R4 | `shellExecute` uses `shell:true` + full `process.env` | High | **VERIFIED fix:** scrubbed allowlist env (`shell-env.ts`); secret leak test |
| R5 | Checkpoint lacks Agent Registry / delegation / handoff fields | Medium (V3 continuity) | Open (design+ADR; ownership freeze ADR-V3-0003) |
| R6 | TOCTOU between `lstat` refuseSymlink and open | Medium | Open (follow-up) |
| ENV | Python `tiktoken` missing → 4 V22 P0 unit failures | Medium (baseline green) | Open / env |
| INT | session-continuity job integrity envelope | Medium | Open |

### V3.0 early deliveries (this session)

| Capability | Status |
|------------|--------|
| Goal Contract types + versioned filesystem store + deterministic `evaluateTrueFullPass` | `IMPLEMENTED` + wired via `evolve goal *` |
| Orchestration TaskGraph store (`task_id` ↔ engine ids, PLAN_APPROVED) | `PARTIALLY_IMPLEMENTED` + wired via `evolve task *` / hierarchy |
| Agent Registry (instances, heartbeat, leases, orphan reconcile, delegation) | `PARTIALLY_IMPLEMENTED` + `evolve agents *` |
| Coordinator Service skeleton (disk state survives CLI stop; tick/resume) | `PARTIALLY_IMPLEMENTED` — not an OS daemon; limitation declared |
| Coordination Event Log (JSONL append-only) | `PARTIALLY_IMPLEMENTED` (`evolve events list`) |
| Product CLI `evolve` (non-interactive) | `PARTIALLY_IMPLEMENTED` (`npm run evolve`) |
| Grill-Me → Goal Contract intake in Core | `IMPLEMENTED` (fail-closed `evolve grill apply|validate`; no LLM interviewer in Core) |
| Hierarchy spawn Master→Leader→Planner + PLAN_APPROVED gate | `PARTIALLY_IMPLEMENTED` (`evolve hierarchy spawn|approve`; no LLM execution) |
| Supervised tick loop | `PARTIALLY_IMPLEMENTED` (`scripts/v3/coordinator-supervise.sh` + `docs/v3/COORDINATOR_SUPERVISION.md`) |
| Continuity / Handoff Package | `PARTIALLY_IMPLEMENTED` (`evolve continuity handoff|apply|show`; substitute spawn; cross-provider envelope only) |
| TaskGraph → ExecutionEngine bridge | `PARTIALLY_IMPLEMENTED` (`evolve exec run --provider-mode real\|mock`; PLAN_APPROVED enforced) |
| Shared Work Ledger | `PARTIALLY_IMPLEMENTED` (append-only JSONL + snapshot; wired to coordinator/continuity/exec/hierarchy; `evolve ledger show\|rebuild`) |
| Agent adapter contracts (Cursor/Claude/Codex/Antigravity) | `PARTIALLY_IMPLEMENTED` (capability catalog + `handoff-envelope` with `auto_swap=false`; only Cursor has `jobs_pickup`) |
| Adapter drivers (fail-closed) | `PARTIALLY_IMPLEMENTED` (`evolve adapters drivers\|invoke`; Cursor→ExecutionBridge; Claude/Codex/Antigravity → `blocked`) |
| TUI status board (zero-dep) | `PARTIALLY_IMPLEMENTED` (`evolve tui status`; read-only board) |
| Interactive TUI (minimal readline) | `PARTIALLY_IMPLEMENTED` (`evolve tui run`; not full product TUI) |
| Model Catalog MVP | `PARTIALLY_IMPLEMENTED` (`evolve models seed\|list\|show\|enable`; metadata only) |
| systemd user unit template | `PARTIALLY_IMPLEMENTED` (`scripts/v3/systemd/evolveloop-coordinator@.service`; operator install) |
| Native Claude/Codex/Antigravity harness process drivers | `PARTIALLY_IMPLEMENTED` (CLI probe + dry-run prompt packages; real spawn gated by `EVOLVELOOP_HARNESS_CONSENT`; absent CLI → blocked) |
| Context Views (structural, disposable) | `PARTIALLY_IMPLEMENTED` (`evolve context view`; role-scoped) |
| Context View compaction + gated reinject | `PARTIALLY_IMPLEMENTED` (`evolve context compact\|reinject`; fidelity criteria; canonical stores untouched) |
| Budget tracker + stuck detection | `PARTIALLY_IMPLEMENTED` (`evolve budget show\|stuck\|record`; wired into coordinator tick) |
| Deterministic resource routing | `PARTIALLY_IMPLEMENTED` (`evolve route decide`) |
| Nomic Embed Text via Ollama | `PARTIALLY_IMPLEMENTED` (`evolve embeddings probe\|embed\|retrieve`) |
| Durable vector index (per work_id) | `PARTIALLY_IMPLEMENTED` (`index-build`/`index-search`; JSON under `--data-dir/vector-index`) |
| Compaction savings measurement | `PARTIALLY_IMPLEMENTED` (`evolve context savings`; tiktoken or PROXY; never invents) |
| Jev-style local decision path | `PARTIALLY_IMPLEMENTED` (`route probe-decision`; systemone 404 → unavailable) |
| OpenRouter Jev remote | `PARTIALLY_IMPLEMENTED` (key+consent gates; no silent remote) |
| OmniRoute | `NOT_IMPLEMENTED` (ADR-V3-0005 investigation hold) |
| Work locks + fencing tokens | `PARTIALLY_IMPLEMENTED` (`evolve lock *`; best-effort; ADR-V3-0006 no exactly-once) |
| Subtree recovery | `PARTIALLY_IMPLEMENTED` (`evolve recovery plan\|apply`; tick suggests only) |
| Git worktree isolation | `PARTIALLY_IMPLEMENTED` (`evolve worktree create\|list\|remove`; git only — not OS sandbox) |
| Coordinated cancel + idempotency keys | `PARTIALLY_IMPLEMENTED` (`evolve cancel apply --idempotency-key`; Core state only) |
| Controlled parallel schedule | `PARTIALLY_IMPLEMENTED` (`evolve parallel schedule\|ready`; TaskGraph slots only) |
| V3.3 failure-injection battery | `VERIFIED` (`evolve battery run`; `tests/unit/v33-resilience.test.ts` 6/6; evidence `memory/v3-phase0/evidence/gate.v33-resilience.json`) |
| Quota/limit classifier → handoff | `VERIFIED` (`evolve limits classify\|handoff`; unit + E2E) |
| Hierarchical budget rollup | `VERIFIED` (`evolve budget hierarchical`; coordinator tick) |
| Auxiliary agent spawn | `VERIFIED` (`evolve hierarchy aux`) |
| Cross-provider handoff apply | `VERIFIED` (`evolve adapters handoff-apply`; `auto_swap=true` for Core ownership; harness dry-run by default) |
| TUI resilience commands | `VERIFIED` (cancel/parallel/recovery/lock/handoff/hier-budgets) |
| V3.3 multiagent E2E | `VERIFIED` (`tests/integration/v33-multiagent-resilience.integration.test.ts`) |

### V3.3 gate (Master §21 — integral)

| Criterion | Result |
|-----------|--------|
| Handoff on LIMIT_REACHED / quota without losing verified TRUE_PASS | `VERIFIED` |
| Subtree recovery after leader loss | `VERIFIED` |
| Locks + fencing conflict/stale reject | `VERIFIED` |
| Worktree helper | `VERIFIED` |
| Cancel + idempotent replay / conflict | `VERIFIED` |
| Parallel cap on ready tasks | `VERIFIED` |
| Hierarchical budgets + stuck detection | `VERIFIED` |
| Auxiliary spawn under leader | `VERIFIED` |
| Cross-provider Core ownership transfer + optional CLI dry-run | `VERIFIED` |
| CLI harness drivers (Claude when present; Codex/Antigravity probe) | `VERIFIED` (dry-run); real spawn consent-gated |
| TUI actionable for cancel/recovery/parallel/handoff | `VERIFIED` |
| Failure + concurrency + limit + multiagent E2E | `VERIFIED` (31 related tests pass; evidence `gate.v33-integral.json`) |
| Exactly-once across crash races | **Explicitly NOT claimed** (ADR-V3-0006) |
| Kill IDE-attached external agent sessions | **NOT_IMPLEMENTED** (only Core-owned process-sessions PIDs) |

**V3.3 integral status:** **FROZEN** — see `docs/v3/V3.3-FREEZE.md` and `memory/v3-phase0/evidence/gate.v33-final-audit.json` (final audit 35/35 + battery pass; catalog/ownership fixes included).

---

## 4. Local changes preserved (not discarded)

Uncommitted / untracked at audit start include orchestrator job integrity work, V2.3 docs/scripts, graphify skill gate, AGENTS.md, research/, etc. Phase Zero documents are additive under `docs/v3/`. No `git reset` / stash drop performed.

---

## 5. V3.4 Engineering Loop

| Capability | Status |
|------------|--------|
| Engineering Loop service (stages + run snapshot) | `VERIFIED` (`evolve engineering run`) |
| Confined workspace mutations | `VERIFIED` (realpath; not OS sandbox) |
| Deterministic implement→fail→replan→fix→review | `VERIFIED` |
| Independent reviewer ≠ worker | `VERIFIED` |
| TRUE_FULL_PASS via Goal Contract evaluator + evidence | `VERIFIED` |
| Harness capability matrix | `VERIFIED` (`evolve harness matrix`; no false SUPPORTED) |
| E2E CLI engineering | `VERIFIED` (`v34-engineering-loop.integration.test.ts`) |
| Held-out LLM quality benchmarks | `NOT_IMPLEMENTED` (optional; not gate-blocking) |
| OmniRoute product default / LICENSE change / OS sandbox | unchanged holds |

Evidence: `docs/v3/evidence/gate.v34-engineering.json` · ADR-V3-0009
