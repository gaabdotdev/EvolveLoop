# V4.1 — Relatório de gate (V41-M4)

**Versão:** V4.1 Experience
**Data (UTC):** 2026-11-22T17:34Z
**Formato:** `V4-Tests-and-Benchmarks.md` §9
**Gate obrigatório (§7):** Jornada principal concluível; Agent Handles opcionais e testados; nenhuma dependência de backend auxiliar
**Regra de conclusão (Experience §10):** ciclo cotidiano pela CLI principal com compreensão/controle; Handles como extensão opcional.

---

## 1. Decisão explícita

### **liberar com ressalvas**

| Alternativa | Por que não |
|---|---|
| liberar (sem ressalvas) | Usabilidade humana **N=0** — contrato da tarefa e §4 exigem cohort; proibido “liberar” limpo |
| bloquear | P0+P1+P2 essenciais implementados; vitest 35/35; Handles OFF default; backends não bloqueiam; evidências pathadas; dívida é validação humana + E2E TTY live |

**Justificativa curta:** a jornada principal é **concluível** no código/CLI com Handles opcionais e testados; falta validação humana e gravação TTY completa — ressalvas explícitas, não bloqueio de implementação.

---

## 2. Critérios — Experience §8

| Critério §8 | Resultado | Evidência (path) |
|---|---|---|
| Iniciar tarefa comum sem docs | **APROVADO** (código + help curto) | `help-usage.ts`; `user-guide-everyday.md`; P0-1/P0-2; `tests/journey-scenarios.md` #1–3 |
| Distinguir Task / Agent / Session | **APROVADO** | footer L1; inspect Agent≠Session; `agent-handles-matrix.md`; P0-4/P1-4 |
| Bloqueios sem logs brutos | **APROVADO** (unit/facade) | Approval panel; `/approvals`; P1-1; LIMITATION: sem timed human |
| Approval com contexto | **APROVADO** | `v41-p1-handles-approvals.test.ts`; ADR Q4 |
| Entrega verificados vs não | **APROVADO** | `deriveDeliveryStatus`; P0-5; `/delivery` |
| Handles on/off; não requisito | **APROVADO** | profile default OFF; dogfood attach OFF/ON; `agent-handles.md` |
| Fechar viewer ≠ matar Agent | **APROVADO** | `closeViewer` / `closeAgentViewer`; matrix |
| TUI dimensões + degradação | **APROVADO** (unit) | `layout-narrow.ts`; P0-6 |

---

## 3. Critérios — Gate §7 V4.1

| Critério | Resultado | Evidência |
|---|---|---|
| Jornada principal concluível | **APROVADO** (auto/código) | `journey-scenarios.md` 1–11; P0–P2 |
| Agent Handles opcionais e testados | **APROVADO** | `agent-handles-matrix.md`; vitest P1 |
| Nenhuma dependência de backend auxiliar | **APROVADO** | `backend-matrix.md` (zellij ausente; tmux não obrigatório) |
| Usabilidade humana N≥1 | **REPROVADO** / LIMITATION | `usability-results.md` N=0 |
| Indicadores sem invenção | **APROVADO** | `indicators.md` |

---

## 4. Links para testes e artefatos

| Artefato | Path |
|---|---|
| Journey | `docs/v4/V4.1/tests/journey-scenarios.md` |
| Handles matrix | `docs/v4/V4.1/tests/agent-handles-matrix.md` |
| Automated | `docs/v4/V4.1/tests/automated-test-results.md` |
| Usability | `docs/v4/V4.1/tests/usability-results.md` |
| Backend matrix | `docs/v4/V4.1/tests/backend-matrix.md` |
| Indicators | `docs/v4/V4.1/tests/indicators.md` |
| Guia cotidiano | `docs/v4/V4.1/user-guide-everyday.md` |
| Guia avançado | `docs/v4/V4.1/user-guide-advanced.md` |
| Backlog | `docs/v4/V4.1/implementation-backlog.md` |
| Baseline V4.0 | `docs/v4/V4.0/baseline/*` |

---

## 5. Comparação com baseline V4.0

| Tema | Baseline | V4.1 (esta fatia) |
|---|---|---|
| `--help` median | 465.5 ms | 440.3 ms (N=5) — sem claim de otimização |
| Help conteúdo | JSON todos os grupos | Jornada curta; avançado em `help advanced` |
| Usabilidade humana | N=0 | N=0 (LIMITATION herdada) |
| Delivery PASS sem evidência | inventário V4.0 | Corrigido (P0-5) |
| Handles | GAP | Implementados, default OFF |

---

## 6. Regressões conhecidas / limitações

1. Usabilidade humana N=0.
2. Sem gravação TTY Ink completa / attach a sessão tmux viva.
3. P2-2 (unificar status/sessions), P2-4 (copy Orchestrator vs MSO), P2-5 métricas humanas — **fora** do “P2 essencial” desta tarefa (P2-1/3/6 + evidência).
4. Wiki pack EvolveLoop ainda ausente no vault.
5. `evolve agents --help` comporta-se como list produto (cmd=help), não como texto de usage — smoke exit 0; usage dedicado via `agents` com flag usage no surface.

---

## 7. APROVADOS — índice de evidência

Cada **APROVADO** acima aponta path; amostra:

- Help jornada → `orchestrator/src/cli/help-usage.ts` + smoke exit 0
- Slash jornada → `slash-commands.ts` / `v41-p2-nav-docs.test.ts`
- Handles → `docs/v4/V4.1/tests/agent-handles-matrix.md`
- Vitest → `docs/v4/V4.1/tests/automated-test-results.md`

---

*Fim — gate-report.md · decisão: liberar com ressalvas*


---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

Revalidação pós-remediação M1–M6: Handles/attach contratos V4.1 exercitados em `remed-m3` + suite completa 1408 pass.
Decisão REMED: **liberar com ressalvas** — ver `docs/v4/V4.3/remediation/gate-report.md`. Humano N=0 inalterado.
