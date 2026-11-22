# V3-SEC-03 Evidence — eBPF Out-of-Band audit (MSO M15)

- **ts:** 20261122T000803Z
- **task:** M15-V3-SEC-03-EBPF-AUDIT (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T000803Z`
- **wiki grounding:** pack EvolveLoop PACK_NOT_FOUND; search eBPF/SEC-03 sem hits no vault. Contrato = brief MSO M15 + honesty pattern V3-SEC-01 (`microvm-profile.ts`) + código security existente.

## Implementação

| Peça | Path |
|------|------|
| eBPF OOB audit | `orchestrator/src/v3/security/ebpf-audit.ts` |
| Export security | `orchestrator/src/v3/security/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-sec-03-ebpf-audit.test.ts` |

### Contrato mínimo fechado

- `detectEbpfCapability()`: CapEff CAP_BPF/PERFMON/SYS_ADMIN + bpftool PATH + `/sys/fs/bpf` (paths/caps injetáveis em teste)
- `recordOutOfBand(event)` via `OutOfBandAuditLedger` append-only (sem mutate/delete; seal imutável)
- `RuntimeAuditLog` agent-visible (tamperável) + `correlateOutOfBand` / `correlateSession`
- Bypass battery determinística (`BYPASS_BATTERY_CASES` ×10: file/process/network omit|alter|honest) → **bypass_rate=0**
- Gate honesty: **UNAVAILABLE** vs **PASS_SIMULATED** vs **PASS_LIVE** (nunca inventa PASS_LIVE sem CAP_BPF+bpftool)
- Métricas: `reported` | `estimated` | `UNAVAILABLE`
- **Não** exige root quando CAP_BPF/bpftool ausentes (neste host: CapEff=0, bpftool absent)

### Host probe (honestidade)

| Campo | Valor | Honesty |
|-------|-------|---------|
| backend_status | unavailable | reported |
| gate_status | PASS_SIMULATED | reported |
| cap_bpf_effective | false | reported |
| bpftool_present | false | reported |
| mode | simulated | reported |
| bypass_rate | 0 | reported |
| zero_bypass | true | reported |
| PASS_LIVE | not claimed | — |

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-SEC-03 | `npx vitest run tests/unit/v3-sec-03-ebpf-audit.test.ts` | **0** | `vitest-v3-sec-03.txt` / `.log` / `.exit` |
| Regressão SEC (v3-03 + v3-02 + v3-01 + v2-02 + v1-02 + v1-01) | `npx vitest run …` | **0** | `vitest-regression-sec.txt` / `.exit` |

## STATUS

**PASS_SIMULATED** (backend_status=unavailable; bypass_rate=0)
