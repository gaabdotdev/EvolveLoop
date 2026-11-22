# V4.0 — Roteiro de teste de compreensão (evidência M7)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §3 (Teste de compreensão)  
**Materiais a entregar ao participante:**  
- `docs/v4/V4.0/glossary-and-mental-model.md` (§1–§2)  
- `docs/v4/V4.0/state-matrix.md` (§1.3 sucesso + §6 matriz cruzada — opcional se tempo)  
- Frase de posicionamento: `product-identity-brief.md` §2  

**População alvo:** usuários externos que **não** participaram da implementação V4.0 Identity.  
**Proibido:** orientar respostas durante a medição; inventar % sem participantes reais.

---

## 1. Setup (facilitador)

1. Registar: data, ambiente (remoto/presencial), versão dos docs (commit SHA do repo).  
2. Entregar só os materiais acima (não o inventário completo — evita enviesar com “erros atuais”).  
3. Tempo de leitura: **10–15 min**.  
4. Entrevista: **15–20 min** (perguntas §3).  
5. Não corrigir o participante até o fim; anotar interpretações incorretas.  
6. Após entrevista: debrief opcional com glossário aberto.

### Consentimento mínimo

- Explicar que é teste de clareza de documentação, não de desempenho pessoal.  
- Não gravar sem consentimento; se gravar, guardar path no resultado.

---

## 2. Instruções ao participante (ler em voz alta)

> Você recebeu o glossário e o modelo mental do EvolveLoop.  
> Leia com calma. Depois responda com as suas palavras.  
> Se não souber, diga “não sei” — isso é um resultado válido.

---

## 3. Perguntas (obrigatórias)

Pontuação sugerida por item: **1** = correto alinhado ao glossário · **0.5** = parcial · **0** = incorreto / “não sei” que revela lacuna crítica.

### Q-Workspace

1. O que é um **Workspace** neste produto?  
2. O que **não** deve vazar entre Workspaces?

**Chave:** contexto de trabalho (cwd/limites); Tasks/recursos não vazam entre Workspaces.

### Q-Task

3. O que é uma **Task**?  
4. Qual é a unidade principal de acompanhamento na UX?

**Chave:** objetivo delegado pelo usuário; a própria Task.

### Q-Plan

5. O que é um **Plan**?  
6. Em que momento o usuário tipicamente o vê?

**Chave:** decomposição compreensível do trabalho; revisão antes/durante execução (aprovação possível).

### Q-Agent

7. O que é um **Agent**?  
8. O estado do Agent é o mesmo que o estado da Session de terminal?

**Chave:** executor especializado; **não** — estados distintos.

### Q-Orchestrator

9. O que faz o **Orchestrator**?  
10. “MSO” / “Coordinator” no código são o quê em relação a Orchestrator?

**Chave:** coordena Agents, dependências, progresso; nomes internos / implementação, não o rótulo de produto preferido.

### Q-Session

11. O que é uma **Session** de produto?  
12. Por que pode haver mais de um tipo de “sessão” no sistema?

**Chave:** contexto de execução da Task (orquestração); ProcessSession etc. são detalhe — produto deve qualificar.

### Q-Agent-Handle

13. O que é um **Agent Handle**?  
14. A jornada principal **exige** Handles ligados?

**Chave:** acesso opcional à Session de um Agent (inspect/attach); **não** exige (default off); fechar viewer ≠ matar Agent.

### Q-Approval

15. O que é uma **Approval**?  
16. Dê um exemplo de decisão que seria Approval.

**Chave:** autorização explícita antes de continuar; ex.: confirmar Plan, consentimento sensível.

### Q-Delivery

17. O que é uma **Delivery**?  
18. Quando é legítimo dizer que a entrega “passou” / foi aceita?

**Chave:** resultado final + evidências/validações/limitações; só com verificação real — não “PASS” vazio.

---

## 4. Perguntas de integração (opcionais, +5 min)

19. Desenhe (ou narre) o fluxo: Workspace → … → Delivery.  
20. Se a UI mostrar “Workers” e “Pronto” com MSO em INIT, o que está errado segundo o contrato V4.0?

**Chave 19:** alinhado ao diagrama glossário §2.  
**Chave 20:** Workers deveria ser Agents; Pronto ≠ INIT (usar aguardando entrada / Session início).

---

## 5. Registo por participante (template)

```text
Participante-ID: (anon)
Data:
Commit docs:
Tempo leitura (min):
Tempo entrevista (min):

Scores:
Workspace: /2
Task: /2
Plan: /2
Agent: /2
Orchestrator: /2
Session: /2
Handle: /2
Approval: /2
Delivery: /2
Integração (opc): /2

Total obrigatório: /18
Notas de erros de interpretação:
Pedidos de ajuda:
```

### Agregação

- % compreensão = média dos totais obrigatórios / 18 × 100, com N, mediana e dispersão.  
- Reportar também % por conceito (Workspace…Delivery).  
- Se N=0 → ver `comprehension-test-results.md` (LIMITATION).

---

## 6. Reprodutibilidade

- Mesmos PDFs/paths Markdown versionados no commit.  
- Mesmas 18 perguntas.  
- Facilitador não dá dicas.  
- Resultados em `comprehension-test-results.md` (append por sessão).

---

*Fim — comprehension-test-script.md*
