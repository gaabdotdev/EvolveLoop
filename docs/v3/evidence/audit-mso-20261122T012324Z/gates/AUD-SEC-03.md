# AUD-SEC-03 — Credential Proxy SSRF + unshare-net (fases leitura)

**Status:** PASS  
**UTC:** 2026-11-22T01:54:28Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Bloquear SSRF para `127.0.0.1`, `10/8`, `169.254.169.254`, `localhost:11434`
(e ranges documentados). Fases read/analyze exigem `--unshare-net`.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| C1 | `security/credential-proxy.ts` | **REAL** | Deny-by-default + `SSRF_BLOCKED_RANGES` (loopback, 10/8, 192.168/16, 100.64/10, 169.254/16, localhost). |
| C2 | `v1-sec-02` gate targets | **REAL** | 100% block nos alvos da meta (incl. metadata IMDS e Ollama local). |
| C3 | `v2-sec-02` policies | **REAL** | Políticas V2 ainda bloqueiam SSRF antes de allow de domínio. |
| C4 | `phase-isolation` + bwrap | **REAL** | `read`/`analyze` → `unshare_net: true`; argv contém `--unshare-net` quando bwrap presente. |

## Testes

- `v1-sec-02-credential-proxy` (6)
- `v2-sec-02-credential-policies` (20)
- `v1-sec-03-phase-isolation` (unshare-net + cgroup)
- `v3-sec-04-redteam` (catálogo SSRF ≥8)

**EXIT_CODE=0**.

## Veredito

**PASS** — SSRF privado + unshare-net em fases de leitura comprovados.
