---
id: update-after-quarter-close
version: 2026.10.26-v1
maturity: implemented
title_pt: Atualizar depois do fechamento do trimestre
title_en: Update After the Quarter Close
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-26
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareQuarterUpdatePacket
result_contract: quarter-update-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: quarter-update-packet.v1
unit_test_files: [packages/financial-model/src/quarter-update-packet.test.ts, packages/financial-model/src/quarter-update-premises.test.ts, packages/financial-model/src/quarter-update-runs.test.ts, packages/financial-core/src/quarter-update.test.ts]
gold_case_ids: [bridges-sum-exactly-to-the-deviations, each-cause-in-the-oracle-bridge, stock-is-calendar-terms-and-wheat-structural-until-december, worst-december-week-near-4-2, december-need-above-the-overdraft-limit, action-within-what-is-approved, december-covenant-near-2-32-and-policy-headroom-near-3-7, projection-2026-ebitda-propagated, decisions-that-change-are-named, what-did-not-change-in-one-line, question-negotiated-terms-or-late-payment, stale-material-offered-never-sent, prior-version-kept-as-released, deviation-without-cause-is-a-named-residual, booked-without-propagation-is-a-gap, absent-actual-is-a-gap-not-a-default]
adversarial_case_ids: [tampered-envelope, free-result-in-request, fabricated-grant-in-result, fabricated-sending-in-result, update-of-another-version, prior-of-another-company, linked-cause-off-its-deviation, calendar-cause-moves-the-projection, structural-cause-without-an-end, recomputing-what-did-not-move, series-updated-without-change, quarter-outside-the-test-period, figure-read-in-another-scenario]
e2e_scenario_ids: [domain:bridges-sum-exactly-to-the-deviations]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: [project-weekly-cash, measure-covenant-headroom]
reference_data_keys: []
calculation_ids: [financial.quarter_update]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [update-after-quarter-close-2026-10-26-v1-consistency]
adversarial_run_ids: [update-after-quarter-close-2026-10-26-v1-adversarial]
gold_run_ids: [update-after-quarter-close-2026-10-26-v1-gold]
---

# Objetivo
Dizer ao CFO, depois do fechamento de um trimestre, o que mudou contra o projetado, por quê, e se alguma decisão ou compromisso ficou em risco: cada desvio explicado por causa até o valor exato, o que é pontual separado do que persiste, e a propagação só das causas que persistem para o caixa semanal, o covenant e a projeção, com a versão anterior preservada.

# Produto
Pacote de atualização do trimestre: realizado contra projetado linha a linha; ponte do EBITDA e do caixa por causa, que soma o desvio exato, com o resíduo não explicado nomeado; cada causa classificada como de calendário (pontual no trimestre) ou estrutural até uma data; o caixa do fechamento levado ao saldo inicial do caixa semanal e as séries movidas pelas causas estruturais; a semana mais apertada antes e depois, a necessidade até o mínimo contra o limite da linha que completa as semanas e o efeito do limite inteiro; a ação dentro do que já está aprovado, em passos (saque fixo que substitui o planejado e saque residual dimensionado pelo que ainda falta); o teste de covenant medido de novo na mesma data, com a folga por limite antes e depois; o EBITDA dos doze meses até o teste antes e depois; quais análises, planos e materiais foram atualizados, quais não mudaram e qual material ficou desatualizado; as decisões que mudam e a pergunta que muda o diagnóstico.

# Quando ativar
- Fechou o trimestre ou o mês e o pedido é atualizar projeção, caixa, covenant ou plano.
- O que mudou com o resultado do trimestre e se alguma decisão do conselho ficou em risco.
- Saiu o balancete e é preciso saber o que muda no caixa até o fim do ano e no covenant.

# Quando não ativar
- Montar a projeção do zero é a demanda de projeção; esta parte da versão anterior adotada.
- Comparar o custo das formas de cobrir o caixa é a demanda de caixa semanal, que esta usa.
- Negociar waiver ou redesenhar covenant é outra demanda.

# Inputs mínimos e substitutos
- Balancete e gerencial do trimestre com as linhas projetadas e realizadas (receita, EBITDA, caixa no fim do trimestre, prazo médio de recebimento, custo dos principais insumos).
- A explicação de cada desvio pela controladoria, com a classificação de cada causa e, para as estruturais, até quando persistem; sem ela, a causa fica como interpretação a confirmar.
- A versão anterior adotada do caixa semanal e do teste de covenant, identificadas pela base em que foram adotadas.
- As séries do caixa semanal que as causas estruturais movem, refeitas com o dado do fechamento.
- O efeito de cada causa estrutural no EBITDA e no caixa até a data do teste.
- Linhas aprovadas ou contratadas com o limite e a fonte da aprovação (ata, contrato).
- O mapa do que depende do fechamento: análises, planos e materiais, o que cada um lê e o horizonte.

