# V4.3 — Troubleshooting

**Data:** 2026-11-22

---

## Status / Session

| Sintoma | Causa provável | Acção |
|---|---|---|
| `evolve status` ≠ `tui status` | São eixos diferentes (produto vs Core board) | Usar `evolve status` / `/status` para Task/Session |
| “Session ativa” ao continuar | Kickoff recusa segunda Session não-terminal | `evolve status`; aguardar ou inspeccionar BLOCKED |
| Pause TUI “some” após restart | (pré-P0) local-only — **corrigido** P0-1 | `evolve pause`/`resume` + StateDb |

## Delivery

| Sintoma | Causa | Acção |
|---|---|---|
| UNVERIFIED após adapter ok | Adapter ok ≠ Delivery PASS | `evolve delivery validate` |
| PASS sem verificação | Não deve acontecer | Reportar; ver `delivery-status.ts` |

## TUI / REPL

| Sintoma | Causa | Acção |
|---|---|---|
| Esperava Ink mas abriu Core TUI | Correu `evolve tui run` | Usar `evolve` sem args |
| Vê “Workers” / “MSO” | Build antigo ou L5/JSON | Actualizar; UI default = Agents/Orchestrator |

## Handles

| Sintoma | Causa | Acção |
|---|---|---|
| Attach falha | Backend tmux/Zellij ausente | Soft-fail esperado; Handles OFF default |
| Fechar viewer matou Agent? | Não deve | Verificar `closeViewer`; ver matrix V4.1 |

## Config / Node

| Sintoma | Causa | Acção |
|---|---|---|
| Profile rejeitado | YAML/chave inválida | `evolve config validate` |
| Node &lt; 20 | Fora de engines | Instalar Node ≥ 20 |

---

*MSO TASK V43-M3 — P1-6*
