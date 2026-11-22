# Relatório de Componente: Servidor MCP Memory (@modelcontextprotocol/server-memory)

---

## 1. Identidade
- **O que é?**  
  Um servidor MCP externo baseado no pacote npm `@modelcontextprotocol/server-memory`, listado no arquivo de configuração `mcp/mcp.json`.
- **Qual é sua finalidade declarada?**  
  Fornecer um grafo de entidades, relacionamentos e observações persistentes (`create_entities`, `create_relations`, `add_observations`, `read_graph`, `search_nodes`) utilizável por assistentes de IA conectados via Model Context Protocol.
- **Qual é sua relação real com o EvolveLoop?**  
  Apesar de estar presente na lista de servidores recomendados em `mcp/mcp.json`, **o componente foi formalmente avaliado e DESCARTADO como SSOT de projeto pelo EvolveLoop** na auditoria de arquitetura V2.2 (`docs/research/evolveloop-v2.2/03-repositories-and-tools.md`).
- **Motivo do descarte documentado no projeto:**  
  O `@modelcontextprotocol/server-memory` persiste todo o grafo em um único arquivo JSON no diretório do usuário no host, misturando dados de múltiplos projetos sem isolamento de repositório, violando o princípio fundamental de fronteira e isolamento de conhecimento de projetos do EvolveLoop.

---

## 2. Localização e Referências
- `mcp/mcp.json`:
  ```json
  "memory": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
  ```
- `docs/research/evolveloop-v2.2/03-repositories-and-tools.md#L259`:  
  *"DESCARTAR como SSOT de projeto. Um arquivo global mistura repos."*
- `docs/research/evolveloop-v2.2/README.md#L90`:  
  *"Mem0, Letta, claude-mem e o MCP @modelcontextprotocol/server-memory como memória do núcleo: duplicam MemoryStore / wiki-mem e misturam projetos."*

---

## 3. Evidências
- `VERIFIED_IN_CODE`: Presente em `mcp/mcp.json#L48-L51`.
- `DOCUMENTED_ONLY`: Avaliação arquitetural negativa registrada em `docs/research/evolveloop-v2.2/`.
- Nenhuma chamada no código do orquestrador (`orchestrator/src/`) importa ou comunica com as ferramentas deste servidor MCP.

---

## 4. Resumo operacional
- **Responsabilidade real:** Servidor MCP genérico de grafo de entidades para IDEs.
- **Estado no EvolveLoop:** **Descartado / Não utilizado pelo core.**
- **Risco:** Caso ativado manualmente pelo usuário, pode acumular dados misturados de múltiplos repositórios em um arquivo global no host.
