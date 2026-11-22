# AUD-SEC-05 — Taint / prompt injection / memory poisoning → quarentena

**Status:** PASS  
**UTC:** 2026-11-22T01:54:28Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Taint estrutural bloqueia ações privilegiadas; memória/ações derivadas de
contexto tainted entram em QUARANTINED até review.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| E1 | `security/taint.ts` | **REAL** | `taint` / `joinTaint` propagam; gate bloqueia privileged de inputs tainted. |
| E2 | `MemoryBroker` + taint | **REAL** | Promote/action privilegiada de memória tainted → `taint_blocks`. |
| E3 | `security/quarantine.ts` | **REAL** | `quarantineFromTaint` / bridge → QUARANTINED; bloqueia promote ACTIVE/VERIFIED. |
| E4 | Capability Gate | **REAL** | Default-deny `filesystem.delete` / `secrets.read` / `network.egress` / `deploy.publish`. |

## Testes

- `v1-sec-04-taint` (3)
- `v2-sec-01-quarantine` (8)
- `security/audit-adversarial` V0-SEC-05 capability gate
- `v1-sec-05-holdout` (SHA holdout / tamper)

**EXIT_CODE=0**.

## Veredito

**PASS** — taint → quarentena e default-deny de capabilities verificados.
