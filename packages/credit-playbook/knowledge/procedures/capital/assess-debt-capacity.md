---
id: assess-debt-capacity
version: 2026.10.19-v2
maturity: implemented
title_pt: Medir capacidade de dívida e perfil de pagamento
title_en: Assess Debt Capacity
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-19
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareDebtCapacityPacket
result_contract: debt-capacity-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: debt-capacity-packet.v1
unit_test_files: [packages/financial-model/src/debt-capacity-packet.test.ts, packages/financial-model/src/debt-capacity-runs.test.ts, packages/financial-model/src/adopted-debt-capacity.test.ts, packages/financial-core/src/debt-capacity.test.ts]
gold_case_ids: [c04-capacity-by-limit-independent-oracle, phased-capacity-independent-oracle, covenant-with-headroom-binds, joint-capacity-is-the-intersection-of-the-limits, sixty-breaks-the-covenant-in-the-adverse-case-as-informed, phasing-makes-sixty-fit-in-size, size-fits-but-a-five-year-profile-runs-out-of-cash-in-the-adverse-case, bndes-eight-years-keeps-cash-positive, plan-pays-scheduled-principal-without-refinancing, window-ends-with-the-seasonal-line-open, leverage-nets-cash-under-the-adopted-convention, absent-threshold-is-a-gap-not-a-default]
adversarial_case_ids: [tampered-envelope, two-informed-cases, silent-alternative, same-analysis-twice, limit-names-unknown-rule, rule-in-two-limits, rule-left-out, another-basis, free-result-in-request, fabricated-grant-in-result]
e2e_scenario_ids: [domain:c04-capacity-by-limit-independent-oracle]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: [analyze-investment-project]
reference_data_keys: []
calculation_ids: [financial.debt_capacity, financial.debt_capacity_fixed_review]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [assess-debt-capacity-2026-10-19-v2-consistency]
adversarial_run_ids: [assess-debt-capacity-2026-10-19-v2-adversarial]
gold_run_ids: [assess-debt-capacity-2026-10-19-v2-gold]
---

# Objetivo
Dizer quanto de dívida nova a companhia aguenta tomar, em tamanho e em perfil, com o limite que prende e a data em que prende, e o que muda para caber: valor, cronograma ou estrutura da dívida. Havendo investimento, a economia dele é analisada antes, pelo método do investimento; capacidade não justifica projeto.

# Produto
Pacote de capacidade: para o cronograma informado e para cada alternativa adotada (faseamento, outra estrutura), o maior valor que cabe sob cada limite adotado (covenant com folga, faixa de mercado, cobertura de juros) e o limite que prende; o valor pedido revisado em alavancagem máxima e data, menor caixa e data e cobertura de juros mínima, no caso base e no adverso; e o plano vigente conferido, ano a ano, entre amortização programada e caixa depois dos juros, sem presumir refinanciamento.

# Quando ativar
- Quanto de dívida cabe, até quanto alavancar ou se a capacidade alegada por um banco faz sentido.
- Capacidade para capex, aquisição, dividendo ou outro uso; a destinação define o perfil necessário.

# Quando não ativar
- Multiplicar o EBITDA de chegada por um múltiplo do setor não é este procedimento.
- Escolher o banco ou montar o financiamento é estrutura de capital e comparação de propostas.

# Inputs mínimos e substitutos
- Projeção da companhia sem a dívida nova até a amortização final relevante: EBITDA na definição do covenant, arrendamentos, giro, manutenção, imposto e dívida vigente com juros e amortização por período.
- O uso e o cronograma: desembolso por período e, havendo projeto, o resultado e o giro que ele traz por período.
- Limites adotados com origem: covenant vigente ou esperado e a folga que a casa preserva; faixa de mercado acima da qual preço e apetite pioram para o perfil; cobertura de juros mínima; caixa mínimo quando a política existir.
- Estruturas a testar: taxa, carência, amortização e periodicidade de cada uma.
- Caso adverso adotado (por exemplo, EBITDA 15% menor). Sem caso adverso, a capacidade é declarada só para o base.

