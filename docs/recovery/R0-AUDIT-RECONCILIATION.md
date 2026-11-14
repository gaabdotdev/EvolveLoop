# R0 — Audit Reconciliation

**Created:** 2026-11-14T00:58:53.064319+00:00  
**Recovery branch:** `recovery/pre-v37-cert` @ `6dee950`  
**Worktree:** `/tmp/evolveloop-recovery`  
**Original audit pack (immutable):** `/home/gaab/Downloads/EvolveLoop-AUDIT-PRE-V37-20261113/final/`  
**Mutations to audit pack:** NONE

## 1. Discrepancy 62 vs 53 — RESOLVED

| Claim | Value | Source |
|-------|------:|--------|
| Header in Master Register | "Total identified: **60**" | **ERROR** (under-count) |
| Executive report Total | **62** | Correct |
| Unique `EVOLVE-REQ-*` rows parsed | **62** | This reconciliation |
| Duplicate IDs | **0** | |
| Tallies sum | **62** | |

### Why informal "53" appeared

`PASS(4) + PARTIAL(5) + FAIL(5) + UNVERIFIED(39) = 53`

The **nine** statuses omitted from that informal subset:

| Status | Count | IDs |
|--------|------:|-----|
| DEPRECATED | 2 | V21-001, V23-003 |
| SUPERSEDED | 1 | V25-001 |
| UNKNOWN | 6 | V3-006, BENCH-008, BENCH-009, V35-005, V35-006, V36-005 |

**Conclusion:** No requirements were deleted from the register. The "missing nine" are classification buckets excluded from a partial tally, plus a wrong header count (60). Executive tallies (62) match the table.

### Malformed rows (column shift → UNKNOWN)

These rows have unreliable Auditor/Gravidade columns and must be reclassified in R1:

- `EVOLVE-REQ-BENCH-009`
- `EVOLVE-REQ-V35-005`
- `EVOLVE-REQ-V35-006`
- `EVOLVE-REQ-V36-005`

## 2. Status tallies (authoritative R0)

| Status | Count |
|--------|------:|
| PASS | 4 |
| PARTIAL | 5 |
| FAIL | 5 |
| UNVERIFIED | 39 |
| SUPERSEDED | 1 |
| DEPRECATED | 2 |
| UNKNOWN | 6 |
| **Total** | **62** |

## 3. FAIL list (5)

['EVOLVE-REQ-PUB-001 — Public identity is EvolveLoop with entrypoint `/evolve`', 'EVOLVE-REQ-V22-001 — Working context ownership + inter-process resume + tamper reject', 'EVOLVE-REQ-V35-003 — Persistent scoped approvals', 'EVOLVE-REQ-BLOCK-001 — Single tip must integrate Measurement ∪ Runtime ∪ Ops OR declare multi-product', 'EVOLVE-REQ-BLOCK-002 — Harness real path under OS sandbox OR Gate S claims narrowed']

## 4. RCA inventory confirmation

Parsed from `EVOLVELOOP_ROOT_CAUSE_REGISTER.md` (not approximate):

See `ISSUE-AND-RCA-REGISTER.md` for full enumerated issues.

Seed register lists at least: LINEAGE-001 (CRITICAL), SEC-C01/C02 (CRITICAL), ARCH-DUAL-EVOLVE-001 (CRITICAL), SEC-H03-PATH (CRITICAL), plus multiple HIGH.

Executive claimed CRITICAL≈5 HIGH≈13 — **treat as non-final until full enum in ISSUE register**.

## 5. Baseline policy for recovery

| Ref | Role |
|-----|------|
| `6dee950` | **Code baseline** for pre-V3.7 remediation + integrated tip candidate |
| `9d13978` | Documentary Gate 0 only — not product delivery |
| `c89949a` | V3.7 fabric — later phases; do not use to mask pre-V3.7 FAILs |


## Update on ISSUE-LINEAGE-001 vs tip `6dee950`

The forensic audit was performed primarily against `feature/bench-obs-v1` @ `92a8f3e`, which **lacks** `v3/ops` and V3.5 runtime modules.

The recovery baseline **`6dee950`** (first-parent: V3.6 tip `5c1df88` + MP cherry-picks) **contains**:
- `orchestrator/src/v3/ops/**` (identical tree to `5c1df88`)
- `orchestrator/src/v3/sandbox|runtime|approvals|security` (identical to `0992cd2` for those paths)
- `orchestrator/src/telemetry/measurement-plane/**` (identical to `92a8f3e`)

Therefore **content fragmentation for LINEAGE-001 is resolved at the code-tree level on `6dee950`**.
It remains **NOT** `INTEGRATED_TIP_VALIDATED`: no re-run battery on this SHA was recorded in the forensic pack.
Status for recovery: `REMEDIATED_CONTENT_PENDING_REVALIDATION`.


## 6. External blocks (current)

- `WIKI_ROOT` unset → knowledge grounding cannot be `applied`
- Tailscale `gaab-1` offline → multi-host E2E BLOCKED
- Graphify CLI historically absent → must not PASS-empty

## 7. Decision after R0

Proceed to R1 matrix freeze + R2 remediation on `recovery/pre-v37-cert`.  
**No TRUE_FULL_PASS.** Original audit decision **FAIL STRENGTHENED** remains the starting point.
