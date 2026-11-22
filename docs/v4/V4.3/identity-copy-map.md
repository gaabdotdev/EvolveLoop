# V4.3 — Mapa identidade UI ↔ runtime (P1-3)

**Data:** 2026-11-22  
**Código:** `orchestrator/src/cli/product-copy.ts`  
**Regra:** IDs/campos runtime intactos; literais `MSO` / `TRUE-FULL-PASS` só L5 / verbose / JSON.

---

## 1. Glossário produto (L0–L3)

| UI (produto) | Runtime / store | Notas |
|---|---|---|
| **Orchestrator** | MSO (lease, state machine, `tokens_mso`) | Copy HUD/slash/banner |
| **Session** | `mso_sessions.state` | Footer / `/status`; fases traduzidas |
| **Plan** | Goal Contract (`goal_contract_id`) | Cartão revisão; IDs intactos |
| **Task** | Unidade jornada (facade contract+session) | Pause/resume/history |
| **Agents** | workers / `tokens_workers` / agent registry | Nunca “Workers” na UI |
| **Delivery** | `delivery-status` + verification | ≠ Session sozinha |

---

## 2. Estados terminais (E4)

| UI default | Literal runtime | Quando mostrar literal |
|---|---|---|
| Session concluída (verificada) | `TRUE-FULL-PASS` | JSON, `help advanced` notes, L5 |
| Session: validando | `VALIDATING` | JSON / verbose |
| Session: bloqueada | `BLOCKED` | UI usa rótulo; código em paren ok se acção |

Delivery `PASS` exige evidência de verificação — ver `delivery-status.ts` (TRUE-FULL-PASS sem verification → UNVERIFIED).

---

## 3. Superfícies actualizadas (P1-2 / P1-3)

| Superfície | Antes | Depois |
|---|---|---|
| Classic footer | `Workers:` | `Agents:` |
| Compact footer | `tok MSO` | `tok Orchestrator` |
| Banner / slash / Delivery tokens | `Tokens: MSO` | `Tokens: Orchestrator` |
| REPL | “Goal Contract” | “Plan” |
| Shell kickoff writes | `MSO → STATE` | `Session → <pt>` |
| `evolve status` message | Goal Contract count | Task/Session + Plan |

---

## 4. O que **não** muda

- Campos JSON: `mso`, `goal_contract_id`, `tokens_workers`, `TRUE-FULL-PASS` em stores
- Flags CLI: `--confirm-mso`
- Nomes de módulos / comentários de implementação (podem citar MSO)

---

*MSO TASK V43-M3 — P1-3*
