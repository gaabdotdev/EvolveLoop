# V4.0 — Guia visual para terminal

**Status:** diretrizes de apresentação (legibilidade > estética)  
**Data:** 2026-11-22  
**Âmbito:** Ink TUI, shell REPL, saída `print` humana  
**Fora de escopo:** dashboard gráfico; skin por preferência sem teste de leitura

Justificativa geral: o operador lê estado sob pressão (bloqueio, falha, aprovação). Contraste, previsibilidade e hierarquia tipográfica reduzem tempo até “o que fazer agora” — métrica em `V4-Tests-and-Benchmarks.md` §2/§3.

---

## 1. Hierarquia tipográfica

| Nível | Uso | Forma |
|---|---|---|
| **L0 — Ação** | Approval pendente, erro bloqueante | Linha própria no topo do viewport útil; peso máximo; nunca abaixo do log |
| **L1 — Estado** | Task + Session + label **Orchestrator** (não “MSO” no default) | Uma linha-resumo estável (banner/status); atualiza in-place |
| **L2 — Contexto** | Workspace, ids curtos, Agent count | Secundário; truncar ids no meio se necessário |
| **L3 — Progresso** | Fase, “último sinal”, spinner/atividade | Compacto; 1–3 linhas |
| **L4 — Corpo** | Delivery, Plan review, mensagens | Blocos com título curto + campos |
| **L5 — Detalhe** | Logs, JSON, stack | Monospace denso; só sob demanda |

**Densidade:** default = L0–L3 visíveis; L4 quando há Plan/Delivery; L5 oculto até `/status`, scroll de atividade ou flag verbose.

**Não:** múltiplos banners competindo; footer com jargão (`Workers`) diferente do glossário (`Agents`).

---

## 2. Cor (semântica, não decoração)

Assumir terminal 16/256 cores; degradar para símbolos se `NO_COLOR` ou sem ANSI.

| Intenção | Papel da cor | Exemplos de significado |
|---|---|---|
| Neutro | foreground default | texto, ids |
| Progresso | cyan/blue (uma família só) | Em progresso, Validando |
| Espera | amarelo suave / dim | WAITING, aguardando modelo |
| Aviso | amarelo | Parcial, Limite, Expirada, STALE |
| Bloqueio | magenta ou amarelo forte (escolher **um**) | BLOCKED |
| Erro | vermelho | FAILED, erro de comando |
| Sucesso | verde | Concluída / Delivery Aceita **com evidência** |
| Cancelamento | vermelho dim / cinza | CANCELLED, interrupção |

**Regras:**

1. Cor **reforça** o símbolo e o texto; nunca é o único canal (daltonismo / NO_COLOR).
2. Não usar verde para “kick started” ou “Pronto” sem sucesso verificável.
3. Uma intenção = uma família de cor em toda a CLI (Ink + shell).

---

## 3. Símbolos

Preferir um conjunto pequeno e estável (já há precedentes no código: `⏸`, `⏹`, `✖`, `↪` em `keybindings.ts`).

| Intenção | Símbolo sugerido (alvo) | Nota |
|---|---|---|
| Progresso | `…` / spinner Ink / `→` | Evitar emoji decorativo |
| Espera | `⏸` ou `…` | Mesmo símbolo para pause e espera longa exige texto ao lado |
| Bloqueio | `■` ou `Blocked:` textual | Texto obrigatório |
| Erro | `✖` | Já usado em encerramento forçado |
| Sucesso | `✔` | Só com evidência |
| Cancelamento | `⏹` / `✖` | Distinguir soft cancel vs force no texto |
| Ação do usuário | `?` ou `[Y/n]` | Approval |
| Detach/info | `↪` | Já em detach daemon |

**Proibido:** clusters de ícones sem legenda; badges flutuantes estilo dashboard.

---

## 4. Espaçamento e layout

| Região | Regra |
|---|---|
| Banner / status | 1–2 linhas; sem wrap agressivo em largura ≥ 80 |
| Painel lateral/status | Rótulos alinhados (`Chave:` valor); **rótulo = entidade real** (não “Tarefa:” + work_id) |
| Cartões (Plan, Delivery, Approval) | Título + campos; sem moldura ornamental se não ajudar leitura |
| Separadores | Linha simples ou `│`; evitar caixas duplas |
| Terminal estreito | Empilhar L0→L3; truncar L2; nunca esconder L0 |
| Altura baixa | Priorizar L0 e L1; Delivery scrollável |

Densidade “confortável”: ~1 linha em branco entre blocos L4; zero entre linhas L1–L3.

---

## 5. Padrões por intenção (conteúdo + forma)

### 5.1 Erro

```text
✖ <o que falhou>
  Causa: <motivo curto>
  Próximo: <ação recuperável>
```

- Cor: erro.  
- Não substituir por stacktrace; stack em L5.  
- Amostras atuais: `Erro ao iniciar execução:` (`App.tsx:299`); `evolve: missing …/evolve.js` (`bin/evolve:17`).

### 5.2 Aviso

```text
! <condição>
  Impacto: …
  Pode continuar: sim/não + como
```

- Cor: aviso.  
- Exemplos: “Pronto com avisos (N)” (`first-run-setup.ts:264`) — manter honestidade; não promover a sucesso pleno.

### 5.3 Progresso

```text
→ Task <id-curto> · <estado produto>
  Session: <fase MSO traduzida>
  Agents: <n ativos> · último sinal há <Ns>
```

- Cor: progresso.  
- Atualizar in-place; não spammar nova linha a cada tick no default.  
- Amostra alvo V4.3: `Session → validando (adapter status=…)` (`shell-start-execution.ts`) — literais MSO só L5.

### 5.4 Espera

```text
… Aguardando <motivo>
  há <Ns>
```

- Cor: espera.  
- Amostras: `aguardando resposta do modelo (Ns)...` (`activity-window.ts:92`); `Já existe sessão MSO ativa` (`shell-start-execution.ts:98`).

### 5.5 Sucesso

```text
✔ Delivery Aceita
  Alterações: <diff resumo | (sem alterações) + limitação>
  Verificação: <pass|fail|indisponível>
  Limitações: <…>
```

- Cor: sucesso **somente** se verificação não for “—”.  
- **Proibido no alvo:** título `Entrega Final · PASS` com `Verificação: —` (inventário §5 #1).

### 5.6 Cancelamento

```text
⏹ <o que foi cancelado>
  Permanece: <daemon/arquivos/estado>
  Para retomar: <comando ou —>
```

- Amostras: `Confirmação cancelada.` (`App.tsx:440`); `Interrompido (Ctrl+C).` (`App.tsx:186`); force `✖ Encerramento forçado…` (`keybindings.ts:30-31`).

---

## 6. Labels de estado (apresentação inequívoca)

Usar os nomes de produto de `state-matrix.md` (PT operacional), não misturar literais EN no default:

| Evitar no default | Preferir |
|---|---|
| `TRUE-FULL-PASS` cru | “Session concluída (verificada)” |
| `TRUE_PASS` cru | “Task concluída” |
| Delivery `PASS` sem contexto | “Entrega aceita” |
| `Workers` | `Agents` |
| `Pronto` para MSO `INIT` | “Aguardando entrada” ou “Session: início” |

Literais EN podem aparecer em `print` JSON e modo verbose.

---

## 7. Acessibilidade e robustez

- Respeitar `NO_COLOR` / não-TTY: símbolos + texto suficientes.
- Largura mínima alvo: 72 colunas para jornada; abaixo disso, empilhar.
- Não depender de ligatures ou Nerd Fonts.
- Mensagens PT na TUI/shell humano; EN OK em APIs.

---

## 8. Checklist de revisão visual

- [ ] L0 (ação) nunca abaixo de log
- [ ] Uma família de cor por intenção
- [ ] Sucesso verde só com evidência
- [ ] Rótulos = glossário oficial
- [ ] Terminal estreito ainda mostra bloqueio/Approval
- [ ] Sem dashboard; sem estética órfã de legibilidade

---

*Fim — Guia visual (parte do entregável 4).*
