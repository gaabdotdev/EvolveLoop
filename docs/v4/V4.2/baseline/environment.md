# EvolveLoop V4.2 — Ambiente das medições comparativas

**Purpose:** identidade máquina/runtime para re-medida vs V4.0 baseline (§8).  
**Captured at (UTC):** 2026-11-22T18:07:50Z  
**Repo:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass`  
**Branch:** `main` · HEAD pin `577b63cdc986eecd4c7943cf627ad1672cfeb935` + working tree V4.2 P0–P2

## Identity

| Field | Value |
|-------|-------|
| Commit SHA (HEAD) | `577b63cdc986eecd4c7943cf627ad1672cfeb935` |
| Working tree | V4.2 P0/P1/P2 uncommitted (help journey, prefs, history, use, a11y rows, credentials docs) |
| CLI entrypoint | `bin/evolve` → `orchestrator/dist/cli/evolve.js` |
| Advanced help version | `2.0.0` (product); legacy label `0.1.0-v0-cli` |
| Orchestrator package | `@agents/orchestrator` `2.0.0` |
| Build | `cd orchestrator && npm run build` → exit 0 (pré-medida) |

## OS / CPU / RAM

| Field | Value |
|-------|-------|
| `uname -a` | `Linux gaab 6.12.88+deb13-amd64 … x86_64 GNU/Linux` |
| Distro | Debian 13 (trixie) |
| CPU | AMD Ryzen 5 5500 · 12 threads |
| MemTotal | ~31.24 GiB |
| MemAvailable (idle sample median) | 17125220 kB |

## Node / shell / terminal

| Field | Value |
|-------|-------|
| Node | `v22.15.0` |
| Measurement driver | zsh (Cursor/Orca agent) |
| `$SHELL` | `/usr/bin/fish` |
| `$TERM` / `$TERM_PROGRAM` | `dumb` / `Orca` |
| GNU `time` | absent — `os.wait4` + `perf_counter` |
| Ambient `evolve.js` | PID 42277 present (mesmo host que V4.0) |

## Artefatos

- `.tmp/v4.2-baseline/raw-commands.json`
- `docs/v4/V4.2/baseline/raw-measurements.md`
- `docs/v4/V4.2/baseline/benchmark-log.md`
- `docs/v4/V4.2/baseline/comparative-report.md`

## Honesty

- Mesma máquina/família que V4.0 baseline; loads/ambient PID podem diferir.
- Ink TTY path **não** re-medido (LIMITATION herdada).
- Não declarar “melhoria de produto” por Δ ~10–40 ms sem estudo de latência percebida.
