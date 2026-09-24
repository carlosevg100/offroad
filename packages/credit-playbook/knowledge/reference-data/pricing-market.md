# Preço e mercado

Esta família governa duas decisões da mesa: qual referência de preço sustenta uma operação de dívida e a quem, em que ordem e em que quantidade uma companhia pode ser apresentada. São treze parâmetros do cadastro em `src/reference-data.ts`. Dez servem ao módulo 6 do House Playbook (PR-01 a PR-13): registro de observações, qualidade da amostra, regime, grade de referência, prêmios de garantia, de prazo e de tamanho, base de indexadores, catálogo de custos e largura da banda comunicada. Três servem ao módulo 8 (MK-01 a MK-18): registro de mandatos, validade de cada campo de mandato e ondas de introdução qualificada.

A cadeia é uma só. Uma observação entra no registro com fonte, data, qualidade e autorização de uso agregado. A política de amostra decide se ela é comparável e quanto pesa. O regime diz se ela ainda descreve o mercado. A grade agrega as observações válidas em células por faixa de risco, família de instrumento, prazo e garantia. Prêmios e normalização de indexador ajustam o que é ajustável. O catálogo de custos converte spread em custo all-in. A régua de largura decide se a banda pode ser comunicada. Do lado da distribuição, o registro de mandatos filtra quem pode receber a companhia, a validade de cada campo diz se o filtro ainda se sustenta e a política de ondas limita quantos destinatários recebem de cada vez.

| Chave | Regras da casa | Campo que um executor já lê |
| --- | --- | --- |
| `market.pricing.curves` | PR-01 a PR-07, PR-10 a PR-13 | grade consultada por `buildPricingTruthSet` |
| `policy.pricing.sample-quality` | PR-01, PR-02, PR-03, PR-04, PR-07, PR-09, PR-12 | `pricing_policies`: `min_observations`, `min_distinct_sources`, `min_quality`, `max_tenor_delta_months`, `min_amount_ratio`, `max_amount_ratio` |
| `policy.pricing.communication-width` | PR-01, PR-09 | `pricing_policies`: `min_band_width_bps`, `max_band_width_bps` |
| `policy.pricing.regime` | PR-02, PR-07, PR-12, PR-13 | `pricing_policies`: `regime`, `status` |
| `market.pricing.security-premiums` | PR-03, PR-08 | ajuste `security` de `buildPricingTruthSet` |
| `market.pricing.tenor-curve` | PR-04 | ajuste `tenor` |
| `market.pricing.size-liquidity` | PR-05 | ajuste `size` |
| `market.pricing.indexer-basis` | PR-02, PR-06, PR-10 | `pricing_policies`: `default_indexer`, `index_levels` |
| `policy.pricing.cost-catalogue` | PR-10, PR-11 | `costs` e `weightedAverageLifeYears` |
| `market.pricing.observation-registry` | PR-02, PR-07, PR-12, PR-13 | `pricing_observations` |
| `market.mandates` | MK-01 a MK-14 | mandatos resolvidos de `buildMarketTruthSet` |
| `policy.market.mandate_max_age` | MK-11, MK-12, MK-13 | `market_distribution_policies.mandate_max_age_months` |
| `policy.market.distribution-waves` | MK-15 a MK-18 | `market_distribution_policies`: `wave_limit`, `learning_gate_anchor_count` |

Cada valor proposto traz, com os nomes exatos desses campos, o número que o executor lê hoje e, ao lado, a regra completa da casa quando ela vai além do que o executor faz. As diferenças entre regra e executor estão nomeadas no cartão correspondente.

Os fatos de mercado citados foram lidos em fontes públicas em 24/09/2026: Banco Central (séries do SGS), ANBIMA (taxas indicativas de títulos públicos e de debêntures de 23/09/2026 e boletim de mercado de capitais de 16/09/2026), CVM (dados abertos de ofertas atualizados em 23/09/2026 e textos normativos), Congresso Nacional, STF e Planalto. Nenhuma observação de preço, prêmio ou apetite de instituição foi criada. Onde não há observação governada, o valor proposto é a regra, a tabela vazia e a resposta obrigatória de abstenção. As estatísticas de mercado que aparecem foram calculadas pela Offroad a partir dos arquivos públicos e são identificadas como contexto.

### market.pricing.curves

- **Decisão que governa.** Qual célula da grade sustenta uma referência de preço para o perfil de risco, o prazo e a garantia de uma operação, e se essa célula existe. Sem célula válida, PR-01 responde "sem referência confiável", nenhum material cita banda (PR-07, PR-09) e o pedido de preço passa a depender de sondagem autorizada.
- **Valor proposto.** Grade versionada da casa, vazia em 24/09/2026: nenhuma célula publicada e nenhuma observação governada incluída nesta proposta. O valor são as regras de construção:
  - Medida única: `normalizedSpreadBps`, spread equivalente sobre 100% do DI, em pontos-base ao ano, composto em base 252 na data da observação. Soma spread cotado, comissões anualizadas, deságio, warrant e hedge, com a identidade verificada no registro de observações. Taxa total = (1 + DI) × (1 + spread) - 1.
  - Chave da célula: faixa de risco × família de instrumento × faixa de prazo × família de garantia.
    - Faixa de risco, da classificação interna de `packages/credit-analysis`: `strong` (notas 1 e 2), `adequate` (3 e 4), `watch` (5 e 6), `weak` (7 e 8) e `distressed` (9 e 10).
    - Família de instrumento: bancária (`ccb`, `nce`, `leasing`), mercado de capitais (`debenture_476`, `debenture_160`), securitização (`cri`, `cra`), fundo de recebíveis (`fidc`), `venture_debt` e fomento (`finame`). Fomento tem custo subsidiado e nunca se compara com mercado.
    - Faixa de prazo, em meses: até 24; 25 a 36; 37 a 60; 61 a 84; 85 a 120; 121 a 360.
    - Família de garantia, sobre as classes que o motor de casos grava em `securityClass`: limpa (`unsecured`), cessão com trava (`secured:receivables`), real forte (`secured:property`, `secured:equipment`, `secured:vehicles`), garantia líquida (`secured:guarantee`, `secured:financial`), outras reais (`secured:inventory`, `secured:shares`, `secured:other`) e combinada (duas ou mais classes).
  - Setor, tamanho e amortização não abrem célula: entram como dimensões de comparabilidade, com os pesos de `policy.pricing.sample-quality`.
  - Saída de cada célula: P25, mediana e P75 ponderados; número de diretas e de ajustáveis; origens distintas; data mais antiga e mais recente; confiança; validade; versão dos parâmetros.
  - Hierarquia de fontes: (1) observações governadas do registro com a qualidade mínima; (2) emissões primárias públicas com remuneração, garantia e prazo documentados em escritura, anúncio de encerramento ou dados abertos da CVM; (3) taxas indicativas e curvas de crédito por rating da ANBIMA, como referência secundária ajustada e contexto; (4) estatísticas de crédito do Banco Central, só contexto; (5) grade de prática da mesa em `packages/market-reference/src/index.ts`, declarada em 21/08/2026, só teste de plausibilidade.
  - Validade da célula: 30 dias a partir do cálculo, encerrada antes se a medida de referência do regime mover 30 pontos-base.
  - Contexto do mercado listado, que não forma célula: em 23/09/2026, as 559 debêntures DI mais spread com taxa indicativa ANBIMA tinham P25 de 0,60%, mediana de 0,96% e P75 de 1,54% ao ano sobre o DI.
- **Regra de aplicação.**
  1. PR-01 monta a chave do alvo com a faixa de risco da análise da companhia, a família do instrumento preferido, a faixa do prazo e a família do pacote de garantias de ES-20, e busca a célula.
  2. Célula publicada e dentro da validade: a banda sai pela régua de `policy.pricing.communication-width`, citando célula, amostra e datas.
  3. Célula ausente, abaixo do mínimo de origens ou vencida: fundir com a vizinha na ordem de `policy.pricing.sample-quality` (setor, faixa de tamanho, faixa de prazo adjacente), em no máximo duas etapas, cada uma declarada e alargando a banda. Nunca atravessar faixa de risco, família de instrumento ou família de garantia. Sem célula depois disso, abster-se.
  4. Fonte secundária da ANBIMA só entra ajustada por prazo e garantia, conta como etapa de aproximação e é identificada como secundária no texto.
  5. A grade de prática da mesa e o contexto do mercado listado servem para estranhar um resultado. Célula com mediana a mais de 150 pontos-base da faixa de prática correspondente abre revisão antes de publicar. Nenhum dos dois aparece como banda.
  6. Precedência: os termos de uma proposta recebida pela companhia governam o preço daquela proposta; a célula é a referência de mercado para compará-la e nunca substitui termo contratado.
  7. Executor atual: `buildPricingTruthSet` já rejeita observação vencida, de outro regime, sem autorização de uso agregado ou abaixo da qualidade, e só aceita CDI como indexador. Ele exige igualdade de instrumento, faixa, garantia, amortização e setor e forma a banda pelo mínimo e pelo máximo da amostra, enquanto a regra da casa pede score ponderado e P25 a P75. Até o alinhamento, o executor é mais restritivo na amostra e mais largo na banda: erra para a abstenção, nunca para a precisão inventada.
