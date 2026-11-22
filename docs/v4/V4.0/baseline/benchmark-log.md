# EvolveLoop V4.0 — Baseline benchmark log

Formato mínimo: V4-Tests-and-Benchmarks.md §8.  
Commit pin: `577b63cdc986eecd4c7943cf627ad1672cfeb935`.  
Sem metas de melhoria — apenas baseline.

---

```text
Benchmark: CLI cold start — evolve --help
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 (12 threads) / ~31.24 GiB MemTotal
Node: v22.15.0
Terminal/emulador: TERM=dumb; TERM_PROGRAM=Orca (agent runner); measurement non-TTY
Shell: driver zsh 5.9; login $SHELL=fish 4.0.2
Provider/modelo (se aplicável): n/a (help only)
Configuração relevante: prebuilt orchestrator/dist; cwd=repo root; ambient evolve.js PID 42277 present
Cenário e comando: ./bin/evolve --help
Número de repetições: 7 (1 warmup discarded)
Resultados brutos: wall_ms = 462.327, 456.799, 473.336, 471.773, 461.120, 465.542, 504.519; ru_maxrss_kb median path via wait4
Mediana: 465.542 ms wall; ru_maxrss 124764 kB; ru_utime 0.514011 s
Dispersão: MAD wall 6.231 ms (min 456.799, max 504.519)
Erros/observações: exit 0 all; GNU /usr/bin/time absent — used os.wait4
Artefatos: .tmp/v4-baseline/raw-wait4-and-shell.json; docs/v4/V4.0/baseline/raw-measurements.md §1
```

---

```text
Benchmark: Time to accept input — classic shell evolve>
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 (12 threads) / ~31.24 GiB MemTotal
Node: v22.15.0
Terminal/emulador: non-TTY pipe; EVOLVELOOP_FORCE_CLASSIC_REPL=1; NO_COLOR=1; TERM=dumb
Shell: zsh driver invoking python3 harness
Provider/modelo (se aplicável): probe ready via Ollama (FreeLLMAPI needsKey); no LLM call
Configuração relevante: .evolveloop/state.db wal, 0 contracts
Cenário e comando: spawn ./bin/evolve; stream until "evolve>"; send "sair"
Número de repetições: 7
Resultados brutos: to_evolve_prompt_ms = 520.440, 508.267, 513.149, 532.513, 532.912, 523.754, 520.273
Mediana: 520.440 ms
Dispersão: MAD 7.291 ms
Erros/observações: Ink TTY path NOT measured (LIMITATION). All runs exit 0 after sair.
Artefatos: .tmp/v4-baseline/raw-shell-to-prompt.json; raw-measurements.md §2
```

---

```text
Benchmark: Common command — evolve status
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a (trivial zero-token bypass)
Configuração relevante: 0 validated Goal Contracts
Cenário e comando: ./bin/evolve status
Número de repetições: 7
Resultados brutos: wall_ms (wait4) = 468.392, 483.220, 484.848, 481.704, 482.783, 480.551, 501.053
Mediana: 482.783 ms wall; ru_maxrss 128760 kB; ru_utime 0.524717 s
Dispersão: MAD wall 2.065 ms
Erros/observações: exit 0; message indicates no contracts yet; [local · 0 tok]
Artefatos: .tmp/v4-baseline/raw-wait4-and-shell.json; raw-commands.json
```

---

```text
Benchmark: Common command — evolve resume
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: state.db exists; initialized=false; 0 contracts
Cenário e comando: ./bin/evolve resume
Número de repetições: 7
Resultados brutos: wall_ms = see raw-commands.json resume.wall_ms_raw (median 483.837)
Mediana: 483.837 ms; peak RSS sampler median 124208 kB
Dispersão: MAD 17.790 ms
Erros/observações: exit 0; no resumable session — measures empty-resume path only
Artefatos: .tmp/v4-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve pause
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: trivial pause via intent-flow bypass
Cenário e comando: ./bin/evolve pause
Número de repetições: 5
Resultados brutos: median wall 507.273 ms (raw in raw-commands.json)
Mediana: 507.273 ms; peak RSS median 125924 kB
Dispersão: MAD 21.833 ms
Erros/observações: exit 0
Artefatos: .tmp/v4-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve adapters list
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a (catalog list)
Configuração relevante: default adapter catalog
Cenário e comando: ./bin/evolve adapters list
Número de repetições: 5
Resultados brutos: median wall 498.762 ms
Mediana: 498.762 ms; peak RSS median 126300 kB
Dispersão: MAD 5.400 ms
Erros/observações: exit 0
Artefatos: .tmp/v4-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve daemon status (daemon down)
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: no UDS daemon listening
Cenário e comando: ./bin/evolve daemon status
Número de repetições: 5
Resultados brutos: median wall 486.373 ms
Mediana: 486.373 ms; peak RSS median 121792 kB
Dispersão: MAD 5.010 ms
Erros/observações: exit 1 expected (daemon not running)
Artefatos: .tmp/v4-baseline/raw-commands.json
```

