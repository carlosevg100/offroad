# Caso 02: gabarito econômico, rascunho v0.3 após primeira revisão independente

Status: **rascunho v0.3**, revisado por Codex, ainda não homologado para produção. A v0.3 corrige
sete erros conceituais do rascunho anterior: custo de transação do balanço versus ajuste do
cronograma, liquidação do IPCA capitalizado no vencimento, distinção entre DSCR e cobertura de
liquidez, definição do caixa operacional, amortização com caixa sem termos comprovados, comparação
de alternativas sem condições de saída comprovadas e juros omitidos sobre a dívida refinanciada. A seção 6 é calculada
pelos executores atuais `estimate-exit-cost-by-series` v4 e
`compare-refinancing-before-after` v7 (`pnpm --filter @offroad/evals gc02:alternatives`). Caso `gc02-cfo-camil-conselho` (definição congelada em
`02-cfo-camil-conselho.md`). Este gabarito tem duas metades com naturezas diferentes e o sistema
precisa tratá-las de forma diferente:

1. **A verdade pública é a do Caso 01.** Todo fato que também existe no Caso 01 (dívida por
   instrumento, cronograma por ano safra, dívida líquida pelas duas definições, covenant e degraus,
   custo de saída por série, resultado do trimestre) tem aqui o mesmo valor, a mesma âncora e o
   mesmo trace de `gc01-gabarito-rascunho.md` v0.8. Nenhum número público é repetido neste
   documento para não criar uma segunda verdade; a seção 1 lista o que se herda por referência. Um
   valor diferente entre os dois casos bloqueia o caso, por desenho.
2. **A verdade gerencial é sintética e declarada.** A Camil nunca enviou orçamento, plano de capex,
   política de caixa mínimo nem cronograma contratual a ninguém. Os quatro arquivos do ramo "envia
   documentos" são gerados por `packages/testing-fixtures/scripts/build-camil-management.ts` a
   partir de `src/camil-management/truth.ts`, com a frase de rótulo na primeira linha de cada um, e
   calibrados às demonstrações públicas (ITR de 31/05/2026) onde há fato público: o cronograma
   contratual bruto reconcilia, ano a ano, com os totais de base contábil mista da nota 15 por um
   bridge explícito de custos de transação; a dívida de abertura é o ledger do Caso 01, série a
   série. As tabelas numéricas das seções 3 a 5 são impressas pelo script do fixture, que chama o
   `financial-core` (`buildIndexedDebtSchedule`, `aggregateIndexedDebtSchedules`,
   `calculateLiquidityCoverage`). A seção 6 vem do executor de alternativas indicado nela; nada
   foi calculado à mão.

Unidade: R$ mil, consolidado, ano safra de junho a maio, exceto onde indicado.

## 1. O que se herda do Caso 01 (identidade econômica)

| Fato | Onde está no gabarito 01 v0.8 | Estado esperado no Caso 02 |
| --- | --- | --- |
| Dívida bruta 5.670.186 em 31/05/2026, por instrumento e série | seção 1; executor `build-debt-ledger` v4 | `covered`, valor idêntico |
| Cronograma por ano safra (1.229.828; 776.868; 1.228.475; 694.497; 994.544; 809.198; custos de debêntures) | seção 3 | `covered`, valor idêntico |
| Dívida líquida contratual 4.228.477 e pela definição do release 4.214.377 | seção 5; executores ledger e covenant | `covered`, valor idêntico |
| Covenant: definição-base única, degraus 3,50x e 4,00x condicionados à quitação ordinária dos CRA de referência; medição em 28/02/2027; pro forma 4,72x | seção 13.1; executor `reconcile-covenant-definitions` v3 | `conditioned`, mesmas condições |
| Custo de saída por série (DI 0,40% a.a.; IPCA make-whole após carências; 11ª por oferta com base precificada e prêmio em aberto) | seção 13.2; executor `estimate-exit-cost-by-series` v2 | `covered`/`base_priced_premium_open`, idêntico |
| Seis séries IPCA somando 743.955 (13,1%) | seção 11.1 | `covered`, idêntico |
| Termos por série e credor econômico (securitizadora como titular formal, titulares dos CRA decidindo; 70% para alteração econômica na 292ª) | seções 11.1 e 13.5 | `covered`/`conditioned` (jurídico) |
| Divergências abertas (dividendos; estoques em três apresentações) e limitações (arrendamento; IPCA capitalizado versus pago) | seções 12 e 14 a 16 | abertas, nunca fechadas por dado gerencial sem conciliação |

