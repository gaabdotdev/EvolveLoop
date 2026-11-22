# V3-SEC-01 Evidence — MicroVM / seccomp max isolation (MSO M13)

- **ts:** 20261121T235713Z
- **task:** M13-V3-SEC-01-MICROVM-SECCOMP (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T235713Z`
- **wiki grounding:** scout/search vault — no EvolveLoop SEC-01 pack hit (PACK_NOT_FOUND for domain); contrato = brief MSO M13 + código sandbox Landlock/bwrap patterns + este adapter.

## Implementação

| Peça | Path |
|------|------|
| MicroVM profile + seccomp stub | `orchestrator/src/v3/sandbox/microvm-profile.ts` |
| Export sandbox | `orchestrator/src/v3/sandbox/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-sec-01-microvm.test.ts` |

### Contrato mínimo fechado

- `detectBackend()`: `firecracker` | `gvisor` | `unavailable` (PATH probe; paths injetáveis em teste)
- Seccomp-bpf policy stub (`buildDefaultSeccompPolicy` / `serializeSeccompPolicyJson`) + `applySeccompPolicy` simulated|live|unavailable
- Escape deny battery determinística (`ESCAPE_DENY_CASES` ×10) quando backend ausente
- Gate honesty: **UNAVAILABLE** vs **PASS_SIMULATED** vs **PASS_LIVE** (nunca inventa PASS_LIVE sem binary)
- Métricas de evidência: `reported` | `estimated` | `UNAVAILABLE`
- **Não** exige root/KVM quando Firecracker/gVisor ausentes (neste host: KVM presente, binaries ausentes)

### Host probe (honestidade)

| Campo | Valor | Honesty |
|-------|-------|---------|
| backend_status | unavailable | reported |
| gate_status | PASS_SIMULATED | reported |
| kvm_present | true | reported (informational) |
| seccomp_mode | simulated | reported |
| battery_all_denied | true | reported |
| denied_syscall_count | 29 | reported |
| PASS_LIVE | not claimed | — |

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-SEC-01 | `npx vitest run tests/unit/v3-sec-01-microvm.test.ts` | **0** | `vitest-v3-sec-01.txt` / `.log` / `.exit` |
| Regressão SEC (v3-sec-01 + v1-sec-01) | `npx vitest run tests/unit/v3-sec-01-microvm.test.ts tests/unit/v1-sec-01-bwrap-wrapper.test.ts` | **0** | `vitest-regression-sec.txt` / `.exit` |

## STATUS

**PASS_SIMULATED** (backend_status=unavailable)
