# Master Requirements Register (R0 revision)
**Source pack:** immutable under `/home/gaab/Downloads/EvolveLoop-AUDIT-PRE-V37-20261113/final`
**Rule:** DOC_PASS ≠ PASS. This revision fixes counting only; statuses from auditor unless noted.

| ID | Status | Severity | Promise |
|----|--------|----------|----------|
| EVOLVE-REQ-PUB-001 | FAIL | HIGH | Public identity is EvolveLoop with entrypoint `/evolve` |
| EVOLVE-REQ-PUB-002 | UNVERIFIED | MEDIUM | Default knowledge backend is Wiki via portable env |
| EVOLVE-REQ-PUB-003 | UNVERIFIED | HIGH | Personal GaabType is overlay, not forked core |
| EVOLVE-REQ-PUB-004 | UNVERIFIED | HIGH | Public release + fresh-clone battery must not be claimed until done |
| EVOLVE-REQ-V1-001 | UNVERIFIED | MEDIUM | Evolution subsystem is observation-first and gated |
| EVOLVE-REQ-V1-002 | PASS | HIGH | Must not claim full autonomy / production self-modification |
| EVOLVE-REQ-V21-001 | DEPRECATED | HIGH | Official main must not claim V2.1 freeze-ready without evidence |
| EVOLVE-REQ-V22-001 | FAIL | MEDIUM | Working context ownership + inter-process resume + tamper reject |
| EVOLVE-REQ-V22-002 | UNVERIFIED | HIGH | Token economy claims require separated metrics + quality gate |
| EVOLVE-REQ-V22-003 | UNVERIFIED | MEDIUM | Injected context respects provenance, obsolescence, code>wiki, isolation |
| EVOLVE-REQ-V22-004 | UNVERIFIED | MEDIUM | Handoff measurement publishes required fields |
| EVOLVE-REQ-V22-005 | UNVERIFIED | LOW | Tool adoption/rejection is auditable |
| EVOLVE-REQ-V22-006 | PARTIAL | MEDIUM | Benchmarks cited with config, model_id, n, dispersion, limitations |
| EVOLVE-REQ-V22-007 | PARTIAL | HIGH | Default compaction reinject not silently claimed |
| EVOLVE-REQ-V23-001 | UNVERIFIED | HIGH | Readiness classifier emits honest states without claiming sandbox |
| EVOLVE-REQ-V23-002 | UNVERIFIED | HIGH | Orca integration trail is not PASS unless `orca_trail_pass` |
| EVOLVE-REQ-V23-003 | DEPRECATED | HIGH | Core must not claim universal Orca client compatibility |
| EVOLVE-REQ-V23-004 | UNVERIFIED | HIGH | Dangerous ops require explicit user order |
| EVOLVE-REQ-V25-001 | SUPERSEDED | MEDIUM | UKS provides native in-process retrieval path with rollback flag |
| EVOLVE-REQ-V25-002 | UNVERIFIED | MEDIUM | Scope isolation prevents cross-project knowledge leak |
| EVOLVE-REQ-V25-003 | UNVERIFIED | LOW | Token-reduction claims require benchmark suite with provenance |
| EVOLVE-REQ-V25-004 | UNVERIFIED | MEDIUM | Shadow mode before default cutover |
| EVOLVE-REQ-V3-001 | UNVERIFIED | MEDIUM | Provider modes mock/real/discovery with no silent mock in real |
| EVOLVE-REQ-V3-002 | UNVERIFIED | MEDIUM | Authority fail-closed + realpath workspace + scrubbed shell env |
| EVOLVE-REQ-V3-003 | UNVERIFIED | MEDIUM | Coordination state ownership frozen per ADR |
| EVOLVE-REQ-V3-004 | PASS | HIGH | Must not claim exactly-once |
| EVOLVE-REQ-V3-005 | PASS | HIGH | OmniRoute not Core dependency until verified adapter |
| EVOLVE-REQ-V3-006 | UNKNOWN | HIGH | License change requires product decision |
| EVOLVE-REQ-V3-007 | UNVERIFIED | MEDIUM | TRUE_FULL_PASS only from durable integrity-checked evidence |
| EVOLVE-REQ-V3-008 | UNVERIFIED | MEDIUM | Harness matrix honest classifications |
| EVOLVE-REQ-V3-009 | UNVERIFIED | MEDIUM | Generalization ≥3 repos ≥10 tasks held-out |
| EVOLVE-REQ-V3-010 | UNVERIFIED | MEDIUM | Reliability failure injection + recovery |
| EVOLVE-REQ-V3-011 | PARTIAL | HIGH | Live LLM codegen not required for V3_COMPLETE |
| EVOLVE-REQ-V3-012 | UNVERIFIED | HIGH | Cost/token figures labeled proxy vs live |
| EVOLVE-REQ-V33-001 | UNVERIFIED | MEDIUM | Continuity, locks/fencing, cancel, parallel, worktrees |
| EVOLVE-REQ-V33-002 | UNVERIFIED | HIGH | Real harness spawn requires consent + provider_mode=real |
| EVOLVE-REQ-V33-003 | PASS | HIGH | Worktree ≠ OS sandbox |
| EVOLVE-REQ-V34-001 | UNVERIFIED | MEDIUM | Engineering loop contract→…→verify with independent review |
| EVOLVE-REQ-V34-002 | UNVERIFIED | MEDIUM | Harness matrix CLI |
| EVOLVE-REQ-BENCH-001 | PARTIAL | MEDIUM | Versioned measurement envelope + collector + local persist |
| EVOLVE-REQ-BENCH-002 | UNVERIFIED | MEDIUM | Trace hierarchy distinguishes requested/real/blocked spawn |
| EVOLVE-REQ-BENCH-003 | UNVERIFIED | HIGH | Usage provenance: reported ≠ estimated ≠ UNAVAILABLE; never invent |
| EVOLVE-REQ-BENCH-004 | UNVERIFIED | MEDIUM | Versioned A/B/C strategies with controlled repetitions |
| EVOLVE-REQ-BENCH-005 | UNVERIFIED | MEDIUM | Evaluation TRUE_FULL_PASS plumbing |
| EVOLVE-REQ-BENCH-006 | UNVERIFIED | MEDIUM | Reports/compare/export + ROI decomposition without treating depth as quality |
| EVOLVE-REQ-BENCH-007 | UNVERIFIED | MEDIUM | Retention + migrations + overhead + observe-only faults |
| EVOLVE-REQ-BENCH-008 | UNKNOWN | HIGH | Bench TUI/Dashboard explicitly deferred |
| EVOLVE-REQ-BENCH-009 | UNKNOWN |  | Live Gate L unlock with consent-scoped harness |
| EVOLVE-REQ-BENCH-010 | UNVERIFIED | HIGH | Must not rewrite `v3-complete` historical gate artefacts |
| EVOLVE-REQ-V35-001 | PARTIAL | MEDIUM | Linux bubblewrap sandbox fail-closed, network deny-by-default |
| EVOLVE-REQ-V35-002 | UNVERIFIED | MEDIUM | Coordinator daemon independent of CLI with durable state |
| EVOLVE-REQ-V35-003 | FAIL | MEDIUM | Persistent scoped approvals |
| EVOLVE-REQ-V35-004 | UNVERIFIED | MEDIUM | Workspace ownership/integration/rollback; human dirty preserved |
| EVOLVE-REQ-V35-005 | UNKNOWN |  | No claim of perfect isolation / IDE full control / multi-OS |
| EVOLVE-REQ-V35-006 | UNKNOWN |  | Bench-obs not required for V3.5 functional scope |
| EVOLVE-REQ-V36-001 | UNVERIFIED | MEDIUM | Global scheduler admission with priority/fairness/aging |
| EVOLVE-REQ-V36-002 | UNVERIFIED | MEDIUM | Multi-project isolation deny cross RW |
| EVOLVE-REQ-V36-003 | UNVERIFIED | MEDIUM | Hierarchical resource reserve/lease; UNAVAILABLE tokens refused |
| EVOLVE-REQ-V36-004 | UNVERIFIED | MEDIUM | Live ≥2 projects ≥3 workflows with overlapping harness |
| EVOLVE-REQ-V36-005 | UNKNOWN |  | No multi-host/SaaS/mandatory web dashboard claims |
| EVOLVE-REQ-BLOCK-001 | FAIL | CRITICAL | Single tip must integrate Measurement ∪ Runtime ∪ Ops OR declare multi-product |
| EVOLVE-REQ-BLOCK-002 | FAIL | CRITICAL | Harness real path under OS sandbox OR Gate S claims narrowed |

## Tallies

- DEPRECATED: 2
- FAIL: 5
- PARTIAL: 5
- PASS: 4
- SUPERSEDED: 1
- UNKNOWN: 6
- UNVERIFIED: 39

**Total: 62**
