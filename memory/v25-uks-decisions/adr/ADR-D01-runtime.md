# ADR-D01: Runtime do Núcleo do Unified Knowledge System (UKS Core)

| Metadado | Detalhe |
| :--- | :--- |
| **Documento** | ADR-D01 (Decisão Arquitetural D-01) |
| **Status** | `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` |
| **Data** | 2026-10-24 |
| **Deciders** | Setup Architect, Orquestrador V2.5, Core Maintainers |
| **Classificação Epistêmica** | `MEASURED` + `VERIFIED_IN_CODE` + `INFERENCE` |
| **Contrato Afetado** | `orchestrator/contracts/context-grounding.yaml` |
| **Branch / Workspace** | `/home/gaab/orca/workspaces/EvolveLoop/v.2.5` |

---

## 1. Contexto & Problema

O ecossistema V2.2 do EvolveLoop apresenta uma divisão de runtime entre o **Orquestrador (Node.js / TypeScript)** e o **Mecanismo de Conhecimento (Python / subprocessos)**:
- O `WikiKnowledgeBackend` em TypeScript delega buscas para o CLI Python (`python -m gaabwiki search`) via `child_process.spawn`.
- O tempo de cold-start do interpretador Python medido no host é de **~12.4 ms**, elevando-se para **~40.5 ms** com importações básicas e **1.639 ms** de latência mediana observada no pipeline completo do V2.2 (`MEASURED`).
- O tokenizador invoca `tiktoken` via Python e, na sua ausência ou falha, degrada silenciosamente para split por espaço em branco (`VERIFIED_IN_CODE`).
- O host não possui pacotes externos globais como `pytest` instalados (`MEASURED`).

Essa arquitetura fragmentada penaliza a latência dos agentes, introduz riscos de serialização JSON entre processos e cria dependências bidirecionais frágeis entre Node.js e Python.

---

## 2. Alternativas Avaliadas

### Alternativa 1: Python Standard Library Exclusivo (`python3 -m uks_core`)
- **Prós:** Reutilização direta da lógica de `carpaccio.py` e `gaabwiki`; excelente manipulação de texto na stdlib.
- **Contras:** Mantém o overhead de IPC e cold-start (>40 ms por chamada); exige subprocessos; serialização JSON adicional; divergência de tipagem com o orquestrador TypeScript.

### Alternativa 2: Híbrido Provisório (PoC Python stdlib acionado por Adaptador TS)
- **Prós:** Permite validar a indexação e fusão RRF rapidamente em scripts isolados; não exige reescrever parsers imediatamente.
- **Contras:** Solução intermediária que adia a resolução da latência e mantém complexidade de manutenção em duas stacks.

### Alternativa 3: TypeScript Nativo no Orquestrador (`orchestrator/src/knowledge/uks/`) — **RECOMENDADA**
- **Prós:**
  - **Latência Ultra-Baixa:** Execução in-process no mesmo runtime Node.js (<10 ms para consultas na memória ou cache local).
  - **Zero Subprocessos / Zero IPC:** Elimina gargalos de spawning e parsing de stdout/stderr.
  - **Tipagem Estrita Fim a Fim:** Alinhamento direto com interfaces `UKSKnowledgeItem`, `TruthFence` e `ContextBudget`.
  - **Portabilidade Total:** Depende unicamente do Node 20+, sem requerer ambiente virtual Python configurado.
- **Contras:** Exige reimplementar o tokenizador BM25 e hashing de arquivos em TypeScript.

---

## 3. Matriz Comparativa de Engenharia

| Dimensão de Avaliação | Alternativa 1 (Python stdlib) | Alternativa 2 (Híbrido) | Alternativa 3 (TS Nativo - Alvo) |
| :--- | :---: | :---: | :---: |
| **Latência por Consulta (p50)** | 150 - 300 ms | 100 - 250 ms | **< 15 ms (in-process)** |
| **Overhead de Cold-Start** | ~12 - 40 ms (`MEASURED`) | ~12 - 40 ms | **0 ms (residente)** |
| **Complexidade de IPC / Serialização** | Alta (JSON via stdout) | Alta (JSON via stdout) | **Zero (Objetos TS em memória)** |
| **Resiliência a Falhas de Ambiente** | Média (depende de python3) | Média | **Máxima (apenas Node.js)** |
| **Facilidade de Depuração / Testes** | Média (múltiplos runtimes) | Baixa (híbrido frágil) | **Alta (Vitest unificado)** |

---

## 4. Decisão Proposta

1. **Aprovar formalmente a meta de longo prazo de TypeScript Nativo** para o UKS Core, residindo diretamente em `orchestrator/src/knowledge/uks/`.
2. **Estratégia de Transição em Duas Fases:**
   - **Fase 1 (PoC / Validação Funcional):** Implementar o algoritmo de indexação unificado e extração AST utilizando bibliotecas padrão (Python stdlib / scripts leves) para validar os 24 casos de benchmark sem impacto no código de produção.
   - **Fase 2 (Target Architecture):** Portar os módulos de pontuação BM25, hashing incremental e fusão RRF para TypeScript puro no orquestrador, eliminando definitivamente subprocessos do caminho crítico.

---

## 5. Consequências & Riscos Mitigados

- **Consequências Positivas:** Atingimento comprovado do SLO de latência (<100ms); eliminação da dependência de subprocessos instáveis; alinhamento natural com `TruthFence` e `ContextBudget`.
- **Riscos Mitigados:** Elimina o risco de falha por ausência de binários Python no ambiente do usuário; evita contaminações de stdout que quebram o parsing de respostas JSON.
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` (Homologado para execução).