# Sequência operacional
1. [human_judgment] Enquadrar a pergunta :: Separar o uso, o cronograma e a decisão; se há projeto, conferir antes o retorno pelo método do investimento | evidence: base autorizada, fontes e versões
2. [deterministic] Projetar a companhia :: Companhia com o plano vigente e a dívida nova em escala com o uso, base e adverso, até a amortização final relevante | evidence: base autorizada, fontes e versões
3. [deterministic] Medir a capacidade :: Maior valor que respeita todas as regras ao mesmo tempo, em todas as datas e cenários; o limite que prende é o primeiro a falhar no valor seguinte, com data e cenário; o máximo de cada limite isolado fica como diagnóstico | evidence: base autorizada, fontes e versões
4. [deterministic] Revisar o valor pedido :: Alavancagem máxima e data, menor caixa e data e cobertura de juros, no base e no adverso, com o limite que falha | evidence: base autorizada, fontes e versões
5. [deterministic] Testar alternativas :: Faseamento e estruturas adotadas, cada uma completa na mesma base; tamanho e perfil separados | evidence: base autorizada, fontes e versões
6. [deterministic] Conferir o plano vigente :: Amortização programada contra caixa depois dos juros, ano a ano, sem dívida nova | evidence: base autorizada, fontes e versões
7. [human_judgment] Concluir sob condições :: Quanto cabe e em que cronograma; o perfil necessário; o que muda para caber; peso entre segurança e crescimento | evidence: base autorizada, fontes e versões
8. [human_judgment] Devolver e continuar :: Leitura em duas frases, números por limite e por estrutura, achados fora do pedido que mudam a resposta, e o que pedir à engenharia ou aos credores | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Cada limite é uma restrição afim na dívida nova dentro de regiões explícitas de imposto e de caixa; a capacidade de um limite é o maior valor, no quantum adotado, que respeita todas as suas restrições em todas as datas e cenários. A capacidade total é a interseção de todos os limites ao mesmo tempo, calculada pelo motor; o menor dos máximos por limite só coincide com ela quando os conjuntos viáveis se cruzam, e um limite que exige dívida mínima pode tornar a interseção vazia.
- O limite que prende é o primeiro a falhar no valor seguinte ao máximo, com data e cenário.
- Alavancagem = (dívida, inclusive a linha sazonal em aberto na data, menos caixa) sobre o EBITDA na definição do covenant, com o caixa descontado pela convenção adotada no cenário (quando ela não admite caixa negativo, caixa negativo não reduz a dívida); a alavancagem máxima apresentada é a mesma que o covenant testa; cobertura de juros = EBITDA sobre juros pagos no período.
- A dívida nova desembolsa com o uso; juros pela aproximação anual de saldo médio quando adotada, declarada como tal; o imposto é recalculado com os juros novos.
- Pagar parte do uso com caixa em vez de dívida não muda a alavancagem líquida: o covenant mede dívida líquida.
- Plano vigente: amortização programada da dívida existente contra caixa disponível depois dos juros, ano a ano; o que não se paga depende de refinanciamento e isso é dito.
- Janela que termina com dívida rotativa em aberto é declarada como janela de calibragem, não como liquidação completa.
- Precisão: aritmética decimal de alta precisão; capacidade no quantum adotado, arredondada para baixo.

# Julgamentos permitidos
- Recomendar faseamento, estrutura ou tamanho menor sob condições, com o número de cada um.
- Folga preservada sobre o covenant e faixa de mercado são referências da casa e de mercado, declaradas como tais, não cláusulas.
- Peso entre segurança e crescimento quando o projeto não paga o capital ou o caixa fica negativo no adverso.

# Perguntas que mudam o trabalho
- O cronograma da obra pode ir para outro período?
- Há linha de longo prazo de fomento elegível para o projeto?
- Os credores aceitariam prazo maior ou amortização mais pesada no fim?

# Red flags
- Múltiplo do setor sobre o EBITDA de chegada.
- Medir no ano em que o resultado chega quando o pico é antes.
- Propor pagar com caixa para reduzir a alavancagem.
- Tamanho que cabe com perfil que deixa o caixa negativo no adverso.
- Plano vigente presumido pago sem conferir amortização contra caixa.

# Stop conditions
- Limite sem valor adotado fica sem capacidade e a lacuna é declarada; nunca se assume limite padrão.
- Sem projeção até a amortização final relevante, a capacidade é declarada só para a janela adotada.
- Não declarar aprovação de crédito nem preço garantido; o pacote não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: debt-capacity-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- cases (array, required): Cada caso com capacidade por limite, limite que prende, revisão do valor pedido por cenário e conferência do plano
- comparison (object, required): Casos em que o valor pedido cabe e o caso de maior capacidade
- exclusions (array, required): Aprovação de crédito, preço não linear, certificação de caixa intraperíodo, retorno do investimento, liberação de método
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- Segunda linha de R$ 60 milhões em 2S27 e 1S28: cabem cerca de R$ 55 milhões, presos pelo covenant com folga em 2028; com R$ 60 milhões a alavancagem vai a 2,42x no base e 3,12x com EBITDA 15% menor, rompendo o covenant. Faseando em 2028 e 2029 cabem cerca de R$ 80 milhões e os R$ 60 milhões ficam em 1,88x e 2,58x. Em tamanho cabe; em perfil, cinco anos com carência deixam o caixa negativo no adverso, e BNDES de oito anos mantém o caixa positivo. Pagar parte com caixa não muda a alavancagem líquida.
## Ruim
- "Com EBITDA de R$ 60 milhões e múltiplo de 3x, cabem R$ 180 milhões."
- "Em 2030 a alavancagem fica abaixo de 1,5x; paguem metade com caixa para reduzir risco."

