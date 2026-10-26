---
id: build-operating-projection
version: 2026.10.26-v1
maturity: tested
title_pt: Construir projeção operacional por driver
title_en: Build Operating Projection by Driver
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-26
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareOperatingProjectionPacket
result_contract: operating-projection-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: operating-projection-packet.v1
unit_test_files: [packages/financial-model/src/operating-projection-packet.test.ts, packages/financial-model/src/operating-projection-runs.test.ts, packages/financial-model/src/operating-projection-premises.test.ts, packages/financial-core/src/operating-projection.test.ts]
gold_case_ids: [first-version-in-the-first-turn, reproduces-the-last-audited-year, base-by-driver-2026-to-2028, ebitda-within-five-percent-of-the-answer-key, cash-available-near-sixty-percent-of-ebitda, budget-and-revision-side-by-side-with-the-cause, sensitivities-in-reais-2027, wheat-shock-with-six-month-pass-through, wheat-shock-without-pass-through-in-the-year, volume-two-percent-lower, assumptions-kept-apart-from-data, estimated-informed-and-house-history-is-not-data, scenario-changes-carry-their-origin, at-most-three-questions-volume-pass-through-receivable-days, turn-two-informed-drivers, turn-two-sixty-day-receivables-drain-cash, turn-two-wheat-shock-with-four-month-pass-through, projection-withheld-when-the-last-year-is-not-reproduced, unexplained-difference-is-an-open-question, absent-driver-is-a-gap-not-a-default]
adversarial_case_ids: [tampered-envelope, free-result-in-request, fabricated-grant-in-result, single-growth-rate-instead-of-drivers, company-version-built-by-the-house, scenario-based-on-a-later-scenario, two-volume-rules-in-one-scenario, shock-from-a-period-not-projected, pass-through-lag-beyond-a-year, driver-column-shorter-than-the-horizon, negative-volume, duplicate-scenario, scenario-reuses-the-base-scenario-key, figure-read-in-another-scenario]
e2e_scenario_ids: [domain:first-version-in-the-first-turn]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: []
reference_data_keys: []
calculation_ids: [financial.operating_projection]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [build-operating-projection-2026-10-26-v1-consistency]
adversarial_run_ids: [build-operating-projection-2026-10-26-v1-adversarial]
review_ids: [build-operating-projection-2026-10-26-v1-independent-review]
gold_run_ids: [build-operating-projection-2026-10-26-v1-gold]
---

# Objetivo
Entregar, no primeiro turno, uma projeção anual defensável diante de um banco, construída pelo mecanismo do negócio, que reproduz o último ano auditado e mostra quanto caixa fica disponível para a dívida e o que pode dar errado. A tarefa termina na projeção suficiente para o propósito declarado; não inclui recomendar o financiamento.

# Produto
Pacote de projeção: reprodução do último ano pelos drivers, com a diferença contra o reportado; projeção anual por driver com receita, custos variáveis e fixos, EBITDA, margem, variação de giro, imposto, caixa disponível para a dívida e conversão; orçamento e revisão da companhia lado a lado, com a diferença, o equivalente em preço e a causa; sensibilidades em reais (1% de preço, 1% de insumo sem repasse, 1 dia de prazo de recebimento); cenários contra a base ou o cenário de referência; quadro de dados e hipóteses com a origem de cada driver; no máximo três perguntas.

# Quando ativar
- A companhia não tem projeção ou business plan e precisa de um para discutir financiamento.
- Pedido de primeira versão da projeção com hipóteses explícitas.
- A companhia corrige premissas de uma projeção já entregue (volume, repasse, prazos).

# Quando não ativar
- "Só me diz como começar" pede orientação: os drivers do negócio, o que já existe para cada um e o que falta; a primeira versão fica oferecida.
- Empresa sem histórico pede projeção de baixo para cima com capacidade, rampa e pares, tudo como hipótese com faixa.
- Desafiar a projeção que a companhia já tem é a demanda de questionar projeção.

