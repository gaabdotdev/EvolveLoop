# V4.0 — Resultados do teste de compreensão (evidência M7)

**Data da sessão de evidência:** 2026-11-22  
**Roteiro:** `docs/v4/V4.0/tests/comprehension-test-script.md`  
**Commit docs (repo):** a preencher no momento do append; pasta `docs/v4/` ainda untracked na abertura desta tarefa.

---

## LIMITATION — participantes humanos

| Campo | Valor |
|---|---|
| Participantes humanos externos reais nesta sessão | **N = 0** |
| % de conceitos interpretados corretamente (humano) | **N/A — não medido** |
| Motivo | Nenhum usuário externo foi recrutado/entrevistado nesta sessão de documentação M7 |
| Proibição observada | Não inventar % de compreensão humana |

**Consequência para o gate V4.0:** validação humana do glossário **não** está cumprida. O gate **não** pode ser “liberar” sem ressalvas (ver `gate-report.md`).

---

## Secção A — Teste com usuários (vazio)

Nenhuma linha de participante.

| Participante | Total /18 | % | Notas |
|---|---|---|---|
| — | — | — | N=0 |

**Próximo passo recomendado:** executar o roteiro com ≥3 participantes externos ao ciclo Identity; append nesta tabela.

---

## Secção B — Dry-run do autor da documentação (auto-checagem)

**Isto NÃO é teste com usuários.** Separado explicitamente da Secção A.

| Campo | Valor |
|---|---|
| Autor | Agente/documentador da evidência M7 (não usuário externo) |
| Método | Percorrer as 18 perguntas do roteiro contra o glossário oficial; auto-pontuar alinhamento das *chaves* (não “compreensão humana”) |
| Viés | Alto — o autor já leu inventário, decisões e matriz |
| Uso permitido | Verificar que o roteiro é respondível e que as chaves não contradizem o glossário |

### Auto-checagem por conceito (chaves do roteiro)

| Conceito | Perguntas | Auto-score | Notas |
|---|---|---|---|
| Workspace | 1–2 | 2/2 | Definição + não-vazamento explícitos no glossário |
| Task | 3–4 | 2/2 | Unidade principal; Q2 runtime binding ainda aberto (não impede def de produto) |
| Plan | 5–6 | 2/2 | Decomposição; UI atual diz Goal Contract — chave usa contrato-alvo |
| Agent | 7–8 | 2/2 | ≠ Session |
| Orchestrator | 9–10 | 2/2 | MSO = interno; Q6 nome UI ainda aberto |
| Session | 11–12 | 2/2 | Qualificar tipos |
| Agent Handle | 13–14 | 2/2 | Opcional; GAP implementação |
| Approval | 15–16 | 2/2 | Autorização; múltiplos gates → um conceito |
| Delivery | 17–18 | 2/2 | Evidência obrigatória |

**Total dry-run (autor):** 18/18 — **somente** coerência roteiro↔glossário.  
**Não reportar como % de compreensão de usuários.**

### Integração opcional (dry-run)

| Item | Resultado |
|---|---|
| Fluxo Workspace→Delivery | Alinhado a glossário §2 |
| “Workers” + “Pronto”/INIT | Corretamente identificados como violações do contrato (inventário / D9 / D2) |

---

## Secção C — Indicador §3

| Indicador | Valor |
|---|---|
| % conceitos interpretados corretamente (humano) | **LIMITATION (N=0)** |
| Dry-run autor (coerência documental) | 18/18 — **não** substitui humano |

---

*Fim — comprehension-test-results.md*
