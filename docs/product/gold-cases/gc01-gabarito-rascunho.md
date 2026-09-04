# Caso 01: gabarito econômico, rascunho v0.1 para revisão do fundador

Status: **rascunho**. Extraído por leitura direta do ITR de 31 de maio de 2026 da Camil
(`packages/testing-fixtures/assets/camil/01_ITR_1T26_31mai2026.pdf`, 62 páginas; as páginas 1 a 5
são o release de resultados e as demais as demonstrações intermediárias). Nada aqui passou pelo
sistema. Só vira gabarito congelado depois da revisão linha a linha do fundador; até lá, nenhuma
execução do caso é medida contra ele.

Unidade: R$ mil, consolidado, exceto onde indicado. Âncora: página do PDF e nota explicativa.

## 1. Dívida por instrumento (nota 15, página 39)

| Instrumento | 31/05/2026 | 28/02/2026 |
| --- | --- | --- |
| Capital de giro, moeda nacional | 1.314.412 | 951.593 |
| Capital de giro, USD | 867.244 | 492.857 |
| Capital de giro, CLP | 54.180 | 43.397 |
| Capital de giro, PEN | 181.158 | 199.398 |
| Custo de transação (empréstimos) | (9.099) | (1.123) |
| **Empréstimos e financiamentos** | **2.407.895** | **1.686.122** |
| Debêntures 11ª emissão (17/11/2021), 1ª série | 151.795 | 157.626 |
| Debêntures 11ª emissão, 2ª série | 505.984 | 525.419 |
| Debêntures 13ª emissão (01/12/2023), 1ª série | 306.038 | 316.694 |
| Debêntures 13ª emissão, 2ª série | 282.357 | 279.335 |
| Debêntures 13ª emissão, 3ª série | 110.321 | 109.185 |
| Debêntures 14ª emissão (14/06/2024), 1ª série | 438.918 | 423.854 |
| Debêntures 14ª emissão, 2ª série | 204.059 | 195.876 |
| Debêntures 14ª emissão, 3ª série | 66.024 | 63.457 |
| Debêntures 15ª emissão (19/11/2025), 1ª série | 770.123 | 795.649 |
| Debêntures 15ª emissão, 2ª série | 408.703 | 420.902 |
| Debêntures 15ª emissão, 3ª série | 50.401 | 50.020 |
| Debêntures 15ª emissão, 4ª série | 30.793 | 30.591 |
| Custo de transação (debêntures) | (63.225) | (66.347) |
| **Debêntures, garantia quirografária** | **3.262.291** | **3.302.261** |
| **Dívida bruta** | **5.670.186** | **4.988.383** |
| Circulante | 1.229.828 | 1.074.636 |
| Não circulante | 4.440.358 | 3.913.747 |

Observação para a revisão: a nota não traz o indexador de cada série (CDI, IPCA) nem os spreads.
Isso vive nas escrituras e na DFP de fevereiro de 2026. Sem esse dado a chave de cobertura "IPCA
capitalizado versus pago" fica `insufficient_evidence` no regime público deste ITR, como o caso
prevê. A divisão de moeda dos empréstimos é explícita: 1.102.582 em moeda estrangeira (USD, CLP,
PEN), 45,8% dos empréstimos e 19,4% da dívida bruta.

## 2. Movimentação do trimestre (nota 15, página 40)

| Linha | Consolidado 1T26 |
| --- | --- |
| Saldo em 28/02/2026 | 4.988.383 |
| Captações | 2.046.140 |
| Juros e variações monetárias | 172.359 |
| Apropriação de custos | (4.741) |
| Amortização de principal | (1.285.146) |
| Amortização de juros | (229.611) |
| Variação cambial | 60 |
| Ajuste de conversão | (17.258) |
| Saldo em 31/05/2026 | 5.670.186 |

Achado esperado: em um trimestre a companhia captou 2,05 bilhões e amortizou 1,29 bilhão de
principal; a dívida bruta cresceu 681.803, ou 13,7%. É gestão ativa de passivo em curso, não uma
posição estática.

## 3. Cronograma de amortização (nota 15, página 40, ano safra junho a maio)

