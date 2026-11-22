# AUD-SEC-SUMMARY — AUD-SEC-01..07

**UTC:** 2026-11-22T01:54:28Z  
**Evidence root:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Batch:** MSO AUD-SEC-BATCH tentativa 1/3  
**Overall:** PASS

## Per-meta

| ID | Status | Prova principal |
|----|--------|-----------------|
| AUD-SEC-01 | PASS | bwrap + path/symlink + `~/.ssh` ENOENT/EACCES |
| AUD-SEC-02 | PASS | env scrub + `redactSecrets` 100% canário |
| AUD-SEC-03 | PASS | SSRF proxy (127/10/169.254/localhost:11434) + `--unshare-net` |
| AUD-SEC-04 | PASS | pgid kill REAL; cgroup mem/pids LIVE; CPU **NÃO_HABILITADO** |
| AUD-SEC-05 | PASS | taint → quarantine + capability default-deny |
| AUD-SEC-06 | PASS | Evidence Validator sensitive diff + holdout SHA |
| AUD-SEC-07 | PASS | DLP REAL; MicroVM/eBPF live **NÃO_HABILITADO** (`PASS_SIMULATED`) |

## Vitest

Arquivo: `gates/AUD-SEC-tests.txt`

```
Test Files  14 passed (14)
Tests       145 passed | 1 skipped (146)
EXIT_CODE=0
```

Suites: `security/audit-adversarial`, `v1-sec-01`…`v1-sec-05`, `v2-sec-01`, `v2-sec-02`,
`v3-sec-01`…`v3-sec-04`, `evidence/secret-redaction`, `v35-security`.

## Honesty markers (código)

- `CGROUP_CPU_CONTROLLER = "NÃO_HABILITADO"`
- `MICROVM_LIVE_RUNTIME = "NÃO_HABILITADO"`
- `EBPF_LIVE_RUNTIME = "NÃO_HABILITADO"`

Host probe: `gates/AUD-SEC-host-probe.json`.

## Diffstat

`gates/AUD-SEC-diffstat.txt` (ficheiros tocados neste batch: cgroup/microvm/ebpf + asserts).

## Wiki

- Grounding: scout/search — hits fora EvolveLoop; **GAP** contratos AUD-SEC na wiki.
- Precedência: código verificado > wiki.
