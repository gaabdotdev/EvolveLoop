# EvolveLoop V3 — Metas, Visão e Doutrina de Engenharia

**Status:** Documento de definição / roadmap conceitual  
**Versão:** V3 Planning Baseline  
**Objetivo:** estabelecer o que a V3 deve alcançar e qual nível de exigência será usado para considerá-la pronta.

---

# 1. Visão

A V3 representa uma mudança de nível do EvolveLoop.

**V1:** observar e propor evolução.  
**V2:** executar autonomamente uma engenharia bem definida.  
**V3:** receber um objetivo e descobrir como realizá-lo, inclusive quando não existe um caminho previamente definido.

A meta central é:

> **Zero intervenção humana no fluxo normal.**

Isso não significa ausência de políticas, autoridade, limites ou gates. O humano deixa de ser operador e passa a ser **policy / authority**.

O usuário fornece:

```text
GOAL
CONSTRAINTS
AUTHORITY
BUDGET
RISK POLICY
```

O EvolveLoop trabalha autonomamente até:

```text
OUTCOME
```

ou até um estado legítimo como:

```text
HUMAN_GATE_REQUIRED
```

---

# 2. Loop Autônomo Completo

O loop principal da V3:

```text
GOAL
  ↓
INTERPRETATION
  ↓
DEFINE SUCCESS
  ↓
INVESTIGATION
  ↓
RESEARCH
  ↓
WORLD MODEL
  ↓
PLANNING
  ↓
TASK GRAPH / EXECUTABLE IR
  ↓
DELEGATION
  ↓
EXECUTION
  ↓
OBSERVATION
  ↓
EVIDENCE
  ↓
VERIFICATION
  ↓
EVALUATION
  ↓
┌──────────────────────────────┐
│ PASS                         │
│   ↓                          │
│ continue / deliver           │
│                              │
│ FAIL                         │
│   ↓                          │
│ reproduce                    │
│   ↓                          │
│ diagnose                     │
│   ↓                          │
│ experiment                   │
│   ↓                          │
│ repair                       │
│   ↓                          │
│ re-test                      │
│   ↓                          │
│ replan                       │
└──────────────┬───────────────┘
               ↓
       INDEPENDENT VERIFY
               ↓
            DELIVERY
               ↓
          EXPERIENCE
               ↓
            MEMORY
               ↓
       STRATEGY UPDATE
```

O processo pode continuar por milhares de ações sem exigir que o usuário conduza cada etapa.

---

# 3. Os Cinco Pilares

A V3 possui cinco pilares centrais.

## 3.1 Autonomia

- zero intervenção no fluxo normal;
- long-horizon autonomy;
- goal management;
- dynamic planning;
- recuperação;
- mudança de estratégia;
- autonomous stopping.

## 3.2 Inteligência

- self-directed research;
- world model;
- memória;
- reasoning routing;
- self-debugging;
- self-testing;
- uncertainty management;
- attention/context management.

## 3.3 Segurança

- sandbox real;
- least authority;
- secrets isolation;
- independent verification;
- adversarial self-testing;
- transactional effects;
- fail-safe behavior.

## 3.4 Self-Evolution

- capability evolution;
- agent evolution;
- runtime evolution;
- controlled promotion;
- rollback;
- benchmark-driven improvement.

## 3.5 Generalidade

- Cursor;
- Claude;
- Codex;
- Ollama;
- browser;
- terminal;
- APIs;
- Git;
- cloud;
- databases;
- services;
- sistemas externos.

---

# 4. Meta 1 — Autonomia Ponta a Ponta

O agente deve transformar:

```text
OBJETIVO
```

em:

```text
OUTCOME
```

sem depender de comandos intermediários do usuário.

A execução deve ser capaz de:

```text
interpretar
→ investigar
→ planejar
→ executar
→ observar
→ avaliar
→ reparar
→ replanejar
→ verificar
→ entregar
```

A ausência de um passo previamente previsto pelo workflow não deve, por si só, impedir a execução.

---

# 5. Meta 2 — Long-Horizon Autonomy

A V3 não deve ser definida por um número pequeno de passos.

Objetivo:

```text
100+
500+
1.000+
5.000+
10.000+
```

ações/eventos em horizontes progressivos, sem perda catastrófica de:

- contexto;
- objetivo;
- estado;
- memória;
- evidência;
- policy;
- orçamento;
- lineage.

O sistema precisa suportar:

- checkpoints;
- recuperação;
- planejamento incremental;
- budget;
- deadline;
- prioridade;
- mudança de estratégia;
- reentrada após interrupção.

Não deve existir um limite artificial do tipo:

> “Depois de X etapas o agente deixa de funcionar.”

---

# 6. Meta 3 — Goal Contract + Success Oracle

Todo objetivo deve ser convertido em uma representação operacional que contenha, quando aplicável:

```text
desired outcome
constraints
non-goals
success criteria
acceptable degradation
deadline
budget
authority
risk policy
```

O agente precisa responder:

> **“Como vou saber que terminei?”**

Um resultado não deve ser considerado concluído apenas porque uma sequência de tarefas acabou.

A conclusão deve depender de evidência dos critérios de sucesso.

---

# 7. Meta 4 — Autonomous Stopping

O agente deve ser capaz de escolher autonomamente:

```text
ACT
RESEARCH
RETRY
REPAIR
REPLAN
WAIT
ASK
DELEGATE
VERIFY
DELIVER
STOP
```

Parar corretamente é parte da autonomia.

Um `STOP` válido deve possuir justificativa/evidência suficiente para demonstrar que:

```text
GOAL SATISFIED
+
SUCCESS CRITERIA VERIFIED
+
NO REQUIRED WORK REMAINS
+
RISK ACCEPTABLE
```

---

# 8. Meta 5 — Persistent Agent Identity

A execução deixa de ser a unidade máxima de existência.

O agente passa a possuir:

```text
identity
capabilities
policies
knowledge
memories
experience
history
learned strategies
```

Uma execução termina.

**O agente continua existindo.**

A identidade persistente deve ser operacional, não apenas nominal.

---

# 9. Meta 6 — Memória de Alta Fidelidade

A V3 deve separar:

```text
Semantic Memory
→ o que sabe

Episodic Memory
→ o que aconteceu

Procedural Memory
→ como fazer

Working Memory
→ o que está fazendo agora

Failure Memory
→ o que já deu errado

Decision Memory
→ por que escolheu algo
```

A memória deve permitir perguntas operacionais como:

> “Eu já fiz algo parecido?”

> “O que funcionou?”

> “O que falhou?”

> “Por que não devo repetir aquela estratégia?”

Memória não deve significar simplesmente guardar logs indefinidamente.

Ela precisa possuir seleção, compressão, relevância, atualização e recuperação.

---

# 10. Meta 7 — Attention / Context Management

Long-horizon exige controle de contexto.

O sistema deve ser capaz de:

```text
raw experience
→ compression
→ salience
→ retrieval
→ active context
```

Precisamos decidir:

- o que manter;
- o que resumir;
- o que recuperar;
- o que descartar temporariamente;
- o que é relevante para o objetivo;
- quais informações estão stale.

A memória não pode resolver long-horizon simplesmente acumulando todo o histórico no contexto.

---

# 11. Meta 8 — Self-Model

O agente deve possuir um modelo operacional de suas próprias limitações:

```text
I can
I cannot
I am authorized to
I am not authorized to
I know
I don't know
I have access to
I don't have access to
```

Isso deve influenciar planejamento, capability discovery, routing e decisões de segurança.

---

# 12. Meta 9 — Uncertainty Engine

A V3 deve distinguir explicitamente:

```text
KNOWN
LIKELY
UNCERTAIN
UNKNOWN
CONFLICTING
STALE
```

E, quando possível:

```text
confidence
evidence quality
source reliability
freshness
decision impact
```

A incerteza deve afetar comportamento.

Exemplo:

```text
low confidence + reversible action + low risk
→ pode continuar

low confidence + irreversible action + high risk
→ investigar / verificar / human gate
```

---

# 13. Meta 10 — Self-Directed Research

Quando o agente detectar insuficiência de informação:

```text
IDENTIFY UNCERTAINTY
        ↓
RESEARCH
        ↓
COMPARE SOURCES
        ↓
EVALUATE RELIABILITY
        ↓
UPDATE KNOWLEDGE
        ↓
CONTINUE TASK
```

O objetivo não é apenas RAG.

É **investigação autônoma**.

O agente deve conseguir decidir quando precisa pesquisar, o que pesquisar, como comparar fontes e quando possui evidência suficiente para continuar.

---

# 14. Meta 11 — World Model

O agente deve manter uma representação dinâmica do estado relevante do mundo:

```text
Repository
├── architecture
├── files
├── dependencies
├── runtime state
├── external systems
├── constraints
├── goals
├── actors
└── known unknowns
```

Esse modelo precisa ser atualizado com novas observações.

---

# 15. Meta 12 — World-State Reconciliation

O agente não pode continuar operando sobre uma representação obsoleta da realidade.

Loop:

```text
WORLD MODEL
      ↓
OBSERVE ACTUAL WORLD
      ↓
DIFF
      ↓
DRIFT DETECTED
      ↓
RECONCILE
      ↓
UPDATE MODEL
```

Se o mundo mudar externamente, o agente precisa descobrir isso e ajustar o plano.

---

# 16. Meta 13 — Dynamic Capability Discovery

O agente deve partir da necessidade, não de uma lista mental fixa de ferramentas:

```text
AGENT NEEDS X
      ↓
SEARCH CAPABILITY REGISTRY
      ↓
FIND PROVIDER
      ↓
EVALUATE AUTHORITY
      ↓
INVOKE
```

Se não existir uma capability adequada:

```text
NO CAPABILITY
      ↓
CAPABILITY NEED
      ↓
PROPOSE / BUILD
```

Isso conecta diretamente capability discovery com self-evolution.

---

# 17. Meta 14 — Self-Debugging

O agente não deve resolver falhas com tentativas aleatórias.

O loop esperado:

```text
FAILURE
 ↓
REPRODUCE
 ↓
OBSERVE
 ↓
HYPOTHESIS
 ↓
EXPERIMENT
 ↓
DIAGNOSIS
 ↓
REPAIR
 ↓
REGRESSION
 ↓
VERIFY
```

Toda reparação relevante deve produzir experiência reutilizável.

---

# 18. Meta 15 — Self-Testing

O agente deve identificar insuficiência de testes.

Loop:

```text
IMPLEMENTATION
 ↓
COVERAGE ANALYSIS
 ↓
RISK ANALYSIS
 ↓
MISSING EVIDENCE
 ↓
GENERATE TESTS
 ↓
ATTACK IMPLEMENTATION
 ↓
REPAIR
 ↓
VERIFY
```

O objetivo não é apenas passar os testes existentes.

É construir evidência suficiente para o risco da mudança.

---

# 19. Meta 16 — Adversarial Self-Verification

Resultados importantes devem possuir separação entre criação e verificação:

```text
BUILDER
   ↓
VERIFIER
   ↓
ADVERSARY
   ↓
RUNTIME EVIDENCE
```

O sistema deve ativamente tentar encontrar razões pelas quais sua própria solução está errada.

Pergunta operacional:

> “Se eu estivesse tentando quebrar minha própria solução, como faria?”

---

# 20. Meta 17 — Action Simulation / Dry Run

Para ações relevantes ou potencialmente destrutivas:

```text
PLAN
 ↓
SIMULATE
 ↓
PREDICT EFFECTS
 ↓
POLICY
 ↓
EXECUTE
 ↓
VERIFY
```

Aplicável especialmente a:

```text
delete
deploy
migration
publish
send
commit
external mutation
infrastructure changes
```

A simulação nunca substitui verificação real, mas reduz efeitos inesperados.

---

# 21. Meta 18 — Transactional Autonomy

A V3 precisa lidar com efeitos parciais.

Modelo:

```text
ACTION
 ↓
EFFECT
 ↓
VERIFY
```

Quando possível:

```text
ACTION A
ACTION B
ACTION C
 ↓
B FAIL
 ↓
COMPENSATE A
```

Para operações compostas, devemos definir quando:

- continuar;
- compensar;
- reverter;
- marcar estado parcial;
- exigir intervenção.

---

# 22. Meta 19 — Real Sandbox

O sandbox da V3 deve ser isolamento real, não apenas restrição lógica de caminhos.

Requisitos conforme o risco:

```text
filesystem isolation
process isolation
network isolation
secret isolation
CPU limits
RAM limits
time limits
device restrictions
credential restrictions
```

V2 deixou essa parte explicitamente fora do escopo.

Na V3:

```text
SANDBOX = REQUIRED
```

---

# 23. Meta 20 — Universal Provider Architecture

O agente deve pensar em **capacidade necessária**, não em fornecedor.

Modelo:

```text
                 AGENT
                   ↓
             AGENT BACKEND
                   ↓
            REASONING ROUTER
          ┌────────┼────────┐
          ↓        ↓        ↓
       Cursor    Claude    Codex
          ↓        ↓        ↓
                 ...
```

Também deve existir capability equivalence suficiente para que troca de provider não altere arbitrariamente a autoridade do agente.

---

# 24. Meta 21 — Model Specialization

O sistema deve poder selecionar modelos de acordo com:

```text
task type
risk
quality history
latency
cost
context requirements
tool requirements
availability
```

Exemplos:

```text
planning → Model A
coding → Model B
debugging → Model C
vision → Model D
private/local → Ollama
simple → smaller model
critical → strongest model
```

A seleção deve ser orientada por evidência operacional, não por hardcode excessivo.

---

# 25. Meta 22 — Cost Intelligence

Autonomia precisa ser economicamente governável.

O agente deve possuir:

```text
forecast
budget
cost tracking
resource accounting
strategy optimization
```

Quando uma estratégia estiver consumindo recursos de forma inadequada:

```text
DETECT COST DRIFT
      ↓
REASSESS
      ↓
CHANGE STRATEGY
```

---

# 26. Meta 23 — Failure Economy

O histórico deve permitir comparar estratégias:

```text
Strategy A
→ success rate
→ latency
→ cost
→ repair rate

Strategy B
→ success rate
→ latency
→ cost
→ repair rate
```

Então o agente pode favorecer uma estratégia baseada em evidência operacional.

Não tratar isso como “reinforcement learning mágico”.

O foco é:

**experiência observável → melhor decisão futura.**

---

# 27. Meta 24 — Agent Reputation

Agentes e providers podem acumular histórico de:

```text
task_success
failure_rate
repair_rate
latency
cost
regression_rate
security_findings
```

A reputação serve como evidência para routing e delegation.

Não deve ser uma pontuação mágica ou autoridade absoluta.

---

# 28. Meta 25 — Multi-Agent Society

A V3 deve evoluir de simples delegação para coordenação especializada:

```text
                  SUPERVISOR
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
   RESEARCH       ENGINEERING       SECURITY
       │               │               │
       └───────────────┼───────────────┘
                       ↓
                     REVIEW
                       ↓
                  VERIFICATION
```

Elementos necessários:

- especialização;
- negociação;
- delegação;
- conflitos;
- autoridade;
- isolamento contextual;
- reputação baseada em histórico.

---

# 29. Meta 26 — Autonomous Negotiation

Agentes precisam lidar com conflitos entre objetivos:

```text
performance
cost
deadline
security
quality
```

Loop:

```text
OBJECTIVE CONFLICT
      ↓
TRADE-OFF ANALYSIS
      ↓
CONSTRAINT HIERARCHY
      ↓
DECISION
```

Em sistemas multi-agent:

```text
Agent A requests resource
Agent B requests same resource
       ↓
Supervisor / policy
       ↓
negotiation / allocation
```

---

# 30. Meta 27 — Temporal Autonomy

A V3 deve ser capaz de lidar com problemas cujo estado muda ao longo do tempo:

```text
WAIT
 ↓
OBSERVE
 ↓
EVENT
 ↓
RE-EVALUATE
 ↓
ACT
```

Também:

```text
deadline approaching
→ change strategy
```

Isso aproxima o EvolveLoop de um agente orientado a eventos e não apenas de uma execução iniciada manualmente.

