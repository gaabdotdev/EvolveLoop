# META M06 — WorkProof authz / origem (Wave 5 Trust)

Read `WAVE5-COMMON.md`. Ground on mission Phase 5 line: *M06 — validação de prova, origem e autorização*; `M18-WAVE5-RO.md` D13 / RR-W5-02 / RR-W5-05.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m06` |
| Branch | `feature/v4/m06-authz` |
| Ownership | `orchestrator/src/v4/proof/**` + `orchestrator/tests/v4/proof/**` |
| Compose | M10 policy + M11 `ProvenanceQueryPort` (do **not** rewrite those trees) |
| Contracts | FROZEN |

## Implement

1. When building/assessing WorkProof, **cap or refuse PROVEN** if required EXTERNAL effects lack verifiable authorization refs (`authorizationFor` / ledger policy.decided) — fail closed, never invent grant ids.
2. Origin: evidence cited as independent must pass existing `isIndependent` + subject ≠ verifier; optional compose with provenance `evidenceForRequirement` when wired.
3. Do not treat M11 empty refs as “authorized”; empty = not proven.
4. Do not invent trust scores; no M09; no contract thaw; no merge; no APPROVED.

## Accept

Tests for authz/origin fail-closed + existing proof suite green. Delivery note. DELIVERED.
