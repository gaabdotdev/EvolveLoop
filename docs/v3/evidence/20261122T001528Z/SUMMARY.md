# V3-SEC-04 Evidence — Continuous automated red-teaming (MSO M16)

- **ts:** 20261122T001528Z
- **task:** M16-V3-SEC-04-REDTEAM (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T001528Z`
- **wiki grounding:** pack EvolveLoop PACK_NOT_FOUND; search redteam/SEC-04 sem hits no vault. Contrato = brief MSO M16 + oráculos existentes (microvm seccomp, credential-proxy SSRF, dlp-egress).

## Implementação

| Peça | Path |
|------|------|
| Continuous red-team | `orchestrator/src/v3/security/redteam-continuous.ts` |
| Export security | `orchestrator/src/v3/security/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-sec-04-redteam.test.ts` |

### Contrato mínimo fechado

- `runBattery()` cobre:
  - **sandbox_escape** — seccomp deny battery (`ESCAPE_DENY_CASES`) + path escape (`pathEscapesWorkspace`)
  - **ssrf** — `isSsrfBlockedHost` + `evaluateCredentialProxy` (loopback / RFC1918 / link-local / metadata)
  - **dlp_exfil** — `inspectEgress` (secrets + proprietary markers sintéticos)
- `scheduleContinuous({ interval_ms, timers, now_ms, max_ticks })` — hook contínuo com intervalo determinístico em teste
- Métrica: **bypass_rate = 0** (28/28 ataques bloqueados; 3 negativos benignos ALLOW)
- Safety: oráculos in-process / payloads sintéticos — **sem** rede live, **sem** ataques fora do workspace
- Gate honesty: **PASS_SIMULATED** (oráculos reportados; sem claim de red-team host live)

### Host probe (honestidade)

| Campo | Valor | Honesty |
|-------|-------|---------|
| catalog_size | 31 | reported |
| total_attack_cases | 28 | reported |
| bypass_rate | 0 | reported |
| zero_bypass | true | reported |
| gate_status | PASS_SIMULATED | reported |
| default_interval_ms | 60000 | reported |

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-SEC-04 | `npx vitest run tests/unit/v3-sec-04-redteam.test.ts` | **0** | `vitest-v3-sec-04.txt` / `.log` / `.exit` |
| Regressão SEC (v3-04 + v3-03 + v3-02 + v3-01 + v2-02 + v1-02) | `npx vitest run …` | **0** | `vitest-regression-sec.txt` / `.exit` (85 passed) |

## STATUS

**PASS_SIMULATED** (bypass_rate=0; zero_bypass=true; synthetic oracles only)
