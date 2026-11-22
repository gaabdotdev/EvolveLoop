# AUD-STUB-02 — Auditoria de Persistência e Memória Real

**Status:** PASS  
**UTC:** 2026-11-22T01:44:34Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Comprovar que SQLite WAL, FTS5, sqlite-vec, Cold Storage (Zstd + SHA-256) e Event Store gravam/leem dados reais em disco, sem mapas in-memory fingindo persistência durável.

## Wiki grounding

- Scout/search: hits genéricos de memória (OrbitBot/Kernel/GaabWiki) — **GAP** para contratos AUD-STUB-02 no corpus wiki.
- Classificação baseada em código verificado neste repo + prova de disco neste host.

## Classificação (path:linha)

| Componente | Classificação | Evidência |
|------------|---------------|-----------|
| **StateDb** (SQLite WAL) | **REAL_DISK** | `state-db/schema.ts:4` `PRAGMA journal_mode=WAL`; `store.ts:78+` abre path em FS; `journalMode()`/`assertWalPragmas()`; prova: close→reopen sobrevive, `integrity_check=ok`, `journal_mode=wal`, `synchronous=2`, `busy_timeout=5000`. |
| **Event Store** (`events`) | **REAL_DISK** | `schema.ts` tabela `events`; `store.ts:1308` `appendEventAndProject`; prova: payload `{n:42}` lido após reopen. |
| **MemoryBroker** + **FTS5** | **REAL_DISK** | `memory/schema.ts:14` WAL + `memory_fts` FTS5; `broker.ts:134+` better-sqlite3 em path (ou `:memory:` só se pedido); prova: MATCH `"fts5" AND "persistence"` após reopen. |
| **sqlite-vec** | **REAL_DISK** (neste host) / **NÃO_HABILITADO** (gap honesto se extensão falhar) | `hybrid-search.ts:36` `UnavailableVectorSearch`; `295` `tryLoadSqliteVec` → gap explícito; neste host `vectorSearchAvailable()=true`, canal `sqlite_vec` em hybrid após reopen. |
| **Cold Storage** | **REAL_DISK** | `cold-storage.ts:106` CAS `.zst` + SHA-256; prova: `cas_hash` bate, roundtrip OK, blob no FS (`compressed_file_sha256` registado). |
| **Pyramid Index** | **NÃO_HABILITADO** (disco) | `pyramid-index.ts:22` `PYRAMID_DISK_PERSISTENCE="NÃO_HABILITADO"`; `InMemoryPyramidIndex` (`:263`) — SQL sketch **não** executado. |
| **VirtualMemory RAM** | **IN_MEMORY_STUB** (intencional) | `virtual-memory.ts:122` Map = janela RAM MemGPT; archival = Broker/CAS — **não** finge disco. |
| **IdempotencyStore** | **REAL_DISK** | JSON files sob rootDir (`idempotency/store.ts`) — fora do núcleo SQLite mas persistente. |

### Prova de disco (comando real)

Artefacto: `gates/AUD-STUB-02-disk-proof.json`

Fluxo: criar DB temp → insert → `close()` → novo processo/open → read; `PRAGMA journal_mode` / `integrity_check`; cold hashes.

Resumo:

| Check | Resultado |
|-------|-----------|
| StateDb WAL reopen | `event_survived_reopen: true` |
| integrity_check | `ok` |
| Memory FTS5 MATCH pós-reopen | `fts5_match_after_reopen: true` |
| sqlite-vec hybrid | channels `fts5`, `lexical_secondary`, `sqlite_vec` |
| Cold CAS | `sha256_raw_matches: true`, `roundtrip_ok: true` |
| StateDb `:memory:` | **recusado** (`DISK_REQUIRED`) |

## Correções fail-honest

1. **StateDb** recusa `:memory:` — `resolve(":memory:")` criaria ficheiro literal durável fingindo ephemeral (`store.ts` `DISK_REQUIRED`).
2. **Pyramid** exporta `PYRAMID_DISK_PERSISTENCE = "NÃO_HABILITADO"` — sem teatro de SQL sketch como store ativo.

Nenhum IN_MEMORY_STUB fingindo persistência durável nos caminhos auditados (StateDb / MemoryBroker / Events / Cold / FTS5 / vec).

## Testes

Arquivo: `gates/AUD-STUB-02-tests.txt`

```
Test Files  8 passed (8)
Tests       48 passed (48)
EXIT_CODE=0
```

Suites: `v0-orch-persistence`, `v1-orch-02-event-sourcing`, `v3-mem-01-cold-storage`, `v1-mem-01-hybrid-search`, `v3-mem-02-pyramid`, `v3-mem-03-virtual-memory`, `v2-mem-01-consolidation`, `v0-adapt-memory`.

## Diffstat

Ver `gates/AUD-STUB-02-diffstat.txt`.

## Veredito

Persistência real em disco comprovada para StateDb WAL, Event Store, MemoryBroker/FTS5, sqlite-vec (host com extensão), Cold Storage. Pyramid e VirtualMemory RAM documentados honestamente (não fingem disco). Fail-honest aplicado onde havia risco de teatro (`:memory:` → ficheiro).

**PASS**
