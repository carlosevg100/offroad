---
id: evaluate-received-proposal
version: 2026.10.27-v1
maturity: implemented
title_pt: Avaliar uma proposta de financiamento recebida
title_en: Evaluate a Received Financing Proposal
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-27
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareReceivedProposalPacket
result_contract: received-proposal-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: received-proposal-packet.v1
unit_test_files: [packages/financial-core/src/evaluate-received-proposal.test.ts, packages/financial-core/src/evaluate-received-proposal.properties.test.ts, packages/financial-model/src/evaluate-received-proposal-packet.test.ts, packages/financial-model/src/evaluate-received-proposal-runs.test.ts, packages/financial-model/src/evaluate-received-proposal-premises.test.ts]
gold_case_ids: [indicative-proposal-is-a-starting-point, lender-has-not-seen-the-indenture, 2027-service-against-available-cash, peak-pressure-in-the-third-quarter-of-2027, december-solved-cash-below-minimum-from-third-quarter-2027, two-thirds-seasonal-on-a-three-year-amortizing-loan, covenant-on-the-indenture-definition, bank-case-and-board-policy, semiannual-test-doubles-the-dates, collateral-against-the-assignable-portfolio, retailer-a-is-not-assignable, aggregate-basket-occupied-by-bradesco, per-operation-reading-changes-only-the-basket, consent-window-against-the-draw, nominal-spread-against-the-market-range, cost-over-the-life-apart-from-the-nominal-spread, bridge-to-the-bradesco-operation, longer-tenor-lightens-the-upfront-costs, asks-and-what-each-buys, company-alternatives-on-the-same-basis, facts-readings-recommendations-apart-without-verdict, questions-for-the-lender-and-the-company, market-below-threshold-is-a-gap-not-a-reading, missing-covenant-test-is-a-gap-not-compliance, every-required-test-through-2028-is-present, net-cost-under-full-deduction-convention, net-cost-withheld-without-taxable-profit, limits-with-no-test-are-gaps, lender-date-before-the-draw-is-contrast-only, lender-frequency-and-first-date-from-effective-dates, test-date-order-changes-nothing, life-past-the-fiscal-calendar-needs-an-adopted-hypothesis, period-after-payoff-never-counts, unconfirmed-indexer-is-asked, absent-basket-usage-is-a-gap-not-zero]
adversarial_case_ids: [tampered-envelope, free-result-in-request, fabricated-grant-in-result, fabricated-verdict-in-readings, fabricated-acceptance-of-the-proposal, nominal-spread-offered-as-the-cost, equivalent-spread-replaced-by-nominal-under-old-fingerprint, adopted-cost-replaced-by-nominal-under-old-fingerprint, repeated-indenture-test-date, repeated-policy-test-date, repeated-lender-test-date, tax-rate-above-one, tax-rate-just-above-one, covenant-test-in-an-undeclared-scenario, basket-read-as-empty-under-the-bradesco-assignment, restricted-receivables-counted-as-free, free-bucket-placed-in-the-basket, assignment-without-holder, indexer-other-than-cdi, covenant-test-off-the-calendar, reading-after-the-draw, parallel-lists-of-different-length, bullet-with-many-installments, market-range-out-of-order, alternative-for-a-use-not-in-the-analysis, figure-read-in-another-scenario]
e2e_scenario_ids: [domain:2027-service-against-available-cash]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: []
reference_data_keys: []
calculation_ids: [financial.received_proposal, financial.equivalent_financing_cost, financial.covenant_headroom, financial.relative_debt_cost_bridge]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [evaluate-received-proposal-2026-10-27-v1-consistency]
adversarial_run_ids: [evaluate-received-proposal-2026-10-27-v1-adversarial]
review_ids: []
gold_run_ids: [evaluate-received-proposal-2026-10-27-v1-gold]
---

# Objetivo
Dizer se uma proposta de financiamento recebida serve à companhia que a recebeu, e não se os termos parecem de mercado de forma genérica. A proposta é lida em termos, nunca com veredito: quanto custa de verdade pela vida (taxa, comissão, IOF, garantia e reciprocidade), se resolve a necessidade que está por trás (prazo contra o calendário de vencimentos e caixa mínimo), o que exige que a companhia não pode dar sem terceiro (cessão contra a carteira cedível e contra a exceção da escritura, covenant e política do conselho), como se compara com a referência de mercado e com a última operação da própria companhia, e o que pedir ao banco na contraproposta.

# Produto
Pacote de avaliação de uma proposta, na ordem da árvore de julgamento: firmeza e validade; serviço da dívida no ano que o calendário da companhia já concentra, com e sem a proposta, contra o caixa disponível para atendê-lo, e o menor caixa por trimestre contra o mínimo; encaixe do prazo com cada uso do dinheiro; covenant na definição da escritura, na do credor e na política do conselho, no caso base e no caso do banco; garantia pedida contra a carteira cedível, com o motivo de cada exclusão, e contra a exceção da escritura para garantia nova; spread nominal contra a faixa de mercado e contra a ponte da última operação; custo efetivo pela vida, bruto e líquido de imposto; o que cada pedido ao banco compra; alternativas da companhia na mesma base; fatos, leituras, recomendações e o que mudaria a conclusão, separados; perguntas ao banco e à companhia.

# Quando ativar
- Uma proposta, carta, term sheet ou mensagem do banco com termos de um financiamento, e a pergunta se ela é boa, se vale aceitar, o que achar dela ou o que pedir.
- Proposta oferecida espontaneamente pelo banco de relacionamento; a pergunta pode vir sem o documento, só com os termos ditos.
- Versão nova da mesma proposta: refazer o pacote e dizer o que mudou.
- "E se" sobre a mesma proposta (manter o valor e negociar só a garantia, outra carência, outro prazo): variantes no mesmo pacote.

# Quando não ativar
- Mais de uma proposta para a mesma necessidade: comparar pelo procedimento de comparação de propostas, que usa o mesmo custo pela vida.
- Necessidades sem proposta na mesa (alongar vencimentos, financiar um investimento): procedimento de estrutura de capital.
- Pedido limitado a ler ou organizar o term sheet: preservar o limite.

