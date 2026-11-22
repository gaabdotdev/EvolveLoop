# V4.0 — Indicadores §3 (evidência M7)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §3 — Benchmarks e indicadores  
**Regra:** números derivados das evidências irmãs **ou** `LIMITATION` explícita — sem metas inventadas e sem % humano fabricado.

---

## Tabela de indicadores

| Indicador (§3) | Valor | Derivado de | Notas |
|---|---|---|---|
| Percentual de conceitos interpretados corretamente em teste de compreensão | **LIMITATION (N=0)** | `comprehension-test-results.md` | Sem participantes humanos; dry-run autor ≠ métrica humana |
| Quantidade de sinônimos/conflitos — **ANTES** (inventário) | **10** clusters | `vocabulary-consistency.md` §4; inventário §7 | |
| Quantidade de sinônimos/conflitos — **DEPOIS** (órfãos sem mapeamento oficial) | **0** | `vocabulary-consistency.md` §5 | Glossário mapeia os 10 |
| Quantidade de sinônimos/conflitos — **DEPOIS** (ainda no código/UI) | **10** | `vocabulary-consistency.md` §3, §5 | Padronização documental; runtime inalterado |
| Definições oficiais únicas | **9/9** | glossário §1; vocabulary §5 | |
| Percentual de estados com definição, transições e apresentação | **100% (36/36)** escopo principal | `state-consistency.md` §8 | Task+Agent+Session MSO+Approval+Delivery |
| Idem incluindo Process Session | **87.8% (36/41)** | `state-consistency.md` §9 | 5 estados sem transições documentadas |
| Quantidade de mensagens que afirmam sucesso sem evidência verificável | **8** materiais (**9** na lista inventário incl. 1 cosmético) | `message-audit.md` §3; inventário §5 | Código ainda não corrigido |
| Revisão princípios — decisões D1–D10 | **10 PASS / 0 FAIL** | `principles-review.md` §2 | Runtime pode falhar princípios; decisões não |

---

## Evidências exigidas (§3) — checklist

| Evidência | Path | Presente? |
|---|---|---|
| Glossário versionado | `docs/v4/V4.0/glossary-and-mental-model.md` | Sim |
| Matriz de estados | `docs/v4/V4.0/state-matrix.md` | Sim |
| Inventário de inconsistências | `docs/v4/V4.0/cli-inconsistency-inventory.md` | Sim |
| Roteiro compreensão | `docs/v4/V4.0/tests/comprehension-test-script.md` | Sim |
| Resultados compreensão | `docs/v4/V4.0/tests/comprehension-test-results.md` | Sim (N=0 + dry-run) |

---

## Baseline (contexto, não indicador §3 Identity)

Baseline de performance/usabilidade em `docs/v4/V4.0/baseline/` existe (environment, raw-measurements, repro-script, benchmark-log).  
**Comparação experiência antes/depois Identity:** N/A parcial — docs mudaram; **experiência runtime não mudou** nesta entrega (ver gate-report).

---

## LIMITATIONS agregadas

1. Compreensão humana N=0.  
2. Conflitos de vocabulário no código = 10 (iguais ao inventário).  
3. Process Session sem grafo de transições na matriz.  
4. 8 mensagens de falso sucesso ainda no runtime.  
5. Wiki pack EvolveLoop UX ausente no vault.

---

*Fim — indicators.md*
