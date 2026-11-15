# M18 Wave 1 — Independent Review Note

| Field | Value |
|-------|-------|
| Reviewed artifact | `docs/v4/security/THREAT-MODEL-V4-INITIAL.md` @ commit `a733630` (first version) |
| Reviewer | Independent subagent (separate context, `generalPurpose`, did not author the model); read-only; restricted to worktree `EvolveLoop-v4-m18` |
| Review mandate | Try to invalidate the model with evidence; check M18-MISSION Wave 1 acceptance; find gaps and overclaims |
| Reviewer verdict | **ACCEPT_WITH_CHANGES** (Wave 1 initial threat model scope only) |
| Reviewer checks | `git diff 03937c1 HEAD -- orchestrator/src` empty (line refs valid on tip); one `node -e` run to test the redaction regex; no writes |
| Post-review disposition | All required changes applied by M18 **after re-verifying each reviewer claim in code** (see §3). Revised model is in the follow-up commit. |

This note does not approve V3.7 or V4. V3.7 remains **BLOCKED** (G17).

## 1. Finding-by-finding result (reviewer)

| ID | Reviewer status | Reviewer evidence notes (condensed) | Severity opinion |
|----|-----------------|-------------------------------------|------------------|
| F01 | CONFIRMED | Worse than stated: `engine.ts` L211–215 writes package `verified_task_state` into task graph when task is `PENDING`. | agree |
| F02 | CONFIRMED (understated) | `daemon.ts` L110 actor from payload; no `SO_PEERCRED` in code; `ipc.ts` L244–249 auto-loads privileged token; `cli/v35-commands.ts` L331–345 falls back to direct `store.approve()` (write to approvals dir suffices). Mitigation: bwrap does not mount home/data-dir → applies to out-of-sandbox executors (harness R05, host path). | agree; make conditional on out-of-sandbox executors |
| F03 | CONFIRMED | Broker always creates `max_uses: 1` (`broker.ts` L45). | agree |
| F04 | PARTIAL | RMW non-atomic is real, but on tip only the daemon’s broker consumes (`sandbox/manager.ts` L81, L118); concurrent double-consume not reachable on tip. `daemon.ts` L111 uses `approve()` not `decideOnce()`. | MEDIUM today; HIGH as V4 requirement |
| F05 | CONFIRMED | `assertFencing` single caller `service.ts` L565 (`submit_result`); `publish_artifact` granted (`service.ts` L531) but never fenced. | agree |
| F06 | CONFIRMED (scoped) | Callers are cancel only; key sanitization lossy (`a/b` ≡ `a_b`). | agree as reuse hazard |
| F07 | CONFIRMED | — | agree |
| F08 | PARTIAL | “rg returned nothing” inaccurate: `assertRunId` / `assertFeatureId` exist (not central, not used by V3 stores). Real `work_id` vector is `registerWork` (`service.ts` L126–153). | agree |
| F09 | CONFIRMED | Consumers of `trust` not reviewed. | agree as requirement |
| F10 | CONFIRMED | `reported_by` defaults to the plane itself (`envelope.ts` L71). | agree |
| F11 | CONFIRMED (understated) | `sk-proj-…` and `sk-ant-api03-…` not redacted; `SandboxProfile.redact_patterns` unused and uses invalid JS `(?i)`. | agree |
| F12 | CONFIRMED | `next_action` persisted in event log and ledger (`engine.ts` L231, L246) → second-order injection. | agree |
| F13 | CONFIRMED | No caller passes `fencing_epoch`; `issue()` check-then-act. | agree |
| F14 | CONFIRMED | `DEFAULT_DENIED_PATHS` contains `/home` → absolute vs relative path inconsistency demonstrates raw-path matching. | agree |
| F15 | PARTIAL | Docstring L154 says ⊆, code does ⊇; explicit `substitute_agent_id` accepted with no checks (L183, L205); default path spawns with copied permissions. | HIGH if explicit path exposed; else MEDIUM |
| F16 | PARTIAL | Missing line (L31); only caller `mock-provider.ts` L81; `builders.ts` also uses constants and confidence threshold. | LOW ok |

## 2. Acceptance checklist (reviewer)

| Criterion | Reviewer result on `a733630` | After M18 changes |
|-----------|------------------------------|-------------------|
| Covers Continuity, Effects, Capsule, Policy, Proof, Observability authenticity | PASS | PASS |
| Findings have severity, requirement, evidence, owner | PASS (F-items); PARTIAL (D-items lacked requirement column; F16 lacked line) | PASS (column added; F16 line added) |
| Wave 1 job items 1–9 | PASS (item 9 with caveat on phase timing) | PASS (★ minimum negative cases moved into Phase 2/3 gates) |
| `M18-WAVE1-DELIVERY.md` | FAIL (absent) | PASS (created) |
| Independent review note attached | FAIL (pending) | PASS (this file) |
| No product code; commits only on M18 branch | PASS | PASS |

## 3. Required changes and M18 disposition

Each reviewer claim used below was re-checked by M18 in code before applying (CLI fallback L331–345; no `peercred` match; `sk-proj-`/`sk-ant-` regex test returned `false`; `redact_patterns` has no consumer; `assertFencing` single caller; `assertRunId`/`assertFeatureId` exist; `registerWork` has no format validation; `provider-discovery.ts` L13–33/L62–87; `cp-secret.bin` at `service.ts` L594; `builders.ts` constants).

| # | Reviewer required change | Disposition |
|---|--------------------------|-------------|
| 1 | Create delivery doc and attach review note | Done: `M18-WAVE1-DELIVERY.md`, this file |
| 2 | Correct F04, F08, F15, F16 | Done: F04 → MEDIUM on tip / HIGH as V4 hazard with reachability note; F08 cites existing validators and `registerWork`; F15 adds explicit-substitute path and docstring contradiction; F16 adds L31 and `builders.ts` constants |
| 3 | Strengthen F02 (CLI fallback, bwrap qualification) and F11 (`sk-proj`/`sk-ant`, dead `redact_patterns`) | Done |
| 4 | Add gaps 1–6 as D-items with requirement and owner; add requirement column | Done: D15 Goal Contract integrity, D16 artifact store/publication, D17 supply chain, D18 enrollment/CA/plaintext, D19 backup/restore rollback, D20 incident response |
| 5 | Phrase F05(a) and F06 as properties, not mechanisms | Done: “no unclassifiable external effects”, “crash before outcome ⇒ UNKNOWN”, “one in-flight attempt per key” |
| 6 | Test plan: minimum negative cases in Phase 2/3 gates; align Wave/Phase terminology | Done: ★ cases, Phase mapping paragraph, S14/S15 added |

Optional suggestions — disposition: gap 7 (ADR/code drift on `SO_PEERCRED`) recorded in TB1 row and M00 owner line; gap 8 (budget `{}` on substitute) recorded as unverified open question in §11 Limitations; second-order `next_action` injection added to F12 and D10; `decideOnce` unused in daemon noted in F02/F04.

## 4. Residual disagreements

None. M18 accepts all reviewer corrections. The reviewer’s overclaim notes (F04 “two workers”, F08 “rg returned nothing”) were accurate and are corrected in the revised model.

## 5. What this review does not establish

- No dynamic/adversarial testing was performed by either author or reviewer.
- The review covers the threat model document, not M00 contracts (not read in this launch).
- A further independent pass is expected when M00 contracts freeze (re-map findings to contracts) and in Phase 8 (final M18 review), per MASTER-PLAN.
