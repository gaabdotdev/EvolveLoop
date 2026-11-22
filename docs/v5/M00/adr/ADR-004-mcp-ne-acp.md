# ADR-004 — MCP ≠ ACP ≠ CLI ≠ API

**Status:** aceite (blueprint V5-M00)  
**Data:** 2026-11-22

---

## Contexto

MCP aparece no Core como policy (`mcp.invoke`) e honesty `unknown` no catalog — sem inventário de sessões Cursor. ACP (Agent Client Protocol) **não** existe no código (`rg` = 0). CLI é a superfície de produto. API pública Work/Agent é **GAP**.

Equivaler estes termos cria falsa interoperabilidade.

## Decisão

1. **CLI** — operador humano / jornada EvolveLoop.  
2. **MCP** — protocolo/host tools; no Core actual = capability + honesty, **não** Agent Runtime.  
3. **ACP** — protocolo distinto (GAP); só adoptável com Meta próprio e entidades Work/Attempt estáveis.  
4. **API** — contrato programático sobre domínio V5 (GAP); não é alias de MCP nem de CLI JSON legado.  
5. Documentação e marketing **proibidos** de dizer “temos ACP” ou “MCP = agentes EvolveLoop” sem evidência.

## Consequências

- Integration strategy trata quatro eixos (ver doc).  
- Gate F (validation-plan) falha se docs equivalerem protocolos.  
- Implementar bridge MCP completo **não** fecha ACP.

## Alternativas rejeitadas

- “Tudo é MCP”.  
- Reusar nome ACP para a CLI.  
- Expor catalog `unknown` como `full`.
