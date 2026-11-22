# EvolveLoop V4.2 — Benchmark log (§8)

Commit pin HEAD: `577b63cdc986eecd4c7943cf627ad1672cfeb935` (+ working tree V4.2).  
Comparar com `docs/v4/V4.0/baseline/benchmark-log.md`.

---

```text
Benchmark: CLI journey help — evolve help
Versão/commit: 2.0.0 (legacy label 0.1.0-v0-cli) / 577b63cdc986eecd4c7943cf627ad1672cfeb935 + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64 (Debian 13)
CPU/RAM: AMD Ryzen 5 5500 (12 threads) / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: TERM=dumb; TERM_PROGRAM=Orca; non-TTY
Shell: zsh driver; login $SHELL=fish
Provider/modelo (se aplicável): n/a
Configuração relevante: post-build dist; NO_COLOR=1; ambient evolve.js PID 42277
Cenário e comando: ./bin/evolve help
Número de repetições: 5 (1 warmup discarded)
Resultados brutos: wall_ms = 442.610, 448.726, 460.849, 461.378, 456.003
Mediana: 456.003 ms wall; ru_maxrss 127076 kB
Dispersão: MAD 5.375 ms
Erros/observações: exit 0 all; stdout journey + credentials block (~1744 B)
Artefatos: .tmp/v4.2-baseline/raw-commands.json; raw-measurements.md §1
```

---

```text
Benchmark: CLI help flag — evolve --help
Versão/commit: 2.0.0 / 577b63c… + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: same as help
Cenário e comando: ./bin/evolve --help
Número de repetições: 5
Resultados brutos: wall_ms = 469.006, 425.740, 429.512, 448.219, 423.335
Mediana: 429.512 ms; ru_maxrss 127060 kB
Dispersão: MAD 6.177 ms
Erros/observações: exit 0; comparable to V4.0 --help median 465.542 ms
Artefatos: .tmp/v4.2-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve config prefs
Versão/commit: 2.0.0 / 577b63c… + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: profile + optional workspace config
Cenário e comando: ./bin/evolve config prefs
Número de repetições: 5
Resultados brutos: wall_ms = 435.141, 435.176, 443.987, 439.810, 451.003
Mediana: 439.810 ms; ru_maxrss 128040 kB; out 374 B
Dispersão: MAD 4.634 ms
Erros/observações: exit 0; comando novo vs V4.0 (sem baseline directa)
Artefatos: .tmp/v4.2-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve history list
Versão/commit: 2.0.0 / 577b63c… + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: state.db workspace (0 contracts nesta amostra)
Cenário e comando: ./bin/evolve history list
Número de repetições: 5
Resultados brutos: wall_ms = 414.125, 431.859, 429.959, 460.500, 422.571
Mediana: 429.959 ms; ru_maxrss 128596 kB
Dispersão: MAD 7.388 ms
Erros/observações: exit 0; lista vazia + limitações explícitas
Artefatos: .tmp/v4.2-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve use list
Versão/commit: 2.0.0 / 577b63c… + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: recent-workspaces ledger
Cenário e comando: ./bin/evolve use list
Número de repetições: 5
Resultados brutos: wall_ms = 464.874, 418.071, 444.907, 461.626, 470.238
Mediana: 461.626 ms; ru_maxrss 128236 kB
Dispersão: MAD 8.612 ms
Erros/observações: exit 0
Artefatos: .tmp/v4.2-baseline/raw-commands.json
```

---

```text
Benchmark: Common command — evolve status (comparável V4.0)
Versão/commit: 2.0.0 / 577b63c… + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY
Shell: zsh/python harness
Provider/modelo (se aplicável): n/a
Configuração relevante: trivial status
Cenário e comando: ./bin/evolve status
Número de repetições: 5
Resultados brutos: wall_ms = 439.616, 478.148, 454.625, 451.098, 440.010
Mediana: 451.098 ms; ru_maxrss 129652 kB
Dispersão: MAD 11.088 ms
Erros/observações: exit 0; V4.0 median era 482.783 ms
Artefatos: .tmp/v4.2-baseline/raw-commands.json
```

---

```text
Benchmark: Time to accept input — classic shell evolve>
Versão/commit: 2.0.0 / 577b63c… + V4.2 WT
Data: 2026-11-22T18:07:50Z
Sistema operacional: Linux gaab 6.12.88+deb13-amd64
CPU/RAM: AMD Ryzen 5 5500 / ~31.24 GiB
Node: v22.15.0
Terminal/emulador: non-TTY pipe; EVOLVELOOP_FORCE_CLASSIC_REPL=1
Shell: zsh/python
Provider/modelo (se aplicável): n/a
Configuração relevante: same host as V4.0
Cenário e comando: spawn evolve; wait evolve>; sair
Número de repetições: 5
Resultados brutos: 471.997, 472.746, 482.722, 483.913, 478.513
Mediana: 478.513 ms
Dispersão: MAD 5.400 ms
Erros/observações: Ink TTY NOT measured (LIMITATION)
Artefatos: .tmp/v4.2-baseline/raw-commands.json classic_prompt
```
