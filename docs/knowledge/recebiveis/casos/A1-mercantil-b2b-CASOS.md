# Banco de casos A1: venda mercantil B2B

Vinte casos de treinamento da célula A1, venda mercantil B2B financiada por cessão de
duplicatas. Cada caso é uma empresa diferente, com um pedido diferente, defeitos
diferentes e lacunas diferentes. O gabarito de cada um registra o que o sistema tem
que produzir.

## Como cada caso treina o sistema

Todo caso exercita a mesma cadeia, e o gabarito cobra cada elo:

1. **Perfil.** Ler o que a empresa apresentou, quali e quant, e identificar o tipo de
   operação de que se trata, mesmo quando o pedido vem formulado errado.
2. **Leitura quantitativa.** Calcular a régua inteira da [ficha A1](../fichas/A1-mercantil-fidc-multicedente.md)
   sobre a base entregue: prazo médio, DSO pelos dois métodos, concentração por sacado
   e por grupo, aging, roll rate, perda por safra, diluição, recompra, liquidação
   pontual, prorrogação, dívida ajustada.
3. **Cross-reference.** Cruzar tudo contra tudo: base analítica contra razão contábil,
   faturamento contra notas de crédito, dívida declarada contra contratos e extratos,
   vencimentos contra histórico, sacados contra quadros societários.
4. **Lacunas.** Dizer o que falta, por que faz falta, e o que muda no resultado
   enquanto faltar.
5. **Dúvidas com porquê.** Formular as perguntas do lote único, cada uma amarrada ao
   número que a gerou. Pergunta sem gatilho medido é pergunta proibida.
6. **Racional.** Recomendar portas e compradores com a cláusula ou o critério que
   sustenta cada inclusão e cada exclusão, e o ajuste que destrava mais compradores.

## Uma precisão técnica sobre concentração, antes dos casos

Os limites de concentração citados em regulamento, como os 10% por sacado do
Multiplica, incidem sobre o **PL do fundo**, que é de centenas de milhões ou bilhões.
Para um cedente de porte médio, esse teto regulamentar raramente é o vinculante. O que
vincula na prática é o **limite da política de crédito do gestor sobre a carteira
daquele cedente**, tipicamente 10% a 20% por sacado dentro do limite do cedente, e o
sublimite que o comitê aprova por sacado. Estado: a cláusula regulamentar é citada; a
política por cedente é estimada até termos a política de crédito de cada gestor no
corpus. Os gabaritos abaixo usam essa distinção.

## Convenção de procedência

Nos gabaritos: **[M]** medido na base do caso, **[C]** citado de documento ou
regulamento, **[E]** estimado de mercado, agosto de 2026. Afirmação sem marca não
existe no gabarito, e não pode existir na saída do sistema.

---

# A1-01 · Distribuidora Serra Alta, alimentos secos. O caso limpo

**A empresa.** Distribuidora de alimentos secos e mercearia, Caxias do Sul, 22 anos.
Receita bruta de R$ 48,2mm em 2025. Compra de 40 indústrias, vende para 640 pontos:
mercados de bairro, minimercados e padarias da serra gaúcha. Prazo de venda 28 e 35
dias. EBITDA de R$ 3,1mm, margem de 6,4%. Dívida bancária de R$ 4,2mm em capital de
giro, caixa de R$ 900k.

**O que ela apresenta e pede.** O dono escreve: "quero antecipar as vendas para
comprar melhor à vista, os fornecedores dão 4% de desconto no pagamento antecipado, e
hoje só antecipo no banco quando aperta, a taxa é 2,4% ao mês". Pede capacidade de
R$ 3mm por mês.

**O acervo.** Completo, caso raro: base título a título de 26 meses exportada do ERP,
balancete, demonstrações de 3 anos, contratos bancários, XML das notas dos últimos 6
meses. Nenhuma lacuna material.

**O que os números mostram.**

| Métrica | Valor | Leitura |
|---|---|---|
| Carteira em aberto | R$ 5,1mm [M] | Compatível com receita e prazo: R$ 132k/dia de faturamento a 38 dias de DSO |
| Prazo médio ponderado | 33 dias [M] | Folga em qualquer regulamento |
| DSO countback | 38 dias [M] | 5 dias sobre o contratado, normal em pulverizado |
| Maior sacado | 3,1% [M], rede de minimercados | Sem restrição em nenhuma política |
| Top 10 sacados | 16,4% [M] | Pulverização real |
| Diluição | 1,9% [M] | Devolução de perecível baixa, mix seco |
| Perda por safra, t=180 | 0,74% média, safras estáveis [M] | Originação constante |
| Liquidação pontual | 84% [M] | Acima do piso de 75% do SB [C] |
| Recompra | Não há, nunca cedeu | Base virgem |
| Alavancagem ajustada | 1,1x [M], sem passivo oculto | A ponte fecha com o balanço |

**Defeito plantado.** Um só, leve: 14 títulos de R$ 96k total contra uma padaria que
fechou constam como a vencer, sem baixa nem provisão. Some da conciliação entre a base
e o razão, onde já foram lançados como perda.

**O que o sistema deve fazer.** Classificar A1 em segundos. Rodar a régua, detectar a
divergência de R$ 96k na conciliação base contra razão, e tratá-la pelo que é:
apontamento de higiene, não problema de crédito. A única pergunta legítima do lote:
"os títulos da sacada X estão baixados no razão e ativos na base, qual é o
procedimento de baixa no ERP?".

**O racional que o gabarito cobra.** Este é o cedente que todo multicedente quer. A
recomendação é processo competitivo na porta 1 com 6 a 8 fundos simultâneos: RED,
Multiplica, SB, Sifra, Athenabanco, Multiplike [E, todos aceitam o perfil]. Banda
esperada 1,5% a 1,9% a.m. [E] dada a pulverização e o sacado varejo alimentar. Ponto
de estrutura: a economia do caso não é só a taxa, é o desconto de 4% do fornecedor
contra custo de antecipação de ~2,2% no prazo médio de 33 dias, spread positivo de
1,8 p.p. por ciclo que financia a si mesmo. O material deve apresentar isso como tese:
antecipação para arbitrar desconto comercial, não para tapar caixa. Isso muda como o
comitê lê o cedente.

