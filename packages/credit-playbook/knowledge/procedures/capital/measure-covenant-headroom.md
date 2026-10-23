---
id: measure-covenant-headroom
version: 2026.10.23-v1
maturity: implemented
title_pt: Medir covenants e folga na data de apuração
title_en: Measure Covenant Headroom
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-23
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareCovenantHeadroomPacket
result_contract: covenant-headroom-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: covenant-headroom-packet.v1
unit_test_files: [packages/financial-model/src/covenant-headroom-packet.test.ts, packages/financial-model/src/covenant-headroom-runs.test.ts, packages/financial-core/src/covenant-headroom.test.ts]
gold_case_ids: [december-by-the-indenture-definition, headroom-in-ebitda-and-net-debt-to-the-covenant, reverse-test-on-the-unrealized-second-half, board-policy-binds-first, adverse-case-in-december, a-larger-season-in-december, season-weighs-half-a-turn-at-the-test-date, december-2027-base-and-adverse, managerial-june-reading-is-a-contrast, original-indenture-limit-is-superseded, breach-is-not-automatic-and-the-chain-is-named, unwritten-policy-definition-is-a-question, turn-two-policy-on-managerial-ebitda, absent-cash-is-a-gap-not-a-default]
adversarial_case_ids: [tampered-envelope, free-result-in-request, fabricated-grant-in-result, headline-is-a-contrast, measurement-names-unknown-limit, effect-across-dates, test-without-limit, unrealized-after-the-test-date, duplicate-measurement, managerial-june-promoted-to-a-test, superseded-limit-promoted-to-a-test, policy-dropped-from-every-test, figure-read-in-another-scenario]
e2e_scenario_ids: [domain:december-by-the-indenture-definition]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: []
reference_data_keys: []
calculation_ids: [financial.covenant_headroom]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [measure-covenant-headroom-2026-10-23-v1-consistency]
adversarial_run_ids: [measure-covenant-headroom-2026-10-23-v1-adversarial]
review_ids: []
gold_run_ids: [measure-covenant-headroom-2026-10-23-v1-gold]
---

# Objetivo
Dizer onde a companhia está contra cada covenant financeiro e contra a política do próprio conselho, na data em que o teste acontece e pela definição escrita: o índice, a folga em reais de EBITDA e de dívida, quanto do período que ainda não aconteceu pode piorar antes de romper, e o que uma quebra dispara.

# Produto
Pacote de covenant: para cada apuração (data e cenário) o índice pela definição escrita, componente a componente; a folga em EBITDA e em dívida líquida contra cada limite adotado; o teste reverso sobre o EBITDA ainda não realizado; o limite que aperta primeiro; o adverso, a safra maior, a data seguinte e o efeito sazonal na data; leituras que não são o teste (data errada, definição gerencial, escritura sem aditamento) marcadas como contraste; a consequência da quebra e a cadeia de cross-default; e a pergunta que só a companhia responde quando a definição da política não está escrita.

# Quando ativar
- Como a companhia está contra os covenants, qual a folga, se corre risco de romper.
- Folga na data de apuração de um contrato específico, com projeção até ela.
- Política interna de alavancagem do conselho medida ao lado do contrato.

# Quando não ativar
- Montar a tabela de dívida e as definições é a demanda da tabela de dívida, que esta usa.
- Negociar waiver ou covenant em risco com ações antes da data é a demanda de covenant em risco.
- Covenant de incorrência (testado ao tomar dívida nova) é cálculo pró-forma de capacidade.

# Inputs mínimos e substitutos
- Definição vigente de cada covenant: escritura e aditamento, componente a componente (dívida, caixa, EBITDA e o que ele exclui).
- Política do conselho com o limite e a ata; a definição de EBITDA que ela usa, quando escrita.
- Dívida, caixa e EBITDA dos últimos doze meses em cada data de apuração e cenário, da projeção adotada; a parte do EBITDA ainda não realizada na data da leitura.
- Cenário adverso e variações relevantes (safra, sazonalidade) adotados.
- Consequência da quebra pela escritura e o mapa de cross-default da tabela de dívida.

