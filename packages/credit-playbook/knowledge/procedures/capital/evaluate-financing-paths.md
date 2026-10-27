---
id: evaluate-financing-paths
version: 2026.10.27-v1
maturity: implemented
title_pt: Avaliar caminhos de financiamento na mesma base
title_en: Evaluate Financing Paths on One Basis
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-27
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareCapitalPathsPacket
result_contract: capital-structure-paths-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: capital-structure-paths-packet.v1
unit_test_files: [packages/financial-core/src/capital-structure-paths.test.ts, packages/financial-model/src/capital-structure-paths-packet.test.ts, packages/financial-model/src/capital-structure-paths-runs.test.ts, packages/financial-model/src/capital-structure-paths-premises.test.ts]
gold_case_ids: [first-shortfall-in-december-2026-without-action, cash-at-the-end-of-2027-without-action, 2027-service-against-cash-available-before-the-project, seven-paths-and-two-companions-on-the-same-base, recommended-path-comes-from-the-gates, leverage-on-the-indenture-definition-in-december, oracle-paths-on-the-same-base, three-year-ccb-adds-to-2027-and-leaves-bradesco-open, taxes-recomputed-per-path, aggregate-basket-with-bradesco-inside, five-year-amortization-fails-in-2029-seven-passes, effective-cost-of-the-issue-over-its-life, bradesco-only-extension-leaves-a-gap, dated-alternative-before-the-bradesco-maturity, issue-target-apart-from-the-floor-inside-the-gates, wheat-sensitivity-at-the-c24-level, seasonal-line-leaves-the-test-only-with-a-verified-settlement, cost-flows-are-the-cash-flows, what-would-change-the-recommendation, facts-readings-recommendations-apart-without-verdict, minimum-cash-of-policy-changes-the-order, absent-minimum-cash-is-a-gap-not-zero]
adversarial_case_ids: [tampered-envelope, free-result-in-request, recommendation-supplied-as-text, taxes-supplied-per-path-instead-of-recalculated, fabricated-grant-in-result, fabricated-verdict-in-readings, recommendation-not-from-the-gates, path-that-misses-the-policy-recommended, fabricated-contact-with-investors, basket-read-as-empty-under-the-bradesco-assignment, semiannual-interest-paid-instead-of-accrued, amortization-after-the-horizon-ignored, long-debt-labeled-seasonal-to-skip-the-amortization-test, existing-debt-dropped-from-a-path, prepayment-without-contract-terms, financed-asset-placed-in-the-basket, covenant-test-off-the-calendar, parallel-lists-of-different-length, selection-pointing-at-another-operand]
e2e_scenario_ids: [domain:recommended-path-comes-from-the-gates]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: []
reference_data_keys: []
calculation_ids: [financial.capital_structure_paths, financial.financing_cash_flows, financial.capital_period_cash, financial.projected_leverage_covenant, financial.debt_capacity, financial.equivalent_financing_cost]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [evaluate-financing-paths-2026-10-27-v1-consistency]
adversarial_run_ids: [evaluate-financing-paths-2026-10-27-v1-adversarial]
review_ids: []
gold_run_ids: [evaluate-financing-paths-2026-10-27-v1-gold]
---

# Objetivo
Dar a quem decide a rota e a ordem de financiamento para necessidades de natureza diferente (giro sazonal, investimento e vencimentos), avaliando todos os caminhos na mesma base e na mesma régua. Cada caminho é recalculado trimestre a trimestre: caixa contra o mínimo de política, serviço da dívida, imposto do próprio caminho, alavancagem na definição da escritura e na política do conselho, uso da exceção agregada da escritura e amortização depois do horizonte. A ordem e a recomendação saem de portões declarados e testados, nunca de texto de entrada. Complementa o procedimento de estrutura de capital: aquele organiza a decisão e a sua entrega; este recalcula o plano de financiamento caminho a caminho, com o imposto de cada caminho, juros acumulados até o pagamento, serviço por período, caixa mínimo de política e a exceção da escritura.

# Produto
Pacote do plano de financiamento, na ordem da árvore: o que acontece sem ação (primeiro trimestre abaixo do mínimo, ano em que o serviço se concentra contra o caixa disponível antes do investimento do projeto); os caminhos adotados, com caixa por trimestre até o fim do horizonte, menor caixa, serviço, principal e juros por ano, imposto, custo financeiro até o horizonte, dívida líquida no fim, alavancagem nas datas de apuração no caso base e no caso de estresse, uso da exceção da escritura e teste da amortização depois do horizonte com o perfil adotado e com perfis alternativos; a ordem pelos portões e depois pelo custo; o caminho recomendado com a condição objetiva (spread máximo da sondagem), o custo efetivo do instrumento longo pela vida, o valor mínimo de emissão que mantém o caminho dentro dos portões e as datas de sondagem e de decisão; o plano alternativo datado, com as condições que ele ainda carrega; o que mudaria a recomendação; fatos, leituras e recomendações separados, sem veredito.

# Quando ativar
- O usuário quer financiar um investimento e aliviar vencimentos, alongar a dívida, separar o financiamento por uso ou escolher entre debênture, alongamento bancário, linha de giro e adiar o investimento.
- Paráfrases: "vence muita coisa ano que vem e ainda quero fazer o investimento", "como financio a expansão sem apertar o caixa", "quero alongar a dívida e fazer o capex", "só me mostre os caminhos para a dívida de 2027".
- O pedido sem recomendação é atendido com os caminhos e a ordem; a recomendação fica registrada e não é apresentada.

# Quando não ativar
- Uma proposta recebida: procedimento de avaliação de proposta. Mais de uma proposta para a mesma necessidade: comparação de propostas.
- Material para o conselho: procedimento de discussão de capital no conselho, que lê este pacote.
- Pedido limitado a quanto de dívida cabe para um projeto: procedimento de capacidade de endividamento.
- Entrega formal da decisão de estrutura de capital com contratos preparados: procedimento de estrutura de capital, que pode ler este pacote.

