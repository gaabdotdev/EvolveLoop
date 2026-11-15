# M18 Wave 5 — Security & Adversarial Assurance (RO refresh)

| Field | Value |
|-------|-------|
| Meta | M18 — Security & Adversarial Assurance |
| Wave | 5 — V4.3 Trust, read-only review (no product code) |
| Branch | `feature/v4/m18-wave5-ro` |
| Analysed tip | `74c55c35eb43db08701124d5bd19cc2a2c5574c7` (includes M11 merge `290b453` / recorded orch tip `111b933`) |
| M11 engine commit | `9b56c81d68c0750b8dedd180d67fb5c28a35c50d` (`orchestrator/src/v4/provenance/**`) |
| Ownership | `docs/v4/security/**` only |
| Product code | **Not modified** (`orchestrator/src/**` outside this note is inspection-only) |
| Merge / APPROVED / self-ACCEPTED | **None** |
| npm / vitest this cut | **Not run** (disk ~99%; Wave 5 RO; no npm install) |
| Knowledge | Wiki GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset) |

**Normative sources for this refresh:** Wave 1 threat model (`THREAT-MODEL-V4-INITIAL.md`); `M11-DELIVERY.md` fail-closed table + `graph.ts` / `stream.ts` / `extract.ts` / `guarantees.ts`; M08 `METHODOLOGY.md` (PROVISIONAL); M17 `M17-DELIVERY.md` + canonical `DECLARED_UNAVAILABLE` artifact; `PHASE4-EXIT.md`; `WAVE5-COMMON.md`.

## 0. How to read this note

Wave 1 findings (`TM-V4-Fxx` / `TM-V4-Dxx`) are **not rewritten**. This cut records a **disposition** against INTEGRATED M11 (and the M08/M17 honesty pins that Wave 5 must not launder into Adaptive claims).

Disposition vocabulary:

| Label | Meaning |
|-------|---------|
| **OPEN** | Required property still absent on a live path |
| **PARTIALLY MITIGATED** | A V4 write- or read-path exists that covers part of the property; a residual remains |
| **READ-MODEL ONLY** | M11 cites ledger/artifact/evidence ids; it does not enforce the original control |
| **HONEST (do not invert)** | Documented non-claim that must stay visible (Phase 4 PARTIAL, M09 BLOCKED, PROVISIONAL / UNAVAILABLE) |

M11 is a rebuildable **read-model** over the hash-chained Event Ledger. Empty `refs` means **not proven**, never “no origin existed” and never a fabricated id. That is the correct fail-closed posture for §4.12. It is **not** a substitute for M10 authentication, M02 host integrity, M06 proof issuance, M14 package pinning, or M09 Adaptive claims.

This review **does not** mark M11, M08, M17, Phase 4, or V4 **ACCEPTED** / **APPROVED**.

---

## 1. Re-check: F02 / F07 / F14 / D13 / D16 / D17 vs M11 claims

M11-DELIVERY honesty pins (verified as constants in `orchestrator/src/v4/provenance/guarantees.ts`, not runtime-configurable):

```
PROVENANCE_IS_AUTHORITATIVE_WORK_STATE = false
HASH_CHAIN_IS_NON_REPUDIATION = false
GLOBAL_TRUST_SCORE_DEFINED = false
ROUTES_BY_TRUST_OR_SCORE = false
FABRICATES_MISSING_REFS = false
ANSWERS_FROM_CHAT_MEMORY = false
```

Fail-closed table in `M11-DELIVERY.md` §4 matches `graph.ts` `inspect*` paths for: missing/invalid ids, `chat:`/`memory:`/whitespace refs, broken INV-EVT-06 chain, payload digest mismatch, artifact `integrity_status ≠ VERIFIED` / `verify ≠ VERIFIED`, uncorroborated `origin.executor_ref`, `SELF_REPORTED` / `!isIndependent` as proof, wrong Goal Contract version, policy decision absent from this work’s log, `DENY` cannot authorize, `REQUIRE_APPROVAL` without `approval.decided` APPROVED, `fork_inherited` EXTERNAL without a later `policy.decided`, free-text skill/provider names ignored, present-but-unverified `skill_artifact_id` → `unpinned_supply_chain`.

### 1.1 TM-V4-F02 — Approver identity (CRITICAL in Wave 1)

