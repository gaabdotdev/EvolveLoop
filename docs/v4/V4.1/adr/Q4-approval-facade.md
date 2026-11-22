# ADR Q4 — Approval: fachada vs migração

**Status:** aceite (V4.1 P1)  
**Data:** 2026-11-22  
**Fecha:** `docs/v4/V4.0/decisions-and-open-questions.md` §B Q4  
**Relacionado:** D8; inventário de gates Goal/consent/`approve-plan`/`confirm_mso`

---

## Contexto

Existem gates paralelos (Goal Confirm, harness consent, `approve-plan`, `confirm_mso`) e um `ApprovalStore` CLI-only. D8 pede um conceito Approval na UX; Q4 perguntava se unificar stores ou só a UI.

Migrar consent/Goal para `ApprovalRequest` toca segurança — risco alto nesta fatia.

## Decisão

1. **Preferir fachada** sobre gates existentes: fila TUI lê `ApprovalStore` (+ view-model o quê / porquê / impacto) e ações `approve`/`reject` via store/broker.
2. Gates Plan / consent / `confirm_mso` **permanecem** nas suas APIs; a TUI pode *apresentá-los* como Approval quando já há `ApprovalRequest`, sem migrar o motor de consent nesta P1.
3. **Não** mapear Ctrl+D detach → kill Agent / `session-cancel`.
4. Migração completa de consent → `ApprovalRequest` fica para V4.2+ se necessário (opção Q4-b adiada).

## Consequências

- Painel Approval na Ink TUI; CLI `approvals *` intacta.
- Pause/cancel de Task rotulados como destrutivo vs navegação (Ctrl+C stop ≠ Ctrl+D detach ≠ Ctrl+P pause).

## Alternativas rejeitadas

- (b) Migrar Goal/consent para `ApprovalRequest` agora (risco segurança; fora do escopo P1).
- (c) Manter paralelo sem fila TUI (bloqueia §8 jornada 7–8).
