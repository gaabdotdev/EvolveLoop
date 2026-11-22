# V4.0 — Auditoria de mensagens (evidência M7)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §3 (Auditoria de mensagens)  
**Fontes:** `cli-inconsistency-inventory.md` §4–§5; `terminal-visual-guide.md` §5; `interaction-principles.md` §4  
**Método:** revisão estática das amostras inventariadas + padrões-alvo do guia; re-amostra pontual no código

---

## 1. Critérios de clareza / precisão

| Intenção | Deve | Não deve |
|---|---|---|
| Erro | o que falhou + recuperação | só stack |
| Espera | motivo + duração | idle sem causa |
| Sucesso | mudanças + evidência + limitações | “PASS”/“Pronto” vazios |
| Bloqueio | causa + próxima ação | só código interno |
| Cancelamento | o que parou + o que permanece | confundir cancel UI vs Task |

---

## 2. Revisão por categoria (amostras inventário §4)

### 2.1 Erro — clareza

| Mensagem | Veredito | Motivo |
|---|---|---|
| `Erro ao iniciar execução: …` | Parcial | Identifica falha; “Próximo” nem sempre estruturado (guia §5.1) |
| `Intenção não gerou Goal Contract. Reformule.` | OK operacional | Ação clara; jargão “Goal Contract” vs Plan (glossário) |
| `evolve: missing …/evolve.js — run: …` | OK | Causa + comando de correção |
| `Required: --data-dir <path>` | OK script | Preciso; superfície ampla |
| `Job {id} is not pending…` | Parcial | Legado Job fora do modelo mental default |

### 2.2 Espera

| Mensagem | Veredito | Motivo |
|---|---|---|
| `aguardando resposta do modelo (Ns)...` | OK | Motivo + tempo |
| `último sinal há Ns` | OK | Progresso/espera |
| `Já existe sessão MSO ativa…` | Parcial | Claro; “MSO” ≠ Orchestrator produto |
| `Em pausa (Ctrl+P).` / `Retomado.` | OK | Estado imediato |

### 2.3 Bloqueio

| Mensagem | Veredito | Motivo |
|---|---|---|
| `Execução bloqueada pelo adapter: {code}.…` | Parcial | Causa; remédio depende do texto completo |
| `Adapter indisponível … MSO → BLOCKED.` | Parcial | Estado claro; jargão MSO |
| `Nenhum Goal Contract com MSO confirmado.…` | Parcial | Bloqueio claro; vocabulário pré-V4 |
| `Entrega Final · BLOCKED` | OK se houver causa | Título só; corpo deve explicar |

### 2.4 Cancelamento

| Mensagem | Veredito | Motivo |
|---|---|---|
| `Confirmação cancelada.` | OK | Escopo = confirmação UI |
| `Interrompido (Ctrl+C).` | Parcial | Não diz o que permanece |
| `⏹ Interrompendo…` / force `✖ Encerramento forçado…` | OK | Distingue soft vs force |
| `Daemon OFF: fechar o terminal…` | OK | Consequência explícita |

### 2.5 Sucesso / progresso positivo

Ver §3 (foco do indicador §3).

---

## 3. Mensagens que afirmam sucesso sem evidência verificável

Critério Identity §3 + Tests §3: conclusão/sucesso sem alterações, testes, evidências ou limitações verificáveis.

Fonte primária: inventário §5 (reconfirmada por amostra de código nesta sessão).

| # | Afirmação | Material? | Reconfirmação 2026-11-22 |
|---|---|---|---|
| 1 | `Entrega Final · PASS` após kick sem verification | **Sim** | `App.tsx` tipa `verification?`; inventário: default PASS sem `TRUE-FULL-PASS` |
| 2 | Diff `(sem alterações)` sob título PASS | **Sim** | inventário `DeliveryCard.tsx` |
| 3 | `Delegação concluída com status ok` | **Sim** | `shell-start-execution.ts:337` re-lido |
| 4 | Banner `Estado: Pronto` (INIT/IDLE) | **Sim** | `banner.ts:76` re-lido |
| 5 | `Pronto. Setup concluído.` | **Sim** | `first-run-setup.ts:265` re-lido |
| 6 | Painel `0 tokens` sem provenance | **Sim** | inventário `status-panel.ts:45` |
| 7 | Detach: “MSO continua rodando…” sem check vivo | **Sim** | inventário `keybindings.ts` |
| 8 | `Histórico visual limpo.` | Cosmético / risco baixo | Sucesso de UI local |
| 9 | Delivery `PASS` com tokens `—` | **Sim** | inventário App.tsx / formatDeliveryTokens |

### Contagens

| Conjunto | Contagem |
|---|---|
| Itens inventário §5 | **9** |
| Materiais (1–7, 9) | **8** |
| Cosmético (8) | **1** |
| **Indicador §3 (sucesso sem evidência verificável)** | **8** (materiais) ou **9** (lista completa inventário) |

**Número reportado em `indicators.md`:** **8 materiais** (alinhado ao inventário §7: “1–7 e 9 materiais; 8 cosmético”), com nota de que a lista completa tem 9 itens.

### Controlo positivo (não conta como falso sucesso)

- Aviso explícito de que `TRUE-FULL-PASS` exige Evidence Validator (`shell-start-execution.ts:335-337`) — alinhado ao princípio 5, **contradito** pela TUI item #1.

---

## 4. Alinhamento ao guia visual (alvo vs atual)

| Padrão guia §5 | Estado atual | Ação |
|---|---|---|
| Sucesso com Verificação ≠ “—” | Violado (#1, #9) | V4.1 |
| Não usar verde/“Pronto” sem evidência | Violado (#4, #5) | V4.1 |
| Cancelamento diz o que permanece | Parcial | V4.1 copy |
| Espera com motivo + tempo | Majoritariamente OK | preservar |

---

## 5. Resumo

- Amostras cobrem erro / espera / bloqueio / sucesso / cancelamento.  
- Principais falhas de precisão: **sucesso sem evidência** (8 materiais).  
- Vocabulário legado (MSO, Goal Contract, Workers) reduz clareza mesmo quando a intenção é correta.  
- **Nenhuma correção de mensagem** foi feita nesta tarefa M7 (só evidência).

---

*Fim — message-audit.md*
