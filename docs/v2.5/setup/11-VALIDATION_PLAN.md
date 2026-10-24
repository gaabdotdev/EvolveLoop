# 11 - VALIDATION PLAN: EvolveLoop V2.5 Acceptance Suite

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-11 |
| **Harness Path** | `.test-harness/` (Disposable Sandbox) |
| **Evidence Output** | `.evidence/v2.5/test-runs/` |
| **Status** | CANONICAL VALIDATION SPECIFICATION |
| **Last Updated** | 2026-10-24 |

---

## 1. Objective & Scope of Acceptance Testing

The purpose of the EvolveLoop V2.5 Acceptance Test Suite is to prove, with empirical and unforgeable evidence, that the 7 core architectural axioms and invariants of the multiagent runtime function properly prior to production dispatch.

All tests are conducted strictly within a disposable sandbox (`.test-harness/`) to prevent production pollution or side-effects.

---

## 2. Test Invariant Matrix & Epistemic Classification

The 7 acceptance tests (A through G) map to the core system guarantees:

| Test ID | System Invariant Tested | Verification Mechanism | Epistemic Classification |
| :---: | :--- | :--- | :---: |
| **Test A** | Antigravity CLI Runner & Identity Flags | Execution of `agent-launcher.sh` with `--dangerously-skip-permissions`, identity preservation, and telemetry persistence. | `MEASURED` |
| **Test B** | Mandatory Delegation & Coordinator Non-Authoring | Automated policy blocking of direct coordinator file writes; enforcement of formal JSON delegation to dedicated executor. | `MEASURED` |
| **Test C** | Recursive Delegation & Depth Limit Enforcement | 3-tier delegation simulation; verification that Tier 3 cannot spawn Tier 4 (`max_depth = 3`). | `MEASURED` |
| **Test D** | Adversarial Independent Review & Defect Detection | Review of deliberately flawed disposable fixture (`add(2,2) != 4`); verification of `REJECTED` verdict, followed by remediation and `APPROVED`. | `MEASURED` |
| **Test E** | Scope Isolation & Path Whitelist Enforcement | Interception and blocking of attempted writes outside `authorized_write_paths`. | `MEASURED` |
| **Test F** | Real Failure & Timeout Detection (Anti-Masking) | Validation that timeouts return exit code `124` (`TIMEOUT_EXPIRED`) and errors return non-zero without being masked as success. | `MEASURED` |
| **Test G** | Protected Operations Approval & Security Barrier | Verification that `git push` halts for human approval, forbidden `sudo` commands are permanently blocked, and authorized operations proceed. | `MEASURED` |

---

## 3. Test Specification Details

### 3.1 Test A: Antigravity Initialization & CLI Runner Integration
- **Command:** `scripts/v2.5/agent-launcher.sh --role test_engineer --task-id <id> --prompt <text> --timeout 3`
- **Acceptance Criteria:**
  1. `agent-launcher.sh` executes with `set -euo pipefail`.
  2. Log file created in `.evidence/v2.5/logs/<id>.log` containing launch metadata.
  3. Structured `.meta.json` generated with fields: `role`, `engine`, `status`, `exit_code`, `duration_ms`.

### 3.2 Test B: Mandatory Delegation & Coordinator Non-Authoring
- **Validation Protocol:**
  1. Coordinator role (`orchestrator` or `implementation_coordinator`) attempts direct mutation on a target source file; policy engine intercepts and rejects with non-zero exit.
  2. Coordinator formats a delegation contract (`delegation_contract.json`) targeting an executor.
  3. Dedicated executor subagent executes change inside assigned directory.
  4. Coordinator validates hash and accepts artifact.

### 3.3 Test C: Recursive Delegation & Depth Limit Enforcement
- **Validation Protocol:**
  1. Root Orchestrator (Depth 1) spawns Implementation Coordinator (Depth 2).
  2. Implementation Coordinator spawns Focused Executor (Depth 3).
  3. Depth validator checks `current_depth >= max_depth` (3).
  4. Focused Executor attempting to spawn Depth 4 is rejected with `DEPTH_LIMIT_EXCEEDED`.
  5. Focused Executor delivers structured payload upstream.

### 3.4 Test D: Independent Review & Deliberate Failure Catch
- **Validation Protocol:**
  1. Executor authors a disposable test fixture containing a deliberate flaw (`2 + 2 = 1003`).
  2. Independent Reviewer runner evaluates the fixture against spec.
  3. Reviewer rejects fixture with `VERDICT: REJECTED`.
  4. Remediation applied (`2 + 2 = 4`).
  5. Reviewer approves with `VERDICT: APPROVED`.

### 3.5 Test E: Scope Isolation & Boundary Protection
- **Validation Protocol:**
  1. Policy checks destination file against authorized canonical directory.
  2. Write inside authorized directory succeeds.
  3. Write to unauthorized sibling directory (`forbidden/`) is intercepted with `SECURITY_SCOPE_VIOLATION`.
  4. Assert forbidden file does not exist on disk.

### 3.6 Test F: Real Failure & Timeout Detection
- **Validation Protocol:**
  1. Launch process with 2-second timeout against long-running command.
  2. Launcher traps GNU timeout, terminates process, logs `exit_code: 124` and `status: "TIMEOUT_EXPIRED"`.
  3. Argument validation error must return exit code 2 and non-empty stderr.
  4. Assert neither failure is masked as 0 or SUCCESS.

### 3.7 Test G: Protected Operations Approval & Blocking
- **Validation Protocol:**
  1. Agent attempts `git push origin main` without human approval; intercepted and halted.
  2. Agent attempts `sudo` or global install; permanently blocked with exit code 126.
  3. Approved protected operation (`git merge` with approval token) is allowed to execute.

---

## 4. Execution Harness Command

The entire suite is executed via:
```bash
./scripts/v2.5/run-acceptance-tests.sh
```
All outputs are piped to `.evidence/v2.5/test-runs/acceptance-suite-<timestamp>.log` and serialized to JSON.
