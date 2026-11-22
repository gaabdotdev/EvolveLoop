# V3-TEST-02 Evidence — Deterministic Simulation Testing (MSO M19)

- **ts:** 20261122T003424Z
- **task:** M19-V3-TEST-02-DST (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T003424Z`
- **wiki grounding:** pack EvolveLoop PACK_NOT_FOUND / search DST|V3-TEST-02 sem hits úteis. Contrato = brief MSO M19 + plano §5.2 + padrão Mulberry32 (`mso/pbt-fuzz`) + fencing ADR D10.

## Implementação

| Peça | Path |
|------|------|
| DST harness | `orchestrator/src/v3/evaluation/deterministic-sim.ts` |
| Export evaluation | `orchestrator/src/v3/evaluation/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-test-02-dst.test.ts` |

### Contrato mínimo fechado

- `SimulationWorld` — clock / FS / proc / net virtualizados + PRNG seeded (Mulberry32)
- `runScenarios(seed, n≥10000)` → stats (`deadlocks`, `split_brains`, `transcript_hash`)
- Deadlock prevention: wait-for cycle refuse (`lock_refuse_deadlock`)
- Split-brain prevention: monotonic fencing generation; stale writers rejected
- Same seed → identical `transcript_hash` (incremental SHA-256)
- Honesty: simulação in-memory — **PASS_UNIT** (não claim runtime live)

## Probe (n / seed / hash)

| Campo | Valor |
|-------|-------|
| seed | `1404750588` (`DST_DEFAULT_SEED`) |
| n | `10000` |
| deadlocks | `0` |
| split_brains | `0` |
| scenarios_ok | `10000` |
| transcript_hash | `903885b3c2004a39284216ccc3ca4e166e99ff29ae22ebaa45316745a59ed6d2` |
| event_count | `493570` |
| wall_ms (probe) | `203` |
| gate_ok | `true` |
| repro_ok | `true` |

Fonte: `host-probe.json`

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-TEST-02 | `npx vitest run tests/unit/v3-test-02-dst.test.ts` | **0** | `vitest-v3-test-02.txt` / `.log` / `.exit` |
| Regressão TEST | `npx vitest run …v3-test-02… …v3-test-01…` | **0** | `vitest-regression-test.txt` / `.exit` |

## STATUS

**PASS_UNIT** (10 000 cenários; 0 deadlock; 0 split-brain; reprodutibilidade por seed)
