# Ficha A1 · Venda mercantil B2B financiada por cessão de duplicatas

Manual de mesa da célula A1. Este documento ensina a operação inteira: o título, o
direito, o preço, o imposto, a contabilidade, a esteira operacional, a análise do
comprador, o contrato, o universo de quem compra e o processo de execução. O leitor
que termina esta ficha tem que ser capaz de conduzir a operação de ponta a ponta e de
sustentar cada afirmação diante de um comitê.

Convenção de procedência, obrigatória em toda a ficha e em toda saída do sistema:
**[C]** citado, com a norma ou o documento; **[M]** medido em base de caso;
**[E]** estimado, prática de mercado de agosto de 2026, a confirmar no corpus.

---

# Parte I · O ativo: a duplicata em profundidade

## I.1 O que a duplicata é, e por que isso importa

A duplicata é título de crédito **causal**: só pode existir se existir uma compra e
venda mercantil, ou uma prestação de serviços, documentada por fatura. Lei 5.474/1968
[C]. Isso a distingue da nota promissória e do cheque, que são abstratos. A
consequência prática domina toda a análise de lastro: **a duplicata vale o que a
operação subjacente vale**. Se a mercadoria não foi entregue, o título é vazio, por
melhor que seja a assinatura. É por isso que a régua desta célula gasta tanto esforço
em comprovação de entrega, e é por isso que a fraude clássica do mercado é a
duplicata simulada, "fria", que é crime do art. 172 do Código Penal, com pena de 2 a
4 anos [C].

Regras estruturais da Lei 5.474/1968 que a mesa usa toda semana:

| Regra | Norma | Uso prático |
|---|---|---|
| Uma duplicata corresponde a uma fatura | art. 2º, §2º [C] | Título que soma várias notas é irregular. Aparece em base bagunçada e invalida a cobrança executiva |
| O sacado tem 10 dias para devolver a duplicata assinada ou declarar a recusa | art. 7º [C] | O silêncio conta a favor do credor na execução sem aceite |
| A recusa de aceite só é legítima por três motivos: avaria ou não recebimento da mercadoria, vícios na qualidade ou quantidade, divergência de prazo ou preço | art. 8º [C] | Toda defesa de sacado cai numa dessas três caixas. A prova de entrega mata a primeira, o aceite mata as três |
| Perda ou extravio autoriza triplicata | art. 23 [C] | A triplicata tem os mesmos efeitos. Base com triplicatas em série, porém, sugere gestão documental frágil |
| Duplicata de serviços existe e segue o mesmo regime | arts. 20 a 22 [C] | É o lastro da célula C1. A prova de performance substitui o canhoto |
| Aplicação subsidiária da lei cambial | art. 25 [C] | Endosso, aval e regresso funcionam como na letra de câmbio |

## I.2 Aceite: a hierarquia de força do título

O aceite é a assinatura do sacado reconhecendo a dívida. Ele reorganiza a força
jurídica do título, e o comprador de carteira precifica isso, mesmo sem dizer.

| Situação | Força | O que é preciso para executar |
|---|---|---|
| **Duplicata aceita** | Máxima. O sacado não pode mais opor defesas ligadas à operação contra terceiro de boa-fé | Executa direto, art. 15, I [C] |
| **Sem aceite, com protesto e comprovante de entrega, sem recusa tempestiva** | Alta. É o padrão real do mercado, porque quase ninguém aceita formalmente | Executa pela trinca do art. 15, II [C]: protesto + comprovante de entrega + ausência de recusa justificada |
| **Sem aceite e sem comprovante de entrega** | Baixa. O sacado opõe qualquer defesa causal | Só ação de cobrança ordinária, lenta e incerta |

**A leitura de mesa.** No B2B brasileiro o aceite formal é raro; o mercado opera na
segunda linha da tabela. Por isso o comprovante de entrega não é burocracia: **é o
substituto econômico do aceite**, o documento que transforma papel em crédito
executável. Uma carteira com 30% dos canhotos irrecuperáveis, como no caso
[A1-14](../casos/A1-mercantil-b2b-CASOS.md), não tem 30% de lastro fraco: tem 30% de
títulos que caem da segunda para a terceira linha.

Existe um reforço moderno e subutilizado: a **manifestação do destinatário** na NF-e.
O evento "confirmação da operação", registrado pelo comprador na SEFAZ, é declaração
eletrônica do sacado de que a operação ocorreu [C, evento do sistema NF-e]. Carteira
cujos sacados confirmam operação sistematicamente carrega prova de performance
nativa, digital e inegável. A mesa deve orientar cedentes a induzir seus clientes a
manifestar, porque isso melhora o preço da carteira. Poucos sabem disso.

## I.3 Protesto e prescrição: os relógios do título

Dois relógios correm contra o credor, e a régua de cobrança de qualquer carteira tem
que respeitá-los.

**Protesto em 30 dias do vencimento** para preservar o direito de regresso contra
endossantes e seus avalistas, art. 13, §4º [C]. Para o fundo que comprou com
coobrigação, perder esse prazo é perder a coobrigação do cedente naquele título. Por
isso toda esteira de FIDC protesta cedo e automaticamente, e por isso a política de
protesto do fundo, tipicamente disparo entre D+5 e D+15 do vencimento [E], entra na
conversa comercial: o cedente que não quer o cliente protestado precisa recomprar
antes do disparo. A duplicata retida pelo sacado protesta-se **por indicações**, art.
13, §1º [C], e a escritural protesta-se por indicação com base no extrato da
registradora [C, Lei 13.775/2018].

**Prescrição, art. 18 [C]:** 3 anos contra o sacado e avalistas, contados do
vencimento; 1 ano contra endossantes, contado do protesto; 1 ano entre coobrigados,
contado do pagamento. Consequência de análise: título vencido há mais de 3 anos numa
base é ativo morto, e faixa ">1080 dias" em aging que ninguém baixou é sinal de
contabilidade que não reconhece perda.

## I.4 A duplicata escritural: a infraestrutura que muda o jogo

A Lei 13.775/2018 [C] criou a duplicata sob forma exclusivamente escritural,
registrada em sistema eletrônico de escrituração gerido por entidade autorizada pelo
Banco Central. A convenção operacional entre as registradoras foi aprovada pelo BCB em
novembro de 2024 [C], assinada por sete entidades: **CERC, Núclea (antiga CIP), B3,
TAG, CRDC, SPC Grafeno e Quicksoft** [C]. O núcleo operacional apontado pelo mercado
em 2025 e 2026 são **CERC, B3, Núclea e SPC Grafeno** [E, confirmar habilitações
vigentes no cadastro do BCB antes de citar em material].

