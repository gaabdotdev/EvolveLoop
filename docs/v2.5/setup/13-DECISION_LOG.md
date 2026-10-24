# 13 - ARCHITECTURAL DECISION LOG (ADR): EvolveLoop V2.5 Setup

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-13 |
| **Status** | CANONICAL ARCHITECTURAL RECORD |
| **Governance Engine** | Antigravity CLI Runtime |
| **Last Updated** | 2026-10-24 |

---

## 1. Overview & Decision Framework

This document records the foundational Architectural Decision Records (ADRs) established during the design, configuration, and verification of the EvolveLoop V2.5 Multiagent Architecture. Each record details the context, architectural decision, trade-offs, mitigated failure modes, and governance mechanisms.

---

## 2. Architectural Decision Records (ADRs)

### ADR-V25-01: Sandboxed Execution via Antigravity CLI with `--dangerously-skip-permissions`

- **Status:** `ACCEPTED` | **Tier:** `VERIFIED_IN_CODE`
- **Context:** Automated agent workflows stall indefinitely if the CLI runtime presents interactive terminal prompts requesting confirmation for every file read, edit, or command execution.
- **Decision:** All automated agent processes are launched using `agy --dangerously-skip-permissions`. To prevent catastrophic damage, safety is shifted from *interactive terminal prompts* to *programmatic sandboxing*: strictly whitelisted workspace scopes, Git worktree isolation, pre-execution delegation contracts, and mandatory human checkpoints for protected operations (`git push`, destructive operations, environment modifications).
- **Trade-offs:** Removes human review at the micro-command level in exchange for deterministic, non-blocking execution; requires bulletproof worktree isolation and post-execution review gates.
- **Mitigated Risks:** Terminal deadlocks, developer fatigue, orphaned interactive prompts.

---

### ADR-V25-02: Strict Prohibition of Code Authoring by Orchestrator and Coordinators

- **Status:** `ACCEPTED` | **Tier:** `VERIFIED_IN_CODE`
- **Context:** When orchestrators or coordinators attempt to directly write code or fix bugs, their context window becomes saturated with syntax details, causing loss of global execution state, hallucinated task completions, and lack of adversarial quality checks.
- **Decision:** The Orchestrator and Implementation Coordinator are strictly forbidden from authoring application code or test suites directly. All mutations must be delegated via formal contracts to dedicated, disposable Executor subagents.
- **Trade-offs:** Slightly higher token overhead for spawning dedicated executor contexts in exchange for total context isolation and role purity.
- **Mitigated Risks:** Context contamination, lost architectural oversight, rubber-stamping unverified diffs.

---

### ADR-V25-03: Single-Objective Planning Invariant for Planner

- **Status:** `ACCEPTED` | **Tier:** `VERIFIED_IN_CODE`
- **Context:** Multi-goal planning prompts consistently degrade in LLMs, leading to deferred edge cases, half-implemented secondary features, and untestable spaghetti diffs.
- **Decision:** The Planner agent is restricted to **exactly one atomic objective per planning cycle**. Broad epics must be decomposed into sequential, independently verifiable milestones before execution begins.
- **Trade-offs:** Requires multiple sequential cycles for large epics; eliminates scope creep and cross-feature regressions.
- **Mitigated Risks:** Combinatorial planning explosion, untested side objectives, scope drift.

---

### ADR-V25-04: 5-Tier Epistemological Truth Taxonomy

- **Status:** `ACCEPTED` | **Tier:** `VERIFIED_IN_CODE`
- **Context:** LLM agents routinely present assumptions, legacy comments, and optimistic extrapolations as absolute facts, leading to cascading architectural errors.
- **Decision:** Every claim, metric, and finding must be explicitly tagged with one of five epistemological tiers:
  1. `VERIFIED_IN_CODE` (Cites exact file and line numbers on disk).
  2. `MEASURED` (Backed by raw command output, benchmark, or test log).
  3. `REPORTED_UNVERIFIED` (Legacy doc or commit text not re-checked).
  4. `INFERENCE` (Logical deduction requiring empirical validation).
  5. `DECISION_REQUIRED` (Unresolved architectural contradiction).
- **Trade-offs:** Requires agents to provide file/line citations and telemetry logs; prevents phantom progress.
- **Mitigated Risks:** Hallucinated functionality, false positive test passes, stale documentation reliance.

---

### ADR-V25-05: Git Worktree Isolation for Parallel Mutation