**Compradores.** Compatíveis: todos os listados [E]. Incompatíveis: nenhum.
Ajuste que destrava: nenhum necessário. Caso serve de baseline de calibração: se o
sistema levantar mais de uma pergunta aqui, está interrogando à toa.

---

# A1-02 · Plastisul Embalagens. O prazo na fronteira

**A empresa.** Indústria de embalagens plásticas flexíveis, Joinville. Receita
R$ 85mm. Vende para indústrias de alimentos e de higiene, 180 sacados PJ. Prazo de
venda negociado cliente a cliente: 60, 75, 90 e alguns contratos a 105 dias. EBITDA
R$ 8,9mm. Dívida R$ 14,1mm, sendo R$ 5,2mm em desconto de duplicatas que o balanço
mostra em conta redutora de clientes, não em empréstimos.

**O que ela apresenta e pede.** O CFO pede "uma linha de R$ 10mm para giro, sem
garantia imobiliária, o desconto no banco consome o limite que preciso para o BNDES
da máquina nova".

**O acervo.** Base de 24 meses, boa. Balancete. Falta: os contratos bancários do
desconto, e o CFO não mencionou o desconto no formulário de dívida.

**O que os números mostram.**

| Métrica | Valor | Leitura |
|---|---|---|
| Prazo médio ponderado | 88 dias [M] | Dois dias abaixo do teto de 90 do Multiplica [C], treze acima do teto de 75 do SB [C] |
| Carteira | R$ 24,8mm [M] | Grande em relação à receita, consequência do prazo |
| DSO countback | 94 dias [M] | 6 dias sobre o médio contratado |
| Duplicatas descontadas | R$ 5,2mm [M no balanço] | Não declaradas no formulário, achadas na conta redutora |
| Maior sacado | 8,9% [M] | Passa nas políticas usuais |
| Diluição | 2,2% [M] | Baixa, embalagem sob medida devolve pouco |
| Perda t=180 | 0,4% [M] | Sacado industrial paga |
| Alavancagem ajustada | 1,6x com o desconto somado [M] | Contra 1,0x da dívida declarada |

**Defeitos plantados.** (1) A dívida declarada omite R$ 5,2mm de desconto com
regresso. (2) Os títulos descontados estão na base sem marcação, então a carteira
livre é R$ 19,6mm e não R$ 24,8mm.

**O que o sistema deve fazer.** O cross-reference decisivo é balanço contra formulário
contra base: a conta redutora de clientes denuncia o desconto, e a ausência de
marcação na base denuncia que a carteira livre está superestimada. Perguntas do lote:
em qual banco está o desconto e quais títulos estão comprometidos, com pedido do
extrato de borderôs; e se os contratos a 105 dias têm cláusula de cessão.

**O racional.** O prazo de 88 dias é o eixo da operação. Elegibilidade agregada [M
por regulamento]: no SB, apenas os títulos até 75 dias médios entram, 41% da carteira;
no Multiplica, 96% entra, mas a carteira do cedente fica a dois dias do teto, e
qualquer alongamento comercial derruba a elegibilidade. A recomendação tem duas
pernas: ceder a fatia curta na porta 1 em fundo com teto de 90 [C Multiplica], e levar
a fatia longa de 90 a 105 dias para porta 3 como CCB com cessão fiduciária, onde prazo
de título não é critério de elegibilidade e sim cobertura [E]. E a resposta ao pedido
original: a cessão sem coobrigação libera o limite bancário para o BNDES da máquina,
que era o objetivo real declarado. O material deve abrir com a ponte da dívida
ajustada, porque o comitê vai achar o desconto na conta redutora em cinco minutos.

**Ajuste que destrava.** Renegociar os contratos de 105 para 90 dias eleva a
elegibilidade no grupo de teto 90 para 100% da carteira [M]. Se comercialmente
inviável, a divisão em duas pernas resolve.

---

# A1-03 · FarmaRede Distribuição. O grupo escondido na raiz do CNPJ

**A empresa.** Distribuidora farmacêutica, Goiânia, receita R$ 220mm. Vende para
1.900 drogarias independentes e 6 redes regionais. Prazo 21 a 42 dias. EBITDA
R$ 7,7mm, margem fina de 3,5%, típica do setor. Dívida R$ 22mm entre giro e conta
garantida com trava de domicílio em um banco.

**O que ela apresenta e pede.** Quer R$ 15mm de capacidade rotativa "para acompanhar o
crescimento das redes parceiras". Entrega uma apresentação orgulhosa: "nenhum cliente
representa mais de 6% das vendas".

**O acervo.** Base de 24 meses. Relação de sacados com CNPJ. Falta: quadro societário
dos sacados, que o sistema busca em fonte pública.

**O que os números mostram.**

| Métrica | Valor | Leitura |
|---|---|---|
| Maior sacado por CNPJ | 5,8% [M] | Confere com o discurso |
| Maior grupo econômico | **19,3%** [M] | Seis CNPJs de drogarias com os mesmos dois sócios, três raízes diferentes |
| Top 3 grupos | 31,7% [M] | A pulverização declarada não existe no nível que importa |
| Prazo médio | 31 dias [M] | Confortável |
| Diluição | 3,4% [M] | Troca de vencidos e bonificação de gôndola |
| Perda t=180 | 0,9% [M] | Aceitável |
| Trava de domicílio | Conta garantida de R$ 6mm com fluxo travado [C contrato] | Parte do fluxo não está livre |

**Defeitos plantados.** (1) A concentração real é por grupo, invisível por raiz de
CNPJ isolada. (2) A trava da conta garantida não foi mencionada e condiciona o
domicílio dos pagamentos.

