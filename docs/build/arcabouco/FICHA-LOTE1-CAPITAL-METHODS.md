# Lote 1 de fichas: comparar propostas, custo relativo da dívida e capacidade de endividamento (2026.10.19-v2)

Três procedimentos de `packages/credit-playbook/knowledge/procedures/capital/` saem de implementado para testado, cada um com executor determinístico, corridas registradas e revisão técnica independente gravada sem edição. Nenhum é publicado nem ativado por este incremento.

## compare-financing-proposals (C02)

Executor `@offroad/financial-model#prepareFinancingComparisonPacket`. Cada proposta é descrita uma vez, pela vida da operação; a visão da companhia sai do mesmo cronograma, cortado nos fechamentos de período pela convenção do período (DU/252 pelo calendário nacional de feriados bancários, com Páscoa gregoriana). Custo efetivo equivalente sobre fluxos líquidos; nas datas de contrato, só comissão e tributo datados no desembolso são retidos, e encargos posteriores entram na data em que são pagos, com a curva cortada nessa data. IOF: alíquota fixa mais a diária por parcela pelos dias corridos até o teto. Impostos, caixa e covenant recalculados por proposta; covenant na definição e nas datas de cada credor, com folga em pontos e em EBITDA. Fatos ambíguos (parcela repetida, curva que não cobre o primeiro ano, duas taxas no mesmo ano, estresse fora do horizonte, data de desembolso fora do trimestre, dedutibilidade não declarada) são recusados ou viram lacuna nomeada. Corridas: gold 18, adversarial 25, consistência 6. Revisão independente em onze rodadas; a última é condicional ao limite de 256 premissas, já declarado no procedimento.

## analyze-relative-debt-cost (C03)

Executor `prepareRelativeDebtCostPacket`. Decomposição da diferença bruta em ajustes adotados, resíduo de crédito e parcela que não diz respeito ao risco da companhia (indefinida quando a diferença bruta é zero); diferença bruta sem a ponte completa só para spread cotado no mesmo indexador conhecido; lente do comitê com definições iguais; degraus implícitos com sentido separado da magnitude; alavancas com custo coberto. Corridas: gold 16, adversarial 12, consistência 6. Revisão independente aprovada na quarta rodada.

## assess-debt-capacity (C04)

Executor `prepareDebtCapacityPacket`. Capacidade conjunta pela interseção do motor, limite que prende na primeira falha do quantum seguinte (limite, data, cenário), valor pedido revisado em alavancagem, caixa e cobertura por cenário, com o caixa descontado pela convenção adotada do cenário, e plano vigente contra caixa depois de juros. Corridas: gold 12, adversarial 10, consistência 6. Revisão independente aprovada na quinta rodada.

## Limites

Publicação, captura do executor, perfil, liberação da capacidade, ponte de conversa e página de resultado são incrementos seguintes e dependem da aprovação de conteúdo do fundador por lote. A variante datada do oráculo da C02 tem calendário de feriados móveis incorreto e não é referência numérica nessa modalidade; a referência trimestral confere.