---

# 31. Meta 28 — Autonomous Resource Allocation

Em um sistema com múltiplos agentes:

```text
N tasks
+
M agents
+
budget
+
deadline
+
risk
```

o sistema deve decidir:

- quem executa;
- qual provider;
- quanto recurso recebe;
- prioridade;
- duração;
- quando substituir estratégia.

---

# 32. Meta 29 — Provenance / Causal Graph

Além de evidence, a V3 deve conseguir reconstruir causalidade:

```text
GOAL
 ↓
DECISION
 ↓
ACTION
 ↓
OBSERVATION
 ↓
EVIDENCE
 ↓
RESULT
```

Isso deve permitir responder:

> “Por que o agente fez isso?”

> “Qual observação causou essa decisão?”

> “Qual evidência sustenta esse resultado?”

> “Se essa evidência estiver errada, quais decisões ficam inválidas?”

---

# 33. Meta 30 — Self-Evolution

O loop de evolução da V3:

```text
OBSERVE
 ↓
DETECT
 ↓
RCA
 ↓
GENERATE
 ↓
IMPLEMENT
 ↓
TEST
 ↓
RED TEAM
 ↓
BENCHMARK
 ↓
COMPARE
 ↓
PROMOTE
```

A evolução deve ocorrer isoladamente primeiro.

Nunca:

```text
"I think I am better"
→
overwrite production
```

---

# 34. Meta 31 — Capability Self-Evolution

Quando o sistema detectar uma classe de tarefa que não consegue executar:

```text
NEED DETECTED
 ↓
CAPABILITY PROPOSAL
 ↓
IMPLEMENTATION
 ↓
TESTS
 ↓
SECURITY REVIEW
 ↓
EVALUATION
 ↓
REGISTRY
```

Somente depois de passar pelos gates apropriados a capability pode entrar no conjunto utilizável.

---

# 35. Meta 32 — Agent Self-Evolution

Quando houver degradação de um agente:

```text
PERFORMANCE DEGRADATION
       ↓
RCA
       ↓
CONTRACT REVISION
       ↓
EVALUATION
       ↓
CANDIDATE
       ↓
PROMOTION
```

Sempre preservando:

```text
baseline
rollback
lineage
evidence
```

---

# 36. Meta 33 — Runtime Self-Evolution

O próprio EvolveLoop passa a ser objeto de observação:

```text
EVOLVELOOP
   ↓
OBSERVE
   ↓
FIND BOTTLENECK
   ↓
PROPOSE CHANGE
   ↓
CREATE BRANCH
   ↓
IMPLEMENT
   ↓
TEST
   ↓
RED TEAM
   ↓
BENCHMARK
   ↓
COMPARE BASELINE
   ↓
PROMOTE
```

O runtime só pode evoluir mediante processo controlado e verificável.

---

# 37. Meta 34 — Human as Policy, not Operator

O usuário não deve precisar conduzir:

```text
faça isso
agora isso
agora teste
agora corrija
agora commit
```

O modelo desejado é:

```text
USER
 ├── GOAL
 ├── CONSTRAINTS
 ├── AUTHORITY
 ├── BUDGET
 └── RISK POLICY
       ↓
   EVOLVELOOP
       ↓
     OUTCOME
```

Intervenção ocorre apenas quando:

```text
HUMAN_GATE_REQUIRED
```

---

# 38. Meta 35 — External World Autonomy

A V3 deve poder operar, quando autorizado:

```text
filesystem
terminal
browser
APIs
Git
cloud
databases
services
communication
```

Sempre pelo mesmo modelo:

```text
Intent
→ Capability
→ Policy
→ Runtime
→ Provider
→ Evidence
```

A arquitetura deve continuar suficientemente geral para transcender coding.

---

# 39. Meta 36 — Zero Silent Failure

Nenhuma falha pode virar sucesso silenciosamente.

Estados explícitos:

```text
SUCCESS
FAILURE
BLOCKED
UNCERTAIN
PARTIAL
DEGRADED
```

Nunca:

```text
unknown
→ PASS
```

Sem evidência, o resultado não pode ser apresentado como sucesso comprovado.

---

# 40. Meta 37 — Benchmark de Autonomia

A V3 precisa de benchmark específico de autonomia:

```text
A — Planning
B — Research
C — Coding
D — Debugging
E — Recovery
F — Long Horizon
G — Security
H — Multi-Agent
I — Provider Routing
J — Self-Verification
K — Self-Evolution
L — External World
M — Unknown Task
N — Adversarial Task
O — Novel Task
```

O benchmark deve separar:

```text
deterministic
live controlled
live real-world
```

e nunca esconder o que não foi medido.

---

# 41. O Teste Supremo

A validação mais importante da V3 não deve ser um fixture conhecido.

Deve ser:

> **um problema que os desenvolvedores do EvolveLoop não programaram especificamente para o benchmark.**

O agente deve ter que:

```text
UNDERSTAND
→ RESEARCH
→ DISCOVER CAPABILITIES
→ PLAN
→ EXECUTE
→ TEST
→ FAIL
→ DIAGNOSE
→ CHANGE STRATEGY
→ VERIFY
→ DELIVER
```

Se o sistema só funciona quando existe um caminho hardcoded, não alcançou a meta de generalidade.

---

# 42. Doutrina de Engenharia

A V3 não será construída para simplesmente “funcionar”.

## Regra 1 — Implemented ≠ Done

Uma capacidade importante deve possuir, conforme o risco:

```text
DESIGN
CONTRACT
IMPLEMENTATION
UNIT TESTS
INTEGRATION TESTS
E2E TESTS
ADVERSARIAL TESTS
CHAOS / FAILURE TESTS
LIVE VALIDATION
BENCHMARK
EVIDENCE
REGRESSION
```

---

## Regra 2 — Não usar apenas happy paths

Para componentes importantes testar:

```text
normal
failure
timeout
crash
corruption
stale state
concurrency
replay
duplication
malformed input
hostile input
partial execution
provider unavailable
network unavailable
context loss
resource exhaustion
```

A pergunta não é apenas:

> “Funciona?”

É:

> **“Como isso quebra?”**

E depois:

> **“O que acontece quando quebra no pior momento possível?”**

---

## Regra 3 — Evidence > Claim

O agente não é a prova de seu próprio sucesso.

Preferência:

```text
Agent says X
→ claim

Provider says X
→ claim

System observes X
→ candidate evidence

Independent verification confirms X
→ strong evidence
```

---

## Regra 4 — Mocks não provam autonomia real

Mocks continuam permitidos para:

- unit tests;
- fault injection;
- determinismo;
- isolamento.

Mas:

```text
MOCK PASS
≠
AUTONOMY PASS
```

Resultados devem distinguir:

```text
DETERMINISTIC
LIVE CONTROLLED
LIVE REAL-WORLD
```

---

## Regra 5 — Self-Evolution é governada

Toda evolução importante deve preservar:

```text
baseline
branch / isolation
test
red-team
benchmark
independent verification
promotion policy
rollback
lineage
```

---

## Regra 6 — Sandbox real

Não aceitar:

```text
path restriction
=
sandbox
```

Sandbox só conta como implementado quando houver isolamento efetivo compatível com o risco.

---

## Regra 7 — Unknown Task

Parte do benchmark deve conter:

```text
unknown
novel
adversarial
open-ended
composed
```

O agente não pode depender apenas de workflows explicitamente preparados pelos desenvolvedores.

---

# 43. Régua de Maturidade

A maturidade de uma capacidade pode ser descrita por níveis:

```text
L0 — Concept
L1 — Contract
L2 — Deterministic
L3 — Integrated
L4 — Adversarial
L5 — Live Controlled
L6 — Long-Horizon
L7 — Novel Task
L8 — Self-Optimizing
```

Capacidades críticas devem atingir níveis mais altos.

Exemplo conceitual:

```text
Sandbox
→ L6+

General Goal Execution
→ L7

Self-Evolution
→ L7/L8

Simple utility
→ L4+
```

A régua não substitui critérios específicos de segurança ou qualidade.

---

# 44. V3 Core Readiness

Uma capacidade não deve entrar no V3 Core apenas porque:

```text
compila
```

ou:

```text
os testes unitários passam
```

Ela precisa atingir o nível de evidência apropriado para sua criticidade.

Perguntas mínimas:

```text
What improved?
By how much?
On which tasks?
Under which conditions?
At what cost?
What regressed?
What became slower?
What became less reliable?
What new attack surface appeared?
```

---

# 45. Estrutura Global da V3

```text
                         EVOLVELOOP V3

                         GENERAL AGENT
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
   AUTONOMY               INTELLIGENCE               SAFETY
       │                       │                       │
       │                       │                       │
 Goal Management           Research                 Sandbox
 Long Horizon              World Model              Least Authority
 Dynamic Planning          Memory                   Secrets
 Recovery                  Uncertainty              Verification
 Self-Debug                Context                  Adversarial
 Stopping                  Routing                  Isolation
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                        SELF-EVOLUTION
                               │
                 ┌─────────────┼─────────────┐
                 ↓             ↓             ↓
             Capability      Agent         Runtime
             Evolution      Evolution     Evolution
                 │             │             │
                 └─────────────┼─────────────┘
                               ↓
                     CONTROLLED PROMOTION
                               ↓
                           MONITORING
                               ↓
                           ROLLBACK
```

---

# 46. Definição Final da V3

> **EvolveLoop V3 receives a goal, determines what success means, discovers how to achieve it, acquires missing knowledge or capabilities, plans and executes over arbitrary horizons, observes and reconciles with the real world, verifies its own work, recovers from failure, adapts strategy, learns from experience, and evolves its own capabilities and infrastructure under policy, evidence, verification, and rollback constraints.**

Em português:

> **O EvolveLoop V3 recebe um objetivo, determina o que significa ter sucesso, descobre como alcançá-lo, adquire conhecimento ou capabilities ausentes, planeja e executa por horizontes arbitrários, observa e reconcilia o mundo real, verifica o próprio trabalho, recupera-se de falhas, adapta sua estratégia, aprende com a experiência e evolui suas próprias capabilities e infraestrutura sob restrições de policy, evidência, verificação e rollback.**

---

# 47. Frase de Engenharia da V3

> **Não queremos um sistema que simplesmente funciona. Queremos um sistema que continua funcionando quando as condições deixam de ser favoráveis.**

E:

> **V3 não é V2 + mais features. V3 é o fechamento do loop completo de autonomia.**

---

# 48. Autonomy Substrate — Agência Permanente

O loop de resolução de objetivos não deve ser o único mecanismo de autonomia da V3.

A V3 deve possuir uma camada superior de **agência persistente**, capaz de permanecer operacional mesmo quando não está executando uma tarefa específica.

```text
EVOLVELOOP
   │
   ├── alive
   ├── aware
   ├── waiting
   ├── working
   ├── observing
   └── learning
```

A execução termina.

A agência permanece.

---

# 49. Meta 38 — Persistent Agency

O modelo de operação evolui de:

```text
USER
 ↓
TASK
 ↓
AGENT
 ↓
DONE
```

para:

```text
EVOLVELOOP
   ↓
observe
   ↓
assess
   ↓
act
   ↓
learn
   ↓
wait
   ↓
observe again
```

A V3 deve poder permanecer em estado de espera e acordar quando uma condição relevante ocorrer.

---

# 50. Meta 39 — Goal Portfolio

O agente não deve possuir apenas um objetivo atual.

Deve ser capaz de manter um portfólio de objetivos:

```text
GOAL PORTFOLIO

G1 — critical
G2 — important
G3 — maintenance
G4 — research
G5 — long-term
G6 — opportunistic
```

Cada objetivo pode possuir:

```text
priority
deadline
budget
risk
dependencies
progress
success criteria
status
```

O agente deve conseguir decidir qual objetivo merece recursos em cada momento.

---

# 51. Meta 40 — Event-Driven Autonomy

O agente deve poder despertar por eventos relevantes, não apenas por prompts humanos.

Exemplos:

```text
file changed
build failed
deployment changed
server unavailable
new message
new email
calendar event
API event
Git event
timer
deadline
monitor alert
new information
external state change
```

Modelo:

```text
EVENT
 ↓
INTERPRET
 ↓
IS THIS RELEVANT?
 ↓
UPDATE WORLD MODEL
 ↓
CREATE / MODIFY GOAL
 ↓
ACT
```

Eventos não devem automaticamente virar ações. Devem passar pelo mesmo sistema de relevância, policy, autoridade e risco.

---

# 52. Meta 41 — Proactive Opportunity Detection

O agente deve ser capaz de detectar oportunidades e problemas que não foram explicitamente solicitados.

Exemplos:

```text
optimization opportunity
maintenance opportunity
automation opportunity
security issue
stale dependency
repeated manual task
performance degradation
missing test
knowledge gap
```

Loop:

```text
OBSERVE
 ↓
OPPORTUNITY DETECTED
 ↓
VALUE / RISK ASSESSMENT
 ↓
CREATE CANDIDATE GOAL
 ↓
POLICY
 ↓
ACT
```

A criação autônoma de objetivos deve obedecer à autoridade concedida ao agente.

---

# 53. Meta 42 — Standing Goals

A V3 deve suportar objetivos persistentes que não possuem um ponto único de conclusão.

Exemplo:

> “Mantenha este serviço saudável.”

Modelo:

```text
GOAL = MAINTAIN DESIRED STATE

CURRENT STATE
      ↓
DESIRED STATE
      ↓
DRIFT?
   ┌──┴──┐
  NO    YES
  │      │
WAIT    ACT
```

Isso transforma manutenção contínua em uma propriedade nativa do agente.

---

# 54. Meta 43 — Desired-State Autonomy

O agente deve conseguir administrar:

```text
DESIRED STATE
      vs
ACTUAL STATE
```

Exemplo:

```text
service online
tests green
backup recent
disk below threshold
security baseline valid
```

Se houver drift:

```text
DRIFT
 ↓
DIAGNOSE
 ↓
PLAN
 ↓
ACT
 ↓
VERIFY
```

Isso é uma aplicação contínua de World Model + Reconciliation.

---

# 55. Meta 44 — Autonomy Governor

Autonomia total exige um mecanismo que determine **como** uma ação pode ser executada de acordo com risco e autoridade.

```text
AUTONOMY GOVERNOR

risk
reversibility
authority
confidence
impact
cost
environment
      ↓
AUTONOMOUS
AUTONOMOUS_WITH_REVIEW
HUMAN_GATE
BLOCK
```

O Governor não substitui Policy Engine.

Ele ajuda a determinar o nível operacional permitido dentro da policy.

Maior autonomia não significa menor controle. Significa maior capacidade dentro de limites formalmente definidos.

---

# 56. Meta 45 — Capability Fabric

Capability Discovery deve evoluir para uma camada de composição de capacidades.

```text
NEED
 ↓
DISCOVER
 ↓
COMPOSE
 ↓
ADAPT
 ↓
AUTHORIZE
 ↓
EXECUTE
```

Uma tarefa pode ser resolvida pela composição de capabilities existentes mesmo que não exista uma capability única correspondente à tarefa.

---

# 57. Meta 46 — Capability Acquisition

Quando nenhuma combinação existente resolver o problema:

```text
NEED
 ↓
NO CAPABILITY
 ↓
CAN COMPOSE?
 ↓ NO
CAN ACQUIRE?
 ↓
DISCOVER / INSTALL / BUILD
 ↓
SANDBOX
 ↓
VALIDATE
 ↓
REGISTER
 ↓
USE
```

Qualquer capability adquirida deve passar por autoridade, segurança, validação e evidência.

---

# 58. Meta 47 — Autonomous Environment Bootstrap

O agente deve conseguir inspecionar um ambiente novo e descobrir o que falta para realizar seu objetivo:

```text
INSPECT ENVIRONMENT
 ↓
DETECT MISSING DEPENDENCY
 ↓
SELECT SOURCE / PROVIDER
 ↓
INSTALL IN CONTROLLED ENVIRONMENT
 ↓
VALIDATE
 ↓
CONTINUE
```

Isso pode incluir runtime, biblioteca, ferramenta, CLI, serviço, configuração e capability.