# Inputs mínimos e substitutos
- Último ano: volume, preço líquido, custo do insumo por unidade, demais custos variáveis por unidade, custos fixos, prazos de recebimento, estoque e pagamento; receita e EBITDA reportados; a origem de cada um.
- Anos projetados: os mesmos drivers, mais capex de manutenção, arrendamentos, depreciação, juros e alíquota, cada um com a sua origem.
- Orçamento aprovado e revisões da companhia, com a causa da diferença quando conhecida.
- Cenários: choque do insumo com a regra de repasse, prazo, volume.

# Sequência operacional
1. [human_judgment] Enquadrar :: Propósito da projeção, horizonte, o que o banco vai ler e o que já existe no cofre | evidence: pedido, demonstrações, gerencial e orçamento
2. [deterministic] Reproduzir o último ano :: Receita e EBITDA pelos drivers contra o reportado, dentro da tolerância adotada | evidence: demonstrações auditadas e gerencial adotados
3. [deterministic] Projetar por driver :: Receita, custos, EBITDA, giro por prazos, imposto e caixa disponível para a dívida, ano a ano, pelo motor operacional | evidence: drivers adotados
4. [deterministic] Comparar com a companhia :: Orçamento e revisão lado a lado, diferença e equivalente em preço, sem substituir | evidence: versões adotadas da companhia
5. [deterministic] Sensibilidades e cenários :: Preço, insumo com regra de repasse, prazo e volume, em reais, contra o cenário de referência | evidence: cenários adotados
6. [deterministic] Separar dado de hipótese :: Origem adotada de cada operando, do último ano e de cada ano projetado, e de cada mudança dos cenários; só documento é dado | evidence: base adotada
7. [human_judgment] Causa da diferença :: Por que a projeção difere do orçamento e da revisão | evidence: balancetes e realizado do ano
8. [human_judgment] Devolver e perguntar :: Primeira versão, o que pesa e até três perguntas que mudam o número | evidence: base autorizada, pacote e lacunas

# Cálculos determinísticos
- Receita = volume x preço líquido; custos variáveis = volume x (insumo por unidade + demais custos variáveis por unidade); EBITDA = receita - custos variáveis - custos fixos.
- Giro = receita x prazo de recebimento / base de dias + custos variáveis x (prazo de estoque - prazo de pagamento) / base de dias; a variação do giro sai do caixa.
- Imposto = alíquota x (EBITDA - depreciação - arrendamentos - juros), nunca abaixo de zero, sem compensação de prejuízo.
- Caixa disponível para a dívida = caixa antes do financiamento do motor operacional - arrendamentos; conversão = caixa disponível / EBITDA.
- Choque do insumo: o custo por unidade sobe a taxa a partir do ano escolhido; no ano do choque (12 - defasagem em meses) / 12 da alta chega ao preço; nos anos seguintes, toda. Defasagem de 12 meses é sem repasse no ano.
- Cenário muda só o que declara sobre o cenário de referência: crescimento de volume a partir do último ano ou fator de volume, colunas inteiras de drivers e o choque do insumo, nessa ordem.
- Sensibilidades: 1% de preço = receita x 1%; 1% de insumo sem repasse = volume x insumo por unidade x 1%; 1 dia de recebimento = receita / base de dias.
- Comparação: diferença = valor da companhia - valor projetado; equivalente em preço = diferença / volume.
- Reprodução: diferença relativa de receita e de EBITDA do último ano até a tolerância adotada; fora dela, nada é projetado. A reprodução prova a aritmética, não a origem: o último ano só é dado, e só é histórico documentado, quando cada operando tem origem documento.
- Precisão: aritmética decimal de alta precisão; os operandos entregues ao motor operacional são arredondados a oito casas, e é o único arredondamento.

# Julgamentos permitidos
- Explicar o mecanismo do negócio em uma frase e dizer quais premissas decidem o resultado e quanto valem.
- Ligar o efeito do prazo a outro aperto de caixa do mesmo período (por exemplo, a linha da safra), como leitura.
- Propor como tratar o prazo antes do financiamento, sem recomendar o financiamento.

# Perguntas que mudam o trabalho
- Quanto a companhia planeja crescer em volume e se a fábrica comporta?
- Quanto tempo o insumo leva para chegar ao preço de venda?
- Os clientes estão pedindo mais prazo de recebimento?

