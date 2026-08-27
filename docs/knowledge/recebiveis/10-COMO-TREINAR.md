# Como deixar o sistema expert em cada categoria

Método de treinamento da vertente de recebíveis.

## O que treinar não é

**Não é fine-tuning.** Ajustar peso de modelo com casos de crédito é caro, lento,
impossível de auditar e desatualiza a cada mudança de regulamento. E quando o
resultado sai errado, não há como saber por quê. Conhecimento de crédito não pode
morar em peso de rede.

**Não é prompt gigante.** Despejar as catorze categorias e os quarenta compradores no
contexto faz o sistema parecer que sabe e falhar em silêncio, porque nada ali é
verificável.

**Treinar é quatro coisas ao mesmo tempo:** codificar o conhecimento como dado,
calcular o que é conta em código, medir contra gabarito, e confrontar com precedente
real.

---

# As cinco camadas, e quem faz cada uma

A distinção que organiza o sistema inteiro é qual camada é código e qual é julgamento.

| Camada | O que faz | Quem executa | Como se mede |
|---|---|---|---|
| **1. Classificação** | Lê o intake e diz em que categoria a empresa cai | Modelo, com o catálogo de perfis | Acerto contra gabarito, binário |
| **2. Cálculo** | Diluição, glosa, churn, safra, aging, concentração, DSO | **Código, nunca modelo** | Igualdade exata contra gabarito |
| **3. Elegibilidade** | Confronta as métricas com os critérios de cada regulamento | **Código, nunca modelo** | Lista de compradores compatíveis, exata |
| **4. Recomendação** | Quais portas, quais compradores, por quê, o que ajustar | Modelo, restringido pelas camadas 1 a 3 | Sobrevivência ao comitê adversarial |
| **5. Redação** | Teaser, term sheet, memorando | Modelo, com a doutrina | Revisão em quatro passagens |

**A regra que não se quebra: número é código.** O modelo nunca calcula diluição, nunca
soma aging, nunca computa perda por safra. Ele lê o resultado do cálculo e explica o
que ele significa. Isso elimina de uma vez a classe inteira de erro que destrói
credibilidade em mesa de crédito.

Só as camadas 4 e 5 são julgamento. As camadas 1 a 3 ou estão certas ou estão erradas,
e isso é testável a cada commit.

---

# Ativo 1: a fábrica de casos

**É o ativo central, e o que a Offroad tem de único.** Não vamos ter operação real
antes do produto existir, então o caso sintético não é substituto, é o método.

Já existe um caso completo, a Vertentes, com 21 arquivos, base de 34 mil títulos,
oito defeitos plantados e gabarito medido. O método generaliza.

## O que um gerador de categoria produz

| Peça | Conteúdo |
|---|---|
| A companhia | CNPJ, CNAE, porte, histórico, sócios, estrutura |
| O acervo | Documentos na bagunça real, em três origens: público, intake e upload |
| A base analítica | Títulos gerados com estatística calibrada da categoria |
| Os defeitos | Plantados de propósito, do catálogo da categoria |
| O gabarito | Métricas medidas, defeitos plantados, portas corretas, compradores compatíveis |

## Três níveis de dificuldade por categoria

| Nível | Desenho | O que testa |
|---|---|---|
| **Limpo** | Carteira boa, documentação completa, um defeito leve | A classificação e o cálculo |
| **Real** | Divergência contábil, concentração no limite, prazo médio no talo, três a cinco defeitos | A régua de elegibilidade e a recomendação |
| **Difícil** | Recompra alta mascarando inadimplência, prorrogação informal, sacado relacionado escondido, cessão anterior não declarada | A capacidade de achar o que o comprador acharia |

Catorze categorias, três níveis, dá quarenta e dois casos base. Cada gerador é
parametrizado, então cada caso base rende dezenas de variações mudando concentração,
prazo, safra e defeito.