**O que o sistema deve fazer.** O passo que decide o caso é enriquecer os sacados com
quadro societário e reagrupar. Sem isso, a análise repete o erro da empresa. Depois,
ler o contrato da conta garantida e identificar a trava. Perguntas do lote: se as seis
drogarias do grupo X compram sob negociação centralizada, porque isso muda o risco de
comportamento; e qual o saldo médio garantido pela trava, com a condição de liberação.

**O racional.** Com 19,3% em um grupo, a política de crédito usual dos gestores, 10% a
20% por sacado na carteira do cedente [E], fica no limite. A recomendação: processo na
porta 1 com sublimite proposto pela própria mesa para o grupo X, de 12%, cedendo o
excedente fora do fundo ou segurando em carteira. Propor o sublimite antes de o comitê
impor é postura de mesa, e costuma preservar preço. A trava exige waiver do banco da
conta garantida como condição precedente, entra no cronograma com 3 a 4 semanas [E].
Elegibilidade agregada com o sublimite de 12%: 92,7% da carteira [M].

---

# A1-04 · Autopeças Mirante. A diluição que come o advance rate

**A empresa.** Distribuidora de autopeças, Contagem, receita R$ 62mm. Vende para
2.400 oficinas e 90 autopeças de balcão. Prazo 28 dias. Setor com devolução
estrutural: peça errada, aplicação incompatível, garantia.

**O que ela apresenta e pede.** "Nossa inadimplência é baixíssima, menos de 1%, quero
antecipar com taxa boa." Pede R$ 5mm por mês.

**Os números.** Perda t=180 de 0,8% [M], confirmando o discurso. Mas diluição de
**7,8%** [M]: devoluções 4,9%, garantias 1,7%, abatimentos comerciais 1,2%. A cada
R$ 100 faturados, R$ 7,80 nunca viram caixa, e isso não aparece em nenhuma régua de
inadimplência.

**Defeito plantado.** As notas de crédito são emitidas com até 40 dias de atraso em
relação à devolução física, então a base analítica mostra títulos abertos que já têm
mercadoria devolvida no estoque. A carteira real é menor que a contábil em ~R$ 480k
[M] em qualquer data de corte.

**O que o sistema deve fazer.** Não aceitar a tese "inadimplência baixa logo carteira
boa". Diluição é a métrica decisiva da categoria A e tem que ser calculada mesmo
quando ninguém pediu. O cross-reference: notas de crédito contra devoluções físicas
do estoque, achando a defasagem de 40 dias. Perguntas: qual o fluxo operacional entre
devolução física e emissão da nota de crédito, e se há títulos em cobrança com
devolução já recebida.

**O racional.** Nenhum fundo recusa o cedente, mas todos precificam a diluição: o
advance rate cai de ~92% para ~80% [E], criando overcollateral que absorve as
devoluções. O material deve apresentar a diluição aberta por tipo com série mensal,
antes que o fundo a descubra na primeira conciliação de liquidação, quando o efeito
seria corte de limite e desconfiança. Encurtar a defasagem da nota de crédito para
até 5 dias é o ajuste operacional que melhora o advance rate em ~3 p.p. [E], e vira
recomendação de gestão, não só de operação.

---

# A1-05 · Confecção Vale Norte. Sazonalidade e prorrogação informal

**A empresa.** Confecção feminina, Blumenau, receita R$ 38mm, concentrada em duas
coleções. Vende para 800 lojistas multimarca. Prazo tabelado 45 dias, "mas cliente
bom a gente estica", nas palavras do comercial.

**O que ela apresenta e pede.** Quer R$ 6mm entre setembro e novembro para financiar
a produção do verão. Fora da safra, quase nada.

**Os números.** DSO countback de 71 dias [M] contra prazo contratado de 45.
Prorrogação: 28% dos títulos têm vencimento alterado após a emissão [M], média de 24
dias de alongamento. A perda t=180 é 1,4% [M], baixa. A empresa não está inadimplente,
está **renegociando prazo informalmente e em escala**.

**Defeito plantado.** O ERP sobrescreve o vencimento original na prorrogação. A
evidência só existe porque o backup mensal da base preserva os vencimentos antigos, e
o sistema tem que pensar em pedir exatamente isso.

**O que o sistema deve fazer.** O gatilho é DSO menos prazo contratado igual a 26
dias, muito acima do limiar de 10. A pergunta certa não é "por que o atraso", é "qual
a política de prorrogação, quem autoriza, e como recupero os vencimentos originais".
Se a base atual não guarda histórico, pedir os backups ou os arquivos de remessa de
cobrança dos meses anteriores, que preservam o vencimento vigente à época.

**O racional.** Para o fundo, prazo real é o prorrogado: a carteira efetiva é de ~69
dias [M], não 45, e é assim que a elegibilidade tem que ser calculada, o que ainda
passa nos tetos de 75 e 90 [C]. A sazonalidade pede estrutura de limite sazonal:
capacidade de R$ 6mm no pico e R$ 1,5mm no vale, que os multicedentes acomodam bem
[E]. E o ponto de mesa: formalizar a prorrogação como política escrita com alçada
transforma um achado ruim, gestão informal, em resposta pronta, política comercial
deliberada com histórico de perda que a valida. A mesma realidade, apresentada certa,
muda a leitura do comitê.

---

# A1-06 · Construsul Materiais. O título que já tem dono

**A empresa.** Distribuidora de materiais de construção, Londrina, receita R$ 55mm.
Vende para construtoras pequenas e lojas de material, prazo 30 e 60 dias. Aperto de
caixa reconhecido: "atrasamos fornecedor este mês".

**O que ela apresenta e pede.** R$ 4mm "o mais rápido possível". Entrega a base
"completa" de títulos em aberto: R$ 8,2mm.

**Os números e o achado.** A conciliação com o balancete fecha. Mas o cruzamento com
os extratos bancários mostra créditos regulares de dois bancos com descrição de
borderô, e a consulta simulada à registradora retorna **R$ 2,9mm da base já cedidos**
[M]: R$ 1,8mm descontados no banco A, R$ 1,1mm no banco B. Carteira livre real:
R$ 5,3mm.

