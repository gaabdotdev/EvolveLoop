# 07 - APPROVAL & SAFETY POLICY: EvolveLoop V2.5

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-07 |
| **Core Principle** | Least Privilege & Explicit Human Approval |
| **Status** | MANDATORY SECURITY POLICY |
| **Last Updated** | 2026-10-24 |

---

## 1. The Golden Rule of Execution Safety

> **GOLDEN RULE:**
> The flag `--dangerously-skip-permissions` bypasses *interactive terminal prompt friction*; it **DOES NOT** grant unrestricted authority to execute destructive, external, or security-sensitive operations.
> 
> Any action classified as a **Protected Operation** requires **explicit, un-coerced human confirmation** before it may be initiated.

---

## 2. Operation Classification Tiers

All actions within EvolveLoop V2.5 fall into one of three rigid tiers:

```
┌─────────────────────────────────────────────────────────────┐
│  TIER 1: AUTONOMOUS OPERATIONS                              │
│  (Executed freely within authorized workspace and scopes)   │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: PROTECTED OPERATIONS                               │
│  (STRICTLY HALT for explicit human approval)                │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: FORBIDDEN OPERATIONS                               │
│  (PERMANENTLY BLOCKED; violation triggers shutdown)         │
└─────────────────────────────────────────────────────────────┘
```

### Detailed Classification Matrix:

| Operation Category | Specific Actions | Permitted Tier | Required Approval |
| :--- | :--- | :---: | :---: |
| **Workspace File Reading** | `view_file`, `cat`, `grep`, `find`, read docs/code | **Autonomous** | None (Auto) |
| **Scoped File Editing** | Modifying authorized files inside task worktree | **Autonomous** | Contract Bounds |
| **Local Test Execution** | `npm test`, `pytest`, `vitest` | **Autonomous** | None (Auto) |
| **Local Commit** | `git commit` within task worktree branch | **Autonomous** | Contract Bounds |
| **Merging to Base Branch** | `git merge task/...` into `GaabDevWeb/v.2.5` | **Protected** | Human Operator |
| **Package Addition/Removal** | `npm install <pkg>`, editing `package.json` | **Protected** | Human Operator |
| **Destructive File Cleanup** | `rm -rf`, recursive deletion of non-empty folders | **Protected** | Human Operator |
| **Environment Variable Mutation**| Editing `.env*` files or setting persistent vars | **Protected** | Human Operator |
| **Git Push / Publication** | `git push`, publishing npm packages, creating remote PRs | **Protected** | Human Operator |
| **Global OS Modification** | `sudo`, writing to `/etc`, `/usr`, `/var`, `/bin` | **FORBIDDEN** | NEVER ALLOWED |
| **Global Package Installation** | `npm install -g`, `pip install` without virtualenv | **FORBIDDEN** | NEVER ALLOWED |
| **Modifications Outside Workspace**| Touching files outside `/home/gaab/orca/workspaces/EvolveLoop/v.2.5` | **FORBIDDEN** | NEVER ALLOWED |
| **Secret / Key Exposure** | Printing or committing API keys, tokens, credentials | **FORBIDDEN** | NEVER ALLOWED |

---

## 3. Human Approval Gate Contract

When a task requires a Protected Operation, the Orchestrator MUST pause execution and render an Approval Request Artifact to the Human Operator containing:

```markdown
### ⚠️ HUMAN APPROVAL REQUIRED: PROTECTED OPERATION

- **Operation Type:** [e.g., Git Branch Merge / Dependency Addition]
- **Target:** [e.g., Merge branch `task/parser-fix` to `GaabDevWeb/v.2.5`]
- **Originating Agent:** `implementation_coordinator`
- **Associated Task ID:** `task-20261024-001`
- **Security Audit Status:** PASSED (Verified by `security_specialist`)
- **Review Verdict:** APPROVED (Verified by `independent_reviewer`)
- **Proposed Diff / Changes:** [Link to .diff or summary]
- **Potential Reversible Impact:** [Yes/No, Rollback steps]

*Awaiting Operator confirmation: [APPROVE] or [REJECT with notes]*
```

Execution is suspended until the operator responds.

---

## 4. Secrets & Hygiene Enforcement

1. **Zero Secret Persistence:** Agents are forbidden from hardcoding, logging, echoing, or committing secrets, tokens, private keys, or passwords.
2. **Pre-Commit Secret Scanning:**
   Before any merge or commit verification, the `security_specialist` or test script executes secret pattern detection (checking for patterns matching `ghp_`, `AKIA`, private key headers, bearer tokens, or password strings).
3. **Environment Isolation:** Secrets provided via environment variables are never printed in debug logs or evidence artifacts. Evidence files containing secrets are immediately shredded.

---

## 5. Security Incident Protocol

If an agent attempts a **Forbidden Operation** (e.g. attempting `sudo` or modifying files outside `/home/gaab/orca/workspaces/EvolveLoop/v.2.5`):
1. The process is immediately terminated via `SIGKILL`.
2. A high-priority alert `SECURITY_VIOLATION_RAISED` is dispatched to the user.
3. The parent agent invalidates the delegation and discards all pending uncommitted diffs.
4. The system locks down until explicitly reset by the human operator.