# Testes
## Unit
- packages/financial-model/src/debt-capacity-packet.test.ts: capacidade por limite, revisão, plano, contra o oráculo.
- packages/financial-model/src/adopted-debt-capacity.test.ts e packages/financial-core/src/debt-capacity.test.ts: leitor adotado e motor.
## Gold
- c04-capacity-by-limit-independent-oracle, phased-capacity-independent-oracle, covenant-with-headroom-binds, joint-capacity-is-the-intersection-of-the-limits, sixty-breaks-the-covenant-in-the-adverse-case-as-informed, phasing-makes-sixty-fit-in-size, size-fits-but-a-five-year-profile-runs-out-of-cash-in-the-adverse-case, bndes-eight-years-keeps-cash-positive, plan-pays-scheduled-principal-without-refinancing, window-ends-with-the-seasonal-line-open, leverage-nets-cash-under-the-adopted-convention, absent-threshold-is-a-gap-not-a-default.
## Adversarial
- Base adulterada, dois casos informados, alternativa sem descrição, mesma análise duas vezes, limite com regra inexistente, regra em dois limites, regra fora de qualquer limite, outra base, número livre no pedido e concessão fabricada no resultado são recusados.
## Aceitação
- Reproduzir o caso de calibração pelo oráculo independente sem alterar seus scripts.
- Executar a conversa da ficha C04 turno a turno pela interface real; guardar plano, versões, cálculo, resposta, custo e latência.

# Evidência
## Hierarquia
- Escrituras, contratos e projeção adotada; objeto de mercado para a faixa de alavancagem.
- Ficha C04 e seu oráculo como calibração independente, nunca como dado de outra companhia.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número do pacote abre até o operando adotado, sua origem e sua versão.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O decisor precisa saber se o uso cabe como está e, se não cabe, o que mudar: valor, cronograma ou estrutura. A resposta separa tamanho de perfil e diz onde o limite prende, com a data.

## N2. Árvore de decisão
- Cabe no cronograma informado com folga no adverso: seguir; o perfil sai da estrutura que mantém o caixa positivo no adverso.
- Não cabe no cronograma informado, cabe faseado: propor o faseamento com o número de cada um.
- Cabe em tamanho, não em perfil: carência e prazo maiores ou tamanho menor.
- O plano vigente não se paga sem refinanciar: dizer isso antes de qualquer dívida nova.

## N3. Suficiência por conclusão
- Para medir o tamanho são necessários projeção, dívida vigente e limites adotados.
- Para o perfil, as estruturas a testar e o caso adverso.
- O que faltar vira lacuna declarada e o restante segue calculado.

## N4. Voz e três níveis de afirmação
Fato, leitura e recomendação separados; folga e faixa de mercado como referências, não cláusulas. Sem slogan, metáfora, veredito binário ou certeza sobre o credor.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Leitura: quanto cabe, em que cronograma e com que perfil.
2. Onde o limite prende, com a data e o número no base e no adverso.
3. O faseamento e as estruturas, cada um com o que compra.
4. O plano vigente contra o caixa.
5. Condições e peso entre segurança e crescimento.

## T2. Peças
Tabela de capacidade por limite e cronograma; tabela de perfil por estrutura com alavancagem máxima e menor caixa no base e no adverso; amortização contra caixa por ano. Gráfico com um elemento em foco, fundo branco, sem vermelho.

# Regra
## R1. Precedência
Cláusula vigente prevalece; folga e faixa de mercado só como referência adotada; premissa da casa marcada.

## R2. Alternativas
Cada alternativa é uma análise completa na mesma base; nenhuma edita o caso informado.

## R3. Calendário
O horizonte vai até a amortização final relevante; pico no ano de chegada do resultado não substitui o pico real.

# Qualidade
## Q1. Teste do MD
O projeto foi analisado antes da capacidade? O pico está na data certa? Tamanho e perfil estão separados? O plano vigente foi conferido? Pagar com caixa foi tratado corretamente? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Tamanho e perfil
Caber em alavancagem não garante pagar no prazo: a mesma dívida com amortização curta pode deixar o caixa negativo no adverso, enquanto uma linha longa com carência mantém a companhia líquida.

