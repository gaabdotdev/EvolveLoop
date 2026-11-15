# EvolveLoop V4 — Master Plan (Orchestrator)

**Status:** Phase 2 (V4.0) **RUNNING** — contracts FROZEN with reservations; M01/M02/M03/M06/M10/M12 launched  
**Provisional baseline:** `03937c175368715e893193fcfad09aac8474286b` (`recovery/v37-full-cert` tip; V3.7 **BLOCKED** on G17)  
**Integration branch:** `feature/v4-integration`  
**Thesis:** Work belongs to the system — not the agent, model, provider, or host.

## Operating rules

1. Orchestrator coordinates and validates; specialists implement; M19 integrates; M18/M20 invalidate claims.
2. No product code written by the orchestrator.
3. No modifications to `recovery/v37-full-cert` or V3.7 evidence trees.
4. Shared contracts owned by M00; frozen after independent architecture review.
5. Waves respect dependencies; do not launch all M01–M20 before M00 acceptance.

## Phase plan

| Phase | Focus | Metas | Gate to next |
|-------|-------|-------|--------------|
| 0 | Recon & baseline | Orchestrator | Inventory + matrix + worktrees exist |
| 1 | Architecture & contracts | M00; M18 threat model (RO) | M00 ACCEPTED + independent arch review; contracts frozen |
| 2 | V4.0 Work Substrate | M01, M02, M03, M06-min, M10-fund, M12-init | Vertical Intent→WorkProof slice green |
| 3 | V4.1 Continuity | M04, M05, M03-full, M06-handoff, M12-cont | Handoff/recovery without confirmed-state loss |
| 4 | V4.2 Adaptive Intel | M07, M08, M09, M12-pred, M17 | Measurable improvement vs fair baseline |
| 5 | V4.3 Trust | M10-full, M11, M18, M06-authz | Adversarial policy/security gates |
| 6 | V4.4 Engineering | M16 | Impossible Handoff Test PASS (real workload) |
| 7 | V4.5 Ecosystem | M13, M14, M15, M12-final, M17 | Conformant external executors + operable CLI/API/CC |
| 8 | Release | M19, M18-final, M17, M20 | All §15 APPROVED conditions or proven external BLOCK |

## Current wave

**Wave 1 (closing):**

- **M00** — ACCEPTED @ `1dea128` (package)
- **M18** — ACCEPTED Wave 1 @ `47155ec`
- **Freeze review** — RUNNING (`8cd94458-…`)
- **M19** — integrating M00+M18 into `feature/v4-integration` (`d1472461-…`)

**Wave 2** — READY to launch only after `CONTRACT-FREEZE.md` = FROZEN (or formal waiver)

## Exit criteria for Wave 1

- [x] M00 delivers domain model, versioned contracts, ADR register, ownership, conformance hooks
- [ ] Independent architecture review of M00 (separate agent/context) — in flight
- [x] M18 delivers initial threat model
- [x] Orchestrator validation → M00/M18 ACCEPTED
- [ ] Contracts frozen for Wave 2 (V4.0)

## Known external blocker (final APPROVED)

V3.7 G17 multi-host E2E remains BLOCKED until second Linux host. Per mission §1.2 / §15.22, final V4 APPROVED cannot be issued without certified V3.7 hash — even if all V4-independent work is complete → global **BLOCKED** by baseline dependency.

## Non-goals (enforced)

No own-LLM training center; no agent-count maximization; no early marketplace; no dashboard-before-engine; no exactly-once promise; no absolute replay determinism; no unrestricted autonomy.