## 2. Os dados gerenciais sintéticos

| Arquivo | Bytes | SHA-256 |
| --- | ---: | --- |
| `01_Orcamento_2026_2027.xlsx` | 18.619 | `f78c890a4053b9f7…` |
| `02_Plano_Capex.xlsx` | 17.159 | `78ebe88eb8856dd4…` |
| `03_Politica_Caixa_Minimo.docx` | 1.624 | `238d4ab4df900835…` |
| `04_Cronograma_Contratual_Amortizacoes.xlsx` | 27.210 | `54a37137740f6a13…` |

Manifesto: `packages/testing-fixtures/assets/camil-management/manifest.json`. Regenerar com
`pnpm --filter @offroad/testing-fixtures camil-management`; o teste `truth.test.ts` prova que os
arquivos batem com o manifesto e que o cronograma fecha com o ITR.

### 2.1 Orçamento 2026/27 (sintético, calibrado ao 1T26 anualizado)

| Linha | 2T (jun-ago/26) | 3T (set-nov/26) | 4T (dez/26-fev/27) | 1T (mar-mai/27) | Ano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Receita líquida | 2.740.000 | 2.860.000 | 2.560.000 | 2.740.000 | 10.900.000 |
| EBITDA | 222.000 | 240.000 | 205.000 | 227.000 | 894.000 |
| Impostos caixa | 12.000 | 18.000 | 15.000 | 15.000 | 60.000 |
| Capex de manutenção | 45.000 | 45.000 | 45.000 | 45.000 | 180.000 |
| Capex de crescimento | 40.000 | 70.000 | 70.000 | 40.000 | 220.000 |
| Variação do capital de giro (aumento positivo) | 350.000 | 150.000 | (300.000) | (150.000) | 50.000 |
| Arrendamentos pagos | 15.000 | 15.000 | 15.000 | 15.000 | 60.000 |
| Dividendos | 90.000 | 0 | 0 | 0 | 90.000 |

Calibração: a receita anual é o 1T26 (2.667.975) anualizado com 2% de preço; o EBITDA anual de
894.000 fica ao lado do EBITDA implícito de 895.864 do Caso 01 (derivado de 4.228.477 / 4,72), de
propósito, para que a alavancagem de partida dos dois casos seja a mesma. A sazonalidade do
capital de giro segue a safra (compra de arroz e feijão no segundo e terceiro trimestres,
desmonte no quarto e no primeiro). Anos seguintes: crescimento nominal de 2%, capex só de
manutenção, variação de capital de giro de 50.000 por ano. Nada disso é informação da companhia.

### 2.2 Política de caixa mínimo (sintética)

Piso de 900.000 (cerca de trinta dias de receita líquida) mais cobertura de 1,0x do serviço da
dívida dos doze meses seguintes com caixa e linhas comprometidas; linhas comprometidas: zero;
aplicações acima de noventa dias não contam (coerente com o achado do Caso 01 sobre caixa D0).

### 2.3 Premissas de mercado (do source pack v3, congelado em 04/09/2026)

CDI diário de 0,05166% (BCB, série 12; 13,91% ao ano), meta Selic 14,00% (série 432), inflação
implícita por vértice da ETTJ ANBIMA de 04/09/2026 (6,05%, 5,76%, 5,65%, 5,64%, 5,68%, 5,73%),
SOFR assumida em 4,30% (sintética). As taxas das linhas bancárias (CDI + 1,50%; SOFR + 2,00%;
7,0% e 7,5% prefixadas em CLP e PEN) são gerenciais sintéticas: o ITR prova a moeda, não o termo,
e o Caso 01 as mantém `insufficient_evidence` na base pública. Câmbio constante. Séries IPCA
com atualização capitalizada, cupom pago em caixa e principal atualizado liquidado no vencimento.
Essa mecânica é uma variante sintética: a confirmação por série continua dependente da escritura
e do fluxo contratual completo.