O que a escrituração resolve, e que a mesa usa como argumento e como ferramenta:

| Problema histórico | Como a registradora resolve |
|---|---|
| Dupla cessão do mesmo título | Unicidade: o título existe uma vez, com um titular. A cessão se registra, e a consulta revela cessão anterior |
| Duplicata fria | O registro nasce vinculado à NF-e, e a trilha é auditável |
| Prova de titularidade | O extrato da registradora é a prova, dispensando o papel |
| Ônus e gravames invisíveis | Constam do registro e aparecem na consulta |
| Protesto de título retido | Por indicação, com base no extrato |

**Consequência de produto para a Offroad.** A verificação de dupla cessão, que era
declaração do cedente cruzada com extratos, virou **consulta objetiva**. O caso
[A1-06](../casos/A1-mercantil-b2b-CASOS.md) treina exatamente isso. E a recíproca vale:
carteira ainda não registrada nas registradoras vale menos e desperta mais diligência,
e a migração do cedente para emissão escritural é recomendação de preparação que
melhora preço e prazo de aprovação [E].

---

# Parte II · A cessão: mecânica jurídica completa

## II.1 Os dois regimes de transferência

A duplicata transfere-se por dois caminhos, com efeitos diferentes, e o contrato de
cessão de um FIDC usa os dois ao mesmo tempo.

**Endosso**, regime cambial, art. 25 da Lei 5.474 remetendo à lei cambial [C].
Assinatura no título, ou registro equivalente na escritural. Dois efeitos: transfere a
titularidade e, **por padrão, vincula o endossante como garantidor do pagamento**. O
endossante que não quer garantir precisa da cláusula expressa "sem garantia" [C,
regime cambial]. Aqui mora a coobrigação: quando o cedente endossa sem ressalva, ele
responde pelo pagamento do título, e a operação, por mais que se chame venda, tem
regresso.

**Cessão civil de crédito**, arts. 286 a 298 do Código Civil [C]. É o regime do
contrato de cessão que rege a relação econômica entre cedente e fundo. Os artigos que
a mesa precisa saber de cor:

| Artigo | Regra | Uso na operação |
|---|---|---|
| 286 [C] | O crédito pode ser cedido, salvo se a obrigação, a lei ou **a convenção com o devedor** o proibir. A proibição convencional não é oponível ao cessionário de boa-fé se não constar do instrumento da obrigação | É a cláusula de vedação de cessão dos contratos comerciais. Verificar os contratos dos maiores sacados é passo obrigatório, casos A1-03 e C1 |
| 287 [C] | A cessão abrange os acessórios: juros, multa, garantias | O fundo leva a multa moratória do título junto |
| 288 [C] | Eficácia contra terceiros exige instrumento com as solenidades legais, na prática o registro | Na duplicata escritural, o registro na registradora cumpre essa função de publicidade [C, Lei 13.775] |
| 290 [C] | A cessão não tem eficácia contra o devedor **antes de notificado** | É por isso que o boleto muda de banco e o sacado é comunicado. Sem notificação, o pagamento ao cedente libera o sacado |
| 292 [C] | O devedor que paga o credor original antes da notificação fica desobrigado | O risco de fungibilidade em pessoa jurídica: pagamento que cai na conta do cedente depois da cessão. É a razão econômica da conta vinculada e do domicílio do fundo |
| 294 [C] | O devedor pode opor ao cessionário as exceções que tinha contra o cedente ao tempo da ciência | A devolução de mercadoria vira defesa contra o fundo. Liga direto com a diluição |
| 295 [C] | Na cessão onerosa, o cedente responde pela **existência** do crédito ao tempo da cessão | É a base jurídica da recompra por vício de origem: título frio, mercadoria devolvida, valor errado. Essa responsabilidade existe **mesmo na cessão sem coobrigação**, e o mercado a chama de garantia da boa origem |
| 296 e 297 [C] | O cedente **não** responde pela solvência do devedor, salvo estipulação em contrário; se responder, limita-se ao que recebeu, com juros e despesas | É a fronteira exata entre cessão pro soluto, sem regresso, e pro solvendo, com regresso. Toda a discussão de coobrigação é a escolha entre 296 regra e 296 exceção |

**A distinção que o sistema tem que dominar, porque tudo deriva dela:**

| | Pro soluto, sem coobrigação | Pro solvendo, com coobrigação |
|---|---|---|
| Quem absorve a inadimplência do sacado | O fundo | O cedente |
| O cedente responde por vício de origem | **Sim, sempre** (art. 295) [C] | Sim |
| Preço | Mais caro, 0,6 a 1,1 p.p. a.m. acima [E] | Mais barato |
| Sai do balanço | Sim, se passar no teste contábil da Parte V | Não |
| IOF | Não incide, é compra e venda de ativo [E, ver Parte IV] | Risco de incidência, ver Parte IV |
| Verificação de lastro | Reforçada, amostragem maior | Padrão |

## II.2 Cessão definitiva contra cessão fiduciária

Confusão frequente do cedente, e às vezes do assessor. São institutos opostos.

**Cessão definitiva** transfere a propriedade do crédito. É a operação desta ficha: o
fundo compra o título.

**Cessão fiduciária em garantia**, art. 66-B da Lei 4.728/1965, com a redação da Lei
10.931/2004 [C], transfere a propriedade **resolúvel** como garantia de uma dívida. É
o regime da trava bancária: o banco da conta garantida é proprietário fiduciário dos
recebíveis que transitam na conta vinculada. Dois efeitos que a mesa explora:

Primeiro, **o credor fiduciário não se sujeita à recuperação judicial** do devedor,
art. 49, §3º, da Lei 11.101/2005 [C], jurisprudência pacificada para cessão fiduciária
de recebíveis [C, STJ]. É por isso que banco adora trava, é por isso que a trava
sobrevive à RJ, e é por isso que destravar recebíveis de um banco exige quitação ou
substituição de garantia, nunca só boa vontade, casos A1-03 e A1-12.

