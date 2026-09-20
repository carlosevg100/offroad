# Etapa15: projeção operacional sob adoções

`adopted-operating-projection.ts` resolve contribuição, definição e contexto para cada entrada.
Abertura é estoque na data-base e cenário histórico; fechamento é série projetada. Convenção de
ponte e receita são elas mesmas adotadas. Receita pode ser série de valores ou quantidade vezes
preço líquido; não há multiplicação adicional quando a origem já declara receita. Quantidades
não recebem conversão monetária; sua escala deve ser unitária. Dinheiro admite interpretação
adotada com proveniência pelo contrato existente.

Cada série tem o mesmo número de períodos, até240; datas contíguas são verificadas no núcleo.
Contribuição ou observação original reutilizada em dois operandos é recusada. Ausência de
convenção, tributo, capex, giro ou representação mantém lacuna e impede cálculo. Originais,
interpretações e dependências de cada período são conservados; reprodução usa os mesmos bytes
de entrada e versões. Hipótese continua hipótese. Nem hash nem contribuição conferem acesso:
leitor SQL autorizado e revalidação sob manifesto continuam obrigatórios.

Dezenove casos: caixa20/50, receita por valor, ausência de tributo/convenção, oito dimensões,
abertura histórica, escala, reutilização de fato, séries, injeção, convenção divergente,
envelope/escopo e reprodução. Fixture sintética em testing-fixtures. Sem DDL, nova rota,
telemetria, execução em dados de cliente ou publicação profissional. Check integral e CI,
web/worker no mesmo commit, sondas de leitura e completion comprovam entrega do incremento.
A comparação de alternativas, revisão e publicação do procedimento completo permanecem na15.
