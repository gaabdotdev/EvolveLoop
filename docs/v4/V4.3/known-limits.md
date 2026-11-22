# V4.3 — Limites conhecidos

**Data:** 2026-11-22
**Regra:** LIMITATION explícita ≠ “estável”. Gate §9 em separado.

---

| ID | Limite | Origem | Mitigação |
|---|---|---|---|
| L-NODE225 | Node &lt;22.5 não suportados (incl. Node 20) | engines ≥22.5.0; `node:sqlite` desde 22.5; better-sqlite3@13 exige ≥22 | Documentado; CI matrix 22+24; sem back-compat Node 20 |
| L-ZELLIJ | Zellij N/A / attach não comprovado (binário ≠ funcional) | V4.1/V4.2 / REMED-M3 | tmux primário; CLI fallback; nunca declarar Zellij OK só por `which` |
| L-NONASCII | Paths non-ASCII não exercitados | compat | LIMITATION; espaço OK |
| L-HANDLES-TTY | Attach interativo tmux requer TTY; sem TTY → sessão bind + fallback CLI honesto | REMED-M3 | `probeTmuxSession` / ensure detached; não fingir interactivo |
| L-MIGRATE | Sem migrator schema automático | V4.2 | validate + notas |
| L-CREDS | Credenciais em duas casas (não unificadas) | V4.2 P2-4 / V4.3 P2-5 | Help + release; `credentials-paths.ts` |
| L-E2E-TTY | E2E sem TTY Ink live timed | P0-3 / P2-1 | Unit + `e2e-full.md` / `resilience.md` |
| L-HUMAN | N=0 compreensão/usabilidade humana | V4.0–V4.3 | `usability-final.md`; bloqueia liberar limpo |
| L-BENCH | Ink/update-live / CPU agent não medidos | P2-2 | `comparative-final.md` CLI medido |
| L-WIKI | Pack EvolveLoop ausente no vault | wiki ground | GAP permanente no release; contratos do repo |
| L-L3 | Superfície L3 densa | design | `help advanced`; não apagar |
| L-PAUSE-POSIX | Pause/resume OS via SIGSTOP/SIGCONT + `/proc` state=T | REMED-M2 | Só POSIX com `/proc`; sem fence starttime → LIMITATION, não sucesso |
| L-DELIVERY-ATTEST | Atestado externo (`--exit-code`) nunca vira PASS | REMED-M5 | Usar `--run` para execução local comprovada; ATTESTED ≠ verificado |

---

*MSO TASK V43-M4 — limites alinhados ao gate*

---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

Sem remoção de LIMITATIONs. Reconfirmadas nesta auditoria:

- **L-E2E-TTY** — PTY barato (`script` + `--help`) ≠ Ink journey completa.
- **L-HUMAN** — N=0 permanece; bloqueia liberar limpo.
- **L-ZELLIJ / L-WIKI / L-HANDLES-TTY / L-PAUSE-POSIX / L-DELIVERY-ATTEST** — intactas.

Gate REMED: [`remediation/gate-report.md`](./remediation/gate-report.md) → **liberar com ressalvas**.

