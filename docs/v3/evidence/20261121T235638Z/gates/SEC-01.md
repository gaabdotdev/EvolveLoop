# Gate V3-SEC-01 — MicroVM + seccomp-bpf (maximum isolation optional)

| Field | Value |
|-------|-------|
| gate | V3-SEC-01 |
| task | M13-V3-SEC-01-MICROVM-SECCOMP |
| attempt | 1/3 |
| status | **PASS_SIMULATED** |
| backend_status | **unavailable** (reported) |
| vitest_sec01_exit | 0 |
| tests_sec01 | 15/15 |
| kvm_present | true (reported; informational only) |
| firecracker | absent |
| runsc (gVisor) | absent |
| seccomp_mode | simulated |
| battery | 10/10 denied (reported) |

## Status semantics

- **UNAVAILABLE** — host backend missing as a fact; or `require_live` without backend; or battery failure
- **PASS_SIMULATED** — no Firecracker/gVisor; deterministic seccomp oracle + escape deny battery pass
- **PASS_LIVE** — backend binary present; live adapter plan (in-guest enforce remains estimated / GAP)

## Acceptance

- [x] `detectBackend()` → firecracker \| gvisor \| unavailable
- [x] seccomp-bpf policy stub + apply path (simulated when backend absent)
- [x] deny syscall/escape battery deterministic when backend absent
- [x] Document UNAVAILABLE vs PASS_SIMULATED vs PASS_LIVE
- [x] Tests `v3-sec-01-microvm.test.ts` policy + deny path
- [x] Evidence honesty reported/estimated/UNAVAILABLE — no invented PASS_LIVE
- [x] No root/KVM required when backends unavailable

## Honesty

| Metric | Value | Honesty |
|--------|-------|---------|
| backend_status | unavailable | reported |
| gate_status | PASS_SIMULATED | reported |
| kvm_present | true | reported |
| battery_all_denied | true | reported |
| live MicroVM isolation | — | UNAVAILABLE |