- **Fundamento.** Preço de dívida privada depende primeiro de risco e garantia, que somam metade do peso de comparabilidade no Caso 01, e depois de instrumento e prazo; por isso esses quatro eixos abrem célula e os demais ponderam. Spread sobre o DI composto em base 252 é a convenção do mercado local para DI mais spread: somar spread ao DI subestima a taxa em cerca de DI × spread, 41 pontos-base com DI de 13,65% e spread de 3,00%. Quartis ponderados mostram onde está o corpo das operações comparáveis; mínimo e máximo dependem das duas observações extremas. O mercado listado mostra o nível do crédito com rating e liquidez de secundário (mediana de 0,96%); usado como célula, ele subestimaria o custo de uma companhia sem rating e sem histórico de emissão. Na partida, célula vazia com abstenção é a resposta correta: a casa não fabrica referência com três operações, como fixa a biblioteca de expertise da Offroad (repositório privado).
- **Fontes.**
  - House Playbook Offroad v2.1, PR-01 a PR-13, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - Caso 01, `prepare-capital-structure-decision`, seções R6 e R7, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md
  - ANBIMA, Mercado Secundário de Debêntures, taxas indicativas de 23/09/2026, arquivo lido em 24/09/2026, estatísticas calculadas pela Offroad: https://www.anbima.com.br/informacoes/merc-sec-debentures/arqs/db260923.txt
  - ANBIMA, Curvas de Crédito, metodologia de outubro de 2021, consultada em 24/09/2026: https://www.anbima.com.br/data/files/EC/C6/5D/4B/47CFD71028DFACD76B2BA2A8/Metodologia_Curva%20de%20Credito_out21.pdf
  - Biblioteca de expertise da Offroad (repositório privado): objetos de mercado e memória de operações.
- **Uso no método.**
  - PR-01: célula-fonte, amostra, data mais recente e aproximações; sem célula, abstenção.
  - PR-02: cada comparável entra na célula ou sai com motivo registrado.
  - PR-03, PR-04 e PR-05: prêmios só se aplicam sobre célula ou pares desta grade.
  - PR-06, PR-10 e PR-11: indexador, all-in e comparação com o custo atual partem da mediana e da banda da célula.
  - PR-07: a grade é esta chave; o relatório mensal de frescor lista as células vencidas.
  - PR-12 e PR-13: validade e observações governadas alimentam cada célula.
  - `design-financing-alternatives`, `draft-indicative-structure` e `compile-indicative-term-sheet` (`src/procedures/growth-capex.ts`) declaram a chave; em rascunho, tratam preço como lacuna.
- **Revisão.** Qualquer gatilho de `policy.pricing.regime`; relatório mensal com mais da metade das células publicadas vencidas; mudança da classificação interna de risco; mudança do vocabulário de instrumentos (inclusão de nota comercial e substituição de `debenture_476`); alinhamento do executor a P25 e P75 e ao score ponderado; revisão trimestral com os casos de ouro.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### policy.pricing.sample-quality

- **Decisão que governa.** Quando um conjunto de observações basta para formar ou sustentar uma referência de preço, quanto pesa cada observação e quando a Offroad se abstém.
- **Valor proposto.**
  - Para o executor (`pricing_policies` e `buildPricingTruthSet`): `minObservations` 5, `minDistinctSources` 5, `minQuality` 0,75, `maxTenorDeltaMonths` 12, `minAmountRatio` 0,5 e `maxAmountRatio` 2.
  - Origem: uma origem é uma operação. Propostas, rodadas e séries da mesma operação contam uma vez. Mínimo de 5 origens distintas por célula publicada, antes de qualquer categoria de confiança.
  - Comparabilidade: pesos de garantia 0,25; risco 0,25; instrumento 0,15; prazo e duration 0,15; setor 0,10; porte 0,05; amortização e carência 0,05. Direta a partir de 0,80; ajustável de 0,60 até menos de 0,80, sempre com ajuste explícito; abaixo de 0,60, excluída. Comparável direto exige a mesma faixa de risco, família de garantia e família de instrumento, qualquer que seja o score.
  - Tabela de vizinhança, valor de cada dimensão:
    - Garantia: mesma família 1; real forte contra cessão com trava 0,6; real forte contra garantia líquida 0,6; cessão com trava contra garantia líquida 0,6; outras reais contra qualquer garantida 0,5; combinada contra seu componente dominante 0,7; limpa contra garantida 0,2.
    - Risco: mesma faixa 1; faixa adjacente 0,4; duas faixas ou mais 0.
    - Instrumento: o mesmo 1; mesma família 0,8; securitização contra mercado de capitais 0,6; bancário contra mercado de capitais 0,5; fundo de recebíveis contra os demais 0,3; fomento ou venture debt contra os demais 0.
    - Prazo: diferença de duration até 6 meses 1; até 12 meses 0,8; até 24 meses 0,5; acima disso 0.
    - Setor: mesmo grupo 1; mesmo macrossetor 0,6; outro 0,3.
    - Tamanho: razão entre 0,5 e 2, 1; entre 0,25 e 4, 0,5; fora disso 0.
    - Amortização: a mesma 1; SAC contra Price 0,9; bullet contra amortizável 0,5.
  - Recência: bancária privada e proposta de cliente com peso pleno até 120 dias e zero em 180; emissão pública com peso pleno até 90 dias e zero em 150; decaimento linear entre os dois pontos.
  - Peso da observação: fator de recência × score de comparabilidade. Quantil ponderado: ordenar por `normalizedSpreadBps` e tomar o primeiro valor cuja soma acumulada dos pesos normalizados alcança o quantil.
  - Confiança: alta com 8 ou mais diretas atuais; moderada com 3 a 7 diretas, ou 8 ou mais ajustáveis; baixa com 1 ou 2 diretas, ou 3 a 7 ajustáveis; insuficiente abaixo disso. Mistura de diretas e ajustáveis nunca recebe alta pelo total. Nenhuma categoria dispensa as 5 origens.
  - Janela de prazo: min(12; max(6; 0,5 × prazo alvo)) meses, medida na duration de Macaulay quando os cronogramas diferem e no prazo nominal quando são iguais.
  - Fusão de célula: primeiro o setor, depois a faixa de tamanho, depois a faixa de prazo adjacente. Nunca através de faixa de risco, família de garantia ou família de instrumento. Cada fusão é uma etapa de aproximação.
  - Revisão de célula: comparáveis novos cuja mediana se afasta da mediana da célula por mais que o maior entre 30 pontos-base e 15% da mediana da célula.
  - Validade da referência calculada: 30 dias, encerrada antes por movimento de 30 pontos-base na medida de referência.
  - Abstenção obrigatória: menos de 5 origens depois das fusões permitidas; confiança insuficiente; regime invalidado ou em revisão declarada; banda acima do teto de `policy.pricing.communication-width`; prazo alvo fora da última faixa observada (PR-04); indexador sem normalização validada; mais de duas etapas de aproximação.
- **Regra de aplicação.**
  1. Filtrar por validade, regime, autorização de uso agregado e qualidade mínima. A qualidade é atribuída no registro pelo tipo de fonte (`market.pricing.observation-registry`).
  2. Calcular o score de cada observação contra o perfil alvo e classificar em direta, ajustável ou excluída.
  3. Ajustar as ajustáveis somente com prêmio observado de garantia (PR-03) e de prazo (PR-04). Sem prêmio observado, a ajustável fica fora. Com as tabelas de prêmio vazias em 24/09/2026, só comparáveis diretos formam célula.
  4. Contar origens distintas; abaixo de 5, fundir na ordem declarada ou abster-se.
  5. Calcular pesos, quartis ponderados e confiança; registrar amostra por classe, fonte e estágio, recência, score, ajustes, quartis, mediana, versão dos parâmetros e data do cálculo.
  6. Precedência: a regra de privacidade do registro vem antes do mínimo estatístico, e o mínimo de origens vem antes da confiança. Amostra estatística nunca libera célula que a privacidade suprime.
  7. Executor atual: aplica `minObservations`, `minDistinctSources`, `minQuality`, `maxTenorDeltaMonths` e a razão de tamanho como filtros, com pesos iguais. Score, peso, fusão e confiança ficam para o método completo; até lá, o executor só aceita comparáveis diretos por igualdade, o que é mais restritivo que a política.
- **Fundamento.** Pesos, classes de score, janelas, a regra de 30 pontos-base, a validade de 30 dias e a escala de confiança repetem o Caso 01 (R6 e R7), aprovado com condições pelo fundador em 21/09/2026; esta proposta não altera nenhum deles. Acrescenta o que o Caso 01 pede com fonte e versão e ainda não tinha número: a tabela de vizinhança, a qualidade mínima, a janela de prazo proporcional e a ordem de fusão. Cinco origens é o mínimo em que uma observação isolada não identifica a operação de um cliente e em que P25 e P75 deixam de ser as próprias observações extremas. A exigência de mesma faixa de risco e garantia para comparável direto corrige um efeito dos pesos: com risco e garantia em 25% cada, uma observação de faixa adjacente e todo o resto igual chegaria a 0,85 e passaria como direta. A janela de prazo proporcional evita misturar papéis de zero a 24 meses quando o alvo tem 12; para alvos acima de 24 meses ela fica em 12 meses, como no executor. A qualidade mínima de 0,75 deixa fora da célula indicação sem documento (0,60) e sondagem (0,50), que continuam registradas como aprendizado.
- **Fontes.**
  - Caso 01, `prepare-capital-structure-decision`, seções R6 e R7, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md
  - House Playbook Offroad v2.1, PR-01, PR-02, PR-07 e PR-12, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - Tabela `pricing_policies`, colunas e restrições, consultada em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/supabase/migrations/20260826013647_m6_pricing_registry.sql
  - Biblioteca de expertise da Offroad (repositório privado): limiar de comparabilidade e níveis de confiança.
