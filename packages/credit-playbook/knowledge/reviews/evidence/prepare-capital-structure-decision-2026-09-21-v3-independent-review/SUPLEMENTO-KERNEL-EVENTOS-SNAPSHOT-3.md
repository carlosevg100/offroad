# Revalidação independente — kernel snapshot 3

Revisor: agente Codex `/root/stage15_independent_review`, revisão por IA. Código SHA256 `63991ab780a804178aea5ac07f1c4fdf37f986781e5555772d47e006419b7253`; testes SHA256 `166fe124300b1d3b72d67f8c1700081cee5c994e10a8b44c2bdb9cd4b68ac18c`. Sujeito preservado em `indexed-contract-events-snapshot3.ts` e `.test.ts`, ainda não identificado por commit.

**K1 e K2 corrigidos. Kernel apto tecnicamente dentro do contrato explícito examinado, para prosseguir à integração e sua revisão independente.** Isso não encerra F5 integrado, não promove procedimento, não substitui aprovação profissional e não comprova implantação.

Reexecutei minhas reproduções, não apenas os testes do autor. Principal 1e-80 com juros 1e-24 produz estado retomável; execução contínua e retomada terminaram exatamente em juros `2.000000000000000000000001e-104`. Tanto fator efetivo de intervalo quanto anual efetivo -0.999 com camada de duas casas recusam o fator arredondado zero com `indexed_interest_factor_nonpositive`.

Os nove grupos próprios do snapshot anterior passaram novamente: G4 e retomada após amortização; carry e write_off; amortização anterior ao índice sob as duas bases explícitas; ambas as incidências de correção não paga; quatro subconjuntos de relatórios; rejeições de datas, fatores e ordens inválidos. Os limites de expoente agora são conferidos também na saída, e a serialização científica mantém a precisão disponível sem arredondamento especial na retomada.

Evidências: `review-snapshot3-boundaries.mjs`, `SNAPSHOT3-KERNEL-BOUNDARIES.json`, `review-snapshot3-checks.mjs` e `SNAPSHOT3-KERNEL-INDEPENDENT-CHECKS.json`. Nenhum arquivo do repositório alterado por este revisor. Pareceres anteriores permanecem intactos.
