## Etapa 15: primeiro incremento financeiro em validação

Baseline `83c58704eae04b1a4b9d03501bf5b60d1a004942`; isolamento publicado já entregue.
A quitação integral do motor de dívida passa a incluir o cupom capitalizado do período,
sem deixar saldo residual nem cobrar duas vezes os juros anteriores. A convenção de saldo
médio continua baseada no principal amortizado antes da capitalização do cupom corrente;
não se apresenta como cálculo por datas. A planilha editável usa a mesma separação sem ciclo.
Valores não finitos de principal, captação e amortização são recusados. Motor corrente
versionado `2026.09.19-v17`; R01 permanece sob manifesto e artefato publicados imutáveis.

Sete regressões do motor falharam antes e passaram após a correção; planilhas cobrem as três
bases de cupom e os dois tratamentos. Check integral local aprovado (44 tarefas); CI e deploy pendentes nesta candidata.
Não há DDL, nova fonte de dados, chamada de modelo, aprovação de conteúdo ou publicação de
procedimento. O manifesto de autoria é regenerado; o registro e snapshot R01 não mudam.

Este incremento não conclui a etapa 15. Restam comparação de alternativas, fontes/adoções,
calendário de liquidez, sensibilidades, instrumento/preço governados, autoria completa,
tempo até primeira resposta útil e publicação técnica sob aprovação real do conteúdo.
Riscos: convenções financeiras explícitas e evidência na 15; retenção na 16; contrato de
execução na 17; operação/alarmes na 18; auditoria na 22. Sem antecipar Temporal ou ensaios.
A evidência final de CI, merge e produção será registrada no completion externo do incremento.

## Verificação

- `indexed-debt.test.ts`: três bases de cupom, quitação após capitalização em dois períodos e três entradas não finitas; regressões antigas preservam pagamento parcial, cupom em caixa, indexação e deflação.
- `institutional-formula-workbook.test.ts`: quitação sem saldo, componente de cupom no pagamento final e ausência de referências circulares ou inexistentes em todos os seis casos de planilha. Não equivale a recálculo no aplicativo Excel.
- Testes de manifesto, executores publicados e worker: R01 continua fixado e os 29 resultados de referência permanecem o gate de não regressão.

## Compatibilidade de artefatos

O primeiro check local detectou que acrescentar uma linha de cálculo em todas as planilhas mudava os bytes do caso histórico de download. A linha adicional agora existe somente quando há quitação de cupom capitalizado. Os 12 testes reais de download preservam o fixture aprovado anterior em PT/EN, inclusive hashes e datas; nenhuma expectativa ou fixture foi regravada para fazer o teste passar. Consulta agregada ao vivo encontrou zero resultados em `private.institutional_model_results` em produção e staging antes desta alteração, portanto não há resultado institucional persistido com PIK a converter neste rollout.

O protocolo universal da etapa 19 ainda precisa preservar bytes, renderer e cálculo por revisão. Este incremento não declara resolvido o replay universal de artefatos sob versões futuras do motor; preserva as versões comprovadas e corrige as novas execuções do caso delimitado. A etapa 21 cobre exportação/reimportação, sem Office nativo nesta entrega.
