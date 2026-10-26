# Lote 3: questionar a projeção (C26, 2026.10.26-v1)

Procedimento `challenge-financial-projection` em `packages/credit-playbook/knowledge/procedures/capital/`, da ficha C26, com núcleo de cálculo em `packages/financial-core`, leitor da base adotada, pacote, premissas e composer em `packages/financial-model`, e corridas gold, adversarial e de consistência registradas. Maturidade `implemented`: passa a `tested` só depois da revisão técnica independente. Nada é publicado nem ativado por este incremento.

## challenge-financial-projection (C26)

Executor `prepareProjectionChallengePacket`, núcleos `projectByDrivers` e `challengeProjection`. O plano da companhia e uma referência por drivers, nos mesmos anos e cada um no seu cenário: volume, preço líquido e custo variável por unidade, custos fixos e juros por ano; prazos, capex de manutenção, arrendamentos, depreciação e alíquota por caso. Receita, EBITDA, margem, giro por prazos sobre 360 dias, imposto caixa da convenção da referência e caixa disponível; o primeiro ano não tem saldo anterior e fica sem caixa. Distância no ano-alvo em EBITDA, margem e caixa; a margem que o plano atinge e a causa que ele declara, quando declara.

Cada diferença entre os casos pertence a uma premissa nomeada; premissa sem diferença é recusada e drivers de resultado (volume, preço, custo variável, fixos) nunca são agrupados, o que impede o corte uniforme. Efeito isolado em duas convenções, ambas independentes da ordem: sobre a referência (a referência com só aquela premissa trazida do plano, menos a referência; é a da ficha e a que ordena) e sobre o plano (o plano menos o plano com só aquela premissa devolvida). Os efeitos não somam a distância; a interação aparece para cada convenção. Crescimento composto de cada driver no plano e na referência, margem por unidade, volume contra a capacidade instalada e se o plano traz o investimento, valor de um dia de prazo e o caixa do prazo pedido pelos clientes, e, no segundo turno, a participação de mix que o preço do plano exigiria de uma linha premium.

Régua e evidência que sustentaria cada premissa são premissas da casa adotadas; se a companhia já apresentou o documento é um fato informado. Recomendação: com premissas que elevam o plano sem evidência, ou volume acima da capacidade sem investimento, base com o que se documenta e a referência no resto, e o plano atual como cenário de alta com as condições. Capacidade não informada é lacuna e pergunta.

Exclusões: execução de cenário, refazer o modelo, produção de material, aprovação de crédito, liberação de método. Corridas: gold 16, adversarial 14, consistência 6.

## Limites

Revisão independente, registro do executor e dos contratos, publicação, captura, ponte de conversa e página de resultado são incrementos seguintes. A leitura de premissas a partir das fórmulas do modelo enviado e a detecção de erro técnico no modelo ficam fora deste executor: os drivers chegam adotados.