**A calibração é o trabalho.** Uma carteira sintética que não parece real não testa
nada. A Vertentes levou várias iterações até bater ticket médio, prazo ponderado, DSO,
perda acima de 180 dias e diluição em faixa plausível. Descobrimos ali que data de
relatório e última emissão precisam ser registradas separadamente. Usar uma no lugar
da outra sem declarar a convenção faz o pipeline recente sumir e distorce o DSO. Cada
categoria vai ter uma descoberta dessas.

---

# Ativo 2: o catálogo de defeitos por categoria

O sistema fica expert quando **encontra antes o que o comprador encontraria depois**.
Para isso, cada categoria precisa da sua lista de defeitos característicos, e o gerador
planta a partir dela.

| Categoria | Defeitos que o gerador planta |
|---|---|
| Venda mercantil B2B | Duplicata sem canhoto, título já descontado ainda na base, devolução não abatida, sacado do mesmo grupo, prorrogação informal de vencimento |
| Fornecedor de grande grupo | Concentração real maior que a declarada, programa de confirming não divulgado, prazo esticado sem contrato |
| Serviço a PJ | Contrato que veda cessão sem anuência, medição não aceita, retenção contratual não abatida |
| Contrato recorrente | Churn crescente escondido na média, contrato vencido ainda contado, cláusula de rescisão sem multa |
| Cartão | Agenda já cedida a outra credenciadora, chargeback subdeclarado, dependência de uma só adquirente |
| Saúde | Glosa registrada pelo bruto, recurso vencido sem baixa, operadora com problema de solvência |
| Mensalidade PF | Evasão de meio de ano diluída na média anual, matrícula cancelada ainda faturada |
| Agro | Barter contado como recebível em dinheiro, vencimento fora do ciclo, penhor já constituído |
| Setor público | Empenho sem liquidação contado como recebível, contrato sem anuência para cessão |
| Obra | Medição futura como performada, pleito em aberto contado como certo, retenção não segregada |
| Imobiliário | Distrato não abatido, LTV desatualizado, unidade em obra atrasada |
| Carteira de crédito | Renegociação zerando atraso, safra recente pior escondida na média, política de crédito não documentada |
| Marketplace | Compensação da plataforma não considerada, repasse já cedido |
| Exportação | Carta de crédito não confirmada tratada como confirmada, exposição cambial descoberta |

**O gabarito registra o que foi plantado.** A medida vira recall e precisão de defeito,
como já é feito na Vertentes.

---

# Ativo 3: o corpus de regulamentos reais

Este é o ponto que mais eleva a qualidade, e está disponível de graça.

**Regulamentos de FIDC são públicos.** Ficam no sistema de fundos estruturados da B3 e
nos portais das administradoras, junto com os informes mensais. Já vimos cláusula real
do Multiplica, do SB Crédito e do RDF: concentração de 10% por sacado, 35% para os seis
maiores, prazo médio máximo de 90 dias, taxa mínima de aquisição de 120% do CDI,
duplicata de 3 a 270 dias, liquidação pontual mínima de 75%, crédito com mais de 45
dias de atraso limitado a 2% do PL.

**O que fazer com isso.** Colher dezenas de regulamentos, extrair os critérios de
elegibilidade para a estrutura tipada do playbook, e passar a responder com cláusula
citada e não com estimativa. A diferença prática:

> Sem corpus: "essa concentração provavelmente inviabiliza em alguns fundos."
>
> Com corpus: "o sacado Alfa representa 12,4% da carteira. Isso excede o limite de 10%
> do regulamento do Multiplica e do RDF. Cabe no fundo X, que admite 15%. Reduzindo a
> exposição a 9,5%, entram mais quatro compradores."

A segunda frase é a mesa. A primeira é palpite.

**O mesmo vale para termo de securitização**, que traz a estrutura real de CR e de CRI,
e para **relatório de rating de FIDC**, que traz a análise que a agência fez da carteira
e é o material mais próximo de um gabarito produzido por terceiro.