# Sequência operacional
1. [human_judgment] Enquadrar :: Qual trimestre, quais versões anteriores e quais decisões do conselho estão em curso | evidence: base autorizada, fontes e versões
2. [deterministic] Realizado contra projetado :: Desvio de cada linha do fechamento | evidence: balancete e gerencial adotados
3. [deterministic] Ponte por causa :: Causas que somam o desvio exato do EBITDA e do caixa; resíduo nomeado; causa ligada a outro desvio conferida | evidence: explicação da controladoria adotada
4. [human_judgment] Classificar :: Calendário ou estrutural até uma data, com a base da classificação | evidence: documento ou interpretação declarada
5. [deterministic] Propagar ao caixa semanal :: Caixa do fechamento no saldo inicial; séries movidas só pelas causas estruturais; versão anterior medida de novo e mantida | evidence: versão anterior e séries adotadas
6. [deterministic] Dimensionar a ação :: Necessidade contra o limite; passos dentro do aprovado; caso de cada passo | evidence: linhas aprovadas adotadas
7. [deterministic] Propagar ao covenant e à projeção :: EBITDA e caixa do fechamento e efeitos estruturais até a data do teste; folga por limite antes e depois | evidence: versão anterior do teste adotada
8. [deterministic] Dependências :: Atualizado, sem mudança ou desatualizado por aquilo que cada item lê no seu horizonte | evidence: mapa de dependências adotado
9. [human_judgment] Devolver :: O que mudou, por quê, o que fica, o que muda nas decisões, a ação, o que não mudou e a pergunta | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Desvio = realizado menos projetado, por linha.
- Ponte: soma das causas de cada linha; resíduo = desvio menos a soma. Resíduo diferente de zero vira lacuna nomeada na linha e nunca é distribuído entre as causas.
- Causa que é o desvio de outra linha (EBITDA abaixo dentro da ponte do caixa) tem de ser igual a esse desvio, exatamente.
- Causa de calendário não tem data de fim e não move a projeção; causa estrutural tem data de fim depois do fechamento e precisa mover alguma coisa à frente (série do caixa semanal ou efeito no teste); se não move, vira lacuna.
- Caixa semanal atualizado = versão anterior com o saldo inicial acrescido do desvio de caixa do fechamento e as séries substituídas pelas causas estruturais; a versão anterior é medida de novo pelo mesmo núcleo e fica ao lado. Série substituída sem mudança é recusada.
- Necessidade = mínimo menos o menor saldo semanal, nunca negativa; comparada ao limite da linha que completa as semanas; o limite inteiro é medido como caso próprio.
- Ação: passos em ordem; o passo fixo saca uma série nova que substitui a planejada; o passo residual saca, na data adotada, a necessidade que ainda resta. Cada passo é comparado ao limite aprovado.
- Covenant atualizado = mesma medição da versão anterior com EBITDA reportado acrescido do desvio de EBITDA do trimestre e dos efeitos estruturais até a data, e caixa acrescido do desvio de caixa e dos efeitos estruturais; o trimestre precisa estar dentro dos doze meses do teste. A medição de núcleo é a do método de folga de covenant.
- Dependência atualizada quando lê uma linha com desvio dentro do seu horizonte, ou uma linha movida por causa estrutural no período até a data de fim; sem isso, sem mudança. Recalcular o que não foi movido é recusado. Material para terceiros cujo horizonte termina antes do fechamento e que lê linha com desvio fica desatualizado.
- Precisão: aritmética decimal de alta precisão, sem arredondamento intermediário.

# Julgamentos permitidos
- Classificar cada causa e dizer até quando a estrutural persiste, declarando se é documento ou interpretação.
- Propor a ação dentro do que o conselho já aprovou e dizer qual decisão muda.
- Oferecer a versão atualizada de um material desatualizado, sem enviá-la.

# Perguntas que mudam o trabalho
- O prazo maior das redes é prazo negociado ou atraso? Se for atraso, a causa é de crédito e o tratamento muda.
- O repasse do custo do insumo tem data negociada?
- A antecipação de estoque volta em que mês?

# Red flags
- Atualizar o realizado sem propagar ao projetado.
- Refazer tudo do zero e perder a comparação entre versões.
- Desvio sem causa, ou resíduo distribuído entre as causas.
- Não dizer qual decisão muda.
- Enviar material atualizado a terceiros sem autorização.

# Stop conditions
- Número sem contribuição adotada vira lacuna; a atualização não é montada com valor presumido.
- Atualização que nomeia outra versão anterior que não a recebida é recusada.
- O pacote não fecha a contabilidade, não atribui causas por conta própria, não compara custo de financiamento, não envia material a terceiros, não aprova crédito e não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: quarter-update-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Linhas, pontes, propagação, caixa semanal e covenant antes e depois, ação, dependências e lacunas
- readings (object, required): O que mudou, por quê, o que fica, o que muda nas decisões, a ação, o que não mudou e a pergunta
- exclusions (array, required): Fechamento contábil, atribuição de causa, comparação de custo, distribuição a terceiros, aprovação de crédito
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- O trimestre fechou com EBITDA R$ 0,4 milhão abaixo do projetado e caixa R$ 1,7 milhão abaixo. No EBITDA, o volume somou R$ 0,5 milhão, o trigo sem repasse tirou R$ 0,6 milhão e frete e energia, R$ 0,3 milhão. No caixa, as redes pagando em 54 dias tiraram R$ 2,1 milhões e a antecipação de estoque, R$ 1,6 milhão; impostos e outros compensaram R$ 2,4 milhões. A antecipação de estoque é de calendário; o prazo e o trigo foram tratados como estruturais até dezembro. A semana de 21 de dezembro cai de R$ 7,5 milhões para cerca de R$ 4,2 milhões; para manter R$ 15 milhões faltam cerca de R$ 10,8 milhões, acima dos R$ 10 milhões da conta garantida. Dentro do aprovado, usar cerca de R$ 23 milhões dos programas das redes no lugar da linha de R$ 17 milhões e sacar cerca de R$ 4,8 milhões da conta garantida. O covenant de dezembro vai de 2,20x para cerca de 2,32x na definição da escritura e a folga até a política cai de R$ 6,2 milhões para cerca de R$ 3,7 milhões de EBITDA. Não mudaram a tabela de dívida, o plano de 2027 e a análise da linha de embalagem; o material da sondagem fica desatualizado e a versão com setembro é oferecida, sem envio. Os 54 dias são prazo negociado ou atraso?
## Ruim
- "O trimestre fechou próximo do projetado. As análises foram atualizadas." (esconde que dezembro passou a precisar de mais que a conta garantida)
- "Refiz todas as análises com os números de setembro." (refaz o que não depende do dado e perde a comparação entre versões)