| Aspect | Disposition |
|--------|-------------|
| M11 claim | Permission → action provenance; origin cites ledger `policy.decided` / `approval.decided` actors; `PolicyDecision` 1.0.0 has no `decided_by` (freeze R4) |
| M11 actually does | `authorizationFor` requires `policy.decided` in the trusted stream; `REQUIRE_APPROVAL` requires an `approval.decided` with extracted `state === "APPROVED"` (`graph.ts`). Returned refs are decision / event / policy / grant / approval ids. Chat memory is rejected. |
| M11 does **not** do | Authenticate the approver. Check `actor.kind === HUMAN`. Check requester ≠ approver. Bind `decided_by` (not a frozen field). Block the V3 CLI store-write fallback. |

**V4 write-path (M10 foundations, not M11):** `InMemoryOperatorAuthn` issues hashed operator tokens and refuses `executor_*` principals (`policy/authn.ts`). `DenyByDefaultPolicyEngine.decide` drops caller `actor` / `decided_by` (R4). `resolveApproval` records `decided_by` from the authenticated principal; tests lock `SELF_APPROVAL_DENIED` and `CALLER_ASSERTED_IDENTITY_REJECTED`. `V37PolicyAdapter` sets `V4_CLI_STORE_FALLBACK = false` and does not call V3 `ApprovalStore.approve`.

**Live residual (OPEN on V3 path):** `orchestrator/src/cli/v35-commands.ts` still does IPC `approvals.approve` with `actor: args.actor ?? "cli"` and, on failure, **`store.approve(id, args.actor ?? "cli")`** — write access to the approvals dir remains sufficient. Wave 1 F02 is therefore **not closed**. V4 adapter documentation does not remove the V3 command.

**Read-model residual:** `inspectAuthorizationFor` will return refs for any hash-chained `approval.decided` whose payload `state` is `APPROVED`, including an EXECUTOR-attributed event. Provenance cannot create authenticity the append path did not have. `grant_revoked` is extracted (`extract.ts`) and **never consulted** in `authorizationFor` — a revoked grant still appears as authorization history (citation, not current authority).

**Verdict:** **READ-MODEL ONLY** + **PARTIALLY MITIGATED** on the V4 PDP approve path. F02 remains **OPEN** wherever the V3 CLI/store fallback is reachable. Do not cite M11 as closing “executor cannot approve its own result”.

### 1.2 TM-V4-F07 — Ledger tamper evidence (HIGH)

| Aspect | Disposition |
|--------|-------------|
| M11 claim | Rebuildable index; broken hash chain / digest mismatch → `[]` (`chain_broken` / `hash_mismatch`); hash chain is not non-repudiation |
| M11 actually does | `indexWorkStream` runs `checkEventStream` + `validateWorkEvent` (`stream.ts`). `inspect*` refuse `!index.trusted`. Tests tamper chain and payload and expect empty refs (`decision-origin.test.ts`). |
| V4 ledger | `FileEventLedger` persists INV-EVT-06 (`prev_event_digest` / `event_digest`). `HASH_CHAIN_IS_NON_REPUDIATION = false` is pinned in both M02 `ledger/guarantees.ts` and M11. |

**Residuals:**

1. **R1 / ADR-V4-0016:** a *consistent rewrite of the whole chain* is Control Plane host integrity. Independent verification detects edit/delete/reorder **relative to the stored chain**, not a signed head held outside the CP. Wave 1’s “verifiable by an independent verifier without trusting the storage layer” is only met if the verifier has an out-of-band head digest. M11 does not claim otherwise — keep it that way.
2. **V3 `event-log/store.ts` / `work-ledger/store.ts`:** still unchained JSONL (Wave 1 evidence). V4 work streams use `FileEventLedger`; the V3 stores are **UNCHANGED**. Dual-path if any runtime still appends V3 logs as Work State.
3. Empty stream is marked `trusted: true` then queries fail `missing_ref` — correct, not a forgery.

**Verdict:** **PARTIALLY MITIGATED** for V4 Event Ledger consumers of M11. Residual R1 remains binding. Do not advertise INV-EVT-06 as non-repudiation or as F07 closed.

### 1.3 TM-V4-F14 — Unversioned decisions + raw-path deny (MEDIUM)

