# 04 - AGENT EXECUTION CONTRACT: EvolveLoop V2.5

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-04 |
| **Execution Engine** | Antigravity CLI (`agy`) |
| **Mandatory Flag** | `--dangerously-skip-permissions` |
| **Log Directory** | `.evidence/v2.5/logs/` |
| **Last Updated** | 2026-10-24 |

---

## 1. Execution Engine & Mandatory Flags

In EvolveLoop V2.5, all automated CLI agent processes must be executed exclusively through the Antigravity CLI runtime using the mandatory flag:

```bash
agy --dangerously-skip-permissions [OPTIONS]
```

### Purpose of `--dangerously-skip-permissions`
- Ensures uninterrupted, non-blocking agent execution without interactive terminal approval prompts for individual file edits or standard shell commands.
- **Critical Safety Boundary:** This flag skips *terminal confirmation prompts*, but **DOES NOT** grant permission to violate workspace boundaries, bypass approval gates, push code to remote repositories, or execute destructive operating system commands. Safety is governed by workspace sandboxing, worktrees, and pre-execution delegation contracts.

---

## 2. Antigravity Launch Modes & Invocation Patterns

EvolveLoop V2.5 supports two distinct invocation paradigms depending on whether execution is orchestrated via shell automation or directly within an active agent session:

### Mode A: Antigravity CLI Process (`agy`)
Used by automation scripts (`agent-launcher.sh`), background daemons, and coordinator shell tasks.

| Parameter | Syntax | Description |
| :--- | :--- | :--- |
| **Prompt Inline** | `-p "..."` or `--prompt "..."` | Direct task instruction string. |
| **Prompt File** | `--prompt "$(cat path/to/prompt.md)"` | Reads structured instructions from a markdown contract. |
| **Model Selection** | `--model <model-name>` | Specifies the LLM (e.g. `inherit`, `flash`, `pro`). |
| **Working Directory** | Run within target worktree directory | Strictly scopes the execution context. |

#### Canonical Invocation Example:
```bash
agy --dangerously-skip-permissions \
  --model flash \
  --prompt "$(cat /path/to/contract.md)" \
  > ".evidence/v2.5/logs/${TASK_ID}.stdout.log" \
  2> ".evidence/v2.5/logs/${TASK_ID}.stderr.log"
```

---

### Mode B: Native Antigravity Subagents (`define_subagent` & `invoke_subagent`)
Used by the Orchestrator and Implementation Coordinator inside an existing Antigravity session.

1. **Subagent Definition (`define_subagent`):**
   ```json
   {
     "Name": "v25_executor",
     "Description": "Executes scoped code mutations within an isolated worktree.",
     "SystemPrompt": "You are a dedicated executor subagent for EvolveLoop V2.5...",
     "EnableWriteTools": true,
     "EnableMCPTools": true,
     "EnableSubagentTools": false
   }
   ```
2. **Subagent Invocation (`invoke_subagent`):**
   ```json
   {
     "TypeName": "v25_executor",
     "Role": "Scoped Code Executor",
     "Model": "inherit",
     "Workspace": "inherit",
     "Prompt": "Execute Delegation Contract del-20261024-001..."
   }
   ```
3. **Reactive Inter-Agent Messaging (`send_message`):**
   Subagents report completion, request clarification, and deliver evidence bundles via `send_message` referencing the parent `conversationId`. Polling is strictly forbidden.

---

## 3. Process Lifecycle & Execution Telemetry

Every agent execution launched via CLI must satisfy the following logging and telemetry lifecycle:

```
[LAUNCH] 
   │ Captures PID, Start Timestamp, Task ID, Role, Model, Worktree
   ▼
[EXECUTE]
   │ Pipes stdout & stderr to .evidence/v2.5/logs/<TASK_ID>.log
   │ Monitors timeout deadline (SIGTERM -> 5s -> SIGKILL)
   ▼
[CAPTURE]
   │ Records Exit Code, End Timestamp, Duration (ms), Disk Delta
   ▼
[PERSIST METRIC]
   │ Writes structured .evidence/v2.5/logs/<TASK_ID>.meta.json
```

### Telemetry Metadata Schema (`<TASK_ID>.meta.json`):
```json
{
  "task_id": "task-20261024-001",
  "role": "codebase_archaeologist",
  "engine": "agy --dangerously-skip-permissions",
  "model": "flash",
  "worktree": "/home/gaab/orca/workspaces/EvolveLoop/v.2.5",
  "pid": 48291,
  "start_time": "2026-10-24T17:30:00.000Z",
  "end_time": "2026-10-24T17:30:45.120Z",
  "duration_ms": 45120,
  "exit_code": 0,
  "log_file": ".evidence/v2.5/logs/task-20261024-001.log",
  "status": "COMPLETED"
}
```

---

## 4. Timeout & Dead Process Management

To prevent resource starvation and orphaned agent processes:
1. **Default Timeout:** 600 seconds (10 minutes) per task unless explicitly configured.
2. **Graceful Teardown:**
   - At timeout expiration, `SIGTERM` is dispatched to the agent process group.
   - The launcher waits 5 seconds for clean state flush and evidence persistence.
   - If the process fails to terminate, `SIGKILL` is dispatched.
3. **Failure Classification:** Timed-out processes are logged with status `TIMEOUT_EXPIRED` and an exit code of `124`.

---

## 5. Standardized Return Codes

| Exit Code | Semantic Meaning | Action Required |
| :---: | :--- | :--- |
| **0** | Success / Contract Completed with Evidence | Proceed to Independent Review |
| **1** | General Execution Error | Inspect stderr in log file |
| **2** | Invalid Invocation Arguments | Correct CLI arguments |
| **124** | Execution Timeout Expired | Re-evaluate task granularity or increase timeout |
| **126** | Binary Not Executable | Verify permissions on `agy` or launcher script |
| **137** | Process Killed by SIGKILL (OOM or Force) | Investigate memory leaks or process stalls |
