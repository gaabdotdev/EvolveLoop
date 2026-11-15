# Final regression (closure tip)

**Date (UTC):** 2026-11-15T12:23:00Z  
**Branch:** `recovery/v37-full-cert`  
**Method:** `rm -rf node_modules && npm ci && npm run build` then suites

## Results

| Suite | Result | Notes |
|-------|--------|-------|
| `npm run build` (tsc) | PASS | No TS errors |
| `npm run test:unit` | **116 files / 499 tests PASS** | Was 491; +7 cancel protocol E2E (+1 net from prior scrub already counted) |
| `npm run test:integration` | **24 files / 62 PASS / 1 SKIP** | Skip = graphify CLI (see INTEGRATION-SKIP-INVESTIGATION.md) |
| Fabric + IPC + cancel + SEC-H02 | **13 files / 64 PASS** | Includes cancel-protocol-e2e (7) + cancel-midflight (7) |
| G17 live | **BLOCKED** | Second host offline |

## Test count delta vs prior certified report (491 unit)

| Change | Count |
|--------|-------|
| Prior unit | 491 |
| `cancel-protocol-e2e.test.ts` | +7 |
| Observed unit total | **499** |

No mandatory tests removed. No silent skips added to fabric suites.

## Commands reproduced

```bash
cd orchestrator
rm -rf node_modules && npm ci && npm run build
npm run test:unit
npm run test:integration
npx vitest run tests/unit/fabric tests/unit/sec-h02-*.test.ts
AUTO_DETECT_TAILSCALE=1 bash ../scripts/v37/multi-host-e2e.sh
```