- **Status:** `ACCEPTED` | **Tier:** `VERIFIED_IN_CODE`
- **Context:** Multiple agents operating within a shared working directory overwrite each other's changes, generate dirty git statuses, and make rollbacks nearly impossible without discarding unrelated work.
- **Decision:** Every implementation task runs in an isolated Git worktree under `.worktrees/wt-<task-id>`, branched from `GaabDevWeb/v.2.5`. Merging into the base branch is a Protected Operation requiring explicit independent review approval and human sign-off.
- **Trade-offs:** Modest local disk usage for worktrees; provides 100% clean isolation, trivial atomic rollbacks, and clean git histories.
- **Mitigated Risks:** Dirty tree race conditions, accidental cross-agent overwrites, messy merge conflicts.

---

### ADR-V25-06: Strict Recursion Limits (Depth 3) and Concurrency Cap (Max 4)

- **Status:** `ACCEPTED` | **Tier:** `MEASURED`
- **Context:** Unchecked agent recursion can trigger fork-bomb scenarios, out-of-memory panics, and massive API quota consumption.
- **Decision:** Enforce hard architectural limits:
  - **Depth Limit:** Maximum 3 levels (Level 1: Orchestrator → Level 2: Specialist → Level 3: Focused Executor). Level 3 agents have subagent tools permanently disabled (`EnableSubagentTools: false`).
  - **Concurrency Ceiling:** Maximum 4 concurrently executing agent processes across the workspace.
- **Trade-offs:** Deeply nested hierarchical delegation is disallowed; forces flatter, more manageable execution topologies.
- **Mitigated Risks:** Recursive agent storms, token exhaustion, process starvation.

---

### ADR-V25-07: Mandatory Adversarial Independent Review Gate

- **Status:** `ACCEPTED` | **Tier:** `MEASURED`
- **Context:** Agents that author code are inherently biased toward confirming their own solutions and consistently miss edge cases or regression bugs during self-review.
- **Decision:** No diff or deliverable may be integrated into the main branch without an explicit `APPROVED` verdict from the **Independent Reviewer** (`independent_reviewer`), an adversarial agent initialized with a clean context and strict verification criteria.
- **Trade-offs:** Adds an explicit review turn before task completion; catches defects prior to human gate check.
- **Mitigated Risks:** Self-affirming hallucinations, untested edge cases, silent regressions.

---

### ADR-V25-08: Physical Evidence Bus on Disk (`.evidence/v2.5/`)

- **Status:** `ACCEPTED` | **Tier:** `MEASURED`
- **Context:** Transcripts and ephemeral chat memories disappear when sessions reset, leaving zero durable audit trail for what was executed, tested, or measured.
- **Decision:** All execution streams, telemetry JSON files, diffs, test outputs, and cryptographic manifests are written to durable disk locations under `.evidence/v2.5/` (`logs/`, `tasks/`, `benchmarks/`, `manifests/`, `postmortems/`, `test-runs/`). Phase transitions check physical file presence and SHA-256 hashes.
- **Trade-offs:** Requires local disk I/O and hash verification; provides 100% durable auditability and replayability.
- **Mitigated Risks:** Unverifiable agent claims, lost execution histories, irreproducible benchmarks.

---

## 3. Governance & Lifecycle Status

| ADR ID | Title | Status | Review Frequency | Impact Scope |
| :---: | :--- | :---: | :---: | :--- |
| **ADR-V25-01** | Antigravity Sandboxed Execution | `ACCEPTED` | Quarterly | Global Runtime |
| **ADR-V25-02** | Coordinator Non-Authoring Invariant | `ACCEPTED` | Canonical | Orchestrator / Coordinator |
| **ADR-V25-03** | Single-Objective Planning | `ACCEPTED` | Canonical | Planner |
| **ADR-V25-04** | 5-Tier Epistemic Taxonomy | `ACCEPTED` | Canonical | All Agents |
| **ADR-V25-05** | Git Worktree Isolation | `ACCEPTED` | Canonical | Git & Implementation |
| **ADR-V25-06** | Recursion & Concurrency Limits | `ACCEPTED` | Canonical | Runtime & Launcher |
| **ADR-V25-07** | Adversarial Independent Review | `ACCEPTED` | Canonical | Quality Gate |
| **ADR-V25-08** | Physical Evidence Bus & Manifests | `ACCEPTED` | Canonical | Evidence & Audit |
