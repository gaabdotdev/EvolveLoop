# V4.2 — Relatório comparativo vs baseline V4.0

**Data (UTC):** 2026-11-22T18:07:50Z  
**Baseline V4.0:** `docs/v4/V4.0/baseline/` (commit `577b63c…`, 2026-11-22T16:44Z)  
**V4.2 raw:** `docs/v4/V4.2/baseline/raw-measurements.md` · log §8 em `benchmark-log.md`  
**Regra:** mediana + MAD; sem inventar ganhos de produto; Δ absoluto/relativo só onde o comando é comparável.

---

## 1. Ambiente

Mesma máquina (Ryzen 5 5500, Node v22.15.0, Debian 13). Ambient `evolve.js` PID 42277 em ambas as capturas.  
V4.2: working tree com P0–P2 (help curto, prefs/history/use, a11y rows, credentials docs).

---

## 2. Tabela comparativa (comandos sobreponíveis)

| Cenário | V4.0 median (ms) | V4.0 MAD | V4.2 median (ms) | V4.2 MAD | Δ abs (ms) | Δ rel | Nota |
|---|---:|---:|---:|---:|---:|---:|---|
| `evolve --help` | 465.542 (N=7) | 6.231 | **429.512** (N=5) | 6.177 | −36.0 | −7.7% | Conteúdo mudou (JSON→journey); **não** claim otimização |
| `evolve status` | 482.783 (N=7) | 2.065 | **451.098** (N=5) | 11.088 | −31.7 | −6.6% | Mesmo path trivial; MAD maior em V4.2 |
| Classic → `evolve>` | 520.440 (N=7) | 7.291 | **478.513** (N=5) | 5.400 | −41.9 | −8.1% | Mesmo harness classic; Ink ainda LIMITATION |
| `evolve help` (journey) | — | — | **456.003** (N=5) | 5.375 | n/a | n/a | Comando/texto novos vs baseline |
| `evolve config prefs` | — | — | **439.810** (N=5) | 4.634 | n/a | n/a | Superfície V4.2 |
| `evolve history list` | — | — | **429.959** (N=5) | 7.388 | n/a | n/a | Proxy “encontrar tarefa histórica” (lista vazia) |
| `evolve use list` | — | — | **461.626** (N=5) | 8.612 | n/a | n/a | Proxy “trocar workspace” (list only) |
| `node …/evolve.js help` | — | — | **432.605** (N=3) | 11.194 | n/a | n/a | Pedido da tarefa M4 |

RSS median short CLI: V4.0 `--help` 124764 kB → V4.2 `--help` 127060 kB (Δ ~+2 MiB; sem conclusão de regressão de produto).

---

## 3. Decisão de performance (P2-1 / P2-3)

| Pergunta | Resposta |
|---|---|
| Há regressão óbvia de cold-start CLI? | **Não** nos comandos medidos (Δ negativo ou n/a). |
| Há ganho óbvio barato adicional em output default? | **Não aplicado** — journey help já é curto (P2-1 V4.1/V4.2); bloco credentials (~4 linhas) é necessário a P2-4. |
| Otimizar Ink re-render / HUD probes? | **LIMITATION** — sem hotspot medido (risco planning §6: microbenchmark sem latência percebida). |
| Claim “melhorias demonstradas”? | **Parcial:** medições comparáveis existem; Δ ~30–40 ms **não** promovido a melhoria de produto. Aceite §5 “melhorias por medições” → **APROVADO com ressalva** (evidência de não-regressão + LIMITATION de otimização). |

Backlog note P2-3: fechar como **LIMITATION / sem patch** nesta M4; reabrir só com harness de render ou queixa de latência percebida.

---

## 4. LIMITATIONs cruzadas

1. Usabilidade humana N=0.  
2. Ink TTY / update-durante-execução não medidos.  
3. Onboarding timed / taxa config sem docs = LIMITATION.  
4. `history list` / `use list` medem CLI vazia/recente — não “encontrar entre muitas Tasks” nem open timed.  
5. Wiki pack EvolveLoop ausente.

---

## 5. Artefatos

| Path | Conteúdo |
|---|---|
| `environment.md` | Host/runtime |
| `raw-measurements.md` | Tabelas brutas |
| `benchmark-log.md` | Formato §8 |
| `.tmp/v4.2-baseline/raw-commands.json` | JSON reprodutível |
| V4.0 baseline | `docs/v4/V4.0/baseline/*` |
