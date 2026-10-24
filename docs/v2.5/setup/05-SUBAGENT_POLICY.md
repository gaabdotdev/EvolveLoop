# 05 - SUBAGENT POLICY: EvolveLoop V2.5

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-05 |
| **Max Recursion Depth** | 3 Tiers (Level 1 → Level 2 → Level 3) |
| **Max Concurrent Agents** | 4 Active Agents |
| **Status** | CANONICAL POLICY |
| **Last Updated** | 2026-10-24 |

---

## 1. When to Create Subagents

Subagents must be spawned with deliberate architectural justification. They are **NOT** a mechanism to offload trivial actions, but a technique for context isolation, parallel execution, and strict separation of operational concerns.

### Valid Justifications for Spawning a Subagent:
1. **Context Sandboxing:** An exploratory or forensic task requires reading hundreds of files or megabytes of logs that would exhaust or pollute the parent agent's context window.
2. **Separation of Authoring and Evaluation:** An independent verification or adversarial review step must be conducted by an agent with zero attachment to the authoring thought chain.
3. **Dedicated Mutation Execution:** The parent agent (e.g., Implementation Coordinator) maintains high-level coordination while a dedicated Executor performs file modifications within an isolated worktree.
4. **Isolated Parallel Workstreams:** Multiple independent modules or test suites can run simultaneously in distinct worktrees without race conditions.

### Invalid / Prohibited Uses:
- Spawning subagents for single-command bash executions.
- Spawning subagents to bypass architectural boundaries or avoid recording evidence.
- Chaining subagents recursively to avoid finishing a plan.

---

## 2. Hard Concurrency & Depth Limits

To guarantee stability, prevent out-of-memory faults, avoid API quota exhaustion, and eliminate runaway processes, EvolveLoop V2.5 enforces strict mathematical limits:

```
Level 1: Orchestrator (Root)
   │
   ├── Level 2: Domain Specialist (Max 3 active siblings)
   │      │
   │      └── Level 3: Focused Executor / Worker (Leaf node; CANNOT spawn further)
```

| Metric | Hard Limit | Enforcement Behavior |
| :--- | :---: | :--- |
| **Maximum Recursion Depth** | **3 Levels** | Any Level 3 agent has `EnableSubagentTools: false`. Attempting to spawn fails immediately. |
| **Global Concurrency Ceiling** | **4 Agents** | If 4 agents are actively running, subsequent spawns are queued until an active agent terminates. |
| **Timeout per Subagent** | **600s** | Monitored by the launcher; auto-killed if uncompleted. |

---

## 3. Context Isolation & Epistemic Hygiene

Subagents must be initialized with pristine, isolated contexts:
1. **No Shared Transcript Poisoning:** Subagents do not inherit the full conversational history of the parent. They receive only the formal Delegation Contract and required reference paths.
2. **Deterministic Inputs:** All domain knowledge must be passed via explicit file references or structured prompt templates.
3. **No Hidden State:** Subagents must not rely on environment variables set in previous ad-hoc commands. All environment dependencies must be declared in the contract.

---

## 4. Cycle & Deadlock Prevention

Recursive and circular agent calls can create infinite loops. The following safeguards are mathematically enforced:

1. **Acyclic Call Graph (DAG):**
   - An agent may only invoke agents strictly below its current hierarchy level.
   - Level 2 cannot invoke Level 2 peers; peer communication must route through Level 1 (Orchestrator).
   - Level 3 cannot invoke any agent.
2. **Non-Blocking Reactive Messaging:**
   - Polling loops (`while true; sleep; check`) are strictly prohibited.
   - Agents must stop execution and await reactive notifications from the message broker when awaiting subagent completion.
3. **Max Remediation Cycles:**
   - If an executor's work is rejected by the Independent Reviewer, a maximum of **2 remediation cycles** is permitted. If the defect is not resolved by the second iteration, the subagent is terminated and the failure escalated to human intervention.

---

## 5. Clean Termination & Resource Teardown

Every subagent must conclude cleanly to ensure no orphaned processes or dangling locks remain:

```
[SUBAGENT ACTIVE]
       │ Task complete OR Error OR Timeout
       ▼
[FLUSH EVIDENCE]
       │ Persist all logs, diffs, metrics to disk
       ▼
[SEND COMPLETION MESSAGE]
       │ Deliver status + evidence path to parent via send_message
       ▼
[PARENT ACKNOWLEDGE & KILL]
       │ Parent validates receipt
       │ Parent issues manage_subagents(Action="kill") or process exits
       ▼
[TEARDOWN WORKTREE / SCRATCH]
       │ Cleanup temporary files, prune git worktree if transient
```

Failure to cleanly terminate subagents is audited as a resource leak.
