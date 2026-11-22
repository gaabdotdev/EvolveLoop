# AUD-ORCH-03 — Daemon multi-terminal (UDS)

**Status:** PASS  
**UTC:** 2026-11-22T02:02:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Daemon multi-cliente: ≥3 terminais via UDS; disconnect (Ctrl+D simulado) não mata runs.

## Wiki grounding

- GAP; contrato = brief + `v1-orch-01-daemon-uds`.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| C1 | `daemon/uds.ts:101` `createEvolveDaemon` | **REAL** | Sock path temp; multi-accept. |
| C2 | `daemon/uds.ts:291` client | **REAL** | ping / run_start / EOF. |
| C3 | Teste multi-client | **REAL** | 3 clients; runs sobrevivem após `sendEof`+disconnect. |

## Limitações (honestas)

- Prova = **UDS programático** (clientes Node), não TTY interativa real (`evolve` HUD).
- Não cobre attach a um daemon já a correr no host do utilizador fora do teste.
- Equivalente honesto ao “multi-terminal”: N sockets no mesmo `runtime.sock`.

## Testes

`v1-orch-01-daemon-uds` — 1 passed.

## Veredito

**PASS** — multi-cliente UDS + runs sobrevivem a detach; limitações documentadas.
