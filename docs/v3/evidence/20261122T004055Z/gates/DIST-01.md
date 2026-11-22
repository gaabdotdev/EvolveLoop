# V3-DIST-01 — Distribuição madura (diagnose / export-import / backup-restore)

- **STATUS:** PASS_UNIT
- **task:** M20-V3-DIST-01-OPS-BACKUP (tentativa 1/3)
- **critério:** META-DIST-001..006 (slices ops) + NFR-009 portabilidade versionada
- **API:** `diagnose` · `exportState(version)` · `importState(version)` · `backup` · `restore`
- **schema:** v2 current / v1 min + migrator `1→2`
- **integrity:** `body_sha256` (export) + per-file SHA-256 manifest (backup)
- **honesty:** PASS_UNIT — sem claim instalador live
- **Vitest:** `npx vitest run tests/unit/v3-dist-01-ops.test.ts` EXIT=0 (10/10)
- **Regression ops:** v3-dist-01 + v36-ops-core EXIT=0 (14 passed)
- **Probe:** `host-probe.json` (`gate_ok=true`)
