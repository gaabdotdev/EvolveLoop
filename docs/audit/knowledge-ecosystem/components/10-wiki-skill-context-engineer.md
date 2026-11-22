# Relatório de Componente: Skill wiki (Context Engineer)

---

## 1. Identidade
- **O que é?**  
  Uma skill de agente no Cursor (`.cursor/skills/wiki/SKILL.md`) acompanhada de regras e scripts (`ground.sh`), responsável por incorporar o papel e especialização de "Context Engineer".
- **Qual é sua finalidade declarada?**  
  Atuar como o gatekeeper obrigatório de conhecimento canônico (HARD-GATE) antes de qualquer etapa de planejamento detalhado ou modificação de código no ecossistema do EvolveLoop / MegaBrain.
- **Qual é sua responsabilidade efetivamente implementada?**  
  - Execução disciplinada do ritual de busca e consulta ao cofre (`scout` e `search` via `ground.sh` ou CLI do vault).
  - Produção obrigatória do artefato padronizado **Context Pack**:
    - **Fontes:** Documentos e linhas consultados no cofre.
    - **Contratos:** Interfaces de API, tipos, convenções e invariantes invioláveis.
    - **GAPs:** Lacunas de documentação explicitamente declaradas (proibindo invenção de contratos).
    - **Método:** Abordagem de implementação sugerida.
    - **Handoff:** Transferência explícita de controle para o agente de codificação.
  - Aplicação do princípio "Relevant Context > Maximum Context" (rejeição de dumps cegos da base de conhecimento).
  - Proibição absoluta de implementar código de produto sob esta persona (*anti-vibe coding*).
  - Registro de evidência formal em `memory/<feature_id>/evidence/grounding.json`.
- **Qual problema resolve?**  
  Impede a alucinação de contratos ou suposições sobre arquiteturas complexas sem embasamento documental, forçando o modelo a ancorar seu raciocínio em notas reais antes de escrever código.

---

## 2. Localização
- **Arquivos principais:**  
  - `.cursor/skills/wiki/SKILL.md`: Manifesto da skill e diretrizes comportamentais DO / DO NOT.
  - `.cursor/skills/wiki/scripts/ground.sh`: Script utilitário para orquestrar consultas ao cofre.
  - `.cursor/skills/wiki/references/ritual.md`: Procedimento passo a passo do grounding.
  - `.cursor/skills/orquestrar/references/knowledge-grounding-gate.md`: Especificação normativa do hard-gate.
- **Módulos relacionados:**  
  - Skill raiz: `.cursor/skills/orquestrar/SKILL.md`.
  - Comando slash: `.cursor/commands/wiki.md`.
- **Documentação relevante:**  
  - `.cursor/skills/orquestrar/references/knowledge-grounding-gate.md`.

---

## 3. Armazenamento e representação
- **Onde os dados ficam armazenados?**  
  A skill produz saídas diretamente no transcript da conversa e grava o arquivo formal de evidência em `memory/<feature_id>/evidence/grounding.json`.
- **Em qual formato?**  
  JSON de evidência sanitizado e Markdown estruturado segundo o template Fontes/Contratos/GAPs/Método/Handoff.

---

## 4. Ciclo de vida
1. **Disparo do Gate:**  
   Invocado pelo usuário via `/wiki`, pelo orquestrador no início de `/evolve` (Fase 0) ou automaticamente quando uma tarefa técnica é planejada.
2. **Execução do Ritual (`ground.sh` / CLI):**  
   O agente executa o scout/search sobre o cofre apontado por `WIKI_ROOT` para o projeto alvo.
3. **Análise Crítica e Síntese:**  
   O agente extrai os contratos e identifica eventuais discrepâncias ou ausências de documentação (GAPs).
4. **Emissão do Context Pack:**  
   Emite o relatório estruturado no chat e grava `grounding.json`.
5. **Transição de Fase:**  
   O orquestrador verifica a existência de `grounding.json` e a presença de contratos/GAPs; apenas com o status `applied`, autoriza o avanço para a Fase 1 (`/planejar`) ou Fase 2 (implementação).

---

## 5. Como é utilizado
- **Quem chama o componente?**  
  A skill `orquestrar` (`/evolve`), desenvolvedores humanos no Cursor via `/wiki`, ou agentes de planejamento.
- **Obrigatoriedade:**  
  Estritamente obrigatório em todas as tarefas não-triviais de implementação de software no EvolveLoop.

---

## 6. Quando é utilizado
- **Momentos de acionamento:**  
  Imediatamente antes do planejamento da tarefa e antes de qualquer worker abrir arquivos para edição.
- **Frequência operacional:** `NOT_MEASURED`.

---

## 7. Entradas e saídas
- **Entrada:** Solicitação técnica do usuário e identificador do projeto.
- **Saída:** Context Pack estruturado no chat e arquivo de evidência `grounding.json`.

---

## 8. Dependências e integração
- **Dependências:** Script `ground.sh`, CLI `gaabwiki`, variável `WIKI_ROOT`.
- **Acoplamento:** Porta de entrada para toda a orquestração do EvolveLoop.

---

## 9. Configuração e operação
- **Configuração:** `WIKI_ROOT` configurado no ambiente.

---

## 10. Qualidade e confiabilidade
- **Garantia:** Impede o início de qualquer ciclo de desenvolvimento com base em falsas memórias de LLMs.
- **Comprovação:** `VERIFIED_IN_CODE` e regulado pelo `knowledge-grounding-gate.md`.

---

## 11. Evidências
- `VERIFIED_IN_CODE`: Definição de gate em `.cursor/skills/orquestrar/references/knowledge-grounding-gate.md#L1-L97`.
- `VERIFIED_IN_CODE`: SKILL.md em `.cursor/skills/wiki/SKILL.md#L1-L100`.
- `OBSERVED_AT_RUNTIME`: Evidência `grounding.json` presente em diretórios reais como `memory/v22-close-100/evidence/grounding.json`.

---

## 12. Resumo operacional
- **Responsabilidade real:** Skill guardiã do ritual obrigatório de grounding pré-implementação.
- **Quem o utiliza:** Agente orquestrador e comandos de topo de nível.
- **Quando é acionado:** Na Fase 0 de qualquer ciclo `/evolve`.
- **Fonte de dados:** Wiki Vault consultada via CLI.
- **Principal dependência:** Acesso ao cofre e integridade do script `ground.sh`.
- **Principal risco / limitação:** Se o cofre estiver vazio ou o CLI falhar, o agente deve registrar formalmente o GAP e não paralisar ou alucinar.
- **O que falta verificar:** Avaliar tempo despendido pelo modelo na elaboração do Context Pack versus taxa de retrabalho em código.
