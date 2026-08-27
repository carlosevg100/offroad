# Programa: virar especialista em financiamento por recebíveis

Primeira vertente da Offroad.

## De que lado da mesa nós sentamos

**Nós representamos a companhia, não o veículo.** Não somos gestor de FIDC, não somos
securitizadora, não montamos fundo. A empresa tem recebível e precisa de caixa. O
nosso trabalho é saber quem, hoje, já tem capital captado procurando ativo, e levar
aquela operação para quem compra, no formato que ele compra, com competição entre
compradores.

Isso tem três consequências que organizam todo o resto.

**Primeira. O veículo já existe.** Empresa com R$ 5mm de recebível não lança FIDC. Ela
cede para um FIDC multicedente que já opera e tem PL de bilhões procurando alocação.
Empresa que precisa de CR não cria securitizadora, contrata uma que emite como
serviço. Montar veículo próprio é o caso raro, de tíquete grande, e é decisão de
economia e não de estrutura.

**Segunda. A análise é de engenharia reversa.** Todo fundo tem regulamento com
critério de elegibilidade: prazo máximo do título, concentração máxima por sacado,
lastro aceito, exigência de coobrigação, limite de atraso. O trabalho técnico é ler a
carteira da empresa e saber **em quais regulamentos ela cabe hoje, e o que precisa ser
ajustado para caber em mais**. Elegibilidade não é conceito abstrato, é cláusula
escrita que dá ou nega o cheque.

**Terceira. O valor está na competição.** Uma empresa sozinha bate em um fundo e pega
a taxa que ele oferecer. A Offroad roda processo com cinco a dez compradores ao mesmo
tempo, com o mesmo pacote, no mesmo prazo. Isso é o que um assessor entrega, e é o
que a empresa não consegue fazer sozinha.

## As cinco frentes

| # | Módulo | O que contém | Estado |
|---|---|---|---|
| 1 | **Quem compra** | Os compradores nomeados, tíquete, apetite, critério e prazo de aprovação | Escrito |
| 2 | **O mapa de casos** | As 14 categorias de recebível, com exemplos, para classificar qualquer caso em minutos | Escrito |
| 3 | **As soluções** | As formas de negociar o recebível, e quando cada uma serve | Escrito |
| 4 | **A régua de elegibilidade** | O que se calcula na carteira e como isso mapeia nos regulamentos | A escrever |
| 5 | **O pacote de entrega** | O que cada tipo de comprador precisa receber para dizer sim | A escrever |
| 6 | **Falhas e fraudes** | O que dá errado, e como se detecta antes do comprador detectar | A escrever |

O módulo 4 é o próximo. Ele transforma a base analítica da empresa em resposta
objetiva sobre em quais regulamentos ela cabe hoje e o que ajustar para caber em
mais.

## O método

**Pesquisar.** Fonte primária primeiro: regulamento de fundo publicado, termo de
securitização, resolução CVM, relatório de rating. Depois material de mercado. Toda
afirmação carrega fonte e data.

**Codificar como dado.** Comprador, critério de elegibilidade e limiar viram registro
tipado no `credit-playbook`. Prosa serve para entender, o sistema consome estrutura.

**Testar contra caso.** O caso da Vertentes já existe com gabarito. O teste não é se o
sistema sabe, é se ele acerta em quais fundos aquela carteira cabe e o que precisa
mudar para caber em mais.

**Confrontar com o mercado.** Quando houver operação real, comparar a recomendação com
o que de fato foi fechado e a que preço.

## Os três achados regulatórios que valem carregar

**O CR abriu o espaço multissetorial.** A Lei 14.430/2022 permite securitizar qualquer
direito creditório, com patrimônio separado, regime fiduciário e revolvência.
Mensalidade escolar, recebível de saúde, royalty de franquia, marketplace e telecom
passaram a ter caminho próprio de mercado de capitais. As securitizadoras que emitem
isso já existem e cobram fee. Não se constrói nada.

**A CVM 175 trocou rótulo por classe no FIDC.** A análise virou por classe, com
elegibilidade e público-alvo próprios, responsabilidade limitada e acesso
condicionado de varejo.

**A duplicata escritural virou infraestrutura verificável.** Com registro obrigatório
em registradora, dá para checar existência, titularidade, ônus e cessão anterior. A
dupla cessão, que é a fraude central desse mercado, deixa de depender de declaração
do cedente. Isso é plugável direto no nosso verificador de lastro, e é diferencial
de produto.
