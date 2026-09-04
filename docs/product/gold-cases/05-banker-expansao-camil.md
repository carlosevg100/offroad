# Caso 05: banker pensando na expansão da Camil, do primeiro turno ao material e à mudança de premissa

Versão 1.0, congelada em 4 de setembro de 2026. Maturidade: `specified`.
É o caso de três turnos: análise prospectiva com cenários declarados, transição para produção de
material e propagação de uma mudança de premissa sem recomeçar o projeto.

```yaml
case_id: gc05-banker-expansao-camil
title: Financiar a expansão da Camil dentro da capacidade projetada, e preparar a reunião
real_world_trigger: >
  "Sou banker de corporate banking. A Camil anunciou uma expansão e quero levar ideias de como
  financiar isso dentro da capacidade deles. Tenho reunião com o CFO e a tesouraria."
user_function_lens: [banker, corporate_banker, dcm_vp]
intent_envelope:
  routing_core:
    action: [compreender, analisar, modelar, comparar, preparar]
    object: [companhia: Camil Alimentos S.A., expansão anunciada, capacidade de endividamento]
    desired_outcome: alternativas de financiamento fundamentadas e material para a reunião
    decision: quais alternativas levar e como apresentá-las
    audience: [banker (imediata), cfo e tesouraria (final)]
    depth: preliminar no turno 1, institucional a partir do turno 2
    continuity: nova, depois atualização
    work_responsibility: [producer, decision_maker]
  execution_context:
    evidence_regime: pública
    authority: leitura; sem representação; sem contato externo
    sponsor_instruction: o próprio banker
    jurisdiction: BR
    currency: BRL
    freshness: último ITR e AGOE; anúncio da expansão
    language: pt-BR
expected_intent_families: [I01, I03, I05, I06, I07, I08, I11, I12, I13]
primary_work: [compreender, analisar, modelar, estratégia de capital]
composition: preparar reunião, depois preparar material, depois atualizar
required_depth_packs: [core.institutional-dcm, objective.capex-expansion, objective.refinance-liability-management, instrument.br-bank-loan, instrument.br-capital-markets, analysis.downside-sensitivities, jurisdiction.brazil]
```

## Inputs congelados

| Input | Origem | Regra |
| --- | --- | --- |
| Turno 1 | texto acima | sem anexos |
| Base pública | os dois documentos da Camil do caso 01, mesmos hashes | identidade econômica com os casos 01 e 02 |
| Anúncio da expansão | o que a proposta da AGOE e o ITR trazem; se o tamanho e o cronograma não forem públicos, cenários | o gold registra o que é público e o que não é |
| Turno 2 | "Gostei das ideias, principalmente X. Vamos preparar o material para a reunião." | X é a alternativa que o gold marca como mais aderente; Y a segunda |
| Turno 3 | "Ajusta o cenário para taxa X e prazo Y." | valores dentro do intervalo histórico registrado no gold |
| Perfil profissional | `use_forms: [institutional_work]`, `professional_roles: [banker]`, `practice_areas: [corporate_banking, dcm]`, `primary_objectives: [originate_ideas, prepare_meetings]` | orientação; capacidade do banco nunca presumida |

## Comportamento esperado

**Turno 1.** Inicia a pesquisa pública e responde: a expansão será analisada dentro da capacidade
financeira projetada, não como captação isolada; primeiro o investimento anunciado, seu
cronograma, a geração de caixa durante a implantação, a estrutura atual da dívida e as condições
de saída das obrigações existentes; em paralelo, comparação de alternativas e seus impactos. Se
tamanho e cronograma não forem públicos, começa com cenários (R$ 100, 200 e 300 milhões,
declarados como sensibilidades, nunca como plano da companhia) e diz quais inputs tornariam a
recomendação mais firme.

**Devolutiva preliminar:** contexto estratégico da expansão; informações públicas encontradas;
lacunas; cenário operacional preliminar; funding need por período; impacto no caixa e nos
indicadores; capacidade de dívida; alternativas de estrutura; prepayment e custo de saída;
instrumentos e mercado; riscos de construção e ramp-up; vantagens e complexidades; informações
que mudariam o ranking. O banker escolhe uma ou mais alternativas.

**Turno 2.** O sistema recupera a análise; registra que X foi selecionada; verifica ramos
complementares; pergunta audiência, formato e profundidade só se ainda indefinidos; propõe um
plano de produção específico; confirma antes de consumir recursos significativos; produz
arquivos reais; faz QA; abre os artefatos no mesmo workspace. Não pergunta "qual material você
deseja" quando o contexto já diz. Resposta esperada, aproximadamente: X como tese principal, Y
mantida como comparação; para CFO e tesouraria, apresentação de cinco páginas, modelo com
situação atual, cenário-base e dois cenários de estrutura, apêndice com dívida, vencimentos,
premissas e comparáveis; números e premissas preservados; uma única confirmação: material
apresentado diretamente à companhia ou usado primeiro em revisão interna.

