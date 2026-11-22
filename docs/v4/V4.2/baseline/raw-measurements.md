# EvolveLoop V4.2 — Raw measurements (re-medida)

**HEAD:** `577b63cdc986eecd4c7943cf627ad1672cfeb935` + working tree V4.2  
**Captured (UTC):** 2026-11-22T18:07:50Z  
**Spec:** V4-Tests-and-Benchmarks.md §5 / §8  
**Método:** Python `perf_counter` + `os.wait4`; `NO_COLOR=1` `TERM=dumb`; N=5 (node help N=3); warmup 1× `evolve help`  
**Artefacto:** `.tmp/v4.2-baseline/raw-commands.json`

Dispersion = **MAD**. Units: ms wall; RSS kB (Linux rusage).

---

## 1. Comandos comuns (wait4)

| Command | N | Raw wall_ms | Median | MAD | ru_maxrss med (kB) | out_bytes med | Exits |
|---------|---|-------------|--------|-----|--------------------|---------------|-------|
| `evolve help` | 5 | 442.610, 448.726, 460.849, 461.378, 456.003 | **456.003** | 5.375 | 127076 | 1744 | 0 |
| `evolve --help` | 5 | 469.006, 425.740, 429.512, 448.219, 423.335 | **429.512** | 6.177 | 127060 | 1744 | 0 |
| `node dist/cli/evolve.js help` | 3 | 444.032, 432.605, 421.411 | **432.605** | 11.194 | 127364 | 1744 | 0 |
| `evolve config prefs` | 5 | 435.141, 435.176, 443.987, 439.810, 451.003 | **439.810** | 4.634 | 128040 | 374 | 0 |
| `evolve history list` | 5 | 414.125, 431.859, 429.959, 460.500, 422.571 | **429.959** | 7.388 | 128596 | 519 | 0 |
| `evolve use list` | 5 | 464.874, 418.071, 444.907, 461.626, 470.238 | **461.626** | 8.612 | 128236 | 688 | 0 |
| `evolve status` | 5 | 439.616, 478.148, 454.625, 451.098, 440.010 | **451.098** | 11.088 | 129652 | 462 | 0 |

---

## 2. Classic REPL até `evolve>`

| Metric | Value |
|--------|-------|
| Raw to `evolve>` (ms) | 471.997, 472.746, 482.722, 483.913, 478.513 |
| Median | **478.513** |
| MAD | 5.400 |
| N | 5 |
| Env | `EVOLVELOOP_FORCE_CLASSIC_REPL=1` `NO_COLOR=1` |

**LIMITATION:** Ink TTY first-keystroke não medido.

---

## 3. Idle memória (host)

5 amostras `MemAvailable_kB`: todas **17125220** (mediana 17125220).  
Ambient PID 42277 presente — não idle limpo.

---

## 4. Não medidos nesta fatia (LIMITATION)

| Indicador §5 | Motivo |
|---|---|
| Tempo de onboarding humano | Sem cohort; setup unit only |
| Taxa config sem docs externos | N=0 humanos |
| Latência update estado durante Task live | Sem harness EventBus/TUI |
| CPU/% sob carga agent | Sem task provider live |
| Taxa erro navegação teclado | Smoke unit only; N=0 humanos |
