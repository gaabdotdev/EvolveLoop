# META M10 — Policy full (Wave 5 Trust cut — F02)

Read `WAVE5-COMMON.md`. Ground on `docs/v4/security/M18-WAVE5-RO.md` residuals **RR-W5-01 / RR-W5-02**.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m10` |
| Branch | `feature/v4/m10-policy-full` |
| Ownership | `orchestrator/src/v4/policy/**`, `orchestrator/src/v4/adapters/v37/policy.ts`, `orchestrator/tests/v4/policy/**` |
| Narrow F02 exception | May edit **only** approve/reject store-fallback paths in `orchestrator/src/cli/v35-commands.ts` (co-owned with M15 per OWNERSHIP-MAP; do not refactor unrelated CLI) |
| Contracts | FROZEN — no `decided_by` on PolicyDecision 1.0.0 without RFC |

## Implement

1. **RR-W5-01 / F02:** When V4 posture is active (`V4_CLI_STORE_FALLBACK === false` or equivalent), **refuse** `store.approve(id, actor)` / reject local-store fallback after IPC failure. Fail closed with a clear error — do not silently write approvals via filesystem actor string.
2. Keep token-derived / authenticated operator identity on V4 approve paths (`InMemoryOperatorAuthn`, existing SELF_APPROVAL_DENIED tests).
3. **RR-W5-02 (partial):** Document + test that V4 approval resolution does not treat caller-asserted `actor` as authority; do not invent frozen `decided_by`.
4. Optional partial F14: realpath/canonical deny where M10 already owns path checks — not required to close F14 fully.
5. No trust scores; no M09; no V3.7 cert edits; no contract thaw; no APPROVED.

## Accept

Tests covering refused store fallback + existing policy suites green. Delivery under `policy/` (and note CLI touch). DELIVERED. No merge.