---

```text
Benchmark: Advertised command — evolve progress (unimplemented router)
Versão/commit: 0.1.0-v0-cli / 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: help lists progress; evolve.ts does not route it
Cenário e comando: ./bin/evolve progress
Número de repetições: 3
Resultados brutos: median wall 495.974 ms
Mediana: 495.974 ms
Dispersão: MAD 8.022 ms
Erros/observações: exit 1; prints usage; Unknown command stderr — functional gap, latency still recorded
Artefatos: .tmp/v4-baseline/raw-commands.json; raw-measurements.md §3
```

---

```text
Benchmark: Host idle memory sample (no new evolve spawn)
Versão/commit: 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13 trixie)
CPU/RAM: AMD Ryzen 5 5500 / MemTotal 32756096 kB
Node: v22.15.0
Terminal/emulador: n/a
Shell: zsh/python
Provider/modelo (se aplicável): n/a
Configuração relevante: ambient evolve.js PID 42277 (~149016 kB RSS, ~0.3% CPU)
Cenário e comando: read /proc/meminfo ×5; pgrep evolve.js
Número de repetições: 5
Resultados brutos: MemAvailable_kB = 17435244, 17414656, 17425524, 17425548, 17425548
Mediana: MemAvailable ≈ 17425524 kB (~16.62 GiB)
Dispersão: range ~20.6 MiB across samples
Erros/observações: LIMITATION — not clean zero-evolve idle; GNU time absent; no multi-second task CPU profile
Artefatos: .tmp/v4-baseline/raw-commands.json idle_system; raw-measurements.md §5
```

---

```text
Benchmark: Static action count — start common task (shell path)
Versão/commit: 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: n/a (static code/docs inspection)
CPU/RAM: n/a
Node: n/a
Terminal/emulador: n/a
Shell: n/a
Provider/modelo (se aplicável): n/a
Configuração relevante: repl.ts + grill-me/adaptive.ts + master doc §6.3
Cenário e comando: inspect flow evolve → intent → Grill-Me → confirm → continuar [→ consent]
Número de repetições: 1 inspection
Resultados brutos: detailed+consent-granted = 4 actions; vague 2–3 Qs = 6–7 actions incl. optional consent; non-interactive intent = 1 command (execution separate)
Mediana: n/a (discrete counts, not timed)
Dispersão: n/a
Erros/observações: LIMITATION — not a usability study; no completion rate
Artefatos: raw-measurements.md §6; orchestrator/src/v3/evolve-shell/repl.ts; orchestrator/src/v3/grill-me/adaptive.ts
```

---

```text
Benchmark: State-update latency during execution
Versão/commit: 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: n/a
Shell: n/a
Provider/modelo (se aplicável): n/a
Configuração relevante: no live TaskGraph/EventBus UI harness in M8
Cenário e comando: (not executed)
Número de repetições: 0
Resultados brutos: —
Mediana: —
Dispersão: —
Erros/observações: LIMITATION — metric not collected; see raw-measurements.md §4
Artefatos: raw-measurements.md §4
```

---

```text
Benchmark: Identify executing/blocked/awaiting-approval; resume prior task; usability completion
Versão/commit: 577b63cdc986eecd4c7943cf627ad1672cfeb935
Data: 2026-11-22T16:44:09Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: n/a
Shell: n/a
Provider/modelo (se aplicável): n/a
Configuração relevante: 0 contracts; no usability cohort
Cenário e comando: partial — only empty `evolve status` / `evolve resume` latencies measured
Número de repetições: status/resume as above; usability N=0
Resultados brutos: status/resume medians ~483 ms on empty state
Mediana: —
Dispersão: —
Erros/observações: LIMITATION — cannot classify live blocked/approval states or completion rates without harness/users; docs inventory 2–3 (CLI) / 3 (setup) entry docs only
Artefatos: raw-measurements.md §7–§10
```
