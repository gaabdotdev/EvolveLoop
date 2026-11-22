# EvolveLoop V4.0 — Baseline environment

**Purpose:** freeze the machine/runtime identity used for V4 baseline measurements (V4-Tests-and-Benchmarks.md §2 / §8).  
**Captured at (UTC):** 2026-11-22T16:44:09Z  
**Repo:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass`  
**Branch:** `main` (tracking `origin/main` at capture)

## Identity

| Field | Value |
|-------|-------|
| Commit SHA | `577b63cdc986eecd4c7943cf627ad1672cfeb935` |
| Commit subject | `feat: close DoD V1 gates M1–M21/M23 (TUI, engine, firetest)` |
| Commit date (author) | 2026-11-22 12:33:09 -0300 |
| CLI entrypoint | `bin/evolve` → `orchestrator/dist/cli/evolve.js` |
| CLI version string (`evolve --help`) | `0.1.0-v0-cli` |
| Orchestrator package | `@agents/orchestrator` `2.0.0` (`orchestrator/package.json`) |
| Build present | `orchestrator/dist/cli/evolve.js` exists (no rebuild during baseline) |

## Operating system

| Field | Value |
|-------|-------|
| `uname -a` | `Linux gaab 6.12.88+deb13-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.12.88-1 (2026-05-15) x86_64 GNU/Linux` |
| Distro | Debian GNU/Linux 13 (trixie), `VERSION_ID=13`, `DEBIAN_VERSION_FULL=13.5` |

## CPU / RAM

| Field | Value |
|-------|-------|
| CPU model | AMD Ryzen 5 5500 |
| Architecture | x86_64 |
| Logical CPUs (`nproc`) | 12 (6 cores × 2 threads) |
| CPU MHz range (`lscpu`) | min 400 / max 4267 |
| MemTotal | 33542242304 bytes (~31.24 GiB) / `MemTotal` 32756096 kB |
| MemAvailable at idle samples | ~17414656–17435244 kB (~16.62 GiB median of 5 samples) |
| Swap | 11 GiB total, 0 B used at capture |

## Node / shell / terminal

| Field | Value |
|-------|-------|
| Node | `v22.15.0` (`/home/gaab/.local/bin/node`) |
| Engines declared | `node >= 20` (`orchestrator/package.json`) |
| Login shell (`$SHELL`) | `/usr/bin/fish` (fish 4.0.2) |
| Measurement driver shell | zsh 5.9 (Cursor agent command runner) |
| `$TERM` in measurement runner | `dumb` |
| `$TERM_PROGRAM` | `Orca` |
| `$COLORTERM` | `truecolor` |
| GNU `time` (`/usr/bin/time`) | **absent** — resource figures via Python `os.wait4` rusage + `/proc` VmRSS sampler |

## Provider / configuration relevant to CLI boot

| Field | Value |
|-------|-------|
| Provider readiness probe | `Ollama · FreeLLMAPI(needsKey)`; `ready=true` (`ollama_up=true`) |
| Workspace state DB | `.evolveloop/state.db` exists, `journal_mode=wal`, **0** validated Goal Contracts |
| Long-lived `evolve.js` already running | PID 42277 (~3h elapsed, ~149016 kB RSS, ~0.3% CPU) — **not** started by this baseline; noted as ambient load |

## Measurement artifacts (raw)

Stored under repo (not part of the §8 human log format, but reproducible):

- `.tmp/v4-baseline/raw-commands.json`
- `.tmp/v4-baseline/raw-wait4-and-shell.json`
- `.tmp/v4-baseline/raw-shell-to-prompt.json`
- `.tmp/v4-baseline/raw-shell-on-ready.json`
- `.tmp/v4-baseline/raw-shell-coldstart.json`
- `.tmp/v4-baseline/raw-measurements.json`

## Honesty notes

- Baseline is **observational only** — no improvement targets invented.
- Interactive **Ink TTY** path (`shouldUseInkTui`) was **not** measured; classic non-TTY / `EVOLVELOOP_FORCE_CLASSIC_REPL=1` path was.
- Ambient PID 42277 means “idle” is host MemAvailable with at least one unrelated `evolve.js` present — not a clean quiescent machine.