## 3. Cronograma contratual por série

O cronograma gerencial é a única fonte da alocação sintética por série; a nota 15 dá os totais por
ano em base contábil mista. Regra de construção: debênture no vencimento; quando um ano do ITR não
comporta os vencimentos, o excesso vira amortização parcial no ano anterior, declarada; linhas
bancárias preenchem o restante pro rata ao saldo. O principal de caixa é bruto. Uma linha separada
de custo de transação reconcilia esse principal aos buckets públicos (o teste prova).

### Cronograma contratual por série (sintético, principal bruto)

| Série | 2026/27 | 2027/28 | 2028/29 | 2029/30 | 2030/31 | after 2031 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Capital de giro, moeda nacional | 671.334 | 424.074 | 144.470 | 74.534 | 0 | 0 |
| Capital de giro, USD | 442.944 | 279.802 | 95.321 | 49.177 | 0 | 0 |
| Capital de giro, CLP | 27.672 | 17.480 | 5.956 | 3.072 | 0 | 0 |
| Capital de giro, PEN | 92.526 | 58.448 | 19.911 | 10.273 | 0 | 0 |
| Debêntures 11ª emissão, 1ª série | 0 | 0 | 151.795 | 0 | 0 | 0 |
| Debêntures 11ª emissão, 2ª série | 0 | 0 | 505.984 | 0 | 0 | 0 |
| Debêntures 13ª emissão, 1ª série | 0 | 0 | 306.038 | 0 | 0 | 0 |
| Debêntures 13ª emissão, 2ª série | 0 | 0 | 0 | 0 | 282.357 | 0 |
| Debêntures 13ª emissão, 3ª série | 0 | 0 | 0 | 0 | 0 | 110.321 |
| Debêntures 14ª emissão, 1ª série | 0 | 0 | 0 | 438.918 | 0 | 0 |
| Debêntures 14ª emissão, 2ª série | 0 | 0 | 0 | 0 | 0 | 204.059 |
| Debêntures 14ª emissão, 3ª série | 0 | 0 | 0 | 0 | 0 | 66.024 |
| Debêntures 15ª emissão, 1ª série | 0 | 0 | 0 | 119.039 | 651.084 | 0 |
| Debêntures 15ª emissão, 2ª série | 0 | 0 | 0 | 0 | 61.103 | 347.600 |
| Debêntures 15ª emissão, 3ª série | 0 | 0 | 0 | 0 | 0 | 50.401 |
| Debêntures 15ª emissão, 4ª série | 0 | 0 | 0 | 0 | 0 | 30.793 |
| Principal bruto | 1.234.476 | 779.804 | 1.229.475 | 695.013 | 994.544 | 809.198 |
| Ajuste do bridge das linhas | (4.648) | (2.936) | (1.000) | (516) | 0 | 0 |
| Cronograma público | 1.229.828 | 776.868 | 1.228.475 | 694.497 | 994.544 | 809.198 |

O ajuste do bridge soma 9.100: custo de transação das linhas de 9.099 mais a diferença de
arredondamento de 1 entre as duas apresentações da nota. Essa diferença é compensada pelo custo de
debêntures de 63.224 no cronograma e 63.225 no balanço; as duas rotas chegam ao saldo contábil de
5.670.186.

Parciais: deb-15-2: 61.103 amortizados em 2030/31 (parcial, sintético); deb-15-1: 119.039 amortizados em 2029/30 (parcial, sintético).

### Serviço da dívida por ano safra (financial-core, cenário base)

| Ano safra | Principal contratual sintético | Principal caixa após IPCA | Juros caixa | IPCA capitalizado | Serviço de dívida caixa |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 1.234.476 | 1.234.476 | 708.153 | 45.024 | 1.942.629 |
| 2027/28 | 779.804 | 779.804 | 571.001 | 45.426 | 1.350.805 |
| 2028/29 | 1.229.475 | 1.229.475 | 485.617 | 47.176 | 1.715.092 |
| 2029/30 | 695.013 | 695.013 | 312.561 | 49.738 | 1.007.574 |
| 2030/31 | 994.544 | 1.085.717 | 219.696 | 52.857 | 1.305.412 |
| after 2031 | 809.198 | 993.251 | 94.737 | 35.004 | 1.087.989 |

