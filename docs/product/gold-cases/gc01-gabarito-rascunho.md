# Caso 01: gabarito econômico, rascunho v0.5 para revisão independente

Status: **rascunho v0.5**. A v0.4 acrescentou a seção 13, lida nas escrituras arquivadas na CVM, que resolve o covenant e descreve o custo de saída por família de série; a v0.5 fecha as taxas de referência do make-whole e registra onde os termos de securitização dos CRA não estão. A v0.2 passou pela auditoria número a número do fundador em 4 de
setembro de 2026; os números principais conferiram e onze correções materiais foram incorporadas
aqui (seção 12 lista cada uma). A próxima revisão deve ser independente, não do fundador. Seções
1 a 10 extraídas por leitura direta do ITR de 31 de maio de 2026 da
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
| Dividendos a pagar, valor nominal (nota 18: 140.000 circulante e 255.000 não circulante) | 395.000 | 420.000 |
| Dividendos a pagar, valor presente no balanço (nota 18: nominal menos ajuste de 6.911 e 49.524) | 338.565 | 346.957 |
| Dividendos a pagar segundo a nota 25 (valor contábil e valor justo) | 322.498 e 420.000 | 346.957 e 420.000 |

O caixa caiu 566.894 no trimestre enquanto a dívida bruta subiu 681.803.

Divergência aberta sobre dividendos: a nota 18 e o balanço dão 395.000 nominais e 338.565 a valor
presente; a nota 25 dá 322.498 de valor contábil e 420.000 de valor justo, acima do nominal. Os
três valores não fecham entre si e o ITR não explica a diferença. O sistema deve carregar a
divergência como tal, com as três âncoras, e nunca escolher um valor em silêncio.

Caixa e equivalentes não é liquidez em D0: a nota 3 define equivalentes como aplicações
resgatáveis em até 90 dias. O valor serve à definição contábil e à contratual de dívida líquida,
não a uma conclusão de disponibilidade operacional imediata.

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

Cálculos determinísticos esperados sobre esses números, como proxies simples e declarados
como tal: EBITDA do trimestre sobre juros brutos, 1,23x; EBITDA sobre resultado financeiro
líquido, 1,48x. Nenhum dos dois é a cobertura de juros contratual, a cobertura de juros caixa nem
o DSCR, que dependem de definição, período e fluxo de caixa disponível; o sistema deve nomear o
proxy e não o promover a indicador contratual. O
lucro antes dos impostos é negativo e o lucro líquido é positivo por 30.421 de crédito de IR e
CSLL (nota 23), com alíquota efetiva de 1.241,67%: o resultado do trimestre depende do
reconhecimento fiscal, não da operação. Isso é um achado, não um número a copiar.

## 7. Outros fatos que mudam a leitura

| Fato | Âncora | Por que importa |
| --- | --- | --- |
| Contingências possíveis de 1.264.059, das quais 1.007.977 tributárias, sem provisão | nota 17b, página 44 | alerta de dimensão: perdas classificadas como possíveis, não provisionadas; a comparação com o EBITDA anual implícito situa a ordem de grandeza e não equivale a dívida provável |
| Controladora garante as dívidas das controladas no exterior | nota 15, página 40 | garantia cruzada relevante para qualquer estrutura nova |
| Free float de 27,51%; Camil Investimentos com 51,43% | nota 18a, página 44 | governança e liquidez do papel |
| Dividendos de 395.000 nominais a pagar até 2027 | nota 18e, página 46 | uso de caixa comprometido que concorre com o serviço da dívida |
| Contas a receber com 335.679 em USD, 158.346 em CLP e 35.266 em PEN | nota 4, página 21 | potencial offset da dívida em moeda estrangeira; não prova hedge natural, porque faltam entidade, moeda, prazo, disponibilidade e correlação dos fluxos |
| Estoques de 3.088.478 na nota 5, incluindo 643.241 de adiantamentos a fornecedores; 2.445.237 sem os adiantamentos, que é o valor do release (2.445,2 milhões) | nota 5, página 21; release, tabela de capital de giro | duas definições de estoque que fecham entre si e precisam ser conciliadas explicitamente; a sazonalidade da safra pressiona o capital de giro no trimestre |
| Volume consolidado subiu 17,9% e preço no Brasil caiu 3,5% no alto giro | release, página 2 | a margem depende de preço, não de volume |

## 8. O que a base pública não sustenta (estados de cobertura esperados)

