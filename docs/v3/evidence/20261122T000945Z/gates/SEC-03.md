# V3-SEC-03 — Auditoria Out-of-Band via eBPF

- **STATUS:** PASS_SIMULATED
- **task:** M15-V3-SEC-03-EBPF-AUDIT (tentativa 1/3)
- **backend_status:** unavailable (reported)
- **gate_status:** PASS_SIMULATED (reported)
- **cap_bpf_effective:** false (reported)
- **bpftool_present:** false (reported)
- **bpf_fs_accessible:** false (reported)
- **mode:** simulated
- **bypass_rate:** 0 (reported; 10/10 battery — omit/alter detected; honest 1:1)
- **zero_bypass:** true
- **PASS_LIVE:** not claimed — CapEff CAP_BPF=0, bpftool absent, `/sys/fs/bpf` inaccessible; no root required
- **UNAVAILABLE vs PASS_SIMULATED vs PASS_LIVE:**
  - UNAVAILABLE — `require_live` without CAP_BPF/bpftool, or battery fails
  - PASS_SIMULATED — CAP_BPF/bpftool UNAVAILABLE (or `force_simulate`) + 0% bypass battery
  - PASS_LIVE — CAP_BPF (or CAP_SYS_ADMIN) + bpftool detected (estimated until kernel attach helper)
- **Vitest:** `npx vitest run tests/unit/v3-sec-03-ebpf-audit.test.ts` EXIT=0 (12/12)
- **Regression SEC:** v3-03 + v3-02 + v3-01 + v2-02 + v1-02 + v1-01 EXIT=0 (81 passed, 1 skipped)
- **Probe:** `host-probe.json`
