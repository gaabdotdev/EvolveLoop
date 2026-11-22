# V3-EXIT-03 — Escala memória + zero autoalteração silenciosa (M23)

- **ts:** 20261122T004621Z
- **task:** M21-M22-M23-V3-EXIT-AUDIT (tentativa 1/3)
- **contrato:** metas V3 §3.3 — estabilidade em escala (100k+ eventos / cold storage; DB operacional controlado) + Evolution gate (M17)

## A) Escala ≥100k eventos + CAS

| Campo | Valor |
|-------|-------|
| Probe | `orchestrator/scripts/v3-exit-03-scale-probe.mts` |
| Mode | `bulk-cas` (ColdStorage.put + pointer rows no schema MEM; pós-migração) |
| **SCALE_N** | **100000** |
| meets_100k | true |
| cold_count | 100000 |
| row_count | 100000 |
| sqlite_operational_bytes | **62627840** (~59.7 MiB) |
| cas_disk_bytes | **12425250** (~11.8 MiB) |
| archived_raw_bytes | 21933340 |
| compression_ratio | ~0.567 |
| avg_body_len_operational | ~60.9 (summary only) |
| avg_payload_json_len_operational | **2** (`{}`) |
| sample_cold_roundtrip_ok | true |
| sample_cas_hash | `sha256:20c0c817dd36f4ac1f427d296da36828e4596d3973463b89d29e2f2f21673fb2` |
| total_ms | 474288 |
| metrics JSON | `../raw/scale-100k.json` |
| log | `../raw/scale-100k.log` |

### Controlo do banco operacional

Após cold: cada linha retém `cas_hash` + `summary`/`body` curto; `payload_json='{}'`. Raw vive em CAS Zstd endereçado por SHA-256. Workdir de blobs movido para `/tmp/v3-exit-audit/scale-workdirs/scale-workdir-100k` após captura (evitar commit de 100k blobs).

### Piloto / regressão API broker (menor N)

| N | mode | sqlite_bytes | cas_bytes | JSON |
|---|------|--------------|-----------|------|
| 2000 | broker (propose+migrate) | 2232320 | 471341 | `../raw/scale-pilot-2k.json` |
| 5000 | broker opt (vector off) | 4153344 | 1169753 | `../raw/scale-opt-5k.json` |

### LIMITATION

`bulk-cas` escreve a **forma pós-migração** via `ColdStorage.put` + SQL do schema (não loop `MemoryBroker.propose`×100k — inviável no slot ~8 min/5k). Contrato CAS/SHA-256/Zstd + ponteiros operacionais **provado** em N=100000. Roundtrip sample OK.

## B) Evolution — rejeita alteração silenciosa em produção (M17)

| Campo | Valor |
|-------|-------|
| Evidence original | `docs/v3/evidence/20261122T002028Z` (V3-EVOL-01) |
| Revalidação esta sessão | `../raw/evol-shadow-revalidate.txt` |
| Exit | **0** (7/7) — `../raw/evol-shadow-revalidate.exit` |
| Gate | só candidato benéfico passa; neutro/regressão rejeitados |
| Silent prod deny | `promoteToProduction` sem shadow pass → `promoted=false`, `detail=shadow_replay_required` |
| Código | `orchestrator/src/v3/evolution/pipeline.ts` |

## M23_STATUS

**PASS** — SCALE_N=100000 com CAS + DB operacional pointer-shaped; Evolution shadow revalidado (zero auto-promote silencioso).
