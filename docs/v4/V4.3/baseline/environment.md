# EvolveLoop V4.3 — Ambiente das medições finais

**Purpose:** identidade máquina/runtime para comparative-final vs V4.0/V4.2 (§8).  
**Captured at (UTC):** 2026-11-22T18:38:19Z  
**Repo:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass`  
**Branch:** `main` · HEAD pin `577b63cdc986eecd4c7943cf627ad1672cfeb935` + working tree V4.3 P0–P2

## Identity

| Field | Value |
|-------|-------|
| Commit SHA (HEAD) | `577b63cdc986eecd4c7943cf627ad1672cfeb935` |
| Working tree | V4.3 P0/P1/P2 uncommitted (pause/delivery, consolidation, E2E suite, benchmarks) |
| CLI entrypoint | `bin/evolve` → `orchestrator/dist/cli/evolve.js` |
| Orchestrator package | `@agents/orchestrator` `2.0.0` |
| Build | `cd orchestrator && npm run build` → exit 0 (pré-medida) |

## OS / CPU / RAM

| Field | Value |
|-------|-------|
| `uname -a` | `Linux gaab 6.12.88+deb13-amd64 … x86_64 GNU/Linux` |
| Distro | Debian 13 (trixie) |
| CPU | AMD Ryzen 5 5500 · 12 threads |
| MemTotal | ~31.24 GiB |
| MemAvailable (sample) | ~17424060416 B |

## Node / shell / terminal

| Field | Value |
|-------|-------|
| Node | `v22.15.0` |
| Measurement driver | zsh (Cursor/Orca agent) |
| `$SHELL` | `/usr/bin/fish` |
| `$TERM` / `$TERM_PROGRAM` | `dumb` / `Orca` |
| GNU `time` | absent — `os.wait4` + `perf_counter` |
| Ambient `evolve.js` | PID 42277 present (mesmo host que V4.0/V4.2) |

## Artefatos

- `.tmp/v4.3-baseline/raw-commands.json`
- `docs/v4/V4.3/baseline/raw-measurements.md`
- `docs/v4/V4.3/baseline/benchmark-log.md`
- `docs/v4/V4.3/baseline/comparative-final.md`

## Honesty

- Mesma máquina/família que V4.0/V4.2; loads/ambient PID podem diferir.  
- Ink TTY path **não** re-medido (LIMITATION herdada).  
- Não declarar “melhoria de produto” por Δ de dezenas de ms sem latência percebida.  
- N=5 (≥3 exigido) por comando CLI; classic prompt N=5.
