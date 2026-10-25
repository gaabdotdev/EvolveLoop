# Limites V2.3

Sem frase explícita do utilizador na mesma ordem, ficam bloqueados:

- `git push`
- `worktree rm`
- `repo add`
- `project setup-update`
- instalação de pacote
- escrita de segredo

O classificador em `scripts/v23/readiness.py` não executa nenhum destes comandos e não afirma sandbox.

Uma tentativa de espera dura 120000 ms. A segunda falha fica `BLOCKED`. Este número não foi medido como óptimo; foi fixado para a implementação ter um tecto.
