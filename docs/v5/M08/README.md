# V5-M08 — Extensibility (slice)

**Status:** implementado (mínimo verificável)  
**Depende de:** M03–M06 contracts (adapter / model / tool / verifier)  
**Tese:** Contratos públicos versionados + registry enable/disable + stub de referência

> **Nota vs roadmap M00:** o blueprint M00 rotulava M08 como “V4 Compatibility Layer”. Este MSO entrega **Extensibility boundary**. Compat V4 dual-label permanece em M01/Work UX.

---

## Objectivo

Expor interfaces estáveis para extensões sem publicar SDK npm completo, com registry e um stub de referência que regista verifier/tool via contrato público.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| Public contracts | `extensions/contracts.ts` | `EXTENSION_CONTRACTS_VERSION`; re-export AgentAdapter / ModelProvider / Tool / Verifier |
| Extension registry | `extensions/registry.ts` | register / list / enable / disable + `permissions` |
| Reference stub | `extensions/reference-stub.ts` | `ext.reference.stub` → echo verifier (+ optional tool) |
| Paths | `extensionsDir` | Aditivo sob v3 data dir |

## SDK sketch

Ver `SDK-sketch.md`. Publish npm completo = LIMITATION.

## Aceitação mínima

- [x] contracts.ts versionado (re-exports)
- [x] registry register/list/enable/disable + permissions
- [x] reference stub regista verifier (ou tool) via contrato
- [x] testes `v5-m08-*.ts`
- [x] LIMITATION full SDK publish

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m08-extensions.test.ts
```

## O que NÃO foi feito

- Publicação npm `@evolveloop/sdk`
- Hot-reload / sandbox de plugins
- Marketplace de extensões  
