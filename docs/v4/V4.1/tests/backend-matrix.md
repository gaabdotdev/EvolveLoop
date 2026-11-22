# V4.1 — Backend matrix (esta máquina)

**Data (UTC):** 2026-11-22T17:34Z  
**Host:** Linux 6.12.88+deb13-amd64 · Node v22.15.0

---

## Presença

| Ferramenta | Presente? | Evidência |
|---|---|---|
| tmux | **Sim** | `which tmux` → `/usr/bin/tmux` exit 0; `tmux -V` → `tmux 3.5a` |
| Zellij | **Não** | `which zellij` → exit 1; `command not found: zellij` |
| CLI fallback | **Sim** | código `attach.ts` + dogfood |

---

## Comportamento observado

| Cenário | Resultado |
|---|---|
| Handles OFF | Nenhuma sessão auxiliar; attach soft-fail exit 0 |
| Handles ON + tmux presente + sem ProcessSession | Mensagem: tmux detetado → **fallback CLI**; exit 0; Task/Agent não falham |
| Handles ON + sem tmux/zellij (mock `hasBinary:false`) | `backend: cli_fallback`; ok=true; não bloqueia |
| Zellij nesta máquina | **N/A** — binário ausente; path Zellij não exercitado live |
| Fechar viewer | `killed_agent: false`, `session_cancelled: false` |

Detalhe de comandos: `agent-handles-matrix.md`.

---

## Gate §7 (V4.1)

> nenhuma dependência de backend auxiliar

**Cumprido nesta máquina:** Tasks/`agents inspect`/jornada unitária funcionam com Handles OFF e sem Zellij; com tmux presente o attach não exige sessão auxiliar bem-sucedida.

---

*Fim — backend-matrix.md*
