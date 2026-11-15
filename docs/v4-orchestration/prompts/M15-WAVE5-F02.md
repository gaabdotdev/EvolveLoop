# META M15 — Wave 5 F02 residual (V3 daemon actor)

Read `WAVE5-COMMON.md`. Ground on `M18-WAVE5-RO.md` **RR-W5-01 remainder** and `M10-FULL-DELIVERY.md` §5.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m15` |
| Branch | `feature/v4/m15-f02-daemon` |
| Ownership | `orchestrator/src/v4/api/**` if needed; narrow edits to `orchestrator/src/cli/**` + **only** `approvals.approve` / `approvals.reject` cases in `orchestrator/src/v3/coordinator/daemon.ts` |
| Co-own | M10 already closed CLI store fallback; do not regress `applyCliApprovalStoreFallback` |

## Implement

1. Under V4 posture (`V4_CLI_STORE_FALLBACK === false` or shared helper from M10 adapter), **refuse** daemon `approvals.approve` / `reject` that treat `params.actor` (default `"cli"`) as authoritative identity.
2. Fail closed with a stable error code (e.g. `F02_DAEMON_ACTOR_REFUSED`) — do not write approval with caller-asserted actor.
3. Prefer routing V4 approvals through existing token/authn path (`V37PolicyAdapter` / operator authn) rather than inventing new PolicyDecision fields (contracts FROZEN).
4. Do not delete the entire V3 daemon; isolate the F02 path. No M09; no APPROVED; no merge; no V3.7 cert.

## Accept

Tests proving daemon approve with asserted actor is refused under V4 posture; existing policy/CLI F02 tests still green. Delivery note. DELIVERED.
