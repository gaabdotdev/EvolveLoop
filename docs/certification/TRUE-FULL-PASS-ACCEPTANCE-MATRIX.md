# EvolveLoop TRUE_FULL_PASS Acceptance Matrix

**Candidate branch:** `recovery/v37-full-cert`  
**Tip:** see `docs/certification/final/evidence/certified-tip.txt`  
**Baseline:** `7468a40` + ZIP overlay + structural remediations  
**Rule:** TRUE_FULL_PASS requires all mandatory gates PASS. BLOCKED/PARTIAL/FAIL/NOT_RUN/UNVERIFIED on mandatory gates forbid TRUE_FULL_PASS.

| Gate | Content | Status | Notes |
|------|---------|--------|-------|
| G0 | Git lineage, baseline, integration integrity | PASS | Isolated recovery branch; preserved refs untouched |
| G1 | Genesis + master requirements reconciled | PASS | 62 IDs; 62vs53 counting resolved historically |
| G2 | Core/Engineering Loop/Goal/Grill-Me/TaskGraph | PARTIAL | Unit engineering-loop PASS on tip; full R3 battery residual |
| G3 | Hierarchy, planner, delegation, shared memory | PARTIAL | Unit hierarchy/spawn PASS; deep revalidation residual |
| G4 | Handoff, continuity, recovery | PARTIAL | Continuity/handoff units PASS; multi-host missing |
| G5 | Harness/provider + local-first | PARTIAL | Live harness outside bwrap documented; REQUIRE_HARNESS_SANDBOX fail-closed |
| G6 | Security, Authority, sandbox, approvals | PASS* | mTLS + scrub + cancel + SEC-H02 ADR-0003 boundary; *cross-node still needs G17 |
| G7 | V3.5 Runtime + V3.6 GlobalOps on integrated tip | PASS | Integration v35 + v36 e2e PASS on tip (clean suites) |
| G8 | Measurement Plane, benchmark, evidence integrity | PARTIAL | tiktoken `.venv-measure`; measure units PASS; G18 −30% UNVERIFIED |
| G9 | V3.7 Node Identity/Trust | PARTIAL | mTLS unit PASS; multi-host live missing |
| G10 | V3.7 Worker Runtime | PARTIAL | Sandbox + cancel protocol E2E PASS; multi-host missing |
| G11 | V3.7 scheduling/pools | PARTIAL | Unit PASS; multi-host missing |
| G12 | V3.7 artifacts/workspaces | PARTIAL | Unit PASS; multi-host missing |
| G13 | V3.7 leases/fencing/stale rejection | PARTIAL | Unit/adversarial + cancel fence PASS; multi-host missing |
| G14 | V3.7 topology/steal | PARTIAL | Unit PASS; multi-host missing |
| G15 | V3.7 speculative execution | PARTIAL | Unit covered; multi-host missing |
| G16 | V3.7 cross-node Measurement/Fleet | PARTIAL | Honest local correlation; LIVE cross-node needs G17 |
| G17 | Multi-host live E2E | BLOCKED | `gaab-1` offline; automation requires post-revoke `result_accepted` |
| G18 | Token efficiency ≥30% median | UNVERIFIED | Meta proposed; not proven on tip |
| G19 | Install/CLI/TUI/doctor/docs | PARTIAL | CLI deliver/worker-serve added; doctor wiki still env-dependent |
| G20 | Full regression + independent re-audit + release readiness | PARTIAL | Suites 499/62+skip; Audit C ACCEPT_WITH_RESERVATIONS; **G17 BLOCKED** forbids APPROVED |

## Global verdict (current)

**`BLOCKED`** — **not** `TRUE_FULL_PASS` / **not** `APPROVED`.

Primary mandatory blocker: **G17**.
Secondary residual: AUD-V37B-05 (cancel protocol e2e), G18 UNVERIFIED.