**Turno 3.** Nova versão da premissa; recálculo só das dependências afetadas; indicadores
atualizados; bridge entre cenários; materiais dependentes atualizados; versão anterior mantida;
explicação do que mudou; checks executados de novo; o projeto não é reconstruído.

## Coverage exigida

Tudo do caso 01, mais: investimento anunciado e cronograma (bloqueante, ou cenário declarado);
funding need por período (bloqueante); geração de caixa durante a implantação (alta);
capacidade de dívida por cenário (bloqueante); custo de saída das obrigações existentes (alta);
riscos de construção e ramp-up (alta); instrumentos candidatos e mercado (alta); o que mudaria o
ranking (alta).

## Cálculos determinísticos

Os do caso 01, mais: funding need por período por cenário de capex; capacidade de dívida por
alavancagem máxima e por DSCR mínimo; projeção integrada por cenário; comparação de alternativas
no mesmo modelo (custo total, prazo, amortização, garantias, flexibilidade); custo de saída por
instrumento; bridge entre a versão anterior e a nova após o turno 3, com a lista exata dos nós
recomputados.

## Achados esperados

Os do caso 01 com os mesmos valores e âncoras, mais: o período em que o funding need atinge o
pico; a alternativa que evita pedir caixa no pior mês da sazonalidade; e a obrigação existente
cujo custo de saída muda o ranking.

## Outputs

| Turno | Forma | Conteúdo mínimo | Não pode conter |
| --- | --- | --- | --- |
| 1 | chat | enquadramento dentro da capacidade; cenários declarados; inputs que firmariam a recomendação | pergunta sobre o que é público |
| 1 | artefatos | funding need, capacidade, alternativas com trade-offs, custo de saída, riscos | recomendação única fechada; capacidade do banco |
| 2 | chat | X principal, Y comparação, plano do material, uma confirmação | "qual material você deseja?" |
| 2 | arquivos | apresentação de cinco páginas, modelo editável com três cenários, apêndice | número copiado à mão; número diferente do turno 1 para o mesmo fato |
| 3 | chat e artefatos | nova versão da premissa, bridge, lista do que foi recalculado, checks | reconstrução do projeto; perda da versão anterior |

## Árvore conversacional exercitada nesta versão

- Raiz: turno 1 acima.
- Não responde: a análise sai com os três cenários e a lista do que firmaria a recomendação.
- Responde parcialmente: informa o tamanho, não o cronograma → cenários só no cronograma.
- Corrige inferência: "a reunião é só com a tesouraria" → audiência muda; nada é recalculado.
- Seleciona alternativa (turno 2): produção conforme acima.
- Combina alternativas: "X mais uma tranche Y" → estrutura combinada modelada como terceiro cenário.
- Pede justificativa: "de onde saiu a capacidade de dívida?" → definição, teto, DSCR e trace.
- Muda premissa (turno 3): propagação conforme acima.
- Muda formato: "em vez de apresentação, um memo" → recompilação a partir do mesmo snapshot.
- Pede revisão: "revise como VP" → inconsistências e riscos primeiro.
- `deferred`: matching e introdução.

## Adversariais

| Mutação | Resposta esperada |
| --- | --- |
| tamanho da expansão inserido pelo usuário como se fosse público | registrado como premissa do usuário, com classe de informação; nunca como fato da companhia |
| premissa do turno 3 fora do intervalo histórico (CDI 40%) | aceita como cenário e marcada fora do intervalo |
| pedido "diga que o banco financia tudo com balanço" | recusa: capacidade institucional não é afirmada |
| mudança de premissa que não afeta nenhum nó (formatação) | nada recomputado; dito explicitamente |
| turno 2 pedindo material antes de qualquer alternativa escolhida | pergunta única: qual alternativa; não produz no vazio |
| dois turnos 3 seguidos com a mesma premissa | segundo é idempotente; nenhuma versão duplicada |

## Baseline

Generalista recebe os dois documentos e os três turnos. Alpha esperado: funding need por período;
capacidade de dívida por dois critérios; alternativas comparadas no mesmo modelo; custo de saída;
e, no turno 3, um bridge real entre cenários com a lista do que mudou, em vez de uma nova análise
inteira.

## Painel de revisão

Banker de corporate banking (função encenada), CFO ou tesoureiro (função oposta), fundador.

## Nunca

Tratar cenário como plano da companhia; afirmar capacidade do banco; perguntar o que é público;
reconstruir o projeto ao mudar uma premissa; perder a versão anterior; copiar número entre peças.
