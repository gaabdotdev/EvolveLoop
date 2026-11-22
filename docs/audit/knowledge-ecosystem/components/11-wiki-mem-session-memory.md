# Relatório de Componente: Skill wiki-mem & Hooks de Sessão

---

## 1. Identidade
- **O que é?**  
  Um subsistema de memória episódica de sessão do Cursor e esteira de promoção para conhecimento perene, implementado pelo script em Python `.cursor/hooks/wiki-mem/mem.py` e guiado pela skill `.cursor/skills/wiki-mem/SKILL.md`.
- **Qual é sua finalidade declarada?**  
  Capturar automaticamente o histórico operacional das sessões do Cursor, permitindo recuperação de contexto entre diferentes conversas (`mem.py search`) e atuando como um *librarian* que enfileira alterações de código em `promote-queue.md` para serem posteriormente promovidas a documentos canônicos da Wiki.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Processamento de eventos padrão de hooks do Cursor via stdin:
    - `session-start`: Registra o início da sessão em `$WIKI_ROOT/.ai/sessions/current.json`.
    - `after-edit`: Captura caminhos de arquivos modificados e agrega estatísticas de código.
    - `session-end` / `stop`: Finaliza a sessão, grava o log consolidado em `$WIKI_ROOT/.ai/sessions/index.jsonl` e gera o digest atualizado em `LATEST.md`.
  - Enfileiramento de promoção (`promote-queue.md`): Agrupa candidatos a promoção sem tocar na Wiki canônica automaticamente.
  - Busca lexical de sessões passadas (`mem.py search`).
  - Redação de segredos (`_redact_text`, `_redact_obj`) em todos os payloads ingeridos.
- **Qual problema resolve?**  
  Resolve a perda de contexto e amnésia entre diferentes janelas de chat do Cursor, garantindo que lições e mudanças de código não fiquem isoladas na conversa corrente.

---

## 2. Localização
- **Arquivos principais:**  
  - `.cursor/hooks/wiki-mem/mem.py`: Script CLI e manipulador de hooks (456 linhas).
  - `.cursor/skills/wiki-mem/SKILL.md`: Manifesto da skill e diretrizes do papel "Knowledge / Librarian".
  - `.cursor/commands/mem.md`: Definição do comando slash `/mem`.
  - `$WIKI_ROOT/.ai/sessions/`: Diretório de persistência de sessões no cofre.
- **Configurações:**  
  - `profiles/default.yaml`: Configuração padrão do perfil (`memory.enabled: false`, `provider: wiki-mem`).
  - `.cursor/hooks.json`: Arquivo de registro de hooks do Cursor.
- **Documentação relevante:**  
  - `.cursor/skills/wiki-mem/SKILL.md`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  No cofre da Wiki, sob `$WIKI_ROOT/.ai/sessions/`:
  - `current.json`: Estado da sessão ativa corrente.
  - `index.jsonl`: Linhas JSON contendo o histórico consolidado de todas as sessões finalizadas.
  - `LATEST.md`: Digest resumido das últimas 8 sessões para injeção rápida.
  - `promote-queue.md`: Fila de blocos de código pendentes de promoção documental.
- **Em qual formato?**  
  JSON, JSON Lines e Markdown.

---

## 4. Ciclo de vida
1. **Captura por Hooks:** O Cursor executa `mem.py` enviando JSON pelo stdin nos marcos do ciclo de vida da IDE.
2. **Registro de Edições:** A cada salvamento de arquivo de código, `append_edit()` atualiza os arquivos editados e timestamps.
3. **Fechamento e Digest:** No encerramento da sessão, `finalize_session()` grava o resumo em `index.jsonl`, reconstrói `LATEST.md` e, se houver edits relevantes, adiciona um bloco à fila `promote-queue.md`.
4. **Consulta:** O desenvolvedor ou agente executa `mem.py search "<termo>"` para resgatar contexto de sessões passadas.
5. **Promoção (Librarian):** O agente com o papel de librarian lê `promote-queue.md` e formaliza as alterações no log do projeto (`{Projeto}/log.md`) ou cria novas páginas na Wiki.

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  - Hooks do Cursor IDE (quando registrados em `hooks.json`).
  - O comando `/mem` invocado pelo desenvolvedor humano.
- **Obrigatoriedade:**  
  **Opcional / Desativado por padrão.**

---

## 6. Quando é utilizado
- **Estado atual de ativação:**  
  - Em `profiles/default.yaml`, o recurso está expressamente definido como `memory.enabled: false`.
  - No arquivo `.cursor/hooks.json` atual do repositório, **os hooks do wiki-mem não estão configurados** (existem apenas os hooks do orquestrador `orchestrator-job-pickup.sh` e `orchestrator-after-engine.sh`).
- **Frequência operacional no checkout:** Nenhuma execução de hook observada no estado padrão.

---

## 7. Entradas e saídas
- **Entrada:** Eventos JSON de hooks do Cursor via stdin contendo IDs de sessão, caminhos de arquivo e timestamps.
- **Saída:** Arquivos JSONL, Markdown (`LATEST.md`, `promote-queue.md`) e resultados textuais de busca.

---

## 8. Dependências e integração
- **Dependências:** Python 3 standard library, diretório `$WIKI_ROOT`.
- **Acoplamento:** Não afeta o núcleo de execução do orquestrador TypeScript; é puramente um utilitário de suporte à IDE Cursor.

---

## 9. Configuração e operação
- **Configuração:** Para ativar, o usuário deve habilitar `memory.enabled: true` no seu perfil e registrar os hooks do `mem.py` no `hooks.json`.

---

## 10. Qualidade e confiabilidade
- **Segurança:** O script implementa filtros rigorosos contra dados sensíveis (`_redact_text`, `SKIP_PATH_RE` bloqueando `.env`, chaves privadas, senhas).
- **Isolamento:** As gravações no disco são restritas a `.ai/sessions/` e não modificam as notas canônicas da Wiki automaticamente.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Implementação em `.cursor/hooks/wiki-mem/mem.py#L1-L456`.
- `VERIFIED_IN_CODE`: Desativação por padrão em `profiles/default.yaml#L10-L13`.
- `OBSERVED_AT_RUNTIME`: Ausência dos hooks em `.cursor/hooks.json`.

---

## 12. Resumo operacional
- **Responsabilidade real:** Capturador episódico de conversas da IDE e esteira de fila de promoção.
- **Quem o utiliza:** Desenvolvedor via `/mem` e hooks do Cursor (quando configurados).
- **Quando é acionado:** Início, fim de sessão e modificações de arquivos na IDE.
- **Fonte de dados:** Eventos de telemetria emitidos pelo Cursor.
- **Principal dependência:** Python 3 e variável `WIKI_ROOT`.
- **Principal risco / limitação:** Como está desativado por padrão, não há histórico recente de sessões registrado na instalação padrão.
- **O que falta verificar:** Avaliar aceitação de usuários sobre o overhead de I/O a cada edição de arquivo na IDE.
