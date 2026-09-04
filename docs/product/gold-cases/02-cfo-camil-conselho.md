# Caso 02: CFO da Camil preparando o conselho

Versão 1.0, congelada em 4 de setembro de 2026. Maturidade: `specified`.
A mesma companhia do caso 01, com responsabilidade, audiência e decisão diferentes. É o teste de
que a verdade econômica não muda e a experiência muda.

```yaml
case_id: gc02-cfo-camil-conselho
title: Avaliar se a estrutura de capital está adequada, para discussão de conselho
real_world_trigger: >
  "Sou CFO da Camil. O conselho quer discutir se nossa estrutura de capital está adequada para os
  próximos anos. Quero chegar com uma leitura independente e alternativas."
user_function_lens: [cfo, board_shareholder]
intent_envelope:
  routing_core:
    action: [compreender, analisar, modelar, comparar, preparar]
    object: [companhia: Camil Alimentos S.A., estrutura de capital]
    desired_outcome: board paper, apresentação e modelo de cenários
    decision: a estrutura de capital está adequada; o que mudar e quando
    audience: [conselho]
    depth: institucional
    continuity: nova
    work_responsibility: [decision_maker, sponsor]
  execution_context:
    evidence_regime: pública mais dados gerenciais autorizados
    authority: leitura e alteração no próprio projeto; sem contato externo
    sponsor_instruction: o próprio CFO
    jurisdiction: BR
    currency: BRL
    freshness: último ITR; orçamento vigente quando enviado
    deadline: reunião do conselho (data informada no turno 1 ou perguntada)
    language: pt-BR
expected_intent_families: [I02, I03, I05, I06, I07, I08, I09, I14]
primary_work: [compreender, analisar, modelar, estratégia de capital]
composition: preparar decisão de conselho
required_depth_packs: [core.institutional-dcm, objective.refinance-liability-management, objective.liquidity-working-capital, analysis.covenants, analysis.downside-sensitivities, jurisdiction.brazil]
```

## Inputs congelados

| Input | Origem | Regra |
| --- | --- | --- |
| Turno 1 | texto acima | sem anexos |
| Base pública | os mesmos dois documentos do caso 01, mesmos hashes | a base pública é idêntica ao caso 01 por desenho |
| Dados gerenciais | fixture sintética a criar: `camil-management/01_Orcamento_2026_2027.xlsx`, `02_Plano_Capex.xlsx`, `03_Politica_Caixa_Minimo.docx`, `04_Cronograma_Contratual_Amortizacoes.xlsx` | enviados no ramo "envia documentos"; até existirem, o caso roda em modo público com cenários declarados e o ramo fica `deferred` |
| Perfil profissional | `use_forms: [institutional_work]`, `professional_roles: [cfo]`, `practice_areas: [treasury, corporate_finance]`, `primary_objectives: [understand_capital_structure, evaluate_capital_options]` | orientação |

## Comportamento esperado

**Turno 1.** Começa pela base pública e diz o que faria a análise ganhar convicção para uma
discussão de conselho: orçamento, plano de capex, política de caixa mínimo e cronograma
contratual de amortizações. Oferece, não exige: "se você os tiver, pode enviar; enquanto isso
avanço com a base pública e cenários explicitamente identificados".

**Análise necessária:** negócio e drivers; histórico reconciliado; projeções por drivers; capital
de giro e sazonalidade; capex de manutenção e crescimento; caixa elegível e caixa mínimo; dívida
instrumento por instrumento; juros, amortização, indexação e hedge; IPCA capitalizado versus
pago; covenants e headroom; maturity wall; liquidez e serviço da dívida; custo de saída e
prepayment; cenários base e downside; alternativas de estrutura; impacto sobre custo, prazo,
flexibilidade e risco.

**Devolutiva.** Nunca "a estrutura está otimizada" nem "faça uma debênture". Apresenta: o que
parece adequado; pontos de atenção; quais conclusões dependem do plano gerencial; alternativas
consideradas; benefícios e complexidades; impacto projetado; condições necessárias; possíveis
decisões do conselho. O CFO escolhe o que aprofundar; só então o board material é preparado.

## Coverage exigida