**Defeito plantado.** É o defeito central do caso, e o mais grave do catálogo:
apresentar como disponível título já cedido. Aqui foi desorganização, o financeiro da
empresa não marca os descontados. A diferença entre desorganização e fraude é a
intenção, e a resposta do sistema tem que funcionar para as duas hipóteses.

**O que o sistema deve fazer.** Nunca aceitar base de títulos sem cruzar com extratos
e registradora. Detectado o conflito, a comunicação interna é factual e sem acusação:
"R$ 2,9mm da base constam cedidos nos registros de cessão, a carteira livre para
operação é R$ 5,3mm, segue a lista título a título". Pergunta do lote: se existe
controle de marcação de títulos descontados no ERP, e quem o mantém.

**O racional.** A operação continua viável sobre os R$ 5,3mm livres, com capacidade
de ~R$ 3,5mm [E] após advance rate, próxima do pedido. Mas o caso muda de natureza: o
primeiro entregável vira a implantação do controle de marcação, porque nenhum fundo
liquida a primeira cessão sem verificação de dupla cessão na registradora [C, Lei
13.775/2018 tornou o registro verificável], e a empresa reprovaria nessa checagem hoje.
O gabarito cobra que o sistema recuse avançar para o mercado antes de sanear, e que
diga isso como proteção da própria empresa, não como censura.

---

# A1-07 · Frigorífico Planalto. Concentração que pede sublimite

**A empresa.** Frigorífico de aves, interior do Paraná, receita R$ 140mm. Vende 60%
para 4 redes de atacarejo e supermercado regional, 40% pulverizado em açougues e
mercados. Prazo 21 e 28 dias.

**O que ela apresenta e pede.** R$ 12mm de capacidade. "Nossos clientes são as
maiores redes da região, risco zero."

**Os números.** Maior sacado, rede de atacarejo: **14,2% da carteira** [M]. Top 4:
46% [M]. Perda t=180 quase nula nos grandes, 2,1% no pulverizado [M]. Prazo médio 24
dias [M]. O risco não é de crédito, é de **comportamento**: a rede grande atrasa 8
dias em média como política de tesouraria [M no aging por sacado], e paga.

**O que o sistema deve fazer.** Separar a leitura por bloco de sacado, porque a média
mistura dois riscos que não se somam: o bloco redes tem perda zero e atraso
sistemático; o bloco pulverizado tem perda 2,1% e pontualidade melhor. Pergunta: os
contratos com as redes têm previsão de cessão, e existe acordo comercial de prazo de
pagamento além do faturado, porque o atraso de 8 dias uniforme sugere prazo real
negociado de 30 e não 21.

**O racional.** Com 14,2% em um sacado, a mesa propõe sublimite de 10% a 12% por
sacado na cessão [E política usual], cedendo o excedente das redes fora ou retendo. E
a alternativa superior existe: as 4 redes são exatamente o perfil de sacado que
viabiliza **porta 2**, risco sacado, onde o frigorífico antecipa na taxa do risco do
atacarejo. A recomendação em duas pernas: bloco pulverizado na porta 1, bloco redes
via confirming se ao menos uma rede tiver programa, o que o sistema verifica em fonte
pública antes de perguntar. Elegibilidade na porta 1 com sublimite de 12%: 89% da
carteira [M].

---

# A1-08 · Gráfica Anhembi. Pequeno demais para quase tudo

**A empresa.** Gráfica comercial, São Paulo, receita R$ 24mm. Embalagens e material
promocional para 300 clientes PJ. Prazo 30 e 45 dias. Carteira de R$ 2,8mm [M].

**O que ela apresenta e pede.** R$ 1,5mm por mês. Hoje usa factoring a 3,4% a.m.
"porque banco não dá limite".

**Os números.** Carteira limpa: maior sacado 6% [M], diluição 2,0% [M], perda t=180 de
1,1% [M]. O problema não é qualidade, é escala: R$ 1,5mm por mês está no piso da
maioria dos multicedentes médios e abaixo do interesse dos grandes.

**O que o sistema deve fazer.** Não fingir que o caso é maior do que é. A leitura
honesta: portas 3 e 4 não existem para este porte [E, custo fixo], os grandes
multicedentes vão dar limite pequeno com taxa cheia, e os fundos menores e as
factorings com funding de FIDC são o mercado real. A conta que o gabarito cobra:
migrar de 3,4% para ~2,2% a.m. [E] em multicedente médio economiza ~R$ 260k por ano
[M: R$ 1,5mm/mês cedidos a prazo médio 38d], que é mais de 1% da receita, material
para uma gráfica.

**O racional.** Recomendação de trajetória explícita: 12 a 18 meses em multicedente
construindo histórico de liquidação limpo, com o objetivo declarado de renegociar taxa
a cada semestre com o próprio fundo e com concorrentes. O caso treina o sistema a
dizer que a operação é pequena sem tratar a empresa como pequena, e a barra de
linguagem vale integral: institucional, sem condescendência.

---

# A1-09 · Bebidas Iguaçu. A bonificação que vira surpresa

**A empresa.** Distribuidora de bebidas, Cascavel, receita R$ 95mm. Vende para 1.100
pontos: bares, restaurantes, mercados. Prazo 14 a 28 dias, giro rápido.

**O que ela apresenta e pede.** R$ 7mm de capacidade. Base entregue, diluição
aparente de 1,5% [M na base].

**O achado.** O razão conta uma história diferente: despesa comercial de R$ 4,1mm/ano
com a rubrica "verbas e acordos" [M]. São bonificações negociadas com os pontos
grandes, pagas por **abatimento nas duplicatas seguintes**: o sacado paga R$ 9.400 de
um título de R$ 10.000 e a diferença é acertada como verba. A diluição econômica real
é **5,8%** [M: 1,5% da base mais 4,3% de verbas líquidas], e o fundo vai vivê-la como
liquidação parcial sistemática.

