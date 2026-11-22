# Migration Strategy — V4 → V5 (compatibilidade)

**Objectivo:** introduzir Work-first **sem** partir a jornada V4, stores existentes, nem o WIP de remediação.

---

## 1. Princípios de migração

1. **Compat-first** — comandos e JSON V4 continuam a funcionar; V5 adiciona projeções.  
2. **Código > docs** — se ADR V4 e código divergirem, corrigir docs ou marcar supersede.  
3. **Sem big-bang rewrite** — Meta 00 proíbe reescrita; Metas seguintes evoluem fatias.  
4. **Preservar REMED** — pause/ProcessSession/Handles/provenance/tests são activos.  
5. **Honesty preservada** — regras Delivery M5 e catalog MCP `unknown` não regridem.

---

## 2. O que permanece (contrato V4)

| Activo V4 | Compromisso V5 |
|-----------|----------------|
| CLI-first / Ink TUI journey | Mantém-se superfície principal |
| Task como label UX (ADR Q2) | Mantém-se; Work torna-se âncora **adicional** documentada |
| Agent Handles default OFF | Mantém-se até ADR explícito |
| Prefs / validate / history (V4.2) | Mantém-se |
| Delivery provenance (M5) | Mantém-se; estende-se se Delivery aggregate surgir |
| Node engines ≥22.5 | Mantém-se (REMED-M1) |
| IDs: `work_id`, `goal_contract_id`, `task_id`, `agent_id` | Estáveis; sem rename destrutivo |

---

## 3. Mudança conceptual (produto)

| V4 (hoje) | V5 (alvo) | Estratégia |
|-----------|-----------|------------|
| Unidade mental = Task (Goal Contract) | Unidade durável = **Work**; Task ⊆ Work | Dual-label: UI mostra Task; docs/API avançada expõem Work |
| Agent “faz a task” | Agent **tenta** (Attempt) sob Work/Task | Introduzir Attempt sem exigir UX imediata |
| Session = MSO | Session view (MSO + Process + bind) | Projeção; stores separados |
| Delivery = cartão derivado | Delivery projection (+ optional store) | Manter derive; store só se history exigir |

**Não** reverter ADR Q2 abruptamente: supersede documentado em Meta de UX, com testes de jornada.

---

## 4. Camadas de compatibilidade

```text
┌─────────────────────────────────────────┐
│ V4 UX facade (Task, Plan, Delivery…)    │  ← permanece
├─────────────────────────────────────────┤
│ V5 domain projections (Work, Attempt…)  │  ← novo (Meta 01+)
├─────────────────────────────────────────┤
│ Stores atuais (StateDb + V3DataPaths)   │  ← estáveis
└─────────────────────────────────────────┘
```

Leitores V5 **preferem** projeções; escritores novos passam pelo domínio; escritores legados continuam até deprecation anunciada.

---

## 5. Fases sugeridas

| Fase | Conteúdo | Risco |
|------|----------|-------|
| **F0** | Meta 00 docs + estabilizar merge REMED WIP | Baixo (docs) |
| **F1** | Work projection read-only (history/status) | Baixo |
| **F2** | Attempt recording opt-in / paralelo | Médio |
| **F3** | Write path Work Runtime (pause/resume Work) alinhado a lifecycle | Médio–alto |
| **F4** | UX copy Work-first (sem quebrar Task) | Médio (usabilidade) |
| **F5** | Integration ACP/API (se justificado) | Alto se precoce |
| **F6** | Deprecações L3 legadas (só com taxonomy + testes) | Médio |

---

## 6. Dados e schema

- StateDb schema v6: evoluções via migrações versionadas (padrão existente `TOKEN_LEDGER_V5_COLUMNS` em `schema.ts` mostra precedente de colunas nomeadas “V5” **já no schema actual** — **não** confundir com produto V5).  
- JSON stores: additive fields; leitores tolerantes.  
- **Proibido:** apagar `agents/`, `handoffs/`, evidence, process-sessions para “limpar”.

---

## 7. Testes / gates

| Barreira | Acção |
|----------|-------|
| Suite orchestrator + `remed-m*` | Não enfraquecer; V5 muda exigem testes novos **aditivos** |
| Gate V4.3 “liberar com ressalvas” | Não reescrever como PASS limpo |
| Gates V5 A–J | Ver `validation-plan.md` — começam FAIL/NOT RUN até prova |

---

## 8. Riscos de migração

Ver `risk-register.md` (R-MIG-*). Destaques:

- Confusão Task vs Work na UX  
- Dual persistence drift  
- Tentação de equivaler MCP/ACP na migração de integrações  
- Documento estratégico V5 incompleto no repo (**GAP-DOC-V5**)

---

## 9. Critério de “migração bem-sucedida” (alto nível)

1. Utilizador V4 consegue a mesma jornada Task→Delivery.  
2. Operador avançado consegue inspecionar Work persistente após Agent `REPLACED`.  
3. Nenhuma capability honesty regride.  
4. WIP/testes REMED verdes ou justificados com LIMITATION honesta.