- **Uso no método.**
  - PR-01: seleção de célula, aproximação declarada e abstenção.
  - PR-02: inclusão e rejeição de comparáveis com motivo.
  - PR-03 e PR-04: mínimo de pares e de origens por faixa.
  - PR-07: recência e ponderação da grade por tipo de observação.
  - PR-09: a confiança define o multiplicador do piso da banda.
  - PR-12: validade de 30 dias e janelas de recência.
  - `design-financing-alternatives` (`src/procedures/growth-capex.ts`) declara a chave; em rascunho, trata a amostra como insuficiente.
- **Revisão.** Revisão trimestral com os casos de ouro, como fixado para os parâmetros de mercado no Caso 01; antes disso, quando um caso de ouro mostrar classificação errada de comparável, quando a política de privacidade do registro mudar, quando o executor implementar o método completo (revalidar resultados) ou quando houver novo regime.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### policy.pricing.communication-width

- **Decisão que governa.** Se uma banda de preço pode ser comunicada por escrito e com que largura. Abaixo do piso, a banda seria promessa disfarçada; acima do teto, admite que não há base.
- **Valor proposto.**
  - Para o executor: `minBandWidthBps` 15 e `maxBandWidthBps` 150, o envelope absoluto para CDI.
  - Banda: P25 a P75 ponderados da célula, centrada na mediana, medida no spread sobre o indexador de referência e nunca na taxa total.
  - Piso = max(piso absoluto do indexador; 0,10 × |ponto médio|) × multiplicador de confiança. Piso absoluto: 15 pontos-base para CDI; 35 para IPCA e prefixado. Multiplicador: alta 1,0; moderada 1,5; baixa 2,0.
  - Teto = min(150; max(teto mínimo do indexador; 0,35 × |ponto médio|)). Teto mínimo: 35 pontos-base para CDI; 70 para IPCA e prefixado.
  - Aproximação: cada etapa declarada multiplica a largura por 1,25, com no máximo duas etapas.
  - Arredondamento: extremos em múltiplos de 5 pontos-base, sempre para fora.
  - Texto padrão: "Referência indicativa de DI + {mínimo}% a {máximo}% ao ano, sujeita à análise e à decisão dos investidores. Base: {n} observações de {k} origens entre {data inicial} e {data final}; confiança {nível}."
- **Regra de aplicação.**
  1. Tomar P25, mediana e P75 ponderados de `policy.pricing.sample-quality`.
  2. Aplicar as etapas de aproximação declaradas, 1,25 por etapa.
  3. Largura abaixo do piso: alargar simetricamente em torno da mediana até o piso e registrar o alargamento.
  4. Largura, ou o próprio piso, acima do teto: não comunicar e voltar a PR-01 para recortar a célula, buscar amostra ou abster-se.
  5. Arredondar para fora e escrever no formato brasileiro, com vírgula decimal.
  6. Por escrito, só banda que a Offroad sustentaria em qualquer ponto dela; em conversa, a mesma banda com a base em uma linha.
  7. IPCA e prefixado: a régua se aplica ao spread sobre a NTN-B ou sobre a taxa DI x pré da mesma duration; o texto mostra a taxa total com a referência e a data.
  8. Precedência: a banda nunca substitui taxa de proposta recebida pela companhia.
  9. Executor atual: compara as duas larguras com o mínimo e o máximo da amostra e bloqueia a banda estreita em vez de alargá-la. Os dois comportamentos impedem banda abaixo do piso; a diferença fica para o alinhamento do método.
  - Exemplos:
    - Célula `adequate`, mediana DI + 3,00%, P25 2,80%, P75 3,20%, confiança moderada. Piso = 30 × 1,5 = 45 pontos-base; a largura de 40 alarga para 45 (2,775% a 3,225%); teto = min(150; 105) = 105. Texto: DI + 2,75% a 3,25% ao ano.
    - Célula `strong`, mediana DI + 1,00%, P25 0,90%, P75 1,10%, confiança alta. Piso 15, largura 20, teto 35. Texto: DI + 0,90% a 1,10% ao ano.
    - Célula `watch`, mediana DI + 4,00%, P25 3,10%, P75 4,90%. Largura 180 contra teto de 140: não se comunica; volta a PR-01.
    - IPCA, spread mediano de 30 pontos-base sobre a NTN-B 15/08/2030 (7,7098% em 23/09/2026), P25 15, P75 45, confiança alta. Piso 35; a largura de 30 alarga para 35 e arredonda para fora, de 10 a 50 pontos-base; teto 70. Texto: NTN-B 15/08/2030 + 0,10% a 0,50% ao ano, equivalente a IPCA + 7,81% a 8,21% com a taxa indicativa da NTN-B de 23/09/2026.
- **Fundamento.** PR-09 fixa o princípio e deixa a régua para esta chave. O piso absoluto vem do próprio preço de mercado: em 23/09/2026 o intervalo indicativo que a ANBIMA publica para uma única debênture teve mediana de 8,58 e P75 de 15,49 pontos-base nas DI mais spread (559 papéis) e mediana de 23,5 e P75 de 35,24 nas IPCA mais spread (627 papéis). O piso fica no P75 desse intervalo, 15 para CDI e 35 para IPCA e prefixado: uma banda que agrega emissores distintos não fica mais estreita que o intervalo de preço que a ANBIMA publica para três de cada quatro debêntures isoladas. A parte relativa acompanha o nível: dispersão de spread cresce com o risco, e uma régua absoluta única seria larga para grau de investimento e estreita para high yield. O teto de 35% do ponto médio obriga a célula a ser mais homogênea que o mercado listado, onde P25 e P75 distam 94 pontos-base para uma mediana de 96, porque ali estão misturados todos os riscos. O teto absoluto de 150 pontos-base marca a largura a partir da qual a banda deixa de orientar a decisão da companhia. Multiplicadores de confiança e de aproximação tornam o alargamento previsível e auditável. O arredondamento para fora garante que o texto nunca fica mais estreito que a conta. A consulta a investidores não vincula as partes (Resolução CVM 160, art. 6º, § 2º), e o texto padrão diz isso.
- **Fontes.**
  - House Playbook Offroad v2.1, PR-01 e PR-09, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - ANBIMA, Mercado Secundário de Debêntures, intervalo indicativo mínimo e máximo de 23/09/2026, arquivo lido em 24/09/2026: https://www.anbima.com.br/informacoes/merc-sec-debentures/arqs/db260923.txt
  - ANBIMA, taxas indicativas de títulos públicos de 23/09/2026 (NTN-B do exemplo), lidas em 24/09/2026: https://www.anbima.com.br/informacoes/merc-sec/arqs/ms260923.txt
  - Resolução CVM 160/2022, art. 6º, § 2º, texto consolidado consultado em 24/09/2026: https://conteudo.cvm.gov.br/legislacao/resolucoes/resol160.html
- **Uso no método.**
  - PR-01: toda aproximação alarga a banda por esta régua.
  - PR-09: texto padrão, piso e teto; banda estreita é bloqueada, banda larga volta a PR-01.
  - MA-05 e LC-05: o sumário da operação só cita banda aprovada por esta régua.
- **Revisão.** Revisão trimestral com os casos de ouro; mudança da escala de confiança; operações fechadas fora da banda comunicada em mais de um de cada quatro casos em 12 meses, sinal de banda estreita; bandas comunicadas com mais de 70% da largura do teto em mais da metade dos casos, sinal de células heterogêneas.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### policy.pricing.regime

