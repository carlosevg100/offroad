# Caso 02: gabarito econômico, rascunho v0.2 para revisão independente

Status: **rascunho v0.2**, ainda sem revisão. A v0.2 acrescenta a comparação de alternativas (seção 6) calculada pelos executores `estimate-exit-cost-by-series` v2 e `compare-refinancing-before-after` v2 (`pnpm --filter @offroad/evals gc02:alternatives`). Caso `gc02-cfo-camil-conselho` (definição congelada em
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
   contratual fecha, ano a ano, com os totais da nota 15; a dívida de abertura é o ledger do Caso
   01, série a série. Toda tabela numérica das seções 3 a 6 é impressa pelo mesmo script, que
   chama o `financial-core` (`buildIndexedDebtSchedule`, `aggregateIndexedDebtSchedules`,
   `calculateLiquidityCoverage`); nada foi calculado à mão.

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
| `01_Orcamento_2026_2027.xlsx` | 18.258 | `4a405d7a109316f4…` |
| `02_Plano_Capex.xlsx` | 16.856 | `64586544efb86491…` |
| `03_Politica_Caixa_Minimo.docx` | 1.624 | `238d4ab4df900835…` |
| `04_Cronograma_Contratual_Amortizacoes.xlsx` | 25.205 | `51c672f7a8a795b8…` |

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
com a atualização capitalizada e o cupom pago (variante base; o Caso 01 pede as duas).

## 3. Cronograma contratual por série

O cronograma gerencial é a única fonte da alocação por série; a nota 15 dá só os totais por ano.
Regra de construção: debênture no vencimento; quando um ano do ITR não comporta os vencimentos,
o excesso vira amortização parcial no ano anterior, declarada; linhas bancárias preenchem o resto
pro rata ao saldo. Os totais por ano são os do ITR por construção (o teste prova).

### Cronograma contratual por série (sintético, totais iguais ao ITR)

| Série | 2026/27 | 2027/28 | 2028/29 | 2029/30 | 2030/31 | after 2031 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Capital de giro, moeda nacional | 666.686 | 421.138 | 143.470 | 74.018 | 0 | 0 |
| Capital de giro, USD | 442.943 | 279.802 | 95.321 | 49.177 | 0 | 0 |
| Capital de giro, CLP | 27.672 | 17.480 | 5.955 | 3.072 | 0 | 0 |
| Capital de giro, PEN | 92.526 | 58.448 | 19.912 | 10.273 | 0 | 0 |
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
| Total | 1.229.828 | 776.868 | 1.228.475 | 694.497 | 994.544 | 809.198 |

Parciais: deb-15-2: 61.103 amortizados em 2030/31 (parcial, sintético); deb-15-1: 119.039 amortizados em 2029/30 (parcial, sintético).

### Serviço da dívida por ano safra (financial-core, cenário base)

| Ano safra | Principal | Juros caixa | IPCA capitalizado | Serviço caixa |
| --- | ---: | ---: | ---: | ---: |
| 2026/27 | 1.229.828 | 706.751 | 45.024 | 1.936.579 |
| 2027/28 | 776.868 | 570.315 | 45.426 | 1.347.183 |
| 2028/29 | 1.228.475 | 485.383 | 47.176 | 1.713.858 |
| 2029/30 | 694.497 | 312.482 | 49.738 | 1.006.979 |
| 2030/31 | 994.544 | 219.696 | 52.857 | 1.214.240 |
| after 2031 | 809.198 | 100.851 | 40.230 | 910.049 |

### CFADS e cobertura sem rolagem (financial-core)

| Ano safra | EBITDA | CFADS | Caixa inicial | Serviço | Cobertura | Caixa final | Déficit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 894.000 | 384.000 | 1.455.809 | 2.086.579 | 0.88 | -246.770 | 246.770 |
| 2027/28 | 911.880 | 617.080 | -246.770 | 1.498.983 | 0.25 | -1.128.673 | 1.128.673 |
| 2028/29 | 930.118 | 630.422 | -1.128.673 | 1.867.494 | -0.27 | -2.365.745 | 2.365.745 |
| 2029/30 | 948.720 | 644.030 | -2.365.745 | 1.162.487 | -1.48 | -2.884.202 | 2.884.202 |
| 2030/31 | 967.694 | 657.911 | -2.884.202 | 1.371.659 | -1.62 | -3.597.951 | 3.597.951 |
| after 2031 | 987.048 | 672.069 | -3.597.951 | 1.069.416 | -2.74 | -3.995.298 | 3.995.298 |

### Cobertura com rolagem integral do principal (financial-core)

| Ano safra | Serviço | Cobertura | Caixa final | Piso da política | Folga sobre o piso |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 2.086.579 | 1.47 | 983.058 | 900.000 | 83.058 |
| 2027/28 | 1.498.983 | 1.59 | 878.023 | 900.000 | -21.977 |
| 2028/29 | 1.867.494 | 1.47 | 869.426 | 900.000 | -30.574 |
| 2029/30 | 1.162.487 | 1.90 | 1.045.466 | 900.000 | 145.466 |
| 2030/31 | 1.371.659 | 1.97 | 1.326.261 | 900.000 | 426.261 |
| after 2031 | 1.069.416 | 2.63 | 1.738.112 | 900.000 | 838.112 |

### Trajetória de alavancagem com rolagem (dívida líquida sobre EBITDA)

| Ano safra | EBITDA | Dívida bruta | Caixa | Dívida líquida | Índice | Contra 4,00x | Contra 3,50x |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 894.000 | 5.715.211 | 983.058 | 4.732.153 | 5.29x | -1.29 | -1.79 |
| 2027/28 | 911.880 | 5.760.637 | 878.023 | 4.882.614 | 5.35x | -1.35 | -1.85 |
| 2028/29 | 930.118 | 5.807.814 | 869.426 | 4.938.388 | 5.31x | -1.31 | -1.81 |
| 2029/30 | 948.720 | 5.857.552 | 1.045.466 | 4.812.086 | 5.07x | -1.07 | -1.57 |
| 2030/31 | 967.694 | 5.910.409 | 1.326.261 | 4.584.148 | 4.74x | -0.74 | -1.24 |
| after 2031 | 987.048 | 5.950.639 | 1.738.112 | 4.212.527 | 4.27x | -0.27 | -0.77 |

## 6. Alternativas comparadas no mesmo modelo (executores do Caso 01)

Data de referência 04/09/2026 (data do pack); antes = ledger de 31/05/2026 com caixa e aplicações de 1.455.809; taxa média de 12,46% derivada do serviço base da seção 3; covenant `insufficient_evidence` e comparação condicionada, logo sem headroom; discriminador declarado: pico de amortização em valor.

### Custo de saída das séries DI e da 11ª (executor `estimate-exit-cost-by-series` v2, em 04/09/2026)

| Série | Mecanismo | Estado | Base | Prêmio | Total |
| --- | --- | --- | ---: | ---: | ---: |
| 11ª emissão, 1ª série | redemption_offer | base_priced_premium_open | 151.795 | n/a | n/a |
| 11ª emissão, 2ª série | redemption_offer | base_priced_premium_open | 505.984 | n/a | n/a |
| 13ª emissão, 1ª série | flat_premium_pro_rata | estimated | 306.038 | 2.696 | 308.734 |
| 14ª emissão, 1ª série | flat_premium_pro_rata | estimated | 438.918 | 4.884 | 443.802 |

### Antes e depois por alternativa (executor `compare-refinancing-before-after` v1)

Antes: dívida bruta 5.670.186, caixa 1.455.809, dívida líquida contratual 4.228.477, alavancagem 4.72x, pico 2027 com 1.229.828 (21.45% da dívida). Headroom não medido: headroom is not measured: covenant limit insufficient_evidence, comparability conditional; offer-11th: exit cost is not priced for deb-11-1, deb-11-2; the alternative cannot be compared.

| Alternativa | Estado | Custo de saída | Dívida bruta depois | Caixa depois | Dívida líquida contratual | Alavancagem | Pico depois | Participação do pico | Custo all-in da nova dívida |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Abater 300.000 das linhas bancárias de 2026/27 com caixa, ao par | compared | 0 | 5.370.186 | 1.455.809 | 3.928.477 | 4.39x | 2029: 1.228.475 | 22.61% | n/a |
| Alongar o pico de 2028/29: nova dívida de sete anos (CDI + 1,25%, dois de carência, SAC) retirando a 13ª 1ª série pelo prêmio da escritura | compared | 2.696 | 5.670.186 | 1.451.583 | 4.232.703 | 4.72x | 2027: 1.229.828 | 21.45% | 15.36% |
| Alongar os dois picos: nova dívida de sete anos retirando a 13ª 1ª série e a 14ª 1ª série pelo prêmio da escritura | compared | 7.580 | 5.670.186 | 1.444.504 | 4.239.782 | 4.73x | 2027: 1.229.828 | 21.45% | 15.38% |
| Retirar a 11ª emissão por oferta de resgate (prêmio a negociar) | blocked: exit cost is not priced for deb-11-1, deb-11-2; the alternative cannot be compared | | | | | | | | |
| Manter a estrutura e rolar as linhas bancárias | compared | 0 | 5.670.186 | 1.455.809 | 4.228.477 | 4.72x | 2027: 1.229.828 | 21.45% | n/a |

### Concentração por ano civil de término do ano safra, depois de cada alternativa

| Alternativa | 2027 | 2028 | 2029 | 2030 | 2031 | 2032+ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| cash-paydown | 929.828 | 776.868 | 1.228.475 | 694.497 | 994.544 | 809.198 |
| extend-di-2028 | 1.229.828 | 792.170 | 983.645 | 755.705 | 1.055.752 | 916.311 |
| extend-di-2028-and-2029 | 1.229.828 | 814.116 | 1.071.428 | 404.570 | 1.143.535 | 1.069.933 |
| status-quo | 1.229.828 | 776.868 | 1.228.475 | 694.497 | 994.544 | 809.198 |

### Ordenação pelo discriminador declarado (peak_amount)

Racional: o conselho pediu se a estrutura aguenta os próximos anos; o pico de amortização em valor é o que a rolagem integral precisa vencer, e o custo all-in é a segunda leitura.

| Posição | Alternativa | Valor | Motivo |
| --- | --- | ---: | --- |
| 1 | cash-paydown | 1.228.475 | best peak_amount |
| 2 | extend-di-2028 | 1.229.828 | ranks below by peak_amount |
| 3 | extend-di-2028-and-2029 | 1.229.828 | ranks below by peak_amount |
| 4 | status-quo | 1.229.828 | ranks below by peak_amount |

Fingerprints: exit 907ac6ee70942edf; before/after c8e2523fc33fe296.

## 7. Achados esperados do Caso 02 (além dos do Caso 01)

1. **Em que ano o serviço da dívida pressiona o caixa no cenário base:** em todos, sem rolagem;
   o CFADS de 2026/27 (384.000) cobre 0,88x do serviço caixa (2.086.579, juros de 706.751 mais
   principal de 1.229.828 mais arrendamentos e dividendos), e o caixa fica negativo já no
   primeiro ano. Com rolagem integral do principal, a cobertura fica entre 1,47x e 2,63x e o
   caixa final fura o piso da política em 2027/28 (21.977 abaixo) e 2028/29 (30.574 abaixo). A
   leitura para o conselho: a estrutura depende de rolagem integral, e mesmo assim o piso não se
   sustenta nos dois anos de pico sem redução de capex de crescimento, de dividendos ou de dívida.
   Tudo isso depende do plano gerencial sintético e deve ser marcado como tal.
2. **Qual covenant tem o menor headroom:** com rolagem e o EBITDA orçado, a dívida líquida sobre
   EBITDA fica em 5,29x em 2026/27 e só volta abaixo de 4,74x em 2030/31; contra 4,00x o headroom
   é negativo em todos os anos (de -1,35 a -0,27), e contra 3,50x pior. Como no Caso 01, nada
   disso é "rompido": a medição é anual, em fevereiro, com a definição contratual da companhia
   (EBITDA não aberto) e o degrau de 4,00x condicionado à quitação dos CRA. O achado é a
   dependência: sem desalavancagem (EBITDA acima do orçado, venda de ativos, capital) a trajetória
   não cruza 4,00x dentro do horizonte.
3. **Qual alternativa reduz o pico de amortização sem elevar o custo total além da tolerância:**
   depende do pico que o conselho olha, e o gabarito exige que o sistema diga isso em vez de
   escolher. Sobre o horizonte inteiro (seção 6), o pico em valor é o de 2026/27 (1.229.828,
   linhas bancárias que o cenário base assume roladas); só o abatimento com caixa o reduz, e por
   1.353 apenas, deslocando o pico para 2028/29. Sobre a parede de debêntures de 2028/29, alongar
   a 1ª série da 13ª (306.038) com dívida nova de sete anos a CDI + 1,25% baixa o ano de 1.228.475
   para 983.645 ao custo de saída de 2.696 (0,40% a.a. pro rata) e custo all-in de 15,36%; alongar
   também a 1ª série da 14ª baixa 2029/30 para 404.570 mas devolve 1.071.428 a 2028/29 pela
   amortização SAC da dívida maior. A retirada da 11ª fica bloqueada: a base precifica só a base da
   oferta, o prêmio é negociado. Nenhuma alternativa muda a alavancagem de partida (4,72x) além do
   custo de saída; o headroom não é medido porque o limite continua `insufficient_evidence` e a
   comparação, condicionada. Tolerância de custo: parâmetro `policy.structure.covenant_headroom`
   e `policy.capacity.minimum_headroom` em `draft`; o custo all-in de 15,36% contra a taxa média
   de 12,46% da dívida atual é o preço declarado do alongamento, não um veredito.

4. **Hedge e exposição por indexador** (participações do executor `build-debt-ledger` v4 sobre a
   dívida bruta antes dos custos de transação, 5.742.510): linhas bancárias com indexador não
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

Nenhuma ainda. Próxima: revisão independente por IA (Codex) deste rascunho e do gerador, com
recálculo independente das tabelas da seção 3 a partir dos arquivos sintéticos e das premissas de
mercado do pack.
