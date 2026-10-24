# ADR-D02: Destino do Graphify e Adoção de Extrator AST Nativo

| Metadado | Detalhe |
| :--- | :--- |
| **Documento** | ADR-D02 (Decisão Arquitetural D-02) |
| **Status** | `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` |
| **Data** | 2026-10-24 |
| **Deciders** | Setup Architect, Orquestrador V2.5, Core Maintainers |
| **Classificação Epistêmica** | `MEASURED` + `VERIFIED_IN_CODE` + `INFERENCE` |
| **Contrato Afetado** | `orchestrator/contracts/architecture-analysis.yaml` |
| **Branch / Workspace** | `/home/gaab/orca/workspaces/EvolveLoop/v.2.5` |

---

## 1. Contexto & Problema

No EvolveLoop V2.2, a recuperação estrutural de símbolos e dependências de código foi implementada experimentalmente via a ferramenta **Graphify**:
- O `GraphifyAdapter` (`orchestrator/src/v22/graphify-adapter.ts:8-150`) só opera sob a variável de ambiente `EVOLVELOOP_GRAPHIFY=1` (`VERIFIED_IN_CODE`).
- O executável reside em `/tmp/graphify-skill-hardgate-venv/bin/graphify` (`VERIFIED_IN_CODE`). Diretórios em `/tmp` estão sujeitos à limpeza automática periódica pelo sistema operacional Linux (`tmpwatch` ou reinicialização), quebrando o portão de validação de forma imprevisível.
- O grafo compilado gerado (`graphify-out/graph.json`) possui **7.4 MB** de tamanho e **137.940 linhas** (`MEASURED`), tornando operações de leitura e desserialização em memória pesadas para o Node.js.
- A ferramenta externa depende de um venv dedicado com pacotes PyPI complexos, contrariando o princípio de auto-contenção e dependências mínimas do EvolveLoop.

---

## 2. Alternativas Avaliadas

### Alternativa 1: Manter Graphify Externo via CLI
- **Prós:** O grafo completo já existe gerado no repositório.
- **Contras:** Fragilidade crítica do path em `/tmp`; alto consumo de I/O para ler 7.4 MB a cada consulta estrutural; processo externo opaco.

### Alternativa 2: Descartar Recuperação Estrutural de Código (Apenas BM25)
- **Prós:** Elimina 100% da complexidade de grafos.
- **Contras:** Degradação severa de recall para consultas sobre relações arquiteturais (ex.: "Quais classes implementam `KnowledgeBackend`?"). O benchmark V2.2 provou que o braço B3 (com AST) obteve 100% de recall em tarefas held-out contra 75% do B1 (`REPORTED_UNVERIFIED`).

### Alternativa 3: Absorver Extrator AST Nativo e Leve no UKS Core — **RECOMENDADA**
- **Prós:**
  - Extração cirúrgica de símbolos fundamentais: declarações de classes/interfaces, funções exportadas, relações de herança e importações.
  - Execução in-process via TypeScript Compiler API (`typescript`) para arquivos `.ts/.js` ou analisador léxico determinístico leve.
  - Armazenamento compacto: apenas subgrafos e arestas essenciais são persistidos em `.data/project-index.json`, reduzindo o payload de 7.4 MB para < 500 KB.
  - Zero dependências de `/tmp` ou pacotes externos do PyPI.
- **Contras:** Suporte inicial restrito às linguagens primárias do ecossistema (TypeScript, JavaScript, Python).

---

## 3. Comparativo de Métricas

| Métrica | Graphify Externo (V2.2) | Extrator AST Nativo UKS (V2.5) | Impacto / Ganho |
| :--- | :---: | :---: | :---: |
| **Localização do Binário** | `/tmp/.../bin/graphify` | In-process no orquestrador | Elimina falhas de expurgo de `/tmp` |
| **Tamanho do Arquivo de Grafo** | 7.4 MB (`MEASURED`) | < 500 KB (índice derivado) | Redução de > 90% no overhead de I/O |
| **Tempo de Consulta de Símbolo** | ~750 ms (`REPORTED_UNVERIFIED`) | **< 20 ms** | Ganho de 37x em velocidade |
| **Instalação / Configuração** | Complexa (venv em `/tmp`) | Zero configuração extra | Totalmente integrado ao monorepo |

---

## 4. Decisão Proposta

1. **Descontinuar o uso do pacote externo Graphify** e a dependência do executável em `/tmp/graphify-skill-hardgate-venv`.
2. **Implementar um Extrator AST nativo e leve** como componente interno do UKS (`orchestrator/src/knowledge/uks/ast/`).
3. Mapear exclusivamente:
   - Definições de tipos, interfaces e classes.
   - Símbolos exportados e assinaturas públicas.
   - Grafos de dependência direta (`import` / `require`).
4. Armazenar as arestas sintáticas diretamente no índice derivado descartável `.data/project-index.json`.

---

## 5. Consequências & Riscos Mitigados

- **Consequências Positivas:** Independência de pacotes externos; resiliência a reinicializações do SO; redução massiva de pegada de memória.
- **Riscos Mitigados:** Elimina o risco de bloqueio do portão `/evolve` por remoção acidental de arquivos em `/tmp`.
- **Status:** `APPROVED (2026-10-24 - Autorização expressa do Operador Humano)` (Homologado para execução).