# Testes
## Unit
- packages/financial-core/src/quarter-update.test.ts: núcleo contra o oráculo da ficha, com os núcleos de caixa semanal e de covenant compostos.
- packages/financial-model/src/quarter-update-packet.test.ts e packages/financial-model/src/quarter-update-premises.test.ts: leitor adotado sobre três bases, pacote e ida e volta das premissas.
## Gold
- bridges-sum-exactly-to-the-deviations, each-cause-in-the-oracle-bridge, stock-is-calendar-terms-and-wheat-structural-until-december, worst-december-week-near-4-2, december-need-above-the-overdraft-limit, action-within-what-is-approved, december-covenant-near-2-32-and-policy-headroom-near-3-7, projection-2026-ebitda-propagated, decisions-that-change-are-named, what-did-not-change-in-one-line, question-negotiated-terms-or-late-payment, stale-material-offered-never-sent, prior-version-kept-as-released, deviation-without-cause-is-a-named-residual, booked-without-propagation-is-a-gap, absent-actual-is-a-gap-not-a-default.
## Adversarial
- Base adulterada, resultado livre no pedido, concessão fabricada, envio fabricado, atualização de outra versão, versão anterior de outra companhia, causa ligada diferente do desvio, causa de calendário movendo a projeção, causa estrutural sem data de fim, recálculo do que não mudou, série atualizada sem mudança, trimestre fora do período do teste e número lido em outro cenário são recusados.
## Aceitação
- Reproduzir o caso de calibração pelo oráculo independente sem alterar seus scripts.
- Executar a conversa da ficha C54 turno a turno pela interface real; guardar plano, versões, cálculo, resposta, custo e latência.

# Evidência
## Hierarquia
- Balancete e gerencial do trimestre; explicação da controladoria; atas do conselho e contratos das linhas; versões anteriores adotadas do caixa semanal e do covenant.
- Ficha C54 e seu oráculo, sobre os oráculos da C18 e da C12, como calibração independente, nunca como dado de outra companhia.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número do pacote abre até o operando adotado, sua origem e sua versão; a versão anterior abre até a sua própria base.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O CFO quer saber se o trimestre muda alguma decisão. Um desvio pequeno no resultado pode apertar uma semana à frente quando a causa persiste; um desvio grande pode não mudar nada quando é de calendário.

## N2. Árvore de decisão
- Desvios explicados e só de calendário: dizer que nada à frente muda e listar o que não mudou.
- Causa estrutural: propagar ao que depende dela e dizer qual decisão muda.
- Necessidade acima do limite aprovado: propor a ação dentro do aprovado antes de qualquer pedido novo.
- Resíduo sem causa: nomear e pedir a explicação antes de propagar.

## N3. Suficiência por conclusão
- Para a ponte: realizado, projetado e a explicação de cada causa.
- Para a propagação: as versões anteriores e o efeito de cada causa estrutural.
- Para a ação: os limites aprovados e a fonte. O que faltar vira lacuna declarada.

## N4. Voz e três níveis de afirmação
Fato (o fechamento e as pontes), leitura (o que persiste e o que isso faz em dezembro) e recomendação (a ação dentro do aprovado) separados. Sem veredito binário e sem certeza sobre o banco.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. O que mudou, em duas linhas: EBITDA e caixa contra o projetado.
2. Por quê: a ponte por causa.
3. O que é pontual e o que fica, até quando.
4. O que isso muda: dezembro, covenant, projeção e material.
5. A ação dentro do aprovado.
6. O que não mudou, em uma linha.
7. A pergunta que muda o diagnóstico.

## T2. Peças
Ponte do EBITDA e do caixa em cascata, um elemento em foco, fundo branco, sem vermelho; quadro antes e depois do que depende do fechamento.

# Regra
## R1. Precedência
O realizado prevalece sobre o projetado; a versão anterior é mantida e a atualizada fica ao lado.

## R2. Propagação seletiva
Só se recalcula o que lê o dado que mudou; o resto é dito como não mudado.

## R3. Terceiros
Material para terceiros é marcado desatualizado e a versão nova é oferecida; o envio depende de autorização.

# Qualidade
## Q1. Teste do MD
A ponte fecha no centavo? Cada causa tem classificação e data? Dezembro foi medido de novo? A decisão que muda foi dita? O que não mudou cabe em uma linha? A pergunta é a que muda o diagnóstico? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Pontual e estrutural
Antecipação de estoque e impostos fora de época voltam sozinhos; prazo de recebimento e custo sem repasse continuam até alguém negociar. A classificação decide o que se propaga.

## Versões
Atualizar por cima apaga a comparação que o conselho precisa ver. A versão anterior fica como estava e a atualizada mostra o que mudou e por quê.

## Dentro do aprovado
Quando a necessidade passa do limite de uma linha, a primeira resposta usa o que o conselho já aprovou antes de pedir uma linha nova.