- **Decisão que governa.** Quais observações ainda descrevem o mercado de hoje. O regime é o carimbo que o executor compara em cada observação: observação de outro regime sai de decisão e de material novo, e um regime invalidado bloqueia toda referência até a grade ser reconstruída.
- **Valor proposto.**
  - Regime vigente `brl-afrouxamento-2026-03-19`, estado `active`, válido desde 19/03/2026, declarado em 24/09/2026.
  - Condições de referência registradas na declaração:
    - Meta Selic de 13,75% desde 17/09/2026, depois de cinco cortes de 25 pontos-base decididos pelo Copom em 18/03, 29/04, 17/06, 05/08 e 16/09/2026, cada um vigente no dia seguinte. A meta de 15,00% vigorou de 19/06/2025 a 18/03/2026.
    - DI de 13,65% ao ano em 22/09/2026.
    - IPCA de 4,22% em 12 meses até agosto de 2026 (agosto: -0,32%).
    - Taxas indicativas ANBIMA de 23/09/2026: LTN 01/04/2027 a 13,3457%; LTN 01/01/2029 a 13,8688%; LTN 01/01/2032 a 14,1561%; NTN-B 15/05/2029 a 7,5108%; NTN-B 15/08/2032 a 7,6800%.
    - Medianas do mercado listado em 23/09/2026: 95,55 pontos-base sobre o DI, em 559 debêntures DI mais spread; 26,97 pontos-base sobre a NTN-B de referência, em 626 debêntures IPCA mais spread.
    - Mercado primário: R$ 48,8 bilhões em ofertas em agosto de 2026, contra R$ 58,0 bilhões em agosto de 2025; R$ 485 bilhões no ano, 7,1% acima do mesmo período de 2025; debêntures com R$ 21,5 bilhões no mês.
  - Gatilhos:
    - RG-01, direção da política monetária: o Copom inverte a direção do ciclo de cortes iniciado em 19/03/2026. Revisão obrigatória, todas as classes.
    - RG-02, spread listado: a mediana DI mais spread do arquivo diário da ANBIMA a 50 pontos-base ou mais de 95,55, ou a mediana IPCA mais spread sobre a NTN-B de referência a 50 pontos-base ou mais de 26,97. Revisão obrigatória, todas as classes.
    - RG-03, movimento material: 30 pontos-base ou mais nas mesmas medianas desde o último cálculo da célula. Recalcular referências das células afetadas, sem trocar o regime.
    - RG-04, evento de crédito: inadimplemento, recuperação judicial ou extrajudicial, ou fraude contábil revelada, de emissor com R$ 1 bilhão ou mais em dívida no mercado de capitais local. Revisão obrigatória do grupo setorial do emissor e das faixas `watch`, `weak` e `distressed`.
    - RG-05, fluxo de fundos: resgates líquidos em dois meses consecutivos somando mais de 3% do patrimônio das categorias de renda fixa com crédito privado no boletim de fundos da ANBIMA. Revisão obrigatória, todas as classes.
    - RG-06, mercado primário: emissão de debêntures em dois meses consecutivos abaixo de 50% da média mensal dos doze meses anteriores no boletim de mercado de capitais da ANBIMA. Revisão obrigatória da família mercado de capitais.
    - RG-07, norma: mudança legal, tributária ou regulatória que altere a demanda do investidor ou o custo do emissor de uma classe de instrumento. Invalidar as classes afetadas desde a vigência.
  - Decisão da revisão: em até 5 dias úteis, pelo Head de Mercado e Distribuição, com registro datado da decisão e das evidências. Durante a revisão, referências carregam a marca "regime em revisão" e não entram em material novo.
  - Novo regime: a política anterior passa a `invalidated`; observações anteriores ficam como histórico marcado, fora de decisão e de material novo; abstenção até a reconstrução das células; identificador no formato `brl-<descritor>-<AAAA-MM-DD>`.
  - Invalidação parcial (RG-07): encerrar `validUntil` das observações das classes afetadas na data do evento, mantendo o regime.
- **Regra de aplicação.**
  1. Diariamente, recalcular as duas medianas a partir do arquivo público da ANBIMA com a mesma definição da referência: todas as debêntures DI mais spread com taxa indicativa publicada e todas as IPCA mais spread com NTN-B de referência.
  2. Depois de cada reunião do Copom, ler a meta Selic no Banco Central. As próximas reuniões de 2026 são em 3 e 4/11 e em 8 e 9/12.
  3. Mensalmente, ler o boletim de fundos e o boletim de mercado de capitais da ANBIMA para RG-05 e RG-06.
  4. Evento de crédito e norma entram no dia da publicação.
  5. RG-03 não troca regime; recalcula as referências das células, como o Caso 01 fixa para movimento material da curva.
  6. Precedência: a declaração de novo regime vale para todas as classes e prevalece sobre as janelas de recência; a invalidação parcial vale só para a classe afetada.
  7. Executor atual: `status` igual a `invalidated` gera a exceção crítica `pricing-regime-invalidated` e bloqueia referência; `regime` diferente rejeita a observação com `different_regime`; o carregador do banco só traz observações do regime da política ativa.
- **Fundamento.** O regime responde a uma pergunta que a janela de recência não cobre: um choque que muda o preço de todas as classes no mesmo dia. Movimento de nível do DI não invalida spread sobre o DI; o que muda o preço do crédito é apetite, fluxo de recursos e evento de crédito. Por isso os gatilhos medem spread, resgates, emissão e eventos, e a política monetária entra só pela inversão de direção, que muda o fluxo para os fundos de crédito. O início em 19/03/2026, primeiro corte do ciclo, fica 189 dias antes da declaração, fora da janela máxima de recência de 180 dias: nenhuma observação dentro da janela nasceu em outro regime. O limite de 50 pontos-base para revisão corresponde a cerca de metade da mediana DI mais spread listada (95,55) e a mais de três vezes o intervalo indicativo de uma debênture DI mais spread no P75 (15,49); 30 pontos-base é a referência de movimento material do Caso 01. R$ 1 bilhão em dívida no mercado de capitais, 3% de resgates em dois meses e 50% da média de emissão são limites de julgamento da casa para separar evento sistêmico de evento isolado. A curva de 23/09/2026 precifica cortes adicionais (LTN 01/04/2027 a 13,35%, abaixo do DI de 13,65%) e prêmio de prazo positivo a partir de 2028; o regime registra esse retrato para que uma mudança possa ser medida contra ele.
- **Fontes.**
  - Banco Central do Brasil, histórico das taxas de juros do Copom, consultado em 24/09/2026: https://www.bcb.gov.br/controleinflacao/historicotaxasjuros
  - Banco Central do Brasil, SGS 432 (meta Selic), 4389 (DI anualizado), 13522 (IPCA 12 meses) e 433 (IPCA mensal), lidos em 24/09/2026: https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json
  - ANBIMA, taxas indicativas de títulos públicos e de debêntures de 23/09/2026, lidas em 24/09/2026: https://www.anbima.com.br/informacoes/merc-sec/arqs/ms260923.txt e https://www.anbima.com.br/informacoes/merc-sec-debentures/arqs/db260923.txt
  - ANBIMA, "Mercado de capitais registra R$ 48,8 bilhões em ofertas em agosto", 16/09/2026, consultado em 24/09/2026: https://www.anbima.com.br/pt_br/noticias/mercado-de-capitais-registra-r-48-8-bilhoes-em-ofertas-em-agosto.htm
  - B3, calendário das reuniões do Copom de 2026, consultado em 24/09/2026: https://borainvestir.b3.com.br/noticias/copom-tera-8-reunioes-em-2026-veja-calendario-e-projecao-para-a-selic/
  - House Playbook Offroad v2.1, PR-12, e Caso 01, R7, consultados em 24/09/2026 (endereços acima).
- **Uso no método.**
  - PR-02: observação de outro regime sai do conjunto de comparáveis.
  - PR-07: a grade é calculada por regime.
  - PR-12: vigência, invalidação e log de invalidações.
  - PR-13: toda observação nasce com o regime vigente na data.
  - MK-26, referência pós-introdução fora da execução atual: a leitura de janela usa os mesmos gatilhos quando esse escopo for aberto.
- **Revisão.** Em cada gatilho; na reunião do Copom de 3 e 4/11/2026, para atualizar as condições de referência; revisão trimestral das condições registradas, mesmo sem gatilho.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### market.pricing.security-premiums

- **Decisão que governa.** Quanto um reforço de garantia reduz o spread frente à mesma operação limpa. O número decide, em ES-40 e PR-08, se oferecer garantia fecha a distância entre a expectativa da companhia e a banda suportada.
- **Valor proposto.** Tabela de prêmios observados, vazia em 24/09/2026: nenhum par governado registrado. Os quatro tipos de reforço respondem "sem base suficiente" até alcançarem o mínimo de pares. As regras:
  - Prêmio = `normalizedSpreadBps` da estrutura limpa menos `normalizedSpreadBps` da estrutura reforçada, mesmo perfil, prazo e data. Valor positivo é redução de spread, em pontos-base ao ano.
  - Base de comparação: limpa (`unsecured`), inclusive com aval ou fiança pessoal sem garantia real.
  - Tipos de reforço:
    - Real forte (`secured:property`, `secured:equipment`, `secured:vehicles`): alienação fiduciária registrada, laudo independente e cobertura depois do corte de pelo menos 1,0x.
    - Cessão com trava (`secured:receivables`): cessão fiduciária com conta vinculada e trava de domicílio bancário.
    - Garantia líquida (`secured:guarantee`, `secured:financial`): fiança bancária, seguro garantia ou aplicação financeira em garantia cobrindo o principal.
    - Outras reais (`secured:inventory`, `secured:shares`, `secured:other`): garantia real sem as condições acima.
  - Par válido: mesma faixa de risco, mesma família de instrumento, diferença de prazo de até 12 meses, observações com até 30 dias de distância entre si, preferencialmente do mesmo emissor. Mínimo de 5 pares independentes por tipo; pares da mesma operação contam uma vez.
  - Saída por tipo: P25, mediana e P75 do prêmio, número de pares, data do par mais recente e validade.
  - Validade: 180 dias; novo regime invalida a tabela.
  - Pacote combinado: prêmios não se somam; pacote combinado exige par próprio.
  - Não são prêmio: os ajustes de garantia da grade de prática da mesa em `packages/market-reference/src/index.ts` e a diferença entre médias de papéis com e sem garantia de emissores distintos.
