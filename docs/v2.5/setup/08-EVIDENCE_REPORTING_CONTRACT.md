# 08 - EVIDENCE REPORTING CONTRACT: EvolveLoop V2.5

| Metadata | Specification |
| :--- | :--- |
| **System** | EvolveLoop V2.5 Multiagent Operating System |
| **Document ID** | EL-V25-SETUP-08 |
| **Evidence Root** | `.evidence/v2.5/` |
| **Epistemic Standard** | 5-Tier Truth Classification |
| **Status** | CANONICAL CONTRACT |
| **Last Updated** | 2026-10-24 |

---

## 1. Epistemological Truth Taxonomy

In EvolveLoop V2.5, **no statement, metric, or outcome is accepted without an epistemological qualification**. Agents must tag every assertion, finding, or deliverable using one of the 5 standardized truth tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. VERIFIED_IN_CODE                                                    │
│    Directly grounded in literal code/config lines on disk.             │
├────────────────────────────────────────────────────────────────────────┤
│ 2. MEASURED                                                            │
│    Empirically verified via real command execution, tests, or telemetry│
├────────────────────────────────────────────────────────────────────────┤
│ 3. REPORTED_UNVERIFIED                                                 │
│    Documented in legacy comments/docs/issues, but not checked on disk. │
├────────────────────────────────────────────────────────────────────────┤
│ 4. INFERENCE                                                           │
│    Logical deduction, extrapolation, or hypothesis from known facts.   │
├────────────────────────────────────────────────────────────────────────┤
│ 5. DECISION_REQUIRED                                                   │
│    Contradiction, ambiguity, or choice requiring human architectural input│
└────────────────────────────────────────────────────────────────────────┘
```

### Citation Rule:
- Any claim tagged `VERIFIED_IN_CODE` MUST provide an exact file path and line number reference (e.g. `[src/core/parser.ts:42-55]`).
- Any claim tagged `MEASURED` MUST provide an exact evidence file reference containing raw tool output (e.g. `[.evidence/v2.5/tasks/del-001/test_run.json]`).

---

## 2. Physical Evidence Directory Hierarchy

All evidence generated during an orchestration cycle must be physically stored on disk in the structured `.evidence/v2.5/` hierarchy:

```
.evidence/v2.5/
├── logs/                         # Execution stdout/stderr and process telemetry
│   ├── <task-id>.log             # Combined execution stream
│   ├── <task-id>.meta.json       # Process metadata (duration, PID, exit code)
│   └── launcher.log              # Agent launcher audit log
├── tasks/                        # Task-specific evidence bundles
│   └── <delegation-id>/
│       ├── diff.patch            # Git diff produced by the task
│       ├── test_results.json     # Test runner output
│       ├── security_scan.json    # Security audit telemetry
│       └── EVIDENCE.md           # Task summary with citations
├── benchmarks/                   # Quantitative performance telemetry
│   └── <benchmark-id>.json       # Raw metrics, flamegraphs, memory profiles
└── manifests/                    # Phase and cycle completion manifests
    └── EVIDENCE_MANIFEST.yaml    # Master cryptographic bundle manifest
```

---

## 3. Standard Evidence Manifest Schema (`EVIDENCE_MANIFEST.yaml`)

Before any cycle can transition to completion or request final human approval, the **Documentation & Evidence Specialist** must compile and validate an `EVIDENCE_MANIFEST.yaml` at the root of the phase evidence:

```yaml
manifest_version: "2.5.0"
cycle_id: "cycle-20261024-v25-setup"
timestamp: "2026-10-24T17:40:00Z"
compiled_by: "doc_evidence_specialist"
orchestrator_session: "5c4471f5-6f60-42d4-b71d-1f0d726689a5"

tasks:
  - task_id: "task-001"
    delegation_id: "del-20261024-001"
    role: "v25_executor"
    status: "SUCCESS"
    artifacts:
      - path: ".evidence/v2.5/logs/task-001.log"
        type: "MEASURED"
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      - path: ".evidence/v2.5/tasks/del-20261024-001/diff.patch"
        type: "VERIFIED_IN_CODE"
        sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"

validations:
  test_pass_rate: "100%"
  tests_total: 42
  tests_passed: 42
  tests_failed: 0
  coverage_percentage: 88.5
  security_audit: "CLEAN"
  review_verdict: "APPROVED"
  review_ref: "docs/v2.5/reviews/task-001-review.md"

integrity_check:
  all_files_exist_on_disk: true
  hash_mismatches_detected: 0
  status: "CERTIFIED"
```

---

## 4. Physical Evidence Verification Gate

Before advancing between any two phases in the orchestration loop:
1. **Existence Verification:** The Orchestrator runs an automated check confirming every file path declared in the evidence manifest physically exists on disk and is non-empty (`test -s <file>`).
2. **Checksum Verification:** The sha256 hash of each file is calculated and compared to the manifest entry.
3. **Rejection on Virtual Claims:** If an agent claims a task is complete or a test passed, but the corresponding log or telemetry file is absent on disk, the phase transition is **INSTANTLY REJECTED** and logged as an integrity fault.
