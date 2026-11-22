# Relatório de Componente: Diretório Raiz memory/ (Espaço de Trabalho e Forense)

---

## 1. Identidade
- **O que é?**  
  O diretório físico `/home/gaab/Downloads/EvolveLoop/memory/` localizado na raiz do repositório, ignorado no versionamento (`.gitignore`).
- **Qual é sua finalidade e utilização comprovada em runtime?**  
  Atua como o repositório de trabalho local onde o orquestrador, scripts de benchmark e agentes do Cursor persistem artefatos reais de execuções passadas:
  - Planos de tarefas gerados pelo planejador (`memory/<feature_id>/plan.ir.yaml`).
  - Provas documentais dos portões de qualidade (`memory/<feature_id>/evidence/*.json`).
  - Conjuntos de auditoria forense de tokens e modelos (`memory/token-forensics-2026-10-24/`).
  - Decisões e registros de planejamento de versões (`memory/v22-close-100/`, `memory/v23-planning/`, `memory/v24-scope-2026-10-24/`, `memory/evolveloop-v3/`).
- **Diferença entre a especificação e a realidade:**  
  A especificação histórica (`specs/knowledge-memory.md`) previa que `memory/<feature_id>/` conteria arquivos YAML de memória (`context.yaml`, `preferences.yaml`, `decisions.yaml`). Na realidade física observada no disco, o diretório é quase que exclusivamente utilizado para arquivos de evidência JSON (`EvidenceBus`), planos intermediários (`plan.ir.yaml`) e relatórios forenses em Markdown e JSON.

---

## 2. Conteúdo Físico Auditado no Checkout
Varredura direta no diretório revelou:
- `memory/v22-close-100/`: Evidências de fechamento da release V2.2 (`gate.testing.json`, `gate.security.json`, `openrouter-usage.json`, etc.).
- `memory/v23-planning/`: Registros de planejamento da V2.3 (`grill-me-round1.md`, `gate.grill-me.json`, matriz de dependências e 11 planos de metas `V23-GOAL-*`).
- `memory/token-forensics-2026-10-24/`: Seis frentes de investigação detalhada de consumo de tokens, células de limites e histórico de inferência.
- `memory/v24-scope-2026-10-24/`: Planos das metas G1 (observabilidade) e G2 (benchmark).
- `memory/graphify-skill-hardgate/`: Evidências de validação do portão do Graphify.
- `memory/evolveloop-v3/` e `evolveloop-v3-hardening/`: Evidências do modelo V3.

---

## 3. Evidências
- `OBSERVED_AT_RUNTIME`: 8 subdiretórios principais ativos contendo centenas de arquivos de log, planos e evidências JSON.
- `VERIFIED_IN_CODE`: Diretório expressamente ignorado em `.gitignore#L22` (`memory/`).
- `VERIFIED_IN_CODE`: Apontado como `evidence_dir` em `.cursor/commands/evolve.md#L25`.

---

## 4. Resumo operacional
- **Responsabilidade real:** Espaço de trabalho físico local para evidências de qualidade, planos de tarefa e auditorias forenses de sessão.
- **Quem o utiliza:** Comandos `/evolve`, `/planejar`, scripts de benchmark e agentes executores.
- **Classificação:** Área de artefatos locais do ambiente de desenvolvimento (não commitada no Git).