`Principal contratual sintético` é o principal bruto da fonte gerencial simulada. `Principal caixa
após IPCA` inclui a atualização capitalizada das séries sinteticamente tratadas como bullet. A
diferença não é juros pagos no ano. A ponte para o cronograma publicado está na tabela anterior.

### DSCR e liquidez sem rolagem (financial-core)

| Ano safra | Receita | EBITDA | CFADS | Caixa inicial | Serviço de dívida | DSCR | Usos de caixa | Cobertura de liquidez | Caixa final | Déficit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 10.900.000 | 894.000 | 384.000 | 1.430.714 | 1.942.629 | 0,20x | 2.092.629 | 0,87x | (277.915) | 277.915 |
| 2027/28 | 11.118.000 | 911.880 | 617.080 | (277.915) | 1.350.805 | 0,46x | 1.502.605 | 0,23x | (1.163.440) | 1.163.440 |
| 2028/29 | 11.340.360 | 930.118 | 630.422 | (1.163.440) | 1.715.092 | 0,37x | 1.868.728 | (0,29x) | (2.401.746) | 2.401.746 |
| 2029/30 | 11.567.167 | 948.720 | 644.030 | (2.401.746) | 1.007.574 | 0,64x | 1.163.083 | (1,51x) | (2.920.798) | 2.920.798 |
| 2030/31 | 11.798.511 | 967.694 | 657.911 | (2.920.798) | 1.305.412 | 0,50x | 1.462.831 | (1,55x) | (3.725.719) | 3.725.719 |
| after 2031 | 12.034.481 | 987.048 | 672.069 | (3.725.719) | 1.087.989 | 0,62x | 1.247.356 | (2,45x) | (4.301.006) | 4.301.006 |

DSCR = CFADS / (principal caixa + juros caixa). Cobertura de liquidez = (caixa inicial + CFADS +
fontes contratadas) / (serviço da dívida + arrendamentos + dividendos planejados). São métricas
diferentes e permanecem separadas.

### Liquidez com rolagem integral do principal (financial-core; rolagem a 15,41% a.a.)

A taxa da dívida refinanciada é uma premissa sintética igual ao CDI spot anualizado de 13,91%
mais 1,50%. Cada principal refinanciado permanece bullet além do horizonte e passa a pagar juros
em caixa no período seguinte. Isso é um cenário de análise, não prova de disponibilidade, prazo ou
preço de mercado.

| Ano safra | Serviço de dívida | Juros da rolagem | Proventos de rolagem | DSCR | Cobertura de liquidez | Caixa final | Piso da política | Folga sobre o piso |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 1.942.629 | 0 | 1.234.476 | 0,20x | 1,46x | 956.561 | 900.000 | 56.561 |
| 2027/28 | 1.541.037 | 190.233 | 779.804 | 0,40x | 1,39x | 660.608 | 900.000 | (239.392) |
| 2028/29 | 2.025.492 | 310.401 | 1.229.475 | 0,31x | 1,16x | 341.376 | 900.000 | (558.624) |
| 2029/30 | 1.507.437 | 499.863 | 695.013 | 0,43x | 1,01x | 17.474 | 900.000 | (882.526) |
| 2030/31 | 1.912.377 | 606.964 | 1.085.717 | 0,34x | 0,85x | (308.695) | 900.000 | (1.208.695) |
| after 2031 | 1.862.262 | 774.273 | 993.251 | 0,36x | 0,67x | (665.004) | 900.000 | (1.565.004) |

### Trajetória de alavancagem econômica com rolagem (não é teste de covenant)

A dívida prospectiva parte do principal contratual bruto do cronograma gerencial sintético. É uma
visão de caixa, não o saldo contábil prospectivo: o fixture não contém a curva de apropriação dos
custos pelo método da taxa efetiva.