# Inputs mínimos e substitutos
- Indexador confirmado por documento ou pela pessoa, com a fonte; sem confirmação, vira pergunta ao banco ou à companhia antes de qualquer número, nunca suposição de CDI.
- Termos da proposta: valor, spread, comissão, data do desembolso, carência, número e intervalo das parcelas, pagamento de juros, tipo de garantia e cobertura, conta vinculada, covenant com limite, datas e definição, pré-pagamento, firmeza e validade. Termo ausente vira pergunta ao banco, nunca suposição.
- Usos do dinheiro com valor e prazo esperado de cada um. Sem propósito não há adequação: falta crítica.
- Calendário da companhia sem a proposta, por trimestre: serviço da dívida existente (tabela de dívida), caixa disponível para o serviço e caixa de fim de período (projeção adotada), períodos tributáveis e caixa mínimo. Substituto: projeção por drivers marcada como estimativa.
- Cenários em que o covenant precisa ser lido (caso da companhia e caso do banco) e, em cada um, a apuração sem a proposta em toda data de teste exigida pela escritura, pelo credor e pela política dentro do horizonte, na definição escrita; limite da escritura vigente com aditamentos e política do conselho quando existir.
- Carteira por grupo: valor, vedação de cessão, cessão a outro credor e se ocupa a exceção da escritura, atraso. Exceção da escritura para garantia nova, com a base (agregada ou por operação) e o que já está ocupado, e prazo de assembleia de referência.
- Curva do CDI por ano, regra do IOF, regime tributário. Referência de mercado com amostra e confiança, só acima do limiar de comparabilidade. Última operação da companhia com as parcelas da ponte.

# Sequência operacional
1. [human_judgment] Entender e planejar :: Ler o que a mensagem diz e não diz, classificar a proposta nos eixos, nomear a decisão por trás (aceitar, negociar, recusar, buscar outra rota) e a premissa a desafiar | evidence: base autorizada, fontes e versões
2. [human_judgment] Saber o que sabe :: Cofre, público e conversa: demonstrações, tabela de dívida, escrituras com aditamentos, carteira, projeção, memória de operações; o que falta e de onde vem | evidence: base autorizada, fontes e versões
3. [human_judgment] Basta para opinar :: Propósito e garantia são faltas críticas; capacidade e cláusulas vigentes, graves; termos e regime, leves. Sem falta crítica, responder de vez com as ressalvas nomeadas | evidence: base autorizada, fontes e versões
4. [deterministic] Custo pela vida :: Cronograma nas datas do contrato, IOF por parcela, comissão retida, spread equivalente na curva datada pelo motor publicado; vida média; custo líquido no lucro real | evidence: base autorizada, fontes e versões
5. [deterministic] Calendário e caixa :: Serviço da proposta por trimestre e por ano sobre o calendário da companhia; ano e trimestre de pico; caixa com a proposta, com o benefício fiscal dos juros e encargos; menor caixa contra o mínimo | evidence: base autorizada, fontes e versões
6. [deterministic] Covenant, garantia e escritura :: Apurações com a proposta pelo núcleo publicado de folga; garantia contra a carteira cedível e contra a exceção da escritura; janela da assembleia contra a data do dinheiro | evidence: base autorizada, fontes e versões
7. [deterministic] Preço e pedidos :: Spread contra a faixa de mercado e ponte contra a última operação pelo núcleo publicado; cada pedido ao banco recalculado; alternativas da companhia na mesma base | evidence: base autorizada, fontes e versões
8. [human_judgment] Desafiar, opinar e devolver :: Testar a premissa (a pergunta é a proposta ou a necessidade), opinar em termos, separar fato, leitura e recomendação, dizer o que mudaria a conclusão, oferecer a contraproposta sem enviá-la | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Cronograma: pagamentos no dia do contrato a cada mês de juros e em cada parcela, sem ajuste a dia útil; principal SAC em parcelas iguais com a última absorvendo o arredondamento em oito casas, ou bullet; o CDI acumula por dias úteis do calendário nacional sobre 252 e os intervalos se partem em 1º de janeiro, onde a curva muda. Price, IPCA, prefixado e percentual do CDI são recusados.
- IOF de crédito: alíquota fixa sobre o valor mais a diária sobre cada parcela, pelos dias corridos do desembolso ao pagamento dela, até o teto declarado. Comissão e IOF retidos no desembolso.
- Custo efetivo pela vida: spread anual que, composto com o CDI de cada intervalo, zera o valor presente dos fluxos líquidos da companhia (motor publicado do custo equivalente). Custo líquido pela convenção simplificada de dedução plena: custo efetivo vezes um menos a alíquota, afirmado só no lucro real e avaliado na vida de cada estrutura (a proposta e cada variante), do desembolso à quitação, sem usar períodos posteriores a ela: todo período da vida tributável e, quando a vida passa do calendário fiscal, hipótese adotada de que os períodos seguintes são tributáveis; sem ela, ou havendo período sem lucro tributável, o líquido daquela estrutura não é afirmado e vira lacuna nomeada; alíquota fora de zero a um é recusada antes de qualquer cálculo, por comparação decimal, nos fatos, no leitor e no núcleo; no presumido, igual ao bruto; regime desconhecido, sem número. Não é uma TIR depois de impostos. Divergência com a ficha 1, decidida a favor do método: a ficha dava CDI + 4,4 bruto somando IOF de 3,38% e comissão sobre 1,8 ano, aproximação que não zera o valor presente; o motor publicado dá CDI + 4,90 bruto e 3,24 líquido na convenção acima. Reciprocidade nunca é precificada aqui.
- Calendário: o serviço da proposta em cada período sai do mesmo cronograma, cortado nos fins de período (núcleo publicado da comparação); serviço total = existente adotado mais o da proposta; o ano de pico é o de maior serviço existente; caixa com a proposta = caixa adotado mais o fluxo acumulado da proposta (desembolso menos retenção, juros e principal, mais o benefício fiscal de juros apropriados e encargos nos períodos tributáveis do lucro real).
- Cobertura do covenant: exigidas todas as datas de teste em vigor dentro do horizonte (as do credor a partir do desembolso), em cada cenário declarado; apuração ausente vira lacuna nomeada, o pacote fica parcial e, sem violação encontrada, a conclusão de violação fica nula, nunca falsa; limite sem nenhuma apuração (escritura, credor ou política, ou todos, inclusive sem apuração alguma adotada) vira lacuna própria e não é testado, sem interromper o pacote. Regra temporal única do credor: data de teste anterior ao desembolso nunca é teste dele, nem nas datas exigidas, nem nos testes efetivos, nem nos limites não testados, nem na conclusão de violação; fica registrada como contraste. Frequência de testes do credor, primeira data de teste e o fato de testar mais vezes que a escritura leem a mesma lista efetiva, ordenada, qualquer que seja a ordem recebida. Toda lista de datas de teste (escritura, credor, política) e de fins de período recusa data repetida, nos fatos, no leitor e no núcleo, com recusa nomeada; as apurações seguem ordem canônica por data e cenário, e a ordem recebida de qualquer lista não muda nenhum campo derivado.
- Covenant: em cada apuração adotada, dívida mais o principal da proposta e caixa mais o fluxo acumulado dela, pelo núcleo publicado de folga, contra a escritura, o credor e a política do conselho, cada um só nas suas datas; folga em vezes do EBITDA = limite menos índice.
- Garantia: exigida = cobertura vezes o valor. Carteira cedível = grupos livres, sem vedação de cessão e sem atraso. Exceção da escritura: agregada = limite menos o já ocupado, por operação = limite; garantia acima dela exige anuência dos debenturistas. O já ocupado não pode ser menor que a cessão que a carteira mostra dentro da exceção.
- Preço: posição do spread nominal na faixa adotada; ponte contra a última operação = diferença observada menos as parcelas adotadas de mercado, risco e estrutura (núcleo publicado da ponte); resíduo é interpretação.
- Integridade: o fingerprint do resultado adotado e do pacote é o hash do conteúdo em JSON canônico de chaves ordenadas, recalculado na validação; valor alterado com fingerprint antigo é recusado.
- Precisão: aritmética decimal de 60 dígitos; resultados em até vinte casas, premissas monetárias em até oito.

