# Etapa 8: observações e definições

Em execução na onda 7. Etapa 9 não autorizada. Este documento não é um completion.

A compatibilidade dos eventos foi publicada na PR 641, commit
`3582ccace62023194241713b09d2aac9eae7ee16`: CI de main, Vercel e ECS 350 conferidos.
Antes da mudança do banco em produção, a web e o worker recebem a adaptação que funciona
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
por confiança. O incremento de armazenamento ativará edição e extração com decimal exato em unidades-base;
a escala registra a apresentação original, sem multiplicar novamente o valor normalizado.

O caso sintético Rede Horizonte passa a preservar a ambiguidade do custo de projeto entre
fontes/escalas. Os cálculos independentes permanecem verificáveis; relatório e materiais
que dependiam de resolver essa ambiguidade não são publicados por ranking. A adoção por
contexto e sua seleção de base pertencem à etapa 9.

## Armazenamento em validação

Staging contém `observations`, `metric_definitions` e `definition_versions`, comandos
estreitos, RLS, revisões imutáveis, referência à fonte/direito fixado e evento/auditoria/outbox
atômicos. Atualização ou exclusão da projeção antiga não apaga a observação. O dossiê da
opportunity usa a autoridade daquele recurso, sem herdar acesso de uma companhia mais ampla.

Os carimbos, testes instalados, catálogo e produção serão registrados no fechamento.
A migração ainda não foi aplicada em produção. Os ensaios de produto não estão iniciados.
