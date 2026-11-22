# V5-M03 — Acceptance evidence

**Data:** 2026-11-22  
**Repo:** EvolveLoop

## Comandos (obrigatórios)

```bash
ls docs/v5/M03/
ls orchestrator/tests/unit/v5-m03*.ts
cd orchestrator && npm run build && npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m03*.ts
git diff --check
```

## Resultados

| Comando | Exit | Notas |
|---------|------|-------|
| `ls docs/v5/M03/` | **0** | `README.md`, `acceptance-evidence.md` |
| `ls orchestrator/tests/unit/v5-m03*.ts` | **0** | `v5-m03-model-provider.test.ts` |
| `npm run build` | **0** | `tsc` OK |
| `vitest … v5-m03*` | **0** | 1 file, **7** tests passed |
| `git diff --check` | **0** | sem whitespace errors |

### Vitest (resumo)

```
✓ tests/unit/v5-m03-model-provider.test.ts (7 tests)
Test Files  1 passed (1)
Tests  7 passed (7)
```

## Cobertura de testes

| Caso | Resultado |
|------|-----------|
| Model Registry ≠ Agent Registry (kinds + paths) | PASS |
| Provider seed freellmapi + ollama + custom stub honesty | PASS |
| Credential refs só boolean presence (sem secrets) | PASS |
| resolveModelSelection work > workspace + razões | PASS |
| NO_PREFERENCE quando escopos vazios | PASS |
| routeWithFallback razões + blocked + anti-silent | PASS |
| execution_model_control harness_owned \| runtime_owned | PASS |
| Usage measured\|estimated\|unavailable sem inventar custos | PASS |
| Provider down ≠ Work state change | PASS |

## Diff relevante (novos)

- `orchestrator/src/v3/model-registry/*` — tipos, stores, selection, routing, ownership, usage, custom stub
- `orchestrator/src/v3/paths.ts` — `modelRegistryDir` aditivo
- `orchestrator/tests/unit/v5-m03-model-provider.test.ts`
- `docs/v5/M03/README.md` + este ficheiro

## Honesty notes

- Nenhum custo USD inventado nos testes.
- Custom provider permanece `implementation: stub` / invoke blocked.
- Harness adapters não recebem `assertRuntimeModelControl` bem-sucedido.