| Chave | Estado | Motivo |
| --- | --- | --- |
| indexador e spread por série de debênture | covered | não constam do ITR, mas os relatórios anuais do agente fiduciário arquivados na CVM (source pack, seção 11) trazem série a série |
| IPCA capitalizado versus pago | covered ou insufficient_evidence | as séries IPCA e seus saldos são conhecidos (seção 11); o ITR não separa a atualização monetária capitalizada da paga |
| custo de saída e prepayment das obrigações | covered para a estrutura por família de série (seção 13); insufficient_evidence para a taxa de desconto do make-whole das séries IPCA e prefixada, ainda não extraída | escrituras da 11ª, 13ª, 14ª e 15ª emissões no pack |
| EBITDA de covenant com ajustes | covered quanto à definição (seção 13: EBIT mais depreciação e amortização dos últimos doze meses, conforme reportado, com pro forma de aquisições); insufficient_evidence quanto ao valor apurado pela companhia | escrituras; a companhia não abre o cálculo no ITR |
| plano gerencial, orçamento e capex | deferred | importa, mas não está na base pública; a análise preliminar segue com cenários declarados |
| hedge cambial da dívida em USD, CLP e PEN | insufficient_evidence | a nota 25 traz só o valor justo dos derivativos, não a política |

## 9. Achados que o sistema deve trazer sem pergunta

1. Pro forma de alavancagem a 4,72x contra covenant de 4,0x, medição anual em fevereiro de 2027.
2. Dois picos de amortização de cerca de 1,23 bilhão em 2026/27 e 2028/29, o segundo crescendo.
3. Captação de 2,05 bilhões e amortização de 1,29 bilhão no mesmo trimestre: passivo em movimento.
4. Lucro do trimestre sustentado por crédito fiscal, com resultado antes de impostos negativo.
5. Contingências possíveis sem provisão maiores que o EBITDA anual implícito.
6. Um quinto da dívida bruta em moeda estrangeira, com recebíveis em moeda que representam um
   potencial offset, não um hedge demonstrado.
7. O covenant tem dois degraus com a mesma definição em todas as escrituras: 3,50x enquanto
   viviam os CRA antigos da Eco Securitizadora (vencidos em 2025) e 4,00x no exercício
   encerrado depois da quitação deles. O limite aplicável às medições de fevereiro de 2026 e
   fevereiro de 2027 é 4,00x, condicionado à quitação ordinária desses CRA; o sistema deve ler
   isso nas escrituras, não nos relatórios fiduciários de 2025 (seção 13).
8. O conselho aprovou, em 27 de maio de 2026, R$ 251 milhões em notas comerciais de 4 anos e até
   R$ 535 milhões em CPR de até 3 anos. Aprovação não é desembolso: o sistema deve registrar as
   operações como autorizadas, com data, valor e prazo aprovados, e marcar emissão, valor
   efetivamente captado e inclusão na posição de 31/05 como não demonstrados (seção 11).

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
As séries indexadas ao IPCA são seis (13ª 2ª e 3ª, 14ª 2ª e 3ª, 15ª 3ª e 4ª); com os saldos por
série do ITR (seção 1) elas somam 743.955, ou 13,1% da dívida bruta. O restante das debêntures
está em CDI ou prefixado; o sistema deve separar os três estoques.

### 11.2 Covenants: dois limites, não um

| Instrumento | Limite | Apuração mais recente informada | Fonte |
| --- | --- | --- | --- |
| 11ª emissão | dívida líquida sobre EBITDA ≤ 4,0x | 3,240 (exercício 2025/2026) | relatório do agente fiduciário |
| 13ª e 14ª emissões | dívida líquida sobre EBITDA ≤ 3,5x | 2,97 (fevereiro de 2025) | relatórios do agente fiduciário |
| 15ª emissão | não informado no relatório (N/A) | | relatório do agente fiduciário |
| ITR 1T26, nota 15 | ≤ 4,0x, medição anual | pro forma 4,72x em 31/05/2026 | ITR |

Achado esperado: existem limites contratuais distintos (4,0x e 3,5x) sobre um índice com o
mesmo nome. Os relatórios do agente fiduciário não provam que definição, perímetro, ajustes e
data de cálculo desses limites sejam idênticos aos do pro forma de 4,72x do ITR; por isso
"headroom negativo contra 3,5x" não está demonstrado e não deve ser afirmado. A conclusão correta
é que a tese de refinanciamento precisa reconciliar cada limite com a respectiva escritura antes
de qualquer comparação, e que a medição anual de fevereiro de 2027 é a data que importa. O
gabarito registra a apuração de 2,97 como de fevereiro de 2025 (o relatório do exercício 2025
mostra as medições trimestrais seguintes como N/A); o valor de fevereiro de 2026 para esses
instrumentos não está no pack e fica `insufficient_evidence`.

### 11.3 Captações nomeadas no trimestre (atas do conselho de 27/05/2026)

| Instrumento | Valor | Prazo | Contraparte |
| --- | --- | --- | --- |
| 1ª emissão de notas comerciais escriturais, série única, colocação privada | R$ 251.000.000 (251.000 notas de R$ 1.000) | 4 anos da data de emissão | Bank of China (Brasil) |
| Operação estruturada com CPR (Cédula de Produto Rural) | até R$ 535.000.000 | até 3 anos, amortizações anuais | contrato de abertura de crédito |