# Sequência operacional
1. [human_judgment] Enquadrar :: Quais contratos têm covenant financeiro, em que texto vigente, e qual a próxima data de apuração | evidence: escrituras e aditamentos adotados
2. [deterministic] Medir na data :: Índice pela definição escrita, componente a componente, em cada data e cenário | evidence: projeção e definições adotadas
3. [deterministic] Folga e teste reverso :: Folga em EBITDA e em dívida contra cada limite; parte do EBITDA não realizado que pode ser perdida antes de cada limite | evidence: projeção adotada
4. [deterministic] Política do conselho :: Segundo limite, medido na sua própria definição; o que aperta primeiro | evidence: ata adotada
5. [deterministic] Cenários e efeito na data :: Adverso, variação sazonal, data seguinte e a diferença que a sazonalidade faz na data | evidence: cenários adotados
6. [deterministic] Contrastes :: Leituras que não são o teste, marcadas como tal | evidence: base adotada
7. [human_judgment] Consequência :: O que a quebra dispara pela escritura e a cadeia de cross-default | evidence: escritura e tabela de dívida
8. [human_judgment] Devolver e perguntar :: Índice, folga em reais, o que aperta primeiro, a cadeia e a pergunta que muda a conta | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Dívida líquida = dívida pela definição − caixa pela definição; EBITDA da definição = EBITDA reportado dos últimos doze meses + ajustes que a definição manda fazer (por exemplo, menos pagamentos de arrendamento).
- Índice = dívida líquida / EBITDA da definição; com EBITDA não positivo o índice não é calculado e o teste é tratado como rompido.
- Folga em EBITDA = EBITDA − dívida líquida / limite; folga em dívida = limite × EBITDA − dívida líquida.
- Teste reverso = folga em EBITDA / EBITDA ainda não realizado na data da leitura.
- O limite que aperta primeiro é o de menor folga em EBITDA; o pior ponto é o de menor folga entre todas as apurações de teste.
- Efeito na data = índice com o efeito − índice sem o efeito, na mesma data.
- Enquadramento: cada limite é declarado em vigor ou superado, com as datas em que é testado. Apuração de teste só existe para limite em vigor e numa data de teste dele; limite superado (escritura sem aditamento) só aparece como contraste; todo limite em vigor é testado ao menos uma vez, de modo que a política não some da resposta.
- A política aperta primeiro quando, na data da apuração principal, a menor folga da política é menor que a menor folga contratual, inclusive quando a política é medida numa apuração própria pela sua definição.
- Precisão: aritmética decimal de alta precisão, sem arredondamento intermediário.

# Julgamentos permitidos
- Ler a folga em reais e no período que ainda não aconteceu, não só em "x".
- Trazer a política do conselho como limite que aperta antes, quando for o caso.
- Apontar um efeito de calendário (por exemplo, resgate antes da entrega das demonstrações) como leitura, sem contar com ele no plano.

# Perguntas que mudam o trabalho
- Qual EBITDA a política do conselho usa, o gerencial ou o da CVM 156?
- Há aditamento em negociação que muda a definição ou o limite?
- A apuração é anual, semestral ou trimestral, e sobre qual demonstração?

# Red flags
- Usar a escritura sem o aditamento.
- Medir em junho ou pelo EBITDA gerencial quando o contrato testa em dezembro pelo da CVM 156.
- Folga só em "x".
- Ignorar a política do conselho.
- Tratar a quebra como vencimento automático.

# Stop conditions
- Número sem contribuição adotada vira lacuna; nenhuma apuração é montada com valor presumido.
- Definição da política não escrita vira pergunta; o limite continua medido, e a definição usada fica declarada.
- O pacote não projeta, não negocia waiver, não aprova crédito e não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: covenant-headroom-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Apurações, testes por limite, efeitos, pior ponto, definições, perguntas abertas e consequência
- readings (object, required): Índice da apuração principal, folga por limite, o que aperta primeiro, pior ponto, contrastes e perguntas
- exclusions (array, required): Projeção, negociação de waiver, aprovação de crédito, liberação de método
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- O único covenant financeiro é o da debênture, de 3,0x pelo aditamento. Em dezembro, com o plano em execução, a alavancagem pela escritura fica em 2,2x: dívida líquida de R$ 113 milhões sobre EBITDA de R$ 51,5 milhões. A folga até 3,0x é de cerca de R$ 14 milhões de EBITDA; o EBITDA do segundo semestre teria de cair 53% para romper. A política do conselho, de 2,5x, aperta antes: a folga é de R$ 6 milhões, uma queda de 24% no semestre. Cerca de 0,5x da medição vem da safra na data. A quebra não é automática: a assembleia decide, e o Bradesco pode vencer a CCB pelo cross-default. A ata não diz qual EBITDA a política usa.
## Ruim
- "A alavancagem é de 1,7x, confortável em relação ao covenant de 3,0x." (data, EBITDA e definição errados; sem política, sem safra, sem folga em reais)

