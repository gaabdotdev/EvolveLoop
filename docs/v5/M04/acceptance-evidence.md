# V5-M04 — Acceptance evidence

**Data:** 2026-11-22  
**Repo:** EvolveLoop  
**Slice:** Tool Registry & assignment (RETRY)

## Wiki grounding

- `ground.sh pack EvolveLoop` → **PACK_NOT_FOUND** (GAP; pack indexado: kernelbot-rag, orbitbot-kernel)
- `ground.sh search … tool registry M04` → **no_hits** / confidence=low
- Contratos usados: `docs/v5/M00/adr/ADR-004`, `ADR-005` + código verificado no repo

## Comandos (obrigatórios)

```bash
ls docs/v5/M04/
ls orchestrator/src/v3/tool-registry/
ls orchestrator/tests/unit/v5-m04*.ts
cd orchestrator && npm run build && npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m04-tool-registry.test.ts
git diff --check
```

## Resultados

| Comando | Exit | Notas |
|---------|------|-------|
| `ls docs/v5/M04/` | **0** | `README.md`, `acceptance-evidence.md`, `LIMITATION-mcp.md` |
| `ls …/tool-registry/` | **0** | `types.ts`, `store.ts`, `governance.ts`, `mcp.ts`, `index.ts` |
| `ls …/v5-m04*.ts` | **0** | `v5-m04-tool-registry.test.ts` |
| `npm run build` | **0** | `tsc` OK (`BUILD_EXIT=0`) |
| `vitest … v5-m04-tool-registry` | **0** | 1 file, **7** tests passed (`VITEST_M04_EXIT=0`) |
| `git diff --check` | **0** | sem whitespace errors |

### Vitest (resumo)

```
✓ tests/unit/v5-m04-tool-registry.test.ts (7 tests)
Test Files  1 passed (1)
Tests  7 passed (7)
```

## Cobertura de testes

| Caso | Resultado |
|------|-----------|
| Seed `shell.exec` + `fs.read` stubs honest | PASS |
| `registerTool` + `listTools` + JSON persist | PASS |
| `assignToolsToAgent` → allow; deny-by-default | PASS |
| Empty allowlist / unknown tool deny | PASS |
| `registerMcpServer` honesty unsupported + invoke refuse | PASS |
| `toolRegistryDir` ≠ agents / model-registry | PASS |
| Sem allowlist global cross-agent | PASS |

## Diff relevante

- `orchestrator/src/v3/tool-registry/*` — API MSO (`registerTool`, `listTools`, `assignToolsToAgent`, `agentMayUseTool`, `registerMcpServer`)
- `orchestrator/tests/unit/v5-m04-tool-registry.test.ts`
- `docs/v5/M04/README.md` + este ficheiro + `LIMITATION-mcp.md`
- Ajuste mínimo IDs em `v5-m05-human-governance.test.ts` (`shell.exec` / `fs.read`) para não quebrar WIP M05

## Honesty notes

- Native tools são **stubs** (`native_stub` / `partial`) — sem spawn/FS neste módulo.
- MCP: `invoke_supported=false`; `invokeMcpTool` → `MCP_INVOKE_UNSUPPORTED`.
- Sem allowlist global; sem fingir MCP host.
