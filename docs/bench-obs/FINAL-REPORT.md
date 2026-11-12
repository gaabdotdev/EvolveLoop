# Relatório Final — Benchmark & Observability (continuação)

**Branch:** `feature/bench-obs-v1`  
**Feature:** `bench-obs`  
**Atualizado:** 2026-11-11

## Entregas desta continuação

1. **Retenção automática** — `retention.ts`, CLI `evolve benchmark retain --days N [--dry-run true]`
2. **Migrações + recovery** — `migrations.ts` (legacy→1.0, quarantine, `.bak`, `repair`/`migrate`)
3. **Adapter usage real** — `adapters/provider-usage.ts` (Anthropic/OpenAI body, VendorCacheUsage, budget HARNESS_REPORTED, UNAVAILABLE)
4. **Collector faults** — testes de duplicado/atraso/inválido/overflow/write_failure
5. **Overhead** — medido e persistido em `evidence/overhead-report.json`
6. **Suite completa** — engineering-v1 × A/B/C × 3 reps = **126 runs** (`exp_5e5332f8df92`)
7. **Delegation ROI decomposto** — qualidade/latência/custo/tokens/rework/coordenação; hierarchy só como contexto

## Resultados comparativos (agregados)

Fonte: `docs/bench-obs/evidence/engineering-v1-full-summary.json`

| Strategy | valid | VCR | mean_ms (harness) | mean_depth | mean_subagents | cost/verified |
|----------|-------|-----|-------------------|------------|----------------|---------------|
| A | 39 | 1.0 | ~2.15 | 0 | 0 | UNAVAILABLE |
| B | 39 | 1.0 | ~1.90 | 0 | 0 | UNAVAILABLE |
| C | 48 | 1.0 | ~2.60 | ~1.56 | ~1.56 | UNAVAILABLE |

ROI A→C: quality_delta=0, latency_delta≈+0.45 ms (harness), tokens/cost UNAVAILABLE, reliability=ok (n≥5).

## Testes

`npx vitest run tests/unit/measurement-plane` → **20/20 PASS**.

## Honestidade

- Esta bateria **não** é execução live de LLM/Engineering Loop; é o harness determinístico do Measurement Plane.
- Tokens/custos **não** foram inventados.
- Profundidade/subagentes **não** são evidência isolada de boa delegação.
- **TUI/Dashboard = NOT_IMPLEMENTED**.

## Como reproduzir

```bash
cd orchestrator && npm run build
npx vitest run tests/unit/measurement-plane
node ../scripts/bench-obs/run-engineering-v1.mjs --repetitions 3
evolve benchmark retain --data-dir ./v3-data --days 30 --dry-run true
evolve benchmark migrate --data-dir ./v3-data
evolve benchmark overhead --iterations 5
```