# Julgamentos permitidos
- Ordem do que pesa: o ponto que mais pesa vem primeiro, mesmo que não seja o que foi perguntado.
- Recomendar pedidos ao banco e estrutura alternativa, condicionados ao que depende de terceiro; nunca aceitar nem recusar pela companhia.
- O banco é tratado como provável, nunca como certo.

# Perguntas que mudam o trabalho
- A cláusula da escritura limita a garantia em valor agregado ou por operação, e o que já está dentro dela?
- O cliente que veda cessão daria anuência ou tem programa próprio de antecipação?
- Há outro ativo livre para compor a garantia?
- A definição do covenant do credor é a da escritura, e há reciprocidade esperada?

# Red flags
- Ler a exceção da escritura como por operação, ou ignorar o que já está dentro dela.
- Contar como cedível o recebível de cliente que veda cessão.
- Comparar só a taxa nominal.
- Veredito binário; certeza sobre o comportamento do banco.
- Proposta indicativa tratada como dinheiro garantido.
- Indexador presumido como CDI sem confirmação.
- Ausência de apuração lida como cumprimento do covenant.
- Custo líquido afirmado sem lucro tributável, ou para uma vida além do calendário fiscal sem hipótese adotada.
- Alíquota fiscal fora de zero a um.

# Stop conditions
- Sem propósito ou sem garantia entendida: responder em duas etapas, com o que já dá para dizer e as perguntas certas.
- Operando ausente bloqueia o número que depende dele e vira lacuna nomeada; referência de mercado abaixo do limiar não entra; sem operação anterior comparável, a ponte não roda.
- Capacidade: uma base guarda até 256 premissas; o limite nunca trunca premissa em silêncio.
- O pacote não aceita a proposta, não contata o banco, não envia contraproposta e não projeta a companhia.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: received-proposal-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Resultado adotado com cronograma, custo, calendário, encaixe, covenant, garantia, escritura, preço, pedidos e alternativas
- readings (object, required): Leituras na ordem da árvore, avaliação em fato, leitura, recomendação e o que mudaria, perguntas
- gaps (array, required): Operandos ausentes e referências que não entram, com o motivo
- exclusions (array, required): O que o pacote não faz: aceitar a proposta, contatar contraparte, aprovar crédito, opinar juridicamente, precificar reciprocidade
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- "A proposta me parece defensável em preço, mas eu tentaria melhorar a estrutura antes de avançar. Em 2027 o serviço da dívida já é de cerca de R$ 90 milhões contra cerca de R$ 36 milhões de caixa disponível; a CCB acrescenta cerca de R$ 12 milhões. A cessão pedida, de R$ 39 milhões, passa da carteira que pode ser cedida, cerca de R$ 25 milhões sem a rede A, e da exceção da escritura, em que restam cerca de R$ 3 milhões depois da cessão ao Bradesco: depende de anuência dos debenturistas."
## Ruim
- "CDI mais 2,1 está dentro do mercado; a proposta é boa." Compara só a taxa nominal, ignora o custo pela vida, a escritura, a carteira cedível e 2027, e dá veredito.
- "A cessão cabe na exceção de R$ 15 milhões da escritura." Lê a exceção como livre, ignorando os R$ 12 milhões já ocupados pelo Bradesco.

