# Acceptance Matrix — Benchmark & Observability (Gates A–G)

**Updated:** 2026-11-11 (post retention/migrations/full suite)  
**Branch:** `feature/bench-obs-v1`  
Status legend: `PASS` | `PARTIAL` | `BLOCKED` | `FAIL` | `NOT_IMPLEMENTED`

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| A | Envelope versionado | PASS | `envelope.ts` + unit tests |
| A | Correlation IDs | PASS | empties omitted; no invented IDs |
| A | Eventos críticos | PASS | critical set + benchmark durability |
| A | Collector | PASS | normal/benchmark + fault tests |
| A | Persistência local | PASS | `{data-dir}/measurement/` |
| A | Export JSONL | PASS | store + CLI |
| A | Validação schema | PASS | `validateMeasurementEvent` |
| A | Duplicação/atraso | PASS | `collector-faults.test.ts` |
| A | Perda detectável | PASS | overflow + write_failure → incomplete |
| A | Cobertura reportada | PASS | `coverage_gaps` |
| B | Trace / árvore / parent-child | PASS | hierarchy tests |
| B | Spawn requested ≠ real ≠ blocked | PASS | BO-ORCH-05 + adapters |
| B | Direct vs coordination vs delegated | PASS | work-share metrics |
| B | Subagentes observáveis | PASS | BO-ORCH-03/04; **not** sole quality evidence |
| C | Reportado ≠ estimado ≠ UNAVAILABLE | PASS | usage aggregate fix + provider-usage adapter |
| C | Usage dedup | PASS | request family key |
| C | Tabela de preços | PASS | `prices.v1.json` |
| C | Latência / percentis | PASS | stats + ROI latency components |
| C | Tokens/custos live | BLOCKED | no API keys this session; fields stay `UNAVAILABLE` (never invented) |
| C | Context utilization completa | PARTIAL | snapshot mapped; limits often UNAVAILABLE |
| D | Suites/cases versionados | PASS | engineering-v1 / 16 cases / 3 fixtures |
| D | Experimentos + workspaces | PASS | runner |
| D | Estratégias A/B/C | PASS | strategies + full battery |
| D | Repetições controladas | PASS | `--repetitions 3` → 126 runs (`exp_5e5332f8df92`) |
| D | Cases inválidos / falhas registadas | PASS | invalidation + experiment status |
| E | Evaluation / TRUE_FULL_PASS / FP checks | PASS | evaluation engine + tests |
| E | Falsos negativos held-out | PARTIAL | held-out cases exist; no independent ground-truth oracle beyond fixtures |
| F | Relatórios + compare + export | PASS | CLI + `engineering-v1-full-*.json` |
| F | Cost per verified completion | PASS (formula) | value `UNAVAILABLE` without reported usage |
| F | Delegation ROI decomposto | PASS | `delegation-roi.ts`; depth/subagents = context only |
| F | Falhas/recuperações amplas | PARTIAL | collector faults covered; eng-stage fault battery thin |
| G | Local-first / secrets | PASS | redaction + local store |
| G | Retenção automática | PASS | `retention.ts` + CLI `benchmark retain` + tests |
| G | Migrações + recovery | PASS | `migrations.ts` + repair/quarantine/backup + tests |
| G | Overhead medido | PASS | `overhead-report.json` (synthetic MP path) |
| G | Falha collector ≠ alterar exec | PASS | observe-only |
| G | Documentação | PASS | docs/bench-obs/* |
| UI | TUI / Dashboard | NOT_IMPLEMENTED | deferred per spec §21; still identified as pending |

## Full battery snapshot (reproducible)

| Field | Value |
|-------|-------|
| Experiment | `exp_5e5332f8df92` |
| Artifact | `docs/bench-obs/evidence/engineering-v1-full-summary.json` |
| Cases | 16 |
| Results | 126 (all `valid`) |
| Repetitions | 3 |
| VCR A/B/C | 1.0 / 1.0 / 1.0 |
| Tokens/cost | `UNAVAILABLE` |
| Nature | Deterministic Measurement Plane harness — **not** live LLM Execution Plane quality |

### Interpretation constraints

1. Verified completion rate = 1.0 validates evaluator plumbing on fixture evidences — **not** a claim that live agents always succeed.
2. Mean end-to-end durations ~1–3 ms are harness wall-clock, **not** provider/engineering latency.
3. Higher mean depth/subagents under strategy C is **contextual**; ROI report separates quality/latency/cost/rework.
4. Do not treat this battery as a substitute for live provider benchmarks.

## BLOCKED / external

| Item | Reason |
|------|--------|
| Live provider token streams | API keys / live sessions unavailable |
| Wiki vault register | `WIKI_ROOT` unset |
| Graphify CLI hardgate | binary absent |
| TUI/dashboard | NOT_IMPLEMENTED (explicit deferral) |
| Live ExecutionEngine comparative quality | Requires live runs with providers; MP adapters ready (`provider-usage`, EventBus adapter) |