Segundo, para o fundo que **comprou** em cessão definitiva antes de uma RJ do cedente,
os títulos nem integram a massa: a venda se perfez. O risco residual é de revogação
por fraude em falência, arts. 129 e 130 da Lei 11.101 [C], relevante apenas em cessões
às vésperas da quebra com má-fé demonstrável. Na prática de mesa: fundo comprando de
cedente em deterioração aguda aperta a verificação de lastro e exige cessão registrada
justamente para blindar essa posição.

## II.3 A notificação do sacado na prática

O art. 290 exige notificação para eficácia contra o devedor [C]. O mercado a executa
de três formas, em ordem crescente de força:

1. **Troca do boleto**: a cobrança passa a ser emitida pelo banco cobrador do fundo,
   com cláusula de cessão no corpo do boleto. É o padrão do multicedente, silencioso e
   suficiente na prática, embora juridicamente seja notificação presumida [E].
2. **Carta ou e-mail de notificação** com aviso de recebimento, por título ou por
   sacado. Usada em carteiras concentradas.
3. **Anuência formal do sacado** ao contrato de cessão, com compromisso de pagar na
   conta do fundo. É o padrão da porta 2 e das operações com sacado âncora, e elimina
   o risco do art. 292 por completo.

A escolha é comercial: notificação ostensiva revela ao cliente que o fornecedor
antecipa, e parte dos cedentes resiste. A resposta de mesa: no B2B de 2026, antecipar
recebível é gestão financeira normal, e o sacado grande já convive com isso em todos
os fornecedores. Cedente que esconde a cessão do cliente costuma estar escondendo
outra coisa, e o comprador lê assim [E].

---

# Parte III · O preço: a matemática completa

## III.1 Como o fundo calcula o preço de aquisição

O fundo compra o título por **valor presente**, descontando o valor de face pela taxa
da operação no prazo até o vencimento. A convenção dominante é exponencial em dias
úteis, base 252, compondo o CDI com o spread [E, prática de mercado]:

```
PA = VF / [ (1 + CDI)^(du/252) × (1 + spread)^(du/252) ]

PA  = preço de aquisição
VF  = valor de face
du  = dias úteis entre a cessão e o vencimento
CDI = taxa DI anualizada
```

**Exemplo resolvido, com CDI didático de 13,65% a.a. e spread de 6,00% a.a.:**

Título de R$ 100.000, vencendo em 61 dias corridos, 42 dias úteis.

```
fator CDI    = 1,1365^(42/252) = 1,02156
fator spread = 1,0600^(42/252) = 1,00976
fator total  = 1,02156 × 1,00976 = 1,03153
PA           = 100.000 / 1,03153 = R$ 96.943
deságio      = R$ 3.057, ou 3,06% no período, ~1,50% a.m. equivalente
```

## III.2 A armadilha das duas taxas: "por dentro" e "por fora"

Factorings e parte dos fundos cotam em **desconto comercial simples**, "por fora":
deságio = VF × taxa × prazo/30. Bancos e fundos institucionais cotam em **juros
compostos**, "por dentro". A mesma palavra, "2% ao mês", produz preços diferentes, e a
comparação ingênua erra sempre a favor de quem cota por fora.

**Mesmo título, cotado a "1,80% a.m." nos dois regimes:**

```
Por dentro:  PA = 100.000 / (1,018)^(61/30) = 100.000 / 1,03694 = R$ 96.437
Por fora:    deságio = 100.000 × 1,8% × (61/30) = R$ 3.660  →  PA = R$ 96.340

Custo efetivo do "por fora": (100.000/96.340)^(30/61) − 1 = 1,85% a.m.
```

A regra do sistema: **toda taxa cotada é convertida para efetiva composta ao mês antes
de qualquer comparação**, e a saída sempre declara o regime de origem. Quanto maior o
prazo, maior a distorção: a 90 dias, "3% por fora" custa 3,20% efetivos [M na conta];
em prazos curtos a diferença encolhe. Comparar propostas sem essa conversão é erro
desclassificante de mesa.

## III.3 As tarifas que não aparecem na taxa

O deságio nunca é o custo inteiro. O custo efetivo total da cessão soma [E, práticas
usuais do multicedente]:

| Componente | Faixa usual | Como incide |
|---|---|---|
| TAC ou tarifa de cadastro do cedente | R$ 500 a R$ 5.000, única ou anual | Diluída no volume do período |
| Tarifa por título | R$ 2 a R$ 12 | **A mais traiçoeira.** Incide por documento, então pune ticket baixo |
| Tarifa de boleto e cobrança | R$ 2 a R$ 5 por título | Idem |
| Custo de registro na registradora | R$ 0,50 a R$ 3 por título | Idem |
| Tarifa de recompra ou substituição | 0,1% a 0,5% do valor | Incide sobre o giro ruim |
| Taxa mínima ou volume mínimo | Cláusula contratual | Vira custo fixo se o volume cair |

**Exemplo resolvido do efeito do ticket.** Carteira com ticket médio de R$ 3.500 e
prazo médio de 40 dias, tarifas somadas de R$ 7 por título:

```
7 / 3.500 = 0,20% do valor por operação
em 40 dias  →  0,20% × 30/40 = 0,15 p.p. ao mês de custo adicional
```

Numa carteira de ticket R$ 800, mesmo custo por título: **0,66 p.p. ao mês**. É por
isso que carteira granular demais paga caro mesmo com taxa nominal boa, e por isso o
CET da proposta, não a taxa, é o número que a mesa compara. O sistema calcula o CET de
cada proposta com todos os componentes, sempre.

## III.4 Como o fundo constrói o advance rate

O fundo raramente paga 100% do valor presente. Ele retém uma fração como colchão, e a
mesa precisa saber reconstruir a conta para negociá-la [E, lógica padrão]:

```
reserva = (diluição esperada × fator de estresse)
        + (perda esperada da safra × fator de estresse)
        + reserva operacional

advance rate = 1 − reserva
```

**Exemplo com a régua do caso A1-04:** diluição 7,8%, perda por safra 0,8%, estresse
1,5×, reserva operacional 1%:

```
reserva = 7,8%×1,5 + 0,8%×1,5 + 1,0% = 11,7% + 1,2% + 1,0% = 13,9%
advance ≈ 86%
```

A leitura de negociação: o advance rate é função direta das métricas medidas. Cada
ponto de diluição a menos, comprovado, vale mais de um ponto de advance. É mais fácil
melhorar o caixa do cedente atacando a diluição operacional do que brigando por taxa,
e o sistema deve apresentar essa conta ao recomendar.

