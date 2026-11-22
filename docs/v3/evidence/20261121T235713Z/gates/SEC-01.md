# V3-SEC-01 — MicroVM max isolation (Firecracker/gVisor) + seccomp-bpf

- **STATUS:** PASS_SIMULATED
- **backend_status:** unavailable (reported)
- **gate_status:** PASS_SIMULATED (reported)
- **kvm_present:** true (reported; informational only — not used; Firecracker/runsc absent)
- **seccomp_mode:** simulated
- **battery_all_denied:** true (reported; deterministic oracle, 10/10 escape cases)
- **denied_syscall_count:** 29 (reported)
- **PASS_LIVE:** not claimed — firecracker/runsc not on PATH; no MicroVM spawn; no root/KVM required
- **UNAVAILABLE vs PASS_SIMULATED vs PASS_LIVE:**
  - UNAVAILABLE — require_live without backend, or battery/seccomp fail
  - PASS_SIMULATED — backend unavailable (or force_simulate) + deny battery passes
  - PASS_LIVE — backend binary detected + live adapter plan path (estimated honesty until in-guest probe)
- **Vitest:** `npx vitest run tests/unit/v3-sec-01-microvm.test.ts` EXIT=0 (15/15)
- **Probe:** `host-probe.json`
