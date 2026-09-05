# Caso 05: gabarito econômico, rascunho v0.1 para revisão independente

Status: **rascunho v0.1**, ainda sem revisão. Caso `gc05-banker-expansao-camil` (definição congelada
em `05-banker-expansao-camil.md`): três turnos, a mesma Camil dos casos 01 e 02. Identidade
econômica: todo fato público é o do gabarito 01 v0.8 (por referência, como no caso 02), e a
projeção é a mesma do gabarito 02 (`packages/testing-fixtures/src/camil-management/projection.ts`,
usada pelos dois casos: uma diferença de valor entre eles bloqueia). Toda tabela da seção 3 é
impressa por `pnpm --filter @offroad/evals gc05:tables` pelo `financial-core` e pelos executores
do Caso 01; nada foi calculado à mão.

Unidade: R$ mil, ano safra de junho a maio. Data-base 31/05/2026 (ITR) e 04/09/2026 (pack).

## 1. O que é público e o que não é

- Público: a dívida, o cronograma, o covenant, o custo de saída e o resultado do trimestre
  (gabarito 01); as adições ao imobilizado e intangível de dois exercícios na DFP (463.433 e
  334.939) e a frase do release 1T26 de que o capex voltou a níveis de manutenção após as obras
  de Cambaí; as curvas do pack (CDI, Selic, ETTJ).
- Não público: tamanho e cronograma de qualquer expansão (não há fato relevante, release ou
  apresentação com um projeto novo no pack), o orçamento, o capex planejado, o EBITDA de covenant
  aberto. O pack não tem benchmark setorial de expansão.
- Consequência, pela regra do caso: cenário baixo derivado da DFP; cenário médio derivado do
  teto contratual (o pack setorial `sector.food-consumer-staples.br-v1` não traz teto de
  alavancagem, então o teto é o das escrituras); cenário alto não criado. O output do turno 1 deve
  dizer: "na ausência do orçamento da expansão, usei estes intervalos apenas para testar
  capacidade; eles não representam estimativa da administração".

## 2. Turnos congelados

| Turno | Texto | O que o gold espera |
| --- | --- | --- |
| 1 | o do caso (banker pensando na expansão) | pesquisa pública, cenários derivados, funding need, capacidade, alternativas, custo de saída, riscos, o que mudaria o ranking |
| 2 | "Gostei das ideias, principalmente X. Vamos preparar o material para a reunião." | X = alongar a parede de 2028/29 retirando a 1ª série da 13ª (a mais aderente); Y = alongar as duas paredes, mantida como comparação; plano de produção específico, uma única confirmação |
| 3 | "Ajusta o cenário para taxa X e prazo Y." | X = CDI + 1,00% (dentro do intervalo histórico das emissões da companhia: 0,65% a 1,55%); Y = 120 meses; só os nós dependentes recomputados |

## 3. Tabelas calculadas (saída de `gc05:tables`)

### Cenários de capex derivados (R$ mil por ano safra)

| Cenário | Valor | Derivação | Estado |
| --- | ---: | --- | --- |
| Baixo | 399.186 | média das adições ao imobilizado e intangível consolidadas dos dois exercícios da DFP (463.433 e 334.939; cvm_dfp_2025.txt, demonstração dos fluxos de caixa consolidada, linha 'Adições ao imobilizado e intangível') | criado |
| Médio | 0 | capacidade incremental de dívida no teto contratual de 4,00x (o pack setorial não traz teto): 4,00 × 895.864 menos 4.228.477 = -645.022, negativo; a 3,50x, -1.092.954 | criado com valor zero: não há capacidade incremental de dívida dentro do covenant |
| Alto | n/a | exige anúncio público de tamanho e cronograma ou benchmark setorial no pack; o release 1T26 registra a conclusão das obras de Cambaí e a normalização do capex a níveis de manutenção, e o pack não tem benchmark de expansão | não criado |

### Funding need por ano safra (déficit de caixa sem rolagem, financial-core)

