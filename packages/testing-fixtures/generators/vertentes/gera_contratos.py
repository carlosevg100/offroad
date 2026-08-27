# -*- coding: utf-8 -*-
import subprocess, pathlib
OUT = pathlib.Path("/Users/olpi/Desktop/Offroad Capital/simulacao/empresa/documentos")
CAB = '<meta charset="utf-8"><link rel="stylesheet" href="_pdf.css">'
def pdf(html, nome):
    pathlib.Path("_tmp.html").write_text(CAB + '<div class="jur">' + html + "</div>", encoding="utf-8")
    subprocess.run(["weasyprint", "_tmp.html", str(nome)], check=True, capture_output=True)
    print(pathlib.Path(nome).name)

# ------------------------------------------- 1. Desconto de duplicatas, com regresso
pdf("""
<h1>INSTRUMENTO PARTICULAR DE CONTRATO DE DESCONTO DE TITULOS</h1>
<p class="sm">Contrato n. CD-2024/44127 &middot; Registrado em cartorio sob o n. 118.442</p>
<h2>Partes</h2>
<p><b>CREDORA:</b> BANCO SANTA CRUZ S.A., instituicao financeira, CNPJ 33.914.005/0001-92.</p>
<p><b>CEDENTE:</b> VERTENTES DISTRIBUIDORA DE MATERIAIS ELETRICOS E HIDRAULICOS LTDA, CNPJ
08.412.663/0001-47, com sede na Rod. Fernao Dias km 20, Contagem, MG.</p>
<h2>Clausula 1 - Do objeto</h2>
<p>1.1. A CREDORA concede a CEDENTE limite rotativo para desconto de duplicatas mercantis de
emissao da CEDENTE, ate o montante de <b>R$ 6.000.000,00</b> (seis milhoes de reais), observadas
as condicoes deste instrumento.</p>
<p>1.2. O limite sera revisto anualmente, a exclusivo criterio da CREDORA, que podera reduzi-lo ou
cancela-lo mediante comunicacao com 30 (trinta) dias de antecedencia.</p>
<h2>Clausula 2 - Da remuneracao</h2>
<p>2.1. Sobre o valor descontado incidira taxa de desconto equivalente a CDI acrescido de 4,90%
(quatro inteiros e noventa centesimos por cento) ao ano, calculada pro rata die.</p>
<p>2.2. Incidira, ainda, tarifa de analise por titulo no valor de R$ 3,80 (tres reais e oitenta
centavos), debitada no ato do desconto.</p>
<h2>Clausula 3 - Da cessao e da responsabilidade da CEDENTE</h2>
<p>3.1. A cessao dos titulos e feita em carater definitivo quanto a titularidade.</p>
<p>3.2. <b>A CEDENTE responde solidariamente pela solvencia dos devedores dos titulos cedidos,
obrigando-se a recomprar, no prazo de 5 (cinco) dias uteis contados da notificacao da CREDORA,
todo e qualquer titulo que nao seja liquidado ate 10 (dez) dias apos o respectivo vencimento,
pelo valor de face acrescido dos encargos contratuais.</b></p>
<p>3.3. A obrigacao de recompra prevista na clausula 3.2 subsiste independentemente da causa do
inadimplemento, inclusive em caso de falencia ou recuperacao judicial do devedor.</p>
<p>3.4. Para garantia das obrigacoes aqui assumidas, a CEDENTE outorga aval de seus socios,
NELSON PRADO RIBEIRO, MARCELO PRADO RIBEIRO e CRISTINA PRADO RIBEIRO.</p>
<h2>Clausula 4 - Do vencimento antecipado</h2>
<p>4.1. Sao eventos de vencimento antecipado, entre outros: (i) o descumprimento da obrigacao de
recompra; (ii) o protesto de titulos da CEDENTE em valor superior a R$ 200.000,00; (iii) a
alteracao do controle societario sem previa anuencia.</p>
<h2>Clausula 5 - Do foro</h2>
<p>5.1. Fica eleito o foro da Comarca de Belo Horizonte, Estado de Minas Gerais.</p>
<p class="sm">Contagem, 18 de marco de 2024.</p>
""", OUT / "divida" / "Contrato Desconto Duplicatas - Banco Santa Cruz.pdf")