**Defeito plantado.** A diluição está contabilizada como despesa comercial, não como
redutora do recebível, então a base analítica parece limpa e o título liquida sempre
"com diferença".

**O que o sistema deve fazer.** O cross-reference obrigatório: liquidações da base
contra valores de face, achando o padrão de pagamento a menor concentrado nos maiores
sacados; e razão de despesas comerciais contra as diferenças de liquidação, fechando
o circuito. Pergunta: como os acordos de verba são formalizados e se o valor é
conhecido na emissão do título, porque isso decide se o título já nasce com valor
errado.

**O racional.** Fundo compra título pelo valor de face; liquidação sistemática a menor
gera inadimplência técnica e conciliação infernal. As saídas, nesta ordem: emitir o
título já líquido da verba conhecida; ou nota de crédito simultânea à emissão; ou
excluir do borderô os sacados com acordo de verba, cedendo só o fluxo limpo, 78% da
carteira [M]. O material apresenta a diluição econômica completa de 5,8% com a
mecânica explicada, porque descoberta depois ela derruba a relação com o fundo
inteira.

---

# A1-10 · Metalúrgica Andrade. A recompra que esconde a perda

**A empresa.** Metalúrgica de peças usinadas, Sorocaba, receita R$ 70mm. Vende para
120 indústrias, prazo 45 e 60 dias. Já cede para um FIDC há 3 anos, quer "melhorar a
taxa", que hoje é 2,1% a.m.

**O que ela apresenta e pede.** Histórico de cessão com orgulho: "perda quase zero no
fundo, nunca demos problema".

**Os números.** Verdade: perda do fundo com a carteira dela, 0,3% [M]. Mas a taxa de
recompra é **11% ao mês** [M no histórico de cessão]. A empresa recompra
sistematicamente todo título que passa de 30 dias de atraso, antes de virar perda
visível. Recalculando a perda como se não houvesse recompra: **2,3%** em t=180 [M],
quase 8 vezes a reportada. E a recompra é paga com o caixa liberado pelas cessões
novas, uma esteira que só fica de pé enquanto o volume cresce.

**O que o sistema deve fazer.** Nunca aceitar métrica de performance de carteira
cedida sem a série de recompra ao lado. O cálculo obrigatório: perda ajustada por
recompra, que é a perda econômica real do cedente. E a leitura de fluxo: quanto do
caixa mensal está sendo consumido em recompra, R$ 640k/mês em média [M], e o que
acontece se o fundo cortar o limite.

**O racional.** A resposta ao pedido de taxa é dura e tem que ser dita: a taxa de 2,1%
está, na prática, precificando uma carteira maquiada; qualquer fundo novo vai pedir o
histórico de cessão, ver a recompra de 11% e precificar pior, ou recusar. O caminho
real para taxa melhor é atacar a causa: régua de crédito na ponta, porque a perda
ajustada de 2,3% concentra em 9 sacados [M] que continuam comprando. Seis meses de
originação limpa derrubam a recompra e aí sim a taxa desce com argumento. O gabarito
cobra que o sistema recuse otimizar a taxa de hoje sobre a base de hoje, e explique o
porquê com os números.

---

# A1-11 · Química Portão. A safra que virou

**A empresa.** Fabricante de tintas e vernizes industriais, Portão RS, receita
R$ 110mm. 380 sacados, prazo 35 e 49 dias. Perda média de 24 meses: 1,0% [M],
apresentada como estável.

**O achado.** A média esconde a virada. Perda por safra em t=120: safras de 19 a 12
meses atrás, 0,7% média [M]; últimas 6 safras fechadas, **1,9%** [M], 2,7 vezes pior.
Cruzando com o mix: a piora coincide com a entrada do canal "revenda balcão", 220
sacados novos pequenos, trazidos por uma política comercial agressiva iniciada há 10
meses [M no cadastro de clientes por data de primeira compra].

**O que o sistema deve fazer.** Safra é obrigatória mesmo quando a média parece boa,
este caso existe para punir quem olhar só a média. O cruzamento que explica: perda por
safra segmentada por canal, mostrando indústria estável em 0,6% e balcão em 4,8% [M].
Pergunta: qual a régua de crédito do canal balcão e se há alçada distinta, porque a
concentração da perda em um canal com política própria é tratável.

**O racional.** A carteira tem dois ativos com preços diferentes dentro dela. Cedendo
tudo junto, o balcão contamina o preço do todo. A recomendação: ceder o bloco
indústria, 71% da carteira [M], como carteira prime com a segmentação demonstrada, e
segurar ou ceder à parte o balcão enquanto a régua nova, se implantada, constrói 6
meses de safra melhor. O material mostra a segmentação aberta, porque esconder a
piora seria descoberto na primeira atualização mensal de qualquer fundo, e mostrar o
controle dela é argumento de gestão.

---

# A1-12 · Papelrio Conversão. As travas que ninguém somou

**A empresa.** Convertedora de papel, Nova Iguaçu, receita R$ 66mm. Papel toalha e
higiênico marca própria para atacadistas. Prazo 28 dias. Dívida R$ 11mm em 3 bancos.

**O que ela apresenta e pede.** R$ 5mm de antecipação. Carteira declarada R$ 6,4mm.

**O achado.** Dois dos três contratos bancários têm **cessão fiduciária de recebíveis
com trava de domicílio** [C contratos]: banco A trava os 4 maiores sacados, banco B
trava "recebíveis de cartão e mais R$ 1,5mm de duplicatas a eleger". Somando as
travas: R$ 3,7mm da carteira está comprometida como garantia [M]. Carteira livre:
R$ 2,7mm, pouco mais da metade do pedido.

**O que o sistema deve fazer.** Ler os três contratos antes de qualquer conversa com
fundo, montar o mapa de gravames sacado a sacado, e recalcular a capacidade real. As
perguntas: qual o saldo devedor atual de cada linha travada, porque trava de contrato
liquidado é liberável por carta; e se o banco A aceita substituição de garantia,
porque os 4 maiores sacados travados são justamente os melhores para cessão.

