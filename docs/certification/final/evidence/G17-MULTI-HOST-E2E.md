# G17 Multi-host E2E

**Status:** `BLOCKED`  
**Date (UTC):** 2026-11-15T12:23:00Z  
**Script:** `scripts/v37/multi-host-e2e.sh`

## Probe (no invented PASS)

```text
AUTO_DETECT_TAILSCALE=1 bash scripts/v37/multi-host-e2e.sh
→ {"state":"BLOCKED","reason":"WORKER_HOSTS unset; need >=2 independent Linux hosts","gaab1_hint":"100.121.169.97"}
exit 2
```

## Host inventory

| Host | Tailscale IP | Status |
|------|--------------|--------|
| gaab | 100.96.40.83 | online |
| gaab-1 | 100.121.169.97 | **offline** (idle; last seen ~18h) |

- Local `/etc/machine-id` (gaab): `9c10202d46fb4034b59476c17f1a118f`
- SSH BatchMode to `gaab-1` / `100.121.169.97`: **Connection timed out**

## Not used (forbidden substitutes)

- Same-host containers
- Dual local processes as two “hosts”

## Exact unblock action

1. Power on / reconnect `gaab-1` (or another authorized Linux peer with distinct `machine-id`).
2. Verify: `ssh -o BatchMode=yes -o ConnectTimeout=5 <hostB> 'cat /etc/machine-id'`
3. Run live battery:

```bash
cd orchestrator && npm ci && npm run build
WORKER_HOSTS=gaab,<hostB> EVOLVELOOP_MULTIHOST_LIVE=1 \
  EVIDENCE_DIR=/tmp/g17-evidence \
  bash ../scripts/v37/multi-host-e2e.sh
```

4. Require JSON `state=PASS` with `pre_revoke_delivery=result_accepted` and `post_revoke_delivery=result_accepted`.
5. Archive `/tmp/g17-evidence` under `docs/certification/final/evidence/g17/`.

Until then G17 remains **BLOCKED** and global certification cannot be APPROVED.
