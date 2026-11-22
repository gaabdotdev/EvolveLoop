# V4.0 — Revisão de princípios (evidência M7)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §3 (Revisão de princípios)  
**Princípios 1–7:** `product-identity-brief.md` §3 / `V4.0-Identity.md` §2  
**Decisões:** `decisions-and-open-questions.md` D1–D10  
**Método:** cada decisão documentada vs princípios; pass = alinhada ao contrato; fail = contradiz princípio sem ADR de exceção

---

## 1. Mapa princípios

| # | Princípio |
|---|---|
| P1 | CLI-first, não CLI-complicated |
| P2 | Complexidade progressiva |
| P3 | Autonomia com controle |
| P4 | Estado antes de log |
| P5 | Resultado verificável |
| P6 | Consistência |
| P7 | CLI-only como direção |

---

## 2. Avaliação D1–D10

| Decisão | Resumo | Princípios tocados | Veredito | Justificativa |
|---|---|---|---|---|
| **D1** | CLI-only experiência principal | P1, P7 | **PASS** | Terminal é UX principal; dashboard não substitui |
| **D2** | Nove conceitos oficiais | P1, P6 | **PASS** | Vocabulário único; legado mapeado |
| **D3** | Agent Handles opcionais, default off, GAP ok | P2, P3, P7 | **PASS** | Complemento; jornada sem Handles |
| **D4** | Estado antes de log (hierarquia L0–L5) | P4 | **PASS** | Contrato explícito; implementação pendente ≠ violação da decisão |
| **D5** | Sucesso exige evidência | P5 | **PASS** | Declara inventário §5 como não-conforme; não endossa falso PASS |
| **D6** | Qualificar literais de sucesso por camada | P5, P6 | **PASS** | Evita unificar motor; unifica apresentação — compromisso consciente |
| **D7** | Session produto = MSO; processo = detalhe | P2, P6 | **PASS** | Complexidade progressiva + consistência de Session default |
| **D8** | Approval conceito UX único; gates tipados | P3, P6 | **PASS** | Controle unificado na apresentação |
| **D9** | “Pronto” ≠ INIT/IDLE | P4, P5, P6 | **PASS** | Remove readiness falsa |
| **D10** | Estética subordinada à legibilidade | P1, P7 | **PASS** | Sem skin por preferência |

**Score decisões documentadas:** **10 PASS / 0 FAIL**

---

## 3. Tensões (não são FAIL da decisão)

| Tensão | Relação | Nota |
|---|---|---|
| Superfície `usage()` ainda enorme | P1/P2 | Decisão D2/P2 **exige** migração V4.1; estado atual do código falha o princípio, a **decisão** não |
| Shell streama `MSO → …` | P4 | D4 contrato; implementação pendente |
| TUI `Entrega Final · PASS` | P5 | D5 marca como bug de contrato a corrigir |
| Q1–Q8 abertas | P6 parcial | Não contradizem D1–D10; adiam binding runtime/copy |

**Regra desta revisão:** avaliar **decisões documentadas**, não o runtime atual. Runtime não-conforme está registado no inventário e nas decisões como dívida V4.1.

---

## 4. Princípios vs artefactos de Identity

| Princípio | Artefacto que o operacionaliza | Runtime alinhado? |
|---|---|---|
| P1 | Brief §3.1; glossário fluxo | Parcial (superfície larga) |
| P2 | `interaction-principles.md` §2 | Parcial |
| P3 | princípios §3; Approval/Handles | Parcial (fila Approval TUI ausente) |
| P4 | princípios §1; guia L0–L5 | Parcial |
| P5 | D5; guia sucesso; inventário §5 | **Não** (8 falsos sucessos) |
| P6 | glossário + state-matrix | Docs sim; UI não |
| P7 | D1, D3; brief §5 | Docs sim; Handles GAP |

---

## 5. Conclusão

- Decisões V4.0 Identity **passam** a revisão contra P1–P7.  
- A experiência **implementada** ainda viola P4/P5/P6 em pontos inventariados — isso **não** reprova as decisões; reprova readiness de Experience (V4.1).  
- Nenhuma decisão documentada exige dashboard gráfico ou sucesso sem evidência.

---

*Fim — principles-review.md*