# Inputs mínimos e substitutos
- Tabela de dívida datada: saldo, indexador e spread por período, calendário de juros (trimestral pago ou semestral acumulado até o pagamento), amortização, encargos, garantia e se ela ocupa a exceção da escritura, termos de pré-pagamento e o que acontece com o saldo depois do horizonte. Termo ausente vira lacuna, nunca suposição.
- Projeção operacional adotada por trimestre (EBITDA, D&A, arrendamentos, giro estrutural e sazonal, capex de manutenção) e as variantes do investimento (seguir, adiar, sem a linha), cada uma com EBITDA, D&A, manutenção, capex e giro da partida.
- Caixa de abertura e caixa mínimo de política. Covenant da escritura com aditamentos (definição, limite e datas), política do conselho e a definição que a mede, histórico que completa a janela de doze meses, caso de estresse.
- Exceção da escritura para garantia nova, com a base (agregada ou por operação) e o que já está ocupado.
- Termos de cada instrumento novo; curva do CDI por período e depois do horizonte; alíquota de imposto.
- Base anual depois do horizonte para o teste de amortização (EBITDA, arrendamentos, manutenção, giro, D&A e juros de linhas sazonais), da capacidade de endividamento quando já existe.
- Sensibilidades adotadas (por exemplo, custo de insumo, prazo de recebimento, caixa mínimo de política) e as datas da sondagem e da decisão de rota.

# Sequência operacional
1. [human_judgment] Entender e planejar :: Ler as necessidades por trás do pedido (giro, investimento, vencimentos), o horizonte e a premissa a desafiar; o investimento é revisto antes de ser financiado | evidence: base autorizada, fontes e versões
2. [human_judgment] Saber o que sabe :: Tabela de dívida, escritura e contratos, projeção, análise do investimento, política do conselho, base depois do horizonte; o que falta e de onde vem | evidence: base autorizada, fontes e versões
3. [human_judgment] Basta para opinar :: Escritura e contrato do maior credor são falta grave para escolher a rota; para dimensionar basta a tabela e a projeção. O resíduo é pedido em lote, com o porquê | evidence: base autorizada, fontes e versões
4. [deterministic] Caminhos na mesma base :: Cada caminho pelo núcleo publicado: dívida datada com juros acumulados até o pagamento, pré-pagamentos com o prêmio contratual, encargos, imposto do próprio caminho, caixa por período | evidence: base autorizada, fontes e versões
5. [deterministic] Limites :: Alavancagem na definição da escritura e na política, base e estresse; uso da exceção agregada enquanto a escritura vigora; amortização depois do horizonte pelo núcleo de capacidade | evidence: base autorizada, fontes e versões
6. [deterministic] Ordem e recomendação :: Portões declarados, depois custo até o horizonte e dívida líquida; condição da sondagem; valor mínimo de emissão; plano alternativo datado; sensibilidades | evidence: base autorizada, fontes e versões
7. [human_judgment] Desafiar, opinar e devolver :: Separar fato, leitura e recomendação, dizer o que mudaria a conclusão, propor a sequência com datas; não contatar bancos, gestoras ou BNDES | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Dívida: núcleo publicado de dívida datada e de encargos. Taxa do período = ((1 + CDI) x (1 + spread))^(meses/12) - 1, composição multiplicativa do núcleo de composição de taxas; prefixado e TLP mais spread como taxa anual adotada. Juros semestrais acumulam até junho e dezembro e rendem a taxa do período até o pagamento; juros trimestrais são pagos no período. Desembolso no início do período, pagamentos no fim.
- Pré-pagamento: o caminho escolhe o instrumento e o período; o prêmio sai dos termos (fixo sobre o valor ou taxa ao ano sobre a vida média remanescente) e entra como encargo do período.
- Imposto: recalculado em cada caminho e cenário, alíquota adotada sobre EBITDA menos D&A, arrendamentos, juros apropriados e encargos; base negativa paga zero.
- Caixa: núcleo publicado de caixa por período; caixa disponível para o serviço = caixa operacional depois de imposto, arrendamentos, giro e manutenção, antes do capex e do giro da partida do projeto (classificação adotada).
- Alavancagem: núcleo publicado de índice projetado; janela de doze meses completada pelo histórico; dívida principal menos caixa disponível; EBITDA sem IFRS 16 quando a escritura assim define; a política usa a definição da escritura até o conselho escrever a sua.
- Exceção da escritura: em cada período em que a escritura vigora, soma das garantias que ocupam a exceção (base agregada) ou a maior delas (por operação), mais o que já está ocupado por terceiros; acima do limite, exige anuência ou resgate.
- Depois do horizonte: o saldo de cada instrumento é amortizado pelo perfil adotado, com a última parcela absorvendo o resto do arredondamento, de modo que o principal fecha exatamente no último pagamento; uma linha só sai do teste como sazonal com data de liquidação até doze meses depois do desembolso e no primeiro ano depois do horizonte, justificativa adotada e fonte de caixa conferida na base (desembolso não maior que o giro sazonal consumido no período e liberação de ao menos o mesmo valor nos meses equivalentes do ano anterior); o maior saldo passa pelo núcleo publicado de capacidade de endividamento, os demais entram como serviço fixo em saldo médio; o teste compara a amortização programada com o caixa disponível depois dos juros, ano a ano.
- Custo efetivo: spread equivalente sobre a curva datada pelo núcleo publicado de custo equivalente, resolvido sobre os mesmos fluxos do cálculo de caixa (núcleo de dívida indexada com a base de juros e o tratamento de cupom do instrumento, encargos pagos no fim do período), no spread adotado e no spread máximo da condição; os fluxos acompanham o resultado.
- Portões: caixa mínimo de política no caso base; caixa não negativo no estresse; escritura e política no base e no estresse; exceção sem anuência; amortização depois do horizonte testada e coberta. Ordem: menos portões perdidos, depois custo financeiro até o horizonte (juros pagos e encargos), depois dívida líquida no fim, depois o identificador.
- Alvo e piso da emissão: o alvo é o valor adotado no plano; o piso é o menor valor que mantém o caminho dentro dos portões, por bisseção no quantum adotado, escalando desembolsos, amortizações, garantia e encargos do instrumento longo. As leituras trazem os dois separados.
- Sensibilidades: cada uma devolve o EBITDA por ano que deixa no caminho recomendado; a sensibilidade de custo de insumo adota o nível de EBITDA do cenário de origem (por exemplo, 52,64 em 2027 no cenário informado da projeção por drivers), não o choque relativo à outra base.
- Precisão: aritmética decimal; valores monetários adotados com até oito casas; resultados com até vinte casas.