| Ano safra | 31/05/2026 | 28/02/2026 |
| --- | --- | --- |
| Jun/26 a Mai/27 | 1.229.828 | 1.074.636 |
| Jun/27 a Mai/28 | 776.868 | 712.945 |
| Jun/28 a Mai/29 | 1.228.475 | 886.187 |
| Jun/29 a Mai/30 | 694.497 | 586.660 |
| Jun/30 a Mai/31 | 994.544 | 989.147 |
| Após Jun/31 | 809.198 | 805.151 |
| Custo de debêntures | (63.224) | (66.343) |
| Total | 5.670.186 | 4.988.383 |

Achados esperados: dois picos de cerca de 1,23 bilhão, nos anos safra 2026/27 e 2028/29, e o
segundo cresceu 342.288 em um trimestre. O ano 2026/27 concentra 21,7% da dívida bruta.

## 4. Caixa, aplicações e derivativos (notas 3 e 25, páginas 20 e 51)

| Linha | 31/05/2026 | 28/02/2026 |
| --- | --- | --- |
| Disponibilidades | 349.791 | 171.272 |
| Aplicações financeiras (equivalentes de caixa, cerca de 102% do CDI) | 1.080.923 | 1.826.336 |
| **Caixa e equivalentes** | **1.430.714** | **1.997.608** |
| Aplicações financeiras (não equivalentes) | 25.095 | 25.095 |
| Derivativos, ativo | 235 | 0 |
| Derivativos, passivo | 14.335 | 16.184 |
| Passivo de arrendamento (fora da dívida bruta) | 276.768 | 282.563 |
| Dividendos a pagar (valor nominal 140.000 circulante e 255.000 não circulante) | 322.498 | 346.957 |

O caixa caiu 566.894 no trimestre enquanto a dívida bruta subiu 681.803.

## 5. Dívida líquida e covenant (nota 15, página 40; nota 25, página 51)

Definição contratual: empréstimos e financiamentos, mais instrumentos financeiros passivos, menos
instrumentos financeiros ativos, menos caixa e equivalentes, menos aplicações financeiras.

| Cálculo | Valor |
| --- | --- |
| Dívida bruta | 5.670.186 |
| mais derivativos passivos | 14.335 |
| menos derivativos ativos | (235) |
| menos caixa e equivalentes | (1.430.714) |
| menos aplicações financeiras | (25.095) |
| **Dívida líquida (definição contratual)** | **4.228.477** |
| Covenant | dívida líquida sobre EBITDA igual ou inferior a 4,0x, medido nas demonstrações anuais |
| Pro forma informado pela companhia em 31/05/2026 | **4,72x** (4,08x em 31/05/2025) |
| Situação | adimplente na medição de 28/02/2026; próxima medição em 28/02/2027 |
| EBITDA dos últimos doze meses implícito no pro forma | cerca de 895.900 (4.228.477 dividido por 4,72) |

Achado esperado de maior materialidade: o índice pro forma está 0,72x acima do limite contratual,
com a medição anual a oito meses. A conclusão não é "covenant rompido" (a medição é anual e a
companhia estava adimplente em fevereiro), e sim que a tese de refinanciamento ou de qualquer nova
dívida precisa partir do headroom negativo interino e do que a administração fará até fevereiro
de 2027. Quem afirmar rompimento erra; quem ignorar o 4,72x erra mais.

Para a revisão: o EBITDA implícito é derivado, não lido. O EBITDA de covenant pode ter ajustes
próprios; a companhia não abre o cálculo no ITR. O gold deve registrar o valor como derivação com
essa ressalva.

## 6. Resultado do trimestre (release, página 4; notas 19, 20 e 22, páginas 47 e 48)

