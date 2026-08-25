# House Playbook Offroad · v1 completo

> Fonte canônica do conhecimento operacional da mesa. Cada procedimento abaixo deve ser
> carregado no contrato de procedimento (`procedure-contract`) como `draft` e só promovido
> com aprovação de conteúdo do fundador, gold cases e templates compatíveis, conforme o
> ADR 0013 e a Constituição Operacional. Este arquivo substitui o esqueleto v0.

## Como ler

Cada procedimento carrega, no corpo ou implícito no texto: o que a mesa precisa (**nunca**
vira pergunta direta ao cliente; ver escada de resolução no Blueprint), onde a informação
mora, como verificar, a armadilha, como o mercado lê, o que alimenta a jusante, e a
autoridade:

| Autoridade | Significa |
|---|---|
| LEI | Regra jurídica/regulatória, com fonte e vigência; exige revisão especializada antes de imprimir |
| DEF | Definição financeira ou contábil |
| CASA | Política da Offroad, versionada |
| MERCADO | Prática observada, com data; com mais de 6 meses rebaixa para HEURÍSTICA |
| HEURÍSTICA | Atalho de mesa, contestável com justificativa |

Módulos: M0 intake · M1 empresa e setor · M2 qualidade dos números · M3 dívida ·
M4 operação · M5 estruturação · M6 pricing · M7 materiais · M8 mercado · M9 red flags ·
M10 linguagem e conduta.

---

# MÓDULO 0 · INTAKE E PEDIDO DE INFORMAÇÃO (IN-01 a IN-26)

O objetivo do módulo: capturar a intenção em minutos, montar a lista certa por arquétipo, e
garantir que o cliente nunca seja interrogado. Tudo aqui obedece à escada de resolução.

### IN-01 · A captura do pedido
Sete perguntas, e só sete: CNPJ; quanto (faixas); para quê (menu de dono); para quando;
prazo que faria sentido pagar; o que existe de garantia (menu com "não sei" válido); quem
financia hoje (opcional). **Proibido perguntar**: faturamento, EBITDA, dívida, margem. Esses
números vêm dos documentos; perguntados ao dono, produzem o número da memória, que depois
conflita com o documento e abre a pior conversa possível do processo. Armadilha: formulário
longo no dia zero mata a conversão; cada pergunta a mais precisa justificar o que destrava.
A jusante: arquétipo, lista dia-zero, primeira sombra de estrutura. CASA.

### IN-02 · Resolução do CNPJ
Do CNPJ derivam: razão social, forma societária (S.A. ou limitada, que já abre e fecha
instrumentos antes de qualquer análise), CNAE (liga a lente setorial do M1), idade, quadro
societário e participações. Verificar: CNAE declarado contra a descrição que o cliente deu
do negócio; divergência é sinal de holding operacional ou de mudança de atividade, ambos
relevantes. Armadilha: o CNPJ informado pode ser o da holding e a operadora ser outra
entidade; confirmar qual entidade fatura e qual tomaria a dívida (liga ES-36). DEF.

### IN-03 · Do uso declarado ao arquétipo
Menu em linguagem de dono: "expandir ou construir" → expansão/capex; "reforçar o caixa do
dia a dia" → giro; "comprar uma empresa" → aquisição; "trocar dívida cara ou curta" →
refinanciamento; "comprar máquinas" → equipamentos; "temos investidor de venture e
precisamos de prazo" → venture debt; "antecipar recebíveis em escala" → recebíveis/FIDC.
O cliente nunca vê a palavra arquétipo. Verificar: uso declarado contra o que os números
depois contam (OP-01); divergência não é mentira, é diagnóstico. CASA.

### IN-04 · Lista dia-zero: expansão/capex
Seis documentos + até quatro perguntas, cada item com o porquê na tela: balanços fechados
dos 3 últimos anos com notas ("é a base; sem eles nenhum fundo abre conversa"); balancete
do ano corrente ("os fundos não decidem só com o ano passado"); relação de dívidas se
existir ("se não tiver, montamos dos documentos"); orçamento e cronograma do projeto
("fundo financia projeto, não planilha"); contratos relevantes já assinados do projeto;
faturamento mensal dos últimos 24 meses ("mostra tendência e sazonalidade"). Perguntas:
quanto do projeto já foi gasto e com que dinheiro; existe licença/alvará pendente; o
projeto para de pé se vier menos dinheiro; quem executa a obra. CASA.

### IN-05 · Lista dia-zero: capital de giro
Balanços + balancete + faturamento mensal 24m + abertura de clientes e fornecedores por
prazo se existir + extratos de linhas de curto prazo. Perguntas: o aperto é sazonal ou
permanente; o prazo de recebimento mudou (quem mudou: cliente grande novo?); existe
antecipação a fornecedor em uso (liga D-06). Armadilha do arquétipo: giro estrutural
financiado com dívida curta renovável é a operação de alongamento disfarçada mais comum do
mercado; a lista precisa capturar o estoque de linhas curtas (D-05). CASA.

### IN-06 · Lista dia-zero: refinanciamento
Balanços + balancete + relação completa de contratos com cronograma (aqui ela é essencial,
não opcional) + covenants existentes + certidões de gravame das garantias dadas. Perguntas:
o que motivou (custo, prazo, covenant apertado, concentração de banco); existe waiver ou
repactuação em curso; alguma garantia fica livre no refi. A jusante: D-20 (compatibilidade
com covenants existentes) e D-29 (cascata de cross-default) tornam-se centrais. CASA.

### IN-07 · Lista dia-zero: aquisição
Tudo do dia-zero de expansão para a compradora + o que existir da adquirida (balanços,
faturamento, contrato ou LOI, due diligence se houver) + estrutura pretendida da compra
(quotas, ativos, incorporação). Perguntas: preço e forma de pagamento; earn-out; dívida da
adquirida assumida ou quitada no fechamento; sinergias contam no plano (se sim, tratadas
como premissa, nunca como fato, ver Q-01). LEI no que toca estrutura da aquisição. CASA.

### IN-08 · Lista dia-zero: equipamentos
Orçamentos/proformas dos bens + balanços + balancete + uso e vida útil esperada. Perguntas:
bem nacional ou importado (FINAME exige credenciamento e conteúdo nacional); novo ou usado
(usado fecha portas de leasing e FINAME); o bem gera receita própria mensurável. A jusante:
elegibilidade FINAME/leasing e AF do próprio bem como garantia natural. CASA.

### IN-09 · Lista dia-zero: venture debt
Balanços/gerencial + métricas mensais (receita recorrente, churn, queima, runway) + cap
table + termos da última rodada. Perguntas: quanto de runway existe hoje; a rodada seguinte
está mapeada; o board aprova dívida; warrant é aceitável. Armadilha: empresa sem sponsor
institucional no cap table não é venture debt, é crédito comum de empresa deficitária, e a
resposta honesta costuma ser "ainda não" (liga RF-19). MERCADO.

### IN-10 · Lista dia-zero: recebíveis/FIDC
Aging da carteira + análitico da carteira (loan tape) no formato que o sistema emitir +
política de crédito e cobrança + histórico de perdas 24m+ + balanços. Perguntas: quem são
os sacados típicos; existe concentração deliberada; a carteira já foi cedida a alguém
(D-07); o faturamento é performado na entrega ou por medição. A jusante: vertical própria
de recebíveis; este playbook cobre o intake, a análise de carteira tem procedimentos
próprios. CASA.

### IN-11 · Mínimo vs ideal
O mínimo abre a análise; o ideal precifica. A diferença é dita ao cliente com honestidade:
"com isto conseguimos avaliar; com aquilo conseguimos defender o preço". Nunca travar o
início por item do ideal. Verificar: item marcado como mínimo precisa ser de fato
bloqueador (teste: qual decisão fica impossível sem ele?); lista mínima com item cosmético
é lista inflada, e lista inflada é abandono de cliente. CASA.

### IN-12 · A régua de suficiência
Computada por classificação automática do que chegou, nunca por checkbox. Mostra mínimo N
de M e ideal X de Y, com nomes do que falta em linguagem de dono. Sobe um ZIP, a régua
reage sozinha ("reconhecemos os balanços de 2023 e 2024; falta 2025 ou o balancete").
Armadilha: régua que trava em item que o sistema classificou errado; sempre oferecer "já
enviei isto" que roteia para revisão em vez de discutir com o cliente. CASA.

### IN-13 · A escada, operacionalizada
Antes de qualquer pergunta sair: (1) buscar na sala classificada; (2) tentar derivação com
trace; (3) fonte pública; (4) só então redigir pergunta. O sistema registra por que cada
pergunta desceu até o degrau 4 (qual busca falhou), e esse registro é auditável. Pergunta
que sai sem esse rastro é defeito. CASA.

### IN-14 · Regras do lote
Máximo 4 itens por padrão, nunca mais de 5 (Constituição 2.2). Priorização: bloqueador de
entendimento > muda capacidade/estrutura > muda aderência a mandato > melhora material.
Item de diligência do fundo ou de fechamento nunca entra no lote. Próximo lote só depois de
o atual ser lido e resolvido. A jusante: E06 do blueprint. CASA.

### IN-15 · Como se escreve uma pergunta ao cliente
Anatomia fixa: a pergunta em linguagem simples + "por quê" em uma frase + o que destrava +
como responder (texto livre, anexo do jeito que estiver, ou "não tenho"). Exemplo padrão
(deriva de D-06): "Sua empresa tem convênio com banco para antecipar pagamento a
fornecedores (às vezes chamado risco sacado ou confirming)? Se sim, com que limite? Por
quê: isso muda como os fundos enxergam sua dívida total, e é melhor apresentarmos o número
certo do que o fundo descobrir depois." Nunca duas perguntas numa; nunca jargão sem
tradução. CASA.

### IN-16 · Ausência registrada
"Não tenho", "não se aplica" e "só depois de NDA" são respostas válidas, registradas com
data e autor, e mudam a análise em vez de travá-la. Ausência de auditoria não bloqueia
análise; bloqueia certos compradores e o memo diz isso (liga Q-08, MK-12). Nunca insistir
no mesmo item mais de uma vez sem fato novo. CASA.

### IN-17 · Nunca pedir o que já chegou
Antes de emitir lote, conferir cada item contra a sala classificada E contra respostas
anteriores. Pedir de novo o que o cliente já mandou é o defeito que mais destrói confiança
no produto inteiro; tratado como bug de severidade máxima, não como inconveniente. CASA.

### IN-18 · A devolução do dia zero
Ao fim do intake o cliente recebe: a operação em uma frase (para confirmar), faixas
honestas do que o mercado pratica para o perfil (prazo, garantia, formato, sem prometer
taxa), e a lista do que enviar. A calibragem de expectativa começa aqui, antes de qualquer
documento, porque expectativa errada descoberta no fim custa a relação. MERCADO.

### IN-19 · Triagem precoce do pedido que não anda
Combinações que não vão a lugar nenhum recebem resposta honesta imediata, sem abrir caso:
tíquete abaixo do piso operacional da casa; urgência de dias com sala vazia; uso que a casa
não atende (special situations, pré-insolvência). A mensagem diz o porquê e, quando existe,
o caminho alternativo. Abrir caso que não anda é pior que declinar cedo. CASA.

### IN-20 · O assessor como usuário
O assessor opera múltiplos clientes: intake em nome do cliente, com papel declarado e
autorização registrada. As listas e perguntas vão para quem pode responder (o assessor
decide se repassa ou responde). Confidencialidade entre os casos do mesmo assessor é a
mesma que entre clientes distintos. CASA.

### IN-21 · O que não se pede cedo
Dados nominais de clientes do cliente, contratos com terceiros sob NDA, dados pessoais de
sócios além do societário público. Esses itens têm hora (pós-NDA, diligência do fundo) e
pedi-los cedo cria atrito e risco sem análise que os use. LGPD aplica: minimização desde o
intake. LEI.

### IN-22 · Urgência declarada vs real
Toda urgência declarada é testada contra o cronograma de vencimentos (D-03) e o caixa
(D-26). Urgência real com causa nomeada muda a sequência de mercado (MK-17). Urgência
retórica ("para ontem") sem causa é sinal de expectativa a calibrar, não de processo a
acelerar. HEURÍSTICA.

### IN-23 · A operação de liquidez disfarçada
Pedido de "expansão" com cobertura de 12 meses abaixo de 1,0x sem a nova dívida é operação
de liquidez, e o memo a tratará como tal (sem eufemismo, com a solução honesta: alongar,
reforçar, reperfilar). Detectar no intake pelo cruzamento dia-zero: parede de vencimento +
caixa curto + pedido "de crescimento". A jusante: OP-01, E08. CASA.

### IN-24 · Grupo detectado no intake
Sinais: CNPJ de holding, faturamento em entidade diferente da declarada, garantias em nome
de terceiros do grupo, mútuos citados. Ao detectar, a lista dia-zero expande para as
entidades relevantes (balanços das operadoras, organograma societário) ANTES da análise
começar errada na entidade errada. Liga EMP-10 e ES-36. CASA.

