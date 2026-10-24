# 10 - SETUP & OPERATING GUIDE: EvolveLoop V2.5 Multiagent Architecture

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-10 |
| **Target Runtime** | Antigravity CLI / Engine |
| **Status** | CANONICAL GUIDE |
| **Last Updated** | 2026-10-24 |

---

## 1. Prerequisites & Environment Verification

Before initializing or operating the EvolveLoop V2.5 multiagent system, verify that the host environment satisfies all dependencies:

### 1.1 Essential Binaries
Run the following verification checks in the terminal:
```bash
# Verify Antigravity CLI
agy --version

# Verify Git version (2.30+ required for worktrees)
git --version

# Verify Node.js runtime (Node 20+ recommended)
node --version

# Verify Bash shell availability
bash --version
```

### 1.2 Base Directory & Workspace Bounds
All operations **must strictly reside** within:
```text
/home/gaab/orca/workspaces/EvolveLoop/v.2.5
```
Ensure current Git branch is set to the V2.5 track:
```bash
cd /home/gaab/orca/workspaces/EvolveLoop/v.2.5
git branch --show-current
# Expected: GaabDevWeb/v.2.5
```

---

## 2. Directory Layout of the V2.5 Setup

The architecture introduces a standardized, self-contained hierarchy:

```
/home/gaab/orca/workspaces/EvolveLoop/v.2.5/
├── docs/v2.5/setup/                  # Canonical Setup Deliverables
│   ├── 01-AGENT_REGISTRY.md          # 10 Agent roles and boundary definitions
│   ├── 02-ORCHESTRATOR_CONTRACT.md   # Orchestrator rights, duties, prohibitions
│   ├── 03-DELEGATION_PROTOCOL.md     # Formal delegation contracts and feedback loops
│   ├── 04-AGENT_EXECUTION_CONTRACT.md# agy CLI runtime specifications
│   ├── 05-SUBAGENT_POLICY.md         # Depth (3), concurrency (4) and cycle guards
│   ├── 06-WORKTREE_POLICY.md         # Git worktree isolation rules
│   ├── 07-APPROVAL_SAFETY_POLICY.md  # Protected vs autonomous operations
│   ├── 08-EVIDENCE_REPORTING_CONTRACT.md # Epistemic taxonomy and evidence manifests
│   ├── 09-FAILURE_RECOVERY_POLICY.md # partial, plan_reset, human_escalation
│   └── 10-SETUP_GUIDE.md             # This comprehensive operating manual
├── scripts/v2.5/                     # Operational automation scripts
│   └── agent-launcher.sh             # Canonical runner using agy --dangerously-skip-permissions
├── .evidence/v2.5/                   # Grounded evidence bus root
│   ├── logs/                         # stdout/stderr streams and metadata
│   ├── tasks/                        # Task-specific diffs and telemetry
│   ├── benchmarks/                   # Performance and profiling outputs
│   └── manifests/                    # Certified cycle evidence manifests
└── .worktrees/                       # Isolated Git worktrees for active tasks (ephemeral)
```

---

## 3. Launching Agents with the Agent Launcher Script

The canonical CLI entrypoint for launching isolated agent processes is `scripts/v2.5/agent-launcher.sh`.

### 3.1 Script Invocation Parameters
```text
scripts/v2.5/agent-launcher.sh \
  --role <agent-role> \
  --task-id <unique-task-id> \
  [--prompt "inline prompt" | --prompt-file "/path/to/contract.md"] \
  [--worktree "/path/to/worktree"] \
  [--timeout <seconds>] \
  [--model <model-name>]
```

### 3.2 Practical Execution Examples

#### Example 1: Launching Codebase Archaeologist for Forensic Research
```bash
./scripts/v2.5/agent-launcher.sh \
  --role codebase_archaeologist \
  --task-id task-arch-001 \
  --prompt "Perform forensic analysis on src/core/parser.ts. Tag findings with VERIFIED_IN_CODE." \
  --timeout 300 \
  --model flash
```

#### Example 2: Launching Dedicated Executor in an Isolated Worktree
```bash
# 1. Prepare worktree
git worktree add .worktrees/wt-task-impl-002 -b task/impl-002/parser-fix

# 2. Launch executor with delegation contract file
./scripts/v2.5/agent-launcher.sh \
  --role v25_executor \
  --task-id task-impl-002 \
  --prompt-file docs/v2.5/tasks/del-parser-fix.md \
  --worktree .worktrees/wt-task-impl-002 \
  --timeout 600 \
  --model inherit
```

---

## 4. End-to-End Orchestration Walkthrough

Here is the operational lifecycle for completing a feature or fix in EvolveLoop V2.5:

### Step 1: Objective Ingestion
Human operator issues a brief to the **Orchestrator**. The Orchestrator enforces the **Rule of One Objective**.

### Step 2: Forensic Archaeology
The Orchestrator dispatches a delegation to the **Codebase Archaeologist** (`codebase_archaeologist`).
The Archaeologist generates a forensic dossier (`RESEARCH_REPORT.md`) where every assertion is grounded as `VERIFIED_IN_CODE` or `MEASURED`.

### Step 3: Single-Objective Planning
The Orchestrator tasks the **Planner** (`planner`) with creating a DAG execution plan (`PLAN.md`), defining explicit `authorized_write_paths` and acceptance criteria for each sub-task.

### Step 4: Human Review of Plan
The Orchestrator renders the plan to the human operator. Once the operator clicks **Proceed**, the plan transitions to execution.

### Step 5: Implementation in Isolated Worktree
The **Implementation Coordinator** (`implementation_coordinator`):
1. Creates a transient Git worktree (`.worktrees/wt-<task-id>`).
2. Dispatches an executor subagent via `agent-launcher.sh` or `invoke_subagent`.
3. Executor applies changes strictly within `authorized_write_paths`.
4. Executor writes logs to `.evidence/v2.5/logs/<task-id>.log` and produces `diff.patch`.

### Step 6: Testing & Regression
The **Test & Regression Engineer** (`test_engineer`) executes test suites against the worktree, asserting zero regressions and 100% pass rates.

### Step 7: Independent Adversarial Review
The **Independent Reviewer** (`independent_reviewer`) audits the worktree diff and evidence logs. If criteria are met, an `APPROVED` verdict is rendered in `REVIEW_VERDICT.md`.

### Step 8: Evidence Packaging & Merge Gate
1. The **Documentation & Evidence Specialist** compiles `EVIDENCE_MANIFEST.yaml` with sha256 hashes of all artifacts.
2. The Orchestrator verifies that all referenced files physically exist on disk.
3. The Orchestrator requests human approval to merge the worktree into `GaabDevWeb/v.2.5`.
4. Upon approval, the branch is merged and the worktree pruned.

---

## 5. Verification & Health Check Checklist

To confirm that the V2.5 setup is operational and healthy, run:

```bash
# 1. Verify docs integrity (10 canonical setup documents)
ls -1 docs/v2.5/setup/ | wc -l
# Expected: 10

# 2. Verify script permissions
test -x scripts/v2.5/agent-launcher.sh && echo "Launcher is executable"

# 3. Verify evidence directory readiness
test -d .evidence/v2.5/logs && echo "Evidence bus is ready"
```
