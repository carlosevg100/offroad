# Etapa15: caixa por período e dívida residual

`buildCapitalPeriodCash` recebe operandos dos motores operacional e de financiamento e os
recalcula. Não aceita resultado intermediário como prova. Moeda, data-base e horizonte são
comuns. Operação projetada entra no caixa disponível sob convenção explícita; financiamento
preserva sua conta disponível ou restrita. O caixa de uma conta não cobre automaticamente a
outra. O caixa restrito inicial desconhecido também é lacuna, não saldo zero.

Em cada período: saldo final disponível = abertura disponível + caixa operacional antes do
financiamento + fluxos financeiros da conta. Saldo restrito usa apenas os fluxos de sua conta.
Dívida final de cada instrumento é observada na mesma data de fechamento: sem essa data no
cronograma o cálculo recusa interpolação. Datas de eventos financeiros são preservadas no trace.
Saldos mínimos e déficits são medidos somente na abertura e fechamentos. Não são declaração de
liquidez diária; pagamento anterior ao recebimento dentro do mês exige calendário datado.

Dívida residual, custo nominal no horizonte e ausência de comparação de vida inteira aparecem
explicitamente. Alongamento não se transforma em economia só porque parcela saiu do horizonte.
Dívida/financiamento ausentes exigem inventário com razão; qualquer custo desconhecido bloqueia
resultado de caixa, preservando a projeção operacional para orientação parcial.

Onze testes verificam caixa245/53, dívida220/0, custo47, residual242 no alongamento, caixa
restrito, saldo negativo, abertura negativa, data de estoque ausente, contextos, custo/caixa
desconhecidos, ausência explícita de dívida, precisão e reprodução. Núcleo v23, core213PASS.
Sem DDL ou nova autorização; integração sob adoções e comparação seguem na15. Manifesto
corrente gerado, R01 preservado. Gates/CI/implantação registrados no completion externo.