Leitura esperada: as atas provam autorização, com valor, prazo e contraparte, e nada além
disso. Não provam data de emissão, valor efetivamente captado nem inclusão na posição de 31/05;
por isso o sistema não pode dizer que parte da captação de 2.046.140 da nota 15 "tem nome" sem
conciliar contrato, desembolso e razão, e não pode alocar até R$ 786 milhões nos anos safra do
cronograma da seção 3 a partir de uma autorização de conselho. O estado correto é: operações
autorizadas, desembolso e amortização `insufficient_evidence` até que contrato ou demonstração
posterior os demonstrem.

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

Citar 4,0x como único covenant; comparar 4,72x a 3,5x como se fossem a mesma definição; tratar
a dívida líquida do release como a contratual; somar as notas comerciais e a CPR à dívida bruta de
31/05/2026 ou alocá-las no cronograma sem prova de desembolso; chamar a securitizadora de credor
econômico; citar a curva de 04/09/2026 como se fosse a curva da data-base do ITR; escolher um dos
três valores de dividendos sem carregar a divergência; chamar os recebíveis em moeda de hedge;
promover 1,23x a cobertura de juros contratual; tratar contingências possíveis como dívida.

## 12. Correções da auditoria do fundador (4 de setembro de 2026), incorporadas nesta v0.3

| # | Correção | Onde entrou |
| --- | --- | --- |
| 1 | Seis séries indexadas ao IPCA, não sete; saldo de 743.955, 13,1% da dívida bruta | seção 11.1 |
| 2 | Dividendos com divergência interna (395.000 nominal e 338.565 a valor presente na nota 18 e no balanço; 322.498 contábil e 420.000 valor justo na nota 25); a divergência fica aberta | seção 4 |
| 3 | 4,72x não se compara automaticamente ao limite de 3,5x; limites distintos a reconciliar com as escrituras | seções 9 e 11.2 |
| 4 | Regras e custos de pré-pagamento não cobertos pelos relatórios fiduciários; escrituras e aditivos entram no pack | seção 8 |
| 5 | Notas comerciais e CPR aprovadas, não demonstradas desembolsadas nem incluídas na posição de 31/05 | seções 9 e 11.3 |
| 6 | Amortizações futuras dessas operações não alocáveis ao cronograma a partir da autorização | seção 11.3 |
| 7 | Recebíveis em moeda estrangeira são potencial offset, não hedge natural | seções 7 e 9 |
| 8 | 1,23x e 1,48x são proxies simples, não cobertura contratual, caixa ou DSCR | seção 6 |
| 9 | Duas definições de estoque (3.088.478 com adiantamentos; 2.445.237 sem, igual ao release) conciliadas explicitamente | seção 7 |
| 10 | Caixa equivalente não é liquidez em D0 (resgate em até 90 dias, nota 3) | seção 4 |
| 11 | Contingências maiores que o EBITDA são alerta de dimensão, não dívida provável | seção 7 |

Pendências que impedem o congelamento: os termos de securitização dos CRA (292ª, 329ª e 389ª
emissões da Eco Securitizadora) não estão no índice IPE da CVM, onde a securitizadora só arquiva
relatórios de rating; vivem na B3 ou no site da securitizadora e ainda não foram congelados. A
comprovação da quitação ordinária dos CRA de referência do covenant (5ª, 8ª e 257ª emissões da
Eco) também não foi localizada. Revisão independente ainda não feita.

## 13. O que as escrituras resolvem (lidas em 4 de setembro de 2026, pack v2)

Fontes: escrituras da 11ª (27/10/2021, com aditamento de 18/11/2021), 13ª (08/11/2023), 14ª
(03/06/2024) e 15ª (15/10/2025) emissões, arquivadas na CVM na categoria "Escrituras e
aditamentos de debêntures", agora no source pack com hash.

### 13.1 Covenant: uma definição, dois degraus

| Elemento | Texto das escrituras (11ª, cláusula 4.22; 13ª, 7.24; 15ª, 7.26) |
| --- | --- |
| Índice | Dívida Líquida sobre EBITDA, apurado e revisado anualmente com base nas demonstrações consolidadas auditadas do exercício encerrado em fevereiro, mais informações complementares da emissora |
| Dívida Líquida | empréstimos, financiamentos e debêntures (circulante e não circulante) mais derivativos passivos e qualquer outra dívida onerosa, menos caixa e equivalentes, aplicações financeiras (circulante e não circulante) e derivativos ativos, pelo balanço consolidado |
| EBITDA | lucro antes das receitas e despesas financeiras mais depreciação e amortização dos últimos doze meses, conforme reportado; aquisições nos doze meses anteriores entram pro forma, com o sellers finance |
| Degrau (a) | 3,50x até o vencimento ou a liquidação integral dos CRA da Eco Securitizadora tomados como referência (8ª emissão, 15/04/2025, na 11ª; 5ª emissão, 16/04/2025, e 257ª emissão, 29/12/2025, na 13ª; 257ª emissão na 15ª) |
| Degrau (b) | 4,00x no exercício social encerrado após a quitação integral desses CRA, salvo se a liquidação decorrer de vencimento antecipado, caso em que 3,50x permanece |

