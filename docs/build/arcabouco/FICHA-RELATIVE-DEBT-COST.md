# C03: ponte de custo relativo sobre dados adotados

## Incremento

financial-core v28 acrescenta calculateRelativeDebtCostBridge e calculateDebtCostAction; financial-model liga ambos a contribuições imutáveis por calculateAdoptedRelativeDebtCost. Não há número, ajuste ou convenção financeira livre no adaptador. SQL autorizado precisa validar ambos os emissores e direitos das fontes antes de chamar o componente; fingerprint não concede acesso.

## Calibração e interpretação

21 testes novos PASS. O oráculo original C03 foi executado isoladamente e seu JSON reproduzido antes destes testes. A ponte mantém 125 bps brutos, 70 de ajustes, 65 depois da data e 55 residuais. Sinais negativos ampliam o residual; grupos de efeito sobrepostos, indexadores diferentes sem curva equivalente e fontes/metodologias ausentes são recusados. Uma ponte limitada não chama o restante de risco de crédito explicado; nunca há atribuição causal nem rating oficial.

Rating: principal afetado de 90 milhões e ganho de 15/25 bps geram 135/225 mil de economia anual estimada; custos adotados de 300/200 mil deixam faixa -165/+25 mil. Refinanciamento: 40 milhões por 13 meses, sob aproximação de spread marginal explicitamente adotada, reproduzem 0,30/0,17 milhão de economia e 1,75 milhão de custos na apresentação. A taxa de imposto da ficha é uma premissa do cenário, nunca padrão legal. Não é VPL contratual nem reprecificação garantida. Comparação por diferença de taxas efetivas requer o fator do indexador adotado. Saldo variável usa períodos de exposição distintos; não aplica economia à dívida inteira.

## Controles

Integridade, trabalho/finalidade/versão, entidades e perímetros separados, moeda, período, cenário, definição, unidade/escala, campo e comparação; interpretação monetária real e dependências preservadas. Contribuição/observação duplicada, lacuna preenchida por zero, data futura, série fora do horizonte e calendário divergente são recusados. Inventário explicitamente adotado vazio é diferente de inventário ausente. Custos incompletos mantêm os conhecidos e bloqueiam benefício líquido. Uma revisão preserva o resultado antigo.

## Limite e publicação

partial_composition: o componente não fornece lente qualitativa de crédito, pesquisa/objeto de mercado autorizado, causalidade, rating, release de método, contato ou material automaticamente. Não há RPC, migração nem alteração de permissão. Os artefatos publicados v24/v4 permanecem intactos; apenas identidade prospectiva v28 muda, com igualdade econômica histórica conferida antes do novo fingerprint. Gate completo, CI, merge, implantação, composição governada e ensaio pela interface ainda pendentes.