---

# 59. Meta 48 — Self-Maintenance

O próprio EvolveLoop deve ser capaz de observar sua saúde operacional:

```text
HEALTH
 ↓
DETECT DEGRADATION
 ↓
DIAGNOSE
 ↓
REPAIR
 ↓
VALIDATE
```

Aplicável a:

```text
workers
queues
providers
storage
indexes
knowledge stores
local services
checkpoints
runtime components
```

Problemas recuperáveis não devem exigir intervenção humana por padrão.

---

# 60. Meta 49 — Autonomous Scheduling

O agente deve conseguir decidir quando executar objetivos:

```text
GOAL
 ↓
DEADLINE
 ↓
DEPENDENCIES
 ↓
RESOURCE AVAILABILITY
 ↓
PRIORITY
 ↓
SCHEDULE
```

O scheduler deve poder reajustar a agenda quando prioridades, recursos, deadlines, eventos ou estratégias mudarem.

---

# 61. Meta 50 — Interrupt / Preemption

A V3 deve suportar mudança de prioridade sem destruir estado:

```text
GOAL A RUNNING
      ↓
CRITICAL EVENT
      ↓
PAUSE A
      ↓
HANDLE B
      ↓
RESUME A
```

Precisamos de semântica robusta para:

```text
pause
resume
cancel
preempt
reprioritize
```

com preservação de estado, policy, lineage e evidência.

---

# 62. Meta 51 — Multi-Context Agency

Um agente residente pode trabalhar em múltiplos contextos:

```text
Project A
Project B
Server C
Research D
Automation E
```

A troca de contexto deve preservar separação de:

```text
memory
authority
secrets
world state
goals
evidence
policy
```

Um contexto nunca deve vazar inadvertidamente para outro.

---

# 63. Meta 52 — Full System Presence

A arquitetura de agência deve ser capaz de integrar, quando autorizado:

```text
filesystem
terminal
browser
desktop
clipboard
notifications
audio
microphone
camera
display
network
USB
OS services
```

Não significa habilitar tudo por padrão. Significa possuir uma arquitetura capaz de adquirir e utilizar essas interfaces quando capability, authority, policy e environment permitirem.

---

# 64. Meta 53 — Human Interaction Layer

A comunicação com o usuário deve evoluir de simples prompt/resposta para estado operacional contínuo.

Exemplos:

```text
I started X.
I detected Y.
I need clarification on Z.
I completed X.
I encountered a policy gate.
I changed strategy because A failed.
```

O agente deve comunicar eventos importantes sem exigir intervenção desnecessária.

---

# 65. Meta 54 — External Agent Identity

Para operar no mundo externo, o agente precisa de identidade operacional própria:

```text
AGENT IDENTITY
 ↓
SCOPED CREDENTIALS
 ↓
CAPABILITY ACCESS
```

A identidade deve poder ser identificada, auditada, limitada, revogada e rotacionada, e suas ações devem ser associadas a evidências.

---

# 66. Meta 55 — Secret Lifecycle

Segurança de secrets deve incluir ciclo de vida:

```text
REQUEST
 ↓
AUTHORIZE
 ↓
LEASE CREDENTIAL
 ↓
USE
 ↓
EXPIRE / REVOKE
```

O acesso deve ser temporário e limitado quando possível.

---

# 67. Meta 56 — Autonomous Communication

Quando autorizado, o agente deve poder operar:

```text
email
messaging
notifications
webhooks
tickets
GitHub
calendar
```

Sempre:

```text
INTENT
→ POLICY
→ CAPABILITY
→ RUNTIME
→ PROVIDER
→ EVIDENCE
```

A habilidade de comunicação não significa autorização automática para enviar qualquer mensagem.

---

# 68. Meta 57 — Economic Agency

Além de acompanhar custos, o agente deve administrar o uso econômico dos recursos:

```text
BUDGET
 ↓
RESOURCE OPTIONS
 ↓
STRATEGY
 ↓
SPEND
 ↓
MEASURE OUTCOME
```

A pergunta operacional passa a ser:

> “Vale gastar este recurso adicional para melhorar ou acelerar o resultado?”

---

# 69. Meta 58 — Autonomous Experimentation

O agente deve poder conduzir experimentos controlados:

```text
HYPOTHESIS
 ↓
EXPERIMENT
 ↓
OBSERVATION
 ↓
RESULT
 ↓
UPDATE BELIEF
```

Aplicações:

- estratégias;
- prompts;
- providers;
- routing;
- workflows;
- capabilities;
- configurações;
- otimizações.

Experimentos devem ocorrer em ambientes adequados ao risco.

---

# 70. Meta 59 — Strategy Portfolio

O agente não deve ser obrigado a manter uma única estratégia.

Pode manter:

```text
Strategy A
Strategy B
Strategy C
```

e selecionar com base em:

```text
historical evidence
current state
risk
cost
deadline
capability availability
```

Estratégias alternativas podem permanecer em reserva para recuperação.

---

# 71. Meta 60 — Counterfactual Reasoning

Para decisões relevantes:

```text
What if I do A?
What if I do B?
What if I wait?
What if A fails?
```

Modelo:

```text
ACTION CANDIDATES
 ↓
COUNTERFACTUAL SIMULATION
 ↓
EXPECTED OUTCOMES
 ↓
RISK / COST
 ↓
CHOOSE
```

Não substitui observação real, mas melhora decisões antes da execução.

---

# 72. Meta 61 — Failure Containment

Uma falha localizada não deve necessariamente derrubar todo o agente.

Domínios de falha relevantes:

```text
capability
provider
agent
project
workspace
system
```

A propagação de falhas deve ser controlada.

---

# 73. Meta 62 — Autonomous Recovery Hierarchy

A recuperação deve escalar progressivamente:

```text
MICRO RECOVERY
 ↓
LOCAL REPAIR
 ↓
CAPABILITY REPLACEMENT
 ↓
PROVIDER REPLACEMENT
 ↓
STRATEGY CHANGE
 ↓
TASK REPLANNING
 ↓
GOAL REPRIORITIZATION
 ↓
HUMAN GATE
```

O agente deve usar a menor intervenção necessária para recuperar progresso seguro.

---

# 74. Meta 63 — Self-Observation

Telemetry não deve ser apenas um registro passivo.

O agente deve observar seu próprio comportamento operacional:

```text
loops
indecision
repetition
regression
cost growth
context overload
memory degradation
tool thrashing
excessive retries
```

Quando detectar degradação:

```text
SELF-OBSERVE
 ↓
DETECT
 ↓
DIAGNOSE
 ↓
CHANGE STRATEGY
```

---

# 75. Meta 64 — Anti-Loop / Anti-Stagnation

O sistema deve detectar:

```text
same action repeatedly
same hypothesis repeatedly
same failure repeatedly
no state progress
oscillation
thrashing
```

Então:

```text
STAGNATION
 ↓
CHANGE ABSTRACTION
 ↓
CHANGE STRATEGY
 ↓
RESEARCH
 ↓
REPLAN
```

O agente não deve ficar indefinidamente preso em decisões localmente plausíveis que não geram progresso global.

---

# 76. Meta 65 — Goal Conflict Resolution

Quando múltiplos objetivos entrarem em conflito:

```text
performance
cost
deadline
security
quality
```

o sistema deve executar:

```text
OBJECTIVE CONFLICT
 ↓
TRADE-OFF ANALYSIS
 ↓
CONSTRAINT PRECEDENCE
 ↓
DECISION
```

Hierarquias de constraints devem ser explícitas e governadas.

---

# 77. Meta 66 — Agency Across Time

A V3 deve suportar:

```text
exist
 ↓
observe
 ↓
form goals
 ↓
act
 ↓
learn
 ↓
wait
 ↓
observe
 ↓
act again
```

Isso é diferente de um task agent:

```text
receive
→ execute
→ finish
```

A agência deve persistir entre execuções.

---

# 78. Meta 67 — Autonomous Goal Formation

No nível mais avançado, o agente poderá detectar problemas e oportunidades no ambiente:

```text
WORLD
 ↓
OBSERVATION
 ↓
OPPORTUNITY / PROBLEM
 ↓
GOAL CANDIDATE
 ↓
VALUE
 ↓
POLICY
 ↓
ADOPT GOAL
```

A autonomia de formação de objetivos deve sempre ficar limitada pela autoridade concedida.

O agente pode descobrir objetivos.

A policy decide se ele pode adotá-los.

---

# 79. Autonomia Total — Dez Dimensões

A autonomia total da V3 será definida por dez dimensões:

```text
01 — Cognitive
     entende, raciocina e pesquisa

02 — Goal
     define, mantém, prioriza e encerra objetivos

03 — Temporal
     trabalha agora, depois e continuamente

04 — Operational
     executa ações no mundo

05 — Environmental
     percebe e reage a mudanças externas

06 — Tool
     descobre, compõe e adquire capabilities

07 — Social
     comunica, delega e negocia

08 — Economic
     administra recursos, custo e budget

09 — Self
     diagnostica, repara e mantém a si próprio

10 — Evolutionary
     melhora capabilities, agentes e runtime
```

A autonomia somente será considerada ampla quando as dez dimensões tiverem cobertura apropriada.

---

# 80. Definição Operacional de Autonomia Total

> **O EvolveLoop é totalmente autônomo quando consegue manter seus próprios objetivos operacionais, perceber mudanças relevantes no ambiente, decidir quando e como agir, adquirir as capacidades necessárias, executar ações no mundo, verificar seus efeitos, recuperar-se de falhas, administrar recursos, aprender com a experiência, manter-se operacional e continuar trabalhando ao longo do tempo — sem precisar que um humano conduza o fluxo normal.**

O humano fornece:

```text
authority boundary
constraints
risk policy
budget
```

O EvolveLoop fornece:

```text
agency
reasoning
execution
adaptation
verification
learning
evolution
```

---

# 81. Modelo Final — EvolveLoop como Autonomous Agent Operating System

A definição arquitetural máxima da V3:

```text
                     EVOLVELOOP
                          │
             ┌────────────┴────────────┐
             │                         │
        AUTONOMY CORE             SAFETY CORE
             │                         │
     ┌───────┼────────┐        ┌───────┼────────┐
     │       │        │        │       │        │
   Goals   World    Agency   Policy  Sandbox Identity
     │       │        │        │       │        │
     └───────┼────────┘        └───────┼────────┘
             │                         │
             └────────────┬────────────┘
                          │
                   CAPABILITY FABRIC
                          │
       ┌──────────────────┼──────────────────┐
       │         │        │        │         │
    browser   terminal    OS       API      cloud
       │         │        │        │         │
       └──────────────────┼──────────────────┘
                          │
                  MEMORY / EXPERIENCE
                          │
                   SELF-EVOLUTION
                          │
                   CONTINUOUS AGENT
```

A arquitetura V3 deve continuar sendo construída sobre as fronteiras estabelecidas na V2:

```text
Intent
→ Capability
→ Policy
→ Runtime
→ Provider
→ Evidence
```

A agência pode crescer acima dessas fronteiras sem eliminar seus controles.

---

# 82. V3 = Autonomous Agent, não apenas Autonomous Workflow

A diferença final:

```text
TASK AGENT

receive
 ↓
execute
 ↓
finish
```

versus:

```text
AUTONOMOUS AGENT

exist
 ↓
observe
 ↓
understand
 ↓
form / receive goals
 ↓
research
 ↓
plan
 ↓
execute
 ↓
verify
 ↓
recover
 ↓
learn
 ↓
evolve
 ↓
wait
 ↓
observe again
```

A V3 deve buscar o segundo modelo.

---

# 83. Critério Final de Autonomia

Não declarar autonomia total porque:

```text
1000 tests passed
```

ou porque:

```text
one complex demo worked
```

A declaração precisa considerar:

```text
goal autonomy
+
temporal autonomy
+
world interaction
+
self-recovery
+
capability discovery
+
memory
+
uncertainty
+
self-verification
+
security
+
self-maintenance
+
self-evolution
+
novel-task performance
```

E precisa incluir evidência em condições adversas.

---

# 84. Frase Final da V3

> **Não queremos um agente que sabe executar instruções. Queremos um agente que sabe existir, compreender objetivos, agir sobre o mundo, aprender com o que acontece e continuar operando sem precisar de um operador.**

E:

> **Autonomia total não significa ausência de limites. Significa que, dentro de limites explícitos, o agente não precisa de alguém segurando sua mão.**


---

# 85. Superpowers — Princípio

As metas de autonomia da V3 exigem mais do que um loop de decisão.

O EvolveLoop deve possuir um conjunto amplo de capabilities que formem o **corpo operacional do agente**.

Princípio:

> **As ferramentas não formam o loop. Elas formam o corpo do agente.**

O loop decide **o que precisa ser feito**.

A Capability Fabric decide **com o que fazer**.

O agente deve começar com capabilities fundamentais e adquirir/ativar capacidades adicionais conforme:

```text
need
+
relevance
+
authority
+
risk
+
availability
+
cost
```

---

# 86. Superpower Domain 01 — System / OS Control

O agente deve ser capaz de operar o sistema operacional quando autorizado:

```text
process control
service management
environment variables
filesystem
permissions
users/groups
mounts
network interfaces
devices
desktop/session
power
resource limits
```

Capabilities conceituais:

```text
process.start
process.stop
process.inspect
process.signal

service.start
service.stop
service.restart
service.health

system.inspect
system.resource_snapshot
system.environment
```

Controle de sistema deve respeitar least authority e sandbox.

---

# 87. Superpower Domain 02 — Computer Use

O agente deve poder enxergar e operar interfaces gráficas:

```text
screen.capture
screen.observe
mouse.move
mouse.click
keyboard.type
keyboard.hotkey
window.list
window.focus
window.resize
clipboard.read
clipboard.write
```

Com suporte, quando disponível, a:

```text
visual perception
OCR
UI element detection
screen understanding
```

O objetivo é permitir operação de software que não possua API adequada.

---

# 88. Superpower Domain 03 — Browser

O browser deve ser tratado como uma capability fabric:

```text
navigate
click
type
select
scroll
upload
download
open_tab
close_tab
switch_tab
inspect_dom
inspect_network
inspect_console
inspect_storage
take_screenshot
record_video
```

Capacidades avançadas:

```text
network interception
request replay
HAR capture
cookie/session inspection
performance tracing
accessibility tree
```

---

# 89. Superpower Domain 04 — Code Intelligence

Não depender apenas de leitura textual.

Capabilities:

```text
AST parsing
symbol indexing
call graph
dependency graph
LSP
type information
semantic search
reference analysis
rename
refactor
dead-code detection
architecture analysis
```

Exemplos:

```text
code.find_symbol
code.find_references
code.trace_dependency
code.refactor
code.analyze
code.compare
code.extract
```

---

# 90. Superpower Domain 05 — Debugger

O agente deve possuir acesso, quando suportado pelo ambiente, a:

```text
breakpoint
step
stack
locals
watch
memory
thread
exception
trace
```

Capabilities:

```text
debugger.attach
debugger.inspect
debugger.replay
debugger.break_on_exception
debugger.trace
```

---

# 91. Superpower Domain 06 — Profiler

Capabilities de diagnóstico de desempenho:

```text
CPU profiler
memory profiler
I/O profiler
network profiler
GPU profiler
flamegraph
allocation analysis
```

Loop:

```text
observe
→ profile
→ identify bottleneck
→ experiment
→ repair
→ profile again
```

---

# 92. Superpower Domain 07 — Fuzzing / Adversarial Execution

Capabilities:

```text
fuzzer
property testing
mutation testing
fault injection
stress testing
load testing
race detection
chaos testing
```

O agente deve poder gerar ataques e perturbações contra sua própria solução dentro de ambientes autorizados.

---

# 93. Superpower Domain 08 — Security Toolkit

Além do Security Review, fornecer:

```text
dependency audit
secret scan
SAST
DAST
permission audit
configuration audit
container scan
network scan
TLS inspection
endpoint enumeration
auth boundary testing
input fuzzing
```

Exemplos:

```text
security.recon
security.scan
security.attack
security.verify
security.report
```