### IN-25 · Piso e teto operacionais
A casa define tíquete mínimo operacional (abaixo do qual o custo do processo não se paga
para ninguém, nem para o cliente) e comunica com honestidade, oferecendo o caminho de
mercado adequado ao tamanho (banco, factoring, FIDC pulverizado). Teto: operações acima da
capacidade de distribuição atual entram com expectativa explícita de co-assessoria. CASA.

### IN-26 · O pedido como fato datado
Tudo que o cliente declarou no intake vira fato registrado com data e autor (valor
pretendido, uso, prazo, urgência, garantias declaradas). Quando os documentos contarem
outra história, a divergência entre declarado e verificado é diagnóstico de qualidade da
informação do cliente, entra na análise (Q-09 analogamente) e nunca é editada em silêncio.
CASA.

---

# MÓDULO 1 · LEITURA DA EMPRESA E DO SETOR (EMP-01 a EMP-30)

O crédito é pago pelo negócio, não pela planilha. Este módulo é o que a mesa entende antes
de acreditar em qualquer projeção, e é a matéria-prima da seção "empresa" do memo.

### EMP-01 · O modelo de negócio em uma página
Responder em texto próprio, nunca colado da apresentação do cliente: o que a empresa vende,
para quem, como cobra, o que a diferencia, e por que o cliente dela não troca. Verificar:
a descrição bate com a composição da receita nos números (uma "empresa de tecnologia" com
80% da receita em revenda de hardware é uma distribuidora). Armadilha: aceitar a
autodescrição; o mercado lê o memo de quem entendeu o negócio em duas linhas. A jusante:
toda a narrativa do memo (MA-08). CASA.

### EMP-02 · Cadeia de valor e captura de margem
Onde a margem nasce (produto, serviço, logística, marca, regulação) e quem mais na cadeia
tem poder de capturá-la. Verificar: margem bruta contra os pares do setor; margem acima dos
pares exige explicação física (escala, integração, nicho), não adjetivo. Armadilha: margem
alta por preço de transferência com parte relacionada (liga Q-07). A jusante: risco de
compressão de margem nos cenários (E07). DEF.

### EMP-03 · Clientes: concentração e qualidade
Top 1/5/10 por receita, prazo médio real por cliente relevante, contratos versus pedido a
pedido, histórico de renovação e de perda. Regra de leitura: acima de 30% em um cliente, o
crédito da empresa é o crédito do cliente, e a mesa analisa o cliente também (rating
público, setor, notícia). Armadilha: concentração escondida por CNPJs múltiplos do mesmo
grupo econômico comprador. A jusante: Q-06, cenário de perda do maior cliente (E07),
elegibilidade de carteira (IN-10). CASA.

### EMP-04 · Fornecedores e dependências
Fornecedor único ou dominante, com ou sem contrato, nacional ou importado, prazo e moeda de
compra. Verificar: dependência sem contrato de fornecimento é risco operacional nomeado;
compra importada liga exposição cambial (D-12, Q-12). Armadilha: o prazo de fornecedores
esticado que na verdade é risco sacado (D-06). MERCADO.

### EMP-05 · Barreiras de entrada reais
O que impede um concorrente com capital de tomar o mercado: licença, escala, marca,
contrato de longo prazo, ativo físico raro, tecnologia. Teste: se a resposta for "nosso
atendimento", a barreira é fraca e o memo não a chama de barreira. A jusante: sustentação
da projeção de receita e da margem no prazo da dívida. HEURÍSTICA.

### EMP-06 · Regulação do setor
O que a regulação dá e tira: preço regulado, licença de operação, passivo regulatório,
dependência de política pública (subsídio, programa governamental, FIES, farmácia popular).
Receita dependente de decisão de governo carrega risco político nomeado no memo, com o
histórico de mudanças. LEI no conteúdo específico; CASA na obrigação de mapear.

### EMP-07 · Ciclicidade e posição no ciclo
O setor é cíclico? Onde estamos no ciclo? A regra da mesa: dívida dimensionada no topo do
ciclo com números do topo quebra no fundo; capacidade calculada com margem média de ciclo,
não com a do melhor ano (liga Q-10, ES-01). Verificar: os 3 anos de histórico cobrem fases
diferentes do ciclo ou só a subida? MERCADO.

### EMP-08 · Sazonalidade intra-ano
Meses de pico e vale de receita, estoque e caixa. Alimenta o desenho de amortização (ES-08)
e desmonta a foto de 31/12 (Q-04). Verificar com faturamento mensal 24m do intake.
Armadilha: comparar trimestres diferentes entre anos. DEF.

### EMP-09 · Competição e participação
Quem são os 3 a 5 concorrentes reais, o que aconteceu com participação nos últimos anos, e
se o crescimento projetado exige tomar mercado de quem tem mais capital. Crescer 30% ao ano
num mercado que cresce 5% significa tomar 25% de alguém; o memo diz de quem e por quê.
HEURÍSTICA.

### EMP-10 · Estrutura societária completa
Organograma do grupo com participações, onde está o caixa, onde está a dívida, onde estão
os ativos e onde está a receita. Verificar contra o quadro societário público e contra os
balanços de cada entidade relevante. Armadilha clássica: garantia ofertada em entidade que
não é a devedora, receita numa entidade e ativo noutra sem contrato formal entre elas. A
jusante: quem emite (ES-36), garantidores (ES-37), consolidação (D-10, D-11). DEF.

### EMP-11 · Acordo de acionistas e mudança de controle
Existe acordo? Cláusulas de venda conjunta, preferência, veto? A dívida proposta dispara
alguma cláusula? Mudança de controle é evento de vencimento antecipado padrão (ES-34) e
precisa casar com o acordo existente. LEI.

### EMP-12 · Governança de fato
Conselho existe e se reúne? Auditoria (Q-08)? Comitês? Família na gestão com que papéis?
Regra de leitura: governança se mede pelo que acontece quando o fundador discorda do
número, e a mesa pergunta por exemplos concretos (última decisão revertida por conselho).
O memo descreve a governança real, não o organograma decorativo. HEURÍSTICA.

### EMP-13 · Pessoa-chave e sucessão
De quem a empresa depende de forma única (fundador comercial, técnico único). Idade,
sucessão desenhada ou não, seguro de vida chave se existir. Empresa de dono com sucessão
aberta e dívida de 7 anos é um descasamento que o memo nomeia. A jusante: covenant de
permanência, RF-11. MERCADO.

### EMP-14 · Histórico dos sócios
Processos relevantes, restritivos, mídia negativa, empresas anteriores (e como terminaram),
relacionamento bancário histórico. Fonte: bases públicas e a conversa direta. Achado
relevante não descoberto pela mesa e descoberto pelo fundo é falha grave (LC-12). Armadilha
de conduta: pesquisar é obrigação; esconder o achado do memo é veto (RF-19). CASA.

### EMP-15 · Gestão abaixo do dono
CFO existe ou é o contador terceirizado? Controladoria? Comercial estruturado? A qualidade
da informação que chega (prazo e consistência das respostas no intake) é o melhor proxy da
qualidade da gestão, e a mesa registra esse proxy como observação. HEURÍSTICA.

### EMP-16 · Sistemas e qualidade da informação
Qual ERP, desde quando, o que é controlado em planilha paralela. Balancete que sai em dois
dias é um sinal; balancete que leva três semanas é outro. A jusante: confiança da
conciliação (E05), esforço de diligência que o fundo vai estimar. HEURÍSTICA.

### EMP-17 · Ambiental e licenças
Licenças de operação vigentes e prazos, passivo ambiental conhecido, embargos históricos.
Em setores de terra, água e resíduo (agro, indústria química, mineração, frigorífico) isso
é seção do memo, não rodapé. LEI no conteúdo; CASA na obrigação.

### EMP-18 · Seguros
Cobertura de dano, lucro cessante, responsabilidade civil, D&O, chave. Ativo essencial sem
seguro adequado vira condição precedente típica (ES-33, MA-20). DEF.

### EMP-19 · Obsolescência e tecnologia
O produto/ativo corre risco de substituição no prazo da dívida (tecnologia, regulação
energética, hábito de consumo)? Dívida de 7 anos sobre ativo com vida econômica de 4 é
descasamento estrutural que preço não conserta. HEURÍSTICA.

### EMP-20 · Por que agora
A história do pedido: por que este capital, neste tamanho, agora. A resposta boa é
concreta (contrato assinado, capacidade esgotada, janela de aquisição). A resposta ruim é
genérica ("aproveitar oportunidades"). O "por que agora" abre o memo e é a primeira coisa
que o comitê do fundo discute. CASA.

## Lentes setoriais (EMP-21 a EMP-30)

Cada lente lista o que a mesa pergunta ao caso (não ao cliente) naquele setor, além do
padrão. A lente entra na análise e nas perguntas de diligência antecipadas (MA-22).

### EMP-21 · Agronegócio
Safra própria ou originação de terceiros; exposição a preço de commodity e hedge real
(quanto do volume, a que preço, com quem); armazenagem própria ou de terceiro; risco
climático e seguro rural; Funrural e passivo fundiário; terra própria ou arrendada (prazo
dos arrendamentos versus prazo da dívida); sazonalidade de caixa por cultura; barter e seus
efeitos no balanço. Instrumentos naturais: CPR, CRA, NCE se exporta. MERCADO.

### EMP-22 · Varejo
Same-store sales versus crescimento por abertura; aluguel como alavancagem operacional
(IFRS 16, D-08); estoque por loja e ruptura; e-commerce canibaliza ou soma; prazo médio
recebido (cartão) versus pago; shopping versus rua; sazonalidade de datas. Queda de SSS com
abertura acelerada é a máquina clássica de destruir caixa no varejo. MERCADO.

### EMP-23 · Indústria
Utilização de capacidade real (três turnos?); idade média e capex de manutenção verdadeiro
(Q-03); energia como custo e risco; insumo importado e casamento cambial; carteira de
pedidos versus faturamento; certificações que travam cliente (automotivo, aeroespacial,
farmacêutico). MERCADO.

### EMP-24 · Serviços recorrentes e software
Receita recorrente de contrato versus reapresentada como recorrente; churn bruto e líquido
por safra; CAC e payback; concentração; sazonalidade de renovação; passivo de serviço a
prestar (receita diferida). Regra: recorrência só vale o churn que a comprova. MERCADO.

### EMP-25 · Saúde
Fonte pagadora (particular, convênio, SUS) e prazo real de cada uma; glosa histórica e
provisão; credenciamentos e descredenciamento como risco de receita; corpo clínico próprio
ou aberto (dependência de médico-chave); regulação ANS quando operadora. MERCADO.

### EMP-26 · Educação
FIES/financiamento público no histórico e na projeção; evasão por safra; sazonalidade de
matrícula; capacidade física versus alunos; ensino a distância e canibalização de mensalidade.
MERCADO.

### EMP-27 · Energia
Contratado (PPA, prazo, contraparte, indexador) versus mercado livre; risco de geração
(GSF em hidro, curva em solar/eólica); O&M próprio ou contratado; a SPE e a cascata
(ES-21); regulatório (MMGD, subsídios com prazo). O crédito aqui é o contrato, não a
empresa. MERCADO.

### EMP-28 · Imobiliário e incorporação
Landbank e forma de aquisição (permuta?); VGV lançado versus vendido versus repassado;
distrato histórico; obra própria ou terceirizada; SPE por projeto e o que consolida;
recebíveis performados versus a performar (ES-12); INCC no custo versus IGP/IPCA na
receita. Instrumento natural: CRI. MERCADO.

### EMP-29 · Transporte e logística
Frota própria versus agregado; idade média da frota e capex de renovação; contrato versus
spot; diesel como custo e repasse; sinistralidade e seguro; dependência de embarcador
único. AF de frota como garantia natural com liquidez conhecida. MERCADO.

### EMP-30 · Construção pesada e infraestrutura
Backlog assinado versus faturamento anual (cobertura de receita); aditivos e pleitos como
receita de qualidade inferior; medição e prazo real de recebimento (público versus
privado); consórcios e responsabilidade solidária; garantias de performance já emitidas
consumindo limite. MERCADO.


---

# MÓDULO 2 · QUALIDADE DOS NÚMEROS E SPREADING (avançado, 18 procedimentos)

