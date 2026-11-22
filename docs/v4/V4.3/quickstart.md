# V4.3 — Quickstart

**Público:** install limpa / primeiro uso  
**Não declara:** estabilidade de produto (gate §9 em aberto)  
**Data:** 2026-11-22

---

## Requisitos

- **Node ≥ 22.5.0** (`orchestrator/package.json` engines; necessário para `node:sqlite`)
- Git; shell bash/zsh
- Workspace com permissão de escrita (cria `.evolveloop/`)

---

## 1. Build CLI (deste repo)

```bash
cd orchestrator && npm install && npm run build
# opcional: bash ../scripts/install-evolve-cli.sh
```

---

## 2. Abrir jornada

```bash
cd /caminho/do/seu/projeto
evolve
# ou: node path/to/orchestrator/dist/cli/evolve.js
```

- **TTY:** Ink TUI (default produto)  
- **non-TTY:** REPL PT  
- Estado: `<cwd>/.evolveloop/`

```bash
evolve --help          # journey
evolve help advanced   # L2/L3
```

---

## 3. Fluxo mínimo

1. `evolve setup` (se first-run)  
2. Descrever Task em linguagem natural **ou** `evolve intent --text "…"`  
3. Rever **Plan** → confirmar  
4. Acompanhar footer **Task / Session / Agents**  
5. `/delivery` ou `evolve delivery validate --run "…"` — PASS só com `local_execution` exit 0; `--exit-code` → ATTESTED (nunca PASS)

Handles: **OFF** por default (`evolve config set agent-handles on` só se precisar).

---

## 4. Não confundir

| Comando | Significado |
|---|---|
| `evolve` / Ink | Jornada |
| `evolve tui run\|status` | Ops Core — não jornada |
| `evolve status` | Task/Session produto |
| `evolve workspace` | Integration (preferir `evolve integration`) |

Mais: [`user-guide-everyday.md`](../V4.1/user-guide-everyday.md) · [`troubleshooting.md`](./troubleshooting.md) · [`known-limits.md`](./known-limits.md)

---

*MSO TASK V43-M3 — P1-6*
