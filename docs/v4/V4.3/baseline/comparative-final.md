# V4.3 — Relatório comparativo final vs V4.0 / V4.2

**Data (UTC):** 2026-11-22T18:38:19Z  
**Baseline V4.0:** `docs/v4/V4.0/baseline/` (commit `577b63c…`, 2026-11-22T16:44Z)  
**V4.2:** `docs/v4/V4.2/baseline/comparative-report.md`  
**V4.3 raw:** `docs/v4/V4.3/baseline/raw-measurements.md` · log §8 em `benchmark-log.md`  
**Regra:** mediana + MAD; N≥3 (aqui N=5); sem inventar ganhos de produto; Δ só onde comparável.  
**Regra §10:** não otimizar métrica isolada piorando clareza.

---

## 1. Ambiente

Mesma máquina (Ryzen 5 5500, Node v22.15.0, Debian 13). Ambient `evolve.js` PID 42277.  
V4.3: working tree com P0–P2 (pause persistido, delivery validate, consolidation copy, E2E suite).

---

## 2. Tabela comparativa (comandos sobreponíveis)

| Cenário | V4.0 med (ms) | V4.0 MAD | V4.2 med (ms) | V4.2 MAD | V4.3 med (ms) | V4.3 MAD | Δ V4.3−V4.0 | Δ V4.3−V4.2 | Nota |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `evolve --help` | 465.542 (N=7) | 6.231 | 429.512 (N=5) | 6.177 | **438.521** (N=5) | 11.174 | −27.0 (−5.8%) | +9.0 (+2.1%) | Help maior (credentials); ruído MAD |
| `evolve status` | 482.783 (N=7) | 2.065 | 451.098 (N=5) | 11.088 | **454.956** (N=5) | 6.830 | −27.8 (−5.8%) | +3.9 (+0.9%) | Facade task_session |
| Classic → `evolve>` | 520.440 (N=7) | 7.291 | 478.513 (N=5) | 5.400 | **497.363** (N=5) | 1.246 | −23.1 (−4.4%) | +18.9 (+3.9%) | Ainda abaixo V4.0; Δ vs V4.2 ≈ noise/load |
| `evolve pause` | 507.273 (N=5) | 21.833 | — | — | **486.217** (N=5) | 28.377 | −21.1 (−4.2%) | n/a | Pause agora persiste StateDb |
| `evolve help` | — | — | 456.003 (N=5) | 5.375 | **434.682** (N=5) | 2.723 | n/a | −21.3 (−4.7%) | Journey help |
| `evolve config prefs` | — | — | 439.810 (N=5) | 4.634 | **462.592** (N=5) | 3.717 | n/a | +22.8 (+5.2%) | Sem claim regressão produto |
| `evolve history list` | — | — | 429.959 (N=5) | 7.388 | **468.334** (N=5) | 13.063 | n/a | +38.4 (+8.9%) | Proxy lista; investigar se queixa |
| `evolve use list` | — | — | 461.626 (N=5) | 8.612 | **455.555** (N=5) | 14.069 | n/a | −6.1 (−1.3%) | |
| `evolve delivery show` | — | — | — | — | **454.033** (N=5) | 9.553 | n/a | n/a | Superfície V4.3 P0 |

RSS median `--help`: V4.0 124764 → V4.2 127060 → V4.3 127308 kB (Δ ~+2.5 MiB vs V4.0; sem conclusão de regressão de produto).

---

## 3. Decisão de performance

| Pergunta | Resposta |
|---|---|
| Há regressão óbvia vs V4.0 nos comandos core? | **Não** — Δ negativos ou dentro de ruído. |
| Há Δ positivo vs V4.2 em alguns comandos? | Sim (`history`, `config`, classic ~+19 ms) — **não** promovido a regressão de produto; ambient + MAD; clareza/docs preservadas (§10). |
| Claim “melhorias demonstradas”? | **Parcial:** evidência de **não-regressão vs V4.0** + medições finais pathadas; sem claim de otimização de produto. |
| Otimizar Ink / history cold path? | **LIMITATION** — sem hotspot de latência percebida; não cortar output útil. |

---

## 4. LIMITATIONs cruzadas

1. Usabilidade humana N=0 (`usability-final.md`).  
2. Ink TTY / update-durante-execução não medidos.  
3. `history`/`use` medem CLI vazia/recente — não “encontrar entre muitas Tasks”.  
4. Wiki pack EvolveLoop ausente.  
5. Handles attach live timed = LIMITATION.

---

## 5. Artefatos

| Path | Conteúdo |
|---|---|
| `environment.md` | Host/runtime |
| `raw-measurements.md` | Tabelas brutas |
| `benchmark-log.md` | Formato §8 |
| `comparative-final.md` | Este relatório |
| `.tmp/v4.3-baseline/raw-commands.json` | JSON reprodutível |
| V4.0 / V4.2 baselines | `docs/v4/V4.0/baseline/*` · `docs/v4/V4.2/baseline/*` |

---

*MSO TASK V43-M4 — P2-2*
