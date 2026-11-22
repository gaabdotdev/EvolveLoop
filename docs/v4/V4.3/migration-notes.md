# V4.3 — Migration notes (P1-5)

**Data:** 2026-11-22  
**Extende:** `docs/v4/V4.2/tests/migration-notes.md`  
**Regra:** descrever o que o código faz; sem inventar migrator.

---

## 1. Herança V4.2 (ainda válida)

- Profile YAML inválido → `evolve config validate` com issues acionáveis  
- Sem migrator automático de schema  
- Credenciais: duas casas documentadas (setup vs ProviderSetup)  
- `evolve workspace` = integration (compat); preferir `evolve integration`

---

## 2. Mudanças V4.3 relevantes à migração de **hábitos** (não de ficheiros)

| Antes (hábito) | Depois |
|---|---|
| Ler `Workers` / `MSO` no footer | `Agents` / `Orchestrator` (UI); JSON interno igual |
| `Goal Contract` na REPL | `Plan` (IDs `goal_contract_*` intactos) |
| Tratar `tui run` como jornada | Ink (`evolve`) = default; `tui` = ops |
| `evolve status` = “contratos” | Facade **Task/Session** + Plan |
| Literal `TRUE-FULL-PASS` no copy | “Session concluída (verificada)” no default |

Scripts que parseiam **JSON** de status/ledger: campos `mso`, `validated_goal_contracts`, `tokens_workers` **preservados**. Novo campo produto opcional: `product: "task_session"` + `task`/`session` em `evolve status`.

---

## 3. Node

Requisito declarado: **Node ≥ 20** (`orchestrator/package.json` engines).  
Actualizar hosts em 18/19 **antes** de esperar suporte.

---

## 4. Checklist pós-update

1. `evolve config validate`  
2. `evolve help` — confirmar journey V4.3 + dual TUI note  
3. `evolve status` — mensagem Task/Session  
4. Não esperar migrate automático de profiles pré-V4  

---

*MSO TASK V43-M3 — P1-5*
