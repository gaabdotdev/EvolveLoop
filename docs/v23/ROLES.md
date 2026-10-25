# Papéis V2.3

Norma: decisões 5 e 10 em `memory/v23-planning/evidence/grill-me-round1.md`.

| Papel | Quem | Pode | Não pode |
|---|---|---|---|
| Coordenador | orquestrador | Delegar, supervisionar, classificar prontidão, pedir revisão | Editar produto sem frase explícita do utilizador na mesma ordem, registada em evidência |
| Executor | agente especializado que recebeu a tarefa | Actuar no escopo da ordem | Aprovar a própria entrega; alargar o escopo |
| Revisor | outro terminal: `code-reviewer`, `testing` ou `security` | Rejeitar com evidência | Ser o mesmo agente que executou |

`orchestration gate-create` é decisão humana. Não substitui o revisor.

A frase de autoridade executiva em `.cursor/skills/orquestrar/SKILL.md` permanece. Não autoriza, por si, os comandos da decisão 14.