# Testes
## Unit
- packages/financial-core/src/covenant-headroom.test.ts: núcleo contra o oráculo da ficha.
- packages/financial-model/src/covenant-headroom-packet.test.ts: leitor adotado e pacote.
## Gold
- december-by-the-indenture-definition, headroom-in-ebitda-and-net-debt-to-the-covenant, reverse-test-on-the-unrealized-second-half, board-policy-binds-first, adverse-case-in-december, a-larger-season-in-december, season-weighs-half-a-turn-at-the-test-date, december-2027-base-and-adverse, managerial-june-reading-is-a-contrast, original-indenture-limit-is-superseded, breach-is-not-automatic-and-the-chain-is-named, unwritten-policy-definition-is-a-question, turn-two-policy-on-managerial-ebitda, absent-cash-is-a-gap-not-a-default.
## Adversarial
- Base adulterada, resultado livre no pedido, concessão fabricada, apuração principal que é contraste, limite inexistente, efeito entre datas diferentes, teste sem limite, EBITDA não realizado depois da data, apuração duplicada, leitura gerencial de junho promovida a teste, limite superado promovido a teste, política retirada de todos os testes e número lido em outro cenário são recusados.
## Aceitação
- Reproduzir o caso de calibração pelo oráculo independente sem alterar seus scripts.
- Executar a conversa da ficha C12 turno a turno pela interface real; guardar plano, versões, cálculo, resposta, custo e latência.

# Evidência
## Hierarquia
- Escritura e aditamento vigente; ata do conselho; projeção adotada; tabela de dívida.
- Ficha C12 e seu oráculo como calibração independente, nunca como dado de outra companhia.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número do pacote abre até o operando adotado, sua origem e sua versão.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O CFO precisa saber quanto pode piorar antes de um problema com o credor ou com o próprio conselho, e o que acontece se piorar. A resposta traduz a folga em reais e no período que ainda vem.

## N2. Árvore de decisão
- Folga confortável no contrato e na política, também no adverso: acompanhar.
- Política aperta antes do contrato: dizer isso primeiro e perguntar a definição dela.
- Folga curta no adverso: encaminhar para a demanda de covenant em risco, com ações antes da data.
- Rompido na projeção: consequência pela escritura e cadeia de cross-default antes de qualquer ação.

## N3. Suficiência por conclusão
- Para o índice: definição vigente, dívida, caixa e EBITDA na data.
- Para o teste reverso: a parte do EBITDA ainda não realizada.
- Para a política: o limite e, idealmente, a definição; sem ela, pergunta.

## N4. Voz e três níveis de afirmação
Fato (o que a escritura e a ata dizem), leitura (o que a folga significa) e recomendação (o que fazer antes da data) separados. Sem veredito binário nem certeza sobre o credor.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Qual contrato tem covenant e em que texto.
2. O índice na data, pela definição, com dívida líquida e EBITDA.
3. A folga em reais e no período que ainda não aconteceu, contra o contrato e contra a política.
4. Adverso, sazonalidade e a data seguinte.
5. O número gerencial que engana e por quê.
6. Se romper: o que dispara e a cadeia.
7. A pergunta que muda a conta.

## T2. Peças
Quadro por data e cenário com dívida líquida, EBITDA da escritura, índice e folga até cada limite. Gráfico com um elemento em foco, fundo branco, sem vermelho.

# Regra
## R1. Precedência
Aditamento prevalece sobre a escritura original; a definição escrita prevalece sobre a leitura gerencial.

## R2. Política e contrato
A política do conselho é um segundo limite, nunca o contrato; cada um na sua definição.

## R3. Calendário
A apuração acontece na data do contrato; ler em outra data é contraste, não teste.

# Qualidade
## Q1. Teste do MD
A definição é a do aditamento? A data é a de apuração? A folga está em reais e no período restante? A política foi trazida? A quebra foi tratada como não automática quando é? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Folga em reais e no período que falta
"2,2x contra 3,0x" não diz ao CFO quanto o resultado pode piorar. A folga em reais de EBITDA, e a parte do semestre que ainda não aconteceu, dizem.