---

# Parte IV · Tributos da operação

Aviso de procedência: alíquotas de IOF mudaram ao longo de 2025 por decreto e
contencioso, e **nenhum número desta parte sai em material sem confirmação na norma
vigente na data** [E]. A estrutura conceitual abaixo é estável; os percentuais são o
retrato de agosto de 2026 a validar.

## IV.1 IOF: o mapa da incidência

| Operação | IOF crédito | Base |
|---|---|---|
| Desconto bancário de duplicata | **Incide**: alíquota diária de 0,0041% sobre PJ, mais adicional fixo [C, Decreto 6.306/2007; adicional elevado por decreto em 2025, confirmar alíquota vigente] | É operação de crédito clássica |
| Cessão a factoring | **Incide** [C, art. 58 da Lei 9.532/1997, constitucionalidade confirmada pelo STF na ADI 1763] | Equiparação legal expressa |
| Cessão definitiva **sem coobrigação** a FIDC | **Não incide** [E, entendimento dominante]: é compra e venda de ativo, não operação de crédito | A vantagem fiscal estrutural da securitização |
| Cessão **com coobrigação** a FIDC | **Zona de risco**: a Receita já equiparou cessão com regresso a operação de crédito em solução de consulta [E, confirmar ato vigente]; o mercado convive com a tese e parte dos fundos estrutura recompra limitada em vez de coobrigação formal por isso | Ponto de estruturação, não de fé |
| Risco sacado / forfait | Decreto de junho de 2025 tentou incluir; o STF **suspendeu a incidência sobre risco sacado** ao julgar o pacote do IOF em 2025 [C, decisão de 2025, confirmar estado atual] | Monitorar: é fronteira viva |

**Por que isso importa na recomendação.** Entre desconto bancário com IOF e cessão sem
coobrigação sem IOF, a diferença fiscal sozinha pode passar de 0,5 p.p. equivalente ao
mês em prazos curtos [E na conta], antes de qualquer discussão de spread. O sistema
soma o IOF ao CET do desconto bancário sempre, e a comparação entre portas sai com
impostos dentro.

## IV.2 O deságio no imposto de renda do cedente

| Regime do cedente | Efeito do deságio |
|---|---|
| **Lucro real** | Despesa financeira dedutível de IRPJ e CSLL [C, regra geral de dedutibilidade]. O custo efetivo líquido da cessão cai até 34% para quem tem lucro tributável |
| **Lucro presumido** | **O deságio não deduz nada**: a base é presumida sobre a receita bruta, e a despesa financeira é fiscalmente irrelevante [C, sistemática do presumido]. O custo da antecipação é integral |
| PIS/COFINS não cumulativo | Despesa financeira não gera crédito [C, regime vigente desde 2015] |

**Consequência de mesa que quase ninguém calcula:** para dois cedentes idênticos, um
no real e um no presumido, a mesma taxa de 2,0% a.m. custa, líquida de IR,
aproximadamente 1,32% para o primeiro e 2,0% para o segundo. A recomendação de
instrumento e até a agressividade da antecipação mudam com o regime tributário do
cedente, e o sistema pergunta o regime no intake por isso.

---

# Parte V · A contabilidade no cedente

## V.1 O teste de desreconhecimento

A cessão sai do balanço se, e somente se, transferir **substancialmente os riscos e
benefícios** do ativo, CPC 48 / IFRS 9 [C]. A tabela de decisão que o auditor aplica,
e que o sistema aplica antes dele:

| Desenho da operação | Tratamento contábil |
|---|---|
| Cessão definitiva sem coobrigação, sem recompra compulsória, sem sobrecolateral excessivo | **Baixa do ativo.** A carteira sai, entra caixa, o deságio vai a resultado financeiro |
| Cessão com coobrigação, ou endosso sem cláusula "sem garantia" | **Não desreconhece.** O recebível permanece, e registra-se passivo financeiro pela obrigação, a antiga conta "duplicatas descontadas" |
| Cessão sem coobrigação, mas com recompra automática de inadimplidos, ou subordinação retida que absorve a perda esperada | **Não desreconhece**, porque o risco continuou no cedente. É o erro do caso A1-13 |

**As três leituras de mesa:**

1. Empresa que "vendeu" carteira com regresso e não registra o passivo está com a
   alavancagem subestimada, e o comitê do fundo refaz a conta em minutos. A ponte da
   dívida ajustada da Parte VII existe para chegar antes.
2. A conta redutora "duplicatas descontadas" dentro de clientes é onde o desconto
   bancário histórico se esconde, caso A1-02. Procurar nela é passo fixo da
   conciliação.
3. Desreconhecimento é desenho, não desejo: quem precisa desconsolidar por covenant
   precisa passar o desenho pelo auditor **antes** de assinar a cessão, nunca depois.

---

# Parte VI · A operação no dia a dia

## VI.1 A esteira de uma cessão, hora a hora

O ciclo de um lote, do borderô ao caixa, no multicedente típico [E, esteira usual]:

1. **Borderô.** O cedente monta a remessa: relação de títulos com sacado, CNPJ, número
   da NF-e e chave de acesso de 44 posições, valor, emissão, vencimento. Envio por
   portal, API ou arquivo.
2. **Checagem automática de elegibilidade.** O motor do fundo roda título a título:
   prazo dentro do teto, sacado dentro do sublimite, sacado sem bloqueio, cedente
   dentro do limite global, título não vencido, CNPJ ativo, NF-e autorizada na SEFAZ e
   sem evento de cancelamento.
3. **Consulta à registradora.** Titularidade, ônus, cessão anterior. O que era
   declaração virou consulta, Parte I.4.
4. **Análise de exceções.** O que o motor recusou vai para analista: sacado novo pede
   limite, concentração estourada pede exceção ou corte.
5. **Formalização.** Termo de cessão do lote, endosso, registro da cessão na
   registradora, troca da titularidade da cobrança.
6. **Liquidação financeira.** O fundo credita o preço de aquisição, líquido de
   tarifas, na conta do cedente. D+0 a D+1 do aceite do lote [E].
7. **Cobrança.** Boleto emitido pelo banco cobrador do fundo contra o sacado, com a
   cláusula de cessão. O sacado paga ao fundo.
8. **Conciliação diária.** Liquidados, liquidados a menor, vencidos. Liquidação a
   menor abre a discussão de diluição, caso A1-09.
