# V3-SEC-01 Evidence — MicroVM (Firecracker/gVisor) + seccomp-bpf

- **ts:** 20261121T235638Z
- **task:** M13-V3-SEC-01-MICROVM-SECCOMP (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T235638Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` appended. Contrato = brief MSO M13 + padrões `sandbox/landlock.ts` / `bwrap-wrapper.ts`.

## Implementação

| Peça | Path |
|------|------|
| MicroVM profile + seccomp stub | `orchestrator/src/v3/sandbox/microvm-profile.ts` |
| Exports sandbox | `orchestrator/src/v3/sandbox/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-sec-01-microvm.test.ts` |

### Contrato mínimo fechado

- `detectBackend()` → `firecracker` | `gvisor` | `unavailable` (PATH probe; honesty **reported**)
- seccomp-bpf policy stub (`SCMP_ACT_ERRNO` + deny list escape-adjacent) + apply path
- Escape deny battery determinística (10 casos) em modo simulado quando backend ausente
- **Não** exige root/KVM quando backends indisponíveis
- KVM presente no host **não** implica MicroVM disponível

### Status semantics (não colapsar)

| Status | Significado |
|--------|-------------|
| **UNAVAILABLE** | `backend_status=unavailable` **como fato de host**; ou `require_live` sem backend; ou battery/seccomp falhou |
| **PASS_SIMULATED** | Backend ausente; oracle seccomp + deny battery determinísticos passam — **não** é isolamento live |
| **PASS_LIVE** | Binário firecracker/runsc detectado; adapter plan live + battery — in-guest enforce honesty **estimated** (GAP: sem spawn MicroVM no path unitário) |

### Host probe (honesty)

| Campo | Valor | Honesty |
|-------|-------|---------|
| backend_status | `unavailable` | reported |
| gate_status (default) | `PASS_SIMULATED` | reported |
| gate_status (require_live) | `UNAVAILABLE` | reported |
| kvm_present | `true` | reported |
| denied_syscall_count | 29 | reported |
| battery_all_denied | `true` | reported |
| firecracker / runsc | absent | reported |

Raw: `raw/microvm-probe.json`

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-SEC-01 | `npx vitest run tests/unit/v3-sec-01-microvm.test.ts` | **0** | `vitest-v3-sec-01.txt` / `.log` / `.exit` |

Tests: **15/15** passed.

## STATUS

**PASS_SIMULATED** (backend_status=**unavailable**; não inventar PASS_LIVE)
