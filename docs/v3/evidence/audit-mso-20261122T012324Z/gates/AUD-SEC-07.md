# AUD-SEC-07 — MicroVM / DLP / eBPF (opcional privilegiado)

**Status:** PASS  
**UTC:** 2026-11-22T01:54:28Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Runtime live **ou** documentação honesta de perfis opcionais/privilegiados.
Não inventar PASS_LIVE sem Firecracker/gVisor / CAP_BPF+bpftool.

## Host probe

Ver `gates/AUD-SEC-host-probe.json`.

| Perfil | Estado neste host | Constante / gate |
|--------|-------------------|------------------|
| DLP egress (Credential Proxy) | **REAL** | `inspectEgress` + authorize wiring — sem priv kernel |
| MicroVM live (FC/gVisor) | **NÃO_HABILITADO** | `MICROVM_LIVE_RUNTIME = "NÃO_HABILITADO"`; `detectBackend().backend=unavailable`; gate `PASS_SIMULATED` (battery deny 100% simulated). KVM presente = só informativo. |
| eBPF live attach | **NÃO_HABILITADO** | `EBPF_LIVE_RUNTIME = "NÃO_HABILITADO"`; sem CAP_BPF / bpftool; gate `PASS_SIMULATED` (OOB correlation determinística). `require_live` → UNAVAILABLE. |

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| G1 | `security/dlp-egress.ts` | **REAL** | Patterns secret + proprietary; wired em CredentialProxy. |
| G2 | `sandbox/microvm-profile.ts` | **PASS_SIMULATED** / live **NÃO_HABILITADO** | Honesty contract UNAVAILABLE / PASS_SIMULATED / PASS_LIVE. Default live marker explícito. |
| G3 | `security/ebpf-audit.ts` | **PASS_SIMULATED** / live **NÃO_HABILITADO** | Idem; zero-bypass só claimed em modo simulado/live honesto. |
| G4 | Red-team continuous | **REAL** (catálogo) | sandbox + SSRF + DLP attack cases. |

## Testes

- `v3-sec-01-microvm` (16 incl. honesty marker)
- `v3-sec-02-dlp-egress` (23)
- `v3-sec-03-ebpf-audit` (13 incl. honesty marker)
- `v3-sec-04-redteam` (9)

**EXIT_CODE=0**.

## Veredito

**PASS** — DLP REAL; MicroVM/eBPF live documentados como **NÃO_HABILITADO** neste host com `PASS_SIMULATED` honesto (sem teatro de PASS_LIVE).
