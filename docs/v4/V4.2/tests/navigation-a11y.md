# V4.2 — Navegação / a11y terminal (P2-2)

**Data (UTC):** 2026-11-22T18:07:50Z  
**Audit gaps:** `operational-audit.md` P2/P3/P4  
**Código:** `layout-narrow.ts`, `App.tsx`, `colors.ts`, slash/Ctrl bindings

---

## 1. Checklist

| Item | Estado | Evidência |
|---|---|---|
| Info sem depender só de cor | **PASS parcial** | Avisos com prefixo textual `AVISO:`; status labels em texto; `NO_COLOR` → ANSI off (`colors.ts`) |
| NO_COLOR regression | **PASS** (unit) | `v42-p2-perf-a11y.test.ts` — `paint` sem escape |
| Navegação teclado (Tab/slash/Ctrl) | **PASS parcial (docs+código)** | Ctrl+P/C/D; slash menu; ProviderSetup setas — **LIMITATION:** sem timed TTY live / taxa erro humana |
| Redimensionar cols &lt; 72 | **PASS** (unit) | `resolveLayoutMode(40)` → narrow + notice |
| Altura rows &lt; 12 | **PASS** (unit + wire) | `LOW_ROWS=12`; notice; banner oculto se `short_height`; resize actualiza `rows` em `App.tsx` |
| Contraste sistemático pares cor-only | **LIMITATION** | Sem auditoria WCAG-terminal completa; residual cor-only possível em Ink `Text color=` |
| Taxa erro teclado | **LIMITATION N=0** | — |

---

## 2. Comportamento altura reduzida (P2-2)

```text
resolveLayoutMode(columns, rows)
  rows < 12 → short_height + degradation_notice
  App: AVISO: … · banner omitido se short_height
  stack=true se narrow OU short_height
```

Smoke: `v42-p2-perf-a11y.test.ts`.

---

## 3. Teclado (inventário — não timed study)

| Binding / fluxo | Função |
|---|---|
| Ctrl+P | Pause Task |
| Ctrl+C | Interrupt |
| Ctrl+D | Exit (shell) |
| `/…` | Slash commands |
| Setas | ProviderSetup menu / slash |

**LIMITATION:** resize live e navegação contínua em Ink TTY não gravados nesta M4.

---

## 4. Relação com compat-matrix

Rows baixas: actualizado de LIMITATION → **Pass (unit)** em `compat-matrix.md`.  
Cohort humano / emuladores extra: LIMITATION mantida.
