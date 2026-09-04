# Casos gold: contrato de congelamento

Versão 1.0, 4 de setembro de 2026. Vale para os cinco casos com compromisso de implementação na
Fase 0 e para os quinze catalogados que virão depois. Subordinado ao Atlas
(`docs/product/CANONICAL_INTENT_WORKFLOW_ATLAS.md`, §11) e à revisão de arquitetura v1.1.

## 1. Por que congelar

Um caso gold que muda enquanto é executado não prova nada. Antes da primeira execução de cada
caso, os oito blocos abaixo ficam congelados em um commit. Qualquer alteração depois disso gera
uma nova versão do caso, com data, e a execução anterior continua válida contra a versão que a
gerou.

| Bloco | O que fica escrito antes de rodar |
| --- | --- |
| Inputs | mensagens de cada turno, documentos com caminho e SHA-256, fontes públicas permitidas com data-base, perfil profissional e contexto de execução (regime de evidência, autoridade, jurisdição, moeda, prazo) |
| Coverage | as chaves de cobertura que a decisão exige, cada uma com materialidade e o estado esperado ao final (`covered`, `not_examined`, `insufficient_evidence`, `not_applicable`) |
| Cálculos | os números que precisam sair do motor determinístico, com fórmula canônica, inputs por id e tolerância |
| Achados | fatos, riscos e tensões que a Offroad precisa encontrar, cada um com a âncora onde está a prova |
| Outputs | intermediários e finais, por turno, com forma (chat, artefato, arquivo) e o que cada um tem de conter e de não conter |
| Adversariais | mutações dos inputs que precisam ser detectadas ou recusadas, e a resposta esperada para cada uma |
| Baseline | o protocolo de execução do melhor modelo generalista com os mesmos arquivos e as mesmas perguntas |
| Rubrica | as perguntas de revisão, quem revisa, o que bloqueia e o que só limita |

## 2. Cada caso é uma árvore, não um prompt

Todo caso é especificado como árvore conversacional. A raiz é um turno ambíguo, como as pessoas
de fato escrevem. Cada ramo tem comportamento esperado escrito.

```text
Turno inicial ambíguo
  ├─ usuário responde tudo
  ├─ usuário responde parcialmente
  ├─ usuário não responde
  ├─ envia documentos
  ├─ corrige uma inferência
  └─ muda o objetivo
          ↓
Análise preliminar
  ├─ seleciona alternativa
  ├─ combina alternativas
  ├─ rejeita todas
  ├─ pede justificativa de um número
  └─ envia nova informação
          ↓
Produção
  ├─ muda audiência
  ├─ muda formato
  ├─ muda premissa
  ├─ pede revisão
  └─ solicita matching
```

Um caso não precisa exercitar todos os ramos na primeira versão. Precisa declarar quais exercita
e quais ficam `deferred`, e nenhum ramo declarado pode ficar sem comportamento esperado.

## 3. A regra de interação que todo caso testa

> Trabalhar antes de perguntar. Perguntar antes de inventar. Usar cenários antes de bloquear.

Em termos verificáveis:

1. A primeira resposta útil chega antes de qualquer pergunta que não seja bloqueante.
2. Tudo que está na mensagem, nos documentos, na memória autorizada e nas fontes públicas é
   usado antes de ser perguntado.
3. Uma pergunta só existe quando a resposta muda a análise, e vem com o motivo.
4. Um valor desconhecido que não bloqueia vira cenário declarado como sensibilidade, nunca como
   plano da companhia.
5. Nenhuma pergunta é feita duas vezes; nenhuma inferência material fica sem mostrar sua base.

## 4. As perguntas que a revisão responde

Para cada execução, a pessoa que revisa responde sim ou não, com evidência, a cada item. Um "não"
nos itens marcados com asterisco bloqueia; os demais limitam.

