# EvolveLoop V4.3 — Benchmark log (§8)

Commit pin HEAD: `577b63cdc986eecd4c7943cf627ad1672cfeb935` (+ working tree V4.3).  
Comparar com `docs/v4/V4.0/baseline/` e `docs/v4/V4.2/baseline/`.

---

```text
Benchmark: CLI help flag — evolve --help
Versão/commit: 2.0.0 / 577b63cdc986eecd4c7943cf627ad1672cfeb935 + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13)
CPU/RAM: AMD Ryzen 5 5500 (12 threads) / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: TERM=dumb; TERM_PROGRAM=Orca; non-TTY
Shell: zsh driver; login $SHELL=fish
Provider/modelo (se aplicável): n/a
Configuração relevante: post-build dist; NO_COLOR=1; ambient evolve.js PID 42277
Cenário e comando: ./bin/evolve --help
Número de repetições: 5 (1 warmup discarded)
Resultados brutos: wall_ms = 449.695, 438.521, 427.028, 441.417, 417.688
Mediana: 438.521 ms wall; ru_maxrss 127308 kB
Dispersão: MAD 11.174 ms
Erros/observações: exit 0 all; stdout journey help + credentials (~2209 B)
Artefatos: .tmp/v4.3-baseline/raw-commands.json; raw-measurements.md §1
```

---

```text
Benchmark: CLI journey help — evolve help
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: same
Cenário e comando: ./bin/evolve help
Número de repetições: 5
Resultados brutos: wall_ms = 431.380, 463.958, 435.355, 434.682, 431.959
Mediana: 434.682 ms; ru_maxrss 128228 kB
Dispersão: MAD 2.723 ms
Erros/observações: exit 0
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve status
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: product facade task_session
Cenário e comando: ./bin/evolve status
Número de repetições: 5
Resultados brutos: wall_ms = 439.881, 454.956, 461.786, 454.270, 497.011
Mediana: 454.956 ms; ru_maxrss 129420 kB
Dispersão: MAD 6.830 ms
Erros/observações: exit 0
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve pause
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: journey_task_pause StateDb
Cenário e comando: ./bin/evolve pause
Número de repetições: 5
Resultados brutos: wall_ms = 514.594, 461.196, 448.353, 535.099, 486.217
Mediana: 486.217 ms; ru_maxrss 129008 kB
Dispersão: MAD 28.377 ms
Erros/observações: exit 0; MAD alto — I/O StateDb; sem otimização isolada
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve config prefs
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: profile + workspace config
Cenário e comando: ./bin/evolve config prefs
Número de repetições: 5
Resultados brutos: wall_ms = 462.592, 466.309, 466.181, 451.201, 453.837
Mediana: 462.592 ms; ru_maxrss 127276 kB
Dispersão: MAD 3.717 ms
Erros/observações: exit 0
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve history list
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: task-history surface
Cenário e comando: ./bin/evolve history list
Número de repetições: 5
Resultados brutos: wall_ms = 461.953, 468.334, 450.905, 481.397, 482.169
Mediana: 468.334 ms; ru_maxrss 127940 kB
Dispersão: MAD 13.063 ms
Erros/observações: exit 0; lista vazia/recente — proxy
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve use list
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: workspace product surface
Cenário e comando: ./bin/evolve use list
Número de repetições: 5
Resultados brutos: wall_ms = 440.558, 441.486, 455.555, 464.741, 479.642
Mediana: 455.555 ms; ru_maxrss 126848 kB
Dispersão: MAD 14.069 ms
Erros/observações: exit 0
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve delivery show
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: delivery-verify re-derive
Cenário e comando: ./bin/evolve delivery show
Número de repetições: 5
Resultados brutos: wall_ms = 496.638, 463.586, 454.033, 444.890, 442.344
Mediana: 454.033 ms; ru_maxrss 128736 kB; out 185 B
Dispersão: MAD 9.553 ms
Erros/observações: exit 0; sem evidência → UNVERIFIED path (não inventa PASS)
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```

---

```text
Benchmark: Classic REPL time-to-prompt — evolve>
Versão/commit: 2.0.0 / 577b63c… + V4.3 WT
Data: 2026-11-22T18:38:19Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY classic force
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: EVOLVELOOP_FORCE_CLASSIC_REPL=1
Cenário e comando: spawn evolve → first evolve> → sair
Número de repetições: 5
Resultados brutos: wall_ms = 492.955, 498.609, 497.363, 478.363, 497.618
Mediana: 497.363 ms
Dispersão: MAD 1.246 ms
Erros/observações: exit 0; Ink TTY LIMITATION
Artefatos: .tmp/v4.3-baseline/raw-commands.json
```
