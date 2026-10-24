# ADR-D04: Desacoplamento da Memória Episódica e Distinção Ontológica de Conhecimento

| Metadado | Detalhe |
| :--- | :--- |
| **Documento** | ADR-D04 (Decisão Arquitetural D-04) |
| **Status** | `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` |
| **Data** | 2026-10-24 |
| **Deciders** | Setup Architect, Orquestrador V2.5, Core Maintainers |
| **Classificação Epistêmica** | `VERIFIED_IN_CODE` + `INFERENCE` |
| **Contrato Afetado** | `orchestrator/contracts/knowledge-promote.yaml` |
| **Branch / Workspace** | `/home/gaab/orca/workspaces/EvolveLoop/v.2.5` |

---

## 1. Contexto & Problema

O EvolveLoop V2.2 possui componentes que lidam com dados históricos e transientes de sessões:
- A skill `wiki-mem` e o script `mem.py` (`.cursor/hooks/wiki-mem/mem.py:20-60`) capturam trechos de conversas passadas e armazenam sessões em `.ai/sessions/` (`VERIFIED_IN_CODE`).
- No arquivo de perfil padrão (`profiles/default.yaml:9-12`), a memória episódica está explicitamente desativada por padrão (`memory.enabled: false`) (`VERIFIED_IN_CODE`).
- Misturar registros conversacionais de chat diretamente com conhecimento canônico gera poluição de contexto, alucinações recursivas e risco de persistência inadvertida de informações temporárias ou errôneas.

---

## 2. A Distinção Ontológica de 4 Níveis

Para garantir a higienização do contexto, o EvolveLoop V2.5 estabelece quatro camadas ontológicas estritamente separadas:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. MEMÓRIA DE TRABALHO (Working Memory)                                │
│    Volátil, escopada à sessão/prompt ativo. Não persiste em disco.     │
├────────────────────────────────────────────────────────────────────────┤
│ 2. MEMÓRIA EPISÓDICA (Episodic Sessions)                               │
│    Registros higienizados de conversas (.ai/sessions/). Desativada por │
│    padrão. Consultada apenas sob demanda expressa do usuário.          │
├────────────────────────────────────────────────────────────────────────┤
│ 3. BARRAMENTO DE EVIDÊNCIAS (Evidence Bus)                             │
│    Registros auditáveis de portões (memory/<feature_id>/evidence/).    │
│    Fatos criptográficos e medições empíricas com redação de segredos.  │
├────────────────────────────────────────────────────────────────────────┤
│ 4. CONHECIMENTO CANÔNICO (Canonical Knowledge - SSOT)                  │
│    Documentação durável em Markdown (.ai/pages/*.md e $WIKI_ROOT).     │
│    Requer revisão humana ou promoção formal por gate.                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Alternativas Avaliadas

### Alternativa 1: Ingestão Automática de Conversas no Banco de Conhecimento
- **Prós:** O agente "aprende sozinho" a cada sessão.
- **Contras:** Poluição catastrófica do índice com raciocínios truncados, erros de digitação e alucinações transitórias; degradação severa da qualidade das respostas.

### Alternativa 2: Eliminação Total da Memória Episódica
- **Prós:** Simplicidade máxima; zero risco de poluição.
- **Contras:** Impede a recuperação de decisões históricas informais tomadas pelo desenvolvedor em chats passados.

### Alternativa 3: Desacoplamento Estrito com Fila de Promoção Mediada (`promote-queue.md`) — **RECOMENDADA**
- **Prós:**
  - Mantém a memória episódica **desativada por padrão** no perfil público (`memory.enabled: false`).
  - Quando ativada pelo usuário, sessões residem exclusivamente sob `.ai/sessions/`, com expurgo forçado de segredos via regex.
  - **Zero Escrita Cega na Wiki:** Nenhum episódio pode ser convertido em conhecimento canônico sem passar por uma fila de promoção (`.ai/promote-queue.md`), auditada pelo subagente `Knowledge Architect / Librarian` e aprovada pelo humano.
- **Contras:** Exige curadoria explícita para elevar episódios a conhecimento durável.

---

## 4. Decisão Proposta

1. **Aprovar o desacoplamento estrito entre memória episódica e o UKS Core.**
2. O motor de recuperação do UKS consulta primariamente o **Conhecimento Canônico** (Nível 4) e dados de **Evidências Auditáveis** (Nível 3).
3. A Memória Episódica permanece opcional, isolada em `.ai/sessions/`, e só é consultada via comando explícito `/mem`.
4. Qualquer promoção para a base canônica deve obrigatoriamente registrar um item em `.ai/promote-queue.md` com justificativa, diff proposto e validação pelo `TruthFence`.

---

## 5. Consequências & Riscos Mitigados

- **Consequências Positivas:** Preserva a pureza e autoridade do conhecimento de engenharia; previne a degradação da base canônica por acúmulo de conversas informais.
- **Riscos Mitigados:** Elimina o risco de alucinações induzidas por histórico desatualizado ou premissas corrigidas durante conversas antigas.
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` (Homologado para execução).
