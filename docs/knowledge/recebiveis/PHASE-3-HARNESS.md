# Fase 3 · Harness de caso completo

Data: 27/08/2026

## Objetivo

A Fase 3 prova uma execução inteira da vertical, sem transformar um teste de fórmula
em falsa aprovação do produto. O runner reúne, na ordem, classificação, matemática
da Fase 1, elegibilidade de rotas da Fase 2A, aderência a programas da Fase 2B,
defeitos detectados e perguntas ao cliente. A avaliação compara essa saída com um
gold congelado.

O runner não recebe permissão para recomendar à companhia, contatar o mercado,
realizar introdução qualificada ou expressar aprovação de crédito. Todas essas
fronteiras permanecem `false`.

## Contrato executável

`@offroad/case-engine` expõe `runReceivablesCasePipeline`. Entradas classificadas por
modelo ou parser continuam sendo entradas estreitas; o runner não inventa o que o
detector ainda não produziu. Ele exige:

- categoria e célula com evidência;
- fatos de rota com procedência antes de uma decisão;
- cálculos canônicos executados no `financial-core`;
- programas identificados com política, apetite e capacidade vigentes;
- defeitos com evidência, e valor medido quando houver quantificação;
- perguntas com gatilho não estimado e prova de que toda evidência entregue foi
  pesquisada sem conter a resposta.

Uma shortlist interna só contém programas em `live_appetite_confirmed`. A fonte do
apetite e a fonte da capacidade fazem parte do relatório, separadas dos critérios de
política.

## Régua do gold

`@offroad/evals` compara:

| Dimensão | Gate |
|---|---|
| cálculos | igualdade textual exata, 100% |
| classificação multilabel | pelo menos 95% |
| defeitos | recall mínimo de 90% e precisão mínima de 85% |
| programas compatíveis | conjunto exato |
| perguntas | conjunto exato, todas ancoradas, toda evidência entregue esgotada, nenhuma pergunta já respondida |
| procedência | 100% |

Métricas derivadas que possuem vários inputs governados carregam a procedência de
todos os inputs. Um único campo de procedência não é fabricado para esconder essa
composição.

## Duas provas distintas

### Gold replay do harness

O teste sintético compacto atravessa as cinco camadas com uma factoring confirmada.
Ele passa todos os gates. Essa prova valida o contrato, a composição e o avaliador;
não acredita os detectores de documentos.

### Baseline medido da Vertentes A1-03

O baseline usa a representação canônica congelada da Vertentes apenas para a camada
matemática. Os seis cálculos selecionados fecham exatamente:

- carteira aberta;
- diluição;
- perda ajustada;
- dívida líquida ajustada;
- CET anual antes de tributos da proposta Prime;
- advance rate do cenário governado.

O baseline falha deliberadamente nos elementos ainda não implementados a partir dos
21 arquivos brutos:

- 0 de 8 defeitos plantados produzidos pela esteira de extração e reconciliação;
- 0 de 2 programas sintéticos do gold confirmados pelo matching do caso;
- 0 de 4 perguntas necessárias produzidas pelo resolvedor de lacunas;
- Fase 1 ainda incompleta por cobertura parcial, volume cedido ausente e tratamento
  tributário não fornecido.

Essa falha é evidência, não regressão. Um teste permanente exige cálculo exato e, ao
mesmo tempo, confirma que o caso não pode ser promovido enquanto esses gates
continuarem ausentes.

## Separação contra vazamento de fixture

`raw/empresa` é a única entrada permitida para acreditar extração, classificação,
reconciliação e detecção. `source`, `normalized` e `expected` são verdade reservada e
gabarito. O teste atual que consome `normalized` prova somente matemática. Fazer um
detector ler `source`, `normalized` ou `expected` constitui vazamento e invalida o
resultado.

## Próximos gates

1. Produzir o universo canônico partindo exclusivamente dos 21 arquivos `raw`.
2. Implementar os oito detectores da Vertentes com procedência e sem consulta ao
   gabarito durante a execução.
3. Produzir o lote único de quatro perguntas somente após busca exaustiva nos
   documentos entregues.
4. Cadastrar programas sintéticos de factoring e financeira para o gold, com
   critérios, capacidade e apetite congelados, sem nomes reais nem dado inventado de
   mercado.
5. Reexecutar a avaliação até atingir a régua completa. Só então promover A1-03 e
   iniciar os demais casos parametrizados.
