# AUD-SEC-04 — pgid tree kill + cgroups v2

**Status:** PASS  
**UTC:** 2026-11-22T01:54:28Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Timeout → kill da árvore via PGID; cgroups v2 memory/pids (ou documentação
honesta se host sem perms).

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| D1 | `DefaultExecutionRunner` timeout | **REAL** | `sleep 60` + `timeout_ms:300` → `status:timeout`, `pgid:number`, `code:TIMEOUT`. |
| D2 | `cgroup-v2` memory/pids | **REAL** (neste host) | Probe: `can_memory=true`, `can_pids=true`. Apply live: `applied:true`, `mocked:false`, `reason:applied:memory,pids`. Ver `AUD-SEC-host-probe.json`. |
| D3 | `cgroup-v2` cpu.max | **NÃO_HABILITADO** | `CGROUP_CPU_CONTROLLER = "NÃO_HABILITADO"`; probe `can_cpu=false` / `cpu_max_write_denied`. Não se inventa LIVE CPU. |

## Testes

- `security/audit-adversarial` V0-SEC-04 (pgid kill)
- `v1-sec-03-phase-isolation` (cgroup host proof + honesty marker)

**EXIT_CODE=0**.

## Veredito

**PASS** — pgid kill REAL; cgroup memory/pids LIVE neste host; CPU marcado **NÃO_HABILITADO**.
