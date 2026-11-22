# V4.1 — Indicadores §4

**Data (UTC):** 2026-11-22T17:34Z  
**Spec:** `V4-Tests-and-Benchmarks.md` §4 — Benchmarks e indicadores  
**Baseline V4.0:** `docs/v4/V4.0/baseline/raw-measurements.md` (commit `577b63c…`)  
**Regra:** medido **ou** LIMITATION — sem inventar % usabilidade / TRUE-FULL-PASS de produto.

---

## Tabela

| Indicador §4 | Medido / LIMITATION | Valor | vs baseline V4.0 |
|---|---|---|---|
| Tempo até primeira tarefa iniciada | **LIMITATION** | Sem TTY timed study / sem task live timed | Baseline §7 também LIMITATION para classificação humana |
| Nº comandos/ações até iniciar tarefa | **Medido (código/help)** | Help curto: 1 entrada NL TUI **ou** 1× `evolve intent --text`; Grill 0–N | Baseline Path A: 4–7 ações; Path B: 1 comando intent — **mesma ordem**; help deixou de despejar dezenas de grupos no default |
| Taxa de conclusão da jornada sem ajuda | **LIMITATION (N=0 humanos)** | — | Baseline §10 LIMITATION |
| Tempo para identificar estado e bloqueio | **LIMITATION** | Sem live BLOCKED timed; proxy: `/status` + Approval facade unit | Baseline §7 LIMITATION |
| Tempo para realizar uma aprovação | **LIMITATION** | Sem timed UI; facade approve unit pass | — |
| Taxa de sucesso attach/reconnect | **Parcial medido** | Attach OFF exit 0; ON→fallback CLI exit 0; mock tmux ok; reconnect live **LIMITATION** | N/A na baseline |
| Overhead CPU/memória sessões auxiliares | **LIMITATION** | Nenhuma sessão auxiliar aberta (Handles OFF default; attach fallback text) | Baseline idle RSS long-lived era ambient — não comparável |
| Nº regressões em comandos existentes | **Medido (amostra)** | v41 35/35; m13+v0-tui 25/25 pass; `--help` exit 0 | Baseline `--help` median ~465 ms |

### Latência CLI (N=5, desta máquina, pós-P2)

| Comando | Median wall ms | MAD | Exit |
|---|---|---|---|
| `evolve --help` (journey) | **440.345** | 4.703 | 0 |
| `evolve help advanced` | **430.858** | 7.171 | 0 |
| `evolve agents` | **441.730** | 10.482 | 0 |

**vs baseline `--help`:** median baseline **465.542 ms** (N=7) → agora **440.345 ms** (N=5). Diferença ~25 ms — **não** declarar ganho de produto (amostras/loads diferentes; help agora é texto curto vs JSON grande). Sem regressão óbvia de exit code.

---

## Evidência exigida §4 — checklist

| Evidência | Path | Estado |
|---|---|---|
| Gravação/transcrição cenários | `journey-scenarios.md` | Roteiro + dogfood; **sem** vídeo humano |
| Resultados por tarefa | `journey-scenarios.md` · `usability-results.md` | Auto PASS; humano N=0 |
| Testes automatizados | `automated-test-results.md` | 35/35 |
| Matriz backend | `backend-matrix.md` · `agent-handles-matrix.md` | Feito |
| Viewer ≠ kill | `agent-handles-matrix.md` | Feito |

---

*Fim — indicators.md*
