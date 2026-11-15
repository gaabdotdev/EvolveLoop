# META M11 — Delivery record (Trust & Provenance Graph)

| Field | Value |
|-------|-------|
| Meta | M11 — Trust & Provenance Graph (V4.3) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m11` · `feature/v4/m11-provenance` |
| Baseline | `feature/v4-integration` tip `89b3c89` (M17 + Phase 4 PARTIAL) |
| Freeze | contracts **FROZEN** — `ProvenanceQueryPort` import-only |
| Ownership | `orchestrator/src/v4/provenance/**` + `orchestrator/tests/v4/provenance/**` |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` already a symlink) |
| V3.7 cert edits | **None** |
| Catalog / `contracts/**` edits | **None** |
| Self-assessed status | **DELIVERED for orchestrator / independent review** — M11 does not mark itself ACCEPTED or APPROVED and does not claim Phase 4 complete |
| Knowledge | Wiki GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset). Grounding = freeze + ADR-V4-0003/0009/0011/0016 + constitution §4.12 + ACCEPTANCE-CRITERIA M11 |

## 1. Commits

Stamped after `git commit` on this branch (see git log). Orchestrator should treat `git rev-parse feature/v4/m11-provenance` as tip.

## 2. What was implemented

Read-model `ProvenanceGraph` realizing the four §4.12 questions via frozen `ProvenanceQueryPort`. Rebuildable index over the hash-chained Event Ledger. **Not** Work Continuity.

| Piece | Role |
|-------|------|
| `ProvenanceGraph` | `decisionOrigin`, `artifactAuthors`, `evidenceForRequirement`, `authorizationFor` |
| `inspect*` | Same queries with an explicit fail-closed reason (not on the frozen port) |
| `indexWorkStream` | Per-work rebuild; `checkEventStream` + `validateWorkEvent` |
| Composition | `EventLedgerPort`, `ArtifactStorePort`, `EffectLedgerPort`, optional `WorkRepositoryPort` + read-only evidence/proof/policy lookups |

Does **not** call `PolicyDecisionPort.decide` or `WorkProofPort.build` (command paths). Uses frozen `isIndependent` / `deriveRequirementStatus` — not reimplemented.

Returned values are allowlisted verifiable refs only (event / artifact / evidence / policy_decision / policy / proof / executor / execution / M10-local grant & approval ids as they appear in the log). Never chat memory.

## 3. Honesty pins

```
PROVENANCE_IS_AUTHORITATIVE_WORK_STATE = false
HASH_CHAIN_IS_NON_REPUDIATION = false
GLOBAL_TRUST_SCORE_DEFINED = false
ROUTES_BY_TRUST_OR_SCORE = false
FABRICATES_MISSING_REFS = false
ANSWERS_FROM_CHAT_MEMORY = false
```

No global trust/reputation score. No L2/L3 routing API. No invented capability scores.

## 4. Fail-closed behaviours (empty refs — never fabricated ids)

| Condition | Result |
|-----------|--------|
| Missing object / unknown criterion / empty `decision_ref` | `[]` (`missing_ref` / `invalid_id`) |
| Broken hash chain (INV-EVT-06) | `[]` (`chain_broken`) — index is retained only so the reason is attributable |
| Payload / event digest mismatch (INV-EVT-03/06) | `[]` (`hash_mismatch`) |
| Artifact `integrity_status ≠ VERIFIED` or `verify ≠ VERIFIED` | `[]` (`artifact_integrity` / `hash_mismatch`) |
| `origin.executor_ref` not corroborated by `artifact.registered` actor | `[]` (`uncorroborated_origin`) |
| `SELF_REPORTED` or `!isIndependent` presented as proof | `[]` (`self_reported_as_independent`) — those evidence ids are **not** returned |
| Wrong Goal Contract version / stale tested hash | `[]` |
| Effect `authorization.policy_decision_id` with no `policy.decided` in this work's log | `[]` (`decision_not_in_ledger`) |
| `decision: DENY` | `[]` (`deny_cannot_authorize`) |
| `REQUIRE_APPROVAL` without `approval.decided` APPROVED | `[]` (`approval_missing`) |
| `fork_inherited` EXTERNAL without a policy.decided **after** `effect.planned` | `[]` |
| Free-text skill/provider name (D17) | ignored; unpinned `skill_artifact_id` → `[]` (`unpinned_supply_chain`) |
| `chat:` / `memory:` / whitespace refs | `[]` (`uncorroborated_origin`) |

Empty means **not proven**, not “no origin existed”.

## 5. Tests

```bash
cd orchestrator && npx vitest run tests/v4/provenance
cd orchestrator && npx vitest run tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/provenance/**` | **31 passed** (4 queries happy + fail-closed, honesty pins, contracts-only imports) |
| full `tests/v4` | **337 passed** (55 files) |
| `npx tsc --noEmit` | no errors under `src/v4/provenance/**` (pre-existing errors remain in M00 `capsule.ts` and M05 `timetravel/replay.ts` — not modified) |

## 6. Files owned

```
orchestrator/src/v4/provenance/**
orchestrator/tests/v4/provenance/**
```

Not modified: `orchestrator/src/v4/contracts/**`, sibling meta trees, `recovery/v37-full-cert`, V3.7 evidence.

## 7. GAPs / residuals (honest)

- Hash chain is tamper-evidence, not non-repudiation (R1). A consistent full-chain rewrite is Control Plane host integrity.
- `PolicyDecision` 1.0.0 has no `decided_by` (R4). Origin cites ledger `policy.decided` / `approval.decided` actors, not a frozen field.
- Grant/approval ids are M10-local (`grn`/`apr`), not catalog kinds (R8). Returned only when present on a trusted event.
- Skill/provider provenance (D17): only hash-pinned `skill_artifact_id` / `provider_artifact_id` that `ArtifactStorePort.verify` accepts. Unsigned `provider.yaml` names are not refs. Manifest signing remains M14.
- Optional evidence/proof/policy lookups must be wired by M19. Without `WorkRepositoryPort` + evidence store, `evidenceForRequirement` fail-closes (`missing_ref`).
- In-memory test fakes only; production persistence is the Event Ledger (M02) after M19 composition.
- Wiki grounding: GAP.

## 8. Independent review

This delivery is **not** self-ACCEPTED. Orchestrator / M20 should reassess the four queries against the frozen port and the fail-closed table above, not via this report's claims.