- **Regra de aplicação.**
  1. Um par nasce quando duas observações do registro diferem só na família de garantia, dentro das tolerâncias acima.
  2. O prêmio entra em ES-40 e PR-08 somente com a linha da tabela citada: tipo, mediana, número de pares e data.
  3. Abaixo de 5 pares, a resposta é "sem base suficiente": a alternativa de garantia é descrita em cobertura, reais comprometidos e liberação, sem efeito numérico no preço.
  4. O prêmio ajusta comparável ajustável em `policy.pricing.sample-quality` somente para o tipo com base suficiente.
  5. Precedência: prêmio observado nesta tabela prevalece sobre qualquer heurística; heurística nunca substitui linha vazia.
  6. Executor atual: `buildPricingTruthSet` aceita ajuste `security` com fonte e validade e o rejeita vencido ou sem fonte; esta tabela é a única origem admitida desse ajuste.
- **Fundamento.** PR-03 tem autoridade de mercado e manda parear observações que diferem só no pacote. Diferença média entre papéis garantidos e limpos de emissores diferentes mede outra coisa: quem oferece garantia real em geral é quem tem risco maior, e a média mistura o efeito da garantia com o do emissor. O par do mesmo emissor e da mesma data isola o efeito. Cinco pares repetem o mínimo de origens de `policy.pricing.sample-quality`. Os ajustes da grade de prática (menos 60 pontos-base para cobertura de 1,5x, por exemplo) são declaração de prática sem observação por trás; citá-los como prêmio transformaria opinião em dado de mercado. A biblioteca de expertise da Offroad (repositório privado) prevê tabela de referência como premissa enquanto a base não permite; o House Playbook, que governa esta chave, exige a resposta "sem base suficiente", e esta proposta segue o House Playbook.
- **Fontes.**
  - House Playbook Offroad v2.1, PR-03, PR-08 e ES-40, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - Classes de garantia de `packages/deal-structure/src/collateral.ts` e convenção de `securityClass` do motor de casos, consultadas em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/deal-structure/src/collateral.ts
  - Biblioteca de expertise da Offroad (repositório privado): prêmios de estrutura e ponte entre operações.
- **Uso no método.**
  - PR-03: mantém a tabela com contagem e data; abaixo do mínimo responde "sem base suficiente".
  - PR-08: quantifica a alternativa de garantia quando houver linha; sem linha, descreve a alternativa sem preço.
  - ES-40: o prêmio citado sai desta tabela com data.
- **Revisão.** Quando algum tipo alcançar 5 pares; em novo regime; em mudança das classes de garantia do motor de casos; revisão semestral da definição dos tipos.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### market.pricing.tenor-curve

- **Decisão que governa.** Quanto o spread muda com o prazo para um mesmo risco e onde o apetite dos compradores acaba. Decide se um prazo pedido cabe na curva observável ou se exige sondagem antes de qualquer banda.
- **Valor proposto.** Curva governada vazia em 24/09/2026, com método, degraus e contexto público definidos:
  - Medida: pontos-base de `normalizedSpreadBps` por ano de duration de Macaulay.
  - Métodos de par: intraemissor, com duas séries do mesmo emissor e do mesmo indexador na mesma data e duration separada por pelo menos 1 ano; intracélula, com medianas de faixas de prazo adjacentes da mesma faixa de risco, família de instrumento e família de garantia, cada faixa com pelo menos 5 origens distintas.
  - Mínimo: 5 emissores ou pares de células por faixa de risco.
  - Faixas de prazo: as da grade (até 24; 25 a 36; 37 a 60; 61 a 84; 85 a 120; 121 a 360 meses).
  - Degrau de apetite: começa na faixa de prazo em que o número de mandatos atuais e aderentes de `market.mandates` que aceitam o prazo cai para metade ou menos da faixa anterior, com pelo menos 5 mandatos observados.
  - Extrapolação: proibida além da última faixa observada; a resposta é "fora da curva observável; exige sondagem".
  - Contexto do mercado listado em 23/09/2026 (não forma curva de crédito privado): em 83 emissores com duas debêntures DI mais spread separadas por pelo menos 1 ano de duration, o spread cresce 7,75 pontos-base por ano de duration na mediana (P25 0; P75 12,77), e cresce em 75% dos emissores. Por faixa de duration, sem parear emissores, as medianas foram 108,74 pontos-base até 2 anos (198 papéis), 82,03 de 2 a 4 anos (316) e 96,35 acima de 4 anos (45).
  - Validade: 90 dias; recálculo em gatilho de regime ou em rodada de confirmação de mandatos que altere prazos máximos.
- **Regra de aplicação.**
  1. Prazo alvo dentro de faixa observada da célula: usar a própria célula.
  2. Prazo alvo em faixa sem célula, mas entre faixas observadas: ajustar pela inclinação observada da mesma faixa de risco, como etapa de aproximação.
  3. Prazo alvo além da última faixa observada ou além de um degrau de apetite: não precificar; registrar "fora da curva observável; exige sondagem" e levar o prazo a MK-15.
  4. A inclinação do mercado listado serve de teste de plausibilidade para curva de crédito privado de grau de investimento; nunca é aplicada como ajuste.
  5. Precedência: degrau de apetite prevalece sobre inclinação; uma curva suave não autoriza prazo que os mandatos não aceitam.
  6. Executor atual: `buildPricingTruthSet` aceita ajuste `tenor` com fonte e validade; sem ele, marca PR-04 como parcial e compara prazos da amostra dentro de `maxTenorDeltaMonths`.
- **Fundamento.** PR-04 manda identificar onde o apetite acaba e proíbe extrapolação linear. Os números de 23/09/2026 mostram por que o prêmio de prazo só se mede em pares: as medianas por faixa de duration não crescem com o prazo (108,74, 82,03 e 96,35), porque a composição de emissores muda de uma faixa para outra; dentro do mesmo emissor, o prêmio aparece e é pequeno (7,75 pontos-base por ano). Em crédito privado de tíquete médio, o que limita o prazo costuma ser o mandato (prazo máximo, liquidez da cota, casamento com o passivo do fundo), e o preço salta no degrau em vez de crescer de forma contínua. Por isso a curva governada combina inclinação medida e degrau de mandato, e o degrau prevalece.
- **Fontes.**
  - House Playbook Offroad v2.1, PR-04 e MK-11, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - ANBIMA, Mercado Secundário de Debêntures, taxas indicativas e duration de 23/09/2026, arquivo lido em 24/09/2026, estatísticas calculadas pela Offroad: https://www.anbima.com.br/informacoes/merc-sec-debentures/arqs/db260923.txt
  - ANBIMA, Curvas de Crédito, estrutura de spread por rating e prazo, metodologia de outubro de 2021, consultada em 24/09/2026: https://www.anbima.com.br/pt_br/informar/precos-e-indices/curvas/curvas-de-credito.htm
- **Uso no método.**
  - PR-04: curva por perfil com as faixas observadas e a posição dos degraus.
  - ES-05 e ES-06: prazo e amortização propostos respeitam a última faixa observada.
  - MK-15: prazo além do degrau vira pergunta de sondagem aos âncoras.
- **Revisão.** Quando uma faixa de risco alcançar 5 pares; em gatilho de regime; quando a rodada de mandatos alterar o prazo máximo de mais de um terço dos mandatos aderentes; revisão trimestral do contexto listado.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### market.pricing.size-liquidity

- **Decisão que governa.** Em que faixa de tíquete a operação está, que rota de distribuição essa faixa implica, quanto o custo fixo pesa no custo anual e quando o tamanho exige desenho de distribuição antes de qualquer banda.
- **Valor proposto.**
  - Faixas de tíquete, em R$ milhões, com a rota típica e a mediana de investidores no encerramento observada na CVM:
    - Até 20: rota bilateral (CCB, nota comercial com o banco coordenador ou FIDC de nicho); 2 investidores em CRI e CRA e 2 em cotas de FIDC.
    - Acima de 20 até 50: nota comercial, CCB, CRI ou CRA, FIDC e debênture com poucos compradores; 3,5 em debêntures, 2 em CRI e CRA, 4 em FIDC.
    - Acima de 50 até 150: debênture ou nota comercial pelo rito automático para investidores profissionais, FIDC; 7 em debêntures, 3 em CRI e CRA, 8 em FIDC.
    - Acima de 150 até 500: debênture coordenada com distribuição; 15 em debêntures, 16 em FIDC.
    - Acima de 500: emissão de referência com distribuição ampla; 63,5 em debêntures, 60,5 em FIDC.
  - Custo fixo: (custos únicos ÷ prazo médio ponderado em anos + custos anuais) ÷ volume × 10.000, com os componentes de `policy.pricing.cost-catalogue`, mostrado separado do spread.
  - Ajuste de liquidez: nenhum observado em 24/09/2026. Sem ajuste observado e datado, nenhum ajuste de tamanho entra no spread.
  - Capacidade dos âncoras: soma dos tíquetes máximos atuais dos 3 mandatos aderentes de maior aderência em `market.mandates`. Volume acima dessa soma exige desenho de distribuição (MK-17) antes de comunicar banda.
  - Observação pública, ofertas encerradas registradas pela CVM de 24/09/2025 a 23/09/2026:
    - Tamanho, P25, mediana e P75 em R$ milhões: debêntures 150,0, 391,6 e 903,8 (522 ofertas); notas comerciais 40,0, 90,0 e 176,2 (276); CRI e CRA 22,7, 53,3 e 149,2 (523); cotas de FIDC 10,0, 30,0 e 80,0 (987).
    - Investidores no encerramento fora do consórcio de distribuição, mediana entre as ofertas que informaram: debêntures de 50 a 150 milhões, 7 (P25 3, P75 21, 51 ofertas); de 150 a 500, 15 (100 ofertas).
    - Notas comerciais de até R$ 150 milhões: 168 de 197 ofertas encerradas foram subscritas só pelo consórcio de distribuição. Debêntures de até R$ 150 milhões: 62 de 134.
  - Recálculo trimestral, no primeiro dia útil de janeiro, abril, julho e outubro, a partir dos dados abertos da CVM.
