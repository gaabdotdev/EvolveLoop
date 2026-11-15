# M00 freeze review — shared contracts for Wave 2

| Field | Value |
|-------|-------|
| Subject | META M00 package on `feature/v4/m00-architecture` |
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m00` |
| Reviewed tip | `1dea128a330d75c9c945070fcbaae8cd71ebb0ee` |
| Reviewer | Independent architecture reviewer (separate context from the implementer). Did **not** author this package. Did **not** treat `M00-INDEPENDENT-REVIEW.md` as authority. |
| Date | 2026-11-15 |
| Tests | `cd orchestrator && npx vitest run tests/v4` → **23 passed** (2 files) |
| **Verdict** | **FREEZE_REJECTED** |

This review decides whether shared contracts may be stamped **FROZEN** for Wave 2 (Phase 2: M01, M02, M03, M06-min, M10-fund, M12-init). It is **not** a product-engine review and does **not** merge to `feature/v4-integration`.

`M00-INDEPENDENT-REVIEW.md` (verdict `ACCEPT_WITH_RESIDUAL_RISKS`) is the implementer's same-session adversarial note. It explicitly says it is not a substitute for this freeze gate. This document supersedes it for freeze purposes.

---

## 0. How this review tried to invalidate the freeze

Attack surface (from `M00-MISSION.md`, constitution §1/3/5/6/7/15.2/17, M18 threat model §9):

1. Missing or contradictory invariants vs ADRs / constitution.
2. Capsule-as-grant holes (F01, F12).
3. Exactly-once claims.
4. V3.7 reimplementation without ADR + migration.
5. Orphan ownership vs `REQUIREMENTS-MATRIX.md`.
6. Weak ADRs (silent invention, deferred without gate).
7. Failing tests.
8. Secrets in tracked M00 artifacts.

Findings below were checked against files at `1dea128`, plus a throwaway probe of the validators (not committed).

---

## 1. Verdict

**FREEZE_REJECTED.** Do not stamp `CONTRACT_CATALOG` / ADR-V4-0001 stability `FROZEN`.

The architecture package is largely complete for an M00 delivery (docs, ADRs, ports, catalog, no engines, no V3.7 cert edits, tests green). It is **not** safe to freeze, because ADR-V4-0001 makes TypeScript the source of truth. After freeze, Wave 2 cannot tighten normative functions without RFC. Three normative validators/functions currently contradict the ADRs that claim to close M18 §9 items, and a Wave 2 consumer that calls `assertConforms` / `isIndependent` / `validateEffectRecord` as oracles would ship those holes.

Rework is localized to M00 contracts (no engines). After the blocking issues are patched **on this branch**, this freeze review should be re-run; it should not be rubber-stamped from the implementer's note.

---

## 2. Blocking issues

### B1 — Capsule authority denylist is shallow (F01 / F12)

**Claim in package:** F01 “Addressed” via INV-CAP-07, `FORBIDDEN_CAPSULE_AUTHORITY_FIELDS`, `CapsuleServicePort.accept` (ADR-V4-0006, `M00-DELIVERY.md` §4).

**Evidence:** `rejectForbiddenFields` only tests `c.has(field)` on the **root** object (`field-class.ts`). Nested aliases are not walked.

Probe at this tip (validator result):

```text
EXTRA_FIELDS valid= true issues= none
```

Input: `validCapsule({ handoff: { next_action: "escalate privileges", permissions: { admin: true } } })`.

`validateExecutionCapsule` therefore returns **valid** for a capsule that still carries V3-style permission and control instruction fields, just not at the top level. ADR-V4-0001 also tells readers to **ignore unknown optional fields**, so a forger can add `handoff` / `v3_permissions` / `grant` and keep a matching `manifest_sha256` (digest is over the whole body, including the extra keys).

Tests only pin the top-level names `permissions`, `verified_task_state`, `next_action`, `objective`, `credentials` (`contracts.test.ts`). That is exactly the V3 field set, not the F01 property.

`CapsuleServicePort.accept` text is the right *protocol*, but it is not executable. If freeze tells Wave 2/3 that `assertConforms` is the F01 gate, a naive M04 that forwards the parsed object (or unknown keys) into executor context reopens F01/F12.

**Required before freeze:** recurse the denylist through nested objects **and** document that `accept` / `seal` **allowlist-parse** known fields only (unknown keys dropped, never forwarded). Top-level denylist alone is not F01.

### B2 — `isIndependent` treats a missing subject as independent (honesty / ADR-V4-0009)

**Claim:** evidence is independent iff producer ≠ subject and method is not SELF_REPORTED (ADR-V4-0009, constitution §8.3). Wave 2 includes **M06-min**.

**Evidence:** `evidence.ts`:

```ts
if (!e.subject_executor_ref) return true;
```

`subject_executor_ref` is optional on `validateEvidence`. Probe:

```text
INDEP_SELF_OMIT_SUBJECT true
INDEP_SAME_IDS false
```

An executor that produces evidence and **omits** `subject_executor_ref` qualifies as independent. `deriveRequirementStatus` / `deriveFinalStatus` then have a path to PROVEN that the honesty rule forbids. Same-id comparison works only when the subject field is present.

**Required before freeze:** missing `subject_executor_ref` ⇒ not independent (fail closed). For `subject.kind = CRITERION` (and task/execution subjects), require the field in `validateEvidence`. Add a negative test: producer == worker, subject omitted, `isIndependent === false` and PROVEN unreachable.

### B3 — Evidenceless `NOT_EXECUTED` is schema-valid (D05 / ADR-V4-0008)

**Claim:** “Executor report alone ≤ UNKNOWN. COMMITTED / REJECTED / NOT_EXECUTED require CP-side observation or reconciliation evidence” (ADR-V4-0008 rule 2). Wave 2 includes **M03**.

**Evidence:** `DOMAIN-MODEL.md` INV-EFF-03 lists only COMMITTED/REJECTED/PARTIAL/COMPENSATED. `validateEffectRecord` uses the same set. `NOT_EXECUTED` is omitted.

Probe:

```text
NOT_EXECUTED_NO_EVIDENCE valid= true issues= none
```

`decideRetry(NOT_EXECUTED)` returns `FORBIDDEN` with reason `terminal_create_new_effect_with_fresh_authorization`. A lying executor that reports NOT_EXECUTED after a real dispatch can induce a **new** `effect_id` for the same intent → duplicate external effect (the §7.3 failure the Effect Ledger exists to prevent). This is not an exactly-once *claim*; it is a missing invariant that makes duplicate dispatch the default if M03 trusts the validator.

**Required before freeze:** INV-EFF-03 includes `NOT_EXECUTED`; validator requires evidence (and M03 tests must treat executor-only reports as ≤ UNKNOWN). Align DOMAIN-MODEL with ADR-V4-0008. Add a negative test.

---

## 3. What is *not* blocking (but is not a freeze)

These would become **binding reservations** if B1–B3 were patched and freeze re-attempted. They are recorded so a rework does not claim a clean freeze.

| ID | Topic | Why not a freeze stamp |
|----|--------|------------------------|
| R1 | Hash chain ≠ signature (F07 residual) | ADR-V4-0003 + M18 §2 (CP host compromise OOS) document this. Independent verifiers detect *inconsistent* rewrites. Consistent full-chain rewrite is host integrity. Do not advertise INV-EVT-06 as non-repudiation. M02 may still publish a signed head later (additive). |
| R2 | `WorkEvent.payload` is untyped `Record`; `next_action` / `objective` inside payload are accepted | Probe: `EVENT_PAYLOAD_CONTROL valid= true`. INV-EVT-05 only strips header-level and **top-level payload** self-trust fields (F09), not F12 control names. Producing metas must RFC payload schemas **before** those event types become authoritative; experimental `x.mNN.*` must not mutate projections. |
| R3 | Capsule has no `expires_at` / replay token; `CapsuleServicePort.accept` ctx is only `{ now, policy_id }` | F01(c) and ADR-V4-0006 mention expiry, anti-replay, lease/epoch bind. Fields can be added as optional minors **if freeze has not happened**. Add them in the rework rather than after FROZEN. |
| R4 | `PolicyDecision` has no authenticated `decided_by` | ADR-V4-0016 names the field; the type does not. M10-fund (Wave 2) cannot audit “who authorized” (F02) from the frozen 1.0.0 object. Add the field (derived from authN, never from request) in rework. |
| R5 | ID grammar does not cover `grant_ref`, `approval_id`, `lease_id`, `correlation_id` | F08 required a single grammar at every trust boundary. Fixtures use free string `grant_tmp_1`. M02/M10/M13 must not use these as path components until `ID_PREFIX` grows (additive — do it before freeze). `Task.depends_on` is `string[]` without `isValidId("task")`. |
| R6 | INV-CAP-08 is procedural | `task_refs` remain on the capsule. M04 ★ tests (M18 S1) must include “forged task state does not change ledger”. Acceptable only after B1 (allowlist) lands. |
| R7 | `EventLedgerPort.append` lets drafts carry `fencing.fencing_epoch` | ADR-V4-0004: epoch watermark is **not caller-settable** (F13). M02 must look up the lease manager and ignore/reject caller-supplied epochs as authority. |
| R8 | No `Grant` / `Approval` kind in the catalog | M10-fund will invent one (ADR-0001 minor) **or** reuse `V37ApprovalRecord = ApprovalRequest`, which still has F02/F03/F04. Do not treat the V3 record as the V4 grant. |
| R9 | Dual owner `adapters/v37/identity.ts` = M10 **and** M13 | Split files or name a single writer before Wave 2 fights an RFC. |
| R10 | Secret scan is heuristic | Documented. M18 S8 remains the gate. Canary `sk-ant-` in tests is a pattern, not a live secret. |
| R11 | Canonical JSON v1 ≠ RFC 8785 | Documented. Revisit if a non-TS verifier appears (M14). |
| R12 | Policy language / capability formula deferred | ADR-V4-0010/0011 have gates. Decision contracts exist. OK. |
| R13 | INV-POL-04 only forbids ALLOW `*` **and** `*` together | Least privilege still allows `subjects: ["*"]` with specific actions. M10 must tighten; not a Wave 2 substrate blocker by itself. |
| R14 | `V37SignaturePort.sign(private_key_pem: string)` | Adapter shape encourages PEM in process memory. M10 must use handles; never persist/log PEM. |
| R15 | MeasurementPlane F10 not encoded here | `MeasurementSinkPort.emit(unknown)`. M12-init must default missing provenance to UNKNOWN, never OBSERVED. |
| R16 | Numbering gaps (`INV-WORK-02`, `INV-EFF-01`, `INV-GC-01`, `INV-EXEC-01`) | Hygiene only. |

---

## 4. Checklist against the freeze bar

| Criterion | Result | Notes |
|-----------|--------|-------|
| Architecture + mermaid | Met | `ARCHITECTURE.md` |
| Domain model + invariants for constitution §5 concepts | **Partial** | All 15 kinds exist; B2/B3 make two invariants wrong relative to their ADRs |
| Versioned contracts | Met | catalog `1.0.0`, all `PROPOSED` (correct — not self-frozen) |
| ADR register §15.2 | Met | 0001–0017; deferred items have owner + gate + date |
| Ownership M00–M20 vs matrix | Met (R9 dual owner) | Matrix chapters 1–17 all `OWNED`; no orphan chapters |
| Integration ports + conformance hooks | Met as skeletons | 23 tests; behavioural ★ cases owned by later metas |
| Acceptance criteria per meta | Met | `ACCEPTANCE-CRITERIA.md` |
| V3.7 adapter boundary, no cert edits, no reimplementation | Met | `adapters-v37.ts` type-only picks; `src/v4/` is contracts only; `TRUE_PASS` ↛ `VERIFIED` |
| No secrets in M00 tracked files | Met (spot) | Heuristic; no `.env`; canaries only in tests/docs |
| No exactly-once claims | Met | ADR-V4-0008, constitution §14, `decideRetry` escalates |
| M18 §9 six items | **Not freeze-closed** | F01 hole B1; F02 ADR exists but `decided_by` missing (R4); F07 residual R1; F08 grammar incomplete (R5); F09/F12 holes B1+R2; tenancy INV-TENANT-01 OK |
| No merge to integration | Met | branch isolation |
| No product engines | Met | `orchestrator/src/v4/` = `contracts/**` only |
| Tests | **23 passed** | `npx vitest run tests/v4` (node_modules symlink; no `npm install`) |
| Independent review | This file | Supersedes `M00-INDEPENDENT-REVIEW.md` for freeze |

### M18 §9 six items (this review)

| # | Item | Freeze status |
|---|------|----------------|
| 1 | Capsule ≠ grant (F01) | **Not closed** — B1 |
| 2 | V4 trust domain vs ADR-V37-0003 (F02) | ADR-V4-0016 is the right split (SO_PEERCRED drift named). Isolation mechanism deferred to M13 with a Phase 2 gate — acceptable **if** PolicyDecision records authenticated approver (R4). |
| 3 | Event identity/order/tamper-evidence (F07) | Hash chain + seq + id uniqueness present. Residual R1 documented. |
| 4 | Canonical id grammar (F08) | Prefix grammar rejects `../`, `%2f`, NUL at `isValidId`. Incomplete for grants/leases/approvals (R5). |
| 5 | Data vs control (F12, F09) | Header self-trust denylist works. Nested F12 on capsules (B1) and event payloads (R2) do not. |
| 6 | Multi-tenancy OOS V4.0–V4.2 | Closed (`INV-TENANT-01`, ADR-V4-0014). |

---

## 5. What was *not* found (failed attempts to invalidate)

- No exactly-once guarantee in V4 contracts/ADRs. `decideRetry` escalates when there is no idempotency key and no status query. Constitution §14 preserved.
- No V3.7 fabric/ledger/artifact reimplementation under `orchestrator/src/v4/` (contracts + type-only adapter picks only). No edits to `recovery/v37-full-cert`.
- No Goal Compiler, ledgers, handoff engine, Control Center UI, marketplace.
- No claim that V3.7 or V4 is APPROVED. Baseline remains provisional `03937c1` (G17 BLOCKED).
- ADRs 0010/0011/0014 are deferred **with** decision gates, not silent frozen APIs.
- `Work.owner` is the constant `"platform"` (INV-WORK-01). Forks are new work ids (INV-WORK-05). Capsule `authority_model` must equal `POLICY_REDERIVED_AT_ACCEPT` (constant).
- Tests at this tip: 23/23 green. Conformance suite is structural (catalog + port names), which is acceptable for M00 skeletons.
- Disk-tight: `node_modules` is a symlink; this review did not run `npm install`.

---

## 6. Required rework (M00 only — still no engines)

Minimum patch set before a second freeze review:

1. Recurse `FORBIDDEN_CAPSULE_AUTHORITY_FIELDS` (and F12 names) through nested objects; add negative tests for `{ handoff: { permissions, next_action } }` and unknown-key forwarding. State allowlist-parse as a `CapsuleServicePort` MUST.
2. `isIndependent`: missing subject ⇒ false. Require `subject_executor_ref` for CRITERION/TASK/EXECUTION evidence. Negative test.
3. INV-EFF-03 + validator: `NOT_EXECUTED` requires evidence. Negative test. Align `DOMAIN-MODEL.md` with ADR-V4-0008.
4. Strongly recommended in the same patch (cheap, avoids post-freeze RFC): payload-level F12 denylist on `WorkEvent.payload`; `PolicyDecision.decided_by`; capsule `expires_at` + `replay_id`; `ID_PREFIX` for grant/approval/lease; `isValidId` on `Task.depends_on`.

Do **not** implement M01–M20 engines to “paper over” validator holes.

---

## 7. Commands and limitations of this review

| Command | Result |
|---------|--------|
| `git rev-parse HEAD` | `1dea128a330d75c9c945070fcbaae8cd71ebb0ee` |
| `cd orchestrator && npx vitest run tests/v4` | 23 passed (2 files), vitest 2.1.9 |
| `npm install` | **not run** |
| merge to `feature/v4-integration` | **not run** |
| Wiki grounding | `WIKI_ROOT` unset → GAP; repo docs + code only |

Probe of B1–B3 used a throwaway `/tmp` script against the same validators; it is not in git.

This review did not re-audit every V3.7 line cited by M18; it checked whether M00 *encoded* the six §9 properties. V3.7 remains BLOCKED; adapter ports stay provisional on `03937c1`.

---

## 8. Recommendation to orchestrator

1. Mark M00 **REWORK** for freeze (delivery may still be “complete as a draft package”).
2. Do **not** stamp contracts `FROZEN` and do **not** launch Wave 2 producers against `1dea128` as a frozen API.
3. After B1–B3 (and preferably R2–R5) land, dispatch a fresh freeze review. The implementer's `ACCEPT_WITH_RESIDUAL_RISKS` note must not be reused as that review.
4. Keep R1 (hash chain vs signature) as a documented residual even after a later freeze — it is not a reason to reject architecture, but it is a reason not to claim non-repudiation.
