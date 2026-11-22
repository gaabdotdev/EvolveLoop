# ORCH-03 — Idempotency Keys + Saga Compensations

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Idempotência & Saga: reversão compensatória + ausência de duplicação sob chave repetida
- **test_file:** `orchestrator/tests/unit/v2-orch-03-idempotency-saga.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-orch-03-idempotency-saga.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- `buildIdempotencyKey` determinístico (sha256-hex-full).
- Mesma key+fingerprint → replay; efeito chamado 1×.
- Mesma key + fingerprint diferente → `IdempotencyConflictError`.
- Claim in-flight → `IdempotencyInFlightError`.
- Saga 2 steps: falha no 2º → compensate 1º; `isClean()`.
- Path `UNKNOWN` (worktree dirty + pgid morto) dispara compensações via `reconcileWorkOnBootWithSaga`.
- Retry pós-sucesso não duplica efeito (saga+idempotency).

## LIMITATION

Critério §4.1 de interrupção com efeitos parciais coberto deterministicamente (worktree git fixture). LIMITATION residual: não simula SIGKILL do orquestrador em produção.
