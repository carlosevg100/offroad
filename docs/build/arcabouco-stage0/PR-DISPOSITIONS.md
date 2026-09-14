# Etapa 0 - triagem das PRs abertas

Levantamento de leitura em 14/09/2026. Base comparada: `main@8bdc26d9df96af713d2769599bb0fdd5234eb6d0`. **21 PRs abertas: as20 anteriores e a612 de conciliação.** Levantamento histórico, com execução posterior registrada abaixo.

Responsável por executar todas as destinações: **Codex, nesta tarefa**. O prazo de registrar absorção, recuperar arquivos, fechar ou mesclar cada PR é **antes do relatório de completion da Etapa 0**. Etapas futuras abaixo indicam destino do requisito, não autorização antecipada para implementá-lo. Uma PR absorvida deve ser fechada na Etapa 0, com a referência imutável registrada; não ficará aguardando implementação futura.

## Decisão individual

| PR | Decisão | Prazo/marco | Evidência e ação |
|---|---|---|---|
| [612](https://github.com/carlosevg100/offroad/pull/612) - Reconcile main with the applied provider_mandate_confirmation_clock_timestamp migration | Concluir e publicar | Etapa 0 | Condução exclusiva do Claude até o merge. Preservar o histórico clock_timestamp e incorporar a correção sequence/default now() já aplicada em produção20260914213242 e staging20260914213140. Pré-condição: publicar a renovação de segurança em PR própria. Só fechar603 após merge612. |
| [610](https://github.com/carlosevg100/offroad/pull/610) - chore(deps-dev): bump the development group with 6 updates | Fechar | Etapa 0 | Lote mistura Vitest 4→5, tipos Node 20→22 e seis upgrades; não é requisito de conciliação e troca ferramental durante prova de regressão. Encerrar lote; versões existentes preservadas. |
| [609](https://github.com/carlosevg100/offroad/pull/609) - chore(deps): bump the production group with 16 updates | Fechar | Etapa 0 | Lote mistura16 atualizações de React,SDKs,Auth e parsing; nenhuma correção específica de segurança foi demonstrada neste diff. Encerrar lote para fixar baseline da segurança; sem promessa de merge futuro deste lote. |
| [603](https://github.com/carlosevg100/offroad/pull/603) - Deterministic last confirmation for provider mandates (fixes the Database gate flake) | Fechar | Etapa 0, após612 | A correção de ordenação desta PR foi incorporada à612 com default now(). sequence está instalada nos dois ambientes; encerrar a proposta original após merge612, sem duplicar DDL. |
| [602](https://github.com/carlosevg100/offroad/pull/602) - Authorized distribution of the exact information pack, the in-product introduction and the market answer | Absorver no plano | Etapa 0: reconciliar9 SQL e fecharPR; intercâmbio posterior ao núcleo | Nove migrações versioned_information_packs até resolve_pack_distribution_candidates estão recuperadas; conferir destino ambiente a ambiente. Registrar funções/tabelas não ativadas como legado congelado. UX shared e distribuição entre organizações ficam fora do núcleo aprovado; registrar diff/commit e fechar PR, sem ativar distribuição. |
| [601](https://github.com/carlosevg100/offroad/pull/601) - The ten Case 01 methods up the maturity ladder, seven to production | Absorver no plano | Etapa 0: arquivo; etapas14/15: conteúdo e publicação | Trazer agora project_debt_structure_capability com carimbo instalado. Preservar procedimentos, avaliações e executor como insumos de autoria em referência imutável; fechar PR original. Não transportar maturity=production ou approvals da promoção de sete métodos nesta onda. |
| [600](https://github.com/carlosevg100/offroad/pull/600) - Canonical revision of approved assumptions and data, and the propagation of an approved change | Absorver no plano | Etapa 0: arquivos; etapas18/20/21: implementação | Trazer agora os seis arquivos SQL com carimbos de produção e contratos SQL pertinentes para a conciliação. Arquivar diff de UI/importação/propagação para os contratos aprovados de dependência, revisão e reimportação; fechar PR original depois da absorção registrada. Não publicar UI antes da etapa correspondente. |
| [551](https://github.com/carlosevg100/offroad/pull/551) - feat: add opt-in contractual coverage to refinancing diagnostics | Absorver no plano | Etapa 0: fechar e registrar; etapa 15: cobertura contratual | compareRefinancingBeforeAfterV8 e24 regressões são novos, opt-in e sem consumidor runtime; reaproveitar regras de cobertura/versão no primeiro procedimento sem promover execução privada ou importar executor inteiro agora. |
| [530](https://github.com/carlosevg100/offroad/pull/530) - CTRL-03: add trusted fail-closed evidence and claims registry | Absorver no plano | Etapa 0: fechar e registrar; etapa22: auditoria | Evidence registry já existe em main, mas trusted resolvers/render bootstrap deste diff não são equivalentes ao existente. Reaproveitar testes contra evidência autodeclarada na22; evitar segundo inventário paralelo em onda1. |
| [498](https://github.com/carlosevg100/offroad/pull/498) - feat(web): surface receivables analysis depth in advisor | Absorver no plano | Etapa 0: fechar e registrar; etapa17: execução visível | receivables-progress.ts/test ausentes main; importar UI antiga agora reintroduziria profundidade específica de R01 antes do contrato de execução. Guardar requisitos de progresso, nunca perfil→profundidade. |
| [497](https://github.com/carlosevg100/offroad/pull/497) - feat(receivables): collect governed assumptions in bulk | Absorver no plano | Etapa 0: fechar e registrar; etapas9/21 | document-supplement-contract.ts é idêntico ao main, mas r01-template.ts não existe; regras de respostas em lote/populados vão para adoção e importação governada. Não reaplicar cadeia inteira. |
| [496](https://github.com/carlosevg100/offroad/pull/496) - feat(receivables): expose progressive underwriting workbench | Absorver no plano | Etapa 0: fechar e registrar; etapa17 | main tem method-readiness e information requests alterados; workbench progressivo não prova equivalência total. Absorver apresentação de bloqueios no contrato único de execução. |
| [495](https://github.com/carlosevg100/offroad/pull/495) - feat: expose progressive R01 readiness | Absorver no plano | Etapa 0: fechar e registrar; etapa9 | main tem method-readiness; regressões de draft parcial e conflito devem orientar adoção sem ranking vencedor, sem outro caminho de verdade. |
| [494](https://github.com/carlosevg100/offroad/pull/494) - fix: accept governed financial input notation | Absorver no plano | Etapa 0: fechar e registrar; etapa9 | Correção ainda não está main: information-request-card mantém type=number. Preservar regressão de 72,5%,1.25x/moeda na entrada de hipóteses da9; não importar dependências da cadeia. |
| [493](https://github.com/carlosevg100/offroad/pull/493) - test: gate the complete R01 lifecycle | Absorver no plano | Etapa 0: fechar e registrar; etapa17 | receivables-r01-lifecycle.test.ts existe modificado em main, commit original não é ancestor; conservar cenários expand/retract como insumo, sem declarar todos já testados no main. |
| [492](https://github.com/carlosevg100/offroad/pull/492) - feat: guide R01 evidence with a governed workbook | Absorver no plano | Etapa 0: fechar e registrar; etapa21 | r01-template.ts/test não existem main; workbook guiado se encaixa no protocolo exportação/importação, não no novo procedimento inicial da15. |
| [491](https://github.com/carlosevg100/offroad/pull/491) - feat: compile receivables documents into governed drafts | Absorver no plano | Etapa 0: fechar e registrar; etapas6/9 | document-supplement.ts/test e information-requests já existem modificados; registrar retração de perguntas satisfeitas como requisito fonte/adoção e fechar cadeia antiga. |
| [464](https://github.com/carlosevg100/offroad/pull/464) - build(deps): bump supabase/setup-cli from 1.7.1 to 3.0.0 | Fechar | Etapa 0 | Major setup-cli 1→3 troca execução CI; não é necessário para recuperar histórico aplicado. Encerrar atualização agrupada na baseline atual. |
| [463](https://github.com/carlosevg100/offroad/pull/463) - build(deps): bump actions/upload-artifact from 4.6.2 to 7.0.1 | Fechar | Etapa 0 | Major upload-artifact 4→7 afeta nove workflows; não é necessário ao núcleo e traz risco operacional independente. Encerrar neste saneamento. |
| [462](https://github.com/carlosevg100/offroad/pull/462) - build(deps): bump aws-actions/configure-aws-credentials from 5.1.1 to 6.2.4 | Fechar | Etapa 0 | Major configure-aws-credentials 5→6 altera nove workflows e OIDC; preservar caminho de deploy testado enquanto corrigimos segurança. Encerrar upgrade não exigido. |
| [207](https://github.com/carlosevg100/offroad/pull/207) - feat(worker): pipeline on recorded answers, no keys needed | Absorver no plano | Etapa 0: fechar e registrar; etapa17 | CASSETTE_MODE/record/replay é integração antiga com main/config que evoluíram; usar somente replay sintético sob manifesto e gateway novos. Não habilitar gravação de prompts privados. |

## Verificação realizada

- `gh pr list` e `gh pr view` para todas as21: número, título, base, cabeça, SHA, arquivos, commits, descrição e mergeabilidade; metadados completos em `PRS-ATUAIS-METADATA.json`.
- `git merge-base --is-ancestor` para491–498: nenhum dos oito heads é ancestral de main. Portanto não os qualificamos como já mesclados.
- Comparação de blobs por arquivo e inspeção de diffs: `document-supplement-contract.ts` da497 é idêntico; `r01-template.ts`, seu teste, `receivables-progress.ts` e seu teste estão ausentes; correção de `type=number` da494 ainda ausente. Arquivos que existem modificados não foram considerados equivalentes automaticamente.
-551 tem `refinancing-coverage-v8.test.ts` ausente em main; descrição e diff confirmam ausência de runtime/loader/persistência.530 tem renderer e bootstrap ausentes, com registry existente evoluído: rebase simples não prova absorção.
-Levantamento original da612 era anterior à correção do Claude. Na retomada vigente, journal e catálogo ao vivo confirmam sequence e default now() nos dois ambientes. O SHA original abaixo é histórico; não é a cabeça final de publicação.
-600 e 601 misturam SQL já aplicado com funcionalidade ainda não publicada: recuperar SQL é uma obrigação de conciliação, não autorização para ativar essas funcionalidades.

## Falhas históricas da 612, resolvidas antes do merge

[Quality 34897623620](https://github.com/carlosevg100/offroad/actions/runs/34897623620) falhou em duas frentes; CodeQL, demais segurança, E2E e preview passaram.

1. `supabase/tests/verified_provider_mandates.sql:206`: `a confirmed mandate must answer every criterion`; critérios retornaram listas vazias. O Claude substituiu o fix temporal por sequence/default now(); verificar a nova CI da612, sem alterar a branch sob sua condução.
2. `packages/release-governance/src/security-current-state.test.ts`: snapshot ultrapassou `reviewDueAt` e a evidência `SEV-AWS-DEPLOY-ROLE-SNAPSHOT` venceu. Não autoriza pular CI ou declarar atualização do relógio como revalidação.

## Registro imutável das propostas absorvidas ou encerradas

| PR | SHA da cabeça no levantamento | Base original |
|---|---|---|
| 612 | `5deb0905f65c9fbd7319a127c2c8181378ec93d5` | `main` |
| 610 | `1171fb4ec7f1c9a3e677c85333cc6ce904f3cf6a` | `main` |
| 609 | `fefa3db34329bf2e2e9be9bd7100c665a56d6269` | `main` |
| 603 | `c8eb2a7dc7222be8b2575f5099382ce6b7470f0f` | `main` |
| 602 | `db0d7d2a41c72739e14b44949506af1047ecb6c3` | `main` |
| 601 | `e034b1a234170fbc671385d9898aad4c387a9515` | `main` |
| 600 | `6b2889fc7ef256e661ee5975abcf47501d72dc75` | `main` |
| 551 | `b7ec3e0790bc0b99f623786a40ae9d0a7d9b201e` | `main` |
| 530 | `8705cc997533f4bb96d8523f8b5fc8cc7f76a369` | `main` |
| 498 | `2a86386a83e5ddc514234337dd36355dc887bc02` | `feat/receivables-bulk-assumptions` |
| 497 | `a1f7a603c81d2ab5c6d84c75dbdc47e7d8d1fa79` | `feat/receivables-progressive-workbench` |
| 496 | `3155f1c3e7c4d1102c2d0ea930424e8bad9b251d` | `feat/receivables-progressive-readiness` |
| 495 | `743fea669fef6b5d99f921aca37379497c335dc5` | `fix/advisor-financial-input-format` |
| 494 | `6c28115d7df2b0445ed1a43640d58e14a14aaf51` | `test/receivables-r01-lifecycle-gate` |
| 493 | `a1eb0804637fb0e5c9a416e2df5c55cb6e75d25f` | `feat/receivables-guided-input-template` |
| 492 | `300074a9eebbdb563a1a01aa1094afb51b6f6650` | `feat/receivables-document-supplement-adapter` |
| 491 | `e9923833f9248464685b23d04acba8830186ebda` | `feat/receivables-complete-draft-refresh` |
| 464 | `952230390fff551359d18bd5855a6eded5bd5f9b` | `main` |
| 463 | `ca1c588a3a4ebda926c1e520c243a11332634935` | `main` |
| 462 | `b73c1531f02521900353f883e8d10a748955faa9` | `main` |
| 207 | `d819f4315bbcd0bc285251c1d346919df96b2c54` | `main` |

## Ordem operacional proposta para encerrar a Etapa 0

1. Renovar e publicar o inventário de segurança em PR própria, com revisão por ondas e evidências atuais. A612 e seu DDL ficam exclusivamente com o Claude até o merge; conferir seu merge e então fechar603.
2. Concluir a conciliação dos 16 arquivos recuperados, com carimbo de produção quando aplicado, catálogo conferido e histórico de staging registrado. Levar os contratos SQL que verificam schema reconciliado; nenhum método passa de maturidade nesta operação.
3. Registrar em main este mapa de destinação, ou documento equivalente com os 21 heads, e os requisitos absorvidos nas etapas indicadas. Fechar as PRs absorvidas sem apagar o histórico dos commits; o fechamento referencia a conciliação e o destino concreto.
4. Fechar os cinco lotes de dependências explicitamente descartados. Não atribuir uma data futura de publicação a lotes que foram descartados.
5. Consultar novamente PRs abertas. O saldo dessas 21 deve ser zero (uma mesclada, vinte encerradas por supersessão/absorção/descarte). Qualquer PR nova da onda tem proprietário, escopo e completion próprios.
6. Conferir web e worker no commit final e registrar CI/catálogos no completion da Etapa 0.

## Execução remota conferida

A 612 foi mesclada em `d88683df88829cc50fe92f3b7694477630308499`. A renovação do inventário preparada na PR própria 613 foi incorporada à 612; a 613 foi fechada como absorvida, e a 603 como substituída, após o merge. Todas as vinte PRs anteriores foram encerradas conforme a destinação acima. A consulta final retornou zero PRs abertas.

`PR-DISPOSITIONS-EXECUTED.json` contém heads, estados e horários do GitHub. Codex responde pela absorção dos requisitos nas etapas indicadas, antes do completion de cada etapa; não há PR antiga aguardando publicação. Os nove SQL exclusivos de staging ficam arquivados e seus 61 objetos congelados até a decisão de intercâmbio posterior ao núcleo. A revisão desse congelamento ocorre no fechamento técnico do núcleo, antes de qualquer habilitação de intercâmbio.

A publicação dos sete arquivos já instalados e da autoria segue em PRs novas da etapa 0, sem reaplicação remota de SQL. Este registro não substitui CI e deploy dessas entregas.
