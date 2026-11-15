# META M06 — Delivery record (WorkProof authz / origem, Wave 5 Trust)

| Field | Value |
|-------|-------|
| Meta | M06 — WorkProof authz / origem (V4.3 Trust cut) |
| Wave | 5 — D13 / RR-W5-05 slice / RR-W5-02 honesty |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m06` · `feature/v4/m06-authz` |
| Baseline | `feature/v4-integration` ≥ `e338de7` (M15 F02 INTEGRATED `6e78bce`) |
| Freeze | contracts **FROZEN** — `authorizationFor` / `isIndependent` / `deriveFinalStatus` / `PolicyDecision` 1.0.0 **not** edited |
| Ownership | `orchestrator/src/v4/proof/**` + `orchestrator/tests/v4/proof/**` |
| Compose | Optional `ProvenanceQueryPort.authorizationFor` / `evidenceForRequirement` (call if wired). `orchestrator/src/v4/provenance/**` **not** rewritten |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` is a symlink) |
| V3.7 cert edits | **None** |
| Catalog / `contracts/**` edits | **None** |
| M10 policy tree / M11 provenance tree | **Not modified** |
| Self-assessed status | **DELIVERED for orchestrator / independent review** — M06 does not mark itself ACCEPTED, APPROVED, or F02/D13 globally closed |
| Knowledge | Wiki GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset) |

Engine commit is stamped after first land (see §1). Orchestrator tip = `git rev-parse feature/v4/m06-authz`.

This note does **not** rewrite `M06-DELIVERY.md` (V4.0 min) as APPROVED.

## 1. Commits

On `feature/v4/m06-authz` (no merge to integration):

| Hash | Message |
|------|---------|
| *(stamped after land)* | feat(v4/m06): cap WorkProof PROVEN without verifiable EXTERNAL authz (D13) |

## 2. What was implemented

When building/assessing WorkProof, **PROVEN is capped at PARTIAL** (fail closed) if:

1. **D13 / authz cap** — a required EXTERNAL effect (state authorized-or-beyond) lacks verifiable authorization refs from wired `authorizationFor` **or**, if that port is unwired, from ledger `policy.decided` events actually present. Empty refs = not authorized. Grant / decision ids are **never invented**. An `authorization.policy_decision_id` claim on the EffectRecord is not proof.
2. **RR-W5-05** — `generated_by.verifier_id` equals the subject executor. Checked on the proof object (builder + `reassessProof`); not delegated to M11 citation.
3. **Origin** — evidence cited as independent must pass frozen `isIndependent` and `produced_by ≠ subject`. Optional compose: when `evidenceForRequirement` is wired, empty refs fail closed (not a fake PASS). Unwired → honest limitation, local `isIndependent` only.

Open-effect cap via frozen `deriveFinalStatus` is **unchanged**. Authorization gaps are applied by demoting PROVEN *requirements* to PARTIAL so `validateWorkProof` INV-PROOF-01 still holds (declared `final_status` equals frozen derivation). Implementations never emit a more optimistic status than that derivation.

No trust / reputation scores. No M09. No contract thaw.

## 3. Honesty pins

- Empty `authorizationFor` ≠ authorized.
- `chat:` / `memory:` / whitespace / free-text strings are not citeable refs.
- DENY `policy.decided` cannot authorize.
- REQUIRE_APPROVAL without ledger `approval.decided` `state === "APPROVED"` cannot authorize (ledger fallback). **Does not** check HUMAN ≠ executor.
- Frozen `PolicyDecision` 1.0.0 has **no** `decided_by`. This cut does **not** invent that field.
- Ledger-valid `approval.decided` / `policy.decided` without HUMAN≠executor remains **RR-W5-02 OPEN**.
- F02 / D13 are **not** claimed globally closed. M11 empty refs still must not become “authorized”.

## 4. Tests

```bash
cd orchestrator && npx vitest run tests/v4/proof
# 6 files, 37 passed (11 new authz/origin + 26 prior)
cd orchestrator && npx vitest run tests/v4
# 57 files, 364 passed
# node_modules is a symlink — do not npm install
```

Locks: EXTERNAL without authz refs cannot be PROVEN; empty `authorizationFor` ≠ authorized; `generated_by` == subject executor capped; open-effect PARTIAL preserved; INTERNAL control still PROVEN.

## 5. Residual gaps (not closed)

| ID | Residual |
|----|----------|
| **RR-W5-02** | HIGH / F02. `PolicyDecision` 1.0.0 has no `decided_by`. This engine cannot prove HUMAN ≠ executor. Ledger-valid `approval.decided` attributed to an EXECUTOR is still citeable if M11/ledger returns refs. **OPEN**. Owners: M10 write-path, optional M11 inspect. |
| **RR-W5-05 remainder** | Stale-hash exclusion still skipped if M19 `artifactList` unwired (M11). `proof_id` may still be cited without `proof.issued` (M11). This cut only closes the **proof-object `generated_by` vs subject** slice. |
| **D13 remainder** | Unanchored proof ids and stale hashes without current-hash set remain M11/M19. This cut is the WorkProof issuance/assessment authz cap, not a global D13 close. |
| **F02 overall** | V3 CLI/daemon actor paths are M10/M15. Not this tree. |
| Ledger fallback | Weaker than M11 `inspectAuthorizationFor` (no chain-trust / artifact verify). When M11 is wired, empty `authorizationFor` is **not** overridden by the effect's claimed decision id. |

## 6. Files

```
orchestrator/src/v4/proof/authz.ts          (new)
orchestrator/src/v4/proof/builder.ts
orchestrator/src/v4/proof/reassess.ts
orchestrator/src/v4/proof/index.ts
orchestrator/src/v4/proof/M06-AUTHZ-DELIVERY.md  (this note)
orchestrator/tests/v4/proof/authz.test.ts   (new)
orchestrator/tests/v4/proof/fixtures.ts
orchestrator/tests/v4/proof/world.ts
```

`M06-DELIVERY.md` (V4.0 min) was **not** rewritten as APPROVED.

## 7. Delivery self-check

| Criterion | Status |
|-----------|--------|
| EXTERNAL without verifiable authz refs cannot be PROVEN | Met |
| Empty `authorizationFor` ≠ authorized; no invented grant ids | Met |
| `generated_by.verifier_id` == subject executor capped (RR-W5-05 slice) | Met |
| Open-effect PARTIAL via frozen `deriveFinalStatus` preserved | Met |
| Existing proof suite green | Met (37/37 proof; 364/364 `tests/v4`) |
| No contract thaw / M09 / V3.7 cert / trust scores / APPROVED / merge / npm install | Met |
| F02 / D13 **not** claimed globally closed; RR-W5-02 documented OPEN | Met |

**Status: DELIVERED for orchestrator / independent review.** M06 does not mark this cut ACCEPTED.
