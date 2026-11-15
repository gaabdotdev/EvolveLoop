# META M10 — Policy foundations (V4.0)

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m10` |
| Branch | `feature/v4/m10-policy-foundations` |
| Ownership | `orchestrator/src/v4/policy/**` (+ `adapters/v37/policy` stubs) |
| Chapters | 4.10, 9 |
| ADRs | 0011, 0016; address M18 F02/F03 foundations |

## Implement

- Deny-by-default PolicyDecisionPort
- L0–L3 vocabulary wired to contextual decisions (not global agent permission)
- No caller-asserted approver identity (fix F02 path)
- Versioned policy decisions with audit fields

## Accept

Unauthorized actions denied by default; permissions limited/traceable; no self-approve via CLI fallback in V4 path.