Leitura: a definição de dívida líquida é a mesma que a nota 15 do ITR usa (4.228.477 em
31/05/2026); os 3,50x dos relatórios fiduciários de 2025 eram o degrau (a), medido em fevereiro
de 2025 em 2,97x; o relatório da 11ª para 2025/2026 já aplica 4,00x (3,240 apurado). Com os CRA de
referência vencidos em abril e dezembro de 2025, o limite das medições de fevereiro de 2026 e
fevereiro de 2027 é 4,00x para as quatro emissões, condicionado à quitação ordinária desses CRA
(a escritura exige comunicação ao agente fiduciário em cinco dias úteis; a comprovação pública
fica `insufficient_evidence` até ser localizada). O pro forma de 4,72x compara-se, portanto, a
4,00x, com medição em 28/02/2027; a leitura da v0.1 volta a valer, agora ancorada na escritura e
não no ITR.

### 13.2 Custo de saída por família de série

| Família | Regra | Âncora |
| --- | --- | --- |
| Séries em Taxa DI (13ª 1ª, 14ª 1ª, 15ª 1ª) | amortização extraordinária ou resgate total facultativo, a partir de 14/05/2026 (13ª) e 15/06/2026 (14ª), pelo valor nominal mais remuneração pro rata mais prêmio de 0,40% ao ano, base 252, sobre os dias úteis restantes até o vencimento | 13ª 7.18.1; 14ª 7.18.1; 15ª 7.16.1.2 |
| Séries em IPCA (13ª 2ª e 3ª, 14ª 2ª e 3ª) | amortização extraordinária só a partir de 14/05/2027 e 15/05/2028 (13ª) e 15/06/2027 e 15/06/2028 (14ª); valor igual ao maior entre (A) valor nominal atualizado mais remuneração pro rata e (B) valor presente das parcelas remanescentes descontadas à taxa interna de retorno da NTN-B com duration mais próxima da duration remanescente, pela cotação indicativa da ANBIMA do segundo dia útil anterior; a diferença é o prêmio (make-whole) | 13ª 7.18.2 e 7.18.2.1; 14ª 7.18.2 |
| Série prefixada (15ª 2ª) | resgate total facultativo pelo maior entre (A) nominal mais remuneração pro rata e (B) valor presente das parcelas remanescentes descontadas à taxa DI de 252 dias úteis da curva Pré x DI da B3, no vértice de dias corridos mais próximo da duration remanescente, apurada no segundo dia útil anterior | 15ª 7.16.2.2 |
| 11ª emissão (CDI + 1,55%) | aquisição facultativa e oferta de resgate antecipado à totalidade, com prêmio fixado no edital, que não pode ser negativo; adesão em no mínimo quinze dias | 11ª 4.13 e 4.14 |

Leitura: trocar as séries em DI custa pouco a partir de 2026 (prêmio de 0,40% ao ano sobre o
prazo remanescente); trocar as séries em IPCA antes de 2027 e 2028 não é permitido e, depois,
custa o make-whole; a 11ª só sai por oferta com prêmio negociado. Isso define o desenho de
qualquer refinanciamento: o degrau de 2028/29 é majoritariamente DI e prefixado, e é onde a saída
é barata.

### 13.3 Estados de cobertura que mudam com o pack v2

| Chave | Antes | Agora |
| --- | --- | --- |
| covenants e headroom | limites distintos a reconciliar | covered: uma definição, dois degraus, 4,00x aplicável, comprovação da quitação dos CRA de referência `insufficient_evidence` |
| custo de saída e prepayment | insufficient_evidence | covered por família e por taxa de referência (NTN-B pela ANBIMA para IPCA; curva Pré x DI da B3 para a prefixada; 0,40% ao ano para DI); o cálculo do prêmio em uma data exige a cotação daquele dia |
| EBITDA de covenant | insufficient_evidence | definição covered; valor apurado pela companhia `insufficient_evidence` |

### 13.4 Mutações adversariais adicionais

Aplicar 3,50x a fevereiro de 2027 sem ler o degrau; aplicar 4,00x sem condicionar à quitação dos
CRA de referência; tratar o prêmio de 0,40% ao ano como prêmio flat; supor resgate das séries IPCA
antes das datas de carência; usar a dívida líquida do release no covenant.