### Q-01 · A régua dos ajustes de EBITDA
O mercado aceita: item não recorrente **documentado** (sinistro com boletim e seguro, multa contratual única, despesa de reestruturação com plano formal e datas, despesa pré-operacional de unidade nova com abertura). O mercado desconta na hora: "sinergias futuras", "EBITDA ajustado da administração" sem abertura item a item, aluguel pró-forma de sale-leaseback ainda não assinado, normalização de despesa "que não vai se repetir" pela terceira vez em três anos. Regra da casa: todo ajuste com memória de cálculo e fonte; ajuste que a empresa não consegue documentar aparece no memo como "EBITDA reportado vs ajustado" com a diferença explicada, nunca escondido no número cheio.
### Q-02 · Conversão de EBITDA em caixa
EBITDA − capex de manutenção − variação de capital de giro − IR pago = caixa disponível para serviço. É essa linha que paga dívida, não o EBITDA. Empresa com EBITDA de 100 e conversão de 30 é crédito de 30.
### Q-03 · Capex de manutenção vs expansão
Quando a empresa não separa (quase nunca separa): depreciação como piso de manutenção, idade média dos ativos como sanidade, entrevista com o industrial. Capex "de expansão" recorrente há cinco anos é manutenção com outro nome.
### Q-04 · Capital de giro normalizado
Balanço de 31/12 é a melhor foto do ano em muitos setores (caixa alto, estoque baixo). Pedir balancetes mensais e trabalhar com médias; a necessidade de giro real é a média, não a ponta.
### Q-05 · Reconhecimento de receita
Setores de risco: construção (POC e distrato), software (licença vs assinatura), agro (entrega física vs faturamento antecipado). Conferir política contábil na nota e cut-off do último trimestre (receita concentrada no mês 12 pede explicação).
### Q-06 · Concentração de clientes
Top 1 / top 5 / top 10 por receita, com prazo de contrato e histórico de renovação. Acima de 30% em um cliente: o crédito da empresa é o crédito do cliente, e o memo analisa o cliente também.
### Q-07 · Partes relacionadas na DRE
Receita ou custo com ligadas a preço fora de mercado infla margem. Pedir abertura e testar margem sem as ligadas.
### Q-08 · Qualidade da auditoria
Firma (big four vs local), opinião (limpa, com ênfase, com ressalva), parágrafos de incerteza de continuidade. Ressalva em estoque ou recebível é ressalva no colateral da operação. Troca de auditor recente + republicação = red flag composta (M9).
### Q-09 · Balancete vs auditado
Conciliar o balancete gerencial mais recente com o último auditado: as diferenças contam a contabilidade real da casa. Gerencial que "melhora" sistematicamente o auditado é padrão de conduta, não erro.
### Q-10 · Projeções contra o histórico
CAGR projetado vs entregue nos últimos 3 anos; margem projetada vs melhor margem histórica. Projeção acima do melhor ano da história precisa de um porquê físico (capacidade nova, contrato assinado), não de adjetivo.
### Q-11 · Sazonalidade e o mês da foto
Toda métrica com o mês de referência; comparar sempre mesmo mês contra mesmo mês.
### Q-12 · Moeda funcional e mix
Receita por moeda, custo por moeda, o descasamento líquido é o número do memo.
### Q-13 · Estoque: giro e obsolescência
Giro por linha, idade, política de provisão. Estoque crescendo acima da receita por dois trimestres = ou demanda caiu ou o estoque está podre; ambos importam para o penhor.
### Q-14 · PMR e a qualidade do contas a receber
Aging completo, política de provisão, renegociados dentro do "a vencer". PMR esticando com receita estável = cliente financiando na empresa, e o recebível que seria garantia vale menos.
### Q-15 · Passivo trabalhista e a informalidade do setor
Setores intensivos em mão de obra: passivo contingente trabalhista recorrente é custo, não contingência.
### Q-16 · EBITDA por unidade de negócio
Consolidado esconde unidade queimando caixa; abrir onde houver segmentos, porque a estrutura pode isolar (garantia sobre a unidade boa).
### Q-17 · Identidades obrigatórias
Ativo = passivo + PL em toda peça; lucro do exercício bate com mutação do PL; depreciação da DRE bate com a movimentação do imobilizado; caixa final do fluxo bate com o balanço. Falha em identidade = documento devolvido, não interpretado.
### Q-18 · O spread da casa
Formato único de spreading (5 anos + LTM + projeções), toda linha com fonte, toda conta com trace. É o anexo técnico do memo e a prova de rastreabilidade.

---


---

# MÓDULO 3 · A FOTO REAL DA DÍVIDA (completo, 31 procedimentos)

O balanço brasileiro subdeclara dívida por construção. O trabalho da mesa é reconstruir a
posição verdadeira antes de qualquer conta de capacidade. Um memo que descobre risco sacado
na diligência do fundo, e não antes, queimou a operação e a casa.

## 3.1 Inventário do que está declarado

### D-01 · Relação analítica de contratos
- **Pedir**: planilha contrato a contrato: credor, modalidade, data de contratação, saldo atual, indexador, spread, vencimento final, cronograma de amortização, garantias vinculadas, covenants existentes.
- **Fonte**: nota explicativa de empréstimos; balancete (grupos 2.1 e 2.2); posição consolidada que todo CFO tem para o banco.
- **Verificar**: soma da relação contra a linha do balanço contra o balancete. Divergência acima de 0,5% vira exceção nomeada, nunca ajuste silencioso.
- **Armadilha**: a relação que a empresa manda costuma ser a "dívida bancária", sem debêntures, sem parcelamentos, sem mútuo de sócio.
- **Mercado lê**: relação completa entregue rápido = casa organizada. Três versões diferentes da mesma relação = red flag por si só.
- **A jusante**: alimenta perfil de vencimento, custo médio, covenant de alavancagem e a tabela de dívida do memo.
- **Autoridade**: CASA

### D-02 · Abertura por indexador
- **Pedir**: cada contrato marcado como CDI+, %CDI, pré, IPCA+, TLP, USD ou outra moeda.
- **Verificar**: recomputar o custo médio ponderado; conferir contra a despesa financeira da DRE (custo médio × dívida média deve chegar perto da despesa de juros; desvio grande indica dívida não declarada ou capitalização de juros).
- **Armadilha**: "CDI + 3" e "115% do CDI" não são comparáveis diretamente; normalizar tudo para spread sobre CDI na data.
- **A jusante**: teste de estresse de juros (D-27), pricing da nova dívida, term sheet.
- **Autoridade**: DEF

### D-03 · Cronograma de vencimentos por ano
- **Pedir**: amortizações ano a ano, pelo menos 5 anos, contrato a contrato.
- **Verificar**: soma dos anos = dívida total; parcela em 12 meses = dívida de curto prazo do balanço.
- **Armadilha**: cláusula de vencimento antecipado por quebra de covenant torna dívida longa em dívida à vista; o cronograma contratual não é o cronograma em cenário de quebra.
- **Mercado lê**: parede de vencimento (mais de 40% da dívida em um ano) é a primeira coisa que o fundo olha; muitas operações boas são, na verdade, refinanciamento disfarçado de expansão.
- **A jusante**: define se a operação real é alongamento; desenha a amortização da nova dívida para não criar parede nova.
- **Autoridade**: CASA

### D-04 · Concentração de credor
- **Pedir**: dívida por credor, com limite total e utilizado por banco.
- **Verificar**: um credor acima de 40% da dívida = risco de renovação concentrado; anotar histórico de renovação.
- **Mercado lê**: banco grande reduzindo exposição em silêncio é sinal que o fundo pesca; a mesa precisa saber antes e ter a resposta.
- **A jusante**: argumento de diversificação no memo; urgência real da operação.
- **Autoridade**: HEURÍSTICA

### D-05 · Linhas de curto prazo e dependência de rolagem
- **Pedir**: limites aprovados vs utilizados (giro, desconto, conta garantida, ACC).
- **Verificar**: quanto do capital de giro estrutural está financiado por linha que vence em menos de 12 meses e depende de renovação unilateral do banco.
- **Armadilha**: empresa "sem dívida longa" às vezes é empresa que nenhum banco quis alongar.
- **A jusante**: estresse de não-rolagem (D-28); tese de alongamento como uso de recursos legítimo.
- **Autoridade**: CASA

## 3.2 A dívida que não está na linha de dívida

### D-06 · Risco sacado / confirming / forfait
- **Onde se esconde**: na linha de fornecedores, não em empréstimos.
- **Detectar**: prazo médio de fornecedores fora do padrão do setor (indústria acima de 90 dias pede explicação); nota de fornecedores citando "operações com instituições financeiras"; pergunta direta ao CFO: "existe convênio de antecipação a fornecedor?".
- **Tratamento**: reclassificar como dívida financeira para alavancagem e cobertura. O mercado trata como dívida; a mesa que não tratar entrega um memo que morre na primeira reunião de comitê.
- **Armadilha**: a empresa não considera dívida "porque quem antecipa é o fornecedor". O caixa dela é que sustenta o programa; cancelado o convênio, o prazo volta e o buraco de giro aparece de uma vez.
- **A jusante**: alavancagem pró-forma, covenant de dívida líquida (a definição contábil do covenant precisa capturar risco sacado explicitamente).
- **Autoridade**: MERCADO (consenso das mesas desde os casos Americanas/Light)

### D-07 · Recebíveis cedidos e descontados
- **Detectar**: nota de recebíveis (cessão "com coobrigação" ou "sem coobrigação"); conta redutora; movimentação em FIDC próprio.
- **Tratamento**: com coobrigação ou recompra = dívida. Sem coobrigação = redução legítima do ativo, mas verificar retenção de risco via cota subordinada de FIDC próprio: se a empresa detém a subordinada, o risco de crédito continua nela e o mercado soma de volta.
- **Armadilha**: "vendemos sem coobrigação" com contrato prevendo recompra de título vencido é coobrigação com outro nome; pedir o contrato de cessão, não a descrição.
- **A jusante**: base de recebíveis livre para garantia da nova operação (o que já está cedido não está disponível, e descobrir isso tarde derruba a estrutura inteira).
- **Autoridade**: DEF

### D-08 · Arrendamentos (IFRS 16)
- **Regra da casa**: declarar a convenção e nunca misturar. Ou dívida incluindo passivo de arrendamento com EBITDA pós-IFRS 16, ou dívida ex-arrendamento com o aluguel de volta no EBITDA. Alavancagem com dívida ex-arrendamento e EBITDA pós-IFRS 16 é o erro mais comum de material amador, e melhora o número artificialmente.
- **Verificar**: nota de arrendamentos; taxa incremental usada; prazo remanescente.
- **A jusante**: covenant precisa da mesma convenção escrita na definição contábil, senão a apuração trimestral vira briga.
- **Autoridade**: DEF

### D-09 · Parcelamentos tributários
- **Detectar**: REFIS, PERT, parcelamentos ordinários; nas notas ou no balancete (tributos parcelados).
- **Tratamento**: é dívida, com cronograma próprio e senioridade de fato (a Fazenda executa e não renegocia como banco).
- **Armadilha**: exclusão do parcelamento por inadimplência restaura multa e juros originais, um passivo contingente escondido dentro do parcelamento.
- **A jusante**: cronograma consolidado; CND como condição precedente da operação.
- **Autoridade**: DEF

### D-10 · Fianças, avais e garantias a terceiros
- **Pedir**: nota de compromissos e garantias; perguntar por avais cruzados dentro do grupo.
- **Tratamento**: exposição contingente; se o garantido é empresa do grupo alavancada, a análise consolida a visão de risco mesmo que a contabilidade não consolide.
- **Armadilha**: sócio pessoa física avalista de tudo dilui o valor do aval na nova operação; mapear o estoque de avais existentes.
- **A jusante**: pacote de garantias da nova operação; covenant de limitação de garantias a terceiros.
- **Autoridade**: CASA

### D-11 · Mútuos com partes relacionadas
- **Pedir**: saldos e movimentação de mútuos ativos e passivos com sócios e empresas ligadas, taxa e prazo.
- **Tratamento**: mútuo passivo com sócio pode ser tratado como quase-equity se subordinado formalmente na operação (cláusula de subordinação e trava de pagamento); sem formalização, é dívida que compete com o novo credor.
- **Armadilha**: mútuo ativo com sócio (empresa emprestou para o dono) é distribuição disfarçada e o fundo lê exatamente assim.
- **A jusante**: cláusula de subordinação no term sheet; ajuste do caixa livre real.
- **Autoridade**: MERCADO

### D-12 · ACC/ACE e dívida em moeda
- **Verificar**: dívida em moeda contra receita em moeda (hedge natural) ou contra derivativo de proteção; descasamento vira exposição nomeada no memo.
- **Armadilha**: exportadora com ACC barato e receita em real crescente (mix mudou) carrega descasamento que a média histórica esconde.
- **Autoridade**: DEF

### D-13 · Derivativos
- **Pedir**: posição de derivativos com MTM, finalidade (hedge ou resultado), contraparte e margem.
- **Armadilha**: estruturas alavancadas (target forward e afins) explodiram empresas boas em 2008; qualquer derivativo cuja perda potencial não é limitada vira red flag de governança, não só de caixa.
- **Autoridade**: CASA

### D-14 · Obrigações de aquisição, earn-outs e parcelas a pagar
- **Detectar**: notas de combinação de negócios; contratos de compra e venda.
- **Tratamento**: entra no cronograma consolidado como dívida com data.
- **Autoridade**: DEF

### D-15 · Dividendos declarados e não pagos, JCP provisionado
- **Tratamento**: dívida com o acionista; conferir se a política de dividendos declarada é compatível com o plano de amortização proposto.
- **A jusante**: dividend stopper no covenant.
- **Autoridade**: CASA

