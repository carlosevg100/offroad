# Etapa 8: observações e definições

Implementação entregue na onda 7, commit `88fa39a83c090040ba764185c61657cfd0a706c4`. Etapa 9 não autorizada. O completion externo registra também a CI e os deploys da conciliação final.

A compatibilidade dos eventos foi publicada na PR 641, commit
`3582ccace62023194241713b09d2aac9eae7ee16`: CI de main, Vercel e ECS 350 conferidos.
A PR 642 publicou a ponte no commit `0e6ee7d34253744ede8cecd3a4912fa83917a3b4`, com CI de main,
Vercel Production `6503976380` e ECS 351 conferidos. Antes da mudança do banco, web e worker receberam a adaptação que funciona
com a projeção antiga e com a nova: revisão humana individual, sem aceitação por confiança,
e preservação das dimensões na entrada dos motores.

## Contrato de leitura e cálculo

`FactKey` inclui entidade, perímetro, período, moeda, unidade, escala, cenário e definição.
Cada grupo preserva todas as observações, inclusive concordantes. `accepted` permanece
somente como nome de compatibilidade da leitura proposta; não significa adoção.
Ranking ordena a leitura. Lookup sem dimensão recusa alternativas; cálculos recusam
valores conflitantes mesmo abaixo da tolerância usada para sinalizar uma disputa material.

A base dimensionalmente utilizável é aplicada antes dos cálculos de reconciliação,
capacidade, alternativas e modelos. A lista completa continua no relatório e no fingerprint.
Unidade, perímetro ou escala desconhecidos geram lacuna; nenhuma moeda/perímetro é escolhida
por confiança. O incremento de armazenamento contém edição e extração com decimal exato em unidades-base;
a escala registra a apresentação original, sem multiplicar novamente o valor normalizado.
O parser persistente recusa expoentes, escalas textuais e agrupamentos inválidos, sem apagar
caracteres para produzir outra quantidade. A confirmação exige moeda explícita, sem presumir BRL.

O caso sintético Rede Horizonte passa a preservar a ambiguidade do custo de projeto entre
fontes/escalas. Os cálculos independentes permanecem verificáveis; relatório e materiais
que dependiam de resolver essa ambiguidade não são publicados por ranking. A adoção por
contexto e sua seleção de base pertencem à etapa 9.

## Armazenamento instalado

Produção e staging contêm `observations`, `metric_definitions` e `definition_versions`, comandos
estreitos, RLS, revisões imutáveis, referência à fonte/direito fixado e evento/auditoria/outbox
atômicos. Atualização ou exclusão da projeção antiga não apaga a observação. O dossiê da
opportunity usa a autoridade daquele recurso, sem herdar acesso de uma companhia mais ampla.

Os 79 contratos passaram em staging, incluindo contribuições coexistentes, dimensões inválidas,
histórico legado e expiração do direito fixado mesmo após ampliação da licença atual.
Os seis arquivos usam os carimbos de produção, com SQL idêntico ao de staging:

| Migração | Produção | Staging |
| --- | --- | --- |
| opportunity_observation_dossier_scope | 20260917134924 | 20260917124418 |
| observations_metric_definitions | 20260917134931 | 20260917123634 |
| observation_commands_work_authority | 20260917134939 | 20260917123810 |
| observation_value_shape_validation | 20260917134946 | 20260917123901 |
| legacy_observation_field_revision | 20260917134953 | 20260917125017 |
| observation_dimension_shape_validation | 20260917135001 | 20260917125759 |

O dossiê da opportunity precede a captura em produção para evitar referências ausentes durante
a transição. As correções aplicadas durante a validação de staging permanecem como arquivos
imutáveis, sem editar SQL já instalado. As 25 funções conferidas estão em paridade.
Os 228 candidatos preexistentes em produção possuem observação, auditoria e outbox. Nenhum
dado sintético foi criado em produção; os negativos de leitura anônima, contexto ausente,
escrita direta e batch legado passaram. Advisors de segurança sem achados nos dois ambientes.
O inventário registra 44 superfícies novas e os 331 arquivos estão cobertos pelo journal de produção.

Evidências: `etapa-08-installation.json` e `etapa-08-installed-eval.json`. O decimal exato foi publicado pela PR 643, com Quality 35231824387, Security e worker verdes;
Vercel Production 6504647630 e ECS 352 no commit exato. A conciliação final exige 111 evidências
e mantém 18 lacunas gerais. Seus próprios gates constam do completion externo.
Os ensaios de produto não estão iniciados. Adoção por contexto permanece na etapa 9.