9. **Gestão de vencidos.** Régua de cobrança, protesto na janela dos 30 dias da Parte
   I.3, e o menu do cedente: recomprar, substituir ou deixar a régua correr.
10. **Relatório mensal.** Posição, aging, recompras, taxa média. É o dado que alimenta
    a régua da Offroad continuamente depois do fechamento.

**Onde o processo emperra na vida real** [E, recorrente]: cedente sem chave de NF-e no
ERP, títulos sem vínculo com a nota; sacados novos em volume, estourando a fila de
limites; conta vinculada demorando semanas no banco; e o financeiro do cedente
continuando a receber pagamentos na conta antiga, o problema do art. 292, que exige
repasse imediato e conciliado.

## VI.2 Verificação de lastro: o que o verificador de fato faz

Sob a Resolução CVM 175, a verificação do lastro é função obrigatória da estrutura do
FIDC, executável por amostragem com periodicidade definida no regulamento [C, Anexo
Normativo II; parâmetros por fundo no corpus]. O trabalho concreto, título amostrado a
título amostrado:

| Checagem | Fonte | O que reprova |
|---|---|---|
| A NF-e existe e está autorizada | Consulta da chave de 44 posições na SEFAZ | Nota inexistente ou rejeitada: indício de duplicata fria |
| A nota não foi cancelada | Eventos da NF-e | Cancelamento em 24h após a cessão é padrão de fraude conhecido |
| O emitente e o destinatário batem | XML contra o título | Divergência de CNPJ |
| Valor e vencimento batem | XML e fatura contra o título | Título maior que a nota |
| A entrega aconteceu | Canhoto, CT-e, EDI da transportadora, ou manifestação do destinatário na SEFAZ | Sem prova: título cai de degrau, Parte I.2 |
| Não há devolução | Eventos e notas de devolução do sacado | Devolução total ou parcial não abatida |
| Titularidade e ônus | Registradora | Cessão anterior, gravame |

**Amostra típica de mercado:** 5% a 10% dos títulos por trimestre em carteira sã,
subindo para 100% em cheque de estreia de cedente ou sob suspeita [E]. A Offroad roda
essa mesma bateria **antes** do fundo, na base inteira quando os dados permitem, e é
exatamente o que os casos A1-06 e A1-14 treinam.

## VI.3 Arquivos e sistemas que aparecem na conversa

Vocabulário operacional que a mesa precisa reconhecer sem pestanejar [E]:

- **CNAB 400/240**: leiautes bancários de remessa e retorno de cobrança. O retorno é a
  fonte da conciliação de liquidação.
- **CNAB 444**: leiaute padrão de posição de carteira de FIDC, usado por custodiantes
  e administradores para o estoque título a título. Pedir "o 444" ao administrador é
  pedir a base analítica da carteira cedida.
- **XML da NF-e e eventos**: a fonte primária do lastro.
- **API ou portal da registradora**: consulta e registro de duplicatas escriturais e
  cessões.
- **Webservice da SEFAZ**: situação da nota em tempo real.

---

# Parte VII · Como o comprador analisa, e como se interpreta

A régua de cálculo completa com fórmulas está na seção de métricas abaixo. Esta parte
ensina a **interpretação**: o que cada número diz, em que combinação, e o que o comitê
conclui dele.

## VII.1 A régua, fórmula a fórmula

```
carteira          = títulos em aberto na data base, não liquidados
data_base         = data da última emissão presente na base
                    (regra de calibração: data posterior faz o pipeline recente
                     sumir e o DSO sair pela metade, aprendido na Vertentes)

prazo_medio       = Σ(valor_i × (venc_i − emis_i)) / Σ(valor_i)

dso_simples       = saldo_recebiveis / faturamento_periodo × dias_periodo
dso_countback     = consome o saldo contra o faturamento dos meses mais
                    recentes até zerar; robusto a sazonalidade

conc_sacado_i     = valor_sacado_i / carteira        (por raiz de CNPJ E por grupo)
top_n             = Σ(n maiores) / carteira

aging             = a vencer | 1-15 | 16-30 | 31-60 | 61-90 | 91-180 | >180

roll(a→b)         = valor que migra da faixa a para a b entre M e M+1 / faixa a em M

perda_safra(m,t)  = não liquidado da safra m, t dias após o vencimento
                    / emitido na safra m          t ∈ {30,60,90,120,180,360}

diluicao          = (devoluções + abatimentos + descontos + notas de crédito)
                    / faturamento bruto

recompra          = recomprado no período / cedido no período
perda_ajustada    = perda recalculada somando de volta os títulos recomprados

liq_pontual       = liquidado até o vencimento / vencido no período

prorrogacao       = títulos com vencimento alterado após emissão / total

eleg(fundo)       = valor dos títulos que atendem TODOS os critérios do fundo
                    / carteira                     (saída em percentual, nunca sim/não)

divida_ajustada   = dívida bancária + cessões com regresso + risco sacado a pagar
                    + factoring com coobrigação + parcelamentos fiscais
alavancagem       = (divida_ajustada − caixa) / EBITDA
```

## VII.2 Leituras combinadas: onde mora a análise de verdade

Número isolado não conclui nada. O comitê, e o sistema, leem **pares e trincas**:

| Combinação | Leitura |
|---|---|
| DSO alto + prorrogação baixa | Atraso puro: o sacado está sofrendo. Olhar o roll rate |
| DSO alto + prorrogação alta | Prazo real maior que o declarado: gestão comercial informal, caso A1-05. Elegibilidade recalculada pelo prazo prorrogado |
| Perda baixa + recompra alta | Perda maquiada, caso A1-10. Recalcular a perda ajustada é obrigatório antes de aceitar qualquer métrica de performance |
| Perda baixa + diluição alta | O caixa some sem virar inadimplência, casos A1-04 e A1-09. O advance rate vai absorver |
| Média de perda boa + safras recentes ruins | Originação deteriorando, caso A1-11. Sempre comparar blocos de safras no mesmo t |
| Concentração por sacado ok + por grupo alta | Pulverização de fachada, caso A1-03. Reagrupamento societário é passo fixo |
| Liquidação pontual baixa + perda final baixa | Sacados pagam, mas atrasam por política. Precifica prazo, não risco, caso A1-07 |
| Carteira grande + faturamento incompatível | Ou prazo escondido, ou títulos podres acumulados, ou intercompany inflando |
| Base analítica ≠ razão contábil | Sempre reconciliar antes de qualquer métrica; a diferença ou é baixa não refletida, ou título cedido, ou erro que contamina tudo |