### D-16 · Contingências prováveis
- **Pedir**: nota de provisões e contingências; abertura por natureza (fiscal, trabalhista, cível) e por probabilidade.
- **Tratamento**: provável entra na visão de endividamento ajustado; possível relevante entra no memo como risco nomeado com valor.
- **Armadilha**: empresa que reclassifica contingência de provável para possível na véspera da operação; comparar notas de dois exercícios.
- **Autoridade**: DEF

## 3.3 Custo, perfil e qualidade da dívida

### D-17 · Custo médio ponderado real
Recomputado pela mesa, nunca aceito da apresentação. Conferido contra a DRE (D-02).
### D-18 · Duration e vida média
Da dívida atual e pró-forma; sustenta o argumento de alongamento no memo.
### D-19 · Garantias já comprometidas
Mapa de ônus: o que já está alienado, cedido, hipotecado, e para quem. O colateral livre é o que sobra, e é ele que dimensiona a nova operação. Pedir certidões e posições de gravame, não a palavra.
### D-20 · Covenants existentes
Lista com definição contábil, nível atual, folga, e cláusulas de cross-default (threshold e quais contratos). A operação nova não pode quebrar covenant velho no dia um.
### D-21 · Histórico de renegociação
Aditivos, waivers, carências pedidas nos últimos 36 meses. Waiver recente não é veto, é contexto que o memo conta antes do fundo descobrir.
### D-22 · Dívida na holding vs dívida na operadora
Subordinação estrutural: credor da holding recebe depois do credor da opco. Onde está o caixa, onde está a dívida, onde está a garantia, em que entidade a nova operação entra.
### D-23 · Posição SCR
Se a empresa fornecer (dela mesma): confere a relação declarada, revela linha esquecida e atraso não contado.

## 3.4 Testes obrigatórios antes de qualquer estrutura

### D-24 · Ponte dívida bruta → dívida ajustada
Tabela única: declarada + risco sacado + cessões com regresso + arrendamento (conforme convenção) + parcelamentos + earn-outs = **dívida ajustada da mesa**. Cada linha com fonte. Esta tabela vai no memo; é a prova de que a diligência do fundo não vai achar nada novo.
### D-25 · Identidade da despesa financeira
Custo médio × dívida média ≈ despesa financeira da DRE (tolerância definida). Não fecha = dívida não mapeada ou juros capitalizados; exceção aberta.
### D-26 · Cobertura de 12 meses
Caixa + geração operacional projetada conservadora vs serviço de 12 meses (juros + amortizações + parcelamentos). Abaixo de 1,0x sem a nova operação = a operação é liquidez, e o memo trata como tal, sem eufemismo.
### D-27 · Estresse de CDI +300 bps
Dívida brasileira é pós-fixada: choque de juros é choque de caixa imediato. Recalcular cobertura e covenant proposto no cenário. Obrigatório em todo caso.
### D-28 · Estresse de não-rolagem
Linhas de curto prazo não renovadas: quanto tempo o caixa aguenta, e a nova operação resolve ou só adia.
### D-29 · Cascata de cross-default
Quebra hipotética do covenant mais apertado: quais contratos aceleram em cadeia. Define a urgência real e o desenho de waiver/repactuação que às vezes precisa acompanhar a operação.
### D-30 · Compatibilidade dia-um
A nova dívida entra: algum covenant existente quebra no fechamento? Negative pledge existente impede a garantia oferecida? Verificação obrigatória antes do term sheet.
### D-31 · O parágrafo da dívida no memo
Padrão da casa: tabela ponte (D-24), perfil de vencimento pró-forma em gráfico, convenção IFRS 16 declarada, custo médio antes e depois, e os três riscos de passivo mais relevantes com mitigante. Nunca "dívida confortável"; sempre número, fonte e comparação.

---

---

# MÓDULO 4 · A OPERAÇÃO E O SOURCES & USES (OP-01 a OP-14)

### OP-01 · Pedido declarado vs necessidade calculada
O valor pedido no intake é hipótese, não dado. A mesa recalcula a necessidade: capex
orçado + capital de giro incremental da expansão + custos de transação + colchão de
execução, menos geração própria no período. Divergência relevante entre pedido e cálculo
vira conversa com o cliente ANTES da estrutura, com o número na mão. Armadilha: aceitar o
valor redondo do cliente; valor redondo é sintoma de que ninguém calculou. CASA.

### OP-02 · Sources & uses fechando ao centavo
Tabela obrigatória em todo caso: fontes (dívida nova por tranche, geração própria, aporte,
venda de ativo) = usos (capex por bloco, giro, refinanciamento por contrato, custos de
transação, colchão). Verificar: soma exata; cada uso material com fonte documental (orçamento,
contrato, proposta); custos de transação incluídos (estruturação, registro, garantias,
assessores) porque omiti-los é o erro que faz faltar dinheiro no fim. DEF.

### OP-03 · Pró-forma completo
Balanço e serviço de dívida pós-operação: dívida nova entra, refinanciada sai, caixa e
garantias se movem. Sobre o pró-forma se calculam alavancagem, cobertura e covenants
propostos (nunca sobre o balanço histórico). Liga D-24 (ponte) e ES-42 (dia-um). DEF.

### OP-04 · Capacidade sob cenários
A operação precisa se pagar no cenário base E sobreviver no downside definido (E07):
queda de receita, compressão de margem, CDI +300 bps, atraso de ramp-up. Regra da casa: o
dimensionamento final respeita o pior entre os limites (ES-03), não a média deles. CASA.

### OP-05 · O que a operação resolve, e o que não toca
Toda operação deixa problemas de fora, e o memo diz quais (concentração de cliente
continua, sucessão continua aberta). Prometer que a dívida resolve tudo é o erro de
narrativa que a diligência pune primeiro. Liga MA-07. CASA.

### OP-06 · O erro de pedir de menos
Giro incremental esquecido é a causa clássica de expansão financiada que quebra: a fábrica
nova pronta, sem caixa para o estoque e o prazo dos clientes novos. O cálculo de OP-01
inclui explicitamente o giro da receita incremental (dias de estoque + prazo recebido -
prazo pago, sobre a receita nova). Pedir de menos e voltar ao mercado em 12 meses custa
mais caro que dimensionar certo. CASA.

### OP-07 · O erro de pedir demais
Sobra de caixa levantada "por segurança" é carrego negativo (custo da dívida sobre caixa
parado) e sinal ao fundo de plano mal calculado. A resposta técnica para incerteza não é
volume, é tranche comprometida com liberação por marco (OP-08). MERCADO.

### OP-08 · Tranches e liberação por marco
Desembolso casado com o cronograma físico: tranche 1 na assinatura, seguintes por medição
ou marco (licença obtida, obra a X%). Protege o cliente do carrego e o fundo da execução.
Toda tranche com condição objetiva e verificável, nunca "a critério". Liga MA-20. MERCADO.

### OP-09 · Condições precedentes típicas por uso
Expansão: licenças, contrato da obra, seguro performance do empreiteiro. Aquisição: DD
concluída, aprovação concorrencial se aplicável, travamento do preço. Refinanciamento:
quitação e liberação de gravames simultâneas ao desembolso. Equipamentos: proforma final e
AF constituída no bem. A lista nasce aqui e vira cláusula no term sheet (MA-20). LEI/MERCADO.

### OP-10 · Ponte e take-out
Quando o tempo do processo não casa com a necessidade (aquisição com prazo), estrutura em
duas fases: ponte curta com garantia forte + take-out planejado (a emissão definitiva). O
risco da ponte é o take-out não sair; o memo trata esse risco explicitamente, com plano B.
MERCADO.

### OP-11 · Cronograma de desembolso vs obra
O cronograma financeiro segue o físico com defasagem realista (medição, aprovação,
liberação). Obra de 18 meses com desembolso em 6 é ou colchão escondido ou cronograma de
obra otimista; os dois merecem pergunta interna. HEURÍSTICA.

### OP-12 · Quando a resposta é esperar
Se a empresa está a um trimestre de mostrar o número que muda o preço (safra, contrato
grande, auditoria concluída), a mesa diz: esperar custa X em oportunidade e economiza Y em
spread; a decisão é do cliente, informada. Assessor que só sabe acelerar não é assessor.
CASA.

### OP-13 · Uso misto e como o mercado lê
Operação mista (refi + capex) é normal, mas o mercado precifica pelo pior pedaço da
história se ela vier embaralhada. O S&U separa os blocos e a narrativa lidera pelo
produtivo, com o refi como saneamento explícito e quantificado. MERCADO.

### OP-14 · A operação declarada como âncora do processo
Valor, uso, prazo e garantias pretendidos ficam registrados como a operação declarada
(IN-26). Toda mudança relevante ao longo do processo (o cliente decide pedir mais, o uso
muda) é nova versão datada, porque análise, estrutura e materiais referenciam a versão.
Mudança silenciosa de escopo é como os processos apodrecem. CASA.

---

# MÓDULO 5 · ESTRUTURAÇÃO (ES-01 a ES-45)

A estruturação transforma capacidade em desenho negociável. A regra que governa o módulo:
cada termo proposto tem uma base declarada (o cálculo, a garantia, o precedente), porque
term sheet sem base é opinião, e opinião não sobrevive à primeira reunião.

## 5.1 Envelope de capacidade

### ES-01 · Alavancagem máxima por perfil
Dívida líquida ajustada (D-24) / EBITDA ajustado (Q-01), pró-forma (OP-03), contra a banda
que o mercado aceita para o perfil: como referência de partida da casa, empresa estável com
garantia real aceita mais; cíclica, concentrada ou sem garantia aceita menos. A banda
numérica exata é dado versionado da casa (MERCADO, com data), revisado trimestralmente; o
procedimento fixa o método: sempre pró-forma, sempre com a dívida ajustada, sempre com
EBITDA defensável, nunca com o "ajustado da administração" sem abertura. DEF/MERCADO.

### ES-02 · Cobertura mínima
DSCR = caixa disponível para serviço (Q-02) / serviço da dívida do período, ano a ano do
cronograma proposto, no base e no downside. Regra da casa: DSCR mínimo do cronograma manda,
não a média (a dívida quebra no pior ano, não no ano médio). ICR como métrica auxiliar
quando o principal é bullet. DEF.

### ES-03 · O menor limite manda
O envelope final é o MENOR entre: alavancagem máxima do perfil, DSCR mínimo no downside,
LTV máximo da garantia, e limite de covenant existente (D-20). Publicar o limitante junto
com o número ("a garantia limita antes da alavancagem") porque isso diz ao cliente o que
destravaria mais capital. CASA.

### ES-04 · Headroom de covenant
Covenant proposto com folga sobre o cenário base (referência de casa: folga que sobreviva
ao downside definido sem quebra). Estruturar covenant colado no plano é vender waiver
futuro; fundo experiente rejeita e fundo inexperiente executa. MERCADO.

## 5.2 Prazo e amortização

### ES-05 · Amortização casa com o fluxo
O cronograma de amortização espelha a geração de caixa projetada no downside, não no base.
Projeto com ramp-up: carência real até a geração chegar. Negócio sazonal: parcelas no
semestre forte (ES-08). Fluxo estável: SAC ou Price. A amortização errada é a maior causa
de reestruturação evitável. DEF.

### ES-06 · SAC, Price, bullet, balão
SAC amortiza mais cedo (menos juros totais, serviço inicial maior); Price nivela o
serviço; bullet concentra no fim (exige take-out ou geração acumulada comprovável); balão
intermedeia. Regra de leitura: bullet sem fonte de repagamento nomeada (venda de ativo,
refinanciamento plausível, caixa acumulado) é aposta, e o memo não veste aposta de
estrutura. DEF.

### ES-07 · Carência: paga ou capitalizada
Carência de principal com juros pagos é o padrão. Capitalizar juros (PIK parcial) só com
justificativa de fluxo e com o efeito no saldo devedor mostrado ano a ano no term sheet;
esconder capitalização em "carência total" é como se perde a confiança do comitê. DEF.

### ES-08 · Desenho sazonal
Parcelas assimétricas casadas com o ciclo (agro: pós-colheita; varejo: pós-quarto
trimestre; educação: pós-matrícula). Alternativa: parcela constante com conta reserva que
enche no pico (ES-17). O que não fazer: parcela constante sobre fluxo sazonal sem colchão,
que fabrica inadimplência técnica duas vezes por ano. MERCADO.

### ES-09 · Ramp-up de projeto
Carência casada com o cronograma físico + margem de atraso realista (obras atrasam; a
referência da casa por tipo de obra é dado versionado). Covenant de conclusão física
(marco até data) em vez de covenant financeiro durante a obra. Liga OP-08 e OP-11. MERCADO.

### ES-10 · Não criar a próxima parede
O cronograma proposto somado ao existente (D-03) não pode criar concentração nova de
vencimentos. Verificação obrigatória do perfil consolidado pró-forma; o gráfico vai no
memo (D-31). CASA.

## 5.3 Garantias