| Aspect | Disposition |
|--------|-------------|
| Required property | Every decision records policy id + version/hash + inputs; path checks use canonical (resolved, symlink-aware) paths |
| V4 write-path | `PolicyDecision.policy_ref` is `{ policy_id, version, epoch }`. Cache key includes epoch (`policy/engine.ts`). TTL + epoch bump invalidate ALLOW (`isStillValid`, D14). ALLOW wildcards forbidden (R13 tightening). |
| M11 | Extracts `policy_id` only (`extract.ts`). Provenance answers may contain `pol_…` but **not** version or epoch. A later policy rewrite with the same id is not distinguishable from the frozen port’s `string[]`. |
| Paths | V4 `canonicalizeResource` rejects `\0`, `%`, `\\`, and any `..` (`policy/match.ts`). That is string sanitization, **not** `realpath` / symlink resolution. Traversal strings fail-closed to “no match”; with deny-by-default, unmatched ALLOW is DENY — safer than V3 `startsWith`. Unmatched **DENY** rules also fail to fire; default DENY still holds if no ALLOW matches. Symlink alias of a denied path can still match a prefix ALLOW. |
| V3 | `v3/security/enforcer.ts` still compares `denied_paths` with `startsWith` on raw `targetPath`. **OPEN** on that path. `SecurityDecision` still has `profile_id` and no policy version. |

**Verdict:** **PARTIALLY MITIGATED** (decisions are versioned/epoch’d at the PDP; M11 cites id not version; filesystem deny is not symlink-canonical). F14 is not closed.

### 1.4 TM-V4-D13 — WorkProof forgery / staleness (MEDIUM)

| Required property | M11 behaviour |
|-------------------|----------------|
| Evidence bound to artifact hash + Goal Contract version | `inspectEvidenceForRequirement` loads the named `(goal_contract_id, version)`, rejects criterion mismatch / wrong version, verifies `tested_artifacts` via `ArtifactStorePort.verify`, requires `evidence.recorded` in the trusted stream |
| Verifier ≠ executor; SELF_REPORTED ≠ independent | Uses frozen `isIndependent` / `validateEvidence` / `deriveRequirementStatus`. `SELF_REPORTED` and `produced_by === subject_executor_ref` are dropped and, if they were the only candidates, fail-closed `self_reported_as_independent`. Missing `subject_executor_ref` is not independent (contract fail-closed). |
| PROVEN only by policy-defined verifiers | M11 **does not** issue proofs (`WorkProofPort.build` is not called). It may *cite* a `proof_id` from optional `ProofLookup` |

**Residuals:**

1. **Stale deliverable hashes are conditional.** `deriveRequirementStatus` excludes `stale_artifact` only when `current_artifact_hashes` is provided. `currentArtifactHashes()` returns `undefined` unless `artifactList.listByWork` is wired (`graph.ts`). Without that M19 composition, evidence that still verifies against an **old** blob can qualify after the work’s current artifact set moved on. Blob tamper of a *cited* hash still fail-closes (`evidenceArtifactsOk`).
2. **Unanchored proof ids.** If `latestForWork` returns a WorkProof whose `evidence_ids` cover the qualifying set, `proof_id` is pushed **even when no `proof.issued` event exists** in the trusted stream. Contrast evidence, which requires `evidence.recorded`. A lookup-only proof is a citation of a store, not of the hash chain.
3. **`generated_by` is not checked.** A proof whose verifier identity equals the subject executor can still be attached if the *evidence* is independent.
4. Optional `WorkRepositoryPort` / evidence store: unwired → `missing_ref` (honest). Composition is M19.

**Verdict:** **PARTIALLY MITIGATED** as a fail-closed read-model for independent, version-bound, hash-verified evidence. D13’s “verifier ≠ executor on the proof object” and “stale after code change” are **not fully enforced** by M11 alone.

### 1.5 TM-V4-D16 — Artifact store & publication (HIGH)

| Required property | M11 behaviour |
|-------------------|----------------|
| Verifier uses hash-pinned artifacts; untrusted until verified | `artifactAuthors` requires `integrity_status === VERIFIED` and `verify() === VERIFIED`; payload sha256 must match stored artifact; missing `artifact.registered` → `decision_not_in_ledger` |
| Producer provenance | `origin.executor_ref` must equal the `artifact.registered` EXECUTOR actor; mismatch → `uncorroborated_origin`. Platform registration without an executor origin returns the event only (not a fake executor). |
| Publication subject to fencing (F05) | **Not in M11.** No `assertFencing` / publish gate found under `orchestrator/src/v4/effects/**`. Wave 1 F05 (fencing at result commit only; `publish_artifact` unfenced on V3) remains the publication threat. |

Free-text `provider` on `artifact.registered` is not returned as an author (D17 hygiene on this query).

**Verdict:** **PARTIALLY MITIGATED** for *authorship queries*. Artifact **publication** fencing and cross-project ACL remain **OPEN** (owners M02/M04/M13, not M11). Do not read empty `artifactAuthors` as “artifact was never published”.

