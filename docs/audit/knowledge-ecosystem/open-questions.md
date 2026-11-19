# Questões Abertas, Limitações do Ambiente e Próximos Passos

> **Objetivo:** Registrar com transparência todas as perguntas não respondidas, restrições encontradas durante a auditoria e investigações futuras necessárias para fundamentar a escolha de uma arquitetura definitiva.

---

## 1. Limitações Encontradas no Ambiente de Auditoria

1. **Ausência da Variável `WIKI_ROOT` no Shell Atual:**  
   Durante a sessão de auditoria, nem `WIKI_ROOT` nem `RAG_REPO_ROOT` estavam exportadas no ambiente do sistema operacional. As verificações do motor `gaabwiki` foram realizadas contra a fixture embutida em `fixtures/evolveloop-wiki-vault/`. O cofre pessoal do autor (`karpathyWiki`) não foi acessado diretamente.
2. **Ausência de `pytest` Global no Sistema:**  
   O interpretador do sistema (`/usr/bin/python3`, versão 3.13) não possui o pacote `pytest` instalado globalmente. Seguindo rigorosamente a diretriz de segurança de **não instalar dependências ou serviços no ambiente**, os testes em Python da fixture foram auditados por inspeção de código estático e execução direta dos scripts via módulo (`python3 -m gaabwiki`). Os testes em TypeScript do orquestrador foram executados com sucesso total via `npx vitest`.
3. **Venv Isolado do Graphify Inexistente em `/tmp`:**  
   O caminho esperado pela skill Graphify (`/tmp/graphify-skill-hardgate-venv/bin/graphify`) não existia no diretório temporário do sistema no momento da auditoria. No entanto, o artefato compilado `graphify-out/graph.json` (7.4 MB) estava presente no repositório, permitindo auditar a estrutura do grafo gerado.

---

## 2. Questões Arquiteturais Não Respondidas (GAPs de Evidência)

### Questão 1: O `FilesystemKnowledgeStore` foi intencionalmente substituído pelo Carpaccio `.ai/`?
- **Evidência atual:** O código de `FilesystemKnowledgeStore` continua ativo e testado no orquestrador TypeScript, mas o diretório `knowledge/` não existe no repositório de trabalho. O ADR-0004 cita o "Project Knowledge Contract (Carpaccio `.ai/` + Wiki RAG)" e afirma que o `KnowledgeStore` TS é um "store leve de run".
- **O que falta descobrir:** Houve uma decisão explícita de abandonar o diretório `knowledge/` em favor de `.ai/` que não foi formalizada em um ADR de depreciação, ou o diretório deveria ter sido criado na inicialização do projeto e foi esquecido?

### Questão 2: Qual é a performance e taxa de degradação real do motor híbrido com Ollama?
- **Evidência atual:** O ADR-0005 documenta o modo degradado (Ollama down → BM25). A fixture interna implementa exclusivamente a busca BM25 com tokenização lexical simples.
- **O que falta descobrir:** Quando o cofre externo completo (`karpathyWiki`) é utilizado com LanceDB e Ollama em produção, qual é a frequência com que o Ollama falha e força o fallback para BM25? A qualidade das respostas do agente degrada perceptivelmente?

### Questão 3: Por que os hooks do `wiki-mem` estão ausentes em `.cursor/hooks.json`?
- **Evidência atual:** `profiles/default.yaml` define `memory.enabled: false`. O script `mem.py` está completamente implementado com 456 linhas de código e suporte a redação de segredos, mas não está registrado no arquivo de hooks da IDE no checkout.
- **O que falta descobrir:** A desativação foi motivada por latência excessiva ao interceptar salvamentos de arquivos (`after-edit`) no Cursor, ou é apenas a política de manter a instalação pública o mais minimalista e opcional possível?

### Questão 4: O arquivo `graphify-out/graph.json` de 7.4 MB é estável frente a alterações incrementais?
- **Evidência atual:** O arquivo físico existe no repositório e foi gerado com a opção `--no-cluster`.
- **O que falta descobrir:** Qual é o custo de tempo de CPU para regerar esse grafo completo em um projeto com dezenas de milhares de linhas de código? É viável rodá-lo a cada ciclo `/evolve` ou ele se tornará rapidamente um gargalo de tempo?

### Questão 5: Como o Truth Fence lida com símbolos renomeados?
- **Evidência atual:** `applyTruthFence` usa `topic_key` para saber quando o código sobrepõe uma nota da Wiki.
- **O que falta descobrir:** Se uma função no código for renomeada de `executeEngine()` para `runExecutionEngine()`, mas a nota na Wiki continuar citando o nome antigo, o Truth Fence falha em detectar o conflito por divergência da `topic_key`?

---

## 3. Próximos Passos Investigativos Recomendados

1. **Entrevista Arquitetural com o Usuário / Mantenedor:**
   - Confirmar se o diretório `knowledge/` ainda tem papel na visão V3 ou se pode ser formalmente deprecado em favor de `.ai/pages/`.
   - Alinhar se a memória episódica de chats (`wiki-mem`) deve continuar desativada por padrão ou se deve ser integrada ao fluxo de evidências.
2. **Benchmark Comparativo em Cenário Real com Vault Ativo:**
   - Executar 10 tarefas do mundo real com `WIKI_ROOT` configurado, medindo tempo total por consulta, acurácia dos arquivos recuperados e relevância percebida no Context Pack.
3. **Auditoria de Desempenho do Graphify:**
   - Medir o tempo de execução de `graphify update` na árvore atual do EvolveLoop para determinar se a ferramenta pode ser executada como hook automático ou se deve permanecer como etapa manual/sob demanda.
