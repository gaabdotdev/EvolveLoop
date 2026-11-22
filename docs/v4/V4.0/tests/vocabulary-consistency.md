# V4.0 — Consistência de vocabulário (evidência M7)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §3 (Consistência de vocabulário)  
**Método:** inspeção estática dos docs V4.0 + amostragem do código citado em `cli-inconsistency-inventory.md`  
**Regra:** não inventar migração de UI; contar conflitos **no inventário (ANTES)** vs **glossário oficial (DEPOIS — contrato-alvo)**

---

## 1. Fontes

| Papel | Path |
|---|---|
| Inventário (ANTES) | `docs/v4/V4.0/cli-inconsistency-inventory.md` §1–§2, §7 |
| Glossário (DEPOIS docs) | `docs/v4/V4.0/glossary-and-mental-model.md` §1, §3 |
| Brief / decisões | `product-identity-brief.md`; `decisions-and-open-questions.md` D2 |
| Amostra código | paths abaixo (re-verificados 2026-11-22) |

---

## 2. Termos alvo (9 conceitos)

Workspace · Task · Plan · Agent · Orchestrator · Session · Agent Handle · Approval · Delivery

---

## 3. Amostra de código (conflitos ainda presentes no runtime)

| Conflito | Evidência re-verificada | Status código |
|---|---|---|
| “Tarefa:” mostra `work_id` | `orchestrator/src/v3/evolve-shell/status-panel.ts:44-56` — `active_task` ← `latest_mso_session?.work_id`; linha `│ Tarefa: ${panel.active_task}` | **ainda presente** |
| Footer/Workers ≠ Agent | `orchestrator/src/v3/evolve-shell/footer.ts:180-192` — `Workers:`; banner tokens `Workers` em `banner.ts:111-115` | **ainda presente** |
| INIT/IDLE → “Pronto” | `orchestrator/src/v3/evolve-shell/banner.ts:76` | **ainda presente** |
| Sucesso literais distintos | `mso/states.ts` `TRUE-FULL-PASS`; `task-states.ts` / worktree `TRUE_PASS` | **ainda presente** |
| “Delegação concluída…” | `shell-start-execution.ts:335-337` | **ainda presente** |
| Agent Handle | `rg` / inventário: sem tipo/comando de produto | **GAP** |

Conclusão da amostra: o glossário **não** removeu conflitos do código; documentou o mapeamento legado → oficial.

---

## 4. Contagem ANTES (inventário)

Fonte: inventário §2 + §7.

| Indicador | Valor |
|---|---|
| Clusters de sinônimos/conflitos (§2) | **10** |
| Conceitos V4.0 mapeados | 9 |
| Conceitos com gap de exposição UI | ≥4 (Handle, Plan-as-label, Orchestrator-as-label, Approval-in-TUI) |
| State machines distintas competindo por vocabulário | 8+ |

### Lista dos 10 clusters (ANTES)

1. Objetivo do usuário: Task · Intent · Goal · Meta · Goal Contract · Goal Document  
2. Unidade de execução: Task · Work · Job · Circuit `task-id`  
3. Sucesso terminal: `TRUE_PASS` · `TRUE_FULL_PASS` · `TRUE-FULL-PASS` · Delivery `PASS` · Criterion `PASS`  
4. “Tarefa” ≠ `task_id` (rótulo mostra `work_id`)  
5. Sessão: MSO · ProcessSession · Grill · slash “Sessão”  
6. Aprovação: quatro gates sob linguagem próxima  
7. Agent vs Workers vs adapter  
8. Plan vs Goal Contract  
9. Cancelamento `CANCELLED` vs `cancelled`  
10. IDLE / “Pronto” vs máquina MSO oficial  

---

## 5. Contagem DEPOIS (glossário oficial — contrato documental)

Fonte: `glossary-and-mental-model.md` §1 (definições únicas) + §3 (legado → oficial).

| Indicador | Valor | Nota |
|---|---|---|
| Definições oficiais únicas (9 conceitos) | **9 / 9** | Sem contradição interna entre as 9 definições oficiais |
| Linhas de mapeamento legado → oficial (§3) | **13** | Sinônimos **documentados**, não eliminados do código |
| Clusters de conflito **ainda no código** | **10** (inalterado) | Esperado: V4.0 = Identity docs; migração UI = V4.1 |
| Clusters **sem mapeamento** no glossário | **0** | Todos os 10 clusters têm destino oficial ou GAP explícito |
| Contradições entre docs oficiais (glossário vs matriz) | **0 encontradas** nesta revisão | Tensão aberta → `decisions-and-open-questions.md` Q1–Q8 (não são duas defs oficiais conflitantes) |

### O que “DEPOIS” significa nesta versão

- **Documentação:** sinônimos deixam de competir como “todos oficiais”; há um termo canónico + tabela de migração.  
- **Runtime/UI:** conflitos **não** foram corrigidos nesta entrega V4.0.  
- Indicador §3 “após padronização” = **padronização documental**, não eliminação no código.

---

## 6. Resumo numérico (para `indicators.md`)

| Momento | Sinônimos/conflitos contados | Unidade |
|---|---|---|
| ANTES (inventário) | **10** | clusters em código/UI |
| DEPOIS (glossário) — conflitos sem destino oficial | **0** | clusters órfãos no contrato |
| DEPOIS (glossário) — conflitos ainda no código | **10** | clusters runtime (LIMITATION de implementação) |
| DEPOIS — defs oficiais únicas | **9/9** | conceitos |

---

## 7. GAPs / limitações

- Pack wiki EvolveLoop UX ausente (`ground.sh pack EvolveLoop` → `PACK_NOT_FOUND`) — não afeta contagem in-repo.  
- Q2 (Task = qual entidade runtime?) permanece aberta — glossário define Task de produto; binding runtime não fechado.  
- Não houve execução TUI interativa nesta sessão de evidência.

---

*Fim — vocabulary-consistency.md*
