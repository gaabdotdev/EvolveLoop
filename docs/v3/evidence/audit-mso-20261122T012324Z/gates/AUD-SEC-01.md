# AUD-SEC-01 — Path traversal / symlink escape / bwrap `~/.ssh`

**Status:** PASS  
**UTC:** 2026-11-22T01:54:28Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Provar que ExecutionRunner + bwrap bloqueiam path traversal, symlink escape
fora do workspace, e leitura de `~/.ssh` / home externo → ENOENT/EACCES.

## Wiki grounding

- Scout: hits KernelBot security (fora EvolveLoop).
- **GAP:** contratos AUD-SEC-01 não sintetizados na wiki; prova = código + vitest neste repo.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| A1 | `execution-runner` `guardPathBeforeMutation` | **REAL** | Bloqueia `../` fora do workspace (`ExecutionRunnerError`). |
| A2 | `DefaultExecutionRunner.run` cwd symlink | **REAL** | Symlink → fora do workspace → `status: blocked` / `SYMLINK\|ESCAPE\|PATH`. |
| A3 | `bwrap-wrapper` + `os_sandbox: "require"` | **REAL** | Host tem `/usr/bin/bwrap`. Integração lê `~/.ssh` e home externo → exit ≠ 0 + ENOENT/EACCES. |
| A4 | Bubblewrap `--tmpfs /home` | **REAL** | Args incluem tmpfs em `/home` (isola home real). |

## Testes

Suites: `security/audit-adversarial` (V0-SEC-02), `v1-sec-01-bwrap-wrapper`.

```
v1-sec-01: 8 tests | 1 skipped (skip = bwrap missing — not this host)
audit-adversarial path/symlink: PASS
EXIT_CODE=0 (batch)
```

Artefacto agregado: `gates/AUD-SEC-tests.txt`.

## Veredito

**PASS** — traversal, symlink escape e leitura `~/.ssh` sob bwrap negados com evidência de runtime.
