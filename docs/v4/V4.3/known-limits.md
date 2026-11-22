# V4.3 — Limites conhecidos

**Data:** 2026-11-22  
**Regra:** LIMITATION explícita ≠ “estável”. Gate §9 em separado.

---

| ID | Limite | Origem | Mitigação |
|---|---|---|---|
| L-NODE18 | Node 18/19 não suportados | engines ≥20 | Documentado; não testado |
| L-ZELLIJ | Zellij N/A no host de gate | V4.1/V4.2 | tmux / CLI fallback Handles |
| L-NONASCII | Paths non-ASCII não exercitados | compat | LIMITATION; espaço OK |
| L-MIGRATE | Sem migrator schema automático | V4.2 | validate + notas |
| L-CREDS | Credenciais em duas casas (não unificadas) | V4.2 P2-4 / V4.3 P2-5 | Help + release; `credentials-paths.ts` |
| L-E2E-TTY | E2E sem TTY Ink live timed | P0-3 / P2-1 | Unit + `e2e-full.md` / `resilience.md` |
| L-HUMAN | N=0 compreensão/usabilidade humana | V4.0–V4.3 | `usability-final.md`; bloqueia liberar limpo |
| L-BENCH | Ink/update-live / CPU agent não medidos | P2-2 | `comparative-final.md` CLI medido |
| L-WIKI | Pack EvolveLoop ausente no vault | wiki ground | GAP permanente no release; contratos do repo |
| L-L3 | Superfície L3 densa | design | `help advanced`; não apagar |

---

*MSO TASK V43-M4 — limites alinhados ao gate*

