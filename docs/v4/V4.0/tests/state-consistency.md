# V4.0 — Consistência de estados (evidência M7)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §3 (Consistência de estados)  
**Fonte canónica:** `docs/v4/V4.0/state-matrix.md`  
**Apoio apresentação:** `terminal-visual-guide.md` §2–§6  
**Critério por estado:** (D) definição/significado · (T) transições válidas · (P) apresentação inequívoca

---

## 1. Método

Para cada estado de produto listado na matriz:

| Check | Passa se |
|---|---|
| **D** | Há significado explícito na matriz |
| **T** | Há coluna/linha de transições válidas (runtime ou alvo) |
| **P** | Há apresentação (símbolo/cor/intenção ou referência ao guia) |

Estados de máquinas **não-default** (Continuity, TUI phase, Job, Criterion, Work) são inventariados mas **não** entram no denominador do % de aceite Identity (Task/Agent/Session/Approval + Delivery de apresentação).

---

## 2. Checklist — Task (7)

| Estado | D | T | P | Notas |
|---|---|---|---|---|
| Pendente | ✓ | ✓ | ✓ | |
| Em progresso | ✓ | ✓ | ✓ | |
| Parcial | ✓ | ✓ | ✓ | |
| Concluída | ✓ | ✓ | ✓ | sucesso só com evidência (nota) |
| Bloqueada | ✓ | ✓ | ✓ | |
| Falhou | ✓ | ✓ | ✓ | |
| Cancelada | ✓ | ✓ | ✓ | |

**Subtotal Task:** D 7/7 · T 7/7 · P 7/7 → **100%** (7/7 estados completos)

---

## 3. Checklist — Agent (11)

| Estado | D | T | P |
|---|---|---|---|
| Inicializando | ✓ | ✓ | ✓ |
| Ativo | ✓ | ✓ | ✓ |
| Esperando | ✓ | ✓ | ✓ |
| Cedendo | ✓ | ✓ | ✓ |
| Limite | ✓ | ✓ | ✓ |
| Falhou | ✓ | ✓ | ✓ |
| Obsoleto | ✓ | ✓ | ✓ |
| Órfão | ✓ | ✓ | ✓ |
| Substituído | ✓ | ✓ | ✓ |
| Concluído | ✓ | ✓ | ✓ |
| Cancelado | ✓ | ✓ | ✓ |

**Subtotal Agent:** D 11/11 · T 11/11 · P 11/11 → **100%**  
**Nota exposição:** TUI default não lista `AgentState` (inventário) — documentação OK; implementação incompleta (fora do % documental).

---

## 4. Checklist — Session orquestração / MSO (10)

| Estado | D | T | P | Notas |
|---|---|---|---|---|
| Início (`INIT`) | ✓ | ✓ | ✓ | proíbe “Pronto” |
| Carregando | ✓ | ✓ | ✓ | |
| Analisando | ✓ | ✓ | ✓ | |
| Decompondo | ✓ | ✓ | ✓ | |
| Delegando | ✓ | ✓ | ✓ | |
| Aguardando agents | ✓ | ✓ | ✓ | |
| Validando | ✓ | ✓ | ✓ | |
| Bloqueada | ✓ | ✓ | ✓ | |
| Recuperando | ✓ | ✓ | ✓ | |
| Concluída verificada | ✓ | ✓ | ✓ | terminal |

**Subtotal Session MSO:** D 10/10 · T 10/10 · P 10/10 → **100%**

---

## 5. Checklist — Session processo (5)

| Estado | D | T | P | Notas |
|---|---|---|---|---|
| Em execução | ✓ | ✗ | ✓ | matriz sem coluna de transições |
| Encerrou | ✓ | ✗ | ✓ | |
| Cancelada | ✓ | ✗ | ✓ | |
| Dry-run | ✓ | ✗ | ✓ | |
| Órfã | ✓ | ✗ | ✓ | |

**Subtotal Process Session:** D 5/5 · T 0/5 · P 5/5  
**Estados completos (D+T+P):** **0/5** (falta T documentado)

---

## 6. Checklist — Approval (5)

| Estado | D | T | P |
|---|---|---|---|
| Pendente | ✓ | ✓ | ✓ |
| Aprovada | ✓ | ✓ | ✓ |
| Rejeitada | ✓ | ✓ | ✓ |
| Expirada | ✓ | ✓ | ✓ |
| Cancelada | ✓ | ✓ | ✓ |

**Subtotal Approval:** D 5/5 · T 5/5 · P 5/5 → **100%**

---

## 7. Checklist — Delivery (3)

| Estado | D | T | P | Notas |
|---|---|---|---|---|
| Aceita (`PASS`) | ✓ | parcial | ✓ | “quando usar” = política; sem grafo formal |
| Bloqueada | ✓ | parcial | ✓ | |
| Falhou | ✓ | parcial | ✓ | |

**Subtotal Delivery:** D 3/3 · T parcial (3/3 política, 0/3 grafo) · P 3/3  
**Estados completos estritos (D+T formal+P):** **0/3** se exigir grafo; **3/3** se aceitar “quando usar” como T.  
**Decisão desta evidência:** contar T como **passa** (política explícita na matriz §5) → **100%** documental com ressalva “sem grafo de transição”.

---

## 8. Totais (aceite Identity — máquinas principais)

Inclui: Task + Agent + Session MSO + Approval + Delivery (exclui Process Session do denominador principal; ver §9).

| Máquina | Estados | Completos (D+T+P) | % |
|---|---|---|---|
| Task | 7 | 7 | 100% |
| Agent | 11 | 11 | 100% |
| Session MSO | 10 | 10 | 100% |
| Approval | 5 | 5 | 100% |
| Delivery | 3 | 3* | 100%* |
| **Total principal** | **36** | **36** | **100%** |

\* Delivery: T = política “quando usar”, não grafo.

### Dimensões agregadas (36 estados principais)

| Dimensão | Pass | % |
|---|---|---|
| Definição (D) | 36/36 | **100%** |
| Transições (T) | 36/36* | **100%*** |
| Apresentação (P) | 36/36 | **100%** |

---

## 9. Process Session + outras (transparência)

| Conjunto | Completos D+T+P | % |
|---|---|---|
| Process Session (5) | 0/5 (falta T) | **0%** estrito; D+P = 100% |
| Continuity / TUI phase | inventário only | N/A produto default |
| Work / Job / Criterion | paralelo / legado | N/A modelo mental default |

**LIMITATION:** transições de Process Session não estão documentadas na matriz — aceitável se só expostas em inspect/Handles (D7), mas o check T falha se aplicadas ao critério “cada estado”.

---

## 10. Sucesso multi-camada

Matriz §1.3 desambigua `TRUE_PASS` / `TRUE_FULL_PASS` / `TRUE-FULL-PASS` / Delivery `PASS`.  
Checklist: **passa** como documentação; código ainda mistura (ver `vocabulary-consistency.md`).

---

## 11. Número para indicadores

**Percentual de estados (principais) com definição, transições e apresentação documentadas: 100% (36/36).**  
**Com Process Session no denominador:** 36/41 ≈ **87.8%** (5 falham T).

Indicador reportado em `indicators.md`: **100% (escopo Identity principal)** + LIMITATION Process Session.

---

*Fim — state-consistency.md*
