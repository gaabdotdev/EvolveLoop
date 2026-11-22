# LIMITATION — MCP runtime / host (V5-M04)

**Status:** LIMITATION (honesta)  
**ADR:** [ADR-004](../M00/adr/ADR-004-mcp-ne-acp.md), [ADR-005](../M00/adr/ADR-005-capability-honesty.md)  
**Data:** 2026-11-22

---

## O que existe no repo

- Config de exemplo / inventário de projecto sob `mcp/` (`mcp.json`, README) — **configuração de host**, não um runtime MCP mediado pelo Core.
- Capability vocabulary `mcp.invoke` em security profiles (policy gate) — **não** é um MCP client/host.
- V5-M04: `registerMcpServer(config)` grava um `McpServerRecord` em `mcp-servers.json` e pode espelhar um `ToolRecord` (`mcp.<server_id>`) com:
  - `honesty: "unsupported"`
  - `invoke_supported: false`
  - `enabled: false` no tool espelho

## O que NÃO existe

- Inventário live de sessões MCP do Cursor / IDE  
- Bridge Core ↔ MCP server com tools discoveradas  
- `invokeMcpTool` funcional (lança `MCP_INVOKE_UNSUPPORTED`)  
- Equivalência MCP ≡ ACP ≡ CLI ≡ API (proibida por ADR-004)

## Implicação para consumers

| Operação | Resultado M04 |
|----------|----------------|
| `registerMcpServer` | OK — config recorded |
| Assign `mcp.*` tool_id | Registo possível; tool disabled → deny |
| Invoke MCP via Core | **unsupported** — ver erro explícito |
| Declarar “temos MCP host” | **proibido** sem bridge verificável |

## Upgrade path (futuro Meta)

Só elevar honesty para `partial`/`supported` quando existir runtime verificável no Core (session inventory + invoke mediado + testes). Até lá: **unsupported** + este LIMITATION.