# Testes
## Unit
- packages/financial-core/src/evaluate-received-proposal.test.ts: cronograma, IOF, custo, calendário, covenant, garantia, escritura, preço, pedidos e recusas.
- packages/financial-model/src/evaluate-received-proposal-packet.test.ts: leituras, avaliação sem veredito, estado parcial, contrato publicado.
- packages/financial-model/src/evaluate-received-proposal-premises.test.ts: fatos com origem, premissas, base, composição e pacote igual à calibração.
## Gold
- Ficha 1 corrigida pelas fichas C32, A05 e C09, com o oráculo da C32 como conferência: firmeza, 2027, pico no terceiro trimestre, caixa, encaixe, covenant base, banco e política, garantia, rede A, exceção agregada, janela da assembleia, preço, custo, ponte, pedidos, alternativas, avaliação, perguntas, mercado abaixo do limiar, exceção sem uso informado, apuração de covenant ausente, limites sem nenhuma apuração, custo líquido sem lucro tributável, vida além do calendário fiscal sem hipótese, período depois da quitação que não conta, data do credor anterior ao desembolso só como contraste e indexador não confirmado. Testes de propriedade com semente fixa: vidas de proposta e variante contra calendários fiscais gerados, alíquotas geradas dentro e fora do domínio, apurações removidas ao acaso por limite, datas de teste do credor e de desembolso geradas.
## Adversarial
- Base adulterada, resultado livre, concessão, veredito, aceite, custo nominal, exceção lida como vazia sob a cessão do Bradesco, recebível vedado contado como livre, grupo livre na exceção, cessão sem credor, indexador fora do CDI, apuração fora do calendário, leitura depois do desembolso, listas paralelas de tamanhos diferentes, bullet com várias parcelas, faixa de mercado fora de ordem, alternativa para uso inexistente, número de outro cenário, valor da saída trocado sob fingerprint antigo (pacote e resultado adotado), apuração em cenário não declarado, alíquota acima de um, inclusive por uma casa na vigésima decimal.
## Aceitação
- Executar a conversa da ficha 1 turno a turno pela interface real com fontes e direitos do ambiente de teste.

# Evidência
## Hierarquia
- Term sheet e documentos do cofre; escritura com aditamentos; tabela de dívida; carteira por sacado.
- Projeção adotada e calendário da companhia; curva de mercado com data.
- Premissas da casa marcadas.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número abre até o operando adotado, sua origem e sua versão.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O decisor precisa saber se aceita, negocia, recusa ou busca outra rota. A pergunta é sobre a proposta; o que pesa costuma estar na necessidade por trás dela: o ano que o calendário já concentra, a garantia que a companhia não pode dar sem terceiro e o prazo contra o uso do dinheiro.

## N2. Árvore de decisão
- Proposta indicativa: tudo é leitura de um ponto de partida, dito na primeira frase.
- Prazo e amortização não casam com o uso: primeiro motivo, com a rota que casa.
- Serviço no ano de pico acima do caixa disponível: a proposta acrescenta a um ano já pressionado; carência e prazo viram o pedido central.
- Garantia acima da carteira cedível ou da exceção da escritura: a operação depende de terceiro (cliente, debenturistas); tratar antes de assinar, sem contornar.
- Covenant: escritura, credor e política, cada um nas suas datas; folga abaixo de 0,3x é ponto de negociação.
- Preço dentro da faixa: neutro, o ponto está em outro lugar; acima: argumento com a amostra.
- Ponte contra a última operação: melhora real ou preço pago em garantia.

## N3. Suficiência por conclusão
- Para custo: term sheet completo, curva e regra do IOF.
- Para encaixe e caixa: usos, calendário da companhia e tabela de dívida.
- Para garantia: carteira por sacado, contratos dos maiores clientes, escritura com aditamentos.
- O resíduo é pedido em lote, no máximo duas perguntas por turno, cada uma com o porquê.

## N4. Voz e três níveis de afirmação
Fato (term sheet, escritura, tabela, carteira), leitura (o que o número significa para a decisão) e recomendação (o que pedir e sob que condição) ficam separados. Números com origem. Sem slogan, metáfora, veredito binário ou certeza sobre o banco.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Minha leitura, em termos.
2. Liquidez no ano de pico, com e sem a proposta.
3. Em relação ao que vocês precisam: prazo contra cada uso; covenant.
4. Garantias: carteira cedível e escritura.
5. Preço: faixa de mercado e custo pela vida, separados.
6. Em relação ao histórico de vocês: a ponte.
7. O que esperar do banco e prioridades de negociação, com o que cada pedido compra.
8. Estrutura que eu avaliaria e ressalvas.

## T2. Peças
Serviço da dívida por ano com e sem a proposta, um elemento em foco; carteira bruta à cedível; folga de covenant por data e caso; posição do spread na faixa. Fundo branco, sem vermelho.

# Regra
## R1. Precedência
Escritura com aditamentos e contratos vigentes prevalecem; política do conselho é limite próprio, nunca o contrato; proposta prevalece sobre faixa de mercado.

## R2. Garantia
A exceção da escritura é lida como está escrita; o que já está dentro dela é descontado; cessão vedada não é cedível.

## R3. Voz
Termos, nunca veredito; o banco como provável; ação externa oferecida, não executada.

# Qualidade
## Q1. Teste do MD
O problema real foi entendido (o ano de pico)? A premissa foi desafiada? A garantia foi medida contra a carteira cedível e a escritura? O custo pela vida aparece separado da taxa? Há pedido concreto ao banco com o número que ele compra? O que mudaria a conclusão está dito? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Custo pela vida
Comissão e IOF cobrados na entrada pesam mais quanto mais curta é a vida média; em prazo mais longo o mesmo custo de entrada pesa menos por ano. Por isso o custo é o spread equivalente na curva datada, não a taxa do term sheet.

## Garantia e escritura
Escrituras costumam limitar garantia nova a uma exceção em valor agregado; cessões posteriores já ocupam parte dela. Cliente grande costuma vedar a cessão dos próprios recebíveis.

## Calendário
O que decide é o ano e o trimestre em que o serviço se concentra contra o caixa disponível, não a média; uma dívida nova que amortiza no ano de pico agrava o problema que a companhia já tem.

