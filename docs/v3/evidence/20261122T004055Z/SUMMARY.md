# V3-DIST-01 Evidence — Ops diagnose / export-import / backup-restore (MSO M20)

- **ts:** 20261122T004055Z
- **task:** M20-V3-DIST-01-OPS-BACKUP (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T004055Z`
- **wiki grounding:** pack EvolveLoop `PACK_NOT_FOUND` / search DIST|backup sem hits úteis. Contrato = metas V3 §2.4 + `EVOLVELOOP-PRODUCT-GOALS-v0.1.md` META-DIST-001..006 + NFR-009 + brief MSO M20.

## Implementação

| Peça | Path |
|------|------|
| Dist ops API | `orchestrator/src/v3/ops/dist-ops.ts` |
| Export ops barrel | `orchestrator/src/v3/ops/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-dist-01-ops.test.ts` |
| Probe script | `orchestrator/scripts/v3-dist-01-probe.mts` |

### Contrato mínimo fechado

- `diagnose()` — checks compreensíveis (PT summary), runtime/deps, discovery≠enablement (META-DIST-003), separação global≠projeto (META-DIST-005)
- `exportState(version)` / `importState(version)` — envelope `EvolveLoopStateExport` com `body_sha256`; schema v1→v2 via `migrateV1toV2` (NFR-009)
- `backup()` / `restore()` — manifest SHA-256 por ficheiro; roundtrip com verificação; `credentials.env` excluído do archive (só nomes no export)
- Honesty: **PASS_UNIT** (não claim instalador live / PASS_LIVE)

## Probe

| Campo | Valor |
|-------|-------|
| schema_version | `2` |
| diagnose_healthy | `true` |
| separation_ok | `true` |
| export_body_sha256 | `861ad6d87411773474e3df33145ade08f49e54d2fc13f924f4e87edd0ae8460f` |
| import_ok / import_integrity | `true` / `true` |
| backup_file_count | `3` |
| backup_restore_integrity_ok | `true` |
| gate_ok | `true` |

Fonte: `host-probe.json`

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-DIST-01 | `npx vitest run tests/unit/v3-dist-01-ops.test.ts` | **0** | `vitest-v3-dist-01.txt` / `.log` / `.exit` |
| Regressão ops | `npx vitest run …v3-dist-01… …v36-ops-core…` | **0** | `vitest-regression-ops.txt` / `.exit` (14 passed) |

## STATUS

**PASS_UNIT** (diagnose + export/import v1→v2 + backup/restore integrity)
