# V3.7 recovery continuation worklog — 2026-11-14 (evening)

## Environment inventory (verified)

| Item | Value |
|------|-------|
| Original Cursor workspace | `/home/gaab/Downloads/EvolveLoop` @ `feature/bench-obs-v1` `92a8f3e` (dirty, **untouched**) |
| Recovery worktree | `/home/gaab/Downloads/EvolveLoop-v37-cert` |
| Branch | `recovery/v37-full-cert` (isolated; does not rewrite `recovery/pre-v37-cert`) |
| Baseline commit | `7468a40` + ZIP overlay commit `b693c0e` |
| Snapshot ZIP | `EvolveLoop-recovery-corrections-20261114.zip` (no `.git`) |
| Tailscale | `gaab` online; `gaab-1` **offline** (last seen ~5h) |
| Wiki grounding | `karpathyWiki` EvolveLoop silo present but search `no_hits` → GAP |

## Implemented in this continuation

1. **mTLS (CA + client certs)** — `trust/ca.ts`; enrollment issues client certs; CP serve path requires client certs; peer CN must match session `worker_node_id`; revoke adds CRL entry; tests cover foreign CA / no cert / mismatch / revoke.
2. **Remote task delivery** — live `deliverTask` (offer→ack); connection registry; fabric admin IPC (`admin-ipc.ts`) so attach CLI `--deliver true` talks to serving CP; `worker-serve` CLI.
3. **SEC-H02 IPC** — `tick` privileged; nonce/replay window; optional epoch bind; timing-safe compare.
4. **Worker Runtime sandbox** — routes OS-sandbox contracts through V3.5 `SandboxManager`/bubblewrap; fail-closed when unavailable; node path + memory fixes for real Node under bwrap.
5. **G17 script** — automation path when `EVOLVELOOP_MULTIHOST_LIVE=1` and ≥2 distinct hosts; otherwise honest BLOCKED.

## Validation executed

```text
cd orchestrator && npm ci && npm run build
npx vitest run tests/unit/fabric tests/unit/sec-h02-ipc-privileged.test.ts
→ 10 files / 44 tests PASS
```

## Still open (do not promote to APPROVED)

- **G17 multi-host E2E** — BLOCKED: only one online Linux Tailscale host (`gaab-1` offline). Automation ready; needs second host.
- Broader `npm run test` / integration / evals / bench not yet fully re-run in this continuation.
- Independent auditor pass still required.
- G18 token efficiency still UNVERIFIED unless formal N/A ADR.
- Wiki register pending (GAP: no_hits on EvolveLoop silo).

## Certification rule

Do **not** mark TRUE_FULL_PASS / APPROVED while G17 remains BLOCKED or independent audit is outstanding.
