# Etapa15: representação numérica com interpretação adotada

## Problema e solução

A base guarda a afirmação original e sua escala, mas fontes legadas podem conter valores
reportados ou já convertidos. Multiplicar indiscriminadamente e ignorar escala produzem erros.
A PR681 fechou a aceitação ambígua. Este incremento adiciona interpretação explícita, em lote,
e conversão determinística sem mudar as afirmações históricas.

Duas contribuições adotadas e tipadas declaram modo (`reported_in_declared_scale` ou
`already_in_currency_units`) e membros (lista exata de IDs imutáveis de contribuição).
Seus fieldPaths são `numeric_representation.<grupo>.mode` e `.members`; cada uma tem definição,
autoria, razão e dimensões. Não é um flag livre enviado pelo chamador. A interpretação pode
ser hipótese e permanece marcada como tal. Uma nova adoção não herda automaticamente a
interpretação da anterior, pois os membros estão fixados pelos IDs. A mesma declaração atende
várias células/séries sem transformar todo intermediário em uma adoção manual.

Exige entidade/perímetro/moeda/cenário iguais e intervalo cobrindo os membros. Escala da
interpretação é unitária. Os membros são números ou listas monetárias; não se aplica a taxas,
percentuais, FX ou quantidades. IDs repetidos, grupos conflitantes, definição trocada, trabalho
estranho, bytes alterados e membro fora do grupo/contexto são recusados.

`normalizeCurrencyRepresentation` multiplica somente valores declarados reportados pela
escala positiva; valores já em unidades usam fator1. Decimal isolado100 dígitos, entradas
limitadas, resultados de até24 inteiros/8 decimais; overflow ou precisão excedida é erro, sem
arredondamento automático. Zero e sinal são preservados. Escala unitária admite identidade
sem interpretação adicional. Valores não unitários sem interpretação devolvem lacuna.

`calculateAdoptedDebtLiquidity` v2 consome os valores normalizados e conserva os originais.
Dependências derivadas incluem as contribuições de interpretação; sua revogação deverá alcançar
o resultado na execução da17. Nenhum hash ou conversão concede acesso. Leitor SQL autorizado
permanece pré-condição. Outros adaptadores de alavancagem/comparação continuam exigindo escala1.
Não existe nova UI nem conversão silenciosa do legado. A próxima composição usa este contrato.

## Eval

Cinco casos do núcleo: bruto, já normalizado, escala fracionária, inválidos/overflow, cópia/limite.
16 casos de adoção: lote, modo, ausência, integração dívida/caixa, bloqueio, seis dimensões,
membro substituído, duplicação/definição, escopo/digest, série e período/unidade monetária.
Teste antigo de escala foi atualizado de exceção para resultado sem cálculo com lacuna nomeada;
a negação de cálculo permanece. Duplicação conserva o código de erro anterior.

Oráculo sintético: caixa130mil +recebimento20 -dívida100mil*1,1*1,1 =9020; valor original130/100
continua no envelope, trace guarda fator1000. Mesmo input/versões reproduz fingerprint. Sem
DDL, carimbos ou fixtures descartáveis nos ambientes. CI/main/deploy são critérios reais.

## Riscos atribuídos

Representação depende de evidência/adoção, não de inferência pela magnitude. Uma interpretação
errada pode produzir cálculo errado mesmo com integridade válida: revisão profissional e
conciliação continuam necessárias. Não afirmar que contribuição é fonte oficial. A interface
futura propõe lote com base no contrato da origem e pede só interpretação faltante; não impõe
conversão manual de cada número. Integração do procedimento e custos/projeções na15, direitos e
revogação na17, operação18, preservação19. Rollback preserva bases e volta à negação de escala,
nunca à aceitação ambígua. Conteúdo completo precisa de aprovação real antes da publicação.