### ES-11 · Cessão fiduciária de recebíveis
Mecânica completa: trava de domicílio bancário (os sacados pagam na conta vinculada),
percentual de trava (quanto do fluxo fica retido antes de liberar o excedente), razão de
garantia (fluxo mensal cedido / serviço mensal, com referência de casa versionada), e
régua de recomposição quando a razão cai. Verificar: os recebíveis cedidos existem, não
estão cedidos a outro (D-07, certidão), e a concentração de sacados da carteira cedida.
Armadilha: trava sobre fluxo bruto quando o líquido (devoluções, cancelamentos) é o que
existe. DEF/MERCADO.

### ES-12 · Performados vs a performar
Recebível performado (entrega feita, só falta pagar) vale muito mais que a performar
(depende de execução futura). Haircut diferente, elegibilidade diferente. Em incorporação
(EMP-28) essa distinção é a espinha do CRI: carteira performada tem risco de crédito;
a performar tem risco de obra. DEF.

### ES-13 · Alienação fiduciária de imóvel
Laudo independente recente (validade de casa versionada), LTV por tipo (referências de
partida: operacional urbano mais conservador que residencial líquido; terra nua mais
ainda), liquidez real do ativo (imóvel de uso único em cidade pequena vale o que o laudo
diz e vende pelo que o mercado paga), segunda alienação como reforço fraco (só vale o que
sobra da primeira). Verificar matrícula: ônus, penhoras, indisponibilidades. LEI/DEF.

### ES-14 · Estoque como garantia
Penhor ou AF de estoque exige: monitoria periódica independente, fiel depositário formal,
estoque identificável e revendável (commodity e insumo padronizado sim; produto acabado de
marca própria, menos), haircut severo e trava de giro mínimo. Estoque perecível ou de moda
praticamente não é garantia. DEF/MERCADO.

### ES-15 · Equipamentos e frota
AF do próprio bem financiado é a garantia natural de equipamentos (IN-08). Valor de
revenda real (mercado secundário existe? Para máquina customizada, não), idade, seguro
com a credora como beneficiária. Frota: liquidez alta, depreciação conhecida, gravame no
órgão de trânsito. DEF.

### ES-16 · Quotas e ações
Alienação de participação da devedora ou de controlada: vale pelo controle que dá em
cenário ruim, não pelo valor de mercado (que despenca exatamente quando a garantia é
executada). Atenção a acordo de acionistas (EMP-11) e a vedações estatutárias. Reforço,
nunca lastro principal. DEF.

### ES-17 · Conta reserva
N meses de serviço (referência de casa por perfil) em conta vinculada, constituída no
desembolso ou enchida por retenção de fluxo. Régua de recomposição com prazo e trava de
dividendo enquanto descomposta (liga ES-25). Barata de negociar, valiosa no aperto: é a
diferença entre atraso técnico e default. MERCADO.

### ES-18 · Fiança bancária e seguro garantia
Transferem o risco para o balanço do garantidor: encarecem, mas mudam o rating da operação.
Verificar: rating do garantidor, prazo da fiança versus prazo da dívida (fiança que vence
antes é garantia com data de validade), e as condições de execução do seguro (apólice com
exclusões largas vale pouco). DEF.

### ES-19 · O aval
Aval dos sócios: compromisso pessoal com valor de sinalização real e valor de execução
limitado ao patrimônio pessoal líquido (D-10: mapear o estoque de avais já dados). Regra de
leitura da casa: aval reforça, nunca substitui garantia real; e a recusa do sócio em avalizar
a própria tese é informação. MERCADO.

### ES-20 · O pacote combinado
Garantias se somam com sobreposições e buracos: o pacote é desenhado contra o downside
(qual ativo sustenta valor no cenário em que a execução acontece?). Cobertura total do
pacote (soma dos valores pós-haircut / dívida) com referência de casa. Publicar no term
sheet a cobertura e o método, não só a lista. CASA.

### ES-21 · Fluxo em estrutura dedicada
Quando o caso pede segregação (projeto, recebíveis, EMP-27/28): SPE ou patrimônio
separado, conta centralizadora, cascata de pagamentos (opex mínimo → serviço → reservas →
excedente ao acionista) escrita cláusula a cláusula. O que a segregação compra: isolamento
do risco do grupo; o que custa: complexidade e prazo. A mesa recomenda segregação quando o
crédito é do fluxo, não da empresa. DEF.

### ES-22 · Compartilhamento com dívida existente
Garantia já dada (D-19) só entra no pacote com liberação ou compartilhamento formal
(intercreditor, ES-39). Prometer garantia comprometida é o erro que mata a operação na
diligência com a reputação junto. Verificação obrigatória: certidões e contratos antes do
term sheet. CASA.

## 5.4 Covenants

### ES-23 · Alavancagem com step-down
Covenant de dívida líquida/EBITDA começando com folga (ES-04) e descendo em degraus
conforme a amortização. A definição contábil escrita no covenant é a que a casa usa (D-24:
inclui risco sacado; D-08: convenção IFRS 16 declarada), porque covenant com definição
frouxa é covenant que não protege e gera briga trimestral. DEF.

### ES-24 · Cobertura como covenant
DSCR ou ICR mínimo por período de apuração, com a definição de caixa disponível fechada
(Q-02). Em fluxo sazonal, apuração em 12 meses móveis, nunca trimestre isolado (ES-08).
DEF.

### ES-25 · Dividendos condicionados
Distribuição livre acima de um piso de covenant cumprido; travada abaixo. Alternativa
comum: percentual do lucro com teto enquanto a dívida existir. O que a mesa evita: trava
absoluta que o dono viola de fato via mútuo (D-11) e mata a informação; melhor trava
realista e cumprível. MERCADO.

### ES-26 · Negative pledge
Vedação de onerar ativos a terceiros sem consentimento, com exceções listadas (linhas de
giro até X, FINAME do bem). Verificar contra os negative pledges EXISTENTES da empresa
(D-20): a nova operação precisa caber nas exceções dos contratos velhos, senão o desenho
já nasce em quebra (ES-42). LEI/DEF.

### ES-27 · Endividamento adicional
Teto de dívida nova sem consentimento (absoluto ou por razão de alavancagem), com cesta
de exceções operacionais. O objetivo não é engessar: é garantir que o credor novo de
amanhã não dilua o de hoje sem conversa. DEF.

### ES-28 · Cross-default com threshold
Default em outra dívida acima de um valor mínimo dispara a antecipação. Threshold baixo
demais transforma briga comercial pequena em evento sistêmico (D-29); alto demais não
protege. Referência de casa por porte, versionada. DEF.

### ES-29 · Cash sweep
Percentual de eventos extraordinários (venda de ativo relevante, indenização, emissão)
pré-paga a dívida. Sweep parcial (não 100%) preserva o incentivo do dono de vender bem.
MERCADO.

### ES-30 · Obrigações de informação
Balancete trimestral, demonstração anual auditada com prazo, certificado de cumprimento de
covenant assinado, aviso de evento relevante. Prazos exequíveis para o porte (EMP-16):
obrigação impossível é default fabricado. DEF.

### ES-31 · A guerra das definições
O anexo de definições é onde covenants vivem ou morrem: o que é dívida (ponte D-24), o
que é EBITDA (régua Q-01), o que é caixa (livre versus vinculado). A casa mantém as
definições padrão versionadas e o term sheet as referencia; aceitar a definição do outro
lado sem ler contra a ponte é a derrota silenciosa clássica. CASA.

### ES-32 · Cura e waiver
Prazo de cura por tipo (pagamento: dias; informação: mais; covenant financeiro: janela ou
equity cure com limites). Processo de waiver definido (quórum de credores, prazo de
resposta). Estruturar a cura é mais barato que negociá-la durante a crise. DEF.

## 5.5 Eventos e estrutura societária

### ES-33 · Vencimento antecipado: o menu
Inadimplemento, falsidade de declaração, cross-default (ES-28), mudança de controle
(ES-34), liquidação/insolvência, perda de licença essencial (EMP-17), desapropriação do
ativo-garantia, descumprimento de covenant sem cura. Cada evento com materialidade e prazo
de cura onde couber; lista padrão da casa versionada. LEI/DEF.

### ES-34 · Mudança de controle
Definição precisa (controle societário? poder de veto? saída do fundador-chave?) casada
com EMP-11 e EMP-13. Em empresa de dono, a pessoa é parte do crédito e a cláusula reflete
isso. DEF.

### ES-35 · Cláusulas de mercado em estresse
MAC/MAE em ponte e compromissos longos de desembolso: o que é mudança adversa relevante,
com critério o mais objetivo possível. A mesa evita MAC subjetivo amplo (o cliente fica
refém) e sabe que sem nenhum, compromisso longo não sai. MERCADO.

### ES-36 · Quem emite
A dívida entra na entidade que tem o fluxo e os ativos (EMP-10). Dívida na holding contra
fluxo na operadora é subordinação estrutural (ES-38) e precifica pior; às vezes é
inevitável (vedação na operadora), e então o pacote compensa (garantias da operadora,
fiança dela). DEF.

### ES-37 · Garantidores do grupo
Quais entidades garantem, com que limite, e o que isso faz com os credores delas (D-10).
Fiança cruzada de empresa saudável para a devedora é padrão; o contrário (a operação
garantindo o grupo) é red flag de desvio de propósito. DEF.

### ES-38 · Subordinação estrutural
Credor da holding recebe depois de todos os credores da operadora. Quando existir, o memo
declara e o preço reflete; esconder subordinação estrutural do material é o tipo de
omissão que a diligência encontra em uma tarde (LC-12). DEF.

### ES-39 · Intercreditor
Quando a nova dívida convive com a existente sobre as mesmas garantias: ordem de
pagamento, execução conjunta, standstill. Negociação cara e lenta; a mesa a antecipa no
cronograma do processo quando o pacote exige compartilhamento (ES-22). LEI/DEF.

## 5.6 Fechamento do desenho

### ES-40 · Quando não fecha: a ordem de ajuste
O preço não fecha ou a capacidade não chega: ajustar nesta ordem: (1) reforçar garantia
(maior efeito no spread por unidade de esforço), (2) encurtar prazo ou acelerar
amortização, (3) reduzir volume (com OP-06 revisado para o menor escopo que funciona),
(4) tranche subordinada/mezanino para o gap, (5) esperar um marco que mude o perfil
(OP-12). O que nunca: forçar o volume original com covenant de fantasia. CASA.

### ES-41 · A estrutura mínima vendável
Para o perfil analisado, qual o desenho mais simples que um investidor do mapa (M8)
compra? Complexidade tem custo fixo (jurídico, registro, tempo); estrutura sofisticada
para tíquete pequeno morre de custo. A mesa propõe a estrutura mais simples que atinge o
objetivo, não a mais elegante. HEURÍSTICA.

### ES-42 · Compatibilidade dia-um
Verificação obrigatória antes do term sheet: a operação entra e nenhum covenant existente
quebra (D-20), nenhum negative pledge é violado (ES-26), nenhuma autorização societária
falta (estatuto, acordo, EMP-11). Operação que nasce em default técnico é o vexame máximo
da mesa. CASA.

### ES-43 · Da estrutura ao term sheet
Cada termo decidido neste módulo referencia sua base (procedimento, cálculo, referência de
mercado datada) e alimenta o template do term sheet (MA-17/MA-18). Termo sem base não
entra. CASA.

### ES-44 · O que muda por instrumento
O desenho adapta ao papel: CRI/CRA exigem lastro formalizado e securitizadora (prazos e
custos próprios); FIDC muda o objeto da análise (a carteira, vertical própria); debênture
exige S.A. e agente fiduciário; CCB fecha rápido e cede depois. A matriz
instrumento×operação (módulo do catálogo, com tíquetes e custos) é dado versionado da
casa. LEI/DEF.

### ES-45 · Sizing final
O número final respeita o envelope (ES-03), o S&U (OP-02) e a prática de lote do mercado
(múltiplos que facilitam alocação entre fundos). Publicar as três pontas no memo interno:
pedido, calculado, proposto, com a justificativa da diferença. CASA.

---

# MÓDULO 6 · PRICING E REFERÊNCIAS (PR-01 a PR-13)

Pricing na mesa é banda indicativa com base declarada, nunca promessa. Todo dado deste
módulo carrega fonte e data, e envelhece (MERCADO > HEURÍSTICA aos 6 meses).

### PR-01 · A curva por perfil de risco
A referência parte do rating implícito da análise (E07) e desenha spread sobre CDI por
prazo. A curva da casa é dado versionado com data, alimentada por PR-02 e PR-13. O
procedimento fixa o método: nunca precificar de memória; toda banda citada em material tem
a curva-fonte com data no apêndice interno. CASA.

### PR-02 · Comps de emissões
Emissões comparáveis por setor, porte, instrumento, prazo e garantia, com data da emissão
e fonte (dados públicos de mercado, anúncios, bases setoriais). Regra de uso: comp de
mercado primário recente vale mais que secundário; comp de mais de 6 meses é contexto, não
referência. Registrar por que cada comp é comparável (e por que os descartados não são),
porque o fundo vai fazer exatamente esse exercício. MERCADO.