- **Regra de aplicação.**
  1. Classificar o tíquete na faixa e registrar a rota típica como ponto de partida, sujeito a ES-41 e ES-44.
  2. Calcular o custo fixo anualizado e mostrá-lo em linha própria; ele entra no all-in (PR-10), nunca no spread da célula.
  3. Aplicar ajuste de tamanho ao spread somente com observação datada nesta chave; sem ela, o resultado registra "sem ajuste de tamanho observado".
  4. Comparar o volume com a capacidade dos 3 âncoras; acima dela, exigir plano de distribuição antes da banda.
  5. Precedência: a faixa orienta a rota, mas o mandato decide o comprador; instrumento fora dos mandatos aderentes não se salva pela faixa.
  6. Executor atual: `buildPricingTruthSet` aceita ajuste `size` com fonte e validade e marca PR-05 como parcial sem ele; a razão de tamanho da amostra vem de `policy.pricing.sample-quality`.
- **Fundamento.** PR-05 separa custo fixo, liquidez e distribuição e admite só ajuste observado. As faixas seguem o que a CVM registra: até R$ 50 milhões, a mediana de compradores no encerramento é de 2 a 4, e um primeiro grupo de 3 âncoras cobre o comprador típico; de R$ 50 a 150 milhões, a mediana sobe para 7 em debêntures, o que pede duas ou três ondas; acima de R$ 150 milhões, a rota é oferta coordenada com livro. Os dados mostram também que nota comercial de até R$ 150 milhões foi, na maioria dos casos do último ano, subscrita pelo próprio consórcio de distribuição, com efeito econômico de crédito bancário em forma de valor mobiliário; a leitura de rota precisa desse dado para não prometer diversificação de credor. O custo fixo pesa mais no tíquete pequeno: numa oferta a profissionais de R$ 20 milhões, só as taxas de registro da CVM e da ANBIMA somam R$ 15.919, 7,96 pontos-base do volume, porque a taxa mínima da ANBIMA supera a alíquota.
- **Fontes.**
  - CVM, Dados Abertos, Ofertas Públicas de Distribuição, arquivo `oferta_resolucao_160.csv` atualizado em 23/09/2026 e lido em 24/09/2026, estatísticas calculadas pela Offroad: https://dados.cvm.gov.br/dataset/oferta-distrib
  - House Playbook Offroad v2.1, PR-05, MK-17, ES-41, ES-44 e ES-45, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - Taxas de registro da ANBIMA e da CVM: ver `policy.pricing.cost-catalogue`.
- **Uso no método.**
  - PR-05: faixa, ajuste observado e implicação de distribuição.
  - ES-45: dimensionamento final confronta o volume com a capacidade dos âncoras.
  - MK-17: volume acima da capacidade exige plano de ondas antes da banda.
- **Revisão.** Recálculo trimestral das estatísticas da CVM; mudança de faixa da mediana de compradores em mais de uma faixa; primeira observação datada de ajuste de liquidez; mudança nas regras de oferta da CVM.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### market.pricing.indexer-basis

- **Decisão que governa.** Como qualquer taxa (percentual do DI, prefixada, IPCA mais cupom, TLP, moeda estrangeira com swap) vira spread equivalente sobre o DI na data da observação, quais níveis de índice a casa usa e qual indexador um comprador aceita. Sem essa base, observações de indexadores diferentes não se comparam e o all-in não pode ser calculado.
- **Valor proposto.**
  - Base de normalização: DI mais spread composto, base 252. Indexador padrão do executor: `cdi`.
  - Níveis para `pricing_policies.index_levels`: `cdi` 0,1365; `ipca` 0,0422; `tlp` 0,0830; `tr` 0,001668; `source_id` bcb-sgs:4389;13522;27572;226; `observed_on` 2026-09-22; `valid_until` 2026-09-30.
    - `cdi`: DI anualizado em base 252 de 22/09/2026, fração ao ano. Válido até a reunião do Copom de 04/11/2026.
    - `ipca`: IPCA acumulado em 12 meses até agosto de 2026, fração. Nível de exibição, nunca insumo de conversão. Válido até a divulgação de 09/10/2026.
    - `tlp`: parcela prefixada real Jm de setembro de 2026, fração ao ano, aplicada sobre o IPCA. Válida até 30/09/2026.
    - `tr`: TR do período de 22/09/2026 a 22/10/2026, fração ao mês. O Banco Central publica uma TR para cada dia de início de período.
  - Conversões para spread equivalente `s` sobre o DI:
    - DI mais spread: fator = fator DI × (1 + s)^(du/252).
    - Percentual do DI `p`: s = {1 + [(1 + c)^(1/252) - 1] × p}^252 ÷ (1 + c) - 1, com `c` = taxa DI x pré na duration da operação.
    - Prefixado `r`: s = (1 + r) ÷ (1 + c(D)) - 1, com c(D) = taxa DI x pré na duration D.
    - IPCA mais cupom `q`: 1 + r = (1 + π(D)) × (1 + q), com π(D) = inflação implícita na duration D; depois, como prefixado.
    - TLP: 1 + r = (1 + IPCA) × (1 + Jm), pro rata, mais o spread do agente na convenção do contrato.
    - Moeda estrangeira com swap: `s` tal que o valor presente dos fluxos em moeda estrangeira com swap para DI, na curva do dia, iguala o valor presente dos fluxos em DI mais `s`.
  - Curvas: prefixada pela ETTJ ANBIMA (Svensson, diária), com as Taxas Referenciais DI x pré da B3 como segunda fonte; real pela ETTJ IPCA da ANBIMA, com DI x IPCA da B3 como segunda fonte; inflação implícita da ETTJ ANBIMA. Entre vértices, interpolação Flat Forward 252, a mesma que a B3 usa na curva DI x pré. Duration de Macaulay da operação em dias úteis. Sempre a curva da data da observação.
  - Regime tributário: papel isento para pessoa física (Lei 12.431, CRI e CRA) compara-se com papel isento; comparação cruzada só com o gross-up de `policy.capital.tax-regime`.
  - Aceitação por mandato: PR-06 exige pelo menos um mandato atual e aderente em `market.mandates` que aceite o indexador proposto; sem ele, a proposta fica bloqueada.
  - Contexto listado de 23/09/2026: LTN 01/04/2027 a 13,3457%, 01/01/2028 a 13,5957%, 01/01/2029 a 13,8688%, 01/01/2030 a 14,0414% e 01/01/2032 a 14,1561%; NTN-B 15/08/2028 a 7,3971%, 15/05/2029 a 7,5108%, 15/08/2030 a 7,7098%, 15/08/2032 a 7,6800% e 15/05/2035 a 7,6161%; debêntures IPCA mais spread com spread sobre a NTN-B de referência de P25 -9,23, mediana 26,97 e P75 85,39 pontos-base (626 papéis).
- **Regra de aplicação.**
  1. Converter cada observação no dia em que foi observada, com a curva desse dia e a duration da operação.
  2. Convenções de calendário, dias úteis, datas inclusiva e exclusiva e arredondamento vêm de `policy.capital.anbima-b3-conventions`; a definição contratual prevalece quando fixa outra convenção.
  3. Taxa total a partir de spread: (1 + DI) × (1 + s) - 1. Nunca soma linear.
  4. Os níveis de `index_levels` servem para exibir e para a taxa total do dia; nunca para converter observação de outra data.
  5. Papel isento só se compara com isento, salvo gross-up aprovado.
  6. Indexador proposto sem mandato aderente que o aceite: bloquear PR-06 até reconfirmação.
  7. Executor atual: `buildPricingTruthSet` só aceita `cdi` e calcula a taxa total somando spread ao CDI. A soma subestima a taxa em cerca de DI × spread: com DI de 13,65%, 14 pontos-base para spread de 1,00% e 41 para spread de 3,00%. A correção do executor para a composição é pendência de engenharia; até lá, todo texto de taxa total tem de vir do cálculo composto.