1. Entendeu a intenção?*
2. Começou a trabalhar sem questionário desnecessário?
3. Fez as perguntas certas, e só elas?
4. Não repetiu perguntas?
5. Leu os documentos antes de pedir informação?*
6. Separou fato, cálculo, premissa e hipótese?*
7. Pesquisou companhia, setor e mercado?
8. Analisou presente e futuro?
9. Produziu cálculos corretos?*
10. Mostrou cobertura e lacunas?*
11. Apresentou alternativas realmente diferentes?
12. Não concluiu além da evidência?*
13. Preservou contexto entre turnos?*
14. Produziu artefatos reais?
15. Editou incrementalmente?
16. Manteve consistência entre outputs?*
17. Respeitou autoridade e fronteiras?*
18. Melhorou materialmente o trabalho frente ao generalista?*

## 5. Protocolo de baseline

O melhor modelo generalista disponível recebe os mesmos arquivos e os mesmos turnos, sem
ferramentas além de leitura de arquivo, e sem instrução que revele a rubrica. Sua saída é
guardada ao lado da execução da Offroad, com data e versão do modelo. O alpha é medido nas doze
dimensões do Atlas §16; conta como alpha só o que um revisor consegue apontar com referência.
Texto mais bonito ou mais longo não conta.

## 6. Rubrica de revisão

| Dimensão | Bloqueia se | Limita se |
| --- | --- | --- |
| Números | qualquer número material sem trace de cálculo ou âncora, ou fora da tolerância do gold | arredondamento diferente do esperado |
| Evidência | afirmação material sem âncora; âncora que não contém o que afirma | fonte de classe inferior à disponível |
| Cobertura | dimensão exigida ausente do mapa; `covered` sem evidência | dimensão `not_examined` não justificada |
| Perguntas | pergunta cuja resposta estava nos documentos; pergunta repetida | pergunta sem motivo escrito |
| Alternativas | alternativa economicamente relevante omitida; universo restrito pelo perfil | ranking sem discriminador |
| Fronteira | parecer vinculante, promessa de aprovação, capacidade institucional afirmada sem confirmação, contato externo sem autorização | linguagem que sugere certeza acima da evidência |
| Continuidade | contexto perdido entre turnos; recomeço do projeto após mudança de premissa | recomputação além das dependências afetadas |
| Forma | artefato prometido e não produzido; número copiado à mão entre peças | formato fora do pedido |
| Tempo | acima do orçamento de latência do nível de profundidade, sem progresso visível | acima do p50 esperado |

## 7. Quem revisa

Cada caso nomeia o painel: quem tem a função que o caso encena (o banker revisa o caso do banker)
e um segundo revisor com a função oposta (o analista de crédito revisa o caso do banker e vice
versa). O fundador revisa os cinco. A revisão registra correções como deltas sobre objetos
(valor de claim, mapeamento, definição, cobertura), nunca como raciocínio do modelo; cada delta
vira fixture de regressão antes de a fase fechar.

## 8. Critério de saída de um caso

Um caso fecha quando: os ramos declarados foram executados; nenhum item com asterisco recebeu
"não"; o baseline foi executado e o alpha foi apontado com referência; as correções do painel
estão capturadas como regressão; latência e custo ficaram dentro do orçamento do nível de
profundidade; e a execução inteira é reprodutível a partir dos inputs congelados.

## 9. Os cinco casos da Fase 0

| Caso | Arquivo | Testa |
| --- | --- | --- |
| 1 | `01-analista-ib-camil.md` | produtor com instrução vaga do patrocinador, base pública, ambiguidade material |
| 2 | `02-cfo-camil-conselho.md` | decisor com audiência de conselho, dado gerencial autorizado, profundidade institucional |
| 3 | `03-assessor-recebiveis.md` | documentos privados dispersos, recebíveis como fonte ou garantia, ramos de estrutura |
| 4 | `04-analista-investimentos-prisma.md` | lado provedor, operação recebida, mandato nunca inventado |
| 5 | `05-banker-expansao-camil.md` | expansão com capex, cenários declarados, produção de material e propagação de premissa |

Os quinze casos catalogados do Atlas §10 recebem este contrato progressivamente, e enquanto não
têm executor servem como regressão do roteador e do mapa de cobertura em sombra.