Tudo sujeito a policy, authority e sandbox.

---

# 94. Superpower Domain 09 — Network

O agente deve ser capaz de compreender e diagnosticar redes:

```text
DNS
HTTP
TCP
UDP
TLS
routing
ports
sockets
interfaces
network namespaces
```

Capabilities:

```text
network.inspect
network.resolve
network.connect
network.capture
network.replay
network.trace
```

Também podem existir experiências controladas de:

```text
HTTP replay
request mutation
latency injection
packet loss simulation
```

---

# 95. Superpower Domain 10 — Database Intelligence

Não apenas executar SQL.

Capabilities:

```text
schema introspection
relationship discovery
query planning
index analysis
migration analysis
data profiling
consistency checks
backup/restore
```

Exemplos:

```text
db.inspect
db.explain
db.query
db.validate
db.migrate
db.backup
db.restore
```

---

# 96. Superpower Domain 11 — Environment / Dependency Management

O agente deve conseguir construir ambientes controlados:

```text
runtime detection
dependency resolution
package installation
version pinning
virtualenv
container
VM
toolchain setup
```

Modelo:

```text
task requires X
 ↓
environment inspection
 ↓
X missing
 ↓
create isolated environment
 ↓
install
 ↓
verify
 ↓
continue
```

---

# 97. Superpower Domain 12 — Container / VM / Sandbox Fabric

Sandbox não deve ser um mecanismo único.

A V3 deve poder possuir vários tipos de ambiente:

```text
workspace
container
microVM
VM
network namespace
ephemeral environment
persistent isolated environment
```

O nível de isolamento deve ser escolhido conforme:

```text
risk
reversibility
authority
required capability
```

---

# 98. Superpower Domain 13 — Git / Repository

Capabilities:

```text
clone
branch
commit
diff
merge
rebase
cherry-pick
bisect
tag
stash
worktree
push
pull
```

E abstrações de alto nível:

```text
repo.inspect
repo.compare
repo.bisect
repo.recover
repo.create_patch
```

`git bisect` deve ser considerado uma capability relevante para self-debugging.

---

# 99. Superpower Domain 14 — Issue / Project Management

O agente deve conseguir organizar trabalho persistente:

```text
issue.create
issue.update
issue.close
issue.link
milestone.create
project.update
```

Isso permite gestão operacional além da modificação de código.

---

# 100. Superpower Domain 15 — Observability

O agente precisa enxergar sistemas vivos:

```text
logs
metrics
traces
events
health
alerts
profiles
```

Capabilities:

```text
observe.logs
observe.metrics
observe.traces
observe.health
observe.events
```

---

# 101. Superpower Domain 16 — Research / Web Intelligence

Capabilities:

```text
web.search
web.open
web.extract
web.compare
web.archive
web.monitor
```

Com metadados de:

```text
source reliability
source freshness
cross-source comparison
citation/provenance
```

---

# 102. Superpower Domain 17 — Documents / Knowledge

O agente deve conseguir trabalhar com:

```text
markdown
PDF
DOCX
CSV
JSON
XML
spreadsheets
images
audio
video
archives
```

Capabilities:

```text
document.read
document.write
document.transform
document.extract
document.compare
document.summarize
```

---

# 103. Superpower Domain 18 — Vision

Capacidades:

```text
image understand
image compare
image segment
image inspect
image generate
image edit
OCR
diagram understanding
visual diff
```

Vision deve poder alimentar o World Model.

---

# 104. Superpower Domain 19 — Audio

Capacidades:

```text
microphone
speech-to-text
text-to-speech
audio analysis
sound classification
voice commands
```

Modelo:

```text
voice
→ intent
→ agent
```

e:

```text
agent
→ speech
```

---

# 105. Superpower Domain 20 — Video

Capacidades:

```text
video.capture
video.inspect
video.extract_frames
video.compare
video.analyze
```

Aplicações:

```text
UI testing
process observation
demonstration analysis
visual debugging
behavior analysis
```

---

# 106. Superpower Domain 21 — Remote Machine Control

O agente deve poder operar máquinas remotas quando autorizado:

```text
SSH
remote shell
remote filesystem
remote process
remote logs
remote deployment
remote health
```

Modelo:

```text
Agent
 ↓
Remote Target
 ↓
Capability
 ↓
Policy
```

---

# 107. Superpower Domain 22 — Cloud / Infrastructure

Capacidades:

```text
VM
container
DNS
storage
database
network
secrets
deployment
monitoring
```

E, quando autorizado:

```text
provision
deploy
scale
rollback
destroy
```

---

# 108. Superpower Domain 23 — Deployment / Release

Pipeline:

```text
build
 ↓
test
 ↓
scan
 ↓
stage
 ↓
deploy
 ↓
health-check
 ↓
observe
 ↓
verify
 ↓
promote
```

Capabilities:

```text
release.build
release.package
release.deploy
release.health
release.rollback
```

---

# 109. Superpower Domain 24 — Communication

O agente deve poder lidar com:

```text
email
messaging
webhooks
notifications
tickets
calendar
```

Separar granularmente:

```text
message.draft
message.send
message.reply
```

Redigir e enviar são níveis de autoridade diferentes.

---

# 110. Superpower Domain 25 — Scheduling / Time

Capabilities:

```text
timer
delay
schedule
event subscription
wake
sleep
```

Isso permite agência contínua orientada a eventos.

---

# 111. Superpower Domain 26 — Backup / Disaster Recovery

Capacidades:

```text
snapshot
backup
restore
checkpoint
rollback
clone
```

O agente pode preparar pontos de retorno antes de operações de risco.

---

# 112. Superpower Domain 27 — Data Science / Computation

Capabilities:

```text
Python
R
notebooks
numerical computation
statistics
visualization
optimization
simulation
```

Exemplos:

```text
compute.run
compute.compare
compute.simulate
compute.optimize
```

---

# 113. Superpower Domain 28 — Symbolic / Formal Reasoning

Capacidades:

```text
constraint solving
SAT/SMT
symbolic execution
formal verification
proof checking
model checking
```

O objetivo é permitir que o agente substitua confiança por prova quando apropriado.

---

# 114. Superpower Domain 29 — Simulation Engines

Antes de alterar o mundo:

```text
simulate
observe
compare
```

Aplicável a:

```text
network
software
database
scheduling
resource allocation
robotics
infrastructure
```

---

# 115. Superpower Domain 30 — Universal Search

Capability transversal:

```text
universal.search
```

Fontes possíveis:

```text
filesystem
repo
knowledge
logs
database
browser
memory
history
```

O agente não precisa saber previamente onde uma informação reside.

---

# 116. Superpower Domain 31 — Universal Diff

Capability:

```text
diff.files
diff.directories
diff.database
diff.config
diff.environment
diff.world
diff.screenshots
diff.behavior
```

O agente deve conseguir comparar estados e comportamentos de forma uniforme.

---

# 117. Superpower Domain 32 — Reproduction Capsule

Para falhas importantes:

```text
FAILURE
 ↓
CAPTURE ENVIRONMENT
 ↓
CAPTURE INPUT
 ↓
CAPTURE STATE
 ↓
CAPTURE DEPENDENCIES
 ↓
REPRODUCTION CAPSULE
```

Depois:

```text
capsule.replay
```

O agente consegue reproduzir o cenário em isolamento.

---

# 118. Superpower Domain 33 — Time Travel

Quando suportado pelo ambiente:

```text
snapshot
restore
replay
checkpoint
```

Modelo:

```text
state T0
→ action
→ state T1
→ action
→ state T2

restore T1
→ experiment B
```

---

# 119. Superpower Domain 34 — Self-Test Laboratory

A V3 deve possuir um conceito de laboratório interno para experimentação:

```text
sandbox
fixture
mock external system
fault injection
benchmark
attack environment
```

Modelo:

```text
"Será que isso funciona?"
        ↓
create experiment
        ↓
run
        ↓
observe
        ↓
compare
        ↓
destroy
```

---

# 120. Superpower Domain 35 — Capability Composition Compiler

A Capability Fabric deve conseguir compilar uma necessidade em uma composição:

```text
GOAL
 ↓
CAPABILITY GRAPH
```

Exemplo:

```text
browser.open
     ↓
vision.inspect
     ↓
extract.data
     ↓
transform.data
     ↓
database.write
     ↓
verify
```

Isso transforma capability composition em uma forma de planejamento executável.

---

# 121. Superpower Domain 36 — Capability Creation

Uma capability particularmente importante é:

```text
capability.create
```

Modelo:

```text
NEED
 ↓
DISCOVER
 ↓
COMPOSE?
 ↓ NO
DESIGN CAPABILITY
 ↓
IMPLEMENT
 ↓
TEST
 ↓
SECURITY REVIEW
 ↓
SANDBOX
 ↓
BENCHMARK
 ↓
REGISTER
```

A nova capability só se torna utilizável depois dos gates apropriados.

---

# 122. Superpower Activation Policy

As capabilities não devem ser todas expostas simultaneamente.

Modelo:

```text
AGENT
 ↓
NEED
 ↓
CAPABILITY DISCOVERY
 ↓
FILTER BY
    authority
    environment
    risk
    relevance
    cost
    reputation
 ↓
LOAD CAPABILITY
 ↓
EXECUTE
```

O agente deve adquirir **superpoderes sob demanda**, e não receber um catálogo irrestrito em cada contexto.

---

# 123. Meta 68 — Value of Information Engine

Antes de pesquisar, testar ou perguntar:

```text
"Quanto vale descobrir isso?"
```

Avaliar:

```text
uncertainty
×
decision impact
×
cost of information
```

Objetivo:

```text
informação barata + decisão crítica
→ pesquisar

informação cara + decisão irreversível
→ pesquisar profundamente

informação cara + decisão reversível
→ talvez agir
```

O objetivo é maximizar informação útil sem desperdiçar recursos.

---

# 124. Meta 69 — Active Perception

O agente deve escolher o que observar para reduzir incerteza.

Modelo:

```text
UNKNOWN
 ↓
SELECT BEST OBSERVATION
 ↓
OBSERVE
 ↓
UPDATE WORLD MODEL
```

Exemplo:

```text
logs
trace
memory
browser
debugger
```

A percepção deve ser ativa, não somente passiva.

---

# 125. Meta 70 — Meta-Reasoning Controller

O agente deve escolher a forma apropriada de raciocinar:

```text
fast reasoning
deep reasoning
simulation
research
formal verification
delegation
experiment
```

Exemplo:

```text
simple
→ fast path

ambiguous
→ deeper reasoning

high risk
→ independent verification

unknown
→ research

contradiction
→ investigation
```

---

# 126. Meta 71 — Cognitive Budget

Além de token budget:

```text
reasoning_budget
research_budget
experiment_budget
tool_budget
verification_budget
time_budget
```

O agente precisa detectar quando está gastando esforço excessivo e mudar de estratégia.

---

# 127. Meta 72 — Reversibility Engine

Toda ação relevante deve possuir uma estimativa de reversibilidade:

```text
edit file          → high
git branch         → high
restart service    → medium
database migration → low
delete data        → extremely low
send message       → extremely low
```

A reversibilidade influencia:

```text
autonomy
verification
simulation
human gate
backup
rollback
```

---

# 128. Meta 73 — Blast Radius Analysis

Antes de agir:

```text
ACTION
 ↓
WHO / WHAT CAN THIS AFFECT?
 ↓
BLAST RADIUS
```

O resultado alimenta:

```text
risk
verification
sandbox
authority
rollback
```

---

# 129. Meta 74 — Invariant Monitor

O agente deve conseguir manter invariantes do ambiente:

```text
service must remain reachable
secret must never appear in logs
production data must remain valid
admin endpoint must require authorization
security baseline must remain satisfied
```

Modelo:

```text
INVARIANTS
 ↓
OBSERVE
 ↓
VIOLATION?
 ↓
RECOVER / STOP / ALERT
```

---

# 130. Meta 75 — Self-Calibrating Sensors

Observações não são automaticamente verdade.

Modelo:

```text
OBSERVATION
 ↓
SANITY CHECK
 ↓
CROSS-CHECK
 ↓
TRUST / DISCARD
```

Exemplo:

```text
UI says "saved"
backend says 422
→ UI observation rejected
```

---

# 131. Meta 76 — Belief Revision

O agente deve conseguir mudar crenças diante de evidência contraditória:

```text
BELIEF A
 ↓
NEW EVIDENCE
 ↓
CONTRADICTION
 ↓
REASSESS
 ↓
REVISE BELIEF
 ↓
INVALIDATE DEPENDENT DECISIONS
```

---

# 132. Meta 77 — Decision Invalidation

Decisões devem possuir dependências causais.

Se:

```text
Decision A
 ↓
Decision B
 ↓
Decision C
```

e A perde sua base:

```text
A INVALID
 ↓
B MAY BE INVALID
 ↓
C MAY BE INVALID
 ↓
RE-EVALUATE
```

O agente não deve continuar construindo sobre premissas invalidadas.

---

# 133. Meta 78 — Knowledge Decay / Freshness

Conhecimento deve possuir dimensão temporal:

```text
knowledge
 ↓
freshness
 ↓
staleness risk
 ↓
revalidate when necessary
```

O agente deve distinguir:

```text
current
aging
stale
historical
```

---

# 134. Meta 79 — Autonomous Calibration

A confiança do agente deve ser comparada com resultados reais:

```text
prediction
 ↓
outcome
 ↓
compare
 ↓
calibrate confidence
```

Objetivo:

```text
confidence
≈
observed reliability
```

Isso deve alimentar Uncertainty Engine e Model Routing.

---

# 135. Meta 80 — Strategy Evolution

Não apenas selecionar estratégias.

Também:

```text
strategies
 ↓
performance data
 ↓
detect pattern
 ↓
modify strategy
 ↓
test candidate
 ↓
adopt
```

O agente aprende novas formas de trabalhar de maneira verificável.

---

# 136. Meta 81 — Protocol Negotiation

Ao encontrar um serviço desconhecido:

```text
DISCOVER
 ↓
protocol
authentication
capabilities
limits
schema
version
health
 ↓
NEGOTIATE
 ↓
USE
```

O agente deve ser capaz de descobrir como conversar com sistemas não previstos previamente.

---

# 137. Meta 82 — Environment Discovery Protocol

Ao entrar em um ambiente novo:

```text
WHO AM I?
WHERE AM I?
WHAT EXISTS?
WHAT CAN I USE?
WHAT IS FORBIDDEN?
WHAT IS MISSING?
WHAT IS CHANGING?
```

Isso pode constituir um ritual operacional inicial de qualquer contexto novo.

---

# 138. Meta 83 — Digital Twin / Shadow World

Para alterações de risco:

```text
REAL WORLD
   ↕
DIGITAL TWIN
```

O agente pode:

```text
plan
→ simulate
→ compare alternatives
→ select
→ execute
```

Aplicações:

```text
infrastructure
database
network
deployment
resource allocation
workflow
```

---

# 139. Meta 84 — Shadow Execution

Antes de executar uma operação crítica:

```text
SHADOW EXECUTION
 ↓
PREDICT EFFECTS
 ↓
COMPARE
 ↓
REAL EXECUTION
```

A execução em shadow mode não altera o mundo real.

---

# 140. Meta 85 — Safe Exploration / Curiosity

O agente pode explorar desconhecimento deliberadamente:

```text
UNKNOWN
 ↓
SAFE EXPERIMENT
 ↓
LEARN
```

Regra:

```text
curiosity
≠
permission
```

Curiosidade nunca amplia autoridade.

---

# 141. Meta 86 — Agent Sleep / Consolidation

Um agente residente deve poder entrar em:

```text
WORK
 ↓
IDLE
 ↓
CONSOLIDATE
 ↓
SLEEP
 ↓
WAKE
```

Durante consolidação pode:

```text
consolidar memória
compactar histórico
revisar estratégias
atualizar índices
analisar falhas
preparar conhecimento
verificar saúde
planejar tarefas futuras
```

---

# 142. Meta 87 — Memory Consolidation

Experiências brutas devem poder ser transformadas em conhecimento:

```text
working memory
 ↓
episodic memory
 ↓
pattern extraction
 ↓
semantic / procedural knowledge
```

O objetivo é aprender com experiências, não apenas armazenar logs.

---

# 143. Meta 88 — Self-Integrity Monitor

Periodicamente:

```text
am I still behaving according to my contract?
```

Verificar:

```text
identity
policy
capabilities
memory integrity
authorization
routing
safety invariants
```

Se houver drift:

```text
DRIFT
 ↓
ISOLATE
 ↓
DIAGNOSE
 ↓
RECOVER
```

---

# 144. Meta 89 — Contract Drift Detection

Comparar:

```text
CURRENT SYSTEM
vs
AUTHORIZED CONTRACT
```

Detectar quando:

- capabilities foram ampliadas;
- permissões mudaram;
- políticas perderam força;
- evolução introduziu novos caminhos de efeito.

Mudanças incompatíveis devem gerar revisão ou bloqueio.

---

# 145. Meta 90 — Capability Revocation

Capabilities também precisam poder ser removidas:

```text
CAPABILITY
 ↓
performance/security degradation
 ↓
REVOKE
```

O agente precisa ser capaz de perder poderes quando a evidência indicar que eles não são mais confiáveis.

---

# 146. Meta 91 — Agent Quarantine

Quando existir suspeita sobre:

```text
provider
capability
memory
environment
agent
```

executar:

```text
QUARANTINE
 ↓
LIMIT AUTHORITY
 ↓
INVESTIGATE
 ↓
RECOVER / REPLACE
```

---

# 147. Meta 92 — Canary Agent / Canary Capability

Novas versões podem começar em exposição limitada:

```text
candidate
 ↓
small workload
 ↓
observe
 ↓
compare baseline
 ↓
expand
```

Isso é especialmente importante para self-evolution.

---

# 148. Meta 93 — Multi-Agent Dissent

Além de Builder, Verifier e Adversary, pode existir um agente cuja responsabilidade seja discordar:

```text
PLAN
 ↓
AGREEMENT
 ↓
DISSENT AGENT
 ↓
COUNTERARGUMENT
 ↓
REASSESS
```

O objetivo é reduzir convergência prematura.

---

# 149. Meta 94 — Independent Priors

A verificação deve evitar dependência excessiva do mesmo contexto cognitivo:

```text
Builder context
        ≠
Verifier context
```

Dois agentes não devem simplesmente compartilhar o mesmo erro inicial e chamá-lo de consenso.

---

# 150. Meta 95 — Adversarial World Model

O sistema deve tentar quebrar não apenas a implementação, mas sua própria compreensão do ambiente:

```text
WORLD MODEL
 ↓
ADVERSARIAL HYPOTHESIS
 ↓
OBSERVE
 ↓
COMPARE
 ↓
UPDATE
```

---

# 151. Meta 96 — Autonomous Negotiation with the World

Quando um recurso necessário não estiver disponível:

```text
resource unavailable
 ↓
find alternative
 ↓
request permission if necessary
 ↓
acquire
 ↓
continue
```

Alternativas possíveis:

```text
alternative provider
different environment
different machine
different strategy
```

---

# 152. Meta 97 — Goal Decomposition Discovery

Para objetivos novos:

```text
UNKNOWN GOAL
 ↓
INFER NECESSARY SUBGOALS
```

O sistema deve determinar quais subobjetivos são:

```text
required
conditional
optional
obsolete
```

sem receber necessariamente um Task Graph previamente escrito.

---

# 153. Meta 98 — Goal Mutation

Objetivos podem evoluir quando novas informações surgirem:

```text
ORIGINAL GOAL
 ↓
NEW INFORMATION
 ↓
REASSESS
 ↓
GOAL REVISION
```

A alteração deve preservar lineage entre objetivo original e objetivo revisado.

---

# 154. Meta 99 — Goal Abandonment

O agente precisa saber quando abandonar um objetivo:

```text
goal
 ↓
cost exploding
 ↓
probability low
 ↓
alternative exists
 ↓
ABANDON
```

Abandono deve exigir:

```text
reason
evidence
impact analysis
```

---

# 155. Meta 100 — Opportunity Cost

O agente deve considerar que trabalhar em um objetivo impede outros trabalhos:

```text
doing A
means not doing B
```

Portanto:

```text
goal value
deadline
resource use
risk
```

devem alimentar Goal Portfolio.

---

# 156. Meta 101 — Autonomous Personalization

Um agente persistente pode aprender:

```text
user preferences
workspace conventions
project conventions
preferred trade-offs
communication preferences
preferred providers
```

Mas:

```text
preference
≠
policy
```

Preferências nunca podem sobrescrever segurança ou autoridade.

---

# 157. Meta 102 — Self-Generated Benchmarks

O agente deve poder detectar:

```text
BLIND SPOT
```

e gerar uma avaliação:

```text
generate benchmark
 ↓
test system
 ↓
store regression suite
```

O sistema começa a descobrir como precisa ser testado.

---

# 158. Meta 103 — Benchmark Evolution

Quando um benchmark ficar fácil:

```text
benchmark
 ↓
too easy
 ↓
generate harder variant
 ↓
benchmark again
```

Isso reduz overfitting ao conjunto original de testes.

---

# 159. Meta 104 — Autonomous Threat Hunting

Não apenas executar Security Review.

O agente deve poder:

```text
OBSERVE SYSTEM
 ↓
SEARCH SUSPICIOUS BEHAVIOR
 ↓
FORM ATTACK HYPOTHESIS
 ↓
TEST SAFELY
 ↓
VERIFY
```

Isso transforma security em atividade contínua.

---

# 160. Meta 105 — Recovery from Own Cognitive Failure

O agente deve conseguir detectar:

```text
I am confused
I am looping
I have contradictory beliefs
I lost track of goal
my context is polluted
```

Então:

```text
STOP CURRENT REASONING
 ↓
RECONSTRUCT STATE
 ↓
RELOAD MEMORY
 ↓
REBUILD PLAN
 ↓
CONTINUE
```

Isso é recuperação cognitiva.

---

# 161. Meta 106 — Self-Imposed Guardrails

O agente pode aprender restrições próprias baseadas em experiência:

```text
previous operation nearly failed
 ↓
learned self-guardrail
 ↓
future operation requires:
backup
+
simulation
+
verification
```

Regra fundamental:

> **Self-guardrails podem restringir autoridade. Nunca podem ampliá-la.**

---

# 162. Meta 107 — Meta-Agency

O agente deve poder decidir que tipo de composição operacional precisa para uma tarefa.

Modelo:

```text
GOAL
 ↓
ASSESS
 ↓
"I need research + vision + coding + security"
 ↓
assemble temporary agent configuration
 ↓
execute
 ↓
dissolve / persist depending on need
```

Ou:

```text
need specialist
→ instantiate specialized sub-agent
```

Isso é uma forma superior de Agent + Capability Self-Evolution.

---

# 163. Superpower Architecture

O modelo geral passa a ser:

```text
                         EVOLVELOOP V3
                              │
                    ┌─────────┴─────────┐
                    │   META-AGENCY     │
                    └─────────┬─────────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
          COGNITION         AGENCY           SAFETY
             │                │                │
       reasoning           goals           policy
       uncertainty         priorities      authority
       simulation          scheduling      sandbox
       beliefs             events          invariants
       attention           opportunities   quarantine
             │                │                │
             └────────────────┼────────────────┘
                              │
                       WORLD MODEL
                              │
                 ┌────────────┼────────────┐
                 │            │            │
             PERCEPTION    MEMORY      CAPABILITIES
                 │            │            │
                 └────────────┼────────────┘
                              │
                      EXECUTION FABRIC
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
      COMPUTE              COMPUTER           EXTERNAL
      SYSTEM               USE                WORLD
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                    VERIFICATION FABRIC
                              │
             ┌────────────────┼────────────────┐
             │                │                │
          VERIFIER         ADVERSARY         DISSENT
             │                │                │
             └────────────────┼────────────────┘
                              │
                     EXPERIENCE ENGINE
                              │
                     ┌────────┴────────┐
                     │                 │
                  MEMORY          STRATEGIES
                     │                 │
                     └────────┬────────┘
                              │
                       SELF-EVOLUTION
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         CAPABILITY        AGENT           RUNTIME
         EVOLUTION        EVOLUTION        EVOLUTION
```

---

# 164. Doutrina dos Superpowers

Ter uma capability não significa expô-la sempre.

O agente deve seguir:

```text
NEED
 ↓
DISCOVER
 ↓
ASSESS
 ↓
AUTHORIZE
 ↓
ISOLATE WHEN NEEDED
 ↓
EXECUTE
 ↓
OBSERVE
 ↓
VERIFY
 ↓
RECORD EXPERIENCE
```

As capabilities devem ser:

```text
discoverable
composable
revocable
auditable
versioned
testable
replaceable
evolvable
```

---

# 165. Princípio de Não-Dependência de Ferramentas

O agente nunca deve formar sua identidade em torno de um fornecedor específico.

Não:

```text
"I am a Cursor agent."
```

Sim:

```text
"I can perform this class of task."
```

Provider é implementação.

Capability é contrato.

Agent é decisão.

---

# 166. Modelo de Capability Expansion

O conjunto operacional do agente deve poder crescer:

```text
INITIAL CORE
    ↓
DISCOVERY
    ↓
COMPOSITION
    ↓
ACQUISITION
    ↓
CREATION
    ↓
VALIDATION
    ↓
REGISTRATION
    ↓
USAGE
    ↓
EXPERIENCE
    ↓
OPTIMIZATION
```

Assim o corpo operacional do agente pode evoluir ao longo do tempo.

---

# 167. O verdadeiro superpoder

A maior capability da V3 não é browser, terminal, debugger ou cloud.

É:

```text
CAPABILITY CREATION
```

O agente precisa ser capaz de perceber:

> **“Eu não consigo fazer isso com o que possuo.”**

e então determinar:

```text
Can I compose existing capabilities?
Can I acquire a missing capability?
Can I build one?
Can I safely validate it?
Can I register it?
```

Essa capacidade conecta:

```text
agency
+
capability fabric
+
sandbox
+
self-testing
+
self-evolution
+
memory
```

em um único ciclo.

---

# 168. Autonomia Total — Definição Expandida

A autonomia total da V3 é composta por:

```text
Cognitive
Goal
Temporal
Operational
Environmental
Tool
Social
Economic
Self
Evolutionary
```

e adicionalmente:

```text
Epistemic
Contextual
Transactional
Observational
Strategic
Meta-agency
```

Um agente plenamente autônomo deve conseguir:

```text
perceber
→ compreender
→ decidir
→ adquirir capacidades
→ agir
→ observar
→ verificar
→ corrigir
→ aprender
→ adaptar
→ persistir
→ evoluir
```

sem exigir condução humana no fluxo normal.

---

# 169. Definição Final — General Autonomous Agent

> **EvolveLoop V3 is a persistent autonomous agent system capable of understanding and maintaining goals, discovering and acquiring the capabilities required to achieve them, reasoning under uncertainty, interacting with the real world, managing resources and time, adapting strategies, recovering from failure, independently verifying outcomes, learning from experience, maintaining its own operational health, forming goals within policy, and evolving its own capabilities, agents, and runtime under explicit authority, evidence, isolation, and rollback constraints.**

Em português:

> **O EvolveLoop V3 é um sistema de agente autônomo persistente capaz de compreender e manter objetivos, descobrir e adquirir as capabilities necessárias para alcançá-los, raciocinar sob incerteza, interagir com o mundo real, administrar recursos e tempo, adaptar estratégias, recuperar-se de falhas, verificar independentemente seus resultados, aprender com a experiência, manter sua própria saúde operacional, formar objetivos dentro de policy e evoluir suas próprias capabilities, agentes e runtime sob autoridade, evidência, isolamento e rollback explícitos.**

---

# 170. Critério Supremo

Não considerar V3 “autonomia total” porque:

```text
many tools
many agents
many tests
many benchmarks
one impressive demo
```

O critério é a combinação:

```text
agency
+
generality
+
world interaction
+
long-horizon
+
self-recovery
+
uncertainty management
+
memory
+
self-verification
+
security
+
capability acquisition
+
self-maintenance
+
self-evolution
+
novel-task performance
```

A pergunta final:

> **Se o ambiente mudar, a primeira estratégia falhar, uma capability estiver indisponível, o contexto ficar incompleto e o problema não tiver sido previsto pelos desenvolvedores, o EvolveLoop ainda consegue descobrir uma maneira segura de alcançar o objetivo?**

Esse é o padrão.

---

# 174. System Boundaries — Preserve the V2 Foundation

The V3 must extend the established V2 model instead of replacing it with a competing architecture.

The fundamental execution boundary remains:

```
INTENT
  ↓
CAPABILITY
  ↓
POLICY
  ↓
RUNTIME
  ↓
PROVIDER
  ↓
EVIDENCE
```

Above it, V3 adds:

```
AGENCY
  ↓
GOALS
  ↓
WORLD MODEL
  ↓
MEMORY
  ↓
REASONING
  ↓
PLANNING
  ↓
EXECUTION
  ↓
LEARNING
```

And around it:

```
SAFETY
VERIFICATION
RESOURCE GOVERNANCE
OBSERVABILITY
EVOLUTION
```

The result should be additive:

```
V2 Execution Substrate
        +
V3 Agency Layer
        +
V3 Intelligence Layer
        +
V3 Persistent World Interaction
        +
V3 Evolution Layer
```

Never:

```
V2 architecture
→ discarded
→ new architecture
```

---

# 175. The Agency Layer

The Agency Layer is the central addition of V3.

Its responsibility is not to execute individual capabilities.

Its responsibility is to determine:

```
what should happen
when it should happen
why it should happen
whether it should happen
whether it is still worth happening
when it should stop
```

Conceptual structure:

```
                   AGENCY
                      │
       ┌──────────────┼──────────────┐
       │              │              │
     GOALS         ATTENTION      PRIORITY
       │              │              │
       ├──────────────┼──────────────┤
       │              │              │
   PLANNING       WORLD MODEL     SCHEDULING
       │              │              │
       └──────────────┼──────────────┘
                      │
                DECISION LOOP
```

The Agency Layer does not bypass Policy.

It proposes action.

The Runtime determines whether the action is executable.

---

# 176. Goal Lifecycle

A goal must have an explicit lifecycle.

Recommended conceptual states:

```
PROPOSED
↓
ACCEPTED
↓
ACTIVE
↓
BLOCKED
↓
PAUSED
↓
REPLANNING
↓
VERIFYING
↓
COMPLETED
```

Terminal alternatives:

```
ABANDONED
CANCELLED
EXPIRED
FAILED
```

A goal may also become:

```
SUPERSEDED
```

when a newer goal replaces its objective.

Every transition must preserve:

```
goal_id
parent_goal_id
version
reason
evidence
timestamp
policy snapshot
actor
```

A goal cannot silently disappear.

---

# 177. Goal Versioning

Goals are mutable.

Therefore goal mutation must be versioned.

Example:

```
G-042 v1
"Deploy application"

        ↓ new evidence

G-042 v2
"Prepare migration before deployment"

        ↓ further evidence

G-042 v3
"Do not deploy; replace dependency first"
```

The system must preserve:

```
original intent
derived objective
goal revisions
reason for each revision
evidence causing revision
```

This makes goal evolution auditable.

---

# 178. Goal Dependency Graph

Goals should support dependencies:

```
G1
├── G2
│   ├── G4
│   └── G5
└── G3
```

A goal cannot be considered complete when a required descendant remains unsatisfied.

The system must distinguish:

```
blocking dependency
non-blocking dependency
conditional dependency
informational dependency
```

This prevents a simplistic "all tasks done" definition of completion.

---

# 179. Goal Health

Goals require health metrics independent of task progress.

Possible dimensions:

```
progress_rate
time_remaining
budget_remaining
confidence
risk
blockers
strategy_stability
world_state_stability
evidence_coverage
```

Example:

```
Goal progress = 72%
Time used = 90%
Confidence = falling
Risk = rising
```

This should trigger:

```
REASSESS
```

rather than blindly continuing.

