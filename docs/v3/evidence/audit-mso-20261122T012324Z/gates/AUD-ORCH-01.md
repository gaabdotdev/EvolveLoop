# AUD-ORCH-01 — PRAGMA WAL / synchronous / integrity_check + fencing stale

**Status:** PASS  
**UTC:** 2026-11-22T02:02:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Provar `journal_mode=wal`, `synchronous=FULL` (2), `busy_timeout=5000`,
`PRAGMA integrity_check=ok`, e rejeição de fencing token stale / segundo holder ativo.

## Wiki grounding

- Scout/search EvolveLoop ORCH: **GAP** (no_hits).
- Contrato = brief MSO AUD-ORCH-01 + código verificado.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| A1 | `state-db/schema.ts` PRAGMA WAL/FULL/busy | **REAL** | Schema aplica pragmas no open. |
| A2 | `state-db/store.ts:141` `integrityCheck()` | **REAL** | Exposto nesta auditoria; `assertWalPragmas` exige `ok`. |
| A3 | `store.ts:148` `assertWalPragmas` | **REAL** | wal + sync=2 + busy_timeout + integrity. |
| A4 | `store.ts:735` / `:795` leases + fencing | **REAL** | Segundo holder ativo → throw; token stale → `stale_fencing_token`. |

## Testes

Suite: `v0-orch-persistence` (incl. AUD-ORCH-01 integrity + V0-ORCH-02 fencing).

Artefacto: `gates/AUD-ORCH-tests.txt` — batch EXIT_CODE=0.

## Veredito

**PASS** — pragmas + integrity_check + fencing stale comprovados.