| Linha | 1T26 (mar a mai/26) | 1T25 |
| --- | --- | --- |
| Receita bruta | 3.138.908 | 3.123.515 |
| Receita líquida | 2.667.975 | 2.687.327 |
| Custo das vendas e serviços | (2.016.179) | (2.081.243) |
| EBITDA (release) | 210.000 (margem 7,9%) | 233.000 aproximado (queda de 9,9%) |
| Depreciação e amortização | (56.600) | (52.666) |
| Amortização de direito de uso | (13.877) | (14.204) |
| Juros (despesa) | (170.548) | (157.417) |
| Juros sobre arrendamentos | (3.489) | (4.197) |
| Receitas financeiras | 61.845 | 61.436 |
| Derivativos | (6.179) | (3.970) |
| Variação cambial | (9.207) | 253 |
| Resultado financeiro | (141.971) | (118.362) |
| Resultado antes dos impostos | (2.450) | 47.877 |
| Lucro líquido (release) | 28.000 | 66.000 aproximado |

Cálculos determinísticos esperados sobre esses números: cobertura de juros do trimestre, EBITDA
sobre juros brutos, igual a 1,23x; EBITDA sobre resultado financeiro líquido, igual a 1,48x. O
lucro antes dos impostos é negativo e o lucro líquido é positivo por 30.421 de crédito de IR e
CSLL (nota 23), com alíquota efetiva de 1.241,67%: o resultado do trimestre depende do
reconhecimento fiscal, não da operação. Isso é um achado, não um número a copiar.

## 7. Outros fatos que mudam a leitura

| Fato | Âncora | Por que importa |
| --- | --- | --- |
| Contingências possíveis de 1.264.059, das quais 1.007.977 tributárias, sem provisão | nota 17b, página 44 | risco fora do balanço maior que o EBITDA anual implícito |
| Controladora garante as dívidas das controladas no exterior | nota 15, página 40 | garantia cruzada relevante para qualquer estrutura nova |
| Free float de 27,51%; Camil Investimentos com 51,43% | nota 18a, página 44 | governança e liquidez do papel |
| Dividendos de 395.000 nominais a pagar até 2027 | nota 18e, página 46 | uso de caixa comprometido que concorre com o serviço da dívida |
| Contas a receber com 335.679 em USD, 158.346 em CLP e 35.266 em PEN | nota 4, página 21 | exposição cambial parcialmente natural contra a dívida em moeda estrangeira |
| Estoques de 3.088.478, 41% acima de fevereiro | nota 5, página 21 | sazonalidade da safra pressiona capital de giro no trimestre |
| Volume consolidado subiu 17,9% e preço no Brasil caiu 3,5% no alto giro | release, página 2 | a margem depende de preço, não de volume |

## 8. O que a base pública não sustenta (estados de cobertura esperados)

| Chave | Estado | Motivo |
| --- | --- | --- |
| indexador e spread por série de debênture | insufficient_evidence | não constam do ITR; escrituras e DFP |
| IPCA capitalizado versus pago | insufficient_evidence | depende do item acima |
| custo de saída e prepayment das obrigações | insufficient_evidence | escrituras |
| EBITDA de covenant com ajustes | insufficient_evidence | a companhia não abre o cálculo |
| plano gerencial, orçamento e capex | deferred | importa, mas não está na base pública; a análise preliminar segue com cenários declarados |
| hedge cambial da dívida em USD, CLP e PEN | insufficient_evidence | a nota 25 traz só o valor justo dos derivativos, não a política |

## 9. Achados que o sistema deve trazer sem pergunta

1. Pro forma de alavancagem a 4,72x contra covenant de 4,0x, medição anual em fevereiro de 2027.
2. Dois picos de amortização de cerca de 1,23 bilhão em 2026/27 e 2028/29, o segundo crescendo.
3. Captação de 2,05 bilhões e amortização de 1,29 bilhão no mesmo trimestre: passivo em movimento.
4. Lucro do trimestre sustentado por crédito fiscal, com resultado antes de impostos negativo.
5. Contingências possíveis sem provisão maiores que o EBITDA anual implícito.
6. Um quinto da dívida bruta em moeda estrangeira, com receber em moeda que cobre só parte.

## 10. Mutações adversariais aplicáveis a este gabarito

Trocar a escala de uma tabela (milhares por milhões); afirmar "covenant rompido"; usar EBITDA
trimestral anualizado como EBITDA de covenant sem dizer; somar arrendamento à dívida bruta sem
declarar; tratar o pro forma da companhia como cálculo próprio.