# ------------------------------------------- 2. Fomento mercantil (factoring)
pdf("""
<h1>CONTRATO DE FOMENTO MERCANTIL</h1>
<p class="sm">Contrato n. FM-0912/2025</p>
<h2>Partes</h2>
<p><b>FACTOR:</b> PRIME FOMENTO MERCANTIL LTDA, CNPJ 21.660.418/0001-05, com sede em Belo
Horizonte, MG.</p>
<p><b>ADERENTE:</b> VERTENTES DISTRIBUIDORA DE MATERIAIS ELETRICOS E HIDRAULICOS LTDA, CNPJ
08.412.663/0001-47.</p>
<h2>Clausula 1 - Do objeto</h2>
<p>1.1. A FACTOR adquirira da ADERENTE, mediante negociacao caso a caso, direitos creditorios
representados por duplicatas mercantis, ate o limite operacional de <b>R$ 2.500.000,00</b>.</p>
<h2>Clausula 2 - Do fator de compra</h2>
<p>2.1. O fator de compra sera de <b>3,45% (tres inteiros e quarenta e cinco centesimos por cento)
ao mes</b>, aplicado sobre o valor de face do titulo, pro rata die entre a data da operacao e o
vencimento.</p>
<p>2.2. Sera cobrado, adicionalmente, ad valorem de 0,60% sobre o valor de face de cada titulo, a
titulo de servicos de analise cadastral, cobranca e administracao.</p>
<p>2.3. Em caso de prorrogacao, incidira o fator vigente na data da prorrogacao acrescido de 0,40%
ao mes.</p>
<h2>Clausula 3 - Da responsabilidade</h2>
<p>3.1. A ADERENTE responde pela existencia, certeza, liquidez e exigibilidade dos creditos
cedidos, bem como pela idoneidade das operacoes que lhes deram origem.</p>
<p>3.2. <b>Verificado o nao pagamento do titulo em ate 3 (tres) dias apos o vencimento, a ADERENTE
obriga-se a substitui-lo por outro de igual ou superior valor e prazo, ou a recompra-lo pelo valor
de face acrescido do fator do periodo.</b></p>
<h2>Clausula 4 - Das garantias</h2>
<p>4.1. As obrigacoes sao garantidas por nota promissoria emitida pela ADERENTE e avalizada por
NELSON PRADO RIBEIRO, no valor do limite operacional.</p>
<p class="sm">Belo Horizonte, 09 de dezembro de 2025.</p>
""", OUT / "divida" / "Contrato Fomento Mercantil - Prime.pdf")

# ------------------------------------------- 3. Risco sacado
pdf("""
<h1>CONVENIO DE ANTECIPACAO A FORNECEDORES</h1>
<p class="sm">Convenio n. RS-2023/771 &middot; Modalidade: risco sacado</p>
<h2>Partes</h2>
<p><b>INSTITUICAO:</b> BANCO ITAU UNIBANCO S.A.</p>
<p><b>SACADA CONVENENTE:</b> VERTENTES DISTRIBUIDORA DE MATERIAIS ELETRICOS E HIDRAULICOS LTDA.</p>
<h2>Clausula 1 - Do objeto</h2>
<p>1.1. A INSTITUICAO disponibilizara aos fornecedores da CONVENENTE, previamente cadastrados, a
faculdade de antecipar o recebimento dos titulos por ela sacados, ate o limite global de
<b>R$ 3.500.000,00</b>.</p>
<h2>Clausula 2 - Das obrigacoes da CONVENENTE</h2>
<p>2.1. A CONVENENTE obriga-se a pagar a INSTITUICAO, nas datas de vencimento originais dos
titulos, o valor integral de face, independentemente de o fornecedor ter ou nao antecipado.</p>
<p>2.2. <b>A partir da adesao do fornecedor, a obrigacao da CONVENENTE passa a ser devida
diretamente a INSTITUICAO, alterando-se a natureza da relacao originalmente comercial.</b></p>
<p>2.3. A CONVENENTE nao podera opor a INSTITUICAO excecoes pessoais que detenha contra o
fornecedor, inclusive as decorrentes de vicio, devolucao ou inadimplemento da relacao comercial
subjacente.</p>
<h2>Clausula 3 - Do custo</h2>
<p>3.1. A CONVENENTE arcara com taxa de manutencao de convenio de 0,18% ao mes sobre o saldo
utilizado, debitada mensalmente em conta corrente.</p>
<p class="sm">Contagem, 22 de agosto de 2023.</p>
""", OUT / "divida" / "Convenio Risco Sacado - Itau.pdf")

