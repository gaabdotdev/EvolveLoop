# V3-MEM-06 Evidence — Utility-Based Decay

- **ts:** 20261121T231709Z
- **task:** M6-V3-MEM-06-UTILITY-DECAY (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T231709Z`
- **prereq V3-MEM-01:** PASS (`docs/v3/evidence/20261121T225051Z`) — `migrateToCold` reused, not reopened
- **prereq V3-MEM-02..05:** PASS (regressão nesta pasta) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; search utility/decay → hits genéricos gaabwiki-memory (GAP). Contrato = brief MSO M6-V3-MEM-06 + padrões MEM-01 / agent-profiles score.

## Implementação

| Peça | Path |
|------|------|
| Utility decay | `orchestrator/src/v3/memory/utility-decay.ts` |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-06-utility-decay.test.ts` |

### Contrato mínimo fechado

- `scoreUtility(memory, signals: {true_full_pass_contrib, rework_correlation, recency})`
  - `score = w_tfp * clamp(tfp) - w_rework * clamp(rework) + w_recency * clamp(recency)`
  - defaults: `w_tfp=1`, `w_rework=1`, `w_recency=0.25`; threshold `0.35`
  - signals clamped to `[0,1]`; non-finite → `UtilityDecayError`
- `decayPass({ broker, cold, candidates, … })`
  - seleciona `score < threshold` (lowest first)
  - demove via `broker.migrateToCold` (MEM-01 CAS)
  - skip: `already_cold`, `above_threshold`, `max_migrations`
  - **audit trail append-only** (`DecayAuditEntry[]`); CAS blob preserva payload bruto
- helper opcional: `recencyFromTimestamp` (half-life 7d)

### Cenários cobertos

1. Score: TFP/recency sobem; rework desce; clamp; rejeita NaN
2. already-cold → `low_utility=false` / skip
3. Pass: demove low-utility; mantém high-TFP hot; cold blob recupera raw
4. Audit trail preservada entre passes (append-only + already_cold)
5. `max_migrations` escolhe menor utility primeiro
6. `recencyFromTimestamp` half-life

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-06 | `npx vitest run tests/unit/v3-mem-06-utility-decay.test.ts` | **0** | `vitest-v3-mem-06.txt` / `.log` / `.exit` |
| Regressão MEM-01..05 | `npx vitest run tests/unit/v3-mem-0{1,2,3,4,5}*.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