# Red flags
- Crescer por taxa única.
- Pedir todos os dados antes de entregar uma primeira versão.
- Projeção que não reproduz o último ano.
- Sobrescrever o orçamento da companhia.
- Apresentar hipótese como dado.

# Stop conditions
- Driver sem contribuição adotada vira lacuna; nenhuma projeção é montada com valor presumido.
- Último ano fora da tolerância: a projeção não é entregue e a diferença é mostrada.
- Diferença sem causa declarada vira pergunta; a comparação continua mostrada.
- O pacote não recomenda financiamento, não monta serviço da dívida, não aprova crédito e não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: operating-projection-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Reprodução do último ano, projeção por driver, cenários, sensibilidades, comparações, origens e perguntas abertas
- readings (object, required): Reprodução com a origem do reportado, base, comparações com causa, sensibilidades, cenários com a origem de cada mudança, maior redução de caixa, quadro de dados e hipóteses e perguntas
- exclusions (array, required): Recomendação de financiamento, serviço da dívida, aprovação de crédito, liberação de método
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- A primeira versão segue o mecanismo do negócio: receita é volume vezes preço líquido; o trigo, cerca de um quarto da receita, chega ao preço com atraso; o caixa sai do resultado pelos prazos. Ela reproduz 2025 auditado (R$ 420 milhões de receita e R$ 52 milhões de EBITDA). O EBITDA vai de R$ 54,5 milhões em 2026 a R$ 58,8 milhões em 2028 e o caixa disponível para a dívida fica perto de 60% do EBITDA. Para 2026 a versão fica abaixo da revisão de julho (R$ 55,5 milhões) e do orçamento (R$ 58 milhões); a diferença está no repasse do trigo no segundo semestre. 1% de preço vale cerca de R$ 4,6 milhões de EBITDA; 1% de trigo sem repasse, R$ 1,1 milhão; cada dia de prazo prende cerca de R$ 1,3 milhão.
## Ruim
- "Com crescimento histórico de 6,3% ao ano e margem de 12,4%, o EBITDA chega a R$ 62 milhões em 2028." (taxa única, sem drivers, sem comparação com o orçamento, sem caixa)

# Testes
## Unit
- packages/financial-core/src/operating-projection.test.ts: núcleo contra o oráculo da ficha.
- packages/financial-model/src/operating-projection-packet.test.ts: leitor adotado e pacote.
- packages/financial-model/src/operating-projection-premises.test.ts: premissas, base adotada, composição e pacote de ida e volta.
## Gold
- first-version-in-the-first-turn, reproduces-the-last-audited-year, base-by-driver-2026-to-2028, ebitda-within-five-percent-of-the-answer-key, cash-available-near-sixty-percent-of-ebitda, budget-and-revision-side-by-side-with-the-cause, sensitivities-in-reais-2027, wheat-shock-with-six-month-pass-through, wheat-shock-without-pass-through-in-the-year, volume-two-percent-lower, assumptions-kept-apart-from-data, estimated-informed-and-house-history-is-not-data, scenario-changes-carry-their-origin, at-most-three-questions-volume-pass-through-receivable-days, turn-two-informed-drivers, turn-two-sixty-day-receivables-drain-cash, turn-two-wheat-shock-with-four-month-pass-through, projection-withheld-when-the-last-year-is-not-reproduced, unexplained-difference-is-an-open-question, absent-driver-is-a-gap-not-a-default.
## Adversarial
- Base adulterada, resultado livre no pedido, concessão fabricada, taxa única no lugar de drivers, versão da companhia feita pela casa, cenário baseado em cenário posterior, duas regras de volume, choque em período não projetado, defasagem acima de um ano, coluna mais curta que o horizonte, volume negativo, cenário duplicado, cenário com a chave da base, número lido em outro cenário.
## Aceitação
- Reproduzir o caso de calibração pelo oráculo independente sem alterar seus scripts.
- Executar a conversa da ficha C24 turno a turno pela interface real; guardar plano, versões, cálculo, resposta, custo e latência.

