# V5-M04 — Tool Registry & assignment

**Status:** implementado (mínimo mas real)  
**Depende de:** M00 (ADR-004, ADR-005), paths `toolRegistryDir`  
**Tese:** Tools são assignáveis por `agent_id` (allowlist); **deny-by-default**; MCP config pode ser registada sem fingir host/runtime.

> **Nota de numbering:** o roadmap M00 nomeia M04 como “Harness ↔ Native”. Esta Meta MSO (série Freedom, após M03) entrega **Tool Registry & assignment** sob `docs/v5/M04/`. ADRs 004/005 aplicam-se.

---

## Objectivo

Registo aditivo de tools + assignment per-agent, com honesty explícita. Sem allowlist global. Sem MCP invoke forjado.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| Tipos | `orchestrator/src/v3/tool-registry/types.ts` | ToolRecord, assignment, MCP record |
| Store JSON | `store.ts` | `tools.json` + `assignments.json` |
| API | `registerTool`, `listTools`, `assignToolsToAgent`, `agentMayUseTool` | Deny-by-default |
| Seed nativo | `shell.exec`, `fs.read` | Stubs honest (`native_stub` / `partial`) |
| MCP | `mcp.ts` → `registerMcpServer` | Config only; `invoke_supported=false` |
| Paths | `paths.ts` → `toolRegistryDir` | Aditivo |
| LIMITATION | [LIMITATION-mcp.md](./LIMITATION-mcp.md) | Sem runtime MCP mediado |

## Fluxo

```text
seed/registerTool → tools.json
assignToolsToAgent(agent_id, tool_ids[]) → assignments.json
agentMayUseTool(agent_id, tool_id) → allow | deny
registerMcpServer(config) → mcp-servers.json (+ tool espelho disabled)
invokeMcpTool → sempre MCP_INVOKE_UNSUPPORTED
```

## Seed nativo (stubs)

| tool_id | honesty | contract |
|---------|---------|----------|
| `shell.exec` | `partial` | Stub de allowlist; mapeia vocab `shell.execute`; **não** spawna processos |
| `fs.read` | `partial` | Stub de allowlist; mapeia vocab `filesystem.read`; **não** abre ficheiros |

## MCP honesty

- `registerMcpServer` grava config (command/args/url refs — sem secrets).
- `honesty: unsupported`, `invoke_supported: false`.
- `invokeMcpTool` lança `ToolRegistryError(MCP_INVOKE_UNSUPPORTED)`.
- Detalhe: [LIMITATION-mcp.md](./LIMITATION-mcp.md).

## Aceitação mínima

- [x] `registerTool` / `listTools` / store JSON
- [x] Seed `shell.exec` + `fs.read` com contratos honestos
- [x] `assignToolsToAgent` per `agent_id` (sem global)
- [x] `agentMayUseTool` deny-by-default
- [x] `registerMcpServer` + invoke unsupported + LIMITATION doc
- [x] Testes `v5-m04-tool-registry.test.ts`
- [x] Sem PASS forjado / sem fingir MCP host

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m04-tool-registry.test.ts
```

Evidência: [acceptance-evidence.md](./acceptance-evidence.md)

## O que NÃO foi feito (propositadamente)

- Host MCP Cursor completo / inventário de sessões live  
- Allowlist global para todos os agents  
- Invoke real de `shell.exec` / `fs.read` neste módulo  
- Agent Studio / SDK / ACP  
- Human Governance (M05) e Verification (M06) — fora deste slice
