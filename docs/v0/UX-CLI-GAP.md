# UX CLI GAP — EvolveLoop vs especificação UX 0.1

**Data:** 2026-11-22  
**Escopo (somente análise):** `orchestrator/src/v3/evolve-shell/` + `orchestrator/src/cli/evolve.ts`  
**Spec:** `/home/gaab/Downloads/especifica_o_de_ux_e_micro_intera_es_da_cli_evolveloop.md` (v0.1)  
**Método:** leitura estática + `rg`/`ls`; **sem implementação**.  
**Wiki grounding:** pack `EvolveLoop` ausente no índice do `ground.sh` (`PACK_NOT_FOUND`); vault tem `EvolveLoop/log.md` apenas — contratos UX da CLI **não** estão no corpus wiki (GAP wiki).

**Legenda:** `PRESENTE` = contrato UX da spec coberto no shell/CLI analisados · `PARCIAL` = pedaço existe, faltam requisitos da spec · `AUSENTE` = não há implementação observável no shell/CLI analisados (backends relacionados, se existirem, são notados sem contar como UX).

---

## Resumo

| # | Item | Status |
|---|------|--------|
| 1 | Banner Núcleo+Órbita 8 linhas + responsividade | **AUSENTE** |
| 2 | Layout 3 zonas (stream / árvore / input+rodapé fixo) | **AUSENTE** |
| 3 | Rodapé 3 linhas telemetria honesta | **AUSENTE** |
| 4 | Grill-Me UX (scan / N/M / cartão Goal Contract) | **PARCIAL** |
| 5 | Roteamento local 0 tok + tag `[local · 0 tok]` | **PARCIAL** |
| 6 | UI BLOCKED / Capability Gate (A/N/C) | **AUSENTE** |
| 7 | Mensagem fallback/cooldown provider 1 linha | **AUSENTE** |
| 8 | Multi-terminal daemon attach no banner/HUD | **PARCIAL** |
| 9 | Cores semânticas (ciano/verde/amarelo/vermelho/cinza) | **AUSENTE** |
| 10 | Keybindings Ctrl+P / Ctrl+C 1×·2× / Ctrl+D | **PARCIAL** |

Contagem: **PRESENTE 0** · **PARCIAL 4** · **AUSENTE 6**.

---

## 1. Banner Núcleo+Órbita 8 linhas (boot único) + responsividade ≥80 / &lt;80 / `NO_COLOR`

**Status:** AUSENTE

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/repl.ts`, `status-panel.ts` |
| Evidência | Boot emite texto linear (`EvolveLoop — canal conversacional…`) + caixa `renderStatusPanelPt` (7 linhas `┌─ EvolveLoop…`), **não** o ASCII Núcleo+Órbita de 8 linhas da spec. Sem leitura de `process.stdout.columns`, sem ramo compacto &lt;80, sem tratamento `NO_COLOR` / pipe no shell. `rg` em evolve-shell+evolve.ts **não** encontra `banner`. |

---

## 2. Layout 3 zonas (stream, árvore agentes colapsável 4–6 linhas, input+rodapé fixo)

**Status:** AUSENTE

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/repl.ts` |
| Evidência | REPL sequencial: `console.log` / `readline.question("evolve> ")`. Não há zona intermediária de árvore de agentes (`├─ agy…`, `+ N queued`), nem âncora de rodapé fixo abaixo do input. O painel de status é **impresso no stream**, não fixo. (Existe `evolve tui` / `status-board.ts` fora do shell conversacional — não implementa as 3 zonas da spec.) |

---

## 3. Rodapé 3 linhas telemetria honesta (MSO, sandbox, ctx%, tok MSO vs Workers com `reported`\|`estimated`\|`UNAVAILABLE`)