## VII.3 O que o comitê conclui, na cabeça dele

O comitê de um multicedente decide três coisas, nesta ordem [E, prática]:

1. **"Esse cedente me dá prejuízo operacional?"** Base suja, ERP fraco, borderô
   errado, retrabalho. Metade das recusas é operacional, não de crédito.
2. **"A carteira paga o funil?"** Perda ajustada + diluição + custo de cobrança contra
   o spread. É aritmética, e a Parte III.4 é a conta dele.
3. **"O cedente aguenta a coobrigação?"** Aí entra o balanço, a dívida ajustada e a
   alavancagem. Cedente frágil com carteira boa recebe limite menor e trava maior, não
   recusa.

A mesa que entende essa ordem monta o material na mesma ordem: primeiro provar
operação limpa, depois provar carteira que se paga, por último provar empresa que
sustenta o regresso.

---

# Parte VIII · O contrato de cessão, cláusula a cláusula

O contrato-quadro de cessão é onde a operação é ganha ou perdida depois do preço. As
cláusulas que decidem, o que cada uma esconde, e a posição de negociação da mesa
[E, prática contratual do segmento]:

| Cláusula | O que costuma vir escrito | O risco para o cedente | A posição da mesa |
|---|---|---|---|
| **Recompra por vício de origem** | Obrigatória e automática: título frio, mercadoria devolvida, valor divergente, vício formal | Nenhum: é o art. 295 do CC, e é legítima | Aceitar sem discutir. Brigar aqui queima credibilidade |
| **Recompra por inadimplemento** | "O cedente recomprará títulos vencidos há X dias" | **É coobrigação com outro nome.** Muda preço, muda contabilidade, muda IOF | Nomear o que é. Se a operação é com regresso, que o preço reflita; se é sem, a cláusula sai |
| **Recompra facultativa** | O cedente **pode** recomprar antes do protesto | Nenhum: é o mecanismo de proteger o cliente estratégico | Garantir que é faculdade, não obrigação, e que a tarifa de recompra é conhecida |
| **Critérios de elegibilidade** | Espelham o regulamento, às vezes mais duros | Critério mais duro que o regulamento reduz a capacidade sem o cedente notar | Pedir o anexo de critérios e conferir contra o regulamento, item a item |
| **Exclusividade** | "O cedente cederá exclusivamente ao fundo" | Mata o processo competitivo e o poder de renegociação futuro | **Recusar.** Aceitável no máximo exclusividade por sacado específico, nunca global |
| **Volume mínimo ou tarifa mínima** | Piso mensal de cessão ou tarifa compensatória | Vira custo fixo em sazonalidade, caso A1-05 | Negociar sazonalidade explícita ou piso trimestral em vez de mensal |
| **Trava de conta e domicílio** | Fluxo dos sacados cedidos obrigatoriamente no banco do fundo | Padrão e legítimo para os títulos cedidos | Delimitar: a trava alcança os sacados cedidos, nunca o fluxo inteiro da empresa |
| **Fiança ou aval dos sócios** | Aval dos sócios no contrato-quadro | Estende o regresso ao patrimônio pessoal | Em cessão sem coobrigação, não faz sentido e deve sair; com coobrigação, negociar teto |
| **Cross-default** | Inadimplemento em qualquer contrato vence tudo | Um evento pequeno derruba a linha inteira | Limitar a eventos materiais e dar prazo de cura |
| **Rescisão e multa de saída** | Multa sobre limite ou volume histórico | Prende o cedente na taxa ruim | Saída livre com aviso de 30 a 60 dias, sem multa sobre o não utilizado |
| **Mandato e procuração** | Poderes amplos para endossar, protestar, cobrar | Padrão operacional necessário | Conferir que os poderes são instrumentais à cessão, não gerais |
| **Confissão de dívida embutida** | Algumas minutas transformam o quadro em confissão | Executividade ampliada contra o cedente | Identificar e nomear. Se a operação é venda de ativo, confissão de dívida não pertence a ela |

**Regra de leitura do sistema:** contrato de cessão recebido é parseado contra esta
tabela, cláusula a cláusula, e as divergências saem em relatório com a posição
recomendada. Contrato sem anexo de critérios de elegibilidade é contrato incompleto, e
a mesa não fecha sem ele.

---

# Parte IX · O universo de compradores

Estado da seção: núcleo levantado em agosto de 2026 [E]; a profundidade final desta
parte vem do corpus de regulamentos, que transforma cada linha [E] em critérios [C]
por fundo. A colheita é a próxima tarefa da vertente, e cada regulamento colhido
atualiza esta ficha.

## IX.1 Grupos e gestoras de FIDC multicedente

Primeiro time por PL e presença em originação de terceiros [E, rankings de mercado
2025 e 2026]:

| Grupo | Perfil | Tíquete por cedente [E] | Custo indicativo [E] |
|---|---|---|---|
| **RED Asset** | Um dos maiores canais de PME e middle market, multissetorial | R$ 500k a R$ 50mm | 1,3% a 3,0% a.m. |
| **One7** | Um dos maiores grupos do segmento multicedente, originação própria e adquirida | R$ 300k a R$ 40mm | 1,4% a 3,2% a.m. |
| **Multiplica Capital** | R$ 2,2bn alocados em 2025; critérios citados na Parte VII | R$ 500k a R$ 40mm | mínimo 120% do CDI [C regulamento]; efetivo CDI+3 a CDI+12 a.a. |
| **Athenabanco** | Líder de aquisição em meses de 2025 | R$ 300k a R$ 30mm | 1,5% a 3,5% a.m. |
| **Grupo Sifra** | Tradicional, PME e middle | R$ 300k a R$ 30mm | 1,5% a 3,5% a.m. |
| **SRM Asset** | Pioneiro do modelo, duplicata performada | R$ 300k a R$ 30mm | 1,5% a 3,5% a.m. |
| **Invista** | Comercial, giro, estruturadas | R$ 500k a R$ 30mm | 1,4% a 3,3% a.m. |
| **ASA** | Crédito empresarial em expansão | R$ 1mm a R$ 50mm | CDI + 3% a 10% a.a. |
| **Multiplike** | Antecipação PME, fundo aberto e fechado | R$ 300k a R$ 25mm | 1,5% a 3,5% a.m. |
| **SB Crédito** | Critérios citados na Parte VII | R$ 500k a R$ 25mm | CDI + 4% a 12% a.a. |
| **Tercon, RDF e GFM** | Gestora especializada; 10% por sacado, 25% top 5 [C] | R$ 500k a R$ 30mm | 1,5% a 3,5% a.m. |
| **Prisma Capital** | Crédito estruturado com esteira multicedente | R$ 500k a R$ 30mm | 1,5% a 3,3% a.m. |
| **IOX e IOSAN** | Curto prazo | R$ 300k a R$ 20mm | 1,5% a 3,5% a.m. |
| **BS Factoring e BSI Capital** | Middle e corporate, estruturas maiores | R$ 10mm a R$ 200mm | CDI + 3% a 9% a.a. |
| **Solis** | Compartilhado primeiro, dedicado na escala | R$ 5mm a R$ 500mm | CDI + 3% a 10% a.a. |
| **Empírica** | Gestora especializada em FIDC, várias teses | R$ 1mm a R$ 50mm | conforme veículo |
| **Quatá** | Tradição em multicedente | R$ 500k a R$ 25mm | 1,5% a 3,5% a.m. |
| **Gávea Sec, Golden/AR3, ML Bank, Somacred, K2, Devant, Integral Brei, M8** | Multissetoriais de porte médio | R$ 200k a R$ 30mm | 1,5% a 3,8% a.m. |

## IX.2 Fintechs e plataformas de antecipação

Camada que compete com o multicedente em agilidade, e às vezes o alimenta [E]:

| Plataforma | Modelo | Quando entra na recomendação |
|---|---|---|
| **a55** | Crédito com recebíveis e fluxo digital | Cedente digital, ticket menor, velocidade |
| **Adianta** | Antecipação de duplicatas B2B online | Necessidade pontual, teste de preço |
| **CashU** | Antecipação e crédito B2B | Idem |
| **TruePay** | Antecipação no fluxo comprador-fornecedor | Quando o sacado adere ao arranjo |
| **Monkey** | Leilão reverso de risco sacado | Porta 2, sacado âncora com programa |
| **Liber** | Supplier finance multifunding | Porta 2 |
| **Antecipa Fácil** | Leilão de duplicatas com centenas de financiadores | Descoberta de preço sem exclusividade |
| **Grafeno** | Conta digital, registro e infraestrutura de recebíveis | Infraestrutura da operação, e originação |

O uso tático das plataformas de leilão: **teste de preço real** antes ou durante o
processo competitivo. Duas semanas de cessões pequenas num leilão dão à mesa a taxa de
mercado viva daquela carteira, com data, para ancorar a negociação com os fundos.

## IX.3 Bancos médios ativos em desconto e conta garantida

Referência de comparação, porque o cedente sempre tem uma proposta bancária na gaveta
[E]: Daycoval, ABC Brasil, Pine, Sofisa, Rendimento, Fibra, BS2, Industrial, Voiter,
mais as mesas de middle de Itaú, Bradesco e Santander. O desconto bancário compete em
taxa nominal, e perde com frequência no CET quando se soma IOF, reciprocidade,
seguros empurrados e a trava sobre o limite, Parte IV. A comparação do sistema é
sempre CET contra CET, com impostos.

## IX.4 Administradores fiduciários: por que o cedente deve olhar para eles

O administrador e o custodiante definem a esteira que o cedente vai viver: prazo de
onboarding, qualidade do portal, tarifas por título, rigidez da verificação. Os
dominantes no segmento [E]: **Singulare, Oliveira Trust, Vórtx, BRL Trust, Hemera,
Planner, IDCORP, Kanastra, Genial, Banco Paulista**. Dois usos de mesa:

1. **Diligência reversa:** fundo administrado por casa desconhecida, sem custodiante
   de porte, é sinal de alerta sobre o próprio fundo. O cedente com coobrigação é
   credor da própria recompra futura e convive com a saúde do veículo.
2. **Previsão de esteira:** conhecer o administrador é prever o leiaute de arquivos,
   o prazo real de cadastro e o custo por título antes de assinar.

---

# Parte X · O processo competitivo: o playbook da mesa

A execução que transforma a análise em taxa. Desenho padrão para carteira B2B
performada de R$ 1mm a R$ 5mm por mês [E, prática de assessoria]:

**Semana 1 e 2, preparação.** Data tape de 24 meses fechado e reconciliado com o
razão. Régua completa rodada. Defeitos achados e tratados ou explicados. Mapa de
gravames e cessões vigentes. Pacote da Parte XI montado. Nada vai a mercado antes de a
mesa saber tudo o que o comprador vai achar.

**Semana 3, lançamento.** Seis a dez fundos abordados simultaneamente com o mesmo
pacote e o mesmo prazo de resposta, tipicamente 10 dias úteis. NDA quando o cedente
exigir sigilo do nome. A carta de processo diz o que se espera da proposta: taxa no
regime declarado, advance, todas as tarifas, limite inicial e rampa, sublimites por
sacado, exigências de garantia, prazo de esteira.

**Semana 4 e 5, propostas e leitura.** Toda proposta convertida a CET no mesmo regime,
Parte III. Grade comparativa com as oito dimensões, não só a taxa. As objeções de cada
comitê são respondidas por escrito, uma vez, para todos, o que mantém o leilão
simétrico.

**Semana 6, rodada final e escolha dupla.** Melhor e segunda proposta chamadas a
melhorar. **Fechar com dois fundos, não um**: divide o volume, mantém concorrência
permanente, e elimina o risco de dependência de um comitê, que é exatamente o defeito
da relação bancária que o cedente está deixando.

**Pós-fechamento.** A régua roda mensalmente sobre os relatórios de cessão. A cada
semestre, os números novos reabrem a conversa de taxa, com o histórico de liquidação
limpo como argumento. A taxa boa não se conquista na entrada, se constrói no
histórico, caso A1-08.

---

# Parte XI · Informação crucial, perguntas e material

## XI.1 As catorze informações, ranqueadas pelo que decidem

