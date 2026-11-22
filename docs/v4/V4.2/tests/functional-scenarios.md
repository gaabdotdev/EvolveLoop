# V4.2 — Cenários funcionais (§5)

**Data (UTC):** 2026-11-22T18:07:50Z  
**HEAD:** `577b63cdc986eecd4c7943cf627ad1672cfeb935` + working tree V4.2  
**Spec:** `V4-Tests-and-Benchmarks.md` §5 — Testes funcionais  
**Método:** vitest `v42-*` / `v41-*` + CLI smoke; **sem** cohort humano.

---

## Roteiro

| # | Cenário §5 | Como exercitado | Resultado | Evidência |
|---|---|---|---|---|
| 1 | Onboarding instalação limpa | Unit readiness prefs (`v42-p0`); `evolve setup` path documentado | **PASS** (unit) | `v42-p0-operational.test.ts` P0-3; LIMITATION: sem install limpa E2E timed |
| 2 | Alterar preferências após setup | `evolve config set` / prefs view | **PASS** | P0-1 vitest + CLI `config prefs` exit 0 |
| 3 | Handles on/off + persistência | setAgentHandlesPref → workspace config.yaml | **PASS** | `v42-p0` P0-1 |
| 4 | Config inválida → campo + correção | `evolve config validate` / detailed load | **PASS** | `v42-p0` P0-2 |
| 5 | Criar / selecionar / trocar workspace | `evolve use` list/active/path | **PASS** (CLI+unit) | `v42-p1`; smoke `use list` |
| 6 | Isolamento entre workspaces | state.db A invisível em B | **PASS** | `v42-p1-isolation` |
| 7 | Localizar tarefa + retomar | `history list|show`; resume path | **PASS** (unit/CLI) | `v42-p0` P0-4; LIMITATION: resume live parcial |
| 8 | Inspecionar histórico / evidências | `showHistoryEntry` enriquecido | **PASS** | `v42-p1` history show |
| 9 | Métricas medido / estimado / indisponível | compact footer + Delivery | **PASS** | `v42-p0` P0-5 |
| 10 | Teclado + resize | layout cols+rows; Ctrl/slash docs; NO_COLOR | **PASS** (unit smoke) | `v42-p2`; `navigation-a11y.md`; LIMITATION: sem TTY live timed |

---

## Smoke CLI (captura M4)

```bash
cd orchestrator && npm run build
node dist/cli/evolve.js help          # exit 0 — journey + credenciais
node dist/cli/evolve.js config prefs  # exit 0
node dist/cli/evolve.js history list  # exit 0
node dist/cli/evolve.js use list      # exit 0
```

Vitest: ver `automated-test-results.md` (70/70 v41+v42).
