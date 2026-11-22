# ADR Q1 — Copy canónica de sucesso de produto

**Status:** aceite (V4.1 P0)  
**Data:** 2026-11-22  
**Fecha:** `docs/v4/V4.0/decisions-and-open-questions.md` §B Q1  
**Relacionado:** D5, D6; `state-matrix.md` §1.3 / §5

---

## Contexto

Várias camadas usam literais de “PASS” (`TRUE_PASS`, `TRUE_FULL_PASS`, `TRUE-FULL-PASS`, Delivery `PASS`). D6 proíbe unificar literais de runtime; falta uma âncora de **cópia humana** para “objetivo cumprido”.

Hoje a TUI deriva `Entrega Final · PASS` quando o kick de execução arranca e não está `BLOCKED`, **sem** verification — viola D5.

## Decisão

1. **Âncora de sucesso de produto na jornada:** Delivery **“Entrega aceita”** (`PASS`) **somente** quando existe verificação real (comando + `exit_code === 0`) **ou** Session MSO em `TRUE-FULL-PASS` **com** verification presente.
2. **Separar sempre** na UI:
   - *Processo terminou* (kick/delegação acabou) ≠ *objetivo validado* (Delivery aceita).
3. Estado intermédio de apresentação: **`UNVERIFIED`** — “Processo terminou · objetivo não validado” (sem verde de sucesso).
4. Literais de runtime (Task/Work/MSO) permanecem no motor/JSON/verbose (D6); a TUI **não** promove “PASS” genérico.

## Consequências

- `deriveDeliveryStatus` na TUI nunca faz default `PASS` sem verification.
- Copy de tokens/provenance continua honesta; rótulo HUD **Agents** (não Workers).
- Não reescreve Evidence Validator / MSO — só a fachada de Delivery.

## Alternativas rejeitadas

- Unificar todos os literais runtime num único `PASS` (exige motor; fora de escopo).
- Usar só Task `TRUE_PASS` como copy default (usuário vê Delivery no fim da jornada).