# Composição tipada
```offroad-procedure
{
  "schemaVersion": "procedure-composition.v1",
  "authoringStatus": "ready_for_review",
  "pendingContent": [],
  "budget": {
    "maxModelCalls": 0,
    "maxDurationMs": 61000,
    "maxCostMinorUnits": 0,
    "currency": "BRL"
  },
  "allowedTools": [],
  "maximumEffect": "none",
  "components": [
    {
      "id": "received-proposal.request-framing",
      "version": "2026.10.27-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional da proposta recebida",
      "inputs": {
        "id": "received-proposal.framing-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "outputs": {
        "id": "received-proposal.framing-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "scope": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "dependencies": [],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 1000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [],
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO decisor precisa saber se aceita, negocia, recusa ou busca outra rota. A pergunta é sobre a proposta; o que pesa costuma estar na necessidade por trás dela: o ano que o calendário já concentra, a garantia que a companhia não pode dar sem terceiro e o prazo contra o uso do dinheiro.\n\nN2. Árvore de decisão\n- Proposta indicativa: tudo é leitura de um ponto de partida, dito na primeira frase.\n- Prazo e amortização não casam com o uso: primeiro motivo, com a rota que casa.\n- Serviço no ano de pico acima do caixa disponível: a proposta acrescenta a um ano já pressionado; carência e prazo viram o pedido central.\n- Garantia acima da carteira cedível ou da exceção da escritura: a operação depende de terceiro (cliente, debenturistas); tratar antes de assinar, sem contornar.\n- Covenant: escritura, credor e política, cada um nas suas datas; folga abaixo de 0,3x é ponto de negociação.\n- Preço dentro da faixa: neutro, o ponto está em outro lugar; acima: argumento com a amostra.\n- Ponte contra a última operação: melhora real ou preço pago em garantia.\n\nN3. Suficiência por conclusão\n- Para custo: term sheet completo, curva e regra do IOF.\n- Para encaixe e caixa: usos, calendário da companhia e tabela de dívida.\n- Para garantia: carteira por sacado, contratos dos maiores clientes, escritura com aditamentos.\n- O resíduo é pedido em lote, no máximo duas perguntas por turno, cada uma com o porquê.\n\nN4. Voz e três níveis de afirmação\nFato (term sheet, escritura, tabela, carteira), leitura (o que o número significa para a decisão) e recomendação (o que pedir e sob que condição) ficam separados. Números com origem. Sem slogan, metáfora, veredito binário ou certeza sobre o banco."
    },
    {
      "id": "received-proposal.packet",
      "version": "2026.10.27-v1",
      "kind": "rule",
      "title": "Avaliar a proposta recebida na companhia que a tomaria",
      "authority": "house",
      "statement": "Custear a proposta pela vida no motor publicado, colocar o serviço dela no calendário da companhia contra o caixa disponível e o mínimo, testar o prazo contra cada uso, medir o covenant na escritura, no credor e na política, medir a garantia contra a carteira cedível e contra a exceção da escritura, comparar o spread com o mercado e com a última operação, recalcular cada pedido ao banco e separar fato, leitura, recomendação e o que mudaria a conclusão, sem aceitar a proposta, sem contatar o banco e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareReceivedProposalPacket",
        "version": "2026.10.27-v1"
      },
      "inputs": {
        "id": "received-proposal-packet-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "received-proposal-packet-input.v1"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "analysis": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "envelope": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "canonical": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "fingerprint": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "scope": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "workId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "purpose": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "versionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "entityId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "perimeter": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "currency": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "openingDate": {
                    "required": true,
                    "value": {
                      "type": "date"
                    }
                  },
                  "endDate": {
                    "required": true,
                    "value": {
                      "type": "date"
                    }
                  },
                  "numericInterpretations": {
                    "required": false,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "mode": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "members": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "analysisId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "scenario": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "readingDate": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "decisionId": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "string"
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "definitionVersionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "definitionKind": {
                          "required": true,
                          "value": {
                            "type": "enum",
                            "values": [
                              "reported",
                              "managerial",
                              "contractual"
                            ]
                          }
                        },
                        "missingReason": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "string"
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "needDate": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "decisionId": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "string"
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "definitionVersionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "definitionKind": {
                          "required": true,
                          "value": {
                            "type": "enum",
                            "values": [
                              "reported",
                              "managerial",
                              "contractual"
                            ]
                          }
                        },
                        "missingReason": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "string"
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "proposal": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "lender": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "indexer": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "firmness": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "termSheetDate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "validityDays": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "amount": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "annualSpread": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "feeRate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "drawDate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "paymentDay": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "graceMonths": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "installments": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "installmentEveryMonths": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "interestEveryMonths": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "amortization": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "collateralKind": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "coverage": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "restrictedAccount": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "covenantLimit": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "covenantTestDates": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "covenantDefinition": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "prepaymentPenaltyRate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "prepaymentPenaltyMonths": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "reciprocity": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "bankSawIndenture": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "creditTax": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "fixedRate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "dailyRate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "maxDays": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "curve": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "years": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "rates": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "tax": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "regime": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "rate": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "taxableAfterCalendar": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "uses": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "label": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "amount": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "kind": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "tenorMinYears": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "tenorMaxYears": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "seasonalPeak": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "decisionId": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "definitionVersionId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "definitionKind": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "reported",
                                  "managerial",
                                  "contractual"
                                ]
                              }
                            },
                            "missingReason": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "calendar": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "periodEnds": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "existingService": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "availableForService": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "closingCash": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "taxable": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "minimumCash": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "covenant": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "indentureLimit": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "indentureTestDates": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "indentureSource": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "requiredScenarios": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "policyLimit": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "policyTestDates": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "policySource": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "dates": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "scenarios": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "debt": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "cash": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "reportedEbitda": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "definitionAdjustment": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        }
                      }
                    }
                  },
                  "portfolio": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "label": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "amount": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "contract": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "encumbrance": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "holder": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "pastDue": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "countsAgainstBasket": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "basket": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "limit": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "basis": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "occupied": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "consentLeadDaysMin": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "consentLeadDaysMax": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "collateralReference": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "coverageLow": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "coverageHigh": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "market": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "comparable": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "low": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "median": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "high": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "sample": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "confidence": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "observedOn": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "history": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "label": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "spread": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "date": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "adjustmentIds": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "adjustmentFamilies": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "adjustmentBps": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "adjustmentAnchors": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "decisionId": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "definitionVersionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "definitionKind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "reported",
                                        "managerial",
                                        "contractual"
                                      ]
                                    }
                                  },
                                  "missingReason": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "variants": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "label": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "graceMonths": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "installments": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "coverage": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "restrictedAccount": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "alternatives": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "id": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "label": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "allInSpread": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "collateral": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "usesCovered": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "monthsToMoneyMin": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "monthsToMoneyMax": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "decisionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "definitionKind": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reported",
                                      "managerial",
                                      "contractual"
                                    ]
                                  }
                                },
                                "missingReason": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "outputs": {
        "id": "received-proposal-packet-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "received-proposal-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.27-v1"
                ]
              }
            },
            "financialCoreVersion": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "basisFingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "scope": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "workId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "purpose": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "versionId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  }
                }
              }
            },
            "entityId": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "currency": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "result": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "financialCoreVersion": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "scope": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "workId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "purpose": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "versionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "entityId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "currency": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "basisFingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "status": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "missing_inputs",
                        "partial_composition"
                      ]
                    }
                  },
                  "gaps": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "bindings": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "interpretationDecisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "normalization": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "adopted-currency-representation.v1"
                                ]
                              }
                            },
                            "scope": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "workId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "purpose": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "versionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "basisFingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "status": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "partial",
                                  "resolved"
                                ]
                              }
                            },
                            "values": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number",
                                          "list"
                                        ]
                                      }
                                    },
                                    "interpretationDecisionIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "trace": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "schemaVersion": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "currency-representation.v1"
                                                  ]
                                                }
                                              },
                                              "engineVersion": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "operands": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "values": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "array",
                                                        "items": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    },
                                                    "declaredScale": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "representation": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "reported_in_declared_scale",
                                                          "already_in_currency_units"
                                                        ]
                                                      }
                                                    }
                                                  }
                                                }
                                              },
                                              "factor": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "outputScale": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "1"
                                                  ]
                                                }
                                              },
                                              "values": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "string"
                                                  }
                                                }
                                              },
                                              "rounding": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "none"
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "representation_not_adopted"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "contributions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "slotKey": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "observation",
                                          "hypothesis"
                                        ]
                                      }
                                    },
                                    "fieldPath": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "dimensions": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "entityId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "perimeter": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "periodStart": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "date"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "periodEnd": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "date"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "currency": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "unit": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "scale": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "scenario": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "number"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "decimal_string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "text"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "date"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "boolean"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "boolean"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "list"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    "observationId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "referenceValue": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "number"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "decimal_string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "text"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "date"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "boolean"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "boolean"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "list"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "array",
                                                      "items": {
                                                        "type": "string"
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "referenceDimensions": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "entityId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "perimeter": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "periodStart": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "date"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "periodEnd": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "date"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "currency": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "unit": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "scale": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "scenario": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "actorId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "grantsExecution": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "classification": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "working_hypothesis",
                                  "working_selection"
                                ]
                              }
                            },
                            "fingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "contributions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "slotKey": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "kind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "observation",
                                "hypothesis"
                              ]
                            }
                          },
                          "fieldPath": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "dimensions": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "entityId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "perimeter": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodStart": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodEnd": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "currency": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "unit": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scale": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scenario": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "value": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "decimal_string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "text"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "date"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "boolean"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "list"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          },
                          "observationId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceValue": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "number"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "text"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "date"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "boolean"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "list"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  ]
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceDimensions": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "perimeter": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodStart": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodEnd": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "currency": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "unit": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scale": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scenario": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "definitionKind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "reported",
                                "managerial",
                                "contractual"
                              ]
                            }
                          },
                          "actorId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "derivedDependencies": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "result": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "classification": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "working_hypothesis",
                        "working_selection"
                      ]
                    }
                  },
                  "grantsExecution": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "grantsPublication": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "fingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "schemaVersion": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "adopted-received-proposal.v1"
                      ]
                    }
                  },
                  "analysisId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "perimeter": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "evaluation": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "received-proposal.v1"
                                ]
                              }
                            },
                            "version": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "currency": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "readingDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "needDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "proposal": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "lender": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "firmness": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "indicative",
                                        "committed"
                                      ]
                                    }
                                  },
                                  "validUntil": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "amount": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "annualSpread": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "drawDate": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "months": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "finalPaymentDate": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "bankSawIndenture": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "prepaymentPenaltyRate": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "prepaymentFreeFrom": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "reciprocity": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "none_stated",
                                        "stated"
                                      ]
                                    }
                                  },
                                  "covenantDefinition": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "enum",
                                          "values": [
                                            "same_as_indenture",
                                            "not_stated"
                                          ]
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "firstLenderTestDate": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "date"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "cost": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "fee": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "creditTax": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "creditTaxRate": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "upfrontCosts": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "upfrontShare": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "weightedAverageLifeYears": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "equivalentSpread": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "equivalentSpreadNet": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "netConvention": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "full_deductibility_simplified",
                                        "not_all_periods_taxable",
                                        "life_beyond_fiscal_calendar",
                                        "no_deduction_presumido",
                                        "regime_unknown"
                                      ]
                                    }
                                  },
                                  "taxRegime": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "lucro_real",
                                        "lucro_presumido",
                                        "unknown"
                                      ]
                                    }
                                  },
                                  "nominalToEquivalentBps": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "serviceByYear": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "year": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "service": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "calendar": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "quarters": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "periodEnd": {
                                            "required": true,
                                            "value": {
                                              "type": "date"
                                            }
                                          },
                                          "existingService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "proposalService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "totalService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "availableForService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "proposalCashFlow": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "taxShield": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "closingCashWithout": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "closingCashWith": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "proposalPrincipal": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "cumulativeProposalCash": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "years": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "year": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "periods": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "existingService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "proposalService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "totalService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "availableForService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "shortfallWithout": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "shortfallWith": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "peakYear": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "peakQuarter": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "periodEnd": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "totalService": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "minimumCash": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "policy": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "without": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "periodEnd": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              },
                                              "amount": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "with": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "periodEnd": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              },
                                              "amount": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "belowPolicyWithout": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "date"
                                            }
                                          }
                                        },
                                        "belowPolicyWith": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "date"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "fit": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "uses": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "id": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "label": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "kind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "seasonal_working_capital",
                                                "long_lived_capex",
                                                "refinancing",
                                                "other"
                                              ]
                                            }
                                          },
                                          "amount": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "share": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "tenorMinYears": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "tenorMaxYears": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "reading": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "longer_than_use",
                                                "shorter_than_use",
                                                "within_use"
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "seasonalShare": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "amountMinusUses": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "weightedAverageLifeYears": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "finalMaturityYears": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "collateral": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "kind": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "receivables_assignment",
                                        "financed_asset",
                                        "other_asset",
                                        "none"
                                      ]
                                    }
                                  },
                                  "coverage": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "restrictedAccount": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "required": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "shortfallToAssignable": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "assignableLeftAfter": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "consentRequired": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "excessOverBasket": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "coverageReference": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "low": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "high": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "atOrAboveTop": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "portfolio": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "gross": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "assigned": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "nominallyFree": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "assignable": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "buckets": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "amount": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "holder": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "assignable": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "boolean"
                                                  }
                                                },
                                                "reasons": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "enum",
                                                      "values": [
                                                        "assigned_to_other_creditor",
                                                        "assignment_prohibited_without_debtor_consent",
                                                        "past_due"
                                                      ]
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "maxAmountOnAssignable": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "seasonalPeak": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "negativePledge": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "applies": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "basis": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "aggregate",
                                        "per_operation"
                                      ]
                                    }
                                  },
                                  "limit": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "occupied": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "remaining": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "consentRequired": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "excess": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "maxCoverageWithoutConsent": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "consentWindow": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "from": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "by": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "needDate": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "slackDays": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "covenant": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "rows": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "date": {
                                            "required": true,
                                            "value": {
                                              "type": "date"
                                            }
                                          },
                                          "scenario": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "ratioWithout": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "ratioWith": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "limits": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "limitId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "indenture",
                                                        "proposal",
                                                        "board-policy"
                                                      ]
                                                    }
                                                  },
                                                  "kind": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "contractual",
                                                        "board_policy"
                                                      ]
                                                    }
                                                  },
                                                  "maximumRatio": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "testedOnDate": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "boolean"
                                                    }
                                                  },
                                                  "headroomWith": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "string"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  },
                                                  "breachedWith": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "boolean"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "worst": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "object",
                                          "fields": {
                                            "measurementId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "limitId": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "indenture",
                                                  "proposal",
                                                  "board-policy"
                                                ]
                                              }
                                            },
                                            "ebitdaHeadroom": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "required": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "date": {
                                            "required": true,
                                            "value": {
                                              "type": "date"
                                            }
                                          },
                                          "scenario": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "missingTests": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "date": {
                                            "required": true,
                                            "value": {
                                              "type": "date"
                                            }
                                          },
                                          "scenario": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "untestedLimits": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "enum",
                                        "values": [
                                          "indenture",
                                          "proposal",
                                          "board-policy"
                                        ]
                                      }
                                    }
                                  },
                                  "lenderDatesBeforeDraw": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "date"
                                      }
                                    }
                                  },
                                  "anyBreachWith": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "boolean"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "testsPerYear": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "indenture": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "lender": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "price": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "market": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "object",
                                          "fields": {
                                            "position": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "below_range",
                                                  "at_or_below_median",
                                                  "above_median_within_range",
                                                  "above_range"
                                                ]
                                              }
                                            },
                                            "toMedianBps": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "toHighBps": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "low": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "median": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "high": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "sample": {
                                              "required": true,
                                              "value": {
                                                "type": "integer"
                                              }
                                            },
                                            "confidence": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "high",
                                                  "moderate",
                                                  "low"
                                                ]
                                              }
                                            },
                                            "observedOn": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
                                              }
                                            }
                                          }
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "history": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "object",
                                          "fields": {
                                            "peer": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "peerDate": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
                                              }
                                            },
                                            "observedBps": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "expectedBps": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "residualBps": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "steps": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "object",
                                                  "fields": {
                                                    "id": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "family": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "pricing_date",
                                                          "tenor",
                                                          "guarantee",
                                                          "instrument_distribution",
                                                          "scale",
                                                          "other"
                                                        ]
                                                      }
                                                    },
                                                    "bps": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "variants": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "graceMonths": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "installments": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "coverage": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "restrictedAccount": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "equivalentSpread": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "equivalentSpreadNet": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "netConvention": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "full_deductibility_simplified",
                                          "not_all_periods_taxable",
                                          "life_beyond_fiscal_calendar",
                                          "no_deduction_presumido",
                                          "regime_unknown"
                                        ]
                                      }
                                    },
                                    "weightedAverageLifeYears": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "finalPaymentDate": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    },
                                    "upfrontCosts": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "peakYearService": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "collateral": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "required": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "shortfallToAssignable": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "assignableLeftAfter": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "consentRequired": {
                                            "required": true,
                                            "value": {
                                              "type": "boolean"
                                            }
                                          },
                                          "excessOverBasket": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "deltas": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "equivalentSpreadBps": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "peakYearService": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "collateral": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "alternatives": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "usesCovered": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "allInSpread": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "allInSpreadDifferenceBps": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "collateral": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "consentRequired": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "monthsToMoney": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "min": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "max": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "schedule": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "baseDate": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "currency": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "moneyUnit": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "grossAdvance": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "upfrontWithheldCosts": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "annualSpread": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "unpaidInterestBase": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "principal_plus_accrued"
                                      ]
                                    }
                                  },
                                  "periods": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "id": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "startDate": {
                                            "required": true,
                                            "value": {
                                              "type": "date"
                                            }
                                          },
                                          "endDate": {
                                            "required": true,
                                            "value": {
                                              "type": "date"
                                            }
                                          },
                                          "yearFraction": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "annualIndex": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "yearFractionConvention": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "business_days_252"
                                              ]
                                            }
                                          },
                                          "businessDays": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "sourceAnchor": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "scheduledPrincipal": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "paysAccruedInterest": {
                                            "required": true,
                                            "value": {
                                              "type": "boolean"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "exclusions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "enum",
                        "values": [
                          "proposal_acceptance",
                          "counterparty_contact",
                          "credit_approval",
                          "legal_opinion",
                          "reciprocity_pricing",
                          "company_projection",
                          "method_release"
                        ]
                      }
                    }
                  }
                }
              }
            },
            "readings": {
              "required": true,
              "value": {
                "type": "union",
                "variants": [
                  {
                    "type": "object",
                    "fields": {
                      "firmness": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "firmness": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "indicative",
                                  "committed"
                                ]
                              }
                            },
                            "validUntil": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "bankSawIndenture": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "diligenceMayReopenStructure": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            }
                          }
                        }
                      },
                      "liquidity": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "peakYear": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "existingService": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "proposalService": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "totalService": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "availableForService": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "peakQuarter": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "minimumCashWith": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "periodEnd": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "amount": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "firstBelowPolicyWith": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "date"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "firstBelowPolicyWithout": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "date"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        }
                      },
                      "fit": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "seasonalShare": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "weightedAverageLifeYears": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "finalPaymentDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "uses": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "amount": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reading": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "longer_than_use",
                                          "shorter_than_use",
                                          "within_use"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "covenant": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "rows": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "date": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    },
                                    "scenario": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "ratioWith": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "headroom": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "limitId": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "indenture",
                                                  "proposal",
                                                  "board-policy"
                                                ]
                                              }
                                            },
                                            "testedOnDate": {
                                              "required": true,
                                              "value": {
                                                "type": "boolean"
                                              }
                                            },
                                            "headroomWith": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "breachedWith": {
                                              "required": true,
                                              "value": {
                                                "type": "boolean"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "testsPerYear": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "indenture": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "lender": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  }
                                }
                              }
                            },
                            "anyBreachWith": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "boolean"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "missingTests": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "date": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    },
                                    "scenario": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "untestedLimits": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "indenture",
                                    "proposal",
                                    "board-policy"
                                  ]
                                }
                              }
                            },
                            "lenderDatesBeforeDraw": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "date"
                                }
                              }
                            }
                          }
                        }
                      },
                      "collateral": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "required": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "nominallyFree": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "assignable": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "shortfallToAssignable": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "assignableLeftAfter": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "seasonalPeak": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "excluded": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "amount": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "holder": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "reasons": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "enum",
                                          "values": [
                                            "assigned_to_other_creditor",
                                            "assignment_prohibited_without_debtor_consent",
                                            "past_due"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "coverage": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "restrictedAccount": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            }
                          }
                        }
                      },
                      "negativePledge": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "basis": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "aggregate",
                                  "per_operation"
                                ]
                              }
                            },
                            "limit": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "occupied": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "remaining": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "consentRequired": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "excess": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "consentBy": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "needDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "slackDays": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            }
                          }
                        }
                      },
                      "price": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "nominalSpread": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "equivalentSpread": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "equivalentSpreadNet": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "netConvention": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "full_deductibility_simplified",
                                  "not_all_periods_taxable",
                                  "life_beyond_fiscal_calendar",
                                  "no_deduction_presumido",
                                  "regime_unknown"
                                ]
                              }
                            },
                            "upfrontShare": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "creditTaxRate": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "weightedAverageLifeYears": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "marketPosition": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "enum",
                                    "values": [
                                      "below_range",
                                      "at_or_below_median",
                                      "above_median_within_range",
                                      "above_range"
                                    ]
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "history": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "observedBps": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "expectedBps": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "residualBps": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        }
                      },
                      "asks": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "id": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "label": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "peakYearServiceDelta": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "equivalentSpreadDeltaBps": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "collateralDelta": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "consentStillRequired": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "netConvention": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "full_deductibility_simplified",
                                    "not_all_periods_taxable",
                                    "life_beyond_fiscal_calendar",
                                    "no_deduction_presumido",
                                    "regime_unknown"
                                  ]
                                }
                              },
                              "restrictedAccount": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        }
                      },
                      "alternatives": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "id": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "usesCovered": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              },
                              "allInSpreadDifferenceBps": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "consentRequired": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        }
                      },
                      "assessment": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "facts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "proposal_indicative",
                                    "collateral_exceeds_assignable_portfolio",
                                    "assignment_prohibited_receivables_excluded",
                                    "indenture_consent_required",
                                    "peak_year_service_exceeds_available_cash",
                                    "cash_below_minimum_with_proposal",
                                    "board_policy_breached_in_a_case",
                                    "lender_tests_more_often_than_indenture",
                                    "restricted_account_requested",
                                    "coverage_at_top_of_reference"
                                  ]
                                }
                              }
                            },
                            "readings": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "term_longer_than_seasonal_use",
                                    "term_shorter_than_capex_use",
                                    "all_in_cost_well_above_nominal",
                                    "nominal_spread_below_range",
                                    "nominal_spread_at_or_below_median",
                                    "nominal_spread_above_median_within_range",
                                    "nominal_spread_above_range",
                                    "improvement_partly_paid_in_collateral",
                                    "real_improvement_against_last_operation",
                                    "covenant_headroom_tight",
                                    "diligence_may_reopen_structure",
                                    "covenant_tests_missing",
                                    "net_cost_conditioned_on_taxable_profit"
                                  ]
                                }
                              }
                            },
                            "recommendations": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "address_indenture_consent_before_signing",
                                    "ask_longer_grace_and_tenor",
                                    "ask_lower_coverage_and_no_restricted_account",
                                    "separate_uses_by_term",
                                    "keep_price_discussion_secondary"
                                  ]
                                }
                              }
                            },
                            "wouldChange": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "debtor_consent_for_restricted_receivables",
                                    "indenture_clause_wording",
                                    "other_free_asset_for_collateral",
                                    "seasonal_need_above_adopted",
                                    "committed_terms_after_diligence"
                                  ]
                                }
                              }
                            }
                          }
                        }
                      },
                      "questions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "enum",
                            "values": [
                              "lender_covenant_definition",
                              "reciprocity_expected_by_lender",
                              "restricted_debtor_consent",
                              "indenture_clause_wording",
                              "other_free_asset"
                            ]
                          }
                        }
                      },
                      "process": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "acceptsProposal": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "contactsLender": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "counterproposalSent": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "fields": {
                    "operand": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    },
                    "reason": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "openQuestions": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "enum",
                  "values": [
                    "indexer_confirmation"
                  ]
                }
              }
            },
            "status": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "framed",
                  "partial",
                  "prepared_for_human_review"
                ]
              }
            },
            "exclusions": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "enum",
                  "values": [
                    "proposal_acceptance",
                    "counterparty_contact",
                    "credit_approval",
                    "legal_opinion",
                    "reciprocity_pricing"
                  ]
                }
              }
            },
            "grantsExecution": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "grantsPublication": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "fingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "dependencies": [
        {
          "id": "received-proposal.request-framing",
          "version": "2026.10.27-v1"
        }
      ],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 60000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [
        "packages/credit-playbook/knowledge/reviews/runs/evaluate-received-proposal-2026-10-27-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/evaluate-received-proposal-2026-10-27-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/evaluate-received-proposal-2026-10-27-v1-consistency/run.json"
      ]
    }
  ]
}
```