**Status:** AUSENTE

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/status-panel.ts` |
| Evidência | `renderStatusPanelPt` mostra MSO / Meta / Tarefa / Modelo/Provider / Avisos — formato de caixa, **não** as 3 linhas `[ESTADO] · tasks · Sandbox` / `MSO · ctx% · tok │ Workers (origem)` / `path · branch · atalhos`. Sem campos sandbox, `ctx`, tokens MSO vs Workers, nem origem `reported`\|`estimated`\|`UNAVAILABLE`. `rg` em evolve-shell+evolve.ts **não** encontra `UNAVAILABLE`. String `"local/determinístico (Grill-Me 0 tokens)"` não substitui honestidade de métrica (risco de `0` sem provenance). |

---

## 4. Grill-Me UX (scan 1 linha, perguntas N/M com padrão recomendado, cartão Goal Contract ~5 linhas)

**Status:** PARCIAL

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/repl.ts`; `orchestrator/src/v3/grill-me/session.ts` (`formatQuestionForUser`, `summarizeContractLines`); scan em `orchestrator/src/v3/workspace-scan/silent-scan.ts` (via `intent-flow`) |
| Evidência | **Presente:** perguntas `Pergunta N/M` + `Recomendação (Enter/ok): …`; cartão via `summary_lines` (~6 linhas: Goal Contract, Objetivo, Escopo, Fora, Aceite, SQLite). **Ausente no shell:** indicador de 1 linha do scan (`⠋ Lendo workspace…`) — `silentScan` corre sem feedback UX; rótulo `[Grill-Me N/M]` e texto “Padrão recomendado”; cartão com Riscos + Versão `v1` + confirmação Enter/sim dedicada (REPL confirma MSO automaticamente com `confirm_mso: true` após respostas). |

---

## 5. Roteamento local operacional 0 tok com tag `[local · 0 tok]`

**Status:** PARCIAL

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/repl.ts` (comando `status`); `orchestrator/src/v3/grill-me/trivial-bypass.ts`; entrada CLI `evolve status\|pause\|…` em `evolve.ts` |
| Evidência | Bypass trivial zero-token + mensagens com “(0 tokens)” / “zero tokens” existem. Tag visual exacta **`[local · 0 tok]`** **não** aparece no shell nem no bypass. |

---

## 6. UI BLOCKED / Capability Gate (aprovar / negar / cancelar)

**Status:** AUSENTE

| Campo | Valor |
|-------|--------|
| Caminhos | shell: — · backend relacionado (não UX): `orchestrator/src/v3/security/capability-gate.ts`; `evolve.ts` só mapeia exit code `BLOCKED` em `circuit run` |
| Evidência | Nenhum bloco destacado no shell com quem pediu / ação / motivo / `[A]provar` · `[N]egar` · `[C]ancelar`. `rg` por UI de aprovação em `cli/` sem matches. |

---

## 7. Mensagem fallback / cooldown provider 1 linha

**Status:** AUSENTE

| Campo | Valor |
|-------|--------|
| Caminhos | shell: — · backend relacionado: `orchestrator/src/v3/model-providers/provider-fault.ts`, `orchestrator/src/v3/mso/failure.ts` |
| Evidência | evolve-shell não emite linha no formato `⚠ Infra: … (cooldown …) → fallback para …`. Sem integração EventBus→stream no REPL. |

---

## 8. Multi-terminal daemon attach (`Daemon: ON attached · N clientes`)

**Status:** PARCIAL

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/cli/evolve.ts` (`daemon start\|ping\|status`); `orchestrator/src/v3/daemon/uds.ts` (`clients` em `status_ok`) |
| Evidência | Daemon UDS com contagem de clientes e nota JSON `client Ctrl+D does not kill runs`. Shell default **não** auto-attach, **não** imprime `Daemon: ON (attached · N clientes)` no boot, **não** sincroniza Inbox entre terminais no stream do REPL. |

---

## 9. Cores semânticas (ciano / verde / amarelo / vermelho / cinza)

