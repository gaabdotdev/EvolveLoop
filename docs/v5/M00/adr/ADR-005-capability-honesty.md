# ADR-005 — Capability honesty

**Status:** aceite (blueprint V5-M00; reforça prática V3/V4 já no código)  
**Data:** 2026-11-22

---

## Contexto

O produto já codifica honesty em vários sítios:

- Harness: não forjar PASS sem CLI/credenciais (`harness/runtime.ts:1-4`)
- Delivery: PASS só com `local_execution` (`delivery-status.ts:1-22`; REMED-M5)
- Adapter catalog: níveis `partial|unsupported|unknown` (ex. MCP)
- Lifecycle: `no_live_targets` em vez de fingir pause
- StateDb: recusa `:memory:`

V5 aumenta a superfície (PWR, integrações). Sem esta ADR, Metas futuras inventam PASS.

## Decisão

1. Nível de capability reportado ∈ {`full`, `partial`, `unsupported`, `unknown`} (ou equivalente explícito) — **nunca** upgrade silencioso.  
2. **PASS** de Delivery / gates / demos exige evidência verificável no modo declarado.  
3. Ausência de mediación Core ⇒ `unknown` ou `unsupported`, não `full`.  
4. LIMITATION / GAP documentados são resultados válidos; “PASS com ressalvas” ≠ “PASS limpo”.  
5. Testes que enfraquecem asserts de honesty são **rejeitados**.

## Consequências

- Gates A–J começam NOT RUN / FAIL até prova (validation-plan).  
- Wiki pack ausente = GAP, não grounding inventado.  
- Cross-provider swap continua `unsupported` até existir bridge real.

## Alternativas rejeitadas

- “Demo green” sem evidence.  
- Mapear attestation → PASS.  
- Inventariar MCP host como Core-mediated.
