# Parecer independente — integração v2 de contratos indexados

Revisor: agente Codex `/root/stage15_independent_review`, revisão por IA. Sujeito: snapshot de implementação não commitado, congelado por conteúdo nesta revisão; procedimento candidato `2026.09.21-v3`. Fonte SHA256 `7152346a4819bdad43f0323b6c12a7efa0291f49284456365aeaed22083764ad`; manifesto recompilado `643bac8205c20eb87d2cbc7c3244ca2d12e5ca0c55304ea6b7847b69fef1ebee`. Os 263 pins foram conferidos contra os bytes examinados. Identidades completas em `INTEGRATION-V2-FINAL-PINS.json` e blobs preservados em `integration-v2-blobs`.

**F5 resolvido no novo caminho v2 examinado. A implementação candidata está tecnicamente apta para avaliação/aprovação profissional, dentro do contrato explícito de incidências.** Este parecer não é aprovação humana, promoção editorial, autorização de publicação ou comprovação de produção. A etapa 15 não se encerra por este documento. O commit final e o manifesto de publicação deverão ser confrontados com estes bytes; alterações posteriores exigem revalidação proporcional.

## Cálculo independente e particionamento

Meu caso próprio usou principal 200, fatores de índice 1.1 por intervalo, juros 10% por intervalo, amortização 50 depois da primeira incidência e cupom no fechamento. Cálculo independente: primeiro principal 220 e juros 22; depois de amortizar, principal 170; segundo principal 187, juros prévios indexados 24.2 e juros novos 21.12; cupom final 45.32. O pacote integrado devolveu exatamente principal 187 e cupom 45.32.

No tratamento cash_paid, principal final 150, correção proporcional paga na amortização 5, correção ainda acumulada 31.5 e cupom 37. O pacote manteve esses componentes separados. Três escolhas próprias de datas de relatório preservaram estado, pagamentos e identidade contratual. O cálculo transmitiu o input completo ao núcleo; não reconstruiu aniversários ou incidências a partir dos relatórios. A retomada, convenções de resíduo e ordens já foram verificadas no mesmo núcleo SHA256 `63991ab780a804178aea5ac07f1c4fdf37f986781e5555772d47e006419b7253` nos suplementos anteriores.

## Fontes, identidade e autoridade

Testes próprios negaram fonte de juros estranha, moeda divergente, finalidade divergente e identidade econômica duplicada entre envelopes. Inventário sem termos produziu lacuna nominada e status partial. Inspeção verificou resolução de cada anchor por versão e preservação do locator, além de união das fontes no pacote; referências continuam sem poder de acesso. A identidade é verificada por alternativa, instrumento e série, sem proibir a mesma dívida em alternativas diferentes.

A reconciliação v2 efetivamente recalcula preparação v2 antes de conferir derivação. Uma origem com fingerprint v1 foi negada; com fingerprint v2 correto alinhou; adulterar sua lista de fontes voltou a negar. Resultado indexado mantém lacuna de interpretação/adoção e não altera projeção, base adotada ou permissões.

## Caminho real e manifesto

`prepareCapitalProcedurePacketV2` chama `prepareCapitalContractEvidenceV2`; a entrada indexada calculável chama `buildIndexedContractEvents`. IPCA no slot legado é recusado na validação v2, sem fallback para v8. O caminho legado interno atende somente cálculos não IPCA e covenants. `reconcileCapitalContractAdoptionsV2` usa preparação v2 e o helper compartilhado; não remove os termos novos para fabricar uma preparação v1 de adoção.

O procedimento candidato declara export `prepareCapitalProcedurePacketV2`, resultado/persistência v2 e schemas incorporados compatíveis com a nova composição. O compilador recompilado selecionou esse export e fixou o núcleo, adaptadores, helper, contratos e os oito arquivos de testes declarados. Todos os 263 pins conferiram. Esta constatação comprova o caminho do executor; não afirma ativação de rota de produto ou publicação em banco.

## Regressões e preservação histórica

Reexecutei 47 casos do repositório, usando os módulos congelados: os 21 históricos (7 gold, 8 adversarial, 6 consistency) e os 26 v2 (9 gold, 8 adversarial, 9 consistency) passaram. Os arrays de casos e evidenceFingerprint coincidiram exatamente com seus seis recibos. Isso complementa os gabaritos próprios, sem substituir a revisão independente por repetição dos testes do autor.

Os três arquivos de releases e os três recibos históricos permaneceram byte a byte idênticos ao commit `45813bf20bd982acda642972d48bf96b728d034e`. V1 permanece reprodução histórica; não foi convertido silenciosamente em v2. Os defeitos semânticos antigos de particionamento não foram declarados corrigidos no executor histórico: foram retirados do caminho candidato por versionamento explícito.

## Achado durante esta revisão e correção

P2: IDs válidos de 160 caracteres para instrumento e série geravam código de lacuna maior que 300, causando falha no output schema em vez de entregar o pacote partial. Reproduzi antes em `INTEGRATION-V2-INDEPENDENT.json`. O autor ampliou a capacidade para 640, sem truncar identidade. Reexecutei a mesma entrada; agora produz partial e preserva ambos os IDs. A correção está nos bytes finais examinados. Nenhum outro achado material aberto nesta revisão integrada.

## Evidências e limites

Scripts próprios: `review-integration-v2-final.mjs`, `review-integration-v2-records-final.mjs` e `review-integration-v2-manifest-final.mjs`. Resultados: `INTEGRATION-V2-FINAL-INDEPENDENT.json`, `INTEGRATION-V2-FINAL-RECORDS.json`, `INTEGRATION-V2-FINAL-MANIFEST.json` e `INTEGRATION-V2-FINAL-PINS.json`. Os primeiros resultados foram preservados separadamente, incluindo a falha corrigida.

F1–F4 e F6 têm suplementos próprios; F5 fica tecnicamente encerrado neste snapshot v2. A validação final de publicação ainda deve fixar commit, fonte e manifesto editorial definitivo, exigir as aprovações corretas e comprovar os demais critérios operacionais da etapa. Não houve mutação de banco, chamada paga, alteração do repositório ou aprovação humana por este revisor.