**Status:** AUSENTE

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/*` |
| Evidência | Sem ANSI/`chalk`/códigos de cor no módulo evolve-shell (`rg` color/ANSI vazio). Output plain text. |

---

## 10. Keybindings Ctrl+P pause, Ctrl+C 1×/2×, Ctrl+D detach

**Status:** PARCIAL

| Campo | Valor |
|-------|--------|
| Caminhos | `orchestrator/src/v3/evolve-shell/keybindings.ts`, `repl.ts`; docs `docs/v0/CLI-KEYBINDINGS.md` |
| Evidência | **Presente:** `Ctrl+P` → pause; `Ctrl+C` / SIGINT → interrupção graciosa (exit 130). **Ausente:** segundo `Ctrl+C` em 2s → SIGKILL forçado; `Ctrl+D` detach (ações tipadas só `"pause" \| "interrupt"`). Doc v0 lista apenas Ctrl+P e Ctrl+C. |

---

## Notas de fronteira (não elevam status UX)

- Honestidade `reported`\|`estimated`\|`UNAVAILABLE` existe em módulos de segurança/adapters/ledger — **fora** do HUD do shell.
- Capability Gate e provider fault/cooldown existem como runtime — **sem** micro-interação CLI da spec.
- `evolve tui status` é board read-only separado, não o layout 3 zonas.

---

## Anexo — saídas brutas + exit codes

Comandos executados em `/home/gaab/orca/workspaces/EvolveLoop/seagrass` (2026-11-22).

### A) `rg -n "banner|UNAVAILABLE|Ctrl\\+D|status-panel|attachKeybindings" orchestrator/src/v3/evolve-shell orchestrator/src/cli/evolve.ts`

```text
orchestrator/src/cli/evolve.ts:313:          message: "listening; Ctrl+C stops daemon; client Ctrl+D does not kill runs",
orchestrator/src/v3/evolve-shell/keybindings.ts:32:export function attachKeybindings(
orchestrator/src/v3/evolve-shell/index.ts:7:} from "./status-panel.js";
orchestrator/src/v3/evolve-shell/index.ts:9:  attachKeybindings,
orchestrator/src/v3/evolve-shell/repl.ts:10:import { attachKeybindings, attachSigint, type KeybindingController } from "./keybindings.js";
orchestrator/src/v3/evolve-shell/repl.ts:11:import { buildStatusPanel, renderStatusPanelPt } from "./status-panel.js";
orchestrator/src/v3/evolve-shell/repl.ts:101:    keyCtrl = attachKeybindings(process.stdin, { onPause, onInterrupt });
```

**exit code:** `0`

Observação: hits só para `Ctrl+D` (mensagem do daemon), `status-panel` e `attachKeybindings`. **Zero** hits para `banner` ou `UNAVAILABLE` nestes caminhos.

### B) `ls -la orchestrator/src/v3/evolve-shell/`

```text
total 44
drwxrwxr-x  2 gaab gaab 4096 Nov 21 17:06 .
drwxrwxr-x 50 gaab gaab 4096 Nov 21 19:20 ..
-rw-rw-r--  1 gaab gaab 9964 Nov 21 17:13 first-run-setup.ts
-rw-rw-r--  1 gaab gaab  736 Nov 21 17:10 index.ts
-rw-rw-r--  1 gaab gaab 2346 Nov 21 15:26 keybindings.ts
-rw-rw-r--  1 gaab gaab 7293 Nov 21 15:28 repl.ts
-rw-rw-r--  1 gaab gaab 2327 Nov 21 15:34 status-panel.ts
-rw-rw-r--  1 gaab gaab 2459 Nov 21 15:26 workspace-session.ts
```

**exit code:** `0`

### C) `git -C /home/gaab/orca/workspaces/EvolveLoop/seagrass diff --stat -- docs/v0/UX-CLI-GAP.md`

```text
(vazio — ficheiro ainda untracked; `git diff` não lista untracked)
```

**exit code:** `0`

### D) `git -C /home/gaab/orca/workspaces/EvolveLoop/seagrass status -sb -- docs/v0/UX-CLI-GAP.md`

```text
## chore/v0-consolidation
?? docs/v0/UX-CLI-GAP.md
```

**exit code:** `0`