---

# 180. Success Oracle Architecture

Success must not be one boolean.

Model:

```
SUCCESS ORACLE
├── functional criteria
├── quality criteria
├── safety criteria
├── operational criteria
├── resource criteria
└── user-defined criteria
```

Each criterion must have:

```
criterion_id
type
required
measurement
threshold
evidence_source
verification_method
status
```

A goal can therefore reach:

```
PARTIAL_SUCCESS
```

without being falsely promoted to:

```
SUCCESS
```

---

# 181. Goal Satisfaction Proof

A completed objective should generate a proof package:

```
GOAL
↓
SUCCESS CRITERIA
↓
OBSERVED OUTCOMES
↓
EVIDENCE
↓
VERIFICATION
↓
SATISFACTION DECISION
```

The proof package should answer:

```
What was requested?
What was actually changed?
How was the outcome observed?
Which evidence supports each criterion?
Which criteria remain uncertain?
What assumptions were required?
```

---

# 182. World Model — Stronger Definition

The World Model is not a cache.

It is a **hypothesis about the current state of relevant reality**.

Every important fact should conceptually carry:

```
entity
property
value
source
timestamp
freshness
confidence
provenance
verification state
```

Example:

```
service.api.status = "healthy"

source = health_probe
observed_at = T
fresh_until = T+30s
confidence = high
```

After freshness expires, the model should not automatically continue treating the fact as current.

---

# 183. World Model Layers

Separate world knowledge by temporal behavior:

```
STATIC
  architecture
  historical decisions

DYNAMIC
  running processes
  deployed versions
  service health

EXTERNAL
  APIs
  remote services
  external systems

PREDICTIVE
  expected outcomes
  future state hypotheses

UNCERTAIN
  unresolved facts
  conflicting observations
```

This prevents mixing:

```
"the repository contains X"
```

with:

```
"the running service currently behaves like X"
```

---

# 184. World Model Truth Hierarchy

When observations conflict, the agent needs explicit precedence.

Possible hierarchy:

```
direct trusted observation
    >
independent verified observation
    >
multiple corroborated observations
    >
single indirect observation
    >
memory
    >
inference
    >
prediction
```

This is not universal for every domain.

The hierarchy must be domain-configurable.

The important invariant is:

> **Inference must never silently become observation.**

---

# 185. World Model Reconciliation

Reconciliation should detect at least:

```
missing entity
changed entity
unexpected entity
changed property
stale property
contradictory property
permission change
dependency change
environment drift
```

Each discrepancy should become:

```
known drift
unknown drift
actionable drift
critical drift
```

This gives the Agency Layer concrete signals.

---

# 186. Observation Planning

The agent should select observations by expected information value.

Conceptually:

```
candidate observation
    ↓
estimated uncertainty reduction
    ↓
estimated cost
    ↓
risk
    ↓
choose observation
```

This creates the bridge between:

```
Active Perception
+
Value of Information
+
World Model
```

---

# 187. Belief Store

The agent should maintain beliefs separately from raw observations.

Example:

```
OBSERVATION:
request returned 500

BELIEF:
database connection may be failing

STATUS:
hypothesis
```

After another observation:

```
connection pool metrics show exhaustion

BELIEF:
database connection exhaustion caused the failure

STATUS:
supported
```

And after experiment:

```
pool restored
request succeeds

STATUS:
strongly supported
```

This prevents hypotheses from being stored as facts.

---

# 188. Belief Revision Graph

Beliefs can depend on other beliefs.

```
B1 ──→ B3
B2 ──→ B3
B3 ──→ D1
```

If B1 becomes invalid:

```
B1 INVALID
 ↓
B3 SUSPECT
 ↓
D1 REASSESS
```

This directly operationalizes Decision Invalidation.

---

# 189. Attention Architecture

Attention must be a resource allocation mechanism.

Possible tiers:

```
CRITICAL
ACTIVE
RELEVANT
BACKGROUND
ARCHIVED
```

The active context should be selected from:

```
goal relevance
recency
risk
uncertainty
causal dependency
novelty
verification importance
```

Not simply:

```
most recent messages
```

---

# 190. Context Compression

Context compression must preserve semantics and provenance.

Bad compression:

```
"some tests passed"
```

Good compression:

```
Execution E-392:
- test suite: 184/184
- failure: API integration test 7
- cause hypothesis: stale fixture
- evidence: trace + response body
- repair: fixture schema update
- regression: passed
```

A compressed memory must retain enough information to support future decisions.

---

# 191. Memory Trust Classes

Memory entries should be distinguishable as:

```
OBSERVED
VERIFIED
INFERRED
REPORTED
LEARNED
PREDICTED
INVALIDATED
STALE
```

This prevents the agent from treating:

```
"someone told me"
```

the same as:

```
"I verified it directly"
```

---

# 192. Memory Consolidation

Consolidation should transform experience:

```
RAW EXECUTION
 ↓
EPISODE
 ↓
PATTERN
 ↓
KNOWLEDGE
 ↓
PROCEDURE
```

Example:

```
10 executions
→ same provider timeout pattern
→ provider unreliable for task class X
→ avoid provider under condition Y
```

The resulting procedural rule must retain links to the experiences that justified it.

---

# 193. Memory Forgetting

Forgetting is necessary for long-horizon operation.

The system should distinguish:

```
delete
archive
compress
downgrade
expire
invalidate
```

Critical evidence should not disappear merely because it is old.

Low-value transient context may.

---

# 194. Memory Contamination Defense

Memory is a trust boundary.

The agent must defend against:

```
malicious memory injection
false historical claims
cross-project contamination
identity confusion
context poisoning
stale procedures
```

A memory retrieved from one project should not automatically become trusted knowledge for another.

---

# 195. Self-Model — Capability Reality

Self-model must be grounded in observed capability state.

Bad:

```
"I can deploy Kubernetes."
```

Better:

```
capability = kubectl.deploy
availability = unknown
authorization = denied
provider = missing
last_success = never
```

Self-model should be machine-readable and connected to Capability Registry.

---

# 196. Self-Model — Reliability

The agent should understand its own operational reliability by class:

```
task family
provider
environment
tool
strategy
```

Not:

```
"I am 87% reliable."
```

But:

```
coding/backend:
  historical success high
  current environment compatible

vision/mobile:
  evidence insufficient

production migration:
  authority absent
```

This is more actionable.

---

# 197. Reasoning Controller — Cognitive Modes

The Meta-Reasoning Controller should define explicit modes:

```
FAST
DEEP
RESEARCH
DIAGNOSTIC
SIMULATIVE
FORMAL
ADVERSARIAL
DELEGATED
RECOVERY
REFLECTIVE
```

Mode transitions must be observable.

Example:

```
FAST
 ↓ contradiction
DEEP
 ↓ missing information
RESEARCH
 ↓ high-risk action
FORMAL
 ↓ implementation
ADVERSARIAL
```

---

# 198. Reasoning Budget Allocation

Cognitive budget should be dynamically allocated.

Example:

```
Goal budget:
100 units

Planning:
10
Research:
20
Execution:
30
Verification:
25
Recovery reserve:
15
```

The reserve should not be consumed casually.

A system that spends its entire budget on early reasoning may have nothing left for recovery.

---

# 199. Decision Records

Important decisions should become first-class records:

```
decision_id
goal_id
context
alternatives
selected_option
rejected_options
evidence
uncertainty
risk
authority
expected_outcome
actual_outcome
```

This creates a durable Decision Memory.

---

# 200. Decision Quality Evaluation

A decision should later be evaluated against reality:

```
expected outcome
vs
observed outcome
```

Possible result:

```
correct
partially correct
incorrect
underinformed
correct by luck
```

This distinction matters for learning.

---

# 201. Causal Reasoning

The system should distinguish correlation from causal evidence.

Weak:

```
A happened
then B happened
```

Strong:

```
A intervention
→ expected B
→ controlled observation
→ B changed
```

When possible, self-debugging and experimentation should favor causal tests over narrative explanations.

---

# 202. Experiment Registry

Experiments should be persistent entities:

```
experiment_id
hypothesis
variables
control
treatment
environment
expected_result
observed_result
confidence
decision_impact
```

This makes Autonomous Experimentation reproducible rather than ad hoc.

---

# 203. Experiment Isolation

Experiments must specify:

```
environment
allowed effects
forbidden effects
cleanup
rollback
resource budget
duration
```

The experiment lifecycle:

```
DESIGN
 ↓
ISOLATE
 ↓
EXECUTE
 ↓
OBSERVE
 ↓
COMPARE
 ↓
CLEANUP
 ↓
PERSIST RESULT
```

---

# 204. Capability Lifecycle

Every capability should have a lifecycle:

```
DISCOVERED
 ↓
CANDIDATE
 ↓
VALIDATED
 ↓
AVAILABLE
 ↓
DEGRADED
 ↓
QUARANTINED
 ↓
REVOKED
 ↓
REPLACED / REVALIDATED
```

Capabilities must be versioned.

---

# 205. Capability Contract

A capability should define:

```
identity
version
inputs
outputs
side effects
authority required
environment requirements
security requirements
cost model
timeout behavior
failure modes
evidence emitted
reversibility
idempotency
```

A vague capability such as:

```
"do stuff"
```

does not qualify as a mature V3 capability.

---

# 206. Capability Composition Semantics

Composed capabilities require explicit data flow:

```
C1.output → C2.input
C2.output → C3.input
```

Plus:

```
preconditions
postconditions
side effects
rollback boundaries
```

Composition should reject incompatible graphs before execution.

---

# 207. Capability Substitution

A capability should declare substitute classes.

Example:

```
CAPABILITY:
browser.render

possible providers:
Playwright
Puppeteer
Browser backend B
```

Substitution cannot silently alter semantics.

The replacement must satisfy a compatibility contract.

---

# 208. Capability Equivalence Testing

Provider substitution requires:

```
same intent
same authority boundary
compatible inputs
compatible outputs
compatible evidence
compatible security
```

If equivalence is unproven:

```
SUBSTITUTION_UNVERIFIED
```

not:

```
PASS
```

---

# 209. Capability Acquisition Security

A newly acquired capability is untrusted until validated.

Lifecycle:

```
ACQUIRE
 ↓
HASH / IDENTITY
 ↓
STATIC REVIEW
 ↓
SANDBOX
 ↓
BEHAVIOR TEST
 ↓
ADVERSARIAL TEST
 ↓
AUTHORITY REVIEW
 ↓
REGISTER
```

---

# 210. Capability Creation — Self-Programming Boundary

When the agent creates a capability, the generated implementation must be treated as an external change to the trusted computing base.

Therefore:

```
generated capability
≠
trusted capability
```

until promotion.

---

# 211. Sandbox Depth Model

Sandbox strength should be classified.

Example:

```
S0 — logical restriction
S1 — workspace isolation
S2 — process isolation
S3 — container isolation
S4 — VM / microVM isolation
S5 — hardened external execution boundary
```

The level required depends on:

```
capability risk
data sensitivity
network access
credential exposure
destructiveness
```

A low-risk lint tool does not require the same isolation as arbitrary downloaded code with network access.

---

# 212. Sandbox Escape Detection

The sandbox itself must be adversarially tested:

```
path traversal
symlink abuse
device access
process breakout
namespace escape
network escape
credential access
filesystem escape
resource exhaustion
```

A sandbox is not mature merely because isolation was configured.

It must be tested against attempted escape.

---

# 213. Secret Boundary

Secrets should have explicit states:

```
REQUESTED
AUTHORIZED
LEASED
IN_USE
REDACTED
EXPIRED
REVOKED
```

Secrets should not become normal memory.

They should be referenced by handles or leases wherever practical.

---

# 214. External Identity

Every consequential external action should be attributable to:

```
agent_id
goal_id
execution_id
capability_id
provider_id
credential_id
policy_decision
timestamp
evidence
```

This creates non-repudiable operational provenance inside the system's trust model.

---

# 215. Resource Governance

Resource governance should be multi-dimensional:

```
time
CPU
RAM
GPU
disk
network
tokens
money
concurrency
external quotas
```

A resource budget should support:

```
hard limit
soft limit
warning threshold
forecast threshold
```

---

# 216. Resource Reservation

Before expensive actions, the agent may reserve resources:

```
resource estimate
 ↓
availability
 ↓
reservation
 ↓
execution
 ↓
actual accounting
 ↓
release
```

Reservation prevents multiple agents from independently spending the same resource budget.

---

# 217. Scheduler Semantics

The scheduler must understand:

```
priority
deadline
dependency
preemption cost
resource requirement
risk
expected value
```

A naive FIFO queue is insufficient for V3 agency.

---

# 218. Preemption Safety

Preemption should be classified:

```
SAFE_TO_PAUSE
CHECKPOINT_REQUIRED
NON_PREEMPTIBLE
COMPENSATION_REQUIRED
```

An agent must not blindly kill operations that are mid-migration or otherwise non-interruptible.

---

# 219. Temporal State

The agent needs explicit temporal states:

```
ACTIVE_NOW
WAITING
SCHEDULED
EXPIRED
MISSED_DEADLINE
DEFERRED
```

Time events must be persisted and recoverable across process restarts.

---

# 220. Event Semantics

An event should contain:

```
event_id
type
source
timestamp
payload
trust level
deduplication key
causal parent
```

Event processing must be idempotent where possible.

---

# 221. Event Storm Protection

A persistent agent can be overwhelmed by its own event sources.

Therefore:

```
rate limiting
deduplication
coalescing
backpressure
priority queues
circuit breakers
```

are required for high-volume event domains.

---

# 222. Opportunity Scoring

An autonomous opportunity should be evaluated by more than raw value.

Possible inputs:

```
expected benefit
risk
cost
urgency
reversibility
confidence
resource availability
goal conflicts
```

The output is:

```
ignore
record
propose
schedule
act
```

---

# 223. Autonomous Goal Formation Guardrail

Autonomous goal formation must never create unbounded self-directed work.

There must be explicit categories:

```
MANDATED GOAL
USER GOAL
SYSTEM MAINTENANCE GOAL
RECOVERY GOAL
SAFETY GOAL
OPPORTUNITY GOAL
LEARNING GOAL
```

Each category may have different autonomy permissions.

---

# 224. Human Gate Protocol

A human gate should be a structured object:

```
gate_id
reason
goal
action
risk
alternatives
evidence
what decision is required
what happens if denied
deadline
```

The agent should never send:

```
"Should I continue?"
```

without context.

It should send:

```
HUMAN_GATE_REQUIRED

Decision:
Approve production migration.

Reason:
Schema change is irreversible.

Evidence:
...

Alternatives:
...

If denied:
continue research / defer deployment.

Deadline:
...
```

---

# 225. Communication Severity

Agent communication should be classified:

```
INFO
PROGRESS
WARNING
ACTION_REQUIRED
CRITICAL
COMPLETED
```

The user should not be spammed with every internal event.

---

# 226. Silence as a State

A persistent autonomous agent should intentionally remain silent during routine execution.

Silence means:

```
working normally
no decision required
no critical state change
```

This is important for practical usability.

---

# 227. Self-Maintenance Scope

The agent may repair itself only inside explicitly defined self-maintenance boundaries.

Examples:

```
restart worker
rebuild index
clear safe cache
rotate expired lease
restore known-good checkpoint
```

More consequential modifications:

```
runtime binary change
security policy change
identity change
authority expansion
```

should enter the self-evolution process.

---

# 228. Self-Maintenance vs Self-Evolution

Maintain the distinction:

```
SELF-MAINTENANCE
→ restore intended state

SELF-EVOLUTION
→ change intended state
```

This distinction prevents ordinary recovery from becoming unauthorized architectural mutation.

---

# 229. Self-Evolution Candidate Model

An evolution candidate should contain:

```
candidate_id
target
problem_statement
baseline
hypothesis
proposed_change
expected_gain
risk
affected contracts
affected capabilities
test plan
red-team plan
benchmark plan
rollback plan
```

---

# 230. Evolution Dependency Analysis

Before promoting a candidate, calculate:

```
what depends on changed component?
what policies reference it?
what agents use it?
what evidence formats depend on it?
what benchmarks cover it?
what external integrations depend on it?
```