### PR-03 · O prêmio da garantia
Referência da casa para o efeito de cada reforço no spread (garantia real forte, cessão
com trava, fiança bancária), calibrada por observação própria (PR-13) e comps. É a base
numérica do argumento de ES-40 ("reforçar garantia antes de reduzir volume"). MERCADO.

### PR-04 · O prêmio do prazo
Curva de prazo do perfil: quanto custa cada ano adicional. Em crédito privado brasileiro a
curva longa é menos líquida e o prêmio salta em degraus (bandas de apetite por prazo dos
fundos, MK-11), não linearmente. MERCADO.

### PR-05 · Prêmio de tamanho e liquidez
Tíquete pequeno paga prêmio (custo fixo de análise do fundo diluído em pouco papel);
tíquete grande demais para o mercado-alvo paga prêmio de colocação. O lote certo (ES-45)
minimiza a soma. HEURÍSTICA.

### PR-06 · O indexador certo
CDI+ é o padrão do crédito privado; IPCA+ casa com receita indexada (energia contratada,
aluguéis, mensalidades reajustadas) e alcança o bolso isento via CRI/CRA e incentivada;
prefixado é raro e caro. Regra: o indexador casa com a receita do devedor E com o apetite
do comprador-alvo (MK-11); descasamento de indexador entre receita e dívida entra como
risco nomeado (D-27 análogo para inflação). DEF/MERCADO.

### PR-07 · A grade da casa
Consolidação operacional: perfil de risco × prazo × pacote de garantia → banda indicativa
em bps sobre CDI. É a tabela que a mesa consulta e o dado mais sensível a manter fresco;
toda célula com data e contagem de observações. Célula sem observação recente responde
"sem referência confiável", nunca número inventado (abstention é resposta). CASA.

### PR-08 · Quando o preço não fecha
O comprador-alvo pede mais que o teto do cliente: seguir ES-40 (garantia, prazo, volume,
mezanino, espera). Adicional deste módulo: verificar se o comprador está certo (a banda da
casa pode estar velha; PR-13 atualiza com a recusa). A recusa de preço é dado, não derrota.
CASA.

### PR-09 · Como se comunica banda
Sempre banda, nunca ponto; sempre "indicativo, sujeito a análise dos investidores"; nunca
por escrito um número que a mesa não sustentaria em reunião. A banda estreita demais é
promessa disfarçada; larga demais é ignorância confessa. Padrão da casa: banda que a mesa
aceitaria fechar em qualquer ponto dela. CASA.

### PR-10 · Custo all-in
O cliente compara com o banco pelo custo total: spread + estruturação + registro +
garantias (laudo, cartório, monitoria) + agente fiduciário/securitizadora quando houver,
amortizado no prazo. O material do cliente mostra all-in anualizado; esconder custo de
transação para a taxa parecer boa é padrão de corretor, não de mesa. CASA.

### PR-11 · Contra o custo atual
A comparação honesta com a dívida existente do cliente (D-17): a proposta versus o custo
médio atual E versus a alternativa real dele (rolagem curta renovável tem custo de risco
de rolagem que a mesa quantifica em cenário, não em adjetivo). MERCADO.

### PR-12 · Envelhecimento e vigência
Todo dado de pricing tem `valid_until`. Passou: o sistema rebaixa a confiança e a mesa
não cita em material novo sem reconfirmar. Mudança de regime de juros (choque de CDI,
eleição, crise) invalida a grade inteira antes do prazo; gatilho manual da mesa. CASA.

### PR-13 · A observação proprietária
Cada sondagem respondida, indicação de book, recusa com motivo de preço vira observação
datada na grade (PR-07): é o dado que nenhum concorrente tem. Registrar sempre: perfil,
estrutura, prazo, banda indicada, quem indicou (anonimizado no dado agregado). Em vinte
casos a grade da casa vale mais que qualquer publicação. CASA.

---

# MÓDULO 7 · MATERIAIS INSTITUCIONAIS (MA-01 a MA-32)

Materiais são compilados de fatos verificados, nunca escritos livres. Este módulo é
simultaneamente procedimento e especificação de template: cada template referenciado aqui
é contrato canônico versionado (ADR 0013, item 7) e só é promovido com exemplo gold
aprovado pelo fundador.

## 7.1 Teaser

### MA-01 · Os 14 elementos do teaser
Uma página, nesta ordem: (1) setor e região, sem nome; (2) porte por faixa de receita;
(3) o negócio em duas linhas; (4) destaque operacional que sustenta o crédito (posição,
contrato, ativo); (5) receita e EBITDA de 2 a 3 exercícios, em faixa ou indexado;
(6) margem e tendência; (7) alavancagem atual ajustada, em faixa; (8) a operação: volume,
uso, prazo pretendido; (9) estrutura indicativa em uma linha (instrumento e pacote de
garantia por tipo); (10) fonte de pagamento em uma frase; (11) por que agora (EMP-20, uma
linha); (12) próximos passos e o que o NDA libera; (13) disclaimer padrão (MA-30);
(14) contato da mesa. O que NUNCA entra: nome, marca, cliente nominal, localização exata
de ativo único, qualquer dado que identifique por eliminação. CASA.

### MA-02 · Anonimização real
Teste de identificação por eliminação: setor + cidade + porte identifica a empresa em
mercados concentrados ("a maior gráfica de tal cidade"). Quando identifica, generalizar o
eixo menos informativo (região em vez de cidade). A revisão de anonimização é item de
checklist, não bom senso. CASA.

### MA-03 · O teste dos 90 segundos
Um gestor lê o teaser em 90 segundos e responde: é meu mandato? Vale um NDA? Se a leitura
exige releitura, o teaser falhou. Verificação editorial: nenhuma frase com mais de duas
ideias; números em tabela, não em prosa; zero adjetivo sem número (LC-02). CASA.

## 7.2 Memorando de crédito

### MA-04 · As 12 seções, na ordem de leitura da mesa compradora
(1) Sumário da operação; (2) destaques de crédito; (3) riscos e mitigantes; (4) a empresa;
(5) setor e competição; (6) análise financeira histórica; (7) a operação e sources & uses;
(8) estrutura indicativa; (9) projeções e cenários; (10) garantias em detalhe;
(11) perguntas antecipadas (extrato do Q&A); (12) apêndices (spread completo, ponte da
dívida, evidências). Riscos ANTES da história da empresa: o leitor profissional procura os
riscos primeiro, e encontrá-los bem tratados na seção 3 compra credibilidade para todo o
resto. Tamanho alvo: denso e curto; referência da casa versionada por seção. CASA.

### MA-05 · Sumário da operação
Meia página: tomador (perfil, não nome se pré-NDA), volume, instrumento, prazo, amortização,
garantias por tipo, uso, banda indicativa (PR-09), fonte de pagamento em uma frase, estado
do processo. Um gestor decide com o sumário se leva ao comitê; ele carrega a operação
inteira sem depender do resto. CASA.

### MA-06 · Destaques de crédito
4 a 6 bullets, cada um com número e fonte: posição de mercado com participação, contrato
com prazo e contraparte, conversão de caixa com percentual, garantia com cobertura. Regra:
destaque sem número é marketing e não entra; o destaque que a diligência não confirmaria
inteiro também não (LC-12). CASA.

### MA-07 · Riscos e mitigantes
Tabela: risco nomeado + severidade + probabilidade qualitativa + mitigante REAL + o que
não mitiga (OP-05). Regra de ouro da seção: todo risco que a mesa conhece está aqui; a
diligência do fundo não pode achar risco novo (LC-12). Mitigante de papel ("monitoramento
constante") é proibido; mitigante é estrutura (trava, reserva, covenant), fato (contrato,
seguro) ou preço. Ordem: do mais severo para o menos. CASA.

### MA-08 · A empresa (seção 4)
História em um parágrafo, modelo de negócio (EMP-01), clientes e concentração com números
(EMP-03), fornecedores (EMP-04), estrutura societária com organograma (EMP-10), governança
real (EMP-12), gestão (EMP-13/15). Tudo que virou red flag tratada aparece com o
tratamento; o que é risco vai para a seção 3, não escondido aqui. CASA.

### MA-09 · Setor (seção 5)
Tamanho e crescimento com fonte datada, os concorrentes nomeados (EMP-09), a posição da
empresa com evidência, ciclicidade e onde estamos (EMP-07), regulação relevante (EMP-06).
Proibido parágrafo de consultoria genérica ("o setor é resiliente e promissor"); cada
frase com dado ou sai. CASA.

### MA-10 · Financeira histórica (seção 6)
O spread padronizado (Q-18) comentado: crescimento e sua causa física, margem e sua
sustentação, conversão de caixa (Q-02), capital de giro (Q-04), e a PONTE DA DÍVIDA
(D-24) como tabela obrigatória com o perfil de vencimento pró-forma (D-31). Ajustes de
EBITDA abertos item a item com a régua Q-01 (reportado vs ajustado, nunca só o ajustado).
CASA.

### MA-11 · A operação (seção 7)
O S&U completo (OP-02), o pró-forma (OP-03), o que a operação resolve e o que não toca
(OP-05), cronograma de desembolso e marcos (OP-08). CASA.

### MA-12 · Estrutura (seção 8)
Cada termo com sua base (ES-43): por que este prazo (fluxo), por que este pacote
(cobertura calculada, ES-20), por que estes covenants (headroom, ES-04). A seção espelha o
term sheet sem divergir dele em uma vírgula (MA-28). CASA.

### MA-13 · Projeções e cenários (seção 9)
Premissas explícitas uma a uma contra o histórico (Q-10), cenário base, downside definido
e o teste de estresse obrigatório (D-27/D-28) com DSCR resultante ano a ano. Regra: a
projeção é da empresa, a leitura crítica é da mesa, e o memo distingue as duas vozes.
Sensibilidade em tabela (o que quebra o DSCR primeiro). CASA.

### MA-14 · Apêndice de evidências
Índice numerado de todos os documentos citados, com hash e versão; cada número material do
memo carrega marcador que resolve para o item do índice. É a materialização da promessa de
rastreabilidade e o que faz a diligência ser conferência, não investigação. CASA.

### MA-15 · Regras editoriais do memo
Número com fonte sempre; adjetivo sem número nunca; frase declarativa; voz ativa; sem
superlativo; risco nomeado com substantivo próprio ("concentração no cliente X", não
"riscos comerciais"); siglas abertas na primeira vez; PT/EN com identidade econômica
(MA-29); vocabulário da Constituição seção 5. CASA.

### MA-16 · O que o memo não é
Não é pitch (não vende, demonstra), não é parecer (não aprova, analisa), não é prospecto
(não é oferta pública e o disclaimer diz). Confusão de gênero aqui é risco reputacional e
regulatório. LEI/CASA.

## 7.3 Term sheet indicativo

### MA-17 · As cláusulas canônicas
Template com: partes; instrumento e forma; volume; destinação (S&U resumido); prazo e
cronograma de amortização; carência; remuneração (indexador + spread em banda); datas de
pagamento; garantias (uma cláusula por garantia com mecânica: trava, LTV, reserva);
covenants financeiros com definições referenciadas; covenants não financeiros; obrigações
de informação; condições precedentes; eventos de vencimento antecipado; cura e waiver;
declarações e garantias do tomador; despesas e tributos; cessão; confidencialidade;
legislação e foro; validade da proposta; natureza não vinculante. Cada cláusula com
default da casa e alternativas marcadas por perfil. CASA.

### MA-18 · A base de cada termo
Anexo interno (não circula): termo a termo, a origem (ES-xx que o definiu, cálculo,
referência PR-xx com data). Quando o fundo contrapropõe, a mesa responde com a base, não
com queda de braço. CASA.

### MA-19 · Linguagem não vinculante
"Indicativo", "sujeito a documentação definitiva e aprovações", sem obrigação de contratar
em nenhuma cláusula. Revisão jurídica do template (não de cada emissão) com vigência.
LEI.

### MA-20 · Condições precedentes no term sheet
A lista de OP-09 formalizada: societárias, garantias constituídas e registradas, certidões,
seguros com beneficiário, contratos do projeto. Cada CP com responsável e prazo estimado,
porque CP sem dono é fechamento que atrasa. CASA.

### MA-21 · Anexo de definições
As definições contábeis da casa (ES-31): dívida (com a ponte D-24), EBITDA (com a régua
Q-01), caixa livre, a convenção IFRS 16 (D-08). O anexo viaja com o term sheet para a
negociação começar com o vocabulário certo. CASA.

## 7.4 Q&A, sala e modelo

### MA-22 · As perguntas antecipadas
Q&A padrão da casa por arquétipo (40 perguntas de referência), categorias: negócio,
financeiro, dívida e garantias, operação, estrutura, sócios e governança, projeções.
Cada resposta escrita da sala (com evidência), na voz da empresa revisada pela mesa.
Pergunta sem resposta boa não se omite: entra com a resposta honesta e o mitigante
(LC-12). A lista viva: toda pergunta real de fundo que não estava vira item novo do
padrão. CASA.