**O racional.** O caso é de sequenciamento, não de recusa: primeiro liberar as travas,
depois operar. O desenho: quitar a linha do banco B, R$ 1,2mm de saldo [M], com a
primeira cessão, liberando R$ 1,5mm de trava, e negociar com o banco A a migração da
garantia para os sacados menores. Em 60 dias a carteira livre sobe de R$ 2,7mm para
R$ 5,9mm [M projetado] e o pedido fecha. O cronograma com as cartas de liberação entra
no material, porque waiver esquecido é a causa número um de atraso de fechamento [E].

---

# A1-13 · Eletro Horizonte. Quem quer desconsolidar precisa saber o preço

**A empresa.** Distribuidora de eletroportáteis, Extrema MG, receita R$ 180mm,
importadora. Vende para varejo médio e e-commerce, prazo 45 e 60 dias. Alavancagem
2,9x [M], covenants de um CRI antigo do galpão apertando em 3,0x.

**O que ela apresenta e pede.** O pedido vem preciso, CFO sofisticado: "cessão
definitiva sem coobrigação, preciso desconsolidar R$ 15mm até o fechamento do
trimestre por causa do covenant".

**Os números.** Carteira R$ 31mm [M], boa: maior sacado 7% [M], perda t=180 1,2% [M],
diluição 2,8% [M]. O caso não tem defeito de carteira. Tem um problema de preço e um
de prazo.

**O que o sistema deve fazer.** Responder tecnicamente ao pedido técnico. Sem
coobrigação, o fundo precifica a perda esperada da carteira em vez do risco do
cedente: spread sobe 0,6 a 1,1 p.p. a.m. sobre a cessão com regresso [E], e o fundo
exige verificação de lastro reforçada, amostragem maior e trilha de entrega completa,
o que empurra o cronograma. E o ponto contábil que o gabarito cobra: a
desconsolidação depende da transferência substancial de riscos e benefícios; recompra
compulsória, sobrecolateral excessivo ou qualquer mecanismo de retorno da perda ao
cedente derrubam o desreconhecimento na auditoria [E, princípio contábil], e o
covenant continua estourado com uma taxa mais cara paga no meio.

**O racional.** Estrutura que fecha: cessão definitiva de carteira selecionada, sacados
de melhor histórico, 60% do volume [M], sem regresso e sem mecanismo de retorno, com
preço aceito; e o restante cedido com regresso na taxa boa, ficando no balanço. A
seleção entrega os R$ 15mm de desreconhecimento com o menor custo total [M na conta
do caso]. Pergunta única do lote: qual auditoria assina o balanço, porque o desenho da
cessão precisa passar pelo auditor antes do fechamento, não depois.

---

# A1-14 · Alimentos Bandeira. Canhoto é a prova, e não tem

**A empresa.** Indústria de alimentos refrigerados, Chapecó, receita R$ 42mm. Vende
para mercados e food service, prazo 21 dias, entrega própria e por transportadora.

**O que ela apresenta e pede.** R$ 3mm por mês. Base boa, números bons: perda 1,0%
[M], diluição 3,1% [M], pulverizada.

**O achado.** Amostragem de lastro em 60 títulos: 19 sem comprovante de entrega
recuperável, **32% da amostra** [M]. Entrega própria sem canhoto digitalizado, o
papel fica no caminhão, se acha "quando precisa". Nas entregas por transportadora, o
comprovante existe no portal da contratada, mas ninguém baixa.

**O que o sistema deve fazer.** Medir por amostra e extrapolar com intervalo, nunca
afirmar sobre o todo: "na amostra de 60, 32% sem comprovação recuperável em 5 dias
úteis". Distinguir os dois problemas: o da transportadora é recuperável por
integração com o portal, ~40% das entregas [M]; o da frota própria é processo novo.
Pergunta: se a empresa aceita implantar canhoto digital no aplicativo de entrega,
porque isso muda a elegibilidade de toda a originação futura.

**O racional.** Duplicata sem prova de entrega dá ao sacado defesa contra a cobrança
do fundo, e verificação de lastro reprova [C, exigência padrão de regulamento]. O
caso não é de recusa, é de esteira: operar já com o bloco comprovável, transportadora
mais os títulos com canhoto localizado, ~55% da carteira [M], e subir para 95% em 60
dias com a digitalização. O material declara o percentual comprovável e o plano,
porque o fundo vai amostrar de qualquer jeito, e achar 32% sem aviso mata a operação;
achar 45% comprovável com plano de 95% em execução é outro caso.

---

# A1-15 · Embalagens Rio Claro. Catorze meses de vida

**A empresa.** Fabricante de caixas de papelão para e-commerce, Rio Claro, fundada há
26 meses, faturando há 20, base analítica confiável de **14 meses**. Receita anualizada
R$ 58mm crescendo 40% a.a. Prazo 30 dias. Sócios vieram de uma grande do setor.

**O que ela apresenta e pede.** R$ 4mm de capacidade, crescendo com a receita.
Transparente sobre a idade: "sei que histórico é pouco, o que dá pra fazer?".

**Os números.** Os 14 meses são bons: perda t=120 de 0,6% [M], diluição 1,7% [M],
maior sacado 9% [M], um e-commerce grande. Mas t=180 só existe para 8 safras, e
nenhuma régua de 24 meses fecha.

**O que o sistema deve fazer.** Dizer o que o histórico curto custa, sem inflar nem
dramatizar: fundos que exigem 24 meses [E, prática usual] estão fora por ora; os que
aceitam 12 vão dar limite inicial menor com rampa. E compensar com o que existe:
enriquecer os sacados, porque 70% da carteira [M] é contra e-commerces e indústrias
com crédito público avaliável, e a qualidade do sacado substitui parcialmente o
histórico do cedente. Pergunta: se os contratos com os 3 maiores preveem volume, o
que daria previsibilidade à originação futura.

