# Auditoria Individual do Ecossistema de Conhecimento do EvolveLoop

> **Status:** Concluído  
> **Data:** 2026-10-24  
> **Ambiente:** Linux (x86_64), Node v20+, Python 3.13  
> **Escopo:** Mapeamento exaustivo, engenharia reversa e análise de evidências de todos os componentes de armazenamento, recuperação, indexação, memória e contexto do EvolveLoop.

---

## 1. Visão Geral

Esta auditoria técnica foi realizada para mapear individualmente e com rigor documental cada mecanismo que participa do ciclo de vida de **conhecimento, memória, recuperação e contexto** no ecossistema EvolveLoop.

O ecossistema é fruto de sucessivas iterações arquiteturais (MegaBrain, EvolveLoop V2, V2.2, V2.3 e preparações para V3). Ao longo desse desenvolvimento, foram introduzidos múltiplos subsistemas com diferentes ontologias, tecnologias e convenções de armazenamento:
- Stores em TypeScript dentro do `orchestrator/`
- Motores e rotinas em Python (stdlib e bibliotecas externas)
- Convenções documentais baseadas em Markdown (`.ai/`, `wiki/`)
- Adaptadores de ferramentas de terceiros (Graphify, Upstash Context7, MCP Memory)
- Estruturas efêmeras de trabalho e barramentos de evidências (`memory/<feature_id>/evidence/`)

O objetivo desta auditoria **não é antecipar decisões arquiteturais** nem forçar unificações prematuras, mas sim fornecer uma **base factual, verificável e referenciada no código** para permitir escolhas fundamentadas no futuro.

---

## 2. Metodologia e Níveis de Evidência

Cada conclusão apresentada neste conjunto documental é sustentada por referências diretas ao código-fonte, testes ou saídas de execução. Foram adotados os seguintes níveis estritos de evidência:

| Nível | Definição |
|---|---|
| `VERIFIED_IN_CODE` | Comprovado por inspeção direta de caminho de execução, classe, função ou contrato implementado. |
| `VERIFIED_BY_TEST` | Comprovado por suíte de testes unitários ou de integração executada com sucesso no ambiente atual. |
| `OBSERVED_AT_RUNTIME` | Observado diretamente em logs, saídas de comandos CLI ou artefatos gerados em disco. |
| `DOCUMENTED_ONLY` | Consta em ADRs, SKILL.md ou especificações conceituais, mas não foi localizado código ativo correspondente. |
| `INFERRED` | Interpretação lógica fundamentada em evidências parciais ou convergência estrutural. |
| `UNKNOWN` | Informação necessária que não pôde ser determinada estaticamente ou no ambiente atual. |
| `NOT_MEASURED` | Métrica que dependeria de observação operacional de longo prazo não disponível ou não instrumentada. |

---

## 3. Estrutura do Relatório

O relatório está particionado em documentos modulares e rastreáveis:

1. **[Inventário Completo](inventory.md)** (`inventory.md`): Relação dos 16 mecanismos candidatos identificados no checkout, contendo localização, classificação, contratos e estado operacional.
2. **Relatórios Individuais dos Componentes** (`components/`):
   - [`01. KnowledgeBackend & WikiKnowledgeBackend`](components/01-knowledge-backend-wiki.md): A abstração central de recuperação e ponte com a Wiki externa.
   - [`02. ProjectKnowledgeRuntime & TruthFence`](components/02-project-knowledge-runtime-truth-fence.md): O sistema de hierarquia de autoridade (`code > .ai/ > vault > inferred`) e prevenção de vazamento entre projetos.
   - [`03. KnowledgeStore & FilesystemKnowledgeStore`](components/03-filesystem-knowledge-store.md): O repositório interno de regras tipadas (`patterns`, `pitfalls`, `decisions`, etc.) no orquestrador.
   - [`04. MemoryStore & FilesystemMemoryStore`](components/04-filesystem-memory-store.md): A memória contextual de feature (`context.yaml`, `preferences.yaml`, `decisions.yaml`).
   - [`05. EvidenceBus & Persistência de Gates`](components/05-evidence-bus.md): O barramento de evidências e persistência de validações em `memory/<feature_id>/evidence/`.
   - [`06. WorkingContext, ContextBudget & Ranking`](components/06-working-context-budget.md): O montador de fatias de contexto para o modelo, orçamento de tokens e proteção de fatias críticas.
   - [`07. GraphifyAdapter & Skill Graphify`](components/07-graphify-adapter.md): O grafo de dependências estruturais de código baseado em AST via CLI do PyPI `graphifyy`.
   - [`08. Wiki Carpaccio (.ai/ & carpaccio.py)`](components/08-wiki-carpaccio.md): A base documental local por repositório com rastreamento criptográfico de hashes e detecção de obsolescência.
   - [`09. Wiki Vault & gaabwiki`](components/09-wiki-vault-gaabwiki.md): O motor de busca léxica (BM25) e semântica sobre o cofre global de notas Markdown.
   - [`10. Skill wiki (Context Engineer)`](components/10-wiki-skill-context-engineer.md): A skill de agente responsável pelo ritual obrigatório de grounding antes de implementações.
   - [`11. Skill wiki-mem & Hooks de Sessão`](components/11-wiki-mem-session-memory.md): A memória episódica de chats Cursor (`.ai/sessions/`, `LATEST.md`, `promote-queue.md`).
   - [`12. PatternAggregator`](components/12-pattern-aggregator.md): O agregador de falhas de execução que penaliza providers instáveis no escalonador.
   - [`13. EvolveLoopStore & SignalStore`](components/13-evolveloop-store.md): O repositório longitudinal de sinais, necessidades e auto-evolução do framework.
   - [`14. GraphStore (Esclarecimento: DAG de Execução)`](components/14-orchestrator-graph-store.md): Diferenciação técnica entre grafo de tarefas do IR e grafo de conhecimento.
   - [`15. Servidor MCP Memory`](components/15-mcp-server-memory.md): Análise do `@modelcontextprotocol/server-memory` configurado no `mcp.json` e descartado pelo core.
   - [`16. Diretório Raiz memory/`](components/16-root-memory-workspace.md): Análise do uso real da pasta local `memory/` no checkout como espaço de trabalho efêmero e forense.
3. **[Rastreamento de Fluxos Completos](execution-flows.md)** (`execution-flows.md`): Reconstrução dos fluxos de entrada, consulta, atualização, invalidação e ciclo de agentes.
4. **[Mapa de Dependências](dependency-map.md)** (`dependency-map.md`): Topologia de acoplamentos entre componentes em TypeScript, scripts em Python, skills do Cursor e arquivos em disco.
5. **[Análise de Sobreposições](overlap-analysis.md)** (`overlap-analysis.md`): Comparação entre subsistemas com responsabilidades análogas, duplicidades aparentes e justificativas funcionais.
6. **[Avaliação de Observabilidade](observability.md)** (`observability.md`): Diagnóstico sobre o que pode ser medido hoje, limitações de telemetria e lacunas de instrumentação.
7. **[Questões Abertas](open-questions.md)** (`open-questions.md`): Dúvidas não respondidas, restrições do ambiente e tópicos para investigação futura.
8. **[Resumo Executivo](executive-summary.md)** (`executive-summary.md`): Síntese estratégica e matriz comparativa final para tomada de decisão.
