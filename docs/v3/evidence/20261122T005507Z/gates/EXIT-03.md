# V3-EXIT-03 — Escala memória + Evolution gate (M23)

- **ts:** 20261122T005507Z
- **task:** M21-M22-M23-V3-EXIT-AUDIT (tentativa 1/3)
- **gate:** V3-EXIT-03

## 1) Escala memória infinita (≥100k eventos / cold storage)

| Campo | Valor |
|-------|-------|
| Harness | `orchestrator/scripts/v3-exit-03-scale-probe.mts` |
| Comando | `npx vite-node scripts/v3-exit-03-scale-probe.mts 100000 <out.json> <workdir> bulk-cas` |
| **SCALE_N** | **100000** |
| `meets_100k` | **true** |
| mode | `bulk-cas` |
| row_count / cold_count | 100000 / 100000 |
| sqlite_operational_bytes | **62640128** (~59.7 MiB) — pointers/summaries only |
| cas_disk_bytes | **12425250** (~11.8 MiB) |
| archived_raw_bytes | 21933340 |
| compression_ratio | ~0.567 |
| sample_cold_roundtrip_ok | **true** |
| sample_cas_hash | `sha256:20c0c817dd36f4ac1f427d296da36828e4596d3973463b89d29e2f2f21673fb2` |
| total_ms | 531342 |
| Report JSON | `../raw/scale-100k.json` |
| Log | `../raw/scale-100k.log` |

### LIMITATION (honest)

`bulk-cas` escreve o shape **pós-migração** via `ColdStorage.put` + schema SQL (não o loop lento `MemoryBroker.propose` por linha). O SQLite operacional contém só pointers/`summary`/`cas_hash` (`avg_payload_json_len_operational=2`). Workdir CAS (~653 MiB) foi movido para `/tmp/v3-exit03-scale-artifacts/20261122T005507Z-scale-workdir` após captura de métricas (fora do repo); reprodução = re-executar o script.

## 2) Zero autoalteração silenciosa em produção (Evolution gate)

| Campo | Valor |
|-------|-------|
| Prereq M17 | `docs/v3/evidence/20261122T002028Z` — **PASS_UNIT** |
| Código | `orchestrator/src/v3/evolution/pipeline.ts` |
| Teste | `orchestrator/tests/unit/v3-evol-01-shadow-replay.test.ts` |
| Prova | `promoteToProduction` **rejeitado** sem Shadow Replay pass; candidatos neutro/regressão sutil em `rejected`; só benéfico promove |
| Revalidação desta sessão | incluído em `vitest-v3-unit.txt` (suite `v3-evol-01-shadow-replay` PASS) |

## STATUS

**PASS** — SCALE_N=100000 com CAS + SQLite operacional medido; evolution shadow rejeita silent prod change (M17 + regressão).