### MA-23 · Resposta com fonte
Toda resposta do Q&A referencia o documento (MA-14). Resposta de memória, sem âncora, não
entra; se a sala não responde, a resposta é "não disponível, solicitado" e vira lacuna
(IN-16). CASA.

### MA-24 · O índice da sala de saída
Estrutura padrão de pastas versionada por arquétipo: 1 societário; 2 demonstrações e
balancetes; 3 dívida e garantias; 4 operacional e comercial; 5 projeto/operação; 6
projeções e modelo; 7 jurídico e certidões; 8 Q&A e materiais. Cada arquivo com hash,
versão e data; a sala espelha o apêndice do memo (MA-14). CASA.

### MA-25 · Portões da sala
Pré-NDA: teaser e nada mais. Pós-NDA: memo, term sheet, Q&A, sala completa exceto itens
sensíveis nominais (clientes, folha) que abrem em diligência avançada com registro de
acesso. O portão protege o cliente e disciplina o processo (MK-18). CASA.

### MA-26 · Higiene da sala
Sem arquivo duplicado, sem versão velha convivendo com nova sem marcação, sem planilha com
aba escondida esquecida, sem PDF com metadado revelador (autor, caminho de rede).
Varredura antes de abrir a sala; sala bagunçada é diagnóstico que o fundo faz da empresa.
CASA.

### MA-27 · O modelo financeiro entregável
Planilha com abas: premissas (todas num lugar só, com fonte), histórico (o spread Q-18),
projeção operacional, dívida (cronograma por contrato, existente e nova), DRE/balanço/fluxo
projetados, covenants (cálculo por período com folga), cenários (base, downside, estresse).
Fórmulas abertas, sem macro, sem aba oculta, valores de entrada destacados. O fundo vai
refazer as contas; o modelo que facilita isso gera confiança, o que esconde gera
diligência hostil. CASA.

## 7.5 Consistência e liberação

### MA-28 · Validação cruzada obrigatória
Antes de qualquer material sair: os mesmos números em teaser, memo, term sheet, modelo e
Q&A (a mesma dívida ajustada, o mesmo EBITDA, a mesma banda). A verificação é automática
por compilação (mesma base governada) e a divergência bloqueia liberação. Materiais
divergentes entre si são o defeito mais corrosivo diante de um comitê. CASA.

### MA-29 · PT/EN
Identidade econômica por construção: mesmos números das mesmas bases decimais, nunca
retraduzidos ou re-arredondados; terminologia financeira do template bilíngue da casa.
CASA.

### MA-30 · Disclaimers
Padrão da casa em todo material: assessoria técnica, não é oferta pública nem recomendação
de investimento, não é parecer de crédito, sujeito a underwriting e aprovação dos
investidores, confidencial. Texto jurídico revisado com vigência (LEI); presença conferida
por template. LEI/CASA.

### MA-31 · Versão e fingerprint
Todo material emitido carrega versão, data, hash do conteúdo e referência das versões de
template e base. Material superado é recolhido da sala e marcado; nunca duas versões
vivas sem marcação. Liga o registro de autorização (E12 do blueprint). CASA.

### MA-32 · A liberação da mesa
Nenhum material vai a investidor sem: validação cruzada verde (MA-28), auditoria de claims
verde, revisão humana da mesa registrada, autorização do cliente registrada (escopo e
destinatários). Os quatro carimbos, sempre, sem exceção de urgência (urgência é quando
mais se erra). CASA.

---

# MÓDULO 8 · MERCADO E DISTRIBUIÇÃO (MK-01 a MK-28)

A distribuição é onde a assessoria vira resultado. O princípio do módulo: mercado pequeno
tem memória longa; cada caso bem apresentado compra velocidade para o próximo, cada caso
queimado cobra juros para sempre.

## 8.1 Quem compra o quê

Cada tipo de comprador descrito por: o que olha primeiro, como decide, tíquete e prazo
típicos, o que mata na entrada, tempo de resposta. Valores numéricos finos são dado
versionado (MK-11); os procedimentos fixam o comportamento.

### MK-01 · Fundos de crédito high grade
Compram papel de risco baixo com rating implícito forte, preferem S.A. auditada,
debênture, prazo médio-longo, liquidez de revenda. Olham primeiro: alavancagem, histórico
de resultado, governança. Decidem em comitê com calendário; a apresentação precisa chegar
completa (material meio pronto espera o próximo comitê). Matam na entrada: ressalva de
auditoria, litígio societário, setor em lista negativa. MERCADO.

### MK-02 · High yield e special situations
Aceitam complexidade e risco por retorno: estruturas com garantia pesada, prazos menores,
histórias com problema e solução. Olham primeiro: colateral e caminho de saída. São a
contraparte certa para o caso condicional, e a errada para o caso limpo (o preço deles
insulta o cliente bom). MERCADO.

### MK-03 · Assets com mandato dedicado
Gestoras com fundos de crédito estruturado por tese (infra, agro, imobiliário, recebíveis).
O mandato é público na regulamentação do fundo: ler antes de apresentar (MK-12). Decisão
em comitê de crédito com rito; valorizam material com evidência porque respondem a
cotista institucional. MERCADO.

### MK-04 · FIDCs terceiros
Compram carteira ou financiam contra ela; a análise deles é a carteira (elegibilidade,
concentração, performance), não a empresa. Interlocutor certo para recebíveis (IN-10);
errado para capex. Velocidade alta quando o loan tape é limpo. MERCADO.

### MK-05 · Family offices
Decisão concentrada e rápida, apetite idiossincrático (setores que o principal conhece),
tíquete variável, sensíveis à história e à pessoa do dono. O relacionamento pesa mais que
o rito; a apresentação certa é mais curta e mais direta. Volatilidade de apetite: o mesmo
FO que comprou em março pode estar fechado em julho sem aviso. MERCADO.

### MK-06 · Bancos médios
Compram crédito com garantia real e relacionamento (folha, câmbio, cobrança). Competem com
a operação estruturada e às vezes são a resposta certa (a mesa diz quando, IN-19). Úteis
como âncora em CCB cedível. MERCADO.

### MK-07 · Securitizadoras
Não são investidor final: são veículo (CRI/CRA) com distribuição própria ou por
coordenador. Entram quando o lastro existe (ES-44); o custo delas entra no all-in (PR-10).
A escolha da securitizadora importa: prazo de emissão e qualidade de padronização variam.
MERCADO.

### MK-08 · Factors e forfait
Compram recebível performado com desconto, operação a operação. Resposta rápida, custo
alto, sem covenant. São o benchmark de custo do cliente pequeno e o take-out natural de
urgências; a mesa os usa como referência de comparação honesta (PR-11). MERCADO.

### MK-09 · Fundos de infra e imobiliários
Compram o fluxo do projeto (PPA, aluguel, recebível imobiliário) em estrutura segregada
(ES-21), prazo longo, indexação IPCA+. Exigem: contrato forte, cascata clara, conta
vinculada. O crédito corporativo do sponsor é secundário; o contrato é o crédito. MERCADO.

### MK-10 · Fundos de venture debt
Compram risco de startup com sponsor: olham runway, recorrência, cap table, últimos
rounds (IN-09). Estrutura própria (warrant, juros escalonados). Não apresentar venture
debt a fundo de crédito tradicional nem o inverso; é a confusão de mandato mais comum.
MERCADO.

## 8.2 Mandatos como dado

### MK-11 · O registro de mandato
Por instituição e veículo: instrumentos aceitos, tíquete mín/máx, setores (positivos e
vedados), prazo, indexador, exigência de garantia, rating mínimo implícito, geografia,
retorno alvo, restrições declaradas; mais: fonte da informação, data da última
confirmação, quem confirmou, validade, nível de confiança, histórico de interação (MK-27).
Mandato é dado governado com dono e cadência de reconfirmação; campo sem data é campo
vazio. CASA.

### MK-12 · Filtros duros primeiro
Tíquete, setor vedado, instrumento, prazo e garantia mínima eliminam antes de qualquer
consideração qualitativa. Uma operação fora do filtro duro NUNCA é apresentada "para
testar" (queima o caso e a casa, MK-16). O racional qualitativo só rankeia quem passou.
CASA.

### MK-13 · Aderência explicável
Para cada nome da shortlist: os filtros que passou (com o valor), os pontos a confirmar, e
por que este fundo para esta operação (a tese dele que o caso serve). Sem percentual
mágico de compatibilidade; o gestor do outro lado reconhece na primeira frase se a mesa
entendeu o mandato dele, e isso abre ou fecha a porta. CASA.

### MK-14 · De onde vem a informação de mandato
Hierarquia: confirmação direta do gestor (melhor, com data) > regulamento e material
público do fundo > observação de mercado (o que ele comprou) > boato de mercado (registra
como boato, não decide nada). A sondagem devolvida atualiza o registro (PR-13 espelhado).
CASA.

## 8.3 O processo de ir a mercado

### MK-15 · Âncoras primeiro
Sondagem suave com 2 a 3 nomes de maior aderência antes de qualquer abertura: valida
preço, estrutura e apetite com risco reputacional mínimo. O feedback dos âncoras ajusta o
material antes da rodada seguinte. Escolha do âncora: aderência + relacionamento + fundo
cuja opinião os outros respeitam (o "sim" dele puxa fila). CASA.

### MK-16 · Por que nunca broad-shot
Disparar para quarenta é: o caso vira commodity, os fundos sabem que todos viram, ninguém
tem pressa, e a recusa de um vaza para os outros. Mercado pequeno conversa. Caso que
circulou demais fica marcado por safra ("esse já passou por aqui"). A distribuição é
sequencial e gerida, sempre. CASA.

### MK-17 · Sequência e ritmo
Onda 1 (âncoras, 2-3), ajuste, onda 2 (aderentes, 4-6), fechamento de book com os
interessados. Prazos de resposta definidos e comunicados ("feedback até sexta") sem
falso leilão. Urgência real (IN-22) comprime o calendário e é dita; urgência fabricada é
detectada e cobra caro. CASA.

### MK-18 · O que vai em cada estágio
Sondagem: teaser (MA-01). Interesse: NDA. Pós-NDA: memo + term sheet + Q&A + sala (portões
MA-25). Diligência avançada: itens nominais com registro. Nunca pular estágio por pressa
do fundo; o processo disciplinado é parte do produto que o cliente comprou. CASA.

### MK-19 · O NDA
Padrão da casa (mútuo, prazo definido, sem non-circumvent abusivo, sem exclusividade
implícita); alterações do fundo passam por revisão com régua (o que se aceita, o que
nunca). Registro de quem assinou o quê, quando (liga E12 do blueprint). LEI/CASA.

### MK-20 · Gestão de competição
Com mais de um interessado: mesmas informações para todos no mesmo estágio (assimetria
proposital destrói a confiança do processo), prazos iguais, e a competição usada para
termos, não anunciada como leilão. O objetivo é a melhor combinação preço-termos-execução,
e às vezes o segundo preço com o melhor histórico de fechar é a recomendação da mesa. CASA.

### MK-21 · Cadência e follow-up
Toda entrega a fundo tem data de follow-up registrada. Silêncio de fundo é dado (MK-22
espelhado): duas semanas sem resposta com follow-up feito rebaixa o nome na onda. A mesa
nunca deixa o cliente sem saber onde o processo está: update padrão semanal. CASA.

### MK-22 · A recusa como dado estruturado
Toda recusa registrada com motivo na taxonomia: fora de mandato (qual filtro), preço
(que banda ele pagaria), estrutura (o que faltou), momento (fechado no trimestre),
crédito (a objeção específica). Vinte recusas ensinam o mapa real do mercado; a recusa
não registrada é aula perdida. Alimenta MK-11 e PR-13. CASA.

### MK-23 · Book e indicações
Consolidação das indicações (volume, taxa na convenção comparável, condições) em quadro
único para decisão do cliente: taxa, prazo, garantias pedidas, execução esperada
(histórico do fundo de fechar no termo indicado). A recomendação da mesa é registrada com
base. CASA.

### MK-24 · Alocação
Mais demanda que oferta: alocação proposta pela mesa (âncora que validou cedo tem
prioridade moral; diversificação de credor interessa ao cliente; tíquete mínimo de cada
fundo respeitado) e decidida pelo cliente. Comunicação de alocação no mesmo dia para
todos; fundo cortado sabe por quê e continua no mapa para a próxima (MK-28). CASA.

### MK-25 · Fechamento comunicado
Fechou: comunicação a todos os envolvidos do processo (o mercado vai saber de qualquer
jeito; melhor pela mesa), agradecimento aos que indicaram e não levaram, e o registro
final no mapa (quem levou, em que termos, o que aprendemos). MERCADO.

### MK-26 · Quando o mercado fecha
Sinais: recusas em série por "momento", spreads de referência abrindo, resgates nos fundos
de crédito. Conduta da mesa: dizer ao cliente com número (PR-12), recalibrar ou pausar
(OP-12), nunca empurrar caso bom em janela ruim para cumprir agenda. CASA.