## Onde o limite prende
O pico costuma vir antes do resultado do projeto, quando o desembolso já aconteceu e o EBITDA ainda não cresceu. Faseamento move o desembolso para depois do crescimento e libera capacidade.

## Caixa e dívida líquida
O covenant mede dívida líquida; usar caixa em vez de dívida reduz a dívida e o caixa na mesma medida e não muda o índice.

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
      "id": "capacity.decision-framing",
      "version": "2026.10.19-v2",
      "kind": "narrative",
      "title": "Enquadramento profissional da capacidade de dívida",
      "inputs": {
        "id": "capacity.framing-input",
        "version": "2026.10.19-v2",
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
        "id": "capacity.framing-output",
        "version": "2026.10.19-v2",
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
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO decisor precisa saber se o uso cabe como está e, se não cabe, o que mudar: valor, cronograma ou estrutura. A resposta separa tamanho de perfil e diz onde o limite prende, com a data.\n\nN2. Árvore de decisão\n- Cabe no cronograma informado com folga no adverso: seguir; o perfil sai da estrutura que mantém o caixa positivo no adverso.\n- Não cabe no cronograma informado, cabe faseado: propor o faseamento com o número de cada um.\n- Cabe em tamanho, não em perfil: carência e prazo maiores ou tamanho menor.\n- O plano vigente não se paga sem refinanciar: dizer isso antes de qualquer dívida nova.\n\nN3. Suficiência por conclusão\n- Para medir o tamanho são necessários projeção, dívida vigente e limites adotados.\n- Para o perfil, as estruturas a testar e o caso adverso.\n- O que faltar vira lacuna declarada e o restante segue calculado.\n\nN4. Voz e três níveis de afirmação\nFato, leitura e recomendação separados; folga e faixa de mercado como referências, não cláusulas. Sem slogan, metáfora, veredito binário ou certeza sobre o credor.\n\nTemplate\nT1. Uma leitura útil, com evidência aprofundável\n1. Leitura: quanto cabe, em que cronograma e com que perfil.\n2. Onde o limite prende, com a data e o número no base e no adverso.\n3. O faseamento e as estruturas, cada um com o que compra.\n4. O plano vigente contra o caixa.\n5. Condições e peso entre segurança e crescimento.\n\nT2. Peças\nTabela de capacidade por limite e cronograma; tabela de perfil por estrutura com alavancagem máxima e menor caixa no base e no adverso; amortização contra caixa por ano. Gráfico com um elemento em foco, fundo branco, sem vermelho."
    },
    {
      "id": "capacity.decision-packet",
      "version": "2026.10.19-v2",
      "kind": "rule",
      "title": "Medir a capacidade por limite e revisar o perfil",
      "authority": "house",
      "statement": "Medir o maior valor que cabe sob cada limite adotado e o que prende, revisar o valor pedido em alavancagem, caixa e cobertura em cada cenário, testar faseamento e estruturas e conferir o plano vigente contra o caixa, sem aprovar crédito, sem recomendar e sem adotar ou publicar por cálculo.",
      "inputs": {
        "id": "debt-capacity-packet-input",
        "version": "2026.10.19-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "debt-capacity-packet-input.v1"
                ]
              }
            },
            "question": {
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
                    "label": {
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
                          "type": "string"
                        }
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
                          "maximumAmount": {
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
                          "monetaryQuantum": {
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
                          "fixedReviewAmount": {
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
                          "horizonMode": {
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
                          "newDebtFinalPaymentDate": {
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
                          "existingDebtFinalPaymentDates": {
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
                                  "scenario": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "terms": {
                                    "required": true,
                                    "value": {
                                      "type": "object",
                                      "fields": {
                                        "openingAvailableCash": {
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
                                        "cashNetting": {
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
                                        "includeNewAccruedInterestInDebt": {
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
                                        "affine": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "ebitda": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "covenantEbitdaAdjustment": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "nonCashEbitdaBridge": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "cashLeasePayments": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "changeInWorkingCapital": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "maintenanceCapex": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "growthCapex": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "taxableBaseBeforeNewDebtInterest": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "otherExistingFinancingCashAvailable": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                              "capitalCashAvailable": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "fixed": {
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
                                                    "perUnitNewDebt": {
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
                                        "money": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "existingCashInterest": {
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
                                              "existingCashPrincipalPaid": {
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
                                              "existingDebtForRatio": {
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
                                        "ratios": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "cashTaxRate": {
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
                                        "conventions": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "lossTaxTreatment": {
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
                                              "newDebtTaxDeduction": {
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
                                              "cfadsGrowthCapexTreatment": {
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
                                        "cfadsDefinitionAnchors": {
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
                                        "newFinancing": {
                                          "required": true,
                                          "value": {
                                            "type": "object",
                                            "fields": {
                                              "ratios": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "drawAtStart": {
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
                                                    "drawAtEnd": {
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
                                                    "principalPaidAtEnd": {
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
                                                    "interestFactorOnOpeningAndStartDraw": {
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
                                                    "interestFactorOnEndDraw": {
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
                                                    "interestFactorCreditOnEndAmortization": {
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
                                                    "withheldCostPerUnitDraw": {
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
                                              "conventions": {
                                                "required": true,
                                                "value": {
                                                  "type": "object",
                                                  "fields": {
                                                    "factorConvention": {
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
                                                    "paysAccruedInterest": {
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
                                                    "unpaidInterestBase": {
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
                                  "rules": {
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
                                          "threshold": {
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
                            "ruleIds": {
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
                    }
                  }
                }
              }
            }
          }
        }
      },
      "outputs": {
        "id": "debt-capacity-packet-output",
        "version": "2026.10.19-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "debt-capacity-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.19-v1"
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
            "cases": {
              "required": true,
              "value": {
                "type": "array",
                "items": {
                  "type": "object",
                  "fields": {
                    "caseId": {
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
                    "label": {
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
                          "type": "string"
                        }
                      }
                    },
                    "resultStatus": {
                      "required": true,
                      "value": {
                        "type": "enum",
                        "values": [
                          "missing_inputs",
                          "partial_composition"
                        ]
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
                            "capacity": {
                              "required": true,
                              "value": {
                                "type": "union",
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
                            "status": {
                              "required": true,
                              "value": {
                                "type": "union",
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
                    "capacity": {
                      "required": true,
                      "value": {
                        "type": "union",
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
                    "capacityStatus": {
                      "required": true,
                      "value": {
                        "type": "union",
                        "variants": [
                          {
                            "type": "enum",
                            "values": [
                              "calculated",
                              "calibration_only",
                              "no_feasible_amount"
                            ]
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "binding": {
                      "required": true,
                      "value": {
                        "type": "union",
                        "variants": [
                          {
                            "type": "object",
                            "fields": {
                              "limitId": {
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
                              "scenarioId": {
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
                    "bindingLimitId": {
                      "required": true,
                      "value": {
                        "type": "union",
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
                    "boundedBySearchDomain": {
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
                    "calibrationOnly": {
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
                    "review": {
                      "required": true,
                      "value": {
                        "type": "union",
                        "variants": [
                          {
                            "type": "object",
                            "fields": {
                              "amount": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "fits": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "failingLimitIds": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
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
                                      "peakLeverage": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "value": {
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
                                            }
                                          }
                                        }
                                      },
                                      "minimumCash": {
                                        "required": true,
                                        "value": {
                                          "type": "object",
                                          "fields": {
                                            "value": {
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
                                            }
                                          }
                                        }
                                      },
                                      "minimumInterestCoverage": {
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
                                                    "type": "string"
                                                  }
                                                },
                                                "date": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "date"
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
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "plan": {
                      "required": true,
                      "value": {
                        "type": "union",
                        "variants": [
                          {
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
                                "scheduledExistingPrincipal": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "cashAfterInterest": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "paysWithoutRefinancing": {
                                  "required": true,
                                  "value": {
                                    "type": "boolean"
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
                    }
                  }
                }
              }
            },
            "comparison": {
              "required": true,
              "value": {
                "type": "object",
                "fields": {
                  "informedCaseId": {
                    "required": true,
                    "value": {
                      "type": "string"
                    }
                  },
                  "requestedFitsIn": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    }
                  },
                  "largestCapacityCaseId": {
                    "required": true,
                    "value": {
                      "type": "union",
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
                    "credit_approval",
                    "nonlinear_pricing",
                    "intraperiod_cash_certification",
                    "investment_return",
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
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareDebtCapacityPacket",
        "version": "2026.10.19-v1"
      },
      "dependencies": [
        {
          "id": "capacity.decision-framing",
          "version": "2026.10.19-v2"
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
        "packages/credit-playbook/knowledge/reviews/runs/assess-debt-capacity-2026-10-19-v2-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/assess-debt-capacity-2026-10-19-v2-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/assess-debt-capacity-2026-10-19-v2-consistency/run.json"
      ]
    }
  ]
}
```
