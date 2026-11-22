# M22 — Dogfooding Contínuo (14 dias) — tentativa 1/3

**UTC:** 2026-11-22T14:47:21Z  
**Evidence:** `docs/v3/evidence/20261122T144721Z/`  
**DoD:** 14 dias calendário de uso real em projetos FORA do seagrass, em feature freeze (só bugfix cirúrgico).

## Método (colher, não inventar)

Fontes vasculhadas:

| Fonte | Path |
|-------|------|
| Repo evidence | `docs/v3/evidence/**` (incl. `latest/gates/AUD-UX-06.md`, `AUD-UX-01*`) |
| Repo log | `.ai/log.md` |
| Wiki EvolveLoop | `$WIKI_ROOT/EvolveLoop/log.md` |
| Wiki outros projetos | `$WIKI_ROOT/{KernelBot,OrbitBot,Bonsai,FluxoFront,xRayLinkedin,CursorSKILLS,...}/log.md` |
| Journals | **nenhum** ficheiro `*journal*` encontrado no vault nem no repo |
| Diário dogfood | **AUSENTE** (confirmado também por AUD-UX-06 prévio) |

## Inventário honesto — artefactos com uso fora do seagrass

| Data(s) | Projeto alvo | Artefacto | Natureza |
|---------|--------------|-----------|----------|
| **2026-11-22** (1 dia) | KernelBot + OrbitBot | `docs/v3/evidence/latest/gates/AUD-UX-01-live.json` (+ `.md`, patches, repos.json) | Live stress **numa sessão**; `outside_seagrass: true`; **não** diário 14d |
| 2026-11-22 | (gate histórico) | `docs/v3/evidence/latest/gates/AUD-UX-06.md` | Declara freeze **NÃO**, diário **AUSENTE**, veredito BLOQUEADA |
| 2026-11-16 … 2026-11-17 | xRayLinkedin / Curriculo.ai | `$WIKI_ROOT/xRayLinkedin/log.md` | Menções `/evolve` em 2 dias; **não** é diário de freeze dogfood 14d |
| 2026-09-19 … 2026-09-20 | CursorSKILLS | `$WIKI_ROOT/CursorSKILLS/log.md` | Desenvolvimento **do** EvolveLoop (não dogfood externo em freeze) |
| 2026-11-22 | Mini-BullMQ | `docs/v3/evidence/20261122T144328Z/` (M21 fire-test) | 1 dia; SUMMARY diz explicitamente que **não** fecha dogfooding 7–14d |

### Excertos (prova de ausência / span máximo)

`AUD-UX-06.md`:

```text
| Feature freeze 7–14 dias concluído? | **NÃO** |
| Diário de dogfooding nesta evidência | **AUSENTE** |
**BLOQUEADA / PARTIAL** — dogfooding 7–14 dias **não** concluído.
```

`AUD-UX-01-live.json`:

```text
"utc": "2026-11-22T02:16:52Z"
"repos": [ KernelBot, OrbitBot ]  // outside_seagrass: true
"honesty": "Metrics measured from this session only. ..."
```

`.ai/log.md` (M21):

```text
Honesty: NÃO fecha dogfooding 7–14d do AUD-UX-06 histórico
```

## Span calendário máximo encontrado (uso externo datado e auditável)

| Métrica | Valor |
|---------|-------|
| Dias contínuos com diário de dogfood em freeze | **0** |
| Melhor evidência externa datada contínua | **1 dia** (2026-11-22, AUD-UX-01) |
| Menções `/evolve` fora EvolveLoop (wiki) mais densas | xRayLinkedin **2 dias** (16–17 Nov) — esparsas, sem freeze declarado |
| Feature freeze formal (início/fim + branch release) | **NÃO encontrado** |

## Veredito

**FAIL / INSUFICIENTE** — não existem artefactos datados que provem ≥14 dias calendário de uso real fora do seagrass em feature freeze.  
**Não fabricado** diário. **Não** PASS por inferência a partir de AUD-UX-01 (1 sessão) nem de logs de desenvolvimento do próprio monorepo.

```text
M22_STATUS: FAIL
M22_REASON: no_dated_14d_dogfood_diary_outside_seagrass
MAX_EXTERNAL_CONTINUOUS_DAYS: 1
```