## A política do conselho
Conselhos costumam aprovar um teto abaixo do covenant. Ele aperta antes e é o primeiro a ser lembrado por quem lê a ata.

## Sazonalidade na data
Quando a apuração cai no pico do giro, a linha sazonal em aberto pesa no índice. Medir fora do pico é argumento de negociação, não premissa do plano.

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
      "id": "covenant.request-framing",
      "version": "2026.10.23-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional do covenant",
      "inputs": {
        "id": "covenant.framing-input",
        "version": "2026.10.23-v1",
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
        "id": "covenant.framing-output",
        "version": "2026.10.23-v1",
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
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO CFO precisa saber quanto pode piorar antes de um problema com o credor ou com o próprio conselho, e o que acontece se piorar. A resposta traduz a folga em reais e no período que ainda vem.\n\nN2. Árvore de decisão\n- Folga confortável no contrato e na política, também no adverso: acompanhar.\n- Política aperta antes do contrato: dizer isso primeiro e perguntar a definição dela.\n- Folga curta no adverso: encaminhar para a demanda de covenant em risco, com ações antes da data.\n- Rompido na projeção: consequência pela escritura e cadeia de cross-default antes de qualquer ação.\n\nN3. Suficiência por conclusão\n- Para o índice: definição vigente, dívida, caixa e EBITDA na data.\n- Para o teste reverso: a parte do EBITDA ainda não realizada.\n- Para a política: o limite e, idealmente, a definição; sem ela, pergunta.\n\nN4. Voz e três níveis de afirmação\nFato (o que a escritura e a ata dizem), leitura (o que a folga significa) e recomendação (o que fazer antes da data) separados. Sem veredito binário nem certeza sobre o credor."
    },
    {
      "id": "covenant.packet",
      "version": "2026.10.23-v1",
      "kind": "rule",
      "title": "Medir covenant e política pela definição escrita, com folga em reais",
      "authority": "house",
      "statement": "Medir cada covenant e a política do conselho pela definição escrita na data de apuração, com folga em EBITDA e em dívida, teste reverso sobre o período não realizado, cenários, efeito sazonal, contrastes e consequência, sem projetar, sem negociar waiver, sem aprovar crédito e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareCovenantHeadroomPacket",
        "version": "2026.10.23-v1"
      },
      "inputs": {
        "id": "covenant-headroom-packet-input",
        "version": "2026.10.23-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "covenant-headroom-packet-input.v1"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "headlineMeasurementId": {
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
      "outputs": {
        "id": "covenant-headroom-packet-output",
        "version": "2026.10.23-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "covenant-headroom-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.23-v1"
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
                        "adopted-covenant-headroom.v1"
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
                  "readingDate": {
                    "required": true,
                    "value": {
                      "type": "date"
                    }
                  },
                  "headroom": {
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
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "definitions": {
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
                          "definition": {
                            "required": true,
                            "value": {
                              "type": "union",
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
                          "limitId": {
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
                                "ebitda_definition_not_written"
                              ]
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
                            "type": "union",
                            "variants": [
                              {
                                "type": "enum",
                                "values": [
                                  "automatic",
                                  "non_automatic"
                                ]
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "process": {
                          "required": true,
                          "value": {
                            "type": "union",
                            "variants": [
                              {
                                "type": "string"
                              },
                              {
                                "type": "null"
                              }
                            ]
                          }
                        },
                        "crossDefault": {
                          "required": true,
                          "value": {
                            "type": "union",
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
                  "exclusions": {
                    "required": true,
                    "value": {
                      "type": "array",
                      "items": {
                        "type": "enum",
                        "values": [
                          "projection",
                          "contract_extraction",
                          "waiver_negotiation",
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
                      "headline": {
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
                            "date": {
                              "required": true,
                              "value": {
                                "type": "date"
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
                            }
                          }
                        }
                      },
                      "policyBindsFirst": {
                        "required": true,
                        "value": {
                          "type": "boolean"
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
                      },
                      "contrasts": {
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
                    "projection",
                    "waiver_negotiation",
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
          "id": "covenant.request-framing",
          "version": "2026.10.23-v1"
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
        "packages/credit-playbook/knowledge/reviews/runs/measure-covenant-headroom-2026-10-23-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/measure-covenant-headroom-2026-10-23-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/measure-covenant-headroom-2026-10-23-v1-consistency/run.json"
      ]
    }
  ]
}
```
