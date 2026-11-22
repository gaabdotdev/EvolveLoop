# Dependency Matrix — Meta × componentes × ADRs × riscos

---

## 1. Meta × componentes atuais (consumo)

Legenda: **R** = reutiliza · **E** = estende · **N** = novo (GAP hoje) · **—** = não toca

| Meta | StateDb | AgentRegistry | Continuity | ProcessSession/lifecycle | Handles | Delivery/Evidence | Harness/Adapters | ModelProviders | CLI/TUI V4 |
|------|---------|---------------|------------|--------------------------|---------|-------------------|------------------|----------------|------------|
| M00 | R | R | R | R | R | R | R | R | R |
| M01 | E | R | R | R | — | R | — | — | E (read) |
| M02 | E | E | R | E | — | R | E | — | — |
| M03 | R | E | E | E | E | — | R | — | E |
| M04 | R | R | — | E | — | — | E | — | E |
| M05 | E | — | R | — | — | E | — | — | E |
| M06 | — | — | — | — | — | — | E | R | E |
| M07 | E | R | — | E | R | — | — | — | E |
| M08 | R | R | R | R | R | R | R | — | E |
| M09 | R | R | R | R | R | R | R | R | R |
| M10 | R | R | R | R | R | R | R | R | R |

---

## 2. Meta × ADRs

| Meta | ADR-001 Work-first | ADR-002 Agent≠Model | ADR-003 Harness/Native | ADR-004 MCP≠ACP | ADR-005 Honesty |
|------|--------------------|---------------------|------------------------|-----------------|-----------------|
| M01 | **primário** | — | — | — | x |
| M02 | x | x | x | — | x |
| M03 | x | x | — | — | x |
| M04 | — | — | **primário** | — | x |
| M05 | x | — | — | — | **primário** |
| M06 | — | x | x | **primário** | x |
| M07 | x | — | — | — | x |
| M08 | x | — | — | — | x |
| M09 | x | x | x | x | x |
| M10 | x | x | x | x | x |

---

## 3. Meta × Gates A–J (prova esperada)

| Meta | Gates mais relevantes |
|------|------------------------|
| M01 | A, B, I |
| M02 | A, B, C |
| M03 | B, C |
| M04 | D, E |
| M05 | G, H |
| M06 | F |
| M07 | A, I |
| M08 | I |
| M09 | — (suporte) |
| M10 | A–J fecho |

Definições: `validation-plan.md`.

---

## 4. Meta × riscos (IDs em risk-register)

| Meta | Riscos primários |
|------|------------------|
| M01 | R-DOM-01, R-MIG-01, R-WIP-01 |
| M02 | R-DOM-02 |
| M03 | R-REP-01 |
| M04 | R-INT-01 |
| M05 | R-DEL-01 |
| M06 | R-INT-02, R-INT-03 |
| M07 | R-DOM-03 |
| M08 | R-MIG-01, R-MIG-02 |
| M09 | R-EXT-01 |
| M10 | R-VAL-01, R-DOC-01 |

---

## 5. Dependências externas / ambiente

| Dependência | Necessária para | Honesty se ausente |
|-------------|-----------------|--------------------|
| Node ≥22.5 | Runtime / CI | FAIL engines |
| tmux (opcional) | Handles attach | soft-fail / LIMITATION |
| FreeLLMAPI | models CLI | optional down |
| Wiki pack EvolveLoop | grounding institucional | **GAP** (já) |
| Cursor MCP host | tools host | `unknown` |
| ACP impl | M06/M10 F | **GAP** / defer |