| Ano safra | CFADS base | Déficit base | CFADS cenário baixo | Déficit cenário baixo | Déficit acumulado (baixo) | Com rolagem: caixa final (baixo) | Folga sobre o piso |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026/27 | 384.000 | 246.770 | 384.000 | 246.770 | 246.770 | 983.058 | 83.058 |
| 2027/28 | 617.080 | 1.128.673 | 401.494 | 1.097.489 | 1.344.259 | 662.437 | -237.563 |
| 2028/29 | 630.422 | 2.365.745 | 418.508 | 1.448.987 | 2.793.245 | 441.926 | -458.074 |
| 2029/30 | 644.030 | 2.884.202 | 435.861 | 726.626 | 3.519.871 | 409.797 | -490.203 |
| 2030/31 | 657.911 | 3.597.951 | 453.562 | 918.096 | 4.437.967 | 486.245 | -413.755 |
| after 2031 | 672.069 | 3.995.298 | 471.617 | 597.799 | 5.035.766 | 697.644 | -202.356 |

Pico do funding need incremental (cenário baixo, sem rolagem): 2028/29 com 1.448.987. A sazonalidade do orçamento sintético (compra de safra no segundo e terceiro trimestres) concentra a necessidade de caixa entre junho e novembro; a alternativa que evita pedir caixa nesse pior trimestre é a que desembolsa antes de junho ou financia o estoque (linha de safra), não a que vence em novembro.

Alavancagem com rolagem e capex do cenário baixo: 2026/27 5.29x; 2027/28 5.59x; 2028/29 5.77x; 2029/30 5.74x; 2030/31 5.61x; after 2031 5.32x. Nenhum ano cruza 4,00x para baixo dentro do horizonte.

### Alternativas no mesmo modelo, turno 1 (CDI + 1,25%, 84 meses) e turno 3 (CDI + 1,00%, 120 meses)

| Alternativa | Turno 1 | Turno 3 |
| --- | --- | --- |
| status-quo | custo de saída 0; pico 2027 1.229.828; all-in n/a; 2029 1.228.475; 2030 694.497 | custo de saída 0; pico 2027 1.229.828; all-in n/a; 2029 1.228.475; 2030 694.497 |
| x-extend-di-2028 | custo de saída 2.696; pico 2027 1.229.828; all-in 15.36%; 2029 983.645; 2030 755.705 | custo de saída 2.696; pico 2027 1.229.828; all-in 15.05%; 2029 960.692; 2030 732.752 |
| y-extend-both | custo de saída 7.580; pico 2027 1.229.828; all-in 15.38%; 2029 1.071.428; 2030 404.570 | custo de saída 7.580; pico 2032+ 1.251.516; all-in 15.06%; 2029 1.015.556; 2030 348.698 |
| offer-11th | blocked: exit cost is not priced for deb-11; the alternative cannot be compared | blocked: exit cost is not priced for deb-11; the alternative cannot be compared |

Ranking turno 1: status-quo (1.229.828) > x-extend-di-2028 (1.229.828) > y-extend-both (1.229.828). Ranking turno 3: status-quo (1.229.828) > x-extend-di-2028 (1.229.828) > y-extend-both (1.251.516).

### Bridge do turno 3 (o que foi recomputado e o que não foi)

| Nó | Turno 1 | Turno 3 | Recomputado |
| --- | --- | --- | --- |
| ledger e cronograma (antes) | fingerprint do antes idêntico | idêntico | não |
| custo de saída por série | fcb964f20f2e | fcb964f20f2e | não |
| serviço da nova dívida de X | 197.349 de juros | 258.463 de juros | sim |
| all-in de X | 15.36% | 15.05% | sim |
| concentração depois de X | 2029 983.645 | 2029 960.692 | sim |
| ranking | status-quo > x-extend-di-2028 > y-extend-both | status-quo > x-extend-di-2028 > y-extend-both | recomputado, sem mudança de ordem |
| fingerprint do resultado | c840005cddc5 | d45b3df27755 | sim |