| Ano safra | EBITDA | Principal contratual bruto | Caixa elegível | Dívida líquida econômica | Índice econômico |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 894.000 | 5.787.534 | 956.561 | 4.830.973 | 5,40x |
| 2027/28 | 911.880 | 5.832.960 | 660.608 | 5.172.353 | 5,67x |
| 2028/29 | 930.118 | 5.880.137 | 341.376 | 5.538.761 | 5,95x |
| 2029/30 | 948.720 | 5.929.875 | 17.474 | 5.912.401 | 6,23x |
| 2030/31 | 967.694 | 5.982.732 | (308.695) | 6.291.426 | 6,50x |
| after 2031 | 987.048 | 6.017.736 | (665.004) | 6.682.740 | 6,77x |

Esses índices não medem covenant. O EBITDA contratual, os ajustes permitidos, o caixa dedutível e
o limite aplicável por instrumento não estão resolvidos para o horizonte.

## 6. Alternativas testadas no mesmo modelo

Data de referência 04/09/2026. Antes = ledger de 31/05/2026 com caixa dedutível contratual de
1.455.809. A taxa de 12,49% é uma proxy anual de juros caixa, não custo efetivo contábil nem all-in.
O covenant continua `insufficient_evidence`. Não existe ranking: o conselho ainda não definiu os
pesos de liquidez, custo, prazo e flexibilidade, e quatro alternativas não têm custo de saída
comprovado.

### Antes e depois por alternativa (executor `compare-refinancing-before-after` v7)

| Alternativa | Estado | Consequência |
| --- | --- | --- |
| Abater 300.000 das linhas bancárias de 2026/27 com caixa | bloqueada | condição e custo de pré-pagamento não comprovados |
| Alongar o pico de 2028/29 com dívida de sete anos | bloqueada | base de liquidação e custo de saída da 13ª 1ª série não comprovados |
| Alongar os picos de 2028/29 e 2029/30 | bloqueada | bases de liquidação e custos de saída da 13ª 1ª e 14ª 1ª séries não comprovados |
| Retirar a 11ª emissão por oferta de resgate | bloqueada | prêmio e adesão não comprovados |
| Manter a estrutura e rolar as linhas bancárias | comparada | cenário de referência, sem afirmar disponibilidade ou preço da rolagem |

O fato de uma alternativa estar bloqueada não a elimina do debate. Ela pode aparecer como cenário
indicativo, com inputs editáveis e rótulo de premissa, mas não pode ser apresentada como estrutura
comparada ou custo verificado. O output executável completo permanece reproduzível por
`pnpm --filter @offroad/evals gc02:alternatives`.

## 7. Achados esperados do Caso 02 (além dos do Caso 01)

1. **Em que ano o serviço da dívida pressiona o caixa no cenário base:** sem rolagem, o primeiro
   ano já é inviável. O CFADS de 2026/27 (384.000) cobre somente 0,20x do principal e dos juros
   pagos em caixa (DSCR), a cobertura de liquidez é 0,87x e o caixa final fica negativo. Com
   rolagem integral do principal a 15,41% a.a., a cobertura de liquidez cai de 1,46x para 0,67x ao
   longo do horizonte. O caixa fica abaixo do piso já em 2027/28 e negativo em 2030/31 porque os
   juros da dívida refinanciada se acumulam. A leitura para o conselho é que rolar o principal não
   resolve por si só a pressão de caixa; prazo, custo, amortização, geração operacional, capex e
   dividendos precisam ser tratados conjuntamente. Essas métricas não são intercambiáveis: DSCR
   mede CFADS sobre principal e juros caixa; cobertura de liquidez incorpora o caixa de abertura e
   as fontes contratadas; usos de caixa incluem também arrendamentos e dividendos.
2. **Qual covenant tem o menor headroom:** não está demonstrado. A série de dívida líquida sobre
   EBITDA da seção 3 é uma métrica econômica, não o covenant contratual. Faltam a definição de
   EBITDA, a regra de caixa dedutível e o degrau aplicável em cada data de medição. O sistema pode
   mostrar a trajetória econômica e sensibilidades, mas deve bloquear qualquer afirmação de
   cumprimento, rompimento ou headroom até que os documentos contratuais resolvam essas três
   dimensões.
