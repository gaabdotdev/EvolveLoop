# META M06 — WorkProof mínimo (V4.0)

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m06` |
| Branch | `feature/v4/m06-workproof-min` |
| Ownership | `orchestrator/src/v4/proof/**` |
| Chapters | 4.11, 8, 7.1 |
| ADRs | 0009 |

## Implement

- WorkProof v1 linking Goal → requirement → artifact → execution → validation → evidence
- Statuses PROVEN / PARTIAL / FAILED / UNVERIFIED
- Independent verifier interface (deterministic tests minimum)
- Refuse executor self-declaration → PROVEN

## Accept

Important delivery carries proof a third party can assess; insufficient evidence stays UNVERIFIED/PARTIAL.
