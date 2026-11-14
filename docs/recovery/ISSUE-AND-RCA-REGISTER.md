# Issue & RCA Register (R0)

**Created:** 2026-11-14T00:59:55.094951+00:00  
**Sources:** immutable audit pack RCA + executive + critic + correction plan  
**Recovery tip:** `6dee950` on `recovery/pre-v37-cert`

## Severity policy

- CRITICAL/HIGH must be remediated before certification gates G6/G7/G20 can PASS.
- BLOCKER = external; cannot become PASS by code alone.
- Remediations require failing test → fix → revalidation on integrated tip.

## Consolidated issues (seed + forensic IDs)

| Issue ID | Severity | Audit status | Summary | Related REQ | Recovery status | Next action |
|----------|----------|--------------|---------|-------------|-----------------|-------------|
| ISSUE-LINEAGE-001 | CRITICAL | FAIL | Modules V3.5/V3.6/MP not co-present on audit tip 92a8f3e | EVOLVE-REQ-ARCH-001 / PUB-001 | REMEDIATED_CONTENT_PENDING_REVALIDATION | 6dee950 contains all three trees; functional revalidation pending R3 |
| SEC-C01 | CRITICAL | FAIL | ApprovalBroker not on production path | EVOLVE-REQ-SEC-001 / V35-001 | REMEDIATED_PENDING_INDEPENDENT | Daemon+SandboxManager+assertAllowed fail-closed; unit tests green |
| SEC-C02 | CRITICAL | FAIL | Harness/LLM not under bubblewrap; claims overstated | EVOLVE-REQ-SEC-002 | REMEDIATED_CLAIMS_NARROWED | REQUIRE_HARNESS_SANDBOX fail-closed + doctor harness_os_sandbox WARNING; live under bwrap still not default |
| ARCH-DUAL-EVOLVE-001 | CRITICAL | FAIL | Dual /evolve PDA vs engines without fail-closed | EVOLVE-REQ-PUB-001 | REMEDIATED_HONESTY | control-plane.ts + ADR-0001 + doctor WARNING; full unification deferred |
| SEC-H03-PATH | CRITICAL | FAIL | Path escape via startsWith prefix | EVOLVE-REQ-SEC-003 | REMEDIATED_PENDING_INDEPENDENT | isPathInsideRoot + unit tests; approval path_prefix hardened |
| JOB-INTEGRITY-001 | HIGH | FAIL | Job/result integrity gaps | EVOLVE-REQ-JOB-001 | OPEN | Integrity checks + negative tests |
| CI-NO-BUILD | HIGH | FAIL | CI lacks npm run build / typecheck gate | EVOLVE-REQ-CI-001 | REMEDIATED_PENDING_CI_RUN | ci.yml adds npm run build + dist smoke checks |
| GRAPHIFY-EMPTY-PASS | MEDIUM | FAIL | Graphify early return → PASS empty | EVOLVE-REQ-GATE-GRAPHIFY | REMEDIATED | it.skip via ctx.skip() when CLI/graph absent |
| MP-EVENTBUS-UNWIRED | HIGH | PARTIAL | Measurement Plane EventBus adapter unwired | EVOLVE-REQ-MP-001 | REMEDIATED_PENDING_TEST | ExecutionEngine attaches attachEventBusAdapter when dataPaths set |
| PUB-001 | HIGH | FAIL | Public promise / dual entrypoint integrity | EVOLVE-REQ-PUB-001 | OPEN | Align with ARCH-DUAL-EVOLVE |
| BLOCK-001 | BLOCKER | BLOCKED | External dependency block (host/wiki/provider) | — | OPEN | Environment |
| BLOCK-002 | BLOCKER | BLOCKED | Second environmental block | — | OPEN | Environment |
| BENCH-003 | HIGH | UNVERIFIED | Benchmark claim weakened after critic | EVOLVE-REQ-BENCH-003 | OPEN | Re-measure with provenance classes |

## IDs referenced across audit pack (inventory)

Count: 26

```
ARCH-DUAL-EVOLVE-001
ISSUE-ARCH-DUAL-EVOLVE-001
ISSUE-ARCH-EVENT-SSOT-001
ISSUE-CI-NO-BUILD-001
ISSUE-DOC-STATUS-DRIFT-001
ISSUE-ENV-TIKTOKEN-001
ISSUE-FUNC-CATALOG-DRIFT-001
ISSUE-INSTALL-BRAND-001
ISSUE-JOB-INTEGRITY-001
ISSUE-LINEAGE-001
ISSUE-MP-WIRING-001
ISSUE-ORCH-E2E-001
ISSUE-PKG-DEPS-001
ISSUE-SEC-C01
ISSUE-SEC-C02
ISSUE-SEC-H02-IPC
ISSUE-SEC-H03-PATH
ISSUE-SEC-H04-NET
ISSUE-SEC-H06-GATES
ISSUE-TEST-SILENT-SKIP-001
ISSUE-WIKI-GROUNDING-001
JOB-INTEGRITY-001
LINEAGE-001
PUB-001
SEC-C01
SEC-C02
```

## RCA section headers (from Root Cause Register)

- ISSUE-LINEAGE-001
- ISSUE-ENV-TIKTOKEN-001
- ISSUE-JOB-INTEGRITY-001
- ISSUE-WIKI-GROUNDING-001
- ISSUE-SEC-C01
- ISSUE-SEC-C02
- ISSUE-ORCH-E2E-001
- ISSUE-MP-WIRING-001
- ISSUE-ARCH-DUAL-EVOLVE-001
- ISSUE-ARCH-EVENT-SSOT-001
- ISSUE-FUNC-CATALOG-DRIFT-001
- ISSUE-CI-NO-BUILD-001
- ISSUE-TEST-SILENT-SKIP-001
- ISSUE-SEC-H03-PATH
- ISSUE-SEC-H04-NET
- ISSUE-SEC-H02-IPC
- ISSUE-SEC-H06-GATES
- ISSUE-PKG-DEPS-001
- ISSUE-INSTALL-BRAND-001
- ISSUE-DOC-STATUS-DRIFT-001

## Confirmation protocol (per issue)

For each CRITICAL/HIGH in R2:
1. Reproduce on `/tmp/evolveloop-recovery` @ `6dee950`
2. Cite file:symbol:line
3. Write negative test
4. Minimal fix
5. Commit with Issue ID + REQ ID
6. Independent re-run

## Note on counts

Executive approximate CRITICAL≈5 HIGH≈13 is **not final**. This register is the living enumeration; update after each remediation batch.


## Independent re-audit batch 1

Source: `docs/certification/RE-AUDIT-REPORT.md` (agent 29f4c363).

| Issue | Independent verdict | Follow-up applied |
|-------|---------------------|-------------------|
| SEC-H03-PATH | PASS | — |
| SEC-C01 | PASS | Doctor now live-probes broker+gateAction |
| SEC-C02 | PASS (narrowed) | Dedicated unit test added |
| SEC-H04-NET | PASS | — |
| CI-NO-BUILD | PASS | CI run on GitHub still pending |
| GRAPHIFY-EMPTY-PASS | PASS | — |
| MP-EVENTBUS-UNWIRED | PASS | Attach failures warn (strict opt-in) |
| ARCH-DUAL-EVOLVE | PASS (honesty) | `evolve` CLI defaults plane to v3_product_cli |