- **Fundamento.** No manual de apreçamento de debêntures da B3, o contrato pós-fixado com spread multiplicativo, que é o DI mais spread, compõe o fator do indexador com (1 + spread) elevado a du/252, e o contrato com spread percentual multiplica o rendimento diário do DI pelo percentual; é essa a convenção que a normalização reproduz. Percentual do DI não equivale a spread fixo: a equivalência depende do nível do DI na duration. Prefixado e IPCA mais cupom só se comparam com DI pela curva da mesma data e duration; comparar com o DI de hoje uma observação de três meses atrás mistura mudança de juros com mudança de crédito. O IPCA de 12 meses é passado e não mede a inflação que remunera o papel; a conversão usa inflação implícita. Os níveis de 22/09/2026 são os publicados pelo Banco Central. O primeiro quartil negativo do spread IPCA sobre a NTN-B mostra papéis negociando abaixo do título público de referência, efeito compatível com isenção de imposto ao investidor pessoa física; por isso a normalização separa efeito tributário de spread de crédito. A curva de 23/09/2026 precifica cortes adicionais (LTN 01/04/2027 abaixo do DI) e prêmio de prazo a partir de 2028, o que muda a equivalência entre prefixado e DI por prazo.
- **Fontes.**
  - Banco Central do Brasil, SGS 4389, 13522, 27572 e 226, lidos em 24/09/2026: https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/10?formato=json
  - IBGE, calendário de divulgação, IPCA de setembro em 09/10/2026, consultado em 24/09/2026: https://servicodados.ibge.gov.br/api/v3/calendario/
  - ANBIMA, Estrutura a Termo das Taxas de Juros Estimada e Inflação Implícita, metodologia, consultada em 24/09/2026: https://www.anbima.com.br/data/files/18/42/65/50/4169E510222775E5A8A80AC2/est-termo_metodologia.pdf
  - ANBIMA, taxas indicativas de títulos públicos e de debêntures de 23/09/2026, lidas em 24/09/2026: https://www.anbima.com.br/informacoes/merc-sec/arqs/ms260923.txt e https://www.anbima.com.br/informacoes/merc-sec-debentures/arqs/db260923.txt
  - B3, Manual de Curvas, 12/12/2025, seção 2.1 (curva DI x pré a partir do DI1, interpolação Flat Forward 252), lido em 24/09/2026: https://www.b3.com.br/data/files/F3/42/AE/8C/1942B9105B12E5A9AC094EA8/Manual%20de%20Curvas_V21.pdf
  - B3, Manual de Apreçamento de Debêntures, 30/05/2022, seções 2.2.1 e 2.2.2 (spread percentual e spread multiplicativo), lido em 24/09/2026: https://www.b3.com.br/data/files/77/42/B3/46/257E38101E311E28AC094EA8/Manual%20de%20Aprecamento%20-%20Debentures.pdf
  - Biblioteca de expertise da Offroad (repositório privado): convenções de cálculo por indexador.
- **Uso no método.**
  - PR-02: normalização de indexador pela curva e data observadas, com método registrado.
  - PR-06: indexador econômico, comprador que o aceita e descasamento quantificado.
  - PR-10: taxa total e all-in compostos.
- **Revisão.** A cada divulgação dos níveis (DI depois de cada Copom, IPCA mensal, Jm mensal); mudança de metodologia da ETTJ ou das curvas da B3; novo indexador no vocabulário do executor; alteração legal da TLP ou do tratamento tributário de papéis isentos.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### policy.pricing.cost-catalogue

- **Decisão que governa.** Quais custos entram no all-in de cada alternativa, de que fonte cada custo vem, como o custo único vira custo anual e como o all-in proposto se compara com o custo atual da companhia. Sem esse catálogo, a comparação entre instrumentos fica no spread, e PR-10 lembra que a debênture pode perder da CCB em tíquete pequeno.
- **Valor proposto.**
  - Limites com outras chaves: o tratamento do custo em fontes e usos (retido, pago ou financiado) é de `policy.transaction-costs`; IOF é de `policy.capital.iof`; tributos e custo líquido são de `policy.capital.tax-regime`; convenções de cálculo são de `policy.capital.anbima-b3-conventions`.
  - Estado de cada custo: conhecido, zero, não aplicável ou desconhecido. Custo desconhecido bloqueia o all-in da alternativa e nunca recebe zero nem estimativa do modelo.
  - Hierarquia de fontes: (1) contrato ou proposta vinculante assinada, com a validade do documento; (2) tabela pública oficial vigente na data da operação (CVM, ANBIMA, B3, emolumentos do estado do cartório), até a próxima versão; (3) cotação escrita e datada do prestador, válida por 90 dias; (4) referência de mercado da casa, datada, em faixa e rotulada estimativa, válida por 90 dias, só para leitura preliminar e nunca em material externo.
  - Natureza de cada componente: único percentual, único fixo, anual fixo, anual percentual ou por evento.
  - Componentes por instrumento:
    - Todos: estruturação, jurídico do emissor, jurídico do coordenador, registro de garantias, laudo de avaliação, agente de garantias e conta vinculada, rating quando exigido, auditoria quando exigida.
    - CCB: tarifa de estruturação, IOF e reciprocidade estimada.
    - Nota comercial: coordenação, escriturador, depósito na B3, taxa da CVM e da ANBIMA quando houver oferta pública, agente fiduciário quando exigido.
    - Debênture: coordenação, comissão de distribuição, taxa da CVM, taxa da ANBIMA, depósito e custódia na B3, escriturador e liquidante, agente fiduciário, rating quando exigido e publicações.
    - CRI e CRA: securitizadora (emissão e gestão), agente fiduciário, custodiante e registrador, depósito na B3, taxa da CVM, taxa da ANBIMA e coordenação.
    - FIDC: administração, gestão, custódia e controladoria, auditoria, rating da cota sênior, escrituração, taxa da CVM, taxa de registro de fundo da ANBIMA e custo do capital na cota subordinada.
  - Tabelas públicas lidas em 24/09/2026:
    - Taxa de fiscalização da CVM sobre oferta pública de valores mobiliários: 0,03% do valor da oferta, mínimo de R$ 809,16.
    - Taxa de registro da ANBIMA, devida quando o coordenador adere ao código de ofertas públicas da associação, ofertas pela Resolução CVM 160 a investidores profissionais: 0,002778% do valor, mínimo de R$ 9.919 e máximo de R$ 69.436. Ofertas a varejo ou qualificados: 0,003968%, mínimo de R$ 14.169 e máximo de R$ 99.194.
    - Taxa de registro da ANBIMA no convênio CVM e ANBIMA: debêntures 0,009920%; notas comerciais e promissórias 0,003968%; CRI, CRA e demais títulos de securitização 0,022248%; mínimo de R$ 28.341 e máximo de R$ 198.388.
    - Registro de oferta inicial de cotas de FIDC, FII e Fiagro na ANBIMA: 0,003479%, mínimo de R$ 3.396 e máximo de R$ 56.683.
    - Tarifas da B3: tabela vigente na data da operação, não reproduzida nesta proposta.
  - Partes obrigatórias: agente fiduciário em debênture distribuída ou admitida à negociação (Lei 6.404/1976, art. 61, § 1º); escriturador autorizado pela CVM em nota comercial (Lei 14.195/2021, art. 45), com agente fiduciário quando a CVM exigir em oferta pública (art. 50).
  - Anualização:
    - Método que o executor lê: bps = (custo único ÷ prazo médio ponderado em anos + custo anual) ÷ volume × 10.000, com prazo médio ponderado = Σ(t × amortização) ÷ Σ amortização, t em anos de 252 dias úteis.
    - Método que governa a decisão: TIR do fluxo líquido em base 252, com recebido = principal - custos únicos - IOF retido e pagamentos = juros + principal + custos anuais.
    - Quando os dois diferem em mais de 5 pontos-base, a TIR governa e a diferença aparece.
  - Composição: all-in = (1 + DI) × (1 + spread equivalente com custos anualizados) - 1.
  - Apresentação: spread e all-in lado a lado por alternativa; bruto sempre; líquido de imposto só com `policy.capital.tax-regime` aprovado.
  - Comparação com o custo atual (PR-11): custo médio atual reconciliado (D-17) na mesma convenção; risco de rolagem pelo cenário de D-28, em reais; proposta mais cara que o custo atual exige declarar o que se compra pela diferença em prazo (meses), carência (meses), garantia liberada (reais) e risco de rolagem removido (reais).
- **Regra de aplicação.**
  1. Listar os componentes do instrumento e marcar o estado de cada um.
  2. Buscar o valor de cada componente pela hierarquia; registrar fonte, data e validade (`sourceId`, `validUntil` do componente).
  3. Qualquer componente desconhecido bloqueia o all-in daquela alternativa, com a lacuna nomeada.
  4. Anualizar pelo método do executor e conferir com a TIR; acima de 5 pontos-base de diferença, publicar a TIR.
  5. Comparar alternativas sempre em all-in, nunca em spread.
  6. Exemplos com números públicos:
     - Debênture de R$ 100 milhões a profissionais, bullet de 4 anos: CVM R$ 30.000; ANBIMA R$ 9.919 (a alíquota daria R$ 2.778); total de R$ 39.919, ou 3,99 pontos-base do volume e 1,00 ponto-base ao ano.
     - Nota comercial de R$ 20 milhões a profissionais, 2 anos: CVM R$ 6.000; ANBIMA R$ 9.919 (a alíquota daria R$ 555,60); total de R$ 15.919, ou 7,96 pontos-base e 3,98 pontos-base ao ano.
     - CCB bullet de 1 ano ou mais a pessoa jurídica: IOF de 0,0082% ao dia limitado a 365 dias mais 0,38%, ou 3,373% do principal; em prazo médio de 3 anos, 112,4 pontos-base ao ano pelo método linear. O valor que entra no cálculo vem de `policy.capital.iof`.
  7. Executor atual: `buildPricingTruthSet` recebe `costs` com `oneTimeAmount`, `annualAmount`, `sourceId` e `validUntil`, rejeita componente vencido e soma a taxa total de forma linear; ver `market.pricing.indexer-basis` para a composição.