| # | Informação | O que decide | Se faltar |
|---|---|---|---|
| 1 | Base analítica título a título, 24 meses | Tudo | Sem ela não há operação: é o primeiro teste de viabilidade |
| 2 | Concentração por sacado e por grupo | A lista de compradores | Não há recomendação, só palpite |
| 3 | Prazo médio ponderado | Cortes de elegibilidade entre 75 e 90 dias [C] | Idem |
| 4 | Diluição aberta por tipo | Valor real do recebível e advance rate | O fundo acha na primeira conciliação e corta o limite |
| 5 | Perda por safra | Tendência da originação | A média esconde a deterioração |
| 6 | Cessões vigentes com credor e saldo | Carteira livre | Risco de dupla cessão, o pior achado possível |
| 7 | Dívida contrato a contrato | Dívida ajustada e capacidade de coobrigação | Alavancagem errada; o comitê recalcula sozinho |
| 8 | Comprovação de entrega por amostra | O degrau jurídico do título, Parte I.2 | Título cai para cobrança ordinária |
| 9 | Aging mensal | Roll rate e tolerâncias contratuais | Não responde às cláusulas de atraso |
| 10 | Recompra e substituição | Perda real | Maquiagem passa despercebida |
| 11 | Prorrogações | Prazo real da carteira | Elegibilidade calculada errada |
| 12 | Contratos dos maiores sacados | Cláusula de vedação de cessão, art. 286 [C] | Descoberto tarde, derruba a operação |
| 13 | Domicílio bancário e travas | Fluxo livre e waivers necessários | Atraso de semanas no fechamento |
| 14 | Demonstrações de 3 exercícios e balancete | Limite global | Cedente tratado como sem histórico |

O que não é crucial e não se pede: organograma detalhado, plano quinquenal, currículo
de sócios, institucional. Nada disso entra na decisão de um comitê de multicedente, e
pedir consome a paciência da companhia sem melhorar a operação.

## XI.2 Perguntas: apenas o resíduo, em lote, com gatilho declarado

| Gatilho medido | Pergunta |
|---|---|
| DSO excede prazo contratado em 10+ dias | Política de prorrogação, alçada, e como recuperar vencimentos originais |
| Diluição acima de 4% | Política comercial de devolução e bonificação, e mudanças no período |
| Safra recente pior | O que mudou em crédito, mix ou canal |
| Recompra acima de 5% | Critério de recompra e previsão contratual |
| Grupo econômico acima do sacado isolado | Confirmação da estrutura societária dos agrupados |
| Razão ≠ base | Critério e local da baixa contábil |
| Faixa >180d relevante | Cobrança judicial e baixas |
| Contrato de sacado grande ausente | Existência e cláusula de cessão |
| Trava identificada | Saldo garantido e condição de liberação |

Regra dura: nada que esteja no documento entregue, nada que a base responda, nada que
fonte pública resolva. Pergunta redundante destrói a confiança que o produto promete.

## XI.3 As objeções do comitê, respondidas antes

| Objeção | Resposta pronta no material | Evidência |
|---|---|---|
| Diluição e por que não está no aging | Aberta por tipo com série mensal | Notas de crédito conciliadas |
| DSO acima do contratado | Decomposto em atraso e prorrogação, com política | Séries das três métricas |
| Quanto já está cedido | Posição por credor e carteira livre | Contratos, extratos, registradora |
| Safra piorou | Causa nomeada e ação tomada | Blocos de safra no mesmo t |
| Recompra mascara perda | Perda ajustada calculada e mostrada | Série de recompra |
| Sacado excede meu limite | Sublimite proposto pela mesa | Concentração por grupo |
| Quem cobra se o cedente parar | Rotina documentada e transferível | Política de cobrança |
| Onde o dinheiro cai | Domicílio definido, waivers em curso | Cartas de liberação |
| Quanto não tem prova de entrega | Percentual medido por amostra, com plano | Amostra documentada |
| A dívida bate | Ponte da dívida ajustada, item a item | Contratos, extratos, SCR |

## XI.4 O pacote de entrega da porta 1

Data tape com dicionário de campos; ficha do cedente em duas páginas; painel da
carteira com a régua completa e séries; posição de cessões; amostra de lastro com nota,
título e comprovante; societário e certidões. **Sem teaser**: comitê de multicedente
lê planilha antes de texto, e receber teaser desenhado sinaliza assessor que não
conhece o comprador. Teaser é linguagem das portas 3 e 4.

---

# Parte XII · Erros do sistema nesta célula, e o banco de casos

## XII.1 As travas específicas

| Erro que este domínio induz | Trava |
|---|---|
| Recomendar veículo próprio para carteira pequena | Dedicado só acima de R$ 20mm a R$ 30mm de carteira média; abaixo, porta 1 |
| Citar critério de fundo sem regulamento no corpus | O comprador sai como "não avaliado", nunca com critério inventado |
| Prometer desconsolidação sem teste do CPC 48 | A Parte V roda antes de qualquer promessa |
| Comparar taxas em regimes diferentes | Conversão obrigatória da Parte III.2, com o regime declarado |
| Ignorar tarifas por título em carteira granular | CET completo da Parte III.3, sempre |
| Somar IOF errado, ou esquecê-lo no desconto bancário | Mapa da Parte IV, com aviso de confirmação de alíquota |
| Confundir PDD com perda, atraso com perda, diluição com inadimplência | Nomes distintos e cálculos separados na régua |
| Aceitar métrica de carteira cedida sem a recompra ao lado | Perda ajustada obrigatória |
| Esquecer o regime tributário do cedente na conta do custo | Pergunta de intake, Parte IV.2 |
| Interrogar cedente limpo | O caso A1-01 pune isso no treinamento |

## XII.2 O que cada parte desta ficha treina, e onde se testa

| Parte | Casos que a exercitam |
|---|---|
| I e II, título e cessão | A1-06, A1-14, A1-17 |
| III, preço | A1-08, A1-18, A1-20 |
| IV e V, tributo e contabilidade | A1-02, A1-13 |
| VI, operação | A1-06, A1-12, A1-14 |
| VII, análise combinada | A1-03, A1-04, A1-05, A1-09, A1-10, A1-11 |
| VIII, contrato | A1-05, A1-10, A1-18 |
| IX e X, compradores e processo | A1-07, A1-15, A1-16, A1-19, A1-20 |

O banco completo com os vinte casos está em
[casos/A1-mercantil-b2b-CASOS.md](../casos/A1-mercantil-b2b-CASOS.md). A Vertentes
implementa o A1-03 em dados, com acervo de 21 arquivos e gabarito medido.
