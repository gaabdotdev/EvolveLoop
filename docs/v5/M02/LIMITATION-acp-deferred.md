# LIMITATION — ACP server deferred (V5-M02)

**Código:** nenhum servidor ACP no Core  
**Fecho planeado:** Meta **M06** (Integration Surfaces Honesty) após domínio Work/Attempt estável

## Decisão

M02 **não** implementa Agent Communication Protocol (ACP) server completo.

Razões (ADR-004 + roadmap M00):

1. ACP cedo sobre domínio errado = risco alto (R-INT-03).
2. MCP ≠ ACP — inventariar host MCP não é runtime de Agent.
3. Contratos Attempt / capability / replace devem existir **antes** de expor wire protocol.

## Honesty

- Ausência de ACP ≠ “ACP unsupported fingido como full”.
- Superfícies actuais: CLI (`evolve work|agents|continuity`), Continuity Handoff, adapter catalog.
- Qualquer demo que diga “ACP ready” sem evidência → **rejeitado** (ADR-005).

## GAP explícito

| Capacidade | Estado M02 |
|------------|------------|
| ACP listen/serve | **deferred** |
| ACP session multiplex | **deferred** |
| CLI Work/Attempt inspect | parcial (`evolve work show\|attempts`) |
| Continuity replace | presente (contrato testável) |
