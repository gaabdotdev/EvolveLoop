# V4.2 — Indicadores §5

**Data (UTC):** 2026-11-22T18:07:50Z  
**Spec:** `V4-Tests-and-Benchmarks.md` §5 — Benchmarks e indicadores  
**Baseline:** `docs/v4/V4.0/baseline/` · comparativo: `docs/v4/V4.2/baseline/comparative-report.md`  
**Regra:** medido **ou** LIMITATION — sem % usabilidade inventados.

---

## Tabela

| Indicador §5 | Medido / LIMITATION | Valor | Evidência |
|---|---|---|---|
| Tempo de onboarding | **LIMITATION** | Sem timed human / install limpa E2E | readiness unit only |
| Taxa config sem docs externos | **LIMITATION (N=0 humanos)** | — | — |
| Tempo trocar workspace | **Parcial medido** | `evolve use list` median **461.626 ms** (N=5); open path não timed E2E | raw-measurements |
| Tempo encontrar tarefa histórica | **Parcial medido** | `history list` median **429.959 ms** (lista vazia) | raw-measurements |
| Tempo de retomada | **LIMITATION / proxy** | V4.0 `resume` ~484 ms; V4.2 resume live não re-medido nesta M4 | baseline V4.0; history show unit |
| Tempo resposta comandos comuns | **Medido** | help/prefs/history/use/status ~430–462 ms | comparative-report |
| Init + latência update | **Parcial** | classic→prompt **478.513 ms**; update-durante-Task **LIMITATION** | raw-measurements §2/§4 |
| CPU/mem idle e sob carga | **Parcial** | idle MemAvailable med 17125220 kB; RSS short CLI ~127–130 MiB; carga agent **LIMITATION** | raw-measurements |
| Taxa erro navegação teclado | **LIMITATION (N=0)** | Smoke unit NO_COLOR + layout; sem cohort | navigation-a11y.md |
| Opções sem descrição / ambíguas | **Parcial medido (código)** | Journey help + credentials + glossary advanced; ambiguidade `workspace` documentada | help-usage.ts |

### Latências V4.2 (resumo)

| Comando | Median wall ms | MAD | N | Exit |
|---|---:|---:|---:|---:|
| `evolve --help` | 429.512 | 6.177 | 5 | 0 |
| `evolve help` | 456.003 | 5.375 | 5 | 0 |
| `evolve config prefs` | 439.810 | 4.634 | 5 | 0 |
| `evolve history list` | 429.959 | 7.388 | 5 | 0 |
| `evolve use list` | 461.626 | 8.612 | 5 | 0 |
| `evolve status` | 451.098 | 11.088 | 5 | 0 |
| classic → `evolve>` | 478.513 | 5.400 | 5 | 0 |

vs V4.0 `--help` 465.542 / `status` 482.783 — ver comparative-report (sem claim de otimização de produto).
