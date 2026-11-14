# Dependency & Ownership Map (R0)

**Created:** 2026-11-14T00:59:55.095079+00:00  
**Baseline:** `6dee950`

## Single sources of truth (target)

| Domain | Owner module | Must NOT duplicate |
|--------|--------------|-------------------|
| Core TaskGraph / Goal | `orchestrator/src/v3/core/**` | Second core under legacy MegaBrain branding |
| Coordinator Daemon / IPC | `orchestrator/src/v3/runtime/**` | Second daemon in ops without ADR |
| Approval Broker | `orchestrator/src/v3/approvals/**` | Ad-hoc approval paths bypassing broker |
| Sandbox / bubblewrap | `orchestrator/src/v3/sandbox/**` | Claims of isolation without sandbox |
| GlobalOps / registries | `orchestrator/src/v3/ops/**` | Parallel project registries |
| EventBus | one bus in runtime/core | Second Measurement EventBus |
| Measurement Plane | `orchestrator/src/telemetry/measurement-plane/**` | Parallel metrics without adapter |
| Evidence Bus (gates) | `memory/<feature>/evidence/` | Mixing with `.ai/sessions` or wiki vault |
| Wiki grounding | `$WIKI_ROOT` + skill wiki | Hardcoded author paths |

## Lineage content at `6dee950`

| Lineage | Present | Evidence |
|---------|---------|----------|
| V3 Core | yes | `orchestrator/src/v3/` |
| V3.5 Runtime | yes | sandbox/runtime/approvals/security |
| V3.6 GlobalOps | yes | `orchestrator/src/v3/ops/` |
| Measurement Plane | yes | `orchestrator/src/telemetry/measurement-plane/` |
| V3.7 Fabric | **no** | arrives at `c89949a` |

## Cross-lineage coupling risks

1. Dual evolve entry (`PUB-001` / `ARCH-DUAL-EVOLVE-001`)
2. ApprovalBroker offline from live harness (`SEC-C01`)
3. MP collector not subscribed to production EventBus (`MP-EVENTBUS-UNWIRED`)
4. Sandbox not wrapping LLM harness (`SEC-C02`)
5. Path boundary `startsWith` (`SEC-H03-PATH`)

## External dependencies

| Dep | Required for | Absent ⇒ |
|-----|--------------|----------|
| WIKI_ROOT vault | knowledge gate | BLOCKED / NOT_RUN — never PASS |
| Graphify CLI | graphify evaluator | UNAVAILABLE — never PASS |
| bubblewrap | sandbox claims | FAIL-CLOSED |
| Second Linux host | V3.7 multi-host | BLOCKED (gaab-1 offline) |
| Provider credentials | live harness | DRY_RUN ≠ LIVE |

## Worktree ownership (this mission)

| Worktree | Branch | Role | Writable? |
|----------|--------|------|-----------|
| `/home/gaab/Downloads/EvolveLoop` | `feature/bench-obs-v1` dirty | preserve | **NO** |
| `/home/gaab/Downloads/EvolveLoop-v35` | v3.5 | preserve | **NO** |
| brant / v36 tip | v3.6 | preserve | **NO** |
| `/tmp/evolveloop-v37` | fabric | V3.7 later | later |
| `/tmp/evolveloop-recovery` | `recovery/pre-v37-cert` | R0–R3 remediations | **YES** |
