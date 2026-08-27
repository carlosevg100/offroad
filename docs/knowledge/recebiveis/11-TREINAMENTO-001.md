# Treinamento 001: financiamento com recebíveis

Primeiro treinamento vertical do sistema Offroad. Escopo fechado: operações de crédito
lastreadas ou garantidas por recebível no Brasil.

Este documento define a unidade de treinamento, o padrão de profundidade, o banco de
casos e a disciplina antialucinação. O método geral está em
[10-COMO-TREINAR.md](10-COMO-TREINAR.md).

---

# 1. A unidade de treinamento é a célula, não a categoria

Treinar por categoria é raso, porque a mesma empresa muda de operação conforme o
comprador. Distribuidora cedendo carteira para FIDC multicedente e a mesma
distribuidora emitindo CCB com cessão fiduciária para uma gestora são **operações
diferentes**: informação crucial diferente, pergunta diferente, cálculo diferente,
material diferente e objeção de comitê diferente.

A unidade é a **célula**, o par categoria por porta. Cada célula ganha uma **ficha de
operação**, e a ficha é o objeto de treinamento.

## A matriz

Linhas são as catorze categorias do [módulo 2](02-MAPA-DE-CASOS.md). Colunas são as
quatro portas do [módulo 1](01-QUEM-COMPRA.md).

| Categoria | P1 FIDC multicedente | P2 Risco sacado | P3 Gestora de crédito | P4 Securitizadora |
|---|---|---|---|---|
| A Venda mercantil B2B | **A1 núcleo** | A2 | A3 | A4 |
| B Fornecedor de grande grupo | B1 | **B2 núcleo** | . | . |
| C Serviço a PJ | **C1 núcleo** | C2 | C3 | . |
| D Contrato recorrente | D1 | . | D3 | **D4 núcleo** |
| E Cartão e adquirente | **E1 núcleo** | . | E3 | E4 |
| F Saúde contra operadora | F1 | F2 | F3 | **F4** |
| G Mensalidade contra PF | G1 | . | . | **G4 núcleo** |
| H Agro | **H1** | H2 | H3 | **H4** |
| I Setor público | I1 | **I2** | I3 | . |
| J Obra e medição | . | J2 | **J3 núcleo** | J4 |
| K Imobiliário | . | . | K3 | **K4 núcleo** |
| L Carteira de crédito originada | **L1 núcleo** | . | L3 | L4 |
| M Marketplace | M1 | . | . | M4 |
| N Exportação | . | . | **N3** | . |

Ponto significa combinação que não se sustenta e não recebe ficha. Sobram trinta e
sete células, das quais **oito são núcleo** e respondem pela maior parte do volume.

**Ordem de produção.** As oito núcleo primeiro, na ordem A1, E1, B2, C1, L1, D4, G4,
J3. Depois as adjacentes de cada núcleo. Por último as periféricas.

---

# 2. O que uma ficha de operação contém

A ficha é o material de instrução do sistema para aquela operação. Sem qualquer uma
das seções abaixo, ela não está pronta.

| Seção | Conteúdo | Por que existe |
|---|---|---|
| **1. A operação** | O que se cede, a quem, com que estrutura, por qual preço e prazo | Define o objeto |
| **2. Os compradores** | Fundos nomeados, com critério de cada um e o que muda entre eles | Sem nome, não há recomendação |
| **3. Informação crucial** | Ranqueada, com o que cada uma muda no resultado | Separa o que decide do que enfeita |
| **4. A régua de cálculo** | Toda métrica com fórmula, fonte do dado, limiar e leitura | Camada 2, e é código |
| **5. O que perguntar** | Apenas o resíduo, em lote, depois de esgotar o documento | A companhia nunca é interrogada |
| **6. O que o comitê pergunta** | Objeção antecipada com a resposta e a evidência que a sustenta | O material precisa responder antes |
| **7. O material de entrega** | O que exatamente vai para este comprador, e em que formato | Cada porta recebe coisa diferente |
| **8. Defeitos e detecção** | Cada defeito característico com o método de detecção | Achar antes do comprador |
| **9. Erros do sistema** | O que o modelo tende a errar nesta célula | Antialucinação específica |
| **10. Banco de casos** | Os casos desta célula com nível, defeito e gabarito | Como se mede |

A ficha de referência já escrita é
[A1, venda mercantil para FIDC multicedente](fichas/A1-mercantil-fidc-multicedente.md).
Ela define o padrão de profundidade. Ficha que não chega àquele nível volta.

---

# 3. O banco de casos

## Quantidade

Por célula núcleo, **doze casos**. Por célula não núcleo, **seis**.

| Nível | Por célula núcleo | O que exercita |
|---|---|---|
| Limpo | 2 | Classificação e cálculo |
| Real | 6 | Elegibilidade, recomendação, defeito |
| Difícil | 4 | Detecção do que foi deliberadamente mascarado |

Oito células núcleo a doze casos, mais vinte e nove células a seis, dá **duzentos e
setenta casos**. Cada um com acervo, base analítica, defeitos plantados e gabarito.

## As dimensões de variação

Cada caso é o mesmo gerador com parâmetros diferentes. As dimensões que importam:

| Dimensão | Faixa |
|---|---|
| Porte | Receita de R$ 15mm a R$ 400mm |
| Concentração no maior sacado | 3% a 35% |
| Prazo médio da carteira | 25 a 130 dias |
| Diluição | 0,5% a 9% |
| Perda acima de 180 dias | 0,3% a 7% |
| Alavancagem ajustada | 0,8x a 6,5x |
| Qualidade documental | Completa, parcial, precária |
| Divergência contábil | Zero, imaterial, material |
| Histórico disponível | 6, 12, 24, 36 meses |
| Defeitos plantados | 1 a 8, do catálogo da célula |

