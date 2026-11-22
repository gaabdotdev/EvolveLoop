# V3-MEM-01 Evidence — Content-Addressed Cold Storage

- **ts:** 20261121T225051Z
- **task:** M1-V3-MEM-01-CAS-COLD-STORAGE (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T225051Z`
- **prereq V2 exit:** SATISFEITO (`docs/v2/evidence/20261121T224251Z`) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; search `cold storage cas_hash` → no_hits (GAP). Contrato = metas V3 §2.1 + plano mestre §5.1 + código.

## Implementação

| Peça | Path |
|------|------|
| CAS module | `orchestrator/src/v3/memory/cold-storage.ts` |
| Schema v2 pointers | `orchestrator/src/v3/memory/schema.ts` (`cas_hash`, `summary`, `cold_migrated_at`) |
| Broker migrate | `orchestrator/src/v3/memory/broker.ts` (`migrateToCold`, `getColdPayload`) |
| Types / exports | `orchestrator/src/v3/memory/types.ts`, `index.ts` |
| Dep | `@mongodb-js/zstd@^7.0.0` (package.json + lock) |
| Unit tests | `orchestrator/tests/unit/v3-mem-01-cold-storage.test.ts` |

### Contrato mínimo fechado

- `put(bytes)` → SHA-256 do raw, Zstd, blob content-addressed em `rootDir/cas/<aa>/<bb>/<hex>.zst`
- `get(cas_hash)` → decompress + verify SHA-256 (reject on mismatch / corrupt)
- `migrateToCold(sqliteRecord)` → archive body+payload envelope; active SQLite keeps `cas_hash` + summary/metadata; body←summary; `payload_json='{}'`
- Parquet mensal: **fora do mínimo** desta tarefa (alternativa “ou” no contrato); CAS Zstd+SHA-256 fecha §2.1 V3-MEM-01

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-01 | `npx vitest run tests/unit/v3-mem-01-cold-storage.test.ts` | **0** | `vitest-v3-mem-01.txt` / `.log` / `.exit` |
| V2-MEM regression | `npx vitest run tests/unit/v2-mem-*.test.ts` | **0** | `vitest-v2-mem.txt` / `.exit` |

## STATUS

**PASS**
