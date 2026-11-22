# EvolveLoop V4.3 — Raw measurements (finais)

**HEAD:** `577b63cdc986eecd4c7943cf627ad1672cfeb935` + working tree V4.3  
**Captured (UTC):** 2026-11-22T18:38:19Z  
**Spec:** V4-Tests-and-Benchmarks.md §6 / §8  
**Método:** Python `perf_counter` + `os.wait4`; `NO_COLOR=1` `TERM=dumb`; N=5; warmup 1× `evolve --help`  
**Artefacto:** `.tmp/v4.3-baseline/raw-commands.json`

Dispersion = **MAD**. Units: ms wall; RSS kB (Linux rusage).

---

## 1. Comandos comuns (wait4)

| Command | N | Raw wall_ms | Median | MAD | ru_maxrss med (kB) | out_bytes med | Exits |
|---------|---|-------------|--------|-----|--------------------|---------------|-------|
| `evolve --help` | 5 | 449.695, 438.521, 427.028, 441.417, 417.688 | **438.521** | 11.174 | 127308 | 2209 | 0 |
| `evolve help` | 5 | 431.380, 463.958, 435.355, 434.682, 431.959 | **434.682** | 2.723 | 128228 | 2209 | 0 |
| `evolve status` | 5 | 439.881, 454.956, 461.786, 454.270, 497.011 | **454.956** | 6.830 | 129420 | 555 | 0 |
| `evolve pause` | 5 | 514.594, 461.196, 448.353, 535.099, 486.217 | **486.217** | 28.377 | 129008 | 628 | 0 |
| `evolve config prefs` | 5 | 462.592, 466.309, 466.181, 451.201, 453.837 | **462.592** | 3.717 | 127276 | 374 | 0 |
| `evolve history list` | 5 | 461.953, 468.334, 450.905, 481.397, 482.169 | **468.334** | 13.063 | 127940 | 519 | 0 |
| `evolve use list` | 5 | 440.558, 441.486, 455.555, 464.741, 479.642 | **455.555** | 14.069 | 126848 | 820 | 0 |
| `evolve delivery show` | 5 | 496.638, 463.586, 454.033, 444.890, 442.344 | **454.033** | 9.553 | 128736 | 185 | 0 |

---

## 2. Classic REPL até `evolve>`

| Metric | Value |
|--------|-------|
| Raw to `evolve>` (ms) | 492.955, 498.609, 497.363, 478.363, 497.618 |
| Median | **497.363** |
| MAD | 1.246 |
| N | 5 |
| Env | `EVOLVELOOP_FORCE_CLASSIC_REPL=1` `NO_COLOR=1` |

**LIMITATION:** Ink TTY first-keystroke não medido.

---

## 3. Idle memória (host)

MemAvailable sample ~17424060416 B. Ambient PID 42277 presente — não idle limpo.

---

## 4. Não medidos (LIMITATION)

| Indicador | Motivo |
|---|---|
| Usabilidade humana / compreensão % | N=0 — ver `usability-final.md` |
| Latência update estado durante Task live | Sem harness EventBus/TUI |
| CPU/% sob carga agent provider | Sem task provider live |
| Handles attach tmux timed | Soft-fail unit only |
