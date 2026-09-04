# Caso 01: gabarito econômico, rascunho v0.2 para revisão do fundador

Status: **rascunho**. Seções 1 a 10 extraídas por leitura direta do ITR de 31 de maio de 2026 da
Camil (`packages/testing-fixtures/assets/camil/01_ITR_1T26_31mai2026.pdf`, 62 páginas; as páginas
1 a 5 são o release de resultados e as demais as demonstrações intermediárias). A seção 11 vem do
source pack público congelado em 4 de setembro de 2026
(`packages/testing-fixtures/assets/camil/source-pack/`), lido documento a documento. Nada aqui
passou pelo sistema. Só vira gabarito congelado depois da revisão linha a linha do fundador; até
lá, nenhuma execução do caso é medida contra ele.

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
| indexador e spread por série de debênture | covered | não constam do ITR, mas os relatórios anuais do agente fiduciário arquivados na CVM (source pack, seção 11) trazem série a série |
| IPCA capitalizado versus pago | covered ou insufficient_evidence | as séries IPCA e seus saldos são conhecidos (seção 11); o ITR não separa a atualização monetária capitalizada da paga |
| custo de saída e prepayment das obrigações | covered ou insufficient_evidence | os relatórios do agente fiduciário trazem as regras de resgate antecipado por série; o prêmio depende de cada escritura |
| EBITDA de covenant com ajustes | insufficient_evidence | a companhia não abre o cálculo; os relatórios do agente fiduciário trazem só o índice apurado (seção 11) |
| plano gerencial, orçamento e capex | deferred | importa, mas não está na base pública; a análise preliminar segue com cenários declarados |
| hedge cambial da dívida em USD, CLP e PEN | insufficient_evidence | a nota 25 traz só o valor justo dos derivativos, não a política |

## 9. Achados que o sistema deve trazer sem pergunta

1. Pro forma de alavancagem a 4,72x contra covenant de 4,0x, medição anual em fevereiro de 2027.
2. Dois picos de amortização de cerca de 1,23 bilhão em 2026/27 e 2028/29, o segundo crescendo.
3. Captação de 2,05 bilhões e amortização de 1,29 bilhão no mesmo trimestre: passivo em movimento.
4. Lucro do trimestre sustentado por crédito fiscal, com resultado antes de impostos negativo.
5. Contingências possíveis sem provisão maiores que o EBITDA anual implícito.
6. Um quinto da dívida bruta em moeda estrangeira, com receber em moeda que cobre só parte.
7. O covenant relevante não é um só: a 13ª e a 14ª emissões limitam dívida líquida sobre EBITDA
   a 3,5x, mais apertado que os 4,0x da 11ª e do ITR (seção 11).
8. A companhia contratou, em maio de 2026, R$ 251 milhões em notas comerciais de 4 anos e até
   R$ 535 milhões em CPR de até 3 anos: parte da captação de 2,05 bilhões do trimestre tem nome,
   prazo e credor (seção 11).

## 10. Mutações adversariais aplicáveis a este gabarito

Trocar a escala de uma tabela (milhares por milhões); afirmar "covenant rompido"; usar EBITDA
trimestral anualizado como EBITDA de covenant sem dizer; somar arrendamento à dívida bruta sem
declarar; tratar o pro forma da companhia como cálculo próprio.

## 11. O que o source pack público acrescenta (congelado em 04/09/2026)

Fontes: relatórios anuais do agente fiduciário (exercício 2025) das 11ª, 13ª, 14ª e 15ª emissões,
atas do conselho de 27/05/2026 e 14/07/2026, release e apresentação 1T26 arquivados na CVM em
14/07/2026, calendário de eventos v2, índice IPE 2026, curva ANBIMA e séries do Banco Central.
Cada item tem URL, hash e licença em `source-pack.json`.

### 11.1 Termos por série (relatórios do agente fiduciário)

| Emissão e série | Vencimento | Remuneração vigente | Observação |
| --- | --- | --- | --- |
| 11ª, 1ª e 2ª séries | 30/10/2028 | 100% do CDI + 1,55% a.a. | debênture verde; R$ 150 milhões emitidos em novembro de 2021; covenant ≤ 4,0x, apurado 3,240 no exercício 2025/2026 |
| 13ª, 1ª série | 16/11/2028 | 100% da Taxa DI + 0,65% a.a. | lastro da 292ª emissão de CRA |
| 13ª, 2ª série | 18/11/2030 | IPCA + 6,3416% a.a. | lastro de CRA |
| 13ª, 3ª série | 16/11/2033 | IPCA + 6,5264% a.a. | lastro de CRA |
| 14ª, 1ª série | 15/06/2029 | 104% da Taxa DI | lastro da 329ª emissão de CRA |
| 14ª, 2ª série | 16/06/2031 | IPCA + 6,8286% a.a. | lastro de CRA |
| 14ª, 3ª série | 15/06/2034 | IPCA + 6,9982% a.a. | lastro de CRA |
| 15ª, 1ª série | 18/11/2030 | 105% da Taxa DI | lastro da 389ª emissão de CRA |
| 15ª, 2ª série | 16/11/2032 | prefixada 14,15% a.a. | lastro de CRA |
| 15ª, 3ª série | 16/11/2032 | IPCA + 8,20% a.a. | lastro de CRA (CRA02500ACB) |
| 15ª, 4ª série | 16/11/2035 | IPCA + 8,70% a.a. | lastro de CRA |