**A regra da calibração.** Cada caso precisa fechar aritmeticamente. Base analítica,
razão contábil, balancete e extrato precisam reconciliar, exceto pela divergência
plantada, que é conhecida e registrada no gabarito. Caso que não fecha não testa nada,
ensina errado.

## O que o gabarito registra

```
caso.<id>
  celula                    A1
  nivel                     limpo | real | dificil
  parametros{}              as dimensões acima
  metricas_corretas{}       toda métrica da régua, com valor exato
  defeitos_plantados[]      id, descrição, evidência, onde detectar
  portas_corretas[]         com justificativa
  compradores_compativeis[] com o critério que aprova cada um
  compradores_incompativeis[] com a cláusula exata que barra
  ajuste_que_destrava{}     o que mudar e quantos compradores entram
  perguntas_legitimas[]     o resíduo que sobra depois do documento
  objecoes_esperadas[]      o que o comitê levanta
```

O campo `compradores_incompativeis` com a cláusula exata é o mais valioso. É ele que
transforma "provavelmente não cabe" em "excede o limite de 10% da cláusula 4.2 do
regulamento".

---

# 4. Disciplina antialucinação

Este é o ponto onde o sistema ganha ou perde credibilidade, e ele não se resolve com
instrução genérica de ser cuidadoso.

## A regra de procedência

**Toda afirmação numérica ou normativa carrega um de três estados, e nada além:**

| Estado | Significa | Como aparece |
|---|---|---|
| **Medido** | Calculado pela camada 2 a partir da base | Valor, mais o marcador que resolve em arquivo, aba e linha |
| **Citado** | Extraído de documento ou regulamento | Valor, mais documento, cláusula e data |
| **Estimado** | Faixa de mercado ou premissa | Marcado como estimativa, com a base e a data do levantamento |

Afirmação sem um dos três estados **não sai**. Isso vale para taxa, para limite de
concentração, para prazo de aprovação e para apetite de comprador.

## Os erros que este domínio produz

| Erro | Como se manifesta | A trava |
|---|---|---|
| Inventar critério de fundo | "Esse fundo aceita até 15% por sacado" sem ter o regulamento | Critério só sai do corpus. Sem regulamento, o comprador entra como não avaliado |
| Tratar faixa como cotação | "A taxa será de 1,6% ao mês" | Faixa indicativa é sempre estimada, e a palavra cotação é proibida antes de proposta escrita |
| Calcular sobre subconjunto e apresentar como total | Métrica de uma aba da planilha virando métrica da carteira | A camada 2 declara universo e período em toda saída |
| Preencher lacuna com número plausível | Mês faltante na base recebendo interpolação silenciosa | Lacuna é lacuna. Vira pergunta, nunca preenchimento |
| Confundir atraso com perda | Vencido acima de 90 dias apresentado como perda | São métricas separadas na régua, com nomes distintos |
| Confundir PDD com perda real | Provisão contábil citada como perda econômica | PDD é citada como provisão, perda é medida por safra |
| Afirmar performado sem prova | Título tratado como entregue sem canhoto | Performance exige evidência documental nomeada |
| Somar dívida sem reconciliar | Endividamento pelo balanço, ignorando cessão com regresso e risco sacado | A ponte para a dívida ajustada é obrigatória |
| Recomendar comprador por reputação | Citar casa grande sem checar se ela compra aquele ativo | Recomendação sai da camada 3, e não da memória |

## A trava estrutural

O modelo **não tem acesso a caminho que produza número**. Ele lê o resultado da camada
2 e da camada 3, e escreve sobre ele. Não há aritmética no texto gerado. Essa
separação é o que impede a classe inteira de erro, e é decisão de arquitetura, não de
instrução.

---

# 5. O que o sistema precisa saber fazer, por camada

Traduzindo o pedido em capacidade verificável.

| Capacidade | Onde vive | Como se prova |
|---|---|---|
| **Saber analisar** | Camada 2, régua por célula | Métrica bate com o gabarito, exata |
| **Saber quais informações são cruciais** | Seção 3 da ficha | Pede o que decide, não pede o que enfeita. Medido por precisão do pedido |
| **Saber questionar** | Seção 5 da ficha | Pergunta só o resíduo, em lote, depois de esgotar o documento. Medido contra `perguntas_legitimas` |
| **Saber estruturar** | Camada 4, restringida pela 3 | Sobrevive a três de cinco comitês adversariais |
| **Saber montar material para aquele financiador** | Seção 7 da ficha, mais a doutrina | Quatro passagens de revisão, e o comitê não pede o que já está no material |
| **Não alucinar** | Regra de procedência | Toda afirmação resolve em medido, citado ou estimado. Auditoria automática de saída |

---

# 6. Estado e sequência

| Item | Estado |
|---|---|
| Módulos 1, 2 e 3 de conhecimento | Escritos |
| Método de treinamento | Escrito |
| Matriz de células | Definida, trinta e sete células |
| Ficha padrão A1 | Escrita, é a referência de profundidade |
| Corpus de regulamentos | Não iniciado, e destrava a camada 3 |
| Fichas das demais sete núcleo | Não iniciadas |
| Banco de casos A1 | **Escrito: 20 casos em [casos/A1-mercantil-b2b-CASOS.md](casos/A1-mercantil-b2b-CASOS.md)**, com a Vertentes implementando o A1-03 em dados |
| Comitê adversarial | Não iniciado, depende da camada 3 |

**A próxima coisa a fazer é a colheita de regulamentos.** Ela não depende de decisão
nenhuma, é a única fonte de critério citável, e sem ela toda ficha fica com a seção 2
em estimativa em vez de citação.
