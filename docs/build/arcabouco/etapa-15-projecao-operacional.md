# Etapa15: ponte operacional entre resultado e caixa

`buildOperatingCashProjection` recebe períodos contíguos, moeda e abertura explícitas. Receita
é valor líquido ou quantidade vezes preço líquido, sem misturar convenções. As despesas
operacionais são valores por competência antes da depreciação/amortização, juros e tributos
sobre resultado. O ajuste não monetário explica itens já incluídos no EBITDA; não repete giro,
tributos, capex ou financiamento.

Giro operacional líquido é recebíveis + estoque + outros ativos operacionais - fornecedores -
outros passivos operacionais. A abertura de cada período é o fechamento anterior. Um aumento
consome caixa; redução libera caixa. Tributos em caixa e restituições são explícitos, sem
presumir regra legal ou alíquota. Capex pago separa manutenção e crescimento.

Caixa antes de financiamento = EBITDA + ajuste não monetário - variação de giro - tributos
pagos + restituições - capex manutenção - capex crescimento. Juros, principal e tarifas
financeiras pertencem ao motor de financiamento; não entram duas vezes. A definição gerencial
não substitui a definição contratual de CFADS, EBITDA ou dívida de um covenant.

O resultado é orçamento por período, sem fabricar datas de pagamento ou saldo mínimo diário.
Não arredonda resultados; conserva até16 casas derivadas da multiplicação de drivers. Todos os
operandos são devolvidos em cópia e o contexto Decimal é isolado. Falta de dados é erro para o
kernel e lacuna para a composição; não é zero. A integração às adoções vem no incremento
seguinte. Hipóteses por prazo médio podem gerar estoques, mas precisam ser explícitas e não
são inferidas aqui.

Doze testes independentes cobrem a ponte70+5-15-8-12-20=20, estoques entre períodos, negativos,
restituição, valores ausentes, dupla convenção, datas/intervalos, ano bissexto, identidade,
precisão e reprodução. Manifesto corrente v22; R01 imutável. Sem DDL e sem alteração de acesso.
Gates completos, CI e publicação em web/worker são registrados no completion externo. Conteúdo
profissional completo depende de revisão/aprovação específica; etapa15 permanece aberta.