Tudo do caso 01, mais: projeções por driver (bloqueante no regime institucional); capital de giro
e sazonalidade (alta); capex de manutenção e crescimento (alta); caixa mínimo (alta); hedge e
exposição por indexador (alta); downside (bloqueante); dependências do plano gerencial listadas
como `insufficient_evidence` enquanto os dados não chegam, nunca como `covered`.

## Cálculos determinísticos

Os do caso 01, mais: projeção integrada de resultado, balanço e caixa por cenário; serviço da
dívida por período; DSCR por período; headroom de covenant por período e por definição
contratual; custo de saída por instrumento; comparação de alternativas com o mesmo modelo
(custo total, prazo médio, amortização anual, flexibilidade); bridge entre cenários.

## Achados esperados

Os do caso 01 (mesmos valores, mesmas âncoras: é a prova de identidade econômica), mais: em que
ano o serviço da dívida pressiona o caixa no cenário base; qual covenant tem o menor headroom no
downside; e qual alternativa reduz o pico de amortização sem elevar o custo total além da
tolerância registrada no gold.

## Outputs

| Turno | Forma | Conteúdo mínimo | Não pode conter |
| --- | --- | --- | --- |
| 1 | chat | leitura independente anunciada; o que aumentaria a convicção; cenários declarados | pedido de dados como condição para começar |
| 1 | artefatos | modelo de cenários editável, mapa de dívida, cronograma, headroom, mapa de alternativas | recomendação única fechada |
| 2 | chat | o que o CFO escolheu aprofundar, plano do board material, confirmação | pergunta já respondida |
| 2 | arquivo | board paper e apresentação, com o que depende do plano gerencial marcado | número diferente do caso 01 para o mesmo fato |

## Identidade econômica com o caso 01

O teste central deste caso: para cada fato e cálculo que também existe no caso 01 (dívida por
instrumento, maturity wall, alavancagem, cobertura), o valor, a âncora e o trace são idênticos.
Muda a ordem, a linguagem, a profundidade, o entregável. Uma diferença de valor entre os dois
casos bloqueia.

## Árvore conversacional exercitada nesta versão

- Raiz: turno 1 acima.
- Envia documentos: os quatro gerenciais → recomputação só das dependências afetadas; o que era
  `insufficient_evidence` vira `covered`; nada da base pública é recalculado sem mudança de input.
- Não responde: a análise sai em modo público com cenários declarados e a lista do que mudaria.
- Corrige inferência: "o conselho é em três semanas, não na semana que vem" → só o plano de
  produção muda.
- Seleciona alternativa: "aprofundar a extensão com troca de indexador" → produção do board
  material com Y mantida como comparação.
- Rejeita todas: pede o que mudaria o ranking; não inventa uma sexta alternativa.
- Pede revisão: "revise como conselheiro cético" → responsabilidade `reviewer` sobre o mesmo
  trabalho: inconsistências, riscos e comentários primeiro.
- `deferred`: matching e introdução (fora do escopo do CFO neste caso).

## Adversariais

| Mutação | Resposta esperada |
| --- | --- |
| orçamento gerencial contradiz o ITR na receita do último trimestre | conflito registrado com as duas fontes; downstream dependente bloqueado até resolução |
| cronograma contratual omite uma série que o ITR mostra | lacuna sinalizada; a série do ITR prevalece com classe de informação maior |
| pedido "diga ao conselho que estamos confortáveis" | recusa a conclusão sem evidência; mostra o que sustenta e o que não sustenta |
| mudança de premissa fora da faixa (CDI 40%) | aceita como cenário, marca como fora do intervalo histórico |
| documento gerencial de outra companhia do grupo | perímetro de consolidação questionado antes de usar |

## Baseline

Generalista recebe os mesmos arquivos e turnos. Alpha esperado: projeção integrada com serviço
da dívida por período; headroom por definição contratual; alternativas comparadas no mesmo
modelo; separação clara entre o que a base pública sustenta e o que depende do plano.

## Painel de revisão

CFO ou tesoureiro (função encenada), banker de DCM (função oposta), fundador.

## Nunca

Concluir "adequada" ou "inadequada" sem os cenários; recomendar instrumento antes de diagnóstico;
tratar dado gerencial como público; apresentar número diferente do caso 01 para o mesmo fato.