# Julgamentos permitidos
- Ordem do que pesa: o aperto mais próximo vem primeiro, mesmo que a pergunta fale do ano seguinte.
- Peso entre segurança e crescimento dito com o motivo; investimento de eficiência com retorno marginal pede revisão antes do financiamento.
- Faixas de preço com amostra e confiança, nunca como oferta; o banco e o investidor como prováveis, nunca como certos.

# Perguntas que mudam o trabalho
- A exceção da escritura é agregada ou por operação, e o que já está dentro dela?
- A escritura permite resgate antecipado facultativo, e com que prêmio?
- O equipamento é elegível ao Finame? Os maiores clientes têm programa de antecipação a fornecedores?
- Há regra da companhia para caixa mínimo, cessão de recebíveis ou aval dos sócios?

# Red flags
- Rolagem do maior credor tratada como certa.
- Exceção da escritura lida como livre com a cessão existente dentro dela.
- Imposto tomado de outro cenário; juros semestrais tratados como pagos no trimestre.
- Debênture com amortização concentrada logo depois do horizonte sem teste de caixa, ou dívida longa rotulada como sazonal para sair do teste.
- Escolha pelo menor spread ou pelo menor custo sem os portões.
- Veredito binário; certeza sobre o comportamento do banco ou da demanda.

# Stop conditions
- Operando ausente bloqueia o número que depende dele e vira lacuna nomeada; termos de um grupo pela metade são recusados.
- Nenhum caminho dentro dos portões: sem recomendação, com a ordem e o que falta a cada caminho.
- Capacidade: uma base guarda até 256 premissas; o limite nunca trunca premissa em silêncio.
- O pacote não sonda investidores, não contata bancos nem o BNDES, não emite nem assina.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: capital-structure-paths-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Resultado adotado com cada caminho por período e por ano, limites, exceção, testes depois do horizonte, ordem, recomendação, custos e sensibilidades
- readings (object, required): Sem ação, recomendação com condição, plano alternativo, quadro dos caminhos, amortização, o que mudaria, avaliação em fato, leitura e recomendação
- gaps (array, required): Operandos ausentes e a ausência de caminho dentro dos portões, com o motivo
- exclusions (array, required): O que o pacote não faz: demanda de investidores, apetite de credores, opinião jurídica sobre a escritura, contato com contrapartes, emissão ou assinatura
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- "Eu reveria a linha de embalagem antes de comprometer o desembolso de novembro e trataria primeiro a debênture de 2021. Sem nova captação, o caixa fica abaixo do mínimo em dezembro de 2026 e chega a cerca de R$ 79 milhões negativos no fim de 2027; o serviço de 2027 é de cerca de R$ 90 milhões contra cerca de R$ 36 milhões de caixa disponível. Dos sete caminhos, o único dentro de todos os limites é a linha de giro de R$ 17 milhões com uma debênture de R$ 80 milhões amortizando de 2029 a 2033: caixa mínimo de R$ 15,5 milhões, custo financeiro de cerca de R$ 49 milhões até 2028 e 2,4x no estresse contra a política de 2,5x. Com amortização em cinco anos, 2029 teria R$ 33 milhões a pagar contra cerca de R$ 24 milhões disponíveis."
## Ruim
- "A debênture é o melhor caminho porque tem o menor spread." Escolhe pela taxa, sem caixa, sem escritura, sem 2029 e com veredito.
- "Alongar o Bradesco resolve 2027." Ignora as parcelas da debênture e a exceção da escritura, e trata a rolagem como certa.

# Testes
## Unit
- packages/financial-core/src/capital-structure-paths.test.ts: oráculo da C32 sem ação e no plano recomendado, outros caminhos, imposto por caminho, juros acumulados, exceção agregada, amortização depois do horizonte, ordem, plano alternativo, custo efetivo, sensibilidades e recusas; propriedades de semente fixa para o fechamento do principal em qualquer valor e perfil, para os fluxos do custo contra os do caixa em cada convenção de juros e para a linha sazonal sem liquidação verificável.
- packages/financial-model/src/capital-structure-paths-packet.test.ts: leituras, avaliação sem veredito, recomendação só dos portões, contrato publicado.
- packages/financial-model/src/capital-structure-paths-premises.test.ts: fatos com origem, premissas, base, composição e pacote igual à calibração.
## Gold
- Ficha C32 com o oráculo modelo_aurora_c32.py e a base anual da C04: dezembro de 2026, fim de 2027, serviço de 2027, sete caminhos, recomendação pelos portões, alavancagem, caminhos do oráculo, CCB de três anos, imposto por caminho, exceção, cinco contra sete anos, custo efetivo, Bradesco sozinho, plano alternativo datado, alvo da emissão separado do piso dentro dos portões, sensibilidade de trigo no nível da C24, linha sazonal com liquidação verificada, fluxos do custo iguais aos do caixa, o que mudaria, avaliação, caixa mínimo de R$ 25 milhões e caixa mínimo ausente.
## Adversarial
- Base adulterada, resultado livre, recomendação por texto, imposto por caminho fornecido, concessão, veredito, recomendação fora dos portões, caminho que viola a política recomendado, contato com investidores, exceção lida como vazia sob a cessão do Bradesco, juros semestrais pagos, amortização depois do horizonte ignorada, dívida longa rotulada como sazonal, dívida existente fora de um caminho, pré-pagamento sem termos, bem financiado na exceção, apuração fora do calendário, curva incompleta depois do horizonte, seleção apontando para outro operando.
## Aceitação
- Executar a conversa da ficha C32 turno a turno pela interface real com fontes e direitos do ambiente de teste.