- **Fundamento.** PR-10 manda somar estruturação, registro, garantias, monitoria e jurídico ao spread, anualizar no prazo médio e comparar instrumentos em all-in. O método linear é o que o executor lê e é o jeito de mesa de explicar custo; a TIR é o custo econômico e governa quando os dois se afastam. As taxas regulatórias são pequenas frente aos custos de coordenação, jurídico, agente fiduciário e rating, que variam por operação e por isso vêm de contrato ou cotação; o catálogo não publica faixa desses custos sem cotação datada. O IOF faz a CCB carregar 3,373% do principal quando o prazo passa de um ano, enquanto a debênture carrega custos fixos de emissão que pesam mais no tíquete pequeno; a escolha entre os dois só se faz em all-in. Em 24/09/2026 vigora o art. 7º do Decreto 6.306/2007 na redação do Decreto 12.499/2025, com eficácia restabelecida pela medida cautelar do STF de 16/07/2025 (ADC 96 e ADIs 7827 e 7839), exceto quanto ao risco sacado; não localizei no portal do STF decisão de mérito posterior, e a consulta automatizada ao andamento do processo foi recusada pelo portal. A MP 1.303/2025, que dispunha sobre a tributação de aplicações financeiras, perdeu a eficácia em 08/10/2025 sem apreciação pelo Congresso Nacional, de modo que o tratamento tributário de papéis isentos segue a lei anterior a ela.
- **Fontes.**
  - Lei 7.940/1989, Anexo IV, redação da Lei 14.317/2022, consultada em 24/09/2026: https://www.planalto.gov.br/ccivil_03/leis/l7940.htm
  - ANBIMA, taxas de registro e de supervisão, tabela vigente consultada em 24/09/2026: https://www.anbima.com.br/pt_br/autorregular/supervisao/taxas-de-supervisao.htm
  - Lei 6.404/1976, art. 61, consultada em 24/09/2026: https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm
  - Lei 14.195/2021, arts. 45, 46 e 50, consultada em 24/09/2026: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14195.htm
  - Decreto 6.306/2007, art. 7º, § 1º, e Decreto 12.499/2025, consultados em 24/09/2026: https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6306.htm e https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12499.htm
  - STF, "STF restabelece parcialmente decreto que eleva alíquotas do IOF", 16/07/2025, consultado em 24/09/2026: https://noticias.stf.jus.br/postsnoticias/stf-restabelece-parcialmente-decreto-que-eleva-aliquotas-do-iof/
  - Congresso Nacional, MPV 1.303/2025, situação "sem eficácia", consultada em 24/09/2026: https://www.congressonacional.leg.br/materias/medidas-provisorias/-/mpv/169059
  - B3, tarifas: https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/
- **Uso no método.**
  - PR-10: componentes com fonte, anualização e all-in por alternativa.
  - PR-11: comparação com o custo atual e o que se compra pela diferença.
  - MA-12 e ES-41: a estrutura e o memorando citam o all-in desta regra.
- **Revisão.** Nova versão de qualquer tabela pública citada; decisão de mérito do STF na ADC 96 ou novo decreto de IOF; mudança legal sobre agente fiduciário, escrituração ou taxa da CVM; alinhamento do executor à TIR e à composição.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

### market.pricing.observation-registry

- **Decisão que governa.** Qual observação de preço pode entrar na grade da casa, com que qualidade, por quanto tempo e sob que controle de sigilo e de uso agregado. Sem registro governado não há grade (PR-07), e observação sem fonte, data, qualidade ou validade não alimenta nada (PR-13).
- **Valor proposto.** Registro na tabela `public.pricing_observations`, sem observação incluída nesta proposta, com estas regras:
  - Campos obrigatórios: `sourceId`, `sourceOwner`, `sourceKind`, `confidentiality`, `observedOn`, `validUntil`, `status`, `instrument`, `rating`, `indexer`, `tenorMonths`, `securityClass`, `amortizationClass`, `sectorGroup`, `amount`, `regime`, `economics`, `normalizationMethod`, `quality`, `aggregateAuthorized` e `evidenceLocator`.
  - Vocabulários: `securityClass` na convenção do motor de casos (`unsecured`, ou `secured:` seguido das classes de garantia ordenadas e unidas por `+`); `amortizationClass` em `bullet`, `sac`, `price` e `balloon`; `sectorGroup` nos grupos das lentes setoriais do House Playbook (agro, varejo, indústria, serviços recorrentes e software, saúde, educação, energia, imobiliário, transporte e logística, construção pesada e infraestrutura, outros).
  - Qualidade por tipo de fonte, de 0 a 1: `public_closing` 1; `term_sheet` 0,9; `authorized_historical` 0,9; `direct_manager_confirmation` 0,8; `indication` 0,6; `sounding` 0,5.
  - Estado por tipo de fonte: `public_closing` e `authorized_historical` como `closed`; `term_sheet` e `direct_manager_confirmation` como `term`; `indication` e `sounding` com o próprio nome.
  - Validade: `public_closing` com peso pleno por 90 dias e `validUntil` em 150; os demais tipos com peso pleno por 120 dias e `validUntil` em 180.
  - Identidade econômica: `normalizedSpreadBps` = `quotedSpreadBps` + `feeBps` + `oidBps` + `warrantBps` + `hedgeBps`, com tolerância de 0,01 ponto-base; comissão única entra como pontos-base do volume divididos pela duration em anos.
  - Origem: `sourceId` identifica a operação, não o documento; propostas, rodadas e séries da mesma operação compartilham a origem.
  - Sigilo: `public` para fonte pública com direito de uso registrado; `aggregated_confidential` para observação de cliente ou de financiador com consentimento específico para uso agregado; `restricted_internal` nunca entra em agregado (`aggregateAuthorized` falso, como a tabela já impõe).
  - Anonimização nas consultas do produto: sem nome, CNPJ, cidade ou combinação de campos que identifique a companhia; valor na faixa de tíquete de `market.pricing.size-liquidity`; data de observação de cliente em janela de 15 dias. A ligação com a origem fica só no registro de auditoria restrito, para cumprir revogação.
  - Consentimento: `aggregateAuthorized` exige consentimento específico da companhia para uso agregado, registrado com data e versão. A revogação retira a observação de toda referência calculada depois dela; agregado anterior fica como histórico e não se reutiliza como referência atual.
  - Admissão: recusar observação sem fonte, sem data, sem qualidade, sem validade, boato ou com identidade econômica que não fecha em 0,01 ponto-base. Indicação e sondagem ficam registradas para aprendizado, PR-08 e MK-15, e não formam célula, porque a qualidade fica abaixo do mínimo de 0,75.
  - Auditoria: relatório mensal de frescor e de consentimentos, no primeiro dia útil.
- **Regra de aplicação.**
  1. Toda observação nasce com o regime vigente (`policy.pricing.regime`) e com a qualidade e a validade do seu tipo de fonte.
  2. A normalização de indexador é a de `market.pricing.indexer-basis`, com o método gravado em `normalizationMethod`.
  3. O uso agregado depende de `aggregateAuthorized`; observação restrita serve só ao caso de origem, como memória privada.
  4. Nenhuma consulta do produto chega de uma observação a um cliente ou de um cliente a uma observação.
  5. Precedência: consentimento e sigilo prevalecem sobre qualquer necessidade de amostra; observação sem consentimento não entra, mesmo que complete uma célula.
  6. Executor atual: o carregador `worker_load_pricing_context` entrega ao executor as observações do regime ativo dos últimos 24 meses, até 2.000 linhas; o executor recusa observação vencida, sem dono, restrita, sem autorização agregada, abaixo da qualidade, de outro regime, sem linhagem ou com identidade econômica quebrada.
- **Fundamento.** PR-13 define o formato mínimo e manda deixar boato fora de decisão. A escala de qualidade segue o grau de compromisso da fonte: fechamento público e contrato histórico são fato; term sheet é proposta documentada; confirmação direta de gestor é dita e registrada; indicação e sondagem são sinais. As validades aplicam as janelas do Caso 01. A regra de origem impede que oito registros da mesma operação pareçam oito observações independentes, caso de aceite do próprio Caso 01. Sigilo, anonimização e consentimento repetem a política de agregação do Caso 01 (R6): memória privada e inteligência de mercado são objetos distintos, e só a permissão específica move uma observação de um para o outro.
- **Fontes.**
  - House Playbook Offroad v2.1, PR-02, PR-07, PR-12 e PR-13, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md
  - Caso 01, seção R6, consultado em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/procedures/capital/prepare-capital-structure-decision.md
  - Tabela `pricing_observations` e carregador, consultados em 24/09/2026: https://github.com/carlosevg100/offroad/blob/main/supabase/migrations/20260826013647_m6_pricing_registry.sql
  - Biblioteca de expertise da Offroad (repositório privado): política de agregação e campos da observação.
- **Uso no método.**
  - PR-02: comparáveis vêm deste registro, com motivo de inclusão ou rejeição.
  - PR-07: a grade só usa observações autorizadas e válidas.
  - PR-12: estados de validade e log de invalidações.
  - PR-13: formato, qualidade, validade e controle de uso agregado.
- **Revisão.** Mudança da política de privacidade ou do termo de consentimento; mudança do esquema da tabela; relatório mensal com observação agregada sem consentimento registrado, que bloqueia o registro até a correção.
- **Estado.** Preparado pela Offroad em 24/09/2026; aguardando revisão do fundador.