# Evidência
## Hierarquia
- Demonstrações auditadas; gerencial e custo de produção; balancetes do ano; orçamento aprovado e revisões; premissas informadas pela companhia.
- Ficha C24 e seu oráculo como calibração independente, nunca como dado de outra companhia.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número do pacote abre até o operando adotado, sua origem e sua versão.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria e ainda não registrada. Publicação e ativação seguem o fluxo governado e não são concedidas por este procedimento.

# Narrativa
## N1. A decisão que organiza o trabalho
O CFO precisa de uma projeção que se sustente diante de um banco: quanto caixa a companhia gera para servir dívida e o que pode dar errado. A primeira versão sai do que a companhia já tem, segue o mecanismo do negócio e mostra que reproduz o último ano.

## N2. Árvore de decisão
- Há drivers do último ano e ele é reproduzido: entregar a primeira versão no primeiro turno, com premissas visíveis.
- O último ano não é reproduzido: não projetar; mostrar a diferença e o driver que falta conciliar.
- Há orçamento ou revisão da companhia: manter lado a lado, dizer a diferença e a causa; sem causa, perguntar.
- A companhia corrige premissas: registrar como informadas, preservar a versão anterior e destacar o que mais mudou o caixa.

## N3. Suficiência por conclusão
- Para o último ano: volume, preço líquido, custo do insumo e demais custos por unidade, custos fixos, prazos.
- Para o caixa disponível: capex de manutenção, arrendamentos, depreciação, juros e alíquota.
- Para a comparação: o valor da companhia e a causa da diferença.

## N4. Voz e três níveis de afirmação
Fato (o que as demonstrações e o gerencial dizem), leitura (o que a projeção mostra e o que pesa) e premissa (o que é hipótese nossa ou da companhia) separados. Sem recomendar o financiamento e sem certeza sobre o banco.

# Template
## T1. Uma primeira versão útil, com evidência aprofundável
1. O mecanismo do negócio em uma frase.
2. A reprodução do último ano.
3. Receita, EBITDA e caixa disponível para a dívida por ano.
4. A comparação com o orçamento e a revisão, com a causa.
5. As premissas que decidem e quanto valem, em reais.
6. O que é hipótese e o que é dado, pela origem de cada operando, inclusive o último ano e as mudanças dos cenários.
7. Até três perguntas que mudam o número.

## T2. Peças
Quadro anual por driver com o último ano ao lado; quadro de cenários com EBITDA, margem e caixa disponível. Gráfico com um elemento em foco, fundo branco, sem vermelho e sem pontilhado.

# Regra
## R1. Reprodução antes de projeção
Nenhuma projeção é entregue sem reproduzir o último ano pelos mesmos drivers.

## R2. A versão da companhia
O orçamento e a revisão da companhia são da companhia: comparados, nunca substituídos.

## R3. Origem
Cada operando de cada ano, o último ano incluído, e cada mudança de cenário carregam a sua origem; só documento é dado. Último ano estimado, informado ou da casa é mostrado como tal, nunca como histórico auditado.

# Qualidade
## Q1. Teste do MD
A projeção segue o mecanismo do negócio? Reproduz o último ano? O caixa disponível está depois de impostos, giro, manutenção e arrendamentos? O orçamento ficou intacto, com a causa da diferença? As sensibilidades estão em reais? Hipótese e dado estão separados pela origem, também no último ano? São no máximo três perguntas?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de publicar.

# Fundamentação profissional
## Primeira versão antes de pedir dados
O cofre costuma ter o suficiente para uma primeira versão. Pedir tudo antes de entregar adia a conversa que importa: quais premissas decidem.

## Reproduzir o passado
Um banco lê primeiro se o modelo reproduz o último ano auditado. Sem isso, nenhuma premissa é discutível.