# Evidência
## Hierarquia
- Escritura com aditamentos, contratos e tabela de dívida; ata do conselho.
- Projeção adotada, análise do investimento e base anual depois do horizonte; curva com data.
- Premissas da casa marcadas.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número abre até o operando adotado, sua origem e sua versão.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. O procedimento de estrutura de capital continua publicado e não é alterado por este. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O decisor precisa da rota e da ordem de financiamento antes que o calendário decida por ele. A pergunta costuma falar do ano dos vencimentos; o primeiro aperto pode vir antes, e a restrição que condiciona todas as rotas costuma estar na escritura vigente.

## N2. Árvore de decisão
- Sem ação: quando o caixa fica abaixo do mínimo e em que ano o serviço se concentra contra o caixa disponível.
- Investimento: revisto como projeto antes de ser financiado; seguir, adiar ou não fazer, cada um como variante na mesma base.
- Separar por uso: giro sazonal em linha curta, capex no financiamento do bem, vencimentos em prazo longo.
- Escritura: exceção agregada com o que já está ocupado; resgate ou anuência quando a garantia não cabe.
- Portões: caixa mínimo, estresse, escritura, política, exceção, amortização depois do horizonte; depois custo e dívida líquida.
- Recomendação com condição objetiva e plano alternativo datado antes do vencimento que ele resolve.

## N3. Suficiência por conclusão
- Para dimensionar: tabela de dívida e projeção.
- Para escolher a rota: escritura, contrato do maior credor e política da companhia.
- Para recomendar o prazo: base anual depois do horizonte.
- O resíduo é pedido em lote, no máximo duas perguntas por turno, cada uma com o porquê.

## N4. Voz e três níveis de afirmação
Fato (tabela, escritura, projeção adotada), leitura (o que o número significa para a decisão) e recomendação (o que fazer, em que ordem e sob que condição) ficam separados. Números com origem. Sem slogan, metáfora, veredito binário ou certeza sobre banco ou investidor.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Minha leitura, em duas frases.
2. Tamanho e calendário sem ação.
3. O investimento como projeto.
4. A restrição da escritura.
5. Os caminhos na mesma base, com o quadro.
6. O caminho recomendado, a condição e o plano alternativo datado.
7. Covenant e política, base e estresse.
8. O que mudaria a recomendação e ressalvas.

## T2. Peças
Caixa por trimestre sem ação e com o plano recomendado, um elemento em foco; quadro dos caminhos com caixa mínimo, alavancagem, custo, dívida líquida e execução; amortização depois do horizonte contra o caixa disponível. Fundo branco, sem vermelho.

# Regra
## R1. Precedência
Escritura com aditamentos e contratos vigentes prevalecem; política do conselho é limite próprio; regra da companhia prevalece sobre premissa da casa.

## R2. Escritura
A exceção é lida como está escrita; o que já está dentro dela é descontado; o bem financiado é a exceção própria e não ocupa a agregada.

## R3. Voz
Caminhos e condições, nunca veredito; ação externa oferecida, não executada.

# Qualidade
## Q1. Teste do MD
O problema real foi entendido (o aperto mais próximo)? A premissa foi desafiada (o investimento, a escritura)? Os caminhos estão na mesma base? A recomendação tem condição e plano alternativo datado? O que mudaria a conclusão está dito? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Calendário
O que decide é o trimestre em que o caixa fica abaixo do mínimo e o ano em que o serviço se concentra, não a média; a apuração do covenant em dezembro cai no pico do giro da safra.

## Escritura
Escrituras limitam garantia nova a uma exceção em valor agregado; cessões posteriores já ocupam parte dela. Resgatar a escritura antiga troca a restrição por uma nova cesta negociada.