**O racional.** Limite inicial de R$ 2mm com rampa trimestral até R$ 4mm em 9 meses
[E, desenho usual de cedente novo], coobrigação cheia, revisão a cada trimestre com a
safra nova entrando na régua. O material compensa a idade com granularidade: régua
completa dos 14 meses, aberta por mês, sem nenhum buraco, mais o mapa de crédito dos
sacados. Para cedente novo, a transparência absoluta é o único colateral reputacional
disponível, e o gabarito cobra essa frase de posicionamento no material.

---

# A1-16 · Hospitalar Ibirapuera. O bloco público dentro da carteira privada

**A empresa.** Distribuidora de materiais hospitalares descartáveis, São Paulo,
receita R$ 75mm. Vende para hospitais privados, 62% da carteira, clínicas, 20%, e
prefeituras e secretarias por licitação, **18%** [M]. Prazo privado 45 dias, público
"30 dias de edital, 90 na vida real".

**O que ela apresenta e pede.** R$ 6mm de capacidade sobre a carteira toda, sem
distinguir os blocos.

**Os números.** Bloco privado: perda 1,1% [M], DSO 51 [M]. Bloco público: perda formal
zero, ninguém dá baixa em prefeitura, DSO **107 dias** [M], e R$ 640k [M] de títulos
acima de 180 dias contra dois municípios, empenhados e não liquidados.

**O que o sistema deve fazer.** Cortar a carteira em dois na primeira passada, porque
os regulamentos tratam sacado público de forma própria e muitos o vedam [E, prática
usual, a citar por fundo no corpus]. No bloco público, aplicar a régua de estágio da
despesa: empenhado, liquidado, pago, e classificar os R$ 640k velhos pelo que são,
crédito sem liquidação, expectativa e não recebível. Perguntas: dos títulos públicos,
quais têm nota de liquidação emitida; e se os contratos com os municípios admitem
cessão, porque a administração às vezes exige anuência [E].

**O racional.** Operar a porta 1 sobre o bloco privado, 82% da carteira, onde o caso é
limpo e a capacidade já atinge ~R$ 4,9mm [M]. Para o bloco público, o caminho é outro
e específico: os créditos federais teriam AntecipaGov, mas municípios não; fundos que
compram sacado público existem e precificam o atraso de 107 dias, não a perda [E]. A
recomendação honesta: ceder o privado já, tratar o público como trilha separada, e não
deixar o bloco lento contaminar o preço do bloco bom.

---

# A1-17 · Insumos Guaporé. O irmão que compra da irmã

**A empresa.** Revenda de insumos industriais, Serra ES, receita R$ 51mm. Vende para
metalúrgicas e montadoras de esquadrias. Sócio fundador tem uma segunda empresa, uma
esquadria, cliente da primeira.

**Os números.** A esquadria do sócio responde por **9,2% da carteira** [M], CNPJ com
raiz distinta, mesmo sócio majoritário no quadro [M em consulta societária]. Prazo
concedido a ela: 90 dias, contra 45 da tabela [M]. E paga sistematicamente no limite.

**Defeito plantado.** Venda intercompany não declarada como parte relacionada, com
prazo privilegiado, dentro da base oferecida à cessão.

**O que o sistema deve fazer.** O cruzamento societário dos sacados é passo
obrigatório, não opcional, e aqui ele decide o caso. Detectada a relação: excluir o
sacado do borderô antes de qualquer apresentação a fundo, porque regulamento veda
crédito entre cedente e devedor do mesmo grupo [C SB Crédito, e prática geral], e
porque a duplicata contra parte relacionada é exatamente o instrumento clássico de
fraude de lastro, ainda que aqui seja venda real. Pergunta: se há outras relações
societárias ou familiares na base de sacados, formulada de forma neutra e de uma vez.

**O racional.** Carteira ex-relacionada: 90,8%, e o caso fica limpo [M: perda 1,3%,
concentração ok]. O material declara a exclusão feita e o critério, porque o fundo vai
rodar o mesmo cruzamento e achar; a mesa que exclui antes e declara ganha a confiança
que a mesa que deixa para o fundo achar perde. E a nota de gestão: 9,2% da carteira a
90 dias para empresa do sócio é, na prática, um empréstimo intercompany financiado
pelo giro, e o dono precisa ouvir isso com o número na frente.

---

# A1-18 · Calçados Monte Belo. A conta da migração do factoring

**A empresa.** Indústria de calçados femininos, Nova Serrana, receita R$ 33mm. Vende
para lojistas em todo o país, prazo 60 dias. Opera com duas factorings há 6 anos,
deságio médio de 3,2% a.m., cedendo R$ 1,8mm por mês.

**O que ela apresenta e pede.** "Queria uma taxa melhor, mas factoring me atende, é
rápido e sem burocracia." Ceticismo declarado com "banco e fundo".

**Os números.** Custo atual: R$ 1,8mm/mês a prazo médio de 54 dias [M] e 3,2% a.m. dá
deságio efetivo de ~5,8% por operação, **R$ 104k por mês, R$ 1,25mm por ano** [M],
3,8% da receita. Perda t=180 de 2,2% [M], pior que os casos anteriores, e é
exatamente por isso que ela está no factoring: o crédito do lojista pequeno é fraco.
Liquidação pontual 71% [M], abaixo do piso de 75% do SB [C].

**O que o sistema deve fazer.** Fazer a conta completa da migração sem prometer o que
a carteira não sustenta: com perda de 2,2% e pontualidade de 71%, a taxa de
multicedente não vem no piso da banda; a faixa realista é 2,3% a 2,6% a.m. [E], não
1,5%. Ainda assim: a 2,45% médio, o custo anual cai para ~R$ 960k, economia de
~R$ 290k por ano [M]. E responder ao ceticismo com o que ele de fato teme: o
multicedente aprova cedente em 10 a 20 dias úteis e depois opera lote a lote como o
factoring [C, esteira usual], a diferença de rotina é pequena.

