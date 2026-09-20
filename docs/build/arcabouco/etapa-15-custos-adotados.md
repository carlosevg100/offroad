# Etapa15: custos adotados na composição

## Contrato

`calculateAdoptedFinancingLiquidity` exige um registro de custos para cada instrumento, sem
instrumentos ausentes/duplicados/estranhos. Convenção bruto antes de retenção e estados das
quatro categorias são contribuições adotadas, com definição e razão. Séries de IDs, identidade
econômica, categoria, período, data, valor, tratamento e conta usam listas tipadas no envelope
existente. Nenhum número ou tratamento é fornecido como override livre pelo chamador.

Cada série é adotada uma vez e gera movimentos intermediários, não uma adoção por parcela.
Quantidade de membros deve coincidir; dados faltantes não são completados. Encargos especificados
sem séries geram lacuna. Ledger vazio só sob declarações explícitas de ausência; desconhecido
não é zero e bloqueia o resultado composto. O kernel valida soma de retenção, datas, identidade
econômica e principal; recebe as contribuições resolvidas, nunca um resultado pronto para confiar.

`resolveAdoptedDebtInputs` centraliza leitura/contexto dos operandos de dívida/caixa sem cálculo.
O adaptador anterior mantém resultado, versão e gates; o novo não calcula antes uma dívida sem
encargos, que poderia recusar amortização correta de custos financiados. Matemática continua no
financial-core. Fluxos operacionais entram uma vez no calendário, sem EBITDA ou giro duplicado.

Normalização de custo usa o contrato de interpretação em lote da PR683; originais e contribuições
de modo/membros acompanham o resultado. Cada movimento financeiro carrega as dependências de
seu instrumento, inclusive custo, avaliação e interpretação. Não confere direitos: a leitura SQL
autorizada e a revalidação sob manifesto na17 permanecem necessárias.

## Verificação

20 casos novos: oráculo de caixa3 (130+20+100-5-242), encargo financiado/PIK resulta1,95,
convenção bruta, tributo desconhecido, ausência explícita, oito dimensões de contexto, escala e
série ausentes, tipagem/extensão, inventário/observação duplicada, reprodução, injeção/integridade,
escala reportada aplicada e amortização que inclui custo financiado. Bases sintéticas ficam em
`packages/testing-fixtures/src/adopted-financing-costs.ts`. Contribuições originais permanecem.

Teste de compatibilidade do adaptador anterior faz parte da suíte financial-model. Check integral,
CI, main e produção com web/worker no mesmo commit são gates reais; completion externo registra
cada resultado. Sem migrações, carimbos ou dados descartáveis de produção.

## Limites e próximos passos

Resultado continua `partial_composition`: custos declarados conhecidos não certificam completude
operacional ou disponibilidade de mercado; taxa anual efetiva não é soma nominal nem spread.
Na15 entram projeções por drivers/período, alternativas sob abertura comum, referências e
convenções aplicáveis, covenants/sensibilidades, conteúdo completo e medida de resposta útil.
Manter direitos herdados e manifesto na17, alarmes/sessão18, preservação universal19.
Rollback não reabre escala ambígua, não altera base histórica nem R01. Publicação profissional
exige aprovação real do conteúdo; próxima onda exige OK separado.
