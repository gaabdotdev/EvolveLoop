# META M11 — Trust & Provenance Graph

Read `WAVE5-COMMON.md` first.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m11` |
| Branch | `feature/v4/m11-provenance` |
| Ownership | `orchestrator/src/v4/provenance/**` + `orchestrator/tests/v4/provenance/**` |
| Contracts | FROZEN — `ProvenanceQueryPort` in `contracts/ports.ts` |
| Chapters | §4.12 Provenance; also §5/§8/§9/§13 as consumers |
| Acceptance | ACCEPTANCE-CRITERIA M11 + F02, F07, F14, D13, D16, D17 |

## §4.12 questions (port methods)

Realize `ProvenanceQueryPort` so each returns **verifiable refs** (ledger event ids, artifact ids, evidence ids, policy decision / grant ids — never chat memory):

1. `decisionOrigin(decision_ref)` — de onde veio esta decisão?
2. `artifactAuthors(artifact_id)` — qual executor alterou este artefato?
3. `evidenceForRequirement(goal_contract_id, version, criterion_id)` — qual evidência comprova este requisito?
4. `authorizationFor(effect_id)` — qual permissão autorizou esta ação?

## Implement

1. Read-model only — rebuildable index; do not become authoritative Work Continuity.
2. Compose M01/M02/M03/M06/M10 (+ M17 baseline artifacts when present) via ports — do not rewrite their trees.
3. Fail closed: missing refs / hash mismatch / SELF_REPORTED presented as independent ⇒ empty or explicit failure, never fabricated ids.
4. No global trust/reputation score; no L2/L3 routing API; no invented capability scores.
5. Anchor answers to the hash-chained event log when the ref exists.

## Accept

Tests cover the four queries (happy + fail-closed). Delivery note under `provenance/`. Mark DELIVERED for orchestrator. No merge to integration. No `npm install`. No V3.7 edits. No self-ACCEPTED. No APPROVED.