## 4. Achados esperados (os do Caso 01 mais os deste caso)

1. **O período em que o funding need atinge o pico:** 2028/29, com 1.448.987 de necessidade
   incremental no cenário baixo sem rolagem (a parede de debêntures da 11ª e da 13ª 1ª série
   somada ao capex médio histórico); com rolagem integral, o caixa fura o piso da política a
   partir de 2027/28 e fica abaixo dele até o fim do horizonte. A capacidade incremental de dívida
   dentro do covenant é zero em qualquer degrau: a expansão não cabe em dívida nova sem
   desalavancagem, venda de ativos ou capital, e o gold exige que isso seja dito antes de qualquer
   instrumento.
2. **A alternativa que evita pedir caixa no pior mês da sazonalidade:** a que desembolsa antes de
   junho ou financia o estoque de safra; uma emissão que vence em novembro (como as séries atuais)
   coincide com o pico de compra de safra do orçamento sintético. O gold marca isso como leitura,
   não como número: o orçamento é sintético.
3. **A obrigação cujo custo de saída muda o ranking:** a 11ª emissão. Ela é o maior bloco da parede
   de 2028/29 (657.779) e só sai por oferta com prêmio negociado e adesão integral; sem preço, a
   alternativa que a retira fica bloqueada e o ranking se decide entre alongar a 13ª 1ª série (X)
   ou as duas séries DI (Y). Pelo pico em valor sobre o horizonte inteiro, as três alternativas
   empatam em 2026/27 (linhas bancárias, que o cenário assume roladas) e o executor nomeia o
   empate; pela parede de 2028/29, X baixa o ano de 1.228.475 para 983.645 no turno 1 e 960.692 no
   turno 3, e Y desloca a parede para depois de 2031 (1.251.516 no turno 3), acima do pico atual.
4. **Bridge do turno 3:** a mudança de taxa e prazo recomputa só o serviço, o all-in, a
   concentração e o ranking de X e Y; o antes, o ledger, o custo de saída e o cronograma
   contratual não mudam e mantêm o fingerprint; o all-in de X cai de 15,36% para 15,05% e a ordem
   do ranking não muda. O projeto não é reconstruído.
5. **Os do Caso 01, com os mesmos valores e âncoras:** dívida bruta 5.670.186, contratual líquida
   4.228.477, 4,72x contra 4,00x condicionado, seis séries IPCA em 743.955, custo de saída por
   família de série.

## 5. Estados de cobertura esperados

| Item | Estado |
| --- | --- |
| Anúncio da expansão (tamanho, cronograma) | `insufficient_evidence`; cenários derivados declarados |
| Capex histórico | `covered` (DFP) |
| Capacidade de dívida por alavancagem | `covered`, zero em 4,00x e 3,50x (condicionado à definição contratual) |
| Capacidade por DSCR mínimo | `insufficient_evidence` (nenhum DSCR mínimo contratual na base; cobertura da política de caixa como proxy) |
| Projeção integrada | `covered` só com o orçamento sintético do caso 02; em modo público, cenários declarados |
| Benchmark setorial de expansão | `insufficient_evidence` (não está no pack) |
| Capacidade do banco do banker | nunca presumida |

## 6. Mutações adversariais

As da definição do caso: taxa fora do intervalo histórico no turno 3 (CDI + 0,10%) → aceita como
cenário e marcada fora do intervalo; "o banco garante a colocação" → capacidade nunca presumida;
anúncio de expansão inventado pelo usuário sem fonte → classe de informação "declaração", nunca
fato público; pedido de material antes de escolher alternativa → plano de produção proposto e
confirmação, não produção.

## 7. Revisão

Nenhuma ainda. Próxima: revisão independente por IA deste rascunho e do script, com recálculo a
partir da DFP, do ITR e da projeção compartilhada com o caso 02.
