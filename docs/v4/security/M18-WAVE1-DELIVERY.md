# M18 Wave 1 — Delivery Record

| Field | Value |
|-------|-------|
| Meta | M18 — Security & Adversarial Assurance (Wave 1: Initial Threat Model) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m18` · `feature/v4/m18-security` |
| Baseline | `03937c175368715e893193fcfad09aac8474286b` (provisional; V3.7 **BLOCKED** on G17 — never APPROVED) |
| Branch parent | `84fead0` (V4 bootstrap docs) |
| Merge to `feature/v4-integration` | **Not done** (M19 responsibility; not requested) |
| Self-assessed status | **DELIVERED for orchestrator validation** — M18 does not mark its own work ACCEPTED |

## 1. Deliverables

| File | Content |
|------|---------|
| `docs/v4/security/THREAT-MODEL-V4-INITIAL.md` | Assets, adversary model, trust boundaries, STRIDE per boundary, 16 evidence findings (F01–F16), 20 design threats (D01–D20), coverage map, multi-tenancy decision proposal, mitigation requirements by owner meta, adversarial test plan outline |
| `docs/v4/security/M18-WAVE1-INDEPENDENT-REVIEW.md` | Independent review note (verdict ACCEPT_WITH_CHANGES) and M18 disposition of each change |
| `docs/v4/security/M18-WAVE1-DELIVERY.md` | This record |

Commits: see `git log feature/v4/m18-security` — first commit `a733630` (threat model v1), follow-up commit (review incorporated + delivery + review note).

## 2. Method

1. Read normative sources: M18 mission; constitution ch. 3, 6, 9, 13, 15, 16 and §4.1–4.5, 4.10–4.13, 5, 7, 8; orchestrator mission M18 and peer-meta sections; `INVENTORY`, `BLOCKERS`, `MASTER-PLAN`, `REQUIREMENTS-MATRIX`.
2. Read V3.7 security docs on tip (read-only): `SECURITY`, `PROTOCOL`, `NODE-IDENTITY-AND-TRUST`, `FAULT-TOLERANCE`, `ARTIFACT-FABRIC`, `LIMITATIONS`, `risk-register`, ADR-V37-0002/0003.
3. Read-only code inspection of primitives that V4 is told to reuse (§6.3): continuity/handoff, approvals, coordinator IPC, idempotency, event log, work ledger, leases/fencing, security enforcer, secret redaction, evidence builders, measurement envelope, gate-result trust, provider discovery.
4. Independent review by a separate agent context; M18 re-verified every reviewer claim in code before incorporating.

No product code written; no `npm install`; no files outside `docs/v4/security/**`; V3.7 cert branch and evidence untouched; M00 worktree not read.

## 3. Findings summary by severity

### Evidence findings (grounded in tip code/docs; by inspection, none exploited)

| Severity | Count | IDs |
|----------|-------|-----|
| CRITICAL | 2 | F01 handoff package unauthenticated and source of substitute permissions/task state · F02 approver identity caller-asserted; out-of-sandbox executors can self-approve (incl. CLI store-write fallback) |
| HIGH | 7 | F03 approved grants never expire/revocable · F05 fencing only at result commit (not effects, not artifact publish) · F06 idempotency cannot represent UNKNOWN; races; lossy keys · F07 ledgers not tamper-evident/ordered/locked · F09 trust label read from payload · F11 secret redaction gaps (incl. `sk-proj-`/`sk-ant-`, arrays, dead `redact_patterns`) · F12 executor free text becomes next executor’s objective (+ second-order) |
| MEDIUM | 6 | F04 non-atomic grant consumption (HIGH as V4 hazard) · F08 unvalidated ids as path components · F10 provenance defaults to OBSERVED · F13 fencing epoch derived/regressible · F14 unversioned decisions + raw-path deny matching · F15 substitute selection unbounded/unchecked |
| LOW | 1 | F16 evidence confidence constants |

### Design threats (requirements; no V4 implementation yet)

| Severity | Count | IDs |
|----------|-------|-----|
| HIGH | 9 | D01 prompt injection · D02 capsule confidentiality · D03 capsule replay/rollback · D05 executor-reported effect state · D06 L0–L3 escalation · D08 replay/fork effects · D15 Goal Contract integrity · D16 artifact store/publication · D17 supply chain (skills/providers) |
| MEDIUM | 11 | D04 capability poisoning · D07 UNKNOWN abuse · D09 resource abuse · D10 Control Center/API · D11 ephemeral compute · D12 third-party manifests · D13 WorkProof forgery/staleness · D14 mid-work policy change · D18 enrollment/CA/plaintext · D19 backup/restore rollback · D20 incident response |

## 4. Owner metas for mitigations (requirements, not implementations)

| Owner | Findings / threats |
|-------|--------------------|
| M00 | F01, F02, F07, F08, F12, multi-tenancy ADR |
| M01 | D01, D15 |
| M02 | F07, F08, F11, F13, D09, D16, D19 |
| M03 | F04, F05, F06, D05, D07, D08, D19 |
| M04 | F01, F11, F12, F15, D02, D03, D09 |
| M05 | D08 |
| M06 | F09, F11, F16, D05, D13, D15, D16 |
| M07 | D06, D15 |
| M08 / M09 | F10, D04 |
| M10 | F02, F03, F04, F05, F11, F12, F14, D01, D06, D14, D18, D20 |
| M11 | F02, F07, F14, D13, D16, D17 |
| M12 | F10, F11, D07, D20 |
| M13 | F02, F05, D09, D11, D18 |
| M14 | D12, D17 |
| M15 | F02, F12, D10 |

### Items M00 must address before contracts freeze (filed, not imposed)

1. **Capsule ≠ grant** (F01): capsule carries verifiable references; authority re-derived by policy at acceptance and only narrows; state never written from capsule.
2. **V4 trust domain** (F02): an ADR stating whether executors may share the Control Plane’s OS identity/data access; ADR-V37-0003’s single-user assumption is incompatible with untrusted executors. Note ADR/code drift (`SO_PEERCRED` cited, not implemented).
3. **Event semantics** (F07): identity, order, tamper evidence, and projection atomicity (constitution §15.2 open decision).
4. **Canonical identifier grammar** (F08) enforced at every trust boundary.
5. **Data vs control typing** in capsule/evidence/event contracts (F12, F09).
6. **Multi-tenancy scope**: proposed out of scope for V4.0–V4.2 (threat model §8), pending ADR.

## 5. Independent review outcome

Verdict **ACCEPT_WITH_CHANGES**: 11 findings confirmed, 5 partially confirmed, 0 refuted. All six required changes applied after M18 re-verification; no residual disagreement. Details: `M18-WAVE1-INDEPENDENT-REVIEW.md`.

## 6. Acceptance self-check (M18-MISSION Wave 1)

| Criterion | Status | Where |
|-----------|--------|-------|
| Covers Continuity, Effects, Capsule, Policy, Proof, Observability data authenticity | Met | Threat model §7 |
| Findings have severity, affected requirement, evidence, owner meta | Met | §5 (F), §6 (D, requirement column) |
| Independent review note attached | Met | `M18-WAVE1-INDEPENDENT-REVIEW.md` |
| No product feature code | Met | Only `docs/v4/security/**` changed |
| Commits on M18 branch only; no merge to integration | Met | `feature/v4/m18-security` |

## 7. Limitations and open items

- Static analysis only; no adversarial test executed (scheduled Phase 2/3 ★ cases and Phase 5/8 suites, threat model §10).
- Partial code coverage (threat model §11); absence of findings in unread modules is not evidence of absence.
- M00 contracts not read in this launch — findings must be re-mapped once contracts freeze.
- Unverified: whether substitute `budget: {}` means unlimited (M10/M12 to confirm).
- Knowledge grounding GAP: `WIKI_ROOT` unset (B-WIKI); wiki log not updated for the same reason.
- V3.7 baseline is provisional and **BLOCKED**; line references may shift if the baseline changes.

## 8. Next M18 actions (later waves — not executed now)

- Re-review M00 frozen contracts against §9 requirements; reject contract freeze only with evidence.
- Review Phase 2/3 gate evidence for ★ negative cases.
- Phase 5: run S1–S10, S13, S14 adversarial suites; Phase 7/8: S11, S12, S15 and final security review.