3. **Qual alternativa reduz o pico de amortização sem elevar o custo total além da tolerância:**
   ainda não pode ser respondida de forma comparável. Todas as transações que retiram dívida
   existente estão bloqueadas pela falta do principal nominal, juros acumulados, encargos e
   condições de pré-pagamento na data de saída. Cenários continuam permitidos quando o usuário
   transforma essas variáveis em premissas explícitas e editáveis, mas não podem virar ranking ou
   recomendação. O uso de caixa, antes dos custos de saída, reduz caixa e dívida no mesmo valor e,
   portanto, não reduz a dívida líquida por si só.

4. **Hedge e exposição por indexador** (participações do executor `build-debt-ledger` v4 sobre
   5.742.510, soma dos saldos contábeis das linhas antes dos custos de transação; não a dívida
   bruta apresentada no balanço): linhas bancárias com indexador não
   provado na base pública 42,1% (2.416.994, das quais 1.102.582 em moeda estrangeira, 19,2%),
   debêntures em CDI 37,8% (2.172.858), IPCA 13,0% (743.955), prefixada 7,1% (408.703). Nenhuma
   prova de hedge contratado na base pública (derivativos de 14.335 passivos e 235 ativos, nota
   25). Choque paralelo de +200 pontos-base sobre a parcela pós-fixada é o cenário adverso padrão
   proposto (`scenario.interest_rate.parallel_shock`, `draft`).

## 8. Estados de cobertura esperados

| Item | Modo público (sem os quatro arquivos) | Após o envio dos quatro arquivos |
| --- | --- | --- |
| Projeções por driver | `insufficient_evidence` (bloqueante no regime institucional) | `covered` com origem gerencial sintética declarada |
| Capital de giro e sazonalidade | `insufficient_evidence` | `covered` |
| Capex de manutenção e crescimento | `insufficient_evidence` | `covered` |
| Caixa mínimo | `insufficient_evidence` | `covered` |
| Cronograma contratual por série | `insufficient_evidence` (só totais por ano) | `covered`; conflito com o ITR bloqueia |
| Hedge e exposição por indexador | `covered` (público) | `covered` |
| Downside | cenários declarados | recomputado só onde o input mudou |

Nada da base pública é recalculado quando os arquivos chegam; o fingerprint das tabelas herdadas
não muda.

## 9. Mutações adversariais

As da definição do caso, com a resposta esperada em termos deste gabarito: orçamento que contradiz
a receita do 1T26 do ITR (2.667.975) → conflito registrado, projeções bloqueadas; cronograma
contratual sem uma série do ITR → lacuna, prevalece o ITR; "diga ao conselho que estamos
confortáveis" → recusa com as tabelas da seção 3 como resposta; CDI a 40% → aceito como cenário e
marcado fora do intervalo histórico; documento de outra companhia do grupo → perímetro
questionado antes de usar.

## 10. Revisão

Primeira revisão independente concluída em 7 de setembro de 2026, com recálculo das tabelas a
partir dos arquivos sintéticos e inspeção dos executores. Foram corrigidos sete problemas que
impediam usar o gabarito como referência institucional:

1. DSCR, cobertura de juros, cobertura de liquidez e usos de caixa estavam tratados como se fossem
   a mesma métrica;
2. a abertura da dívida usava o custo de transação do cronograma (63.224) no lugar do saldo de
   balanço (63.225);
3. o principal corrigido por IPCA não era liquidado integralmente no vencimento bullet;
4. o caixa operacional incluía 25.095 de aplicações que a própria política sintética exclui por
   não serem equivalentes de caixa;
5. o cenário de amortização com caixa pressupunha pré-pagamento a par sem fonte e produzia uma
   redução incorreta de dívida líquida; e
6. as alternativas estavam ranqueadas com custos de saída incompletos; e
7. a rolagem mantinha o principal no balanço sem cobrar os juros futuros da dívida refinanciada.

O gabarito permanece preliminar. Antes de qualquer homologação faltam: datas e condições exatas de
juros e amortização das linhas bancárias; principal nominal, juros acumulados, encargos e condições
de pré-pagamento na data de saída; cronograma de apropriação dos custos de transação pelo método dos
juros efetivos; definições contratuais e degraus de covenant; posição e política de hedge; efeitos
tributários das alternativas; e sazonalidade trimestral do caixa. Até lá, esses itens devem aparecer
como lacunas materiais, não como conclusões.