# Composição tipada
```offroad-procedure
{
  "schemaVersion": "procedure-composition.v1",
  "authoringStatus": "ready_for_review",
  "pendingContent": [],
  "budget": {
    "maxModelCalls": 0,
    "maxDurationMs": 31000,
    "maxCostMinorUnits": 0,
    "currency": "BRL"
  },
  "allowedTools": [],
  "maximumEffect": "none",
  "components": [
    {
      "id": "quarter-update.request-framing",
      "version": "2026.10.26-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional da atualização do trimestre",
      "inputs": {
        "id": "quarter-update.framing-input",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "outputs": {
        "id": "quarter-update.framing-output",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "scope": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            }
          }
        }
      },
      "dependencies": [],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 1000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [],
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO CFO quer saber se o trimestre muda alguma decisão. Um desvio pequeno no resultado pode apertar uma semana à frente quando a causa persiste; um desvio grande pode não mudar nada quando é de calendário.\n\nN2. Árvore de decisão\n- Desvios explicados e só de calendário: dizer que nada à frente muda e listar o que não mudou.\n- Causa estrutural: propagar ao que depende dela e dizer qual decisão muda.\n- Necessidade acima do limite aprovado: propor a ação dentro do aprovado antes de qualquer pedido novo.\n- Resíduo sem causa: nomear e pedir a explicação antes de propagar.\n\nN3. Suficiência por conclusão\n- Para a ponte: realizado, projetado e a explicação de cada causa.\n- Para a propagação: as versões anteriores e o efeito de cada causa estrutural.\n- Para a ação: os limites aprovados e a fonte. O que faltar vira lacuna declarada.\n\nN4. Voz e três níveis de afirmação\nFato (o fechamento e as pontes), leitura (o que persiste e o que isso faz em dezembro) e recomendação (a ação dentro do aprovado) separados. Sem veredito binário e sem certeza sobre o banco."
    },
    {
      "id": "quarter-update.packet",
      "version": "2026.10.26-v1",
      "kind": "rule",
      "title": "Explicar o trimestre por causa e propagar só o que persiste",
      "authority": "house",
      "statement": "Comparar o realizado com o projetado, explicar o desvio do EBITDA e do caixa por causas que somam o valor exato com o resíduo nomeado, separar o pontual do estrutural, levar o fechamento e as causas estruturais ao caixa semanal e ao teste de covenant pelos núcleos já liberados, mantendo a versão anterior ao lado, dimensionar a ação dentro do aprovado e dizer o que mudou, o que não mudou e o que ficou desatualizado, sem fechar a contabilidade, sem atribuir causa por conta própria, sem comparar custo de financiamento, sem enviar material a terceiros, sem aprovar crédito e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareQuarterUpdatePacket",
        "version": "2026.10.26-v1"
      },
      "inputs": {
        "id": "quarter-update-packet-input",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "quarter-update-packet-input.v1"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "analysis": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "prior": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "weeklyCash": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "envelope": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "canonical": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fingerprint": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              },
                              "scope": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "workId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "purpose": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "versionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              },
                              "entityId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "perimeter": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "currency": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "openingDate": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              },
                              "endDate": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              },
                              "numericInterpretations": {
                                "required": false,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "mode": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "members": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "analysisId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "scenario": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "openingCash": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "minimumCash": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "projectionClosing": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "decisionId": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "definitionVersionId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "definitionKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "reported",
                                              "managerial",
                                              "contractual"
                                            ]
                                          }
                                        },
                                        "missingReason": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "calendarEnd": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "missingReason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              },
                              "covenantTestDate": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "decisionId": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "definitionVersionId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "definitionKind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "reported",
                                              "managerial",
                                              "contractual"
                                            ]
                                          }
                                        },
                                        "missingReason": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "streams": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "category": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "direction": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "obligation": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "decisionId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "definitionVersionId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "definitionKind": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "reported",
                                                      "managerial",
                                                      "contractual"
                                                    ]
                                                  }
                                                },
                                                "missingReason": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "dates": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "amounts": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "cases": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "role": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "informed",
                                            "alternative"
                                          ]
                                        }
                                      },
                                      "streamIds": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "actions": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "streamId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "replacesStreamId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "amount": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "days": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "rate": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "ratePeriod": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "iofDaily": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "iofDailyCapDays": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "iofAdditional": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "upfrontFee": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "repaymentDate": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "coverage": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "payroll": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "thirteenth_salary": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "payroll_charges": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "sales_taxes": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "income_taxes": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "debt_service": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "covenant": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "envelope": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "canonical": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fingerprint": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              },
                              "scope": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "workId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "purpose": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "versionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              },
                              "entityId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "perimeter": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "currency": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "openingDate": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              },
                              "endDate": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              },
                              "numericInterpretations": {
                                "required": false,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "mode": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "members": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "analysisId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "scenario": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "readingDate": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              },
                              "limits": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "kind": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "status": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "testDates": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "maximumRatio": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "source": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "definition": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "measurements": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "role": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "test",
                                            "contrast"
                                          ]
                                        }
                                      },
                                      "limitIds": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "date": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "scenario": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "debt": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "cash": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "reportedEbitda": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "adjustments": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "object",
                                            "fields": {
                                              "id": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "label": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "decisionId": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "union",
                                                        "variants": [
                                                          {
                                                            "type": "string"
                                                          },
                                                          {
                                                            "type": "null"
                                                          }
                                                        ]
                                                      }
                                                    },
                                                    "definitionVersionId": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "definitionKind": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "reported",
                                                          "managerial",
                                                          "contractual"
                                                        ]
                                                      }
                                                    },
                                                    "missingReason": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "union",
                                                        "variants": [
                                                          {
                                                            "type": "string"
                                                          },
                                                          {
                                                            "type": "null"
                                                          }
                                                        ]
                                                      }
                                                    }
                                                  }
                                                }
                                              },
                                              "amount": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "decisionId": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "union",
                                                        "variants": [
                                                          {
                                                            "type": "string"
                                                          },
                                                          {
                                                            "type": "null"
                                                          }
                                                        ]
                                                      }
                                                    },
                                                    "definitionVersionId": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "definitionKind": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "reported",
                                                          "managerial",
                                                          "contractual"
                                                        ]
                                                      }
                                                    },
                                                    "missingReason": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "union",
                                                        "variants": [
                                                          {
                                                            "type": "string"
                                                          },
                                                          {
                                                            "type": "null"
                                                          }
                                                        ]
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "unrealizedEbitda": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "decisionId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "definitionVersionId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "definitionKind": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "reported",
                                                      "managerial",
                                                      "contractual"
                                                    ]
                                                  }
                                                },
                                                "missingReason": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "effects": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "measurementId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "withoutEffectMeasurementId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              },
                              "consequence": {
                                "required": true,
                                "value": {
                                  "type": "object",
                                  "fields": {
                                    "acceleration": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "process": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "crossDefault": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "update": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "envelope": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "canonical": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "fingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "scope": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "workId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "purpose": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "versionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "entityId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "perimeter": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "currency": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "openingDate": {
                          "required": true,
                          "value": {
                            "type": "date"
                          }
                        },
                        "endDate": {
                          "required": true,
                          "value": {
                            "type": "date"
                          }
                        },
                        "numericInterpretations": {
                          "required": false,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "mode": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "members": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "analysisId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "scenario": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "priorWeeklyFingerprint": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "priorCovenantFingerprint": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "decisionId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "definitionVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "definitionKind": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "reported",
                                    "managerial",
                                    "contractual"
                                  ]
                                }
                              },
                              "missingReason": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              }
                            }
                          }
                        },
                        "lines": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "unit": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "currency",
                                      "days",
                                      "ratio"
                                    ]
                                  }
                                },
                                "label": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "projected": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "actual": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "carry": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "cashLineId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "ebitdaLineId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        },
                        "bridges": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "lineId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "causes": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "id": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "equalsDeviationOf": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "driverLineId": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "label": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "decisionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "definitionKind": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "reported",
                                                    "managerial",
                                                    "contractual"
                                                  ]
                                                }
                                              },
                                              "missingReason": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "amount": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "decisionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "definitionKind": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "reported",
                                                    "managerial",
                                                    "contractual"
                                                  ]
                                                }
                                              },
                                              "missingReason": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "classification": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "decisionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "definitionKind": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "reported",
                                                    "managerial",
                                                    "contractual"
                                                  ]
                                                }
                                              },
                                              "missingReason": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "until": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "decisionId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "string"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  },
                                                  "definitionVersionId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "definitionKind": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "reported",
                                                        "managerial",
                                                        "contractual"
                                                      ]
                                                    }
                                                  },
                                                  "missingReason": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "string"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "basis": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "decisionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "definitionKind": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "reported",
                                                    "managerial",
                                                    "contractual"
                                                  ]
                                                }
                                              },
                                              "missingReason": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "question": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "decisionId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "string"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  },
                                                  "definitionVersionId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "definitionKind": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "reported",
                                                        "managerial",
                                                        "contractual"
                                                      ]
                                                    }
                                                  },
                                                  "missingReason": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "union",
                                                      "variants": [
                                                        {
                                                          "type": "string"
                                                        },
                                                        {
                                                          "type": "null"
                                                        }
                                                      ]
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "streamUpdates": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "streamId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "causeIds": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "string"
                                    }
                                  }
                                },
                                "dates": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "amounts": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "addedStreams": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "label": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "dates": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "amounts": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "covenant": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "measurementId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "effects": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "causeId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "ebitda": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      },
                                      "cash": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "decisionId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "definitionVersionId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "definitionKind": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "reported",
                                                  "managerial",
                                                  "contractual"
                                                ]
                                              }
                                            },
                                            "missingReason": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "facilities": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "label": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "limit": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "source": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "steps": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "facilityId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "mode": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "fixed"
                                        ]
                                      }
                                    },
                                    "streamId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "replacesStreamIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "facilityId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "mode": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "residual"
                                        ]
                                      }
                                    },
                                    "date": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "decisionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "definitionKind": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "reported",
                                                "managerial",
                                                "contractual"
                                              ]
                                            }
                                          },
                                          "missingReason": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          }
                        },
                        "dependents": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "id": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "label": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "kind": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "reads": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "horizonStart": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "horizonEnd": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                },
                                "recomputedBy": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "decisionId": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      },
                                      "definitionVersionId": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "definitionKind": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "reported",
                                            "managerial",
                                            "contractual"
                                          ]
                                        }
                                      },
                                      "missingReason": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "string"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "outputs": {
        "id": "quarter-update-packet-output",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "quarter-update-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.26-v1"
                ]
              }
            },
            "financialCoreVersion": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "basisFingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "scope": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "workId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "purpose": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "versionId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  }
                }
              }
            },
            "entityId": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "currency": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "result": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "financialCoreVersion": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "scope": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "workId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "purpose": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        },
                        "versionId": {
                          "required": true,
                          "value": {
                            "type": "string"
                          }
                        }
                      }
                    }
                  },
                  "entityId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "currency": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "basisFingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "status": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "missing_inputs",
                        "partial_composition"
                      ]
                    }
                  },
                  "gaps": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "bindings": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "operand": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "interpretationDecisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "normalization": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "adopted-currency-representation.v1"
                                ]
                              }
                            },
                            "scope": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "workId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "purpose": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "versionId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "basisFingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "status": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "partial",
                                  "resolved"
                                ]
                              }
                            },
                            "values": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number",
                                          "list"
                                        ]
                                      }
                                    },
                                    "interpretationDecisionIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "trace": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "schemaVersion": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "currency-representation.v1"
                                                  ]
                                                }
                                              },
                                              "engineVersion": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "operands": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "values": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "array",
                                                        "items": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    },
                                                    "declaredScale": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "string"
                                                      }
                                                    },
                                                    "representation": {
                                                      "required": true,
                                                      "value": {
                                                        "type": "enum",
                                                        "values": [
                                                          "reported_in_declared_scale",
                                                          "already_in_currency_units"
                                                        ]
                                                      }
                                                    }
                                                  }
                                                }
                                              },
                                              "factor": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "outputScale": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "1"
                                                  ]
                                                }
                                              },
                                              "values": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "string"
                                                  }
                                                }
                                              },
                                              "rounding": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "none"
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "representation_not_adopted"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "contributions": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "decisionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "slotKey": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "observation",
                                          "hypothesis"
                                        ]
                                      }
                                    },
                                    "fieldPath": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "dimensions": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "entityId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "perimeter": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "periodStart": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "date"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "periodEnd": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "date"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "currency": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "unit": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "scale": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "scenario": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "definitionVersionId": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "number"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "decimal_string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "text"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "date"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "boolean"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "boolean"
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "object",
                                            "fields": {
                                              "type": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "list"
                                                  ]
                                                }
                                              },
                                              "value": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    "observationId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "referenceValue": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "number"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "decimal_string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "text"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "date"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "boolean"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "boolean"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "type": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "list"
                                                      ]
                                                    }
                                                  },
                                                  "value": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "array",
                                                      "items": {
                                                        "type": "string"
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "referenceDimensions": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "entityId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "perimeter": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "periodStart": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "date"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "periodEnd": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "date"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "currency": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "unit": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "scale": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "scenario": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "definitionVersionId": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              }
                                            }
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionKind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "reported",
                                          "managerial",
                                          "contractual"
                                        ]
                                      }
                                    },
                                    "actorId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "grantsExecution": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "classification": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "working_hypothesis",
                                  "working_selection"
                                ]
                              }
                            },
                            "fingerprint": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "contributions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "decisionId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "slotKey": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "kind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "observation",
                                "hypothesis"
                              ]
                            }
                          },
                          "fieldPath": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "dimensions": {
                            "required": true,
                            "value": {
                              "type": "object",
                              "fields": {
                                "entityId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "perimeter": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodStart": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "periodEnd": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "date"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "currency": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "unit": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scale": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "scenario": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "definitionVersionId": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                }
                              }
                            }
                          },
                          "value": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "number"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "decimal_string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "text"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "date"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "date"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "boolean"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "object",
                                  "fields": {
                                    "type": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "list"
                                        ]
                                      }
                                    },
                                    "value": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                }
                              ]
                            }
                          },
                          "observationId": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "string"
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceValue": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "number"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "text"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "date"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "boolean"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    },
                                    {
                                      "type": "object",
                                      "fields": {
                                        "type": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "list"
                                            ]
                                          }
                                        },
                                        "value": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  ]
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "referenceDimensions": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "perimeter": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodStart": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "periodEnd": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "currency": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "unit": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scale": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "scenario": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "definitionVersionId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    }
                                  }
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "definitionKind": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "reported",
                                "managerial",
                                "contractual"
                              ]
                            }
                          },
                          "actorId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "reason": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          }
                        }
                      }
                    }
                  },
                  "derivedDependencies": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "result": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "decisionIds": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "classification": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "working_hypothesis",
                        "working_selection"
                      ]
                    }
                  },
                  "grantsExecution": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "grantsPublication": {
                    "required": true,
                    "value": {
                      "type": "boolean"
                    }
                  },
                  "fingerprint": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "schemaVersion": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "adopted-quarter-update.v1"
                      ]
                    }
                  },
                  "analysisId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "perimeter": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "prior": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "weeklyCash": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "analysisId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "basisFingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "resultFingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "complete": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        },
                        "covenant": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "analysisId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "basisFingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "resultFingerprint": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "complete": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "update": {
                    "required": true,
                    "value": {
                      "type": "union",
                      "variants": [
                        {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "quarter-update.v1"
                                ]
                              }
                            },
                            "version": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "currency": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "quarterStart": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "quarterEnd": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "lines": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "unit": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "currency",
                                          "days",
                                          "ratio"
                                        ]
                                      }
                                    },
                                    "projected": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "actual": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "deviation": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "bridges": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "lineId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "projected": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "actual": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "deviation": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "causes": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "id": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "label": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "amount": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "classification": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "calendar",
                                                  "structural"
                                                ]
                                              }
                                            },
                                            "until": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "date"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "basis": {
                                              "required": true,
                                              "value": {
                                                "type": "enum",
                                                "values": [
                                                  "document",
                                                  "interpretation"
                                                ]
                                              }
                                            },
                                            "question": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "equalsDeviationOf": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "driverLineId": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "string"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "explained": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "residual": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "propagation": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "causeId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "classification": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "calendar",
                                          "structural"
                                        ]
                                      }
                                    },
                                    "until": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "date"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "streams": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "covenant": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "weekly": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "prior": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "schemaVersion": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "weekly-cash.v1"
                                            ]
                                          }
                                        },
                                        "version": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "currency": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "firstMonday": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "horizonEnd": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "openingCash": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "minimumCash": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "cases": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "role": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "informed",
                                                      "alternative"
                                                    ]
                                                  }
                                                },
                                                "rows": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "weekStart": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "date"
                                                          }
                                                        },
                                                        "inflows": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "outflows": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "closing": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "belowMinimum": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "boolean"
                                                          }
                                                        },
                                                        "largestOutflows": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "array",
                                                            "items": {
                                                              "type": "object",
                                                              "fields": {
                                                                "label": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "amount": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        },
                                                        "outflowsByStream": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "array",
                                                            "items": {
                                                              "type": "object",
                                                              "fields": {
                                                                "streamId": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "label": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "category": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "enum",
                                                                    "values": [
                                                                      "debt",
                                                                      "statutory",
                                                                      "operating",
                                                                      "action"
                                                                    ]
                                                                  }
                                                                },
                                                                "amount": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "minimum": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "weekStart": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "date"
                                                        }
                                                      },
                                                      "closing": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "weeksBelowMinimum": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "date"
                                                    }
                                                  }
                                                },
                                                "closing": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "shortfallToMinimum": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "calendar": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "date": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "category": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "debt",
                                                      "statutory"
                                                    ]
                                                  }
                                                },
                                                "amount": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "actions": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cases": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "string"
                                                    }
                                                  }
                                                },
                                                "isolatedCases": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "string"
                                                    }
                                                  }
                                                },
                                                "amount": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "days": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "integer"
                                                  }
                                                },
                                                "interest": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "iof": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "fee": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cost": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "openAtCovenantTest": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "boolean"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "covenantEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "object",
                                                        "fields": {
                                                          "grossDebt": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "cash": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "netDebt": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "enum",
                                                              "values": [
                                                                "0"
                                                              ]
                                                            }
                                                          }
                                                        }
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "reconciliation": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "date": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "weekly": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "projection": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "difference": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "coverage": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "obligation": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "payroll",
                                                      "thirteenth_salary",
                                                      "payroll_charges",
                                                      "sales_taxes",
                                                      "income_taxes",
                                                      "debt_service"
                                                    ]
                                                  }
                                                },
                                                "status": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "included",
                                                      "not_applicable",
                                                      "not_examined"
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "gaps": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "item": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "reason": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "obligation_not_examined"
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "updated": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "schemaVersion": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "weekly-cash.v1"
                                            ]
                                          }
                                        },
                                        "version": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "currency": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "firstMonday": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "horizonEnd": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "openingCash": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "minimumCash": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "cases": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "role": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "informed",
                                                      "alternative"
                                                    ]
                                                  }
                                                },
                                                "rows": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "weekStart": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "date"
                                                          }
                                                        },
                                                        "inflows": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "outflows": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "closing": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "belowMinimum": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "boolean"
                                                          }
                                                        },
                                                        "largestOutflows": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "array",
                                                            "items": {
                                                              "type": "object",
                                                              "fields": {
                                                                "label": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "amount": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        },
                                                        "outflowsByStream": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "array",
                                                            "items": {
                                                              "type": "object",
                                                              "fields": {
                                                                "streamId": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "label": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                },
                                                                "category": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "enum",
                                                                    "values": [
                                                                      "debt",
                                                                      "statutory",
                                                                      "operating",
                                                                      "action"
                                                                    ]
                                                                  }
                                                                },
                                                                "amount": {
                                                                  "required": true,
                                                                  "value": {
                                                                    "type": "string"
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "minimum": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "weekStart": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "date"
                                                        }
                                                      },
                                                      "closing": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "weeksBelowMinimum": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "date"
                                                    }
                                                  }
                                                },
                                                "closing": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "shortfallToMinimum": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "calendar": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "date": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "category": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "debt",
                                                      "statutory"
                                                    ]
                                                  }
                                                },
                                                "amount": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "actions": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cases": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "string"
                                                    }
                                                  }
                                                },
                                                "isolatedCases": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "string"
                                                    }
                                                  }
                                                },
                                                "amount": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "days": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "integer"
                                                  }
                                                },
                                                "interest": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "iof": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "fee": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cost": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "openAtCovenantTest": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "boolean"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "covenantEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "object",
                                                        "fields": {
                                                          "grossDebt": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "cash": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "netDebt": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "enum",
                                                              "values": [
                                                                "0"
                                                              ]
                                                            }
                                                          }
                                                        }
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "reconciliation": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "date": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "weekly": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "projection": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "difference": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "coverage": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "obligation": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "payroll",
                                                      "thirteenth_salary",
                                                      "payroll_charges",
                                                      "sales_taxes",
                                                      "income_taxes",
                                                      "debt_service"
                                                    ]
                                                  }
                                                },
                                                "status": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "included",
                                                      "not_applicable",
                                                      "not_examined"
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "gaps": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "item": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "reason": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "obligation_not_examined"
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "carriedOpening": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "prior": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "deviation": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "updated": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "tightest": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "prior": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "weekStart": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              },
                                              "closing": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "shortfallToMinimum": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "updated": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "weekStart": {
                                                "required": true,
                                                "value": {
                                                  "type": "date"
                                                }
                                              },
                                              "closing": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "shortfallToMinimum": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "closing": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "prior": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "updated": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "action": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "steps": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "facilityId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "mode": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "fixed",
                                                "residual"
                                              ]
                                            }
                                          },
                                          "amount": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "limit": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "withinLimit": {
                                            "required": true,
                                            "value": {
                                              "type": "boolean"
                                            }
                                          },
                                          "caseId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "source": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "minimum": {
                                            "required": true,
                                            "value": {
                                              "type": "object",
                                              "fields": {
                                                "weekStart": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
                                                  }
                                                },
                                                "closing": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "covers": {
                                            "required": true,
                                            "value": {
                                              "type": "boolean"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "fullLimit": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "facilityId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "caseId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "amount": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "minimum": {
                                            "required": true,
                                            "value": {
                                              "type": "object",
                                              "fields": {
                                                "weekStart": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
                                                  }
                                                },
                                                "closing": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "covers": {
                                            "required": true,
                                            "value": {
                                              "type": "boolean"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "withinApproved": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "covers": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "boolean"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "covenant": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "measurementId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "prior": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "schemaVersion": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "covenant-headroom.v1"
                                            ]
                                          }
                                        },
                                        "version": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "currency": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "readingDate": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "limits": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "kind": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "contractual",
                                                      "board_policy"
                                                    ]
                                                  }
                                                },
                                                "status": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "in_force",
                                                      "superseded"
                                                    ]
                                                  }
                                                },
                                                "maximumRatio": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "source": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "testDates": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "date"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "measurements": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "date": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
                                                  }
                                                },
                                                "scenario": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "role": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "test",
                                                      "contrast"
                                                    ]
                                                  }
                                                },
                                                "debt": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cash": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "netDebt": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "reportedEbitda": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "adjustments": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "label": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "amount": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "ebitda": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "ratio": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "unrealizedEbitda": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "tests": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "limitId": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "kind": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "enum",
                                                            "values": [
                                                              "contractual",
                                                              "board_policy"
                                                            ]
                                                          }
                                                        },
                                                        "maximumRatio": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "breached": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "boolean"
                                                          }
                                                        },
                                                        "ebitdaHeadroom": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "netDebtHeadroom": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "unrealizedEbitdaLossToLimit": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "union",
                                                            "variants": [
                                                              {
                                                                "type": "string"
                                                              },
                                                              {
                                                                "type": "null"
                                                              }
                                                            ]
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "tightestLimitId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "effects": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "measurementId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "withoutEffectMeasurementId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "ratioEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "netDebtEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "worst": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "measurementId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "limitId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "ebitdaHeadroom": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "anyBreach": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "updated": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "schemaVersion": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "covenant-headroom.v1"
                                            ]
                                          }
                                        },
                                        "version": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "currency": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "readingDate": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "limits": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "kind": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "contractual",
                                                      "board_policy"
                                                    ]
                                                  }
                                                },
                                                "status": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "in_force",
                                                      "superseded"
                                                    ]
                                                  }
                                                },
                                                "maximumRatio": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "source": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "testDates": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "date"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "measurements": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "date": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
                                                  }
                                                },
                                                "scenario": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "role": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "test",
                                                      "contrast"
                                                    ]
                                                  }
                                                },
                                                "debt": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cash": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "netDebt": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "reportedEbitda": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "adjustments": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "label": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "amount": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "ebitda": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "ratio": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "unrealizedEbitda": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "tests": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "array",
                                                    "items": {
                                                      "type": "object",
                                                      "fields": {
                                                        "limitId": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "kind": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "enum",
                                                            "values": [
                                                              "contractual",
                                                              "board_policy"
                                                            ]
                                                          }
                                                        },
                                                        "maximumRatio": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "breached": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "boolean"
                                                          }
                                                        },
                                                        "ebitdaHeadroom": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "netDebtHeadroom": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "unrealizedEbitdaLossToLimit": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "union",
                                                            "variants": [
                                                              {
                                                                "type": "string"
                                                              },
                                                              {
                                                                "type": "null"
                                                              }
                                                            ]
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                },
                                                "tightestLimitId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "effects": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "id": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "label": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "measurementId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "withoutEffectMeasurementId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "ratioEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "string"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "netDebtEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "worst": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "object",
                                                "fields": {
                                                  "measurementId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "limitId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "ebitdaHeadroom": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  }
                                                }
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "anyBreach": {
                                          "required": true,
                                          "value": {
                                            "type": "boolean"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "carried": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "ebitda": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "cash": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "effects": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "causeId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "ebitda": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "cash": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "trailingEbitda": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "prior": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "updated": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "ratio": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "prior": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "updated": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "measurementsNotUpdated": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "string"
                                      }
                                    }
                                  },
                                  "effectsNotUpdated": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "dependents": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "analysis",
                                          "plan",
                                          "material"
                                        ]
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "updated",
                                          "affected_not_recomputed",
                                          "stale",
                                          "unchanged"
                                        ]
                                      }
                                    },
                                    "movedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "recomputedBy": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "weekly_cash",
                                              "covenant",
                                              "projection"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "sentToThirdParties": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "gaps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "item": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "unexplained_residual",
                                          "structural_cause_not_propagated",
                                          "affected_not_recomputed"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "exclusions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "enum",
                        "values": [
                          "accounting_close",
                          "cause_attribution",
                          "financing_cost_comparison",
                          "third_party_distribution",
                          "credit_approval",
                          "method_release"
                        ]
                      }
                    }
                  }
                }
              }
            },
            "readings": {
              "required": true,
              "value": {
                "type": "union",
                "variants": [
                  {
                    "type": "object",
                    "fields": {
                      "deviations": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "lineId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "projected": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "actual": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "deviation": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        }
                      },
                      "bridges": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "lineId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "deviation": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "residual": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "causes": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "object",
                                    "fields": {
                                      "id": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "label": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "amount": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "classification": {
                                        "required": true,
                                        "value": {
                                          "type": "enum",
                                          "values": [
                                            "calendar",
                                            "structural"
                                          ]
                                        }
                                      },
                                      "until": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "date"
                                            },
                                            {
                                              "type": "null"
                                            }
                                          ]
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "persisting": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "causeId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "until": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              }
                            }
                          }
                        }
                      },
                      "oneOff": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      },
                      "tightestWeek": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "prior": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "weekStart": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "closing": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "updated": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "weekStart": {
                                    "required": true,
                                    "value": {
                                      "type": "date"
                                    }
                                  },
                                  "closing": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "shortfallToMinimum": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "prior": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "updated": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      },
                      "closingAtHorizon": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "prior": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "updated": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            }
                          }
                        }
                      },
                      "topUp": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "facilityId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "limit": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "needExceedsLimit": {
                                  "required": true,
                                  "value": {
                                    "type": "boolean"
                                  }
                                },
                                "fullLimitMinimum": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "weekStart": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "closing": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  }
                                },
                                "fullLimitCovers": {
                                  "required": true,
                                  "value": {
                                    "type": "boolean"
                                  }
                                }
                              }
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "action": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "steps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "facilityId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "amount": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "limit": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "withinLimit": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "withinApproved": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "covers": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "boolean"
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "minimumAfter": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "weekStart": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "closing": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      }
                                    }
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            }
                          }
                        }
                      },
                      "covenant": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "measurementId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "ratio": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "prior": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  },
                                  "updated": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
                                          "type": "string"
                                        },
                                        {
                                          "type": "null"
                                        }
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "trailingEbitda": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "prior": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "updated": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  }
                                }
                              }
                            },
                            "byLimit": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "limitId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "kind": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "contractual",
                                          "board_policy"
                                        ]
                                      }
                                    },
                                    "ebitdaHeadroom": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "prior": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "updated": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "breached": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "anyBreach": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "notUpdated": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        }
                      },
                      "decisionsChanged": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "enum",
                            "values": [
                              "short_term_financing",
                              "covenant_headroom",
                              "third_party_material"
                            ]
                          }
                        }
                      },
                      "updated": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      },
                      "unchanged": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      },
                      "stale": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      },
                      "affectedNotRecomputed": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "string"
                          }
                        }
                      },
                      "openQuestions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "causeId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "question": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        }
                      },
                      "priorVersionsKept": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "sentToThirdParties": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      }
                    }
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "gaps": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "fields": {
                    "operand": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    },
                    "reason": {
                      "required": true,
                      "value": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            },
            "status": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "framed",
                  "partial",
                  "prepared_for_human_review"
                ]
              }
            },
            "exclusions": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "enum",
                  "values": [
                    "accounting_close",
                    "cause_attribution",
                    "financing_cost_comparison",
                    "third_party_distribution",
                    "credit_approval"
                  ]
                }
              }
            },
            "grantsExecution": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "grantsPublication": {
              "required": true,
              "value": {
                "type": "boolean"
              }
            },
            "fingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            }
          }
        }
      },
      "dependencies": [
        {
          "id": "quarter-update.request-framing",
          "version": "2026.10.26-v1"
        }
      ],
      "tools": [],
      "effect": "none",
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "decision_support"
        ],
        "sourceClasses": [
          "authorized_context"
        ]
      },
      "competencies": [
        "financial_analysis",
        "capital_structure"
      ],
      "invariants": [
        "law",
        "contractual_definition",
        "traceability",
        "verification",
        "access_barriers",
        "deterministic_financial_math"
      ],
      "overridePoints": [],
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 30000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "evidence": [
        "packages/credit-playbook/knowledge/reviews/runs/update-after-quarter-close-2026-10-26-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/update-after-quarter-close-2026-10-26-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/update-after-quarter-close-2026-10-26-v1-consistency/run.json"
      ]
    }
  ]
}
```