# ------------------------------------------- 4. Politica de credito e cobranca
pdf("""
<h1>POLITICA DE CREDITO E COBRANCA</h1>
<p class="sm">Vertentes Distribuidora &middot; Versao 3 &middot; aprovada pela diretoria em 14/02/2025</p>
<h2>1. Concessao de limite</h2>
<p>1.1. Todo cliente novo passa por analise cadastral antes da primeira venda a prazo. A analise
consulta Serasa, Receita Federal e referencias comerciais de dois fornecedores.</p>
<p>1.2. O limite inicial de cliente novo e de R$ 8.000,00 para pessoa juridica com CNPJ ativo ha
mais de 24 meses e sem restricao. Cliente com restricao vende-se somente a vista.</p>
<p>1.3. A ampliacao de limite exige seis meses de historico sem atraso superior a 15 dias e e
aprovada pelo diretor comercial ate R$ 80.000,00, e pela diretoria financeira acima disso.</p>
<p>1.4. Cliente com faturamento acumulado superior a R$ 500.000,00 nos ultimos doze meses tem o
limite revisto semestralmente com base em balanco ou faturamento declarado.</p>
<h2>2. Prazos concedidos</h2>
<p>2.1. Os prazos padrao sao 28, 30, 35, 42, 45, 56 e 60 dias, conforme a linha de produto e o
porte do cliente. Prazo superior a 60 dias exige aprovacao da diretoria financeira.</p>
<p>2.2. Vendas com prazo de 90 dias sao admitidas apenas para obra com contrato assinado e
mediante garantia adicional.</p>
<h2>3. Regua de cobranca</h2>
<p>3.1. D+1 apos o vencimento: aviso automatico por mensagem e e-mail.</p>
<p>3.2. D+5: contato telefonico do assistente de cobranca.</p>
<p>3.3. D+15: bloqueio automatico de novas vendas a prazo para o cliente.</p>
<p>3.4. D+30: negativacao junto aos bureaus de credito e envio a protesto, exceto quando houver
acordo formalizado por escrito.</p>
<p>3.5. D+90: envio para cobranca terceirizada, com honorarios de 12% sobre o valor recuperado.</p>
<p>3.6. D+180: o titulo e classificado como perda para fins gerenciais e provisionado
integralmente, sem prejuizo da continuidade da cobranca judicial.</p>
<h2>4. Renegociacao</h2>
<p>4.1. A renegociacao de titulo vencido pode ser autorizada pelo gerente de credito ate
R$ 30.000,00 e pela diretoria financeira acima desse valor.</p>
<p>4.2. Na renegociacao, o titulo original e substituido por novo titulo com prazo adicional de ate
180 dias, acrescido de juros de 2,5% ao mes e multa de 2%.</p>
<h2>5. Devolucoes, bonificacoes e abatimentos</h2>
<p>5.1. Devolucao por avaria ou divergencia de pedido e aceita em ate 7 dias do recebimento.</p>
<p>5.2. Abatimento comercial pode ser concedido pelo vendedor ate 3% do valor da nota, e pelo
gerente comercial ate 10%. Acima disso, exige aprovacao da diretoria comercial.</p>
<p>5.3. Bonificacao em produto e registrada como devolucao para fins de controle.</p>
<h2>6. Restricoes</h2>
<p>6.1. Nao se concede prazo a empresa do mesmo grupo economico dos socios sem aprovacao expressa
da diretoria e registro em ata.</p>
<p>6.2. Nao se aceita titulo de cliente cujo CNPJ esteja com situacao cadastral irregular na
Receita Federal.</p>
""", OUT / "recebiveis" / "Politica de Credito e Cobranca.pdf")