This is necessary for Runtime Self-Evolution.

---

# 231. Evolution Blast Radius

An evolution candidate should have an explicit blast-radius estimate:

```
LOCAL
SUBSYSTEM
RUNTIME
GLOBAL
```

Promotion requirements should become stricter as blast radius increases.

---

# 232. Evolution Canary

A safe rollout model:

```
candidate
 ↓
isolated benchmark
 ↓
canary workload
 ↓
observe
 ↓
compare baseline
 ↓
expand
 ↓
full promotion
```

Rollback must remain available during the observation period.

---

# 233. Evolution Rollback

Rollback should restore more than code.

It may need to restore:

```
code
configuration
capability registry
agent contracts
memory procedures
routing policies
schema
runtime state
```

Rollback must therefore be treated as a state transition, not a Git command.

---

# 234. Evolution Non-Regression Rule

A candidate cannot be promoted solely because:

```
target benchmark improved
```

Promotion requires analysis of:

```
target improvement
global regression
security regression
cost regression
latency regression
reliability regression
new failure modes
```

---

# 235. Evolution Learning Loop

After promotion:

```
PROMOTED
 ↓
MONITOR
 ↓
COMPARE REAL OPERATIONS
 ↓
DETECT UNEXPECTED EFFECTS
 ↓
KEEP
REPAIR
ROLLBACK
OR EVOLVE AGAIN
```

Promotion is not the end of evaluation.

---

# 236. Multi-Agent Protocol

Every agent-to-agent interaction should use structured messages:

```
sender
receiver
goal
task
context
authority
request
constraints
deadline
budget
expected output
evidence requirements
```

Free-form conversation should not be the only interface.

---

# 237. Delegation Contract

Delegation should specify:

```
what is delegated
what is not delegated
allowed capabilities
forbidden capabilities
data scope
deadline
budget
success criteria
evidence expected
```

The delegated agent must not inherit unrestricted authority.

---

# 238. Agent Isolation

Sub-agents should receive only the minimum context necessary.

Separate:

```
goal context
project context
user context
secret context
system context
```

A sub-agent should not receive unrelated persistent memory by default.

---

# 239. Dissent as a First-Class Protocol

A dissent result should be structured:

```
claim challenged
counterclaim
evidence
risk
confidence
recommended re-evaluation
```

The system should not punish disagreement simply because it conflicts with the majority.

---

# 240. Consensus Model

Consensus should not mean:

```
2 agents agree → truth
```

Instead:

```
independent evidence
+
independent reasoning
+
compatible conclusions
=
stronger support
```

Agreement without independence is weak evidence.

---

# 241. Agent Reputation Model

Reputation should be multidimensional.

Example:

```
task family
environment
provider
complexity
risk class
historical outcome
```

An agent can be:

```
excellent at debugging
unproven at deployment
unsafe for security-sensitive work
```

without reducing all behavior to one score.

---

# 242. Agent Competition

For critical decisions, multiple strategies or agents may compete:

```
Agent A → plan
Agent B → alternative plan
Agent C → adversarial critique
Verifier → evaluate
```

Selection must depend on evidence, not vote count.

---

# 243. Failure Containment Domains

Contain failures at the narrowest safe boundary:

```
action
→ capability
→ provider
→ agent
→ project
→ workspace
→ system
```

The system should escalate only when local containment fails.

---

# 244. Circuit Breakers

Repeated provider/capability failures should trigger:

```
OPEN CIRCUIT
 ↓
STOP CALLING
 ↓
INVESTIGATE
 ↓
TRY SUBSTITUTE
```

This prevents thousands of identical failures consuming resources.

---

# 245. Stagnation Detector

Define measurable stagnation signals:

```
no meaningful state delta
repeated action sequence
repeated error
same hypothesis
oscillating decisions
falling information gain
rising cost per progress unit
```

Stagnation should trigger a strategy change.

---

# 246. Progress Measurement

Progress should not be:

```
number of tasks completed
```

It should be measured against the Goal Contract:

```
goal distance
remaining uncertainty
remaining required work
evidence coverage
risk reduction
```

A completed task that does not advance the goal is not necessarily progress.

---

# 247. Progress Per Resource

Track:

```
progress / token
progress / second
progress / dollar
progress / action
progress / risk
```

This enables true strategy comparison.

---

# 248. Value-of-Information Operationalization

The agent should estimate:

```
expected decision improvement
/
cost of information
```

This can guide:

```
research
testing
observation
experimentation
human questions
```

A human question should itself be treated as an information-gathering action with a cost.

---

# 249. Asking the Human as an Optimization Problem

Before asking a question:

```
Can I infer this safely?
Can I research it?
Can I test it?
Can I defer it?
Can I choose a reversible default?
```

Only after those options fail should:

```
HUMAN_GATE_REQUIRED
```

be raised.

This is critical to achieving zero operator dependency.

---

# 250. Autonomous Defaults

When information is missing, the agent should be able to choose among:

```
safe default
reversible default
placeholder
defer
research
human gate
```

The selected mode should depend on:

```
impact
confidence
reversibility
policy
deadline
```

---

# 251. Irreversibility Budget

In addition to money and time, track an:

```
IRREVERSIBILITY BUDGET
```

An objective may permit only a limited amount of irreversible action.

Example:

```
read-only exploration
→ zero irreversibility

local file modifications
→ low

external publish
→ medium/high

destructive production action
→ critical
```

This becomes another axis of autonomous risk management.

---

# 252. Blast-Radius Budget

Similarly:

```
MAX AFFECTED SYSTEMS
MAX AFFECTED USERS
MAX DATA VOLUME
MAX ENVIRONMENT SCOPE
```

The agent should not only ask:

> “Can I do this?”

but:

> **“How much of the world am I allowed to affect?”**

---

# 253. Safety Invariants

V3 should maintain explicit invariants that are continuously monitored.

Examples:

```
no secret in public output
no unauthorized authority escalation
no execution outside sandbox where sandbox is required
no production mutation without required gate
no evidence invention
no cross-context secret leakage
no silent policy downgrade
no unknown external side effect
```

An invariant violation is a first-class event.

---

# 254. Safety State Machine

Safety itself needs state:

```
NORMAL
↓
SUSPECT
↓
RESTRICTED
↓
QUARANTINED
↓
RECOVERING
↓
RESTORED
```

The system should be able to reduce autonomy automatically when safety confidence drops.

---

# 255. Degraded Autonomy

The agent should not have only:

```
AUTONOMOUS
or
BLOCKED
```

Possible modes:

```
FULL_AUTONOMY
LIMITED_AUTONOMY
READ_ONLY
OBSERVE_ONLY
SANDBOX_ONLY
HUMAN_APPROVAL
QUARANTINED
```

This allows graceful degradation.

---

# 256. Autonomy Recovery

After entering reduced autonomy:

```
restriction
 ↓
diagnosis
 ↓
verification
 ↓
restore authority progressively
```

Authority should not jump directly from:

```
QUARANTINED
→
FULL_AUTONOMY
```

without evidence.

---

# 257. External World Action Journal

All consequential actions should create an append-only action record:

```
before_state
intended_action
policy_decision
actual_action
after_state
verification
compensation
```

This is the foundation for transactional reasoning and postmortem analysis.

---

# 258. Idempotency

Every external capability should declare whether it is:

```
idempotent
conditionally idempotent
non-idempotent
unknown
```

The Runtime must use this when recovering from crashes or retries.

---

# 259. Effect Classification

Effects should be classified:

```
READ
DERIVE
LOCAL_WRITE
EXTERNAL_WRITE
COMMUNICATION
DESTRUCTIVE
IRREVERSIBLE
```

The classification feeds:

```
policy
sandbox
verification
human gate
rollback
```

---

# 260. Exactly-Once vs At-Least-Once

V3 must never assume exactly-once semantics merely because a workflow restarted safely.

Each capability needs explicit execution semantics:

```
AT_MOST_ONCE
AT_LEAST_ONCE
EFFECTIVELY_ONCE
EXACTLY_ONCE
UNKNOWN
```

If exactly-once cannot be guaranteed:

```
do not claim exactly-once
```

---

# 261. External Transaction Model

For multi-step external work:

```
prepare
→ execute
→ verify
→ commit
```

or:

```
action
→ compensation
```

when the external system does not support transactions.

The runtime must distinguish:

```
internal checkpoint
```

from:

```
external world rollback
```

A restored checkpoint does not automatically undo an external side effect.

---

# 262. Recovery with World Reconciliation

After crash recovery:

```
restore internal state
 ↓
observe external world
 ↓
compare expected vs actual
 ↓
classify divergence
 ↓
reconcile
 ↓
continue
```

This prevents trusting stale internal state after a process restart.

---

# 263. Long-Horizon Failure Model

At 10,000+ actions, expected failure modes include:

```
context drift
memory drift
goal drift
dependency drift
environment drift
policy drift
provider degradation
resource drift
world-state drift
```

Therefore long-horizon evaluation must measure not only completion but **state integrity over time**.

---

# 264. Long-Horizon Checkpoint Design

Checkpoints should contain enough information to reconstruct:

```
goal state
world model snapshot
active beliefs
memory references
task graph
resource accounting
policy snapshot
authority
capability state
pending effects
recovery metadata
```

Do not checkpoint only the current task index.

---

# 265. Long-Horizon Context Recovery

After context loss:

```
checkpoint
+
memory
+
world observation
+
goal contract
+
causal history
```

must be sufficient to resume safely.

The agent should explicitly validate:

```
"I still know why I am doing this."
```

before continuing.

---

# 266. Long-Horizon Strategy Refresh

The agent should periodically ask:

```
Is the original strategy still appropriate?
Is the world still the same?
Is the budget still sufficient?
Has evidence changed?
Are assumptions still true?
```

This is strategic maintenance, not failure.

---

# 267. Long-Horizon Goal Revalidation

At configurable checkpoints:

```
goal contract
vs
current world
```

If mismatch exists:

```
REVALIDATE GOAL
```

This prevents completing the wrong problem perfectly.

---

# 268. Long-Horizon Memory Pressure

When memory/context pressure rises:

```
measure
 ↓
compress
 ↓
prioritize
 ↓
archive
 ↓
verify retrieval
```

Do not silently drop critical state.

---

# 269. Self-Testing the Agent

The agent itself must be tested as a system.

Not only the applications it builds.

Test:

```
goal retention
memory retrieval
belief revision
policy adherence
capability selection
stopping
recovery
routing
delegation
self-observation
```

---

# 270. Metamorphic Evaluation

When no exact expected output exists, test invariants.

Example:

```
same goal
+
different harmless wording
→ equivalent plan class
```

or:

```
same environment
+
reordered independent observations
→ equivalent conclusion
```

Metamorphic tests can detect brittle reasoning.

---

# 271. Counterfactual Evaluation

Give the same objective with one changed constraint:

```
budget = $10
```

versus:

```
budget = $1
```

The system should adapt strategy rather than merely fail identically.

---

# 272. Adversarial Evaluation

Deliberately introduce:

```
misleading evidence
false tool output
stale memory
ambiguous objective
contradictory sources
malicious capability
provider degradation
resource scarcity
```

The agent must distinguish:

```
uncertainty
from
truth
```

---

# 273. Novel-Task Evaluation

Novel tasks should vary:

```
domain
tooling
goal structure
environment
failure pattern
constraints
```

A benchmark is weak if the agent can memorize the benchmark's task decomposition.

---

# 274. Open-Ended Evaluation

Open-ended tasks should specify:

```
desired outcome
constraints
success conditions
```

but intentionally omit:

```
step-by-step plan
tool sequence
architecture
expected intermediate state
```

This is where true goal-directed autonomy is measured.

---

# 275. Autonomy Metrics

V3 should measure at least:

```
goal_success_rate
goal_completion_quality
human_intervention_rate
autonomous_decision_rate
recovery_success_rate
replan_success_rate
novel_task_success
long_horizon_survival
false_success_rate
unauthorized_effect_rate
evidence_coverage
verification_independence
resource_efficiency
strategy_improvement
```

No single number should replace the multidimensional report.

---

# 276. Intervention Taxonomy

Human intervention must be classified:

```
required
preventable
optional
informational
emergency
```

A successful run with unnecessary human prompts is not equivalent to a fully autonomous run.

---

# 277. Operator Burden Metric

Measure:

```
prompts_to_completion
manual_decisions
manual_restarts
manual_repairs
manual_tool_selection
manual_context_reinjection
```

The V3 goal is:

```
normal-flow operator burden → near zero
```

while preserving legitimate safety gates.

---

# 278. Autonomous Failure Quality

A failed run can still be high quality if it:

```
detected failure
localized cause
preserved state
contained effect
explained uncertainty
suggested next action
```

A successful run with hidden incorrectness is worse than an explicit blocked run.

---

# 279. System-Level Definition of Done

For a critical V3 milestone:

```
contract
+
implementation
+
integration
+
adversarial
+
chaos
+
live
+
long-horizon
+
novel-task
+
evidence
+
regression
```

The exact required subset depends on risk.

---

# 280. Deep Readiness Gates

Each major V3 subsystem should pass gates in order:

```
G0 — concept
G1 — contract
G2 — deterministic implementation
G3 — integrated behavior
G4 — adversarial behavior
G5 — failure/recovery
G6 — live controlled operation
G7 — long-horizon operation
G8 — novel-task behavior
G9 — self-optimization / evolution
```

A subsystem does not inherit a higher level merely because another subsystem achieved it.

---

# 281. No Hidden Maturity

A mature-looking interface must not hide immature internals.

For every capability the system should be able to expose:

```
availability
maturity
authority
limitations
last validation
known failures
```

---

# 282. Operational Transparency

The user should be able to inspect:

```
what agent is running
what goal it owns
what it believes
what it is waiting for
what it is doing
what capability it selected
what policy allowed
what evidence exists
what resources remain
```

This is observability for agency.

---

# 283. Explainability Without Chain-of-Thought Exposure

The system does not need to expose private reasoning.

It does need to expose **decision provenance**:

```
decision
reason category
supporting evidence
constraints
policy
expected outcome
```

This provides auditability without making hidden reasoning a dependency.

---

# 284. Agency Audit

The V3 should periodically answer:

```
What goals are active?
Why are they active?
What is blocked?
What resources are committed?
What assumptions are uncertain?
What authority is currently enabled?
What external systems are being affected?
What capabilities are degraded?
What safety restrictions are active?
```

---

# 285. Self-Inspection API

Provide structured inspection for:

```
agent
goals
memory
world
capabilities
providers
policy
resources
experiments
evolution
health
```

This enables both human debugging and agent self-observation.

---

# 286. Postmortem Engine

After major failures, automatically generate:

```
timeline
goal state
decisions
observations
actions
failures
root cause
containment
recovery
what should change
what should be remembered
what benchmark should be added
```

A postmortem should feed:

```
memory
strategy
benchmark
self-evolution
```

---

# 287. Failure Pattern Mining

Repeated postmortems should produce:

```
failure cluster
frequency
severity
common cause
affected capabilities
affected providers
recommended mitigation
```

This closes the loop between operational experience and evolution.

---

# 288. Knowledge → Policy Boundary

Learned knowledge must not automatically become authority.

Example:

```
"I learned that deleting old cache files is safe."
```

does not become:

```
permission to delete any cache anywhere
```

Learned procedures must remain subordinate to explicit policy.

---

# 289. Preference → Policy Boundary

User preference must not override system policy.

```
user prefers speed
```

does not authorize:

```
skip security verification
```

---

# 290. Experience → Truth Boundary

A successful past run does not prove all future runs are safe.

```
worked before
```

is evidence, not guarantee.

---

# 291. Capability → Trust Boundary

Capability availability does not imply capability trust.

```
available
≠
validated
≠
safe for every context
```

---

# 292. Provider → Authority Boundary

Provider substitution must never silently change authority.

```
Provider A can write
Provider B can read
```

does not mean:

```
B may now write
```

---

# 293. Memory → Context Boundary

Memory retrieval is not automatic permission to inject all stored information into active reasoning.

The system must still apply:

```
relevance
scope
privacy
authority
freshness
trust
```

---

# 294. Evolution → Authority Boundary

Self-evolution may improve capability.

It may not silently grant itself more authority.

Authority changes must require an explicit policy transition.

---

# 295. Meta-Agency Boundary

Meta-Agency may change:

```
which agents
which capabilities
which strategy
which context
```

It must not silently change:

```
who is authorized
what is forbidden
which secrets are accessible
which policies apply
```

---

# 296. The Trusted Computing Base

The V3 should explicitly identify its smallest trusted core.

Conceptually:

```
Policy Enforcement
Authorization
Sandbox Boundary
Evidence Integrity
State Integrity
Identity
Rollback / Recovery
```

Everything else should be treated as less trusted and subject to validation.

The smaller the trusted core, the easier the system is to reason about.

---

# 297. Minimize the Trusted Computing Base

Do not place the following inside the trusted core unnecessarily:

```
LLM output
agent prompts
provider plugins
downloaded tools
generated capabilities
memory
external content
benchmark fixtures
```

These should be treated as potentially untrusted inputs.

---

# 298. Prompt Injection Is an Environmental Threat

External content can contain instructions.

The system must distinguish:

```
DATA
```

from:

```
AUTHORIZED INSTRUCTION
```

The agent must not promote arbitrary external text into policy or authority.

---

# 299. Instruction Hierarchy

For every action, maintain conceptual precedence:

```
system policy
>
authority policy
>
goal constraints
>
task instructions
>
external data
```

External content cannot override higher-level authority.

---

# 300. Data/Instruction Separation

When processing:

```
web page
email
document
repository
issue
log
database record
```

the default interpretation is:

```
DATA
```

not:

```
COMMAND
```

Any conversion from data to instruction must be explicit and policy-controlled.

---

# 301. Self-Evolution Attack Surface

The self-evolution system is part of the attack surface.

A malicious or incorrect experience could attempt:

```
fake failure
fake benchmark
fake improvement
poisoned memory
biased metric
fabricated evidence
```

Therefore evolution input provenance must be verified.

---

# 302. Benchmark Integrity

The benchmark itself must be protected from the system under evaluation.

The evaluated agent should not be allowed to:

```
rewrite oracle
modify ground truth
delete failed cases
alter measurement
```

unless explicitly testing benchmark generation.

---

# 303. Evaluation Containment

Evaluation environments should prevent the agent from optimizing directly for the evaluator instead of the task.

Use:

```
hidden cases
novel variants
randomized parameters
unseen environments
held-out tasks
```

where appropriate.

---

# 304. Self-Generated Benchmark Trust

Benchmarks generated by the agent should initially be:

```
candidate benchmark
```

and become trusted regression benchmarks only after independent validation.

---

# 305. Autonomous Research Trust

Research outputs should include:

```
source identity
retrieval time
content hash where practical
reliability assessment
cross-source agreement
limitations
```

The agent must not collapse multiple derivative sources into apparent independent corroboration.

---

# 306. Research Memory Provenance

Knowledge derived from research should preserve:

```
source
quote/span reference where applicable
retrieval date
transformation
confidence
superseding information
```

This allows later revalidation.

---

# 307. Stale Research Recovery

When knowledge becomes stale:

```
STALE
 ↓
RESEARCH REQUIRED
 ↓
REVALIDATE
 ↓
UPDATE
```

Critical stale knowledge should block high-impact actions when policy requires freshness.

---

# 308. External System Contracts

For each important external integration:

```
identity
protocol
authentication
authorization
rate limit
failure semantics
consistency
idempotency
rollback capability
observability
```

Unknown external behavior should be treated as uncertainty.

---

# 309. Protocol Discovery Sandbox

When discovering an unknown service:

```
observe
 ↓
probe
 ↓
limit
 ↓
infer
 ↓
validate
```

Discovery must be safer than ordinary operation.

---

# 310. Unknown Environment First Contact

The first interaction with a new environment should be conservative.

Initial goals:

```
discover
inventory
classify
health check
authority check
```

Only then:

```
mutate
```

---

# 311. Safe Exploration Budget

Exploration should have explicit limits:

```
time
requests
storage
network
risk
irreversible effects
```

Curiosity cannot become an infinite resource sink.

---

# 312. Self-Monitoring of Curiosity

The agent should detect:

```
research loops
exploration without progress
tool accumulation
diminishing information gain
```

and terminate or redirect exploration.

---

# 313. Autonomous Waiting

Waiting is an active strategy.

The agent should model:

```
why waiting helps
what event is expected
when to wake
what happens if event never occurs
```

Example:

```
WAIT_FOR_DEPLOYMENT
timeout = 20m
poll interval = adaptive
fallback = investigate deployment manually
```

---

# 314. External Event Causality

When an event triggers action:

```
event
→ relevance
→ goal
→ decision
→ action
```

the entire causal path should be traceable.

This is essential for event-driven autonomy.

---

# 315. Continuous Agency Loop

A resident agent should operate through:

```
OBSERVE
 ↓
UPDATE WORLD
 ↓
UPDATE GOALS
 ↓
PRIORITIZE
 ↓
DECIDE
 ↓
ACT
 ↓
VERIFY
 ↓
LEARN
 ↓
WAIT / ACT AGAIN
```

This loop should not depend on a human opening the agent.

---

# 316. Agency Heartbeat

The resident agent should maintain a health heartbeat containing:

```
agent health
world model freshness
goal scheduler health
event ingestion health
memory health
capability availability
resource health
policy state
```

A missing heartbeat is itself observable.

---

# 317. Agent Liveness vs Agent Progress

An agent can be alive but not progressing.

Therefore distinguish:

```
LIVENESS
```

from:

```
PROGRESS
```

A process that continuously wakes and performs work without reducing goal distance is not healthy autonomy.

---

# 318. Progress Watchdog

Detect:

```
alive = true
progress = false
```

Then:

```
WATCHDOG
 ↓
DIAGNOSE
 ↓
REPLAN / RECOVER / GATE
```

---

# 319. Autonomous Resource Rebalancing

For a portfolio of goals, the scheduler may move resources:

```
Goal A
↓ lower expected value

Goal B
↓ urgent deadline

reallocate worker/model/budget
```

Every reallocation should be traceable to explicit policy and evidence.

---

# 320. Goal Bankruptcy

An objective may become economically irrational.

Concept:

```
remaining value
<
remaining cost + risk
```

The agent may recommend or execute:

```
ABANDON / DEFER / SUBSTITUTE
```

according to policy.

This is stronger than simply exhausting retry budgets.

---

# 321. Strategy Regret

After completion, compare:

```
chosen strategy
vs
known alternatives
```

Estimate:

```
regret
```

This creates training data for Strategy Evolution.

---

# 322. Policy Regret

Likewise:

```
policy decision
vs
actual outcome
```

can reveal:

```
overly restrictive
overly permissive
correct
```

Policy changes must still follow governance and should never be auto-amended merely from one failure.

---

# 323. Autonomy Calibration

Measure:

```
what agent believed it could do
vs
what it actually could do
```

This should improve:

```
Self-Model
Capability Discovery
Provider Routing
Human Gate timing
```

---

# 324. Confidence Calibration

Track:

```
confidence bucket
vs
actual correctness
```

A mature system should gradually improve calibration.

Confidence is not evidence.

It is a decision signal.

---

# 325. False Confidence Detector

Patterns:

```
high confidence
+
weak evidence
+
poor historical reliability
```

should reduce action authority or trigger verification.

---

# 326. Verification Diversity

Independent verification should vary along multiple axes:

```
different agent
different model
different provider
different execution path
different evidence source
different environment
```

The stronger the common dependencies, the weaker the claimed independence.

---

# 327. Verification Failure Handling

When verifier and builder disagree:

```
DISAGREEMENT
 ↓
PRESERVE BOTH CLAIMS
 ↓
COMPARE EVIDENCE
 ↓
ADVERSARIAL TEST
 ↓
RECONCILE
```

Do not resolve disagreement by majority vote.

---

# 328. Evidence Lineage

Every important evidence object should point backward:

```
evidence
← observation
← action
← decision
← goal
```

And forward:

```
evidence
→ verification
→ decision
→ outcome
```

This creates a bidirectional provenance graph.

---

# 329. Evidence Invalidation

When source evidence is invalidated:

```
evidence INVALID
 ↓
find dependent claims
 ↓
mark affected decisions
 ↓
re-evaluate outcomes
```

The system should not continue trusting a broken evidence chain.

---

# 330. Outcome Reconciliation

After delivery, compare:

```
expected outcome
vs
actual outcome
```

and record:

```
met
partial
unexpected
regressed
unknown
```

This closes the lifecycle loop.

---

# 331. Post-Delivery Observation

Delivery is not always the end.

For externally operating systems:

```
DELIVER
 ↓
MONITOR
 ↓
CONFIRM STABILITY
```

The agent should be able to detect post-delivery regressions and reopen the goal if policy allows.

---

# 332. Goal Reopening

Completed goals may need to reopen:

```
COMPLETED
 ↓
REGRESSION
 ↓
REOPENED
 ↓
REPAIR
```

This requires lineage:

```
same goal
new episode
new plan
new evidence
```

---

# 333. Continuous Maintenance Goals

For standing goals:

```
MAINTAIN DESIRED STATE
```

each repair should be an episode under a persistent parent goal.

This allows the system to learn:

```
maintenance frequency
common failures
cost
provider reliability
```

---

# 334. Agent Sleep Semantics

Sleep should be a real state:

```
ACTIVE
→ IDLE
→ CONSOLIDATING
→ SLEEPING
→ WAKING
→ ACTIVE
```

Before sleeping, the agent must persist enough state to resume safely.

---

# 335. Wake Reasons

A wake should be attributable to:

```
scheduled goal
external event
deadline
health alert
maintenance
user message
self-generated opportunity
recovery condition
```

---

# 336. Background Work Governance

Background activity must have:

```
scope
budget
priority
authority
stop condition
```

The agent should never silently create unlimited background work.

---

# 337. General Agency Contract

A V3 agent should expose a high-level contract:

```
INPUT
goal + constraints + authority + budget + risk

OUTPUT
outcome + evidence + state + unresolved uncertainty

BEHAVIOR
autonomous planning + execution + recovery + verification
```

This becomes the top-level contract around the V2 execution substrate.

---

# 338. Final V3 Architecture — Deep Form

```
                                EVOLVELOOP V3
                                      │
                         ┌────────────┴────────────┐
                         │     AGENCY SYSTEM       │
                         └────────────┬────────────┘
                                      │
                 ┌────────────────────┼────────────────────┐
                 │                    │                    │
              GOALS                WORLD                SELF
                 │                    │                    │
       ┌─────────┼─────────┐         │         ┌─────────┼─────────┐
       │         │         │         │         │         │         │
    portfolio  success   priority   model    memory   capability  health
    lifecycle  oracle    schedule   beliefs  identity  model      model
       │         │         │         │         │         │         │
       └─────────┴─────────┴─────────┼─────────┴─────────┴─────────┘
                                     │
                              META-REASONING
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                   PLAN            RESEARCH       SIMULATE
                     │               │               │
                     └───────────────┼───────────────┘
                                     │
                            CAPABILITY FABRIC
                                     │
                   ┌─────────────────┼─────────────────┐
                   │                 │                 │
               DISCOVERY         COMPOSITION       ACQUISITION
                   │                 │                 │
                   └─────────────────┼─────────────────┘
                                     │
                              POLICY / AUTHORITY
                                     │
                              SAFETY GOVERNOR
                                     │
                         ┌───────────┼───────────┐
                         │           │           │
                      SANDBOX    INVARIANTS   IDENTITY
                         │           │           │
                         └───────────┼───────────┘
                                     │
                               RUNTIME CORE
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                 PROVIDERS        AGENTS         EFFECTS
                     │               │               │
                     └───────────────┼───────────────┘
                                     │
                              OBSERVABILITY
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                  EVIDENCE       TELEMETRY       PROVENANCE
                     │               │               │
                     └───────────────┼───────────────┘
                                     │
                              VERIFICATION
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                 VERIFIER        ADVERSARY        DISSENT
                     │               │               │
                     └───────────────┼───────────────┘
                                     │
                               EXPERIENCE
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                  MEMORY         STRATEGY         FAILURE
                     │               │               │
                     └───────────────┼───────────────┘
                                     │
                              SELF-EVOLUTION
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
                CAPABILITY         AGENT          RUNTIME
                EVOLUTION        EVOLUTION       EVOLUTION
                     │               │               │
                     └───────────────┼───────────────┘
                                     │
                           CANARY / MONITOR / ROLLBACK
                                     │
                                     ▼
                              PERSISTENT AGENT
```

---

# 339. The Ultimate Autonomy Loop

The final loop is not one loop.

It is a stack of nested control loops:

```
L0 — ACTION LOOP
     execute → observe → verify

L1 — TASK LOOP
     task → execute → repair → complete

L2 — GOAL LOOP
     goal → plan → execute → replan → satisfy

L3 — AGENCY LOOP
     observe world → prioritize goals → act → learn

L4 — EXPERIENCE LOOP
     outcomes → memory → strategy update

L5 — CAPABILITY LOOP
     need → discover/acquire/create → validate

L6 — SELF-MAINTENANCE LOOP
     health → diagnose → repair

L7 — EVOLUTION LOOP
     observe system → propose → isolate → benchmark → promote

L8 — META-AGENCY LOOP
     determine what kind of agent/system is needed
     → compose capabilities/agents
     → execute
     → learn
```

A system approaching autonomous generality must operate across all relevant levels simultaneously.

---

# 340. The Ultimate Control Principle

For every layer:

```
PERCEIVE
↓
MODEL
↓
DECIDE
↓
ACT
↓
OBSERVE
↓
VERIFY
↓
LEARN
```

And when the result is unsatisfactory:

```
DIAGNOSE
↓
CHANGE STRATEGY
↓
REPEAT
```

And when the system itself is inadequate:

```
EVOLVE
```

This is the deepest definition of the EvolveLoop.

---

# 341. Final Quality Doctrine — No Shallow Implementation

The following statements are explicitly prohibited as definitions of V3 maturity:

```
"works in the demo"
"the LLM can do it"
"the API exists"
"the prompt tells it what to do"
"the tests pass"
"the mock passes"
"the happy path works"
"the benchmark is green"
"the agent said it succeeded"
```

Acceptable evidence must instead answer:

```
Does it work?
Under what conditions?
How often?
For how long?
What happens when it fails?
Can it recover?
Can it detect that it failed?
Can it prove success?
Can an independent verifier disagree?
Can the world change underneath it?
Can its memory be wrong?
Can a provider disappear?
Can a capability be malicious?
Can resources run out?
Can the goal become obsolete?
Can the strategy become uneconomical?
Can the system evolve safely?
Can it operate on a task we did not specifically anticipate?
```

---

# 342. Ultimate V3 Definition of Done

V3 is not complete because every planned module exists.

V3 is complete only when the **systemic behavior** demonstrates:

```
autonomous goal pursuit
+
persistent agency
+
world awareness
+
long-horizon stability
+
uncertainty management
+
active research
+
capability discovery
+
capability acquisition
+
self-debugging
+
self-testing
+
independent verification
+
real sandboxing
+
resource governance
+
continuous recovery
+
multi-agent coordination
+
external-world operation
+
memory consolidation
+
self-maintenance
+
controlled self-evolution
+
novel-task performance
```

with:

```
zero silent failure
explicit authority
strong evidence
independent verification
rollback
and measurable operational limits
```

---

# 343. Final Philosophy

> **The objective of EvolveLoop V3 is not to create an agent that can perform more actions. It is to create an agent that can govern a continuing process of perception, reasoning, action, verification, learning, recovery, and evolution without requiring a human to continuously operate it.**

And:

> **The more autonomous the system becomes, the more explicit its boundaries, evidence, identity, provenance, recovery semantics, and verification requirements must become.**

And finally:

> **Total autonomy is not the removal of control. It is the transfer of operational control from the human operator to the agent, while retaining explicit machine-enforced authority boundaries.**  
> """