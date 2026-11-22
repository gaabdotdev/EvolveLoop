# EvolveLoop V4.1 — Guia de uso cotidiano

**Público:** quem quer abrir → Task → Plan → acompanhar → intervir → Delivery  
**Não é:** referência completa de grupos CLI (ver [`user-guide-advanced.md`](./user-guide-advanced.md)).  
**Data:** 2026-11-22

---

## 1. Abrir

```bash
cd /caminho/do/workspace
evolve
```

- Sem argumentos: **Ink TUI** (TTY) ou REPL PT (non-TTY) — jornada default.
- `evolve tui run|status` é **ops Core**, não a jornada (V4.3).
- Estado em `<cwd>/.evolveloop/`.
- Home mostra workspace + Tasks curtas + CTA iniciar/retomar (sem painel de métricas).

Help curto:

```bash
evolve --help
# ou
evolve help
```

Status produto: `evolve status` / `/status` → **Task/Session** (não o board `tui status`).

---

## 2. Iniciar uma Task

Na TUI, descreva o resultado em linguagem natural (placeholder “Descreva a tarefa…”).

Alternativa CLI:

```bash
evolve intent --text "Adicionar healthcheck HTTP"
```

- Grill-Me só pergunta quando altera plano/risco.
- Unidade de produto: **Task** (não precisa memorizar Goal/Circuit/Job no dia a dia).

---

## 3. Plano

Antes de executar, a TUI mostra o cartão **Plan**: objetivo, critérios, etapas, Agents, riscos, autónomo vs Approval.

Na TUI:

```text
/plan
```

---

## 4. Acompanhar

- Footer L1: **Task / Session / Agents** (não Workers).
- Tokens: **Orchestrator** · Agents (literais MSO só verbose/L5).
- Logs brutos não são o default.
- Slash:

```text
/status
```

---

## 5. Intervir

| Ação | Como |
|---|---|
| Approval | Painel Approval (o quê / porquê / impacto) ou `/approvals` |
| Pause Task | `Ctrl+P` ou `/pause` ou digite `pausar` |
| Retomar | `Ctrl+P` de novo ou `continuar` |
| Cancelar Task | `/cancel` (confirmação) — **destrutivo** |
| Sair da TUI | `Ctrl+D` detach — **não** mata Agent |

CLI:

```bash
evolve pause
evolve resume
evolve approvals list
```

---

## 6. Entrega

Cartão **Delivery** separa:

- processo terminou
- objetivo **validado** (PASS só com execução local `local_execution` exit 0)
- atestado externo (`--exit-code`) → **ATTESTED**, não é PASS verificado

```text
/delivery
/delivery validate --run "npm test"
```

Não trate UNVERIFIED nem ATTESTED como sucesso verificado.

---

## 7. Agents (opcional)

```text
/agents
```

```bash
evolve agents
evolve agents inspect <id>
```

**Agent Handles** (attach/logs em sessão auxiliar) estão **OFF por padrão**. A jornada completa funciona sem eles. Ver [`agent-handles.md`](./agent-handles.md).

---

## 8. Terminal estreito

Com menos de ~72 colunas a TUI avisa e empilha L0–L3. Continua utilizável; não é dashboard.

---

## 9. Onde ir a seguir

| Precisa de… | Doc / comando |
|---|---|
| Handles on/off, tmux/Zellij | [`agent-handles.md`](./agent-handles.md) |
| Todos os grupos CLI | `evolve help advanced` · [`user-guide-advanced.md`](./user-guide-advanced.md) |
| Glossário / estados | `docs/v4/V4.0/` · [`../V4.3/identity-copy-map.md`](../V4.3/identity-copy-map.md) |
| Quickstart / limites V4.3 | [`../V4.3/quickstart.md`](../V4.3/quickstart.md) · [`../V4.3/known-limits.md`](../V4.3/known-limits.md) |

---

*Fim — user-guide-everyday (P2-6).*