## Insumo com repasse
Quando um insumo pesa e chega ao preço com atraso, a margem do ano do choque depende da defasagem, não só da alta.

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
      "id": "projection.request-framing",
      "version": "2026.10.26-v1",
      "kind": "narrative",
      "title": "Enquadramento da projeção por driver",
      "inputs": {
        "id": "projection.framing-input",
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
        "id": "projection.framing-output",
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
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO CFO precisa de uma projeção que se sustente diante de um banco: quanto caixa a companhia gera para servir dívida e o que pode dar errado. A primeira versão sai do que a companhia já tem, segue o mecanismo do negócio e mostra que reproduz o último ano.\n\nN2. Árvore de decisão\n- Há drivers do último ano e ele é reproduzido: entregar a primeira versão no primeiro turno, com premissas visíveis.\n- O último ano não é reproduzido: não projetar; mostrar a diferença e o driver que falta conciliar.\n- Há orçamento ou revisão da companhia: manter lado a lado, dizer a diferença e a causa; sem causa, perguntar.\n- A companhia corrige premissas: registrar como informadas, preservar a versão anterior e destacar o que mais mudou o caixa.\n\nN3. Suficiência por conclusão\n- Para o último ano: volume, preço líquido, custo do insumo e demais custos por unidade, custos fixos, prazos.\n- Para o caixa disponível: capex de manutenção, arrendamentos, depreciação, juros e alíquota.\n- Para a comparação: o valor da companhia e a causa da diferença.\n\nN4. Voz e três níveis de afirmação\nFato (o que as demonstrações e o gerencial dizem), leitura (o que a projeção mostra e o que pesa) e premissa (o que é hipótese nossa ou da companhia) separados. Sem recomendar o financiamento e sem certeza sobre o banco."
    },
    {
      "id": "projection.packet",
      "version": "2026.10.26-v1",
      "kind": "rule",
      "title": "Projetar por driver, reproduzir o último ano e comparar com o orçamento sem substituí-lo",
      "authority": "house",
      "statement": "Projetar por driver (volume, preço líquido, insumo com regra de repasse, demais custos variáveis, fixos e prazos) sobre o motor operacional, reproduzir o último ano antes de projetar, comparar com o orçamento e a revisão da companhia sem substituí-los, dar sensibilidades em reais e separar dado de hipótese, sem recomendar financiamento, sem aprovar crédito e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareOperatingProjectionPacket",
        "version": "2026.10.26-v1"
      },
      "inputs": {
        "id": "operating-projection-packet-input",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "operating-projection-packet-input.v1"
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
                  "purpose": {
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
                  "periodEnds": {
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
                  "conventions": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "dayCountBasis": {
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
                        "calibrationTolerance": {
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
                  },
                  "actual": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "periodStart": {
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
                        "periodEnd": {
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
                        "drivers": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "volume": {
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
                              "netUnitPrice": {
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
                              "inputCostPerUnit": {
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
                              "otherVariableCostPerUnit": {
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
                              "fixedCosts": {
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
                              "receivableDays": {
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
                              "inventoryDays": {
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
                              "payableDays": {
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
                        },
                        "reportedRevenue": {
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
                        "origins": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "volume": {
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
                              "netUnitPrice": {
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
                              "inputCostPerUnit": {
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
                              "otherVariableCostPerUnit": {
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
                              "fixedCosts": {
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
                              "receivableDays": {
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
                              "inventoryDays": {
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
                              "payableDays": {
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
                              "reportedRevenue": {
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
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "base": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "drivers": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "volume": {
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
                              "netUnitPrice": {
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
                              "inputCostPerUnit": {
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
                              "otherVariableCostPerUnit": {
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
                              "fixedCosts": {
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
                              "receivableDays": {
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
                              "inventoryDays": {
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
                              "payableDays": {
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
                              "maintenanceCapex": {
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
                              "leasePayments": {
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
                              "depreciation": {
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
                              "interestExpense": {
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
                              "taxRate": {
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
                        },
                        "origins": {
                          "required": true,
                          "value": {
                            "type": "object",
                            "fields": {
                              "volume": {
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
                              "netUnitPrice": {
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
                              "inputCostPerUnit": {
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
                              "otherVariableCostPerUnit": {
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
                              "fixedCosts": {
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
                              "receivableDays": {
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
                              "inventoryDays": {
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
                              "payableDays": {
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
                              "maintenanceCapex": {
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
                              "leasePayments": {
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
                              "depreciation": {
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
                              "interestExpense": {
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
                              "taxRate": {
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
                  "scenarios": {
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
                                "alternative",
                                "informed"
                              ]
                            }
                          },
                          "basedOn": {
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
                          "volumeGrowthRate": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "value": {
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
                                    "origin": {
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
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "volumeFactor": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "value": {
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
                                    "origin": {
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
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "overrides": {
                            "required": true,
                            "value": {
                              "type": "array",
                              "items": {
                                "type": "object",
                                "fields": {
                                  "driver": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "volume",
                                        "netUnitPrice",
                                        "inputCostPerUnit",
                                        "otherVariableCostPerUnit",
                                        "fixedCosts",
                                        "receivableDays",
                                        "inventoryDays",
                                        "payableDays",
                                        "maintenanceCapex",
                                        "leasePayments",
                                        "depreciation",
                                        "interestExpense",
                                        "taxRate"
                                      ]
                                    }
                                  },
                                  "values": {
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
                                  "origin": {
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
                          "inputCostShock": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "fromPeriodEnd": {
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
                                    "passThroughLagMonths": {
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
                                    "origin": {
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
                  "companyVersions": {
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
                          "periodEnd": {
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
                          "metric": {
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
                          "value": {
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
                          "origin": {
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
                          "cause": {
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
      },
      "outputs": {
        "id": "operating-projection-packet-output",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "operating-projection-packet.v1"
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
                        "adopted-operating-projection.v1"
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
                  "purpose": {
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
                  "projection": {
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
                                  "operating-projection.v1"
                                ]
                              }
                            },
                            "version": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "engineVersion": {
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
                            "dayCountBasis": {
                              "required": true,
                              "value": {
                                "type": "integer"
                              }
                            },
                            "calibration": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "periodId": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "startDate": {
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
                                  "reportedRevenue": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "modeledRevenue": {
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
                                  "modeledEbitda": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "revenueRelativeDifference": {
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
                                  "ebitdaRelativeDifference": {
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
                                  "tolerance": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "reproduces": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  }
                                }
                              }
                            },
                            "rounding": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "engine_operands_half_up_8_decimals"
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
                                    "financing",
                                    "debt_service",
                                    "contractual_cfads",
                                    "tax_rule_inference",
                                    "loss_carryforward",
                                    "intraperiod_liquidity"
                                  ]
                                }
                              }
                            },
                            "projection": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "base": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "object",
                                            "fields": {
                                              "periodId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "startDate": {
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
                                              "volume": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "netUnitPrice": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "inputCostPerUnit": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "revenue": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "variableCosts": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "fixedCosts": {
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
                                              "margin": {
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
                                              "receivables": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "inventory": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "payables": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "workingCapital": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "changeInWorkingCapital": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "incomeTax": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "maintenanceCapex": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "cashBeforeLeases": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "leasePayments": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "cashAvailableForDebt": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "conversion": {
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
                                      "scenarios": {
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
                                                    "alternative",
                                                    "informed"
                                                  ]
                                                }
                                              },
                                              "basedOn": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "volumeGrowthRate": {
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
                                              "volumeFactor": {
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
                                              "overriddenDrivers": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "enum",
                                                    "values": [
                                                      "volume",
                                                      "netUnitPrice",
                                                      "inputCostPerUnit",
                                                      "otherVariableCostPerUnit",
                                                      "fixedCosts",
                                                      "receivableDays",
                                                      "inventoryDays",
                                                      "payableDays",
                                                      "maintenanceCapex",
                                                      "leasePayments",
                                                      "depreciation",
                                                      "interestExpense",
                                                      "taxRate"
                                                    ]
                                                  }
                                                }
                                              },
                                              "inputCostShock": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "object",
                                                      "fields": {
                                                        "fromPeriodId": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "rate": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "string"
                                                          }
                                                        },
                                                        "passThroughLagMonths": {
                                                          "required": true,
                                                          "value": {
                                                            "type": "integer"
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
                                              "rows": {
                                                "required": true,
                                                "value": {
                                                  "type": "array",
                                                  "items": {
                                                    "type": "object",
                                                    "fields": {
                                                      "periodId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "startDate": {
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
                                                      "volume": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "netUnitPrice": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "inputCostPerUnit": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "revenue": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "variableCosts": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "fixedCosts": {
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
                                                      "margin": {
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
                                                      "receivables": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "inventory": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "payables": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "workingCapital": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "changeInWorkingCapital": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "incomeTax": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "maintenanceCapex": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "cashBeforeLeases": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "leasePayments": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "cashAvailableForDebt": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "conversion": {
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
                                                      "effects": {
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
                                                            "cashAvailableForDebt": {
                                                              "required": true,
                                                              "value": {
                                                                "type": "string"
                                                              }
                                                            },
                                                            "changeInWorkingCapital": {
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
                                            }
                                          }
                                        }
                                      },
                                      "sensitivities": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "object",
                                            "fields": {
                                              "periodId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "ebitdaPerOnePercentPrice": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "ebitdaLossPerOnePercentInputCost": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "workingCapitalPerReceivableDay": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "pricePercentShareOfEbitda": {
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
                                      "comparisons": {
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
                                              "status": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "approved",
                                                    "under_review"
                                                  ]
                                                }
                                              },
                                              "periodId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "metric": {
                                                "required": true,
                                                "value": {
                                                  "type": "enum",
                                                  "values": [
                                                    "revenue",
                                                    "ebitda"
                                                  ]
                                                }
                                              },
                                              "companyValue": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "projectedValue": {
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
                                              },
                                              "relativeDifference": {
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
                                              "unitPriceEquivalent": {
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
                                      "largestCashReduction": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "object",
                                              "fields": {
                                                "scenarioId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "periodId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "cashEffect": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "workingCapitalChangeEffect": {
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
                  "origins": {
                    "required": true,
                    "value": {
                      "type": "object",
                      "fields": {
                        "actual": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "item": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "volume",
                                      "netUnitPrice",
                                      "inputCostPerUnit",
                                      "otherVariableCostPerUnit",
                                      "fixedCosts",
                                      "receivableDays",
                                      "inventoryDays",
                                      "payableDays",
                                      "reportedRevenue",
                                      "reportedEbitda"
                                    ]
                                  }
                                },
                                "origin": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "enum",
                                        "values": [
                                          "document",
                                          "informed",
                                          "house",
                                          "estimate"
                                        ]
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
                        "base": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "driver": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "volume",
                                      "netUnitPrice",
                                      "inputCostPerUnit",
                                      "otherVariableCostPerUnit",
                                      "fixedCosts",
                                      "receivableDays",
                                      "inventoryDays",
                                      "payableDays",
                                      "maintenanceCapex",
                                      "leasePayments",
                                      "depreciation",
                                      "interestExpense",
                                      "taxRate"
                                    ]
                                  }
                                },
                                "origins": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "array",
                                        "items": {
                                          "type": "enum",
                                          "values": [
                                            "document",
                                            "informed",
                                            "house",
                                            "estimate"
                                          ]
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
                        "scenarios": {
                          "required": true,
                          "value": {
                            "type": "array",
                            "items": {
                              "type": "object",
                              "fields": {
                                "scenarioId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "volumeGrowthRate": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "enum",
                                        "values": [
                                          "document",
                                          "informed",
                                          "house",
                                          "estimate"
                                        ]
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "volumeFactor": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "enum",
                                        "values": [
                                          "document",
                                          "informed",
                                          "house",
                                          "estimate"
                                        ]
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "overrides": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "driver": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "volume",
                                              "netUnitPrice",
                                              "inputCostPerUnit",
                                              "otherVariableCostPerUnit",
                                              "fixedCosts",
                                              "receivableDays",
                                              "inventoryDays",
                                              "payableDays",
                                              "maintenanceCapex",
                                              "leasePayments",
                                              "depreciation",
                                              "interestExpense",
                                              "taxRate"
                                            ]
                                          }
                                        },
                                        "origin": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "enum",
                                                "values": [
                                                  "document",
                                                  "informed",
                                                  "house",
                                                  "estimate"
                                                ]
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
                                "inputCostShock": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "enum",
                                        "values": [
                                          "document",
                                          "informed",
                                          "house",
                                          "estimate"
                                        ]
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
                  "companyVersions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "versionId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "origin": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "enum",
                                  "values": [
                                    "document",
                                    "informed",
                                    "house",
                                    "estimate"
                                  ]
                                },
                                {
                                  "type": "null"
                                }
                              ]
                            }
                          },
                          "cause": {
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
                  "openQuestions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "fields": {
                          "versionId": {
                            "required": true,
                            "value": {
                              "type": "string"
                            }
                          },
                          "question": {
                            "required": true,
                            "value": {
                              "type": "enum",
                              "values": [
                                "difference_cause_not_stated"
                              ]
                            }
                          }
                        }
                      }
                    }
                  },
                  "exclusions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "enum",
                        "values": [
                          "financing_recommendation",
                          "budget_replacement",
                          "debt_service",
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
                      "purpose": {
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
                      "calibration": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "periodId": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "reportedRevenue": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "modeledRevenue": {
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
                            "modeledEbitda": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "reproduces": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "reportedRevenueOrigin": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "enum",
                                    "values": [
                                      "document",
                                      "informed",
                                      "house",
                                      "estimate"
                                    ]
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "reportedEbitdaOrigin": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "enum",
                                    "values": [
                                      "document",
                                      "informed",
                                      "house",
                                      "estimate"
                                    ]
                                  },
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "documented": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            }
                          }
                        }
                      },
                      "projected": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "base": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "periodId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "revenue": {
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
                                        "margin": {
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
                                        "changeInWorkingCapital": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "cashAvailableForDebt": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "conversion": {
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
                                "comparisons": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "versionId": {
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
                                              "approved",
                                              "under_review"
                                            ]
                                          }
                                        },
                                        "periodId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "metric": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "revenue",
                                              "ebitda"
                                            ]
                                          }
                                        },
                                        "companyValue": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "projectedValue": {
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
                                        },
                                        "unitPriceEquivalent": {
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
                                        "cause": {
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
                                "sensitivities": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "periodId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "ebitdaPerOnePercentPrice": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "ebitdaLossPerOnePercentInputCost": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "workingCapitalPerReceivableDay": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                "scenarios": {
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
                                        "role": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "alternative",
                                              "informed"
                                            ]
                                          }
                                        },
                                        "basedOn": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "changes": {
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
                                                "origin": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "enum",
                                                        "values": [
                                                          "document",
                                                          "informed",
                                                          "house",
                                                          "estimate"
                                                        ]
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "nature": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "enum",
                                                    "values": [
                                                      "data",
                                                      "assumption"
                                                    ]
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        },
                                        "rows": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "periodId": {
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
                                                "margin": {
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
                                                "cashAvailableForDebt": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "effects": {
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
                                                      "cashAvailableForDebt": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "changeInWorkingCapital": {
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
                                      }
                                    }
                                  }
                                },
                                "largestCashReduction": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "scenarioId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "periodId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "cashEffect": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "workingCapitalChangeEffect": {
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
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "ledger": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "driver": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "periodId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "origin": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "enum",
                                      "values": [
                                        "document",
                                        "informed",
                                        "house",
                                        "estimate"
                                      ]
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "nature": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "data",
                                    "assumption"
                                  ]
                                }
                              }
                            }
                          }
                        }
                      },
                      "questions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "enum",
                            "values": [
                              "volume",
                              "pass_through",
                              "receivable_days"
                            ]
                          }
                        }
                      },
                      "openQuestions": {
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
                    "financing_recommendation",
                    "debt_service",
                    "credit_approval",
                    "method_release"
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
          "id": "projection.request-framing",
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
        "packages/credit-playbook/knowledge/reviews/runs/build-operating-projection-2026-10-26-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/build-operating-projection-2026-10-26-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/build-operating-projection-2026-10-26-v1-consistency/run.json",
        "packages/credit-playbook/knowledge/reviews/build-operating-projection-2026-10-26-v1-independent-review.json",
        "packages/credit-playbook/knowledge/reviews/evidence/build-operating-projection-2026-10-26-v1-independent-review/REVIEW-SUBJECT-BASIS.json"
      ]
    }
  ]
}
```