### 1.6 TM-V4-D17 — Supply chain: skills, providers, MCP (HIGH)

| Required property | M11 behaviour |
|-------------------|----------------|
| Verifiable origin and pinned versions | Only `skill_artifact_id` / `provider_artifact_id` / `origin_pin.artifact_id` that `isValidId("artifact")` and `verify === VERIFIED` become refs. Free-text `provider` / `skill` names are ignored (`extract.ts`). Present pin that does not verify → `[]` (`unpinned_supply_chain`). |
| Name collisions rejected | **Not M11.** `discovery/provider-discovery.ts` still loads unsigned `provider.yaml`, infers manifests from `SKILL.md`, and `dedupeByName` **last wins** (Wave 1 evidence, line numbers still apply on this tip). |

**Residual:** if the decision payload has **no** supply artifact id, `decisionOrigin` **succeeds** without supply-chain evidence. Absence of a pin is not fail-closed — only a *bad* pin is. Unsigned skills used without recording a pin remain invisible to §4.12 answers.

**Verdict:** **PARTIALLY MITIGATED** inside provenance answers (cannot launder a skill *name* into a ref). Discovery / marketplace surface **OPEN** (M14). M11-DELIVERY already assigns signing to M14 — keep that ownership; do not treat M11 as D17 closed.

---

## 2. Score / trust invention (M08 PROVISIONAL, M17 DECLARED_UNAVAILABLE)

Wave 5 rule: do not invent trust/reputation scores; provenance must cite ledger/artifact/evidence ids.

### 2.1 What the code actually pins (inspection)

| Pin | Where | Value |
|-----|-------|-------|
| Published methodology | `capability/methodology.ts` `PUBLISHED_METHODOLOGY.status` | `"PROVISIONAL"` |
| `methodologyIsAccepted()` | same file | **always `false`** (argument ignored) |
| ACTIVE profiles | INV-CPROF-04 / `methodologyAllowsActive` | unreachable while ACCEPTED is unrecognized |
| `adviseExecutorPreference` | `capability/routing.ts` | always `preference: "FORBIDDEN"`, `ranked_executor_ids: []` |
| `preferExecutorByScore` | same | `throw ScoreRoutingForbidden` |
| M07 ranking | `planning/guarantees.ts` `ROUTING_BY_CAPABILITY_SCORE` | `false`; propose/accept reject `ranked_executor_ids` / `prefer_executor_id` |
| M11 scores | `GLOBAL_TRUST_SCORE_DEFINED`, `ROUTES_BY_TRUST_OR_SCORE` | `false` |
| Canonical fair baseline | `docs/v4/benchmarks/artifacts/el-v4-fair-baseline.declared-unavailable.v0.json` | every primary metric `DECLARED_UNAVAILABLE`, `value: null`, `quality_proof: false`, `production_scores: "ABSENT"`, `this_artifact_stamps_methodology_accepted: false` |
| Improvement bar | `IMPROVEMENT-BAR.md` | numeric floors `{ value: null, provenance: "UNAVAILABLE" }`; `IMPROVED` unreachable from the canonical artifact |

M08 residuals still GAP (formula, recency decay, provider-version identity, minimum sample for inference) — ADR-V4-0010. Inventing Elo/BT/0–100 to “finish” Phase 4 would be fake science.

### 2.2 Invention risks (adversarial)

These are **process / composition** hazards, not bugs in the honesty pins:

| ID | Sev | Risk | Why it is live |
|----|-----|------|----------------|
| **RR-W5-INV-01** | HIGH | Treat `cprof-methodology.provisional.v0` as ACCEPTED science or as L2/L3 routing readiness | Gate text in `METHODOLOGY.md` is “M17 fair baselines **and** independent RFC review”. M17 delivered the *definition* only (`M08-EVIDENCE.md` §1). A later meta that flips `methodologyIsAccepted` without observed runs + RFC closes D04 by declaration. |
| **RR-W5-INV-02** | HIGH | Treat canonical `DECLARED_UNAVAILABLE` (or `schema_validator` harness) as a measured baseline / economic proof | `INV-FBA-04`: schema_validator cannot emit quality-proof metrics. Publishing “+N% vs baseline” from this artifact is `INVALID`. Constitution §13 / §16 economy question stays unanswered. |
| **RR-W5-INV-03** | MEDIUM | Promote labelled **test fixtures** (`workload_executor` + `HARNESS_REPORTED`) to production scores | M17-DELIVERY §2: fixtures exist to exercise the evaluator; `limitations` say they are not production. Copying fixture numbers into CapabilityProfile metrics would be D04 poisoning with extra laundry. |
| **RR-W5-INV-04** | MEDIUM | Infer a global trust/reputation score from M11 `string[]` length or from PROVISIONAL profile metric values | Frozen `ProvenanceQueryPort` returns ids only. Ranking executors by “how many provenance refs” or by PROVISIONAL `sample_size`/`value` is score invention. M11 has no `trustScore` method (guarantees test). |
| **RR-W5-INV-05** | MEDIUM | `point_interval.v0` (`lower = upper = value`) presented as a confidence interval | `METHODOLOGY.md` §4 forbids that reading. UI/Control Center (M15) is the likely laundering surface. |
| **RR-W5-INV-06** | LOW | Frozen port `[]` displayed as “no origin / clean” rather than “not proven / untrusted stream” | `inspect*` reasons (`chain_broken`, `hash_mismatch`, …) are **not** on `ProvenanceQueryPort`. M15/M20 must use inspect (or equivalent) or operators will misread tamper-evidence as absence. |

**D04 (capability poisoning)** remains the parent threat. M08 ingest still refuses SELF_REPORTED / UNKNOWN / ESTIMATED / UNAVAILABLE as metric input (INV-CPROF-01) and unauthenticated OBSERVED (F10) — that is the correct consumer of M12. This review did not re-audit M12 storage; Wave 1 F10 is not re-opened here without new evidence.

---

## 3. Phase 4 PARTIAL + M09 BLOCKED (security-relevant honesty)

Evidence (docs on this tip, not a new measurement):

- `docs/v4-orchestration/PHASE4-EXIT.md`: stamp 2026-11-15T15:50Z; integration HEAD then `04ed782`; verdict **PARTIAL**; “Do **not** claim V4.2 complete. Do **not** launch M09 L2/L3 score routing.”
- `WAVE5-STATUS.md`: M08 methodology **PROVISIONAL**; fair baseline primary metrics `DECLARED_UNAVAILABLE`; **M09 BLOCKED** until methodology ACCEPTED + observed baseline.
- `MASTER-PLAN.md` / `FINAL-VERDICT.md`: Phase 4 PARTIAL; M09 blocked; V4 **not APPROVED**; V3.7 G17 still BLOCKED.
- `WAVE5-COMMON.md`: “M09 not in this wave until orchestrator lifts the PROVISIONAL/score-routing block.”

**Required honesty (M18):** Adaptive Execution Intelligence is **not** in force. There is no demonstrated measurable improvement vs a fair baseline. Presence of M07/M08/M17 trees + M11 provenance is **not** V4.2 Adaptive and **not** V4.3 Trust complete.

Falsely claiming Adaptive (routing, “the system learned”, economic proof, Phase 4 exit) is a **security defect**: it would route or justify sensitive work with invented scores (D04) and would violate constitution §4.8 / §6.2 / §8.

M10-full and M06-authz are still **PENDING** on `WAVE5-STATUS.md`. F02/F14 write-path coverage above is M10 *foundations*, not the full policy language / remote approval surface.

---

## 4. Residual register (Wave 5)

Owners fix code; M18 does not.

| ID | Sev | Parent | Residual | Owners |
|----|-----|--------|----------|--------|
| RR-W5-01 | HIGH | F02 | V3 CLI `store.approve(actor)` fallback still present (`v35-commands.ts`). V4 adapter does not delete it. | M10, M15, M00 |
| RR-W5-02 | HIGH | F02 | M11 `authorizationFor` does not require HUMAN ≠ requesting executor; `PolicyDecision` 1.0.0 has no `decided_by` (R4). Ledger-valid forged `approval.decided` is cited as authorization. | M10 (write), M11 (optional inspect check — not required to change the frozen port) |
| RR-W5-03 | HIGH | F07 | Hash chain ≠ non-repudiation; full consistent rewrite is CP host integrity. V3 JSONL ledgers still unchained. | M02, M00, M20 |
| RR-W5-04 | MEDIUM | F14 | Provenance returns policy **id** not version/epoch. Path matching is not symlink/`realpath` canonical. V3 `denied_paths` `startsWith` unchanged. | M10, M11 (cite version in inspect payload if ever extended — frozen port cannot grow fields without RFC), M13 |
| RR-W5-05 | MEDIUM | D13 | Stale-hash exclusion skipped if `artifactList` unwired. `proof_id` may be cited without `proof.issued`. Proof `generated_by` not checked against subject executor. | M06, M11, M19 |
| RR-W5-06 | HIGH | D16 / F05 | Artifact publication still not shown fenced on V4 effect paths. Authorship query ≠ publish control. | M02, M03, M04, M13 |
| RR-W5-07 | HIGH | D17 | Missing supply pins do not fail-close origin queries. `provider-discovery.ts` unsigned YAML + SKILL.md inference + last-wins shadowing. | M14, M10, M11 (fail-closed-on-absent-pin would be a product change — not done here) |
| RR-W5-08 | HIGH | D04 / M08 / M17 | PROVISIONAL methodology or `DECLARED_UNAVAILABLE` baseline used as production proof / Adaptive exit / L2/L3 preference. | M08, M09 (blocked), M17, M19, M15 |
| RR-W5-09 | MEDIUM | F03 / F14 | `authorizationFor` last extracted `policy_effect` wins among events sharing a `decision_id`; `grant_revoked` unused. Duplicate `decision_id` with later ALLOW would mask DENY if append is possible. EventLedgerPort is not typed-capability gated per producer in the port itself. | M02, M10, M11 |
| RR-W5-10 | LOW | F07 / D13 | Frozen `ProvenanceQueryPort` returns `string[]` only; fail-closed *reason* is inspect-only. UI that treats `[]` as “clean” hides tamper-evidence. | M15, M20 |
| RR-W5-11 | — | honesty | Phase 4 PARTIAL; M09 BLOCKED; no Adaptive claim. Not a defect unless inverted. | Orchestrator, all metas |

No new CRITICAL evidence-finding is opened in this cut: F01 (capsule) and F02 (V3 self-approve) remain the Wave 1 CRITICAL items; F02 is **not newly introduced** by M11.

---

## 5. What this review is not

- Not an adversarial suite execution (threat model §10 S1–S15). Disk constraint + RO charter: no vitest rerun. M11-DELIVERY’s “31 passed / 337 passed” is **not independently reproduced here**.
- Not a claim that INTEGRATED == closed findings.
- Not M10-full, M06-authz, M14, or M09 review.
- Not a contract thaw. Frozen `ProvenanceQueryPort` was not asked to grow `decided_by` or fail-closed reasons (R4 / catalog freeze).
- Not V3.7 recertification (G17 still BLOCKED).

---

## 6. Suggested next controls (requirements, not designs)

1. **F02:** remove or isolate the V3 CLI store-write fallback from any V4 operator path; keep token-derived `decided_by`. Optional M11 inspect check: `REQUIRE_APPROVAL` answers fail-closed unless `approval.decided` actor is HUMAN and ≠ effect executor — still a read-model, not authn.
2. **F07:** keep R1 pin; out-of-band head digest for independent verifiers if M20 needs storage-untrusted verification; do not reuse V3 JSONL as V4 Work State.
3. **F14:** include policy version/epoch in *inspect* answers (RFC if the frozen port must surface them); realpath/symlink canonicalization at the PDP; retire V3 raw `denied_paths` for V4 executors.
4. **D13:** M19 must wire `artifactList` (or equivalent current-hash set) before `evidenceForRequirement` is used as a proof gate; require `proof.issued` before citing `proof_id`; compare `generated_by` to subject executor.
5. **D16:** fence artifact publication with the same epoch rule as result commit (F05).
6. **D17:** M14 signed/pinned packages; reject name collisions; consider fail-closed when a decision’s executor used a skill/provider **without** a verified pin (product decision, not done here).
7. **Scores:** `methodologyIsAccepted()` stays false until observed fair-baseline runs **and** independent RFC. M09 stays BLOCKED. No Adaptive marketing from PARTIAL Phase 4.

---

## 7. Delivery self-check

| Criterion | Status |
|-----------|--------|
| Re-checked F02/F07/F14/D13/D16/D17 vs M11 fail-closed table | Met — §1 |
| Flagged score/trust invention from M08 PROVISIONAL / M17 UNAVAILABLE | Met — §2 |
| Noted Phase 4 PARTIAL + M09 BLOCKED as honesty | Met — §3 |
| No `orchestrator/src/**` product edits | Met |
| No merge, no APPROVED, no self-ACCEPTED | Met |
| Findings under `docs/v4/security/**` | Met — this file + threat-model Wave 5 appendix |
| Wiki grounding | GAP (`WIKI_ROOT` unset) |

**Status: DELIVERED for orchestrator / independent review.** M18 does not mark this refresh ACCEPTED.
