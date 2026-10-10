# Método de investimento antes do financiamento (analyze-investment-project 2026.10.09-v2)

O procedimento `packages/credit-playbook/knowledge/procedures/capital/analyze-investment-project.md` sai do rascunho e passa a ter implementação, corridas registradas e revisão técnica independente. O executor é `@offroad/financial-model#prepareInvestmentDecisionPacket@2026.10.09-v1`.

## Executor

`prepareInvestmentDecisionPacket` recebe um caso base e variantes (sensibilidade, adiamento, etapas, alternativa), cada uma um `calculateAdoptedInvestmentAnalysis` completo sobre a mesma base adotada, entidade, perímetro e moeda. Devolve, por caso, VPL, TIR (quando identificável), payback simples interpolado na grade do VPL, diferença de VPL contra o base, inversão de sinal, TIR menos taxa, giro de partida, pico de caixa consumido pelo projeto e caixa mínimo da companhia com e sem o projeto (abertura e fins de período). Lista os casos que invertem a conclusão e os casos de calendário. Não recomenda financiamento, não adota, não publica, não concede execução.

## Sensibilidade por herança declarada

A base adotada aceita no máximo 256 contribuições; cinco cenários completos da calibração passariam disso. O adaptador de investimento aceita `inheritedScenario`: uma sensibilidade adota só os operandos que muda e lê os demais do cenário base, explicitamente. Sem a declaração a leitura é recusada; herdar de outra sensibilidade, a base herdar ou herdar de si mesma é recusado. Adiamento muda todas as séries datadas e é adotado por inteiro.

## Precisão

Aritmética decimal sem arredondamento por padrão. O quantum de calibração reproduz o oráculo que arredonda fluxos a R$ 0,01 milhão: a sensibilidade de economia dá −6,35 sem arredondar e −6,3 com o quantum. Os dois valores ficam registrados.

## Evidência

Corridas `investment-project-2026-10-09-v2-{gold,adversarial,consistency}` (11, 9 e 6 casos), reexecutadas por `investment-decision-runs.test.ts`. A primeira revisão independente reprovou: o caixa mínimo da companhia ignorava o saldo de abertura. Corrigido com duas regressões; a segunda revisão confere as correções e as condições de conteúdo.

## Limites

Sem custo de capital adotado, TIR e payback também ficam como lacuna nesta versão. O método ainda não está publicado nem tem perfil de execução; publicação, captura do artefato compilado e ativação são incrementos seguintes. A conversa da ficha pela interface continua pendente.