## Prazo
Uma debênture que amortiza logo depois do horizonte pode concentrar em um ano mais principal do que o caixa paga depois dos juros; o prazo se escolhe pelo teste ano a ano, não pelo custo.

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
      "id": "capital-paths.request-framing",
      "version": "2026.10.27-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional do plano de financiamento",
      "inputs": {
        "id": "capital-paths.framing-input",
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
        "id": "capital-paths.framing-output",
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
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO decisor precisa da rota e da ordem de financiamento antes que o calendário decida por ele. A pergunta costuma falar do ano dos vencimentos; o primeiro aperto pode vir antes, e a restrição que condiciona todas as rotas costuma estar na escritura vigente.\n\nN2. Árvore de decisão\n- Sem ação: quando o caixa fica abaixo do mínimo e em que ano o serviço se concentra contra o caixa disponível.\n- Investimento: revisto como projeto antes de ser financiado; seguir, adiar ou não fazer, cada um como variante na mesma base.\n- Separar por uso: giro sazonal em linha curta, capex no financiamento do bem, vencimentos em prazo longo.\n- Escritura: exceção agregada com o que já está ocupado; resgate ou anuência quando a garantia não cabe.\n- Portões: caixa mínimo, estresse, escritura, política, exceção, amortização depois do horizonte; depois custo e dívida líquida.\n- Recomendação com condição objetiva e plano alternativo datado antes do vencimento que ele resolve.\n\nN3. Suficiência por conclusão\n- Para dimensionar: tabela de dívida e projeção.\n- Para escolher a rota: escritura, contrato do maior credor e política da companhia.\n- Para recomendar o prazo: base anual depois do horizonte.\n- O resíduo é pedido em lote, no máximo duas perguntas por turno, cada uma com o porquê.\n\nN4. Voz e três níveis de afirmação\nFato (tabela, escritura, projeção adotada), leitura (o que o número significa para a decisão) e recomendação (o que fazer, em que ordem e sob que condição) ficam separados. Números com origem. Sem slogan, metáfora, veredito binário ou certeza sobre banco ou investidor."
    },
    {
      "id": "capital-paths.packet",
      "version": "2026.10.27-v1",
      "kind": "rule",
      "title": "Avaliar os caminhos de financiamento na mesma base e ordenar pelos portões",
      "authority": "house",
      "statement": "Recalcular cada caminho adotado no núcleo publicado, trimestre a trimestre, com juros acumulados até o pagamento, pré-pagamentos com o prêmio contratual, imposto do próprio caminho e caixa contra o mínimo de política; medir a alavancagem na definição da escritura e na política, no base e no estresse; medir o uso da exceção agregada da escritura; testar a amortização depois do horizonte no núcleo de capacidade; ordenar pelos portões declarados e depois pelo custo; recomendar só o primeiro caminho dentro de todos os portões, com condição objetiva, valor mínimo de emissão e plano alternativo datado; separar fato, leitura, recomendação e o que mudaria a conclusão, sem contatar contrapartes e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareCapitalPathsPacket",
        "version": "2026.10.27-v1"
      },
      "inputs": {
        "id": "capital-structure-paths-packet-input",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "capital-structure-paths-packet-input.v1"
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
                  "company": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "openingAvailable": {
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
                        }
                      }
                    }
                  },
                  "index": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "byPeriod": {
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
                        "afterYears": {
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
                        "afterRates": {
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
                        "lossTreatment": {
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
                  "operating": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "ebitda": {
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
                        "depreciation": {
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
                        "leasePayments": {
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
                        "workingCapitalCashFlow": {
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
                        "maintenanceCapex": {
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
                          "ebitda": {
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
                          "depreciation": {
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
                          "maintenanceCapex": {
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
                          "growthCapex": {
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
                          "startupWorkingCapitalCashFlow": {
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
                    }
                  },
                  "stress": {
                    "required": true,
                    "value": {
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
                        "ebitdaFactor": {
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
                        "fromPeriodEnd": {
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
                  "covenant": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "ebitdaExcludesLeases": {
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
                        "historyIds": {
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
                        "historyMonths": {
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
                        "historyEbitda": {
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
                        "historyLeasePayments": {
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
                        "indentureComparator": {
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
                        "indentureDates": {
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
                        "policyComparator": {
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
                        "policyDates": {
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
                        "policyDefinition": {
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
                  "basket": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "holderId": {
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
                            "source": {
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
                  "instruments": {
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
                          "terms": {
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
                          "principal": {
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
                          },
                          "draws": {
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
                          "replaces": {
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
                          "finalPaymentDate": {
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
                          "chargeSlots": {
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
                          "chargeAmounts": {
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
                          "prepaymentBasis": {
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
                          "prepaymentRate": {
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
                          "afterYears": {
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
                          "afterShares": {
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
                          "afterReason": {
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
                          "afterSettlementMonths": {
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
                          "alternativeSlots": {
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
                          "alternativeShares": {
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
                          "alternativeLabels": {
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
                    }
                  },
                  "paths": {
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
                          "terms": {
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
                          "instruments": {
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
                          "prepayments": {
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
                          "chargeSlots": {
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
                          "chargeAmounts": {
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
                    }
                  },
                  "postHorizon": {
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
                        "ebitda": {
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
                        "leasePayments": {
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
                        "maintenanceCapex": {
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
                        "workingCapitalInvestment": {
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
                        "depreciation": {
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
                        "otherInterest": {
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
                  "plan": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "maximumSpread": {
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
                        "soundingBy": {
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
                        "routeDecisionBy": {
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
                  "sensitivities": {
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
                          "ebitdaDelta": {
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
                          "workingCapitalDelta": {
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
                    }
                  },
                  "demandQuantum": {
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
      },
      "outputs": {
        "id": "capital-structure-paths-packet-output",
        "version": "2026.10.27-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "capital-structure-paths-packet.v1"
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
                        "adopted-capital-structure-paths.v1"
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
                                  "capital-structure-paths.v1"
                                ]
                              }
                            },
                            "engineVersion": {
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
                            "periodEnds": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "date"
                                }
                              }
                            },
                            "minimumCash": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "gateOrder": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "minimum_cash_base",
                                    "cash_nonnegative_stress",
                                    "indenture_base",
                                    "indenture_stress",
                                    "policy_base",
                                    "policy_stress",
                                    "basket_without_consent",
                                    "amortization_after_horizon"
                                  ]
                                }
                              }
                            },
                            "paths": {
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
                                    "role": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "status_quo",
                                          "candidate",
                                          "companion"
                                        ]
                                      }
                                    },
                                    "projectVariantId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "instrumentIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "prepayments": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "instrumentId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "periodId": {
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
                                            "premium": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "closingAvailableByPeriod": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "periodId": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
                                              }
                                            },
                                            "ebitda": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "cashTax": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "cashBeforeFinancing": {
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
                                            "draws": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "interestAccrued": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "interestPaid": {
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
                                            "prepayment": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "charges": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "closingAvailable": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "closingDebt": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "stressClosingAvailableByPeriod": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "periodId": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
                                              }
                                            },
                                            "ebitda": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "cashTax": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "closingAvailable": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "closingDebt": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
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
                                          "periodId": {
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
                                    "stressMinimumCash": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "periodId": {
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
                                    "belowPolicyMinimum": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "date"
                                        }
                                      }
                                    },
                                    "shortfallVsPolicyMinimum": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "debtServiceByYear": {
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
                                            "interestPaid": {
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
                                            "prepayment": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "principal": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "service": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "serviceExcludingPrepayment": {
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
                                            "shortfallBeforePrepayment": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "charges": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "ebitdaByYear": {
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
                                            "ebitda": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "taxesInHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "horizonFinancingCost": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "accruedInterestInHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "netDebtAtHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "stressNetDebtAtHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "closingDebtAtHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "closingCashAtHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "indenture": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "base": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "periodId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "netDebt": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "trailingEbitda": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "ratio": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "headroom": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "complies": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "boolean"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "stress": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "periodId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "netDebt": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "trailingEbitda": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "ratio": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "headroom": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "complies": {
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
                                    },
                                    "policy": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "base": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "object",
                                                    "fields": {
                                                      "periodId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "date"
                                                        }
                                                      },
                                                      "netDebt": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "trailingEbitda": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "ratio": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "headroom": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "complies": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "boolean"
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              },
                                              "stress": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "object",
                                                    "fields": {
                                                      "periodId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "date"
                                                        }
                                                      },
                                                      "netDebt": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "trailingEbitda": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "ratio": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "headroom": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "complies": {
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
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "basket": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "holderId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
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
                                              "occupiedAtOpening": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "peak": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "peakPeriodId": {
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
                                              "excess": {
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
                                              "rows": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "object",
                                                    "fields": {
                                                      "periodId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "date"
                                                        }
                                                      },
                                                      "applies": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "boolean"
                                                        }
                                                      },
                                                      "used": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "instrumentIds": {
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
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "afterHorizon": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "residuals": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "instrumentId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "residual": {
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
                                                        "none",
                                                        "seasonal_release",
                                                        "not_tested",
                                                        "scheduled"
                                                      ]
                                                    }
                                                  },
                                                  "settlementDate": {
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
                                                  "justification": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
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
                                          },
                                          "untested": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "string"
                                              }
                                            }
                                          },
                                          "unitInstrumentId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
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
                                    "amortizationTests": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "instrumentId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "profileId": {
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
                                            "residual": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "passes": {
                                              "required": true,
                                              "value": {
                                                "type": "boolean"
                                              }
                                            },
                                            "firstShortfallYear": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "integer"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
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
                                                    "scheduledAmortization": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "availableAfterInterest": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "interest": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "closingAvailable": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "shortfall": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "covered": {
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
                                    "gates": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "minimum_cash_base",
                                                  "cash_nonnegative_stress",
                                                  "indenture_base",
                                                  "indenture_stress",
                                                  "policy_base",
                                                  "policy_stress",
                                                  "basket_without_consent",
                                                  "amortization_after_horizon"
                                                ]
                                              }
                                            },
                                            "status": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "pass",
                                                  "fail",
                                                  "not_tested"
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "eligible": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "ranking": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "pathId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "rank": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "role": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "status_quo",
                                          "candidate",
                                          "companion"
                                        ]
                                      }
                                    },
                                    "eligible": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "failedGates": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "minimum_cash_base",
                                                  "cash_nonnegative_stress",
                                                  "indenture_base",
                                                  "indenture_stress",
                                                  "policy_base",
                                                  "policy_stress",
                                                  "basket_without_consent",
                                                  "amortization_after_horizon"
                                                ]
                                              }
                                            },
                                            "status": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "pass",
                                                  "fail",
                                                  "not_tested"
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
                            "recommendation": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "pathId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "longInstrumentId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
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
                                      "longInstrument": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "instrumentId": {
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
                                                "drawPeriodId": {
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
                                                "firstAmortizationYear": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "integer"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "lastAmortizationYear": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "integer"
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
                                      "condition": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "instrumentId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "maximumSpread": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "gates": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "id": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "enum",
                                                            "values": [
                                                              "minimum_cash_base",
                                                              "cash_nonnegative_stress",
                                                              "indenture_base",
                                                              "indenture_stress",
                                                              "policy_base",
                                                              "policy_stress",
                                                              "basket_without_consent",
                                                              "amortization_after_horizon"
                                                            ]
                                                          }
                                                        },
                                                        "status": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "enum",
                                                            "values": [
                                                              "pass",
                                                              "fail",
                                                              "not_tested"
                                                            ]
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "insideGates": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "boolean"
                                                  }
                                                },
                                                "horizonFinancingCost": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "minimumCash": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "periodId": {
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
                                                "cost": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "object",
                                                        "fields": {
                                                          "status": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "enum",
                                                              "values": [
                                                                "calculated"
                                                              ]
                                                            }
                                                          },
                                                          "nominalSpread": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "couponBase": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "enum",
                                                              "values": [
                                                                "opening_principal",
                                                                "average_principal"
                                                              ]
                                                            }
                                                          },
                                                          "couponTreatment": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "enum",
                                                              "values": [
                                                                "cash_paid",
                                                                "accrued_until_paid"
                                                              ]
                                                            }
                                                          },
                                                          "equivalentSpread": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "upfrontCharges": {
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
                                                          "termYears": {
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
                                                          "flows": {
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
                                                                  "interestPaid": {
                                                                    "required": true,
                                                                    "value": {
                                                                      "type": "string"
                                                                    }
                                                                  },
                                                                  "principal": {
                                                                    "required": true,
                                                                    "value": {
                                                                      "type": "string"
                                                                    }
                                                                  },
                                                                  "charges": {
                                                                    "required": true,
                                                                    "value": {
                                                                      "type": "string"
                                                                    }
                                                                  },
                                                                  "debtService": {
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
                                                        "type": "object",
                                                        "fields": {
                                                          "status": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "enum",
                                                              "values": [
                                                                "not_applicable"
                                                              ]
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
                                      "demand": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "instrumentId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "issueTarget": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "issueFloorInsideGates": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "quantum": {
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
                                      "soundingBy": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "routeDecisionBy": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "mustPrecede": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "instrumentId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "date": {
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
                                      "decidedBeforeMaturity": {
                                        "required": true,
                                        "value": {
                                          "type": "boolean"
                                        }
                                      },
                                      "daysToMaturity": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "integer"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "alternative": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "pathId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "longInstrumentId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "longInstrument": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "instrumentId": {
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
                                                      "drawPeriodId": {
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
                                                      "firstAmortizationYear": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "integer"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "lastAmortizationYear": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "integer"
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
                                                "conditions": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "enum",
                                                      "values": [
                                                        "minimum_cash_base",
                                                        "cash_nonnegative_stress",
                                                        "indenture_base",
                                                        "indenture_stress",
                                                        "policy_base",
                                                        "policy_stress",
                                                        "basket_without_consent",
                                                        "amortization_after_horizon"
                                                      ]
                                                    }
                                                  }
                                                },
                                                "decisionBy": {
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
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "instrumentCosts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "instrumentId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "lenderKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "bank",
                                              "capital_markets",
                                              "development_bank"
                                            ]
                                          }
                                        },
                                        "alternatives": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "object",
                                                  "fields": {
                                                    "profileId": {
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
                                                    "status": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "calculated"
                                                        ]
                                                      }
                                                    },
                                                    "nominalSpread": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "couponBase": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "opening_principal",
                                                          "average_principal"
                                                        ]
                                                      }
                                                    },
                                                    "couponTreatment": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "cash_paid",
                                                          "accrued_until_paid"
                                                        ]
                                                      }
                                                    },
                                                    "equivalentSpread": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "upfrontCharges": {
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
                                                    "termYears": {
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
                                                    "flows": {
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
                                                            "interestPaid": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "principal": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "charges": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "debtService": {
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
                                                  "type": "object",
                                                  "fields": {
                                                    "profileId": {
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
                                                    "status": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "not_applicable"
                                                        ]
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
                                              ]
                                            }
                                          }
                                        },
                                        "status": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "calculated"
                                            ]
                                          }
                                        },
                                        "nominalSpread": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "couponBase": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "opening_principal",
                                              "average_principal"
                                            ]
                                          }
                                        },
                                        "couponTreatment": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "cash_paid",
                                              "accrued_until_paid"
                                            ]
                                          }
                                        },
                                        "equivalentSpread": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "upfrontCharges": {
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
                                        "termYears": {
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
                                        "flows": {
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
                                                "interestPaid": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "principal": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "charges": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "debtService": {
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
                                      "type": "object",
                                      "fields": {
                                        "instrumentId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "lenderKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "bank",
                                              "capital_markets",
                                              "development_bank"
                                            ]
                                          }
                                        },
                                        "alternatives": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "object",
                                                  "fields": {
                                                    "profileId": {
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
                                                    "status": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "calculated"
                                                        ]
                                                      }
                                                    },
                                                    "nominalSpread": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "couponBase": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "opening_principal",
                                                          "average_principal"
                                                        ]
                                                      }
                                                    },
                                                    "couponTreatment": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "cash_paid",
                                                          "accrued_until_paid"
                                                        ]
                                                      }
                                                    },
                                                    "equivalentSpread": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "upfrontCharges": {
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
                                                    "termYears": {
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
                                                    "flows": {
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
                                                            "interestPaid": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "principal": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "charges": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "debtService": {
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
                                                  "type": "object",
                                                  "fields": {
                                                    "profileId": {
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
                                                    "status": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "not_applicable"
                                                        ]
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
                                              ]
                                            }
                                          }
                                        },
                                        "status": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "not_applicable"
                                            ]
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
                                  ]
                                }
                              }
                            },
                            "sensitivities": {
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
                                    "recommendedPathId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
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
                                    "recommendationHolds": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "onRecommended": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "gates": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "object",
                                                    "fields": {
                                                      "id": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "enum",
                                                          "values": [
                                                            "minimum_cash_base",
                                                            "cash_nonnegative_stress",
                                                            "indenture_base",
                                                            "indenture_stress",
                                                            "policy_base",
                                                            "policy_stress",
                                                            "basket_without_consent",
                                                            "amortization_after_horizon"
                                                          ]
                                                        }
                                                      },
                                                      "status": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "enum",
                                                          "values": [
                                                            "pass",
                                                            "fail",
                                                            "not_tested"
                                                          ]
                                                        }
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
                                                    "periodId": {
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
                                              "stressMinimumCash": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "periodId": {
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
                                              "indenture": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "base": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "array",
                                                        "items": {
                                                          "type": "object",
                                                          "fields": {
                                                            "periodId": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "date"
                                                              }
                                                            },
                                                            "netDebt": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "trailingEbitda": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "ratio": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "headroom": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "complies": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "boolean"
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    },
                                                    "stress": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "array",
                                                        "items": {
                                                          "type": "object",
                                                          "fields": {
                                                            "periodId": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "date"
                                                              }
                                                            },
                                                            "netDebt": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "trailingEbitda": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "ratio": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "headroom": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "complies": {
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
                                              },
                                              "policy": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "object",
                                                      "fields": {
                                                        "base": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "array",
                                                            "items": {
                                                              "type": "object",
                                                              "fields": {
                                                                "periodId": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "date"
                                                                  }
                                                                },
                                                                "netDebt": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "trailingEbitda": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "ratio": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "headroom": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "complies": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "boolean"
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        },
                                                        "stress": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "array",
                                                            "items": {
                                                              "type": "object",
                                                              "fields": {
                                                                "periodId": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "date"
                                                                  }
                                                                },
                                                                "netDebt": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "trailingEbitda": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "ratio": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "headroom": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "complies": {
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
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "netDebtAtHorizon": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "ebitdaByYear": {
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
                                                      "ebitda": {
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
                              }
                            },
                            "exclusions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "enum",
                                  "values": [
                                    "intraperiod_liquidity",
                                    "investor_demand",
                                    "lender_appetite",
                                    "legal_opinion_on_indenture",
                                    "contact_with_counterparties"
                                  ]
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
                          "investor_demand",
                          "lender_appetite",
                          "legal_opinion_on_indenture",
                          "contact_with_counterparties",
                          "intraperiod_liquidity",
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
                      "horizon": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "firstPeriodEnd": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "lastPeriodEnd": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "candidatePaths": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "companionPaths": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "minimumCash": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      },
                      "withoutAction": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "pathId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "firstBelowMinimum": {
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
                            "lowest": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "periodId": {
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
                            "peakYear": {
                              "required": true,
                              "value": {
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
                                  },
                                  "principal": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "interestPaid": {
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
                                  "gap": {
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
                      "recommendation": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "pathId": {
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
                                "minimumCash": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "periodId": {
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
                                "horizonFinancingCost": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "netDebtAtHorizon": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "leverage": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "periodId": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "ratio": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "stressWorst": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "periodId": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "ratio": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                },
                                "indentureLimit": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "policyLimit": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
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
                                "prepaidInstrumentIds": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "string"
                                    }
                                  }
                                },
                                "ebitdaByYear": {
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
                                        "ebitda": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "longInstrument": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "id": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "issueTarget": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "issueFloorInsideGates": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
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
                                          "drawPeriodId": {
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
                                          "termYears": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
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
                                          "firstAmortizationYear": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "integer"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "lastAmortizationYear": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "integer"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "equivalentSpread": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
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
                                          "maximumSpread": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "equivalentSpreadAtCondition": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
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
                                          "insideGatesAtCondition": {
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
                                          }
                                        }
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "soundingBy": {
                                  "required": true,
                                  "value": {
                                    "type": "date"
                                  }
                                },
                                "routeDecisionBy": {
                                  "required": true,
                                  "value": {
                                    "type": "date"
                                  }
                                },
                                "mustPrecede": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "instrumentId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "date": {
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
                                "daysToMaturity": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "integer"
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
                      "alternative": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "pathId": {
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
                                "longInstrumentId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "issueTarget": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "conditions": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "enum",
                                      "values": [
                                        "minimum_cash_base",
                                        "cash_nonnegative_stress",
                                        "indenture_base",
                                        "indenture_stress",
                                        "policy_base",
                                        "policy_stress",
                                        "basket_without_consent",
                                        "amortization_after_horizon"
                                      ]
                                    }
                                  }
                                },
                                "decisionBy": {
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
                      "paths": {
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
                              "role": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "status_quo",
                                    "candidate",
                                    "companion"
                                  ]
                                }
                              },
                              "rank": {
                                "required": true,
                                "value": {
                                  "type": "integer"
                                }
                              },
                              "eligible": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "failedGates": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "enum",
                                    "values": [
                                      "minimum_cash_base",
                                      "cash_nonnegative_stress",
                                      "indenture_base",
                                      "indenture_stress",
                                      "policy_base",
                                      "policy_stress",
                                      "basket_without_consent",
                                      "amortization_after_horizon"
                                    ]
                                  }
                                }
                              },
                              "minimumCash": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "periodId": {
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
                              "shortfallVsPolicyMinimum": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "horizonFinancingCost": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "netDebtAtHorizon": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "worstLeverage": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "stressWorstLeverage": {
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
                              }
                            }
                          }
                        }
                      },
                      "amortization": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "pathId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "instrumentId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "profileId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "passes": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "firstShortfallYear": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "integer"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "firstYear": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "year": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "scheduledAmortization": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "availableAfterInterest": {
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
                      "wouldChange": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "demand": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "instrumentId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "issueTarget": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "issueFloorInsideGates": {
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
                            "sensitivities": {
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
                                    "recommendationHolds": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "recommendedPathId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
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
                                    "failedGatesOnRecommended": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "enum",
                                          "values": [
                                            "minimum_cash_base",
                                            "cash_nonnegative_stress",
                                            "indenture_base",
                                            "indenture_stress",
                                            "policy_base",
                                            "policy_stress",
                                            "basket_without_consent",
                                            "amortization_after_horizon"
                                          ]
                                        }
                                      }
                                    },
                                    "ebitdaByYear": {
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
                                            "ebitda": {
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
                                    "status_quo_below_minimum_cash",
                                    "status_quo_peak_service_exceeds_available_cash",
                                    "indenture_basket_partly_occupied",
                                    "no_path_inside_every_gate"
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
                                    "recommended_path_inside_every_gate",
                                    "cheapest_path_misses_a_gate",
                                    "paths_with_the_project_miss_gates",
                                    "stress_policy_headroom_tight",
                                    "shorter_amortization_fails_after_horizon",
                                    "alternative_depends_on_consent",
                                    "alternative_misses_amortization_test"
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
                                    "follow_recommended_path_under_condition",
                                    "review_project_before_committing",
                                    "ask_for_the_longer_amortization",
                                    "negotiate_covenant_headroom_in_new_terms",
                                    "keep_dated_alternative"
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
                                    "issue_demand_below_minimum_amount",
                                    "sensitivity_breaks_recommendation"
                                  ]
                                }
                              }
                            }
                          }
                        }
                      },
                      "process": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "contactsInvestors": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "contactsLenders": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "issuesOrSigns": {
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
                    "investor_demand",
                    "lender_appetite",
                    "legal_opinion_on_indenture",
                    "contact_with_counterparties",
                    "issuance_or_signature"
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
          "id": "capital-paths.request-framing",
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
        "packages/credit-playbook/knowledge/reviews/runs/evaluate-financing-paths-2026-10-27-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/evaluate-financing-paths-2026-10-27-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/evaluate-financing-paths-2026-10-27-v1-consistency/run.json"
      ]
    }
  ]
}
```