---

# Ativo 4: o comitê adversarial

Classificação e cálculo se medem contra gabarito. Recomendação, não. Ela se mede por
sobrevivência.

**O desenho.** Para cada recomendação, cinco passes independentes e restritos de
revisão, cada um representando a lente de crédito de um comprador específico. Os
passes recebem a mesma saída estruturada, o regulamento daquele comprador e a
instrução de procurar motivo de rejeição. Eles não conversam entre si e não executam
ações. Cada passe devolve motivo de rejeição, aprovação condicionada ou ausência de
objeção, sempre em schema fechado e com procedência.

**A leitura.** Recomendação que passa em três de cinco lentes avança para revisão
responsável. Rejeitada por três ou mais pelo mesmo motivo, o problema não é o
comprador, é a recomendação, e ela volta. Esse placar é uma régua de teste, nunca um
sign-off de crédito nem uma decisão autônoma do sistema.

**Por que isso funciona.** É o único jeito de medir julgamento sem operação real. E
reproduz exatamente o que acontece na vida: a mesa não erra por calcular errado, erra
por levar a operação para quem não compra aquilo.

**O ganho colateral.** Os motivos de rejeição viram dado. Depois de algumas centenas de
rodadas, sabemos qual objeção aparece mais em cada categoria, e passamos a antecipá-la
no material antes de ela ser feita.

---

# Como se mede que melhorou

Sem placar não há treino, há opinião. O placar por categoria:

| Métrica | O que mede | Barra |
|---|---|---|
| Acerto de classificação | Camada 1 | Acima de 95% |
| Exatidão de cálculo | Camada 2 | 100%, é código |
| Compradores compatíveis | Camada 3 | Igual ao gabarito, é código |
| Recall de defeito | Achou o que foi plantado | Acima de 90% |
| Precisão de defeito | Não inventou defeito | Acima de 85% |
| Sobrevivência ao comitê | Camada 4 | Três de cinco |
| Passagens de revisão | Camada 5 | Quatro passagens, conforme a doutrina |

A extração de documento hoje mede 75,4% de recall e 79,0% de precisão. Esse número é a
linha de base, e é ele que sobe primeiro, porque tudo depende de ler o acervo certo.

**Regressão é obrigatória.** Todo caso já resolvido vira teste permanente. Mudança que
melhora uma categoria e piora outra é rejeitada, e isso só aparece se todos os casos
rodarem sempre.

---

# A ordem de execução

Não fazer as catorze categorias em paralelo. A ordem que rende mais:

**1. As seis de maior frequência primeiro.** Venda mercantil B2B, fornecedor de grande
grupo, serviço a PJ, contrato recorrente, cartão e carteira de crédito originada.
Cobrem a maior parte do que vai chegar. Uma delas, a venda mercantil, já tem caso
pronto.

**2. Corpus de regulamentos em paralelo.** É colheita e extração, não depende do resto
e destrava a camada 3 inteira.

**3. Um gerador por categoria, nível real primeiro.** Nível limpo é fácil demais e
nível difícil não adianta antes de o real passar.

**4. O comitê adversarial depois que a camada 3 existir.** Antes disso ele rejeita por
falta de dado, e não por falta de tese.

**5. As oito restantes.** Com a máquina montada, cada categoria nova é preencher o
catálogo de defeitos, calibrar a estatística e escrever o gerador.

---

# O que isso constrói

No fim, o sistema não é um modelo que sabe sobre recebíveis. É:

- um catálogo de categorias que classifica qualquer caso que chega,
- uma calculadora por categoria que nunca erra a conta,
- um corpus de regulamentos que responde com cláusula e não com palpite,
- uma fábrica de casos que testa tudo isso a cada mudança,
- e um comitê adversarial que reprova recomendação fraca antes do mercado reprovar.

**Nada disso é conhecimento do modelo. É conhecimento da Offroad**, auditável, versionado
e que não some quando o modelo troca.