Leitura esperada: as debêntures da 13ª, 14ª e 15ª emissões são o lastro de CRA distribuídos no
mercado; o credor econômico é o investidor do CRA, e a securitizadora é a titular formal. Isso
muda quem se negocia em qualquer reperfilamento e explica a nota "garantia quirografária" do ITR.
As séries em IPCA somam sete; com os saldos por série do ITR (seção 1) o sistema deve conseguir
separar o estoque indexado a IPCA do estoque em CDI e prefixado.

### 11.2 Covenants: dois limites, não um

| Instrumento | Limite | Apuração mais recente informada | Fonte |
| --- | --- | --- | --- |
| 11ª emissão | dívida líquida sobre EBITDA ≤ 4,0x | 3,240 (exercício 2025/2026) | relatório do agente fiduciário |
| 13ª e 14ª emissões | dívida líquida sobre EBITDA ≤ 3,5x | 2,97 (fevereiro de 2025) | relatórios do agente fiduciário |
| 15ª emissão | não informado no relatório (N/A) | | relatório do agente fiduciário |
| ITR 1T26, nota 15 | ≤ 4,0x, medição anual | pro forma 4,72x em 31/05/2026 | ITR |

Achado esperado: com pro forma de 4,72x, o headroom negativo interino é maior contra o limite de
3,5x da 13ª e da 14ª emissões do que contra os 4,0x citados no ITR. Qualquer tese de refinanciamento
tem de tratar os dois limites e a medição anual de fevereiro de 2027. O gabarito registra a
apuração de 2,97 como de fevereiro de 2025 (o relatório do exercício 2025 mostra as medições
trimestrais seguintes como N/A); o valor de fevereiro de 2026 para esses instrumentos não está no
pack e fica `insufficient_evidence`.

### 11.3 Captações nomeadas no trimestre (atas do conselho de 27/05/2026)

| Instrumento | Valor | Prazo | Contraparte |
| --- | --- | --- | --- |
| 1ª emissão de notas comerciais escriturais, série única, colocação privada | R$ 251.000.000 (251.000 notas de R$ 1.000) | 4 anos da data de emissão | Bank of China (Brasil) |
| Operação estruturada com CPR (Cédula de Produto Rural) | até R$ 535.000.000 | até 3 anos, amortizações anuais | contrato de abertura de crédito |

Leitura esperada: as duas operações somam até R$ 786 milhões e caem nos anos safra 2027/28 a
2029/30 do cronograma da seção 3; o release não as nomeia. O sistema deve ligar a "captação de
2.046.140" da nota 15 a instrumentos com nome quando a fonte pública permite.

### 11.4 Release e apresentação 1T26 (arquivados na CVM em 14/07/2026)

| Fato | Valor | Diferença para o ITR |
| --- | --- | --- |
| Dívida líquida, definição do release | 4.214,4 milhões | 5.670,2 menos caixa e aplicações de 1.455,8; sem derivativos. O ITR, pela definição contratual, dá 4.228,5 (seção 5) |
| Dívida líquida sobre EBITDA UDM | 4,7x (4,1x no 1T25; 3,2x no 4T25) | coerente com o pro forma de 4,72x da nota 15 |
| Capex do trimestre | R$ 77,5 milhões (queda de 35,3% em um ano) | obras de Cambaí (RS), nova planta de grãos e termoelétrica, concluídas no 4T25 |
| Caixa e equivalentes | 1.430,7 milhões | igual à nota 3 |
| Debêntures | 3.262,3 milhões | igual à nota 15 |

Achado esperado: existem duas dívidas líquidas com nomes iguais e definições diferentes (release
e covenant); o sistema deve usar a contratual para covenant e dizer qual está usando.

### 11.5 Outros fatos do pack

- Nenhum Fato Relevante arquivado pela Camil em 2026 até 04/09/2026 (índice IPE). A ausência é um
  dado: eventos de 2026 aparecem como atas, comunicados e relatórios, não como fato relevante.
- Calendário v2: a divulgação do ITR do 1º trimestre foi adiada de 07/07 para 14/07/2026, e a
  apresentação pública de 08/07 para 15/07/2026.
- Ata de 14/07/2026: nova diretoria e reestruturação dos comitês do conselho, com a criação do
  Comitê de Finanças, Investimentos, Riscos e Estratégia. A ata contém RG e CPF de
  administradores; nenhuma saída pode reproduzir esses dados.
- Curva ANBIMA em 04/09/2026: prefixada a 13,43% em 252 dias úteis e 14,04% em 756; IPCA real a
  6,96% em 252 e 7,92% em 756; inflação implícita de 6,05% em um ano. CDI diário de 0,05166% em
  1 a 3 de setembro de 2026; meta Selic de 14,00% (Banco Central, SGS 12 e 432).
- Índices ITR e IPE da CVM: a Camil tem código CVM 024228 e CNPJ 64.904.295/0001-03; o ITR 1T26
  foi recebido pela CVM em 14/07/2026, versão 1.

### 11.6 Mutações adversariais adicionais

Citar 4,0x como único covenant; tratar a dívida líquida do release como a contratual; somar as
notas comerciais e a CPR à dívida bruta de 31/05/2026 sem verificar se já estão nas captações do
trimestre; chamar a securitizadora de credor econômico; citar a curva de 04/09/2026 como se fosse
a curva da data-base do ITR.