### MK-27 · Tudo registrado
Cada contato com fundo (o que foi enviado, dito, respondido, quando) em registro por caso
e por instituição. É a memória institucional da distribuição, o insumo do mapa (MK-11) e a
proteção da casa em qualquer disputa sobre quem apresentou o quê a quem. CASA.

### MK-28 · O fundo é cliente também
O investidor bem tratado no caso que não levou é o comprador rápido do caso seguinte.
Feedback honesto merece retorno ("ajustamos aquilo que você apontou"), e o mapa registra o
que cada gestor pediu para ver no futuro. A distribuição composta é o ativo comercial da
casa. CASA.

---

# MÓDULO 9 · RED FLAGS E DECLÍNIO DE MANDATO (RF-01 a RF-20)

A mesa não dá parecer, mas escolhe o que leva ao mercado, porque o ativo dela é reputação.
Red flag não é veto automático: é achado que exige tratamento explícito (explicação com
evidência no memo) ou, acumulado, declínio. Flag escondida que o fundo descobre é a morte
lenta da casa (LC-12).

## 9.1 Sinais contábeis

### RF-01 · Estoque crescendo acima da receita
Dois trimestres seguidos: ou a demanda caiu (receita futura vai cair) ou o estoque está
podre (provisão faltando, Q-13). Tratamento: abrir giro por linha e idade; a explicação
boa existe (estoque estratégico de insumo antes de alta, pré-safra) e vem com documento.
DEF.

### RF-02 · PMR esticando com receita estável
Cliente financiando na empresa: qualidade do recebível caindo ou venda forçada com prazo.
Cruzar com a provisão (estável = provisão errada) e com concentração (o prazo esticou para
quem?). Liga Q-14 e o valor da carteira como garantia (ES-11). DEF.

### RF-03 · Margem descolada dos pares sem causa física
Margem muito acima do setor sem escala, integração ou nicho identificável: procurar preço
de transferência (Q-07), capitalização indevida de custo, receita antecipada. A causa
física existe e se documenta, ou a margem é frágil e o memo trata. DEF.

### RF-04 · Caixa alto com dívida cara simultâneos
Quem paga CDI+6 com caixa aplicado a CDI tem motivo: caixa comprometido (não é livre),
janela de captação defensiva, ou caixa que não existe como parece (saldo de véspera,
Q-04). Pedir extrato médio, não saldo de data. HEURÍSTICA.

### RF-05 · Troca de auditor
Especialmente de maior para menor, ou após divergência: perguntar o motivo formal e
cruzar com o parecer anterior (havia ênfase?). Uma troca explicada é normal; troca +
republicação + gerencial otimista é padrão composto (RF-18). DEF.

### RF-06 · Republicação de demonstrações
O que mudou, por quê, e qual número do passado em que a mesa se apoiaria mudou junto.
Republicação técnica (norma nova) é neutra; republicação de receita/estoque/dívida é
severa. DEF.

### RF-07 · Gerencial sistematicamente melhor que o auditado
A conciliação Q-09 mostra viés sempre na mesma direção: é cultura de número, e a mesa
desconta TODAS as projeções por esse viés medido (Q-10). Viés documentado no memo interno;
projeção no material vem da base conciliada, nunca do gerencial. CASA.

### RF-08 · Receita concentrada no fim do período
Faturamento do mês 12 (ou do último mês do tri) muito acima da média: antecipação de
receita, canal empurrado (venda com direito de devolução), ou sazonalidade real
documentada. Cut-off é a pergunta (Q-05); a resposta boa mostra a entrega, não a nota.
DEF.

### RF-09 · Circularidade com partes relacionadas
Receita para ligada, custo de ligada, mútuo com ligada e garantia cruzada da mesma ligada:
o perímetro econômico real é maior que o CNPJ e a análise consolida (D-10, D-11, Q-07).
Tratamento: mapa do grupo com fluxos (EMP-10) e, em geral, covenant que fecha o perímetro
(ES-26/27 estendidos a ligadas). DEF.

## 9.2 Sinais societários e operacionais

### RF-10 · Litígio entre sócios
Processo, arbitragem ou bloqueio societário entre controladores: risco de comando durante
a vida da dívida (quem assina waiver? quem aprova venda de ativo?). Dívida longa com
guerra societária aberta raramente é apresentável; a resposta pode ser prazo curto com
garantia forte, ou esperar a solução (OP-12). LEI/MERCADO.

### RF-11 · Sucessão aberta em empresa de pessoa
Fundador de idade avançada, sem sucessor nomeado, sem acordo (EMP-13): o crédito de 6 anos
depende de alguém que pode não estar. Mitigante real: sucessão contratada, gestão
profissional instalada, seguro chave, covenant de permanência. MERCADO.

### RF-12 · Garantia cruzada com empresa problemática do grupo
A saudável avaliza a quebrada (D-10): o contágio é jurídico, não hipotético. Dimensionar a
exposição real e, em regra, exigir liberação do aval cruzado como CP (MA-20) ou tratar o
grupo como consolidado no risco. DEF.

### RF-13 · Contingência reclassificada na véspera
Provável que virou possível no exercício do pedido (D-16): cruzar as notas de dois anos e
pedir a opinião legal que fundamentou. Sem fundamento novo documentado, a mesa usa a
classificação antiga na análise. DEF.

### RF-14 · A informação que muda
Cada versão de planilha com números diferentes para o mesmo período, sem trilha: ou
controle fraco (EMP-16) ou maquiagem em curso. Tratamento: congelar análise na base
conciliada (E05), listar divergências e pedir a fonte primária (razão, extrato). Três
versões diferentes do mesmo número é flag severa. CASA.

### RF-15 · Resistência ao analítico
O agregado sempre vem, o analítico nunca: o que o analítico mostraria? (concentração,
parte relacionada, inadimplência). A recusa persistente a item padrão de diligência é
informação em si, e a mesa não leva a mercado o que não conseguiu ver (LC-12). CASA.

### RF-16 · Pressa incompatível com diligência
Urgência que não sobrevive ao teste IN-22 e pressiona contra as verificações: quem não tem
o que esconder aceita o rito. Exceção real (vencimento datado, D-03) tem documento;
tratamento é ponte estruturada (OP-10), nunca atalho de diligência. CASA.

### RF-17 · "O outro assessor já tem tudo"
Caso que circula com outro material, números divergentes do que a mesa apuraria: risco de
mercado já queimado (MK-16) e de guerra de versão. Verificar o que circulou antes de
aceitar o mandato; às vezes a resposta certa é declinar, às vezes é reapresentação formal
com correção pública da base. MERCADO.

## 9.3 Acúmulo e declínio

### RF-18 · Flags compostas
Uma flag tratada é normal; três da mesma família é padrão. Combinações que rebaixam o caso
independentemente de explicação individual: RF-05+06+07 (cultura de número), RF-01+02+08
(qualidade de receita), RF-09+12+14 (perímetro nebuloso). O julgamento é da mesa,
documentado; o sistema aponta o acúmulo. CASA.

### RF-19 · Critérios de declínio
A casa declina quando: a contabilidade não permite análise e o cliente não quer arrumar;
o analítico essencial é negado (RF-15); a expectativa é incorrigível após calibragem com
número; o uso real não se sustenta ou não se declara; é special situations/pré-insolvência
(outro ofício, com indicação honesta); flags compostas sem tratamento possível (RF-18);
achado de integridade (fraude, passivo oculto deliberado). Declínio é decisão da mesa,
registrada com motivo. CASA.

### RF-20 · Como se declina
Por conversa, não por sumiço: o motivo técnico em linguagem direta, sem sermão; o caminho
de volta quando existe ("com auditoria de dois exercícios, reabrimos"); a indicação
alternativa quando cabe (banco, factoring, special sits). Registro interno do declínio e
do motivo (alimenta IN-19). O declínio elegante preserva a relação e frequentemente volta
como mandato melhor em dois anos. CASA.

---

# MÓDULO 10 · LINGUAGEM E CONDUTA DA CASA (LC-01 a LC-13)

### LC-01 · Frase declarativa com fonte
O padrão da casa: sujeito, verbo, número, fonte. "A receita cresceu 18% em 2025 (DF
auditada, nota 22)". Sem voz passiva evasiva, sem "acredita-se", sem futuro do pretérito
defensivo. O que não tem fonte é premissa e se declara como premissa (Constituição 2.5).
CASA.

### LC-02 · Adjetivo sem número é proibido
"Forte geração de caixa" não existe; "conversão de EBITDA em caixa de 74% na média de 3
anos" existe. O adjetivo pode acompanhar o número, nunca substituí-lo. Vale para material,
e-mail e conversa registrada. CASA.

### LC-03 · O risco se nomeia primeiro
Em qualquer peça e qualquer reunião: os riscos aparecem cedo, com substantivo próprio e
mitigante real (MA-07). A casa nunca é pega defendendo que um risco conhecido não existia;
a credibilidade composta vem de ser a fonte que mostra o problema antes. CASA.

### LC-04 · Vocabulário permitido e proibido
O da Constituição seção 5, aplicado a TODA comunicação (material, e-mail, mensagem,
conversa): "estrutura indicativa", "suportável com ajustes", "sujeito a underwriting" sim;
"aprovado", "garantido", "recomendamos o investimento", "funding confirmado" nunca. O
sistema verifica materiais; a mesa se policia no resto. CASA.

### LC-05 · Nunca prometer o que não é nosso
Aprovação é do fundo, taxa final é da negociação, prazo de resposta é do comitê alheio. A
mesa promete o que controla: qualidade do material, condução do processo, calibragem
honesta, prazo das próprias entregas. CASA.

### LC-06 · Disclaimer não é enfeite
Presente em todo material (MA-30), citado quando a conversa derrapa para "então está
aprovado?": a resposta padrão existe e é usada ("o que temos é uma estrutura indicativa
suportada pela análise; aprovação é decisão do investidor após diligência"). LEI/CASA.

### LC-07 · Dois idiomas, uma economia
PT e EN dizem o mesmo número da mesma base (MA-29). Terminologia do glossário bilíngue da
casa; tradução nova de termo técnico passa pelo glossário antes de circular. CASA.

### LC-08 · Confidencialidade entre casos
Nenhuma informação de um caso alcança outro: nem como exemplo anonimizado detalhável, nem
como benchmark identificável, nem em conversa com fundo ("outra empresa do setor que
atendemos..."). Dados agregados para a grade da casa (PR-13) são anonimizados de forma
irreversível. LEI/CASA.

### LC-09 · Conflito de interesse
Dois clientes no mesmo setor disputando o mesmo bolso: revelado a ambos, com muralha
interna (times separados quando a casa crescer; enquanto pequena, a regra é transparência
e a recusa do segundo mandato quando a muralha não é crível). A casa nunca assessora os
dois lados da mesma operação. CASA.

### LC-10 · O que se escreve e o que se fala
Tudo que compromete (número, prazo, termo) se escreve; o que se fala relevante vira
registro (MK-27). A regra prática: nada dito em reunião que a mesa não sustentaria por
escrito; nada escrito que não sobreviva a ser lido em voz alta numa disputa. CASA.

### LC-11 · Velocidade com verdade
Responde-se rápido com o que se sabe e o que falta ("temos X; Y depende do balancete que
chega quinta"), nunca rápido com achismo. O "não sabemos ainda" datado é resposta
profissional; o chute confiante é a dívida que vence na diligência. CASA.

### LC-12 · Zero surpresa como métrica
A regra de ouro operacionalizada: item levantado em diligência de fundo que não estava no
material é registrado como falha da mesa, classificado (qual módulo falhou) e vira
procedimento novo ou emenda. A meta é zero; a série histórica é métrica pública interna da
casa. CASA.

### LC-13 · Forma da casa
Sem travessão em nenhum texto (reescrever a frase). Sem jargão decorativo: cada coisa pelo
nome que tem; termo técnico real (term sheet, covenant, book) sim, poesia de mercado não.
Datas absolutas em material (25/08/2026, não "recentemente"). Números com separador e
moeda explícita. CASA.

---

# PRODUÇÃO E GOVERNANÇA DESTE PLAYBOOK

1. **Carga**: cada procedimento vira registro no contrato de procedimento (`draft`),
   com id, módulo, autoridade, dependências e, quando aplicável, a forma-pergunta cliente
   (IN-15) e o template associado (M7).
2. **Valores versionados**: onde o texto diz "referência de casa versionada" (bandas de
   alavancagem, haircuts, folgas, prazos), o número vive em dado com fonte, data e dono,
   nunca hard-coded no procedimento. O procedimento fixa o método; o dado fixa o número.
3. **Validação**: fundador aprova conteúdo a conteúdo (lógica econômica e prática de
   mesa); afirmação jurídico-tributária impressa exige revisão especializada com vigência
   antes de LEI/CASA. Aprovação registra `approved_by` e data.
4. **Evolução**: recusa de fundo (MK-22), surpresa em diligência (LC-12), correção de
   revisor e caso adversarial que passou onde não devia geram procedimento novo ou emenda,
   sempre datados. O playbook nunca está pronto; está governado.