**O racional.** Migração parcial primeiro: metade do volume para um multicedente,
metade mantida nas factorings por 2 trimestres, comparando na prática. Preserva a
relação que a empresa valoriza, cria concorrência real, e dá à mesa dois semestres de
liquidação para renegociar. O gabarito cobra a honestidade da taxa: prometer 1,5% aqui
seria exatamente a alucinação de faixa que a disciplina de procedência proíbe.

---

# A1-19 · Móveis Aruanã. O pedido errado que esconde dois certos

**A empresa.** Fábrica de móveis corporativos, Arapongas, receita R$ 47mm. Vende
projetos para empresas, 55% da receita, prazo 30/60/90 por medição de entrega, e
linha de escritório para revendas, 45%, prazo 45 dias.

**O que ela apresenta e pede.** "Quero uma CCB de R$ 8mm em 48 meses para dobrar a
fábrica." Chega pedindo porta 3, instrumento definido, prazo definido.

**Os números.** EBITDA R$ 4,4mm [M], alavancagem atual 1,4x [M]. A CCB de R$ 8mm
levaria a 3,2x [M], no limite do apetite para o porte [E]. Mas a carteira conta outra
história: R$ 7,1mm em aberto [M], saudável, perda 0,9% [M], e a empresa não antecipa
nada, financia 100% do giro com capital próprio e fornecedor.

**O que o sistema deve fazer.** Respeitar o pedido e devolvê-lo melhorado, porque o
pedido é o sintoma e o objetivo é a expansão. A leitura: o caixa preso no giro é
~R$ 5mm permanentes [M]; uma cessão rotativa libera a maior parte disso a custo de
porta 1, e a CCB necessária cai de R$ 8mm para ~R$ 4mm, mantendo a alavancagem em
2,2x [M], dentro de qualquer apetite. O custo combinado das duas pernas é menor que o
da CCB cheia [M na conta do caso], e a aprovação da CCB menor é mais rápida e mais
barata.

**O racional.** Estrutura em duas pernas com sequência: cessão primeiro, que sai em
semanas e já financia o início da obra civil; CCB de R$ 4mm na porta 3 em paralelo,
com a cessão fiduciária da carteira remanescente como parte da garantia. O gabarito
cobra a postura: nunca dizer "seu pedido está errado"; dizer "o pedido fecha, e fecha
melhor assim, pelos números". A decisão é do dono, com as duas contas na mesa.

---

# A1-20 · Aços Pirassununga. Grande o bastante para escolher

**A empresa.** Distribuidora de aços planos, Pirassununga, receita R$ 260mm. Vende
para metalúrgicas, implementadoras e serralherias grandes, 340 sacados. Prazo 45 e 60
dias. Carteira média R$ 39mm [M]. Cede R$ 6mm/mês em dois multicedentes a 1,9% a.m.
média.

**O que ela apresenta e pede.** O controller estudou: "faz sentido montar nosso
próprio FIDC? Vi que os grandes fazem".

**Os números.** A carteira sustenta a pergunta: R$ 39mm médios, perda t=180 de 0,8%
[M], diluição 2,1% [M], maior grupo 6,8% [M], histórico de cessão limpo, recompra
1,2% [M]. É o único caso do banco em que o veículo próprio entra legitimamente na
conta.

**O que o sistema deve fazer.** A conta de break-even completa, dos dois lados.
Dedicado: custo fixo de R$ 450k a R$ 650k/ano [E: administrador, custodiante, gestor,
verificação de lastro, auditoria, rating], 1,2% a 1,7% sobre a carteira média, mais
sênior a CDI + 2,5% a 3,5% [E], mais a subordinada de 15% a 25% [E] que a empresa
retém, ou seja R$ 6mm a R$ 10mm de capital próprio imobilizado no fundo. Multicedente
atual: 1,9% a.m. tudo incluído, zero capital retido, zero estrutura. A travessia fecha
[M na conta do caso] se a carteira cedida passar de ~R$ 25mm/mês ou se o custo
all-in do dedicado ficar 0,4 p.p. a.m. abaixo do multicedente, o que a carteira atual
alcança na margem.

**O racional.** A resposta não é sim nem não, é sequência: rodar processo competitivo
agora com a carteira limpa para comprimir o 1,9%, porque cedente deste porte com esta
régua tem preço melhor na mesa [E]; e em paralelo cotar o dedicado com 2 ou 3
gestoras que estruturam para terceiros, usando as propostas de cada lado para
disciplinar o outro. Decisão em 90 dias com as duas curvas de custo reais na mesa, e
a subordinada tratada pelo que é, alocação de capital do acionista com retorno
calculável, não um pedágio. O gabarito cobra as duas contas completas e a recusa de
responder por reputação, "os grandes fazem", em vez de por número.

---

# O que este banco cobra do sistema, em resumo

| Elo | Casos que o exercitam |
|---|---|
| Ler o pedido e achar a operação real | 02, 07, 13, 19, 20 |
| Calcular o que ninguém pediu | 03, 04, 09, 10, 11 |
| Cross-reference que acha o escondido | 02, 03, 06, 09, 10, 12, 17 |
| Dizer a lacuna e o que ela custa | 05, 12, 14, 15 |
| Perguntar só o resíduo, com gatilho | Todos, o lote está em cada caso |
| Recomendar com cláusula e conta | Todos, o racional está em cada gabarito |
| Dizer não, ou ainda não, com números | 06, 08, 10, 18 |
| Recusar promessa que a base não sustenta | 13, 18, 20 |

Os casos 01 e 15 são também réguas de comportamento: no 01 o sistema não pode
interrogar, no 15 não pode inflar. Errar ali é errar postura, não conta.

## Próximos bancos, mesma densidade

B2 fornecedor de grande grupo, E1 cartão, C1 serviços, L1 carteira de crédito
originada, D4 contrato recorrente, G4 mensalidades, J3 obra. Vinte casos cada nos
núcleo. Os geradores de dados sintéticos de cada caso seguem o padrão da Vertentes,
que implementa o A1-03 desta série na versão completa, com acervo de 21 arquivos.
