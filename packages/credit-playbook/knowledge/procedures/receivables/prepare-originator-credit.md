---
id: prepare-originator-credit
version: 2026.10.30-v1
maturity: candidate
title_pt: Preparar a análise do cedente para o comitê
title_en: Prepare the Cedent Analysis for the Credit Committee
role: financial_analysis
blueprint_stage: 4
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-30
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareOriginatorCreditPacket
result_contract: originator-case-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: originator-case-packet.v1
unit_test_files: [packages/financial-core/src/receivables/originator-credit.test.ts, packages/financial-core/src/receivables/originator-financials.test.ts, packages/financial-core/src/receivables/originator-reconciliation.test.ts, packages/financial-model/src/originator-credit-review.test.ts, packages/financial-model/src/originator-case.test.ts]
gold_case_ids: [originator-credit-structured-gold]
adversarial_case_ids: [originator-credit-adoption-and-source-adversarial]
e2e_scenario_ids: [pending:originator-credit-native-product-journey]
cost_eval_ids: [deterministic:no-model-calls]
capability_availability: specified
capability_exposure: none
capability_allowed_uses: [internal_validation]
capability_allowed_evidence_regimes: [project_private]
capability_allowed_data_classes: [project_confidential, restricted_personal]
capability_allowed_source_classes: [project_context, provided_documents, house_method]
capability_allowed_provider_ids: []
capability_allowed_tool_ids: []
capability_provider_required: false
capability_maximum_effect: none
---

# Objetivo
Preparar o parecer para o comitê: cabe ou não cabe, até quanto, em qual prazo, sob quais condições e por quais razões. O comitê decide. O método nunca concede crédito nem autoriza a compra de um título.

# Produto
Dossiê do cedente com fontes e datas, receita e EBITDA de doze meses comparáveis, dívida utilizada e limites não utilizados separados, conciliação da carteira e da PDD, elegibilidade, concentração por grupo, classe pela régua da instituição, limite adicional e caixa sob estresse. Pendência material retém a classe e o limite sugerido.

# Quando ativar
- Pedido dirigido ao assessor para preparar a análise do cedente ou atualizar as condições de uma análise já confirmada.

# Quando não ativar
- Crédito já concedido é apenas relatado; a pessoa recusa a análise; pedido é de liberação de borderô ou compra de títulos.

# Inputs mínimos e substitutos
- schemaVersion (string, required): originator-case-packet-input.v1.
- question (string, required): pergunta de crédito.
- analysis (object, required): base imutável confirmada, escopo autorizado, tipo credit e seleção de todos os registros. Cada número documental conserva literal, trecho, documento, versão, hash, página ou seção, moeda, escala e representação. Pedido, exposição já usada, teto do fundo, data inicial e prazo são confirmados pela pessoa. Política, grupos econômicos e vínculo da carteira com a nova exposição são explícitos. Falta de informação gera lacuna, nunca zero.

# Sequência operacional
1. [deterministic] Conferir a base e as fontes :: Ler somente contribuições adotadas no escopo autorizado e conferir unidades, versões, período e entidade ; Número sem trecho ou escala não entra na conta
2. [deterministic] Reconciliar os demonstrativos :: Reconstituir receita bruta menos deduções, ativo e passivo, dívida utilizada e SCR de mesma data, faturamento mensal e curva ABC no mesmo universo ; Não comparar receita líquida com faturamento bruto
3. [deterministic] Reconstituir a carteira :: Identificar duplicatas pela chave do título, preservar vencimento original, aplicar exclusões na prioridade da instituição e reconciliar saldo inicial e movimentação até o saldo final ; Recompra não é pagamento do sacado
4. [deterministic] Aplicar a régua e os limites :: Usar a política confirmada do fundo e deduzir a exposição já tomada do teto total ; Sem política não há classe formal nem limite inventado
5. [deterministic] Testar prazo e caixa :: Ancorar os dias na data da operação; exigir cortes explícitos de caixa, inclusive no vencimento; testar o pedido integral, a capacidade sugerida e o cenário severo ; Não interpolar datas nem ocultar déficit
6. [deterministic] Preparar o parecer :: Mostrar a conta, as condições e o que impede concluir; reter classe e limite enquanto uma conciliação material estiver aberta ; Aprovação continua com o comitê

# Cálculos determinísticos
- Doze meses: exercício anterior menos período intermediário comparável anterior mais período intermediário atual. Não anualizar nove meses.
- Dívida ajustada: dívida bancária utilizada mais coobrigação adicional e dívida fiscal. Limite bancário não utilizado não é dívida. Caixa livre exclui caixa restrito.
- Elegibilidade: cada parcela tem uma única exclusão principal; a soma aceita mais exclusões fecha com a carteira única. Concentração usa grupo econômico confirmado.
- Carteira: saldo inicial mais emissão menos pagamento dos sacados, recompra, diluição e baixas. PDD: abertura mais adições menos reversões e utilização em baixas. Recuperação de perdas antigas é separada.
- Limite adicional: mínimo entre pedido, folga da classe, folga do regulamento, carteira adicional elegível e capacidade de caixa. Exposição anterior não é contada duas vezes.
- Cancelamento de nota não reduz automaticamente EBITDA pelo valor de face. Só calcular essa sensibilidade com impacto explicitamente confirmado como estimativa.

# Julgamentos permitidos
- Propor ligações entre fontes e condições para o comitê, sempre para confirmação. Nunca escolher a régua, atribuir uma classe por impressão ou ajustar EBITDA sem origem.

# Perguntas que mudam o trabalho
- Qual fundo, regulamento e régua da casa estão em vigor para este cedente?
- A carteira livre identificada suporta a exposição adicional, e o caixa já contém as obrigações existentes?
- Qual é a data de início, o prazo solicitado e quais cortes do caixa estão confirmados?

# Red flags
- Limite não utilizado somado à dívida, título duplicado, vencimento prorrogado ocultando atraso original, cessão anterior, nota cancelada, sacado relacionado, escala emprestada de outro documento, regra de outro fundo e solicitação que rompe o piso de caixa.

# Stop conditions
- Base ou seleção adulterada; entidade, período ou moeda incompatíveis; literal ausente no trecho; política ausente ou fora de vigência; fonte velha; conflito de duplicatas; conciliação material aberta; ausência de corte de caixa. Cada causa fica nomeada. Não emitir classe ou limite como conclusão válida nessa situação.

# Outputs
- schemaVersion (string, required): originator-case-packet.v1.
- executorVersion (string, required): versão do executor.
- kind (enum, required): tipo credit | values: credit
- question (string, required): pedido atendido.
- analysisId (string, required): identidade da análise confirmada.
- scope (object, required): trabalho, finalidade e versão da base autorizada.
- entityId (string, required): entidade da base.
- basisFingerprint (string, required): fingerprint da base confirmada.
- credit (object|null, required): demonstrativos recompostos, leituras numéricas, carteira, régua, limite, cenários, rastros e pendências; nulo quando falta registro adotado.
- registry (null, required): sempre nulo neste método.
- kit (null, required): sempre nulo neste método.
- gaps (array, required): lacunas impeditivas.
- bindings (array, required): decisões por registro.
- contributions (array, required): contribuições efetivamente lidas.
- status (enum, required): estado do pacote | values: framed, partial, prepared_for_human_review
- grantsExecution (boolean, required): falso.
- grantsPublication (boolean, required): falso.
- fingerprint (string, required): fingerprint do resultado.

# Exemplos
## Bom
- O prazo solicitado rompe a regra da casa e o caixa confirmado no vencimento. Mostrar os dois motivos e a conta, sem aprovar a operação.
## Ruim
- Aceitar mais dias porque a receita parece boa ou usar o caixa da data vizinha.

# Testes
## Unit
- Gabarito independente, duplicata conflitante, atraso original, escala, datas, perímetro, fundo, exposição ocupada, piso de caixa, estresse severo, conciliações abertas e base adulterada.
## Gold
- Caso sintético estruturado e oráculo de autoria independente, separados dos dados lidos pelo executor; conferir resultados e pendências nos testes declarados.
## Adversarial
- Base, seleção, fonte, versão, entidade, unidade ou data conflitantes são recusadas ou mantidas como lacuna; nunca completadas por suposição.
## Aceitação
- Leitura de arquivos nativos pelo modelo, confirmação, execução, página, resposta citada e atualização são gates separados e ainda não comprovados pelo teste de registros estruturados.

# Evidência
## Hierarquia
- Documento primário e sua versão, com trecho e data de corte; relatório de consulta recebido com identidade e data da consulta.
- Fato informado e vínculo confirmado pela pessoa, separados de regra da casa e estimativa.
## Regras
- Número calculado traz fórmula e operandos. Regra da instituição traz origem própria. Documento, fato informado, hipótese da casa, estimativa e conclusão calculada continuam distinguíveis; o modelo não faz a conta financeira.

# Limites declarados
- Candidato em implementação. Não publicado, sem perfil e sem liberação. Não consulta SCR nem bureau; examina os relatórios autorizados recebidos. Não estima preço de mercado sem fonte licenciada e não concede crédito.

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
      "version": "2026.10.30-v1",
      "dependencies": [],
      "tools": [],
      "effect": "none",
      "budget": {
        "maxModelCalls": 0,
        "maxDurationMs": 31000,
        "maxCostMinorUnits": 0,
        "currency": "BRL"
      },
      "rights": {
        "inheritSourceRestrictions": true,
        "purposes": [
          "case.analysis"
        ],
        "sourceClasses": [
          "provided.documents",
          "project.context",
          "house.method"
        ]
      },
      "competencies": [
        "receivables.originator"
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
      "evidence": [
        "packages/credit-playbook/knowledge/procedures/receivables/prepare-originator-credit.md"
      ],
      "id": "originator-credit.packet",
      "kind": "rule",
      "title": "Preparar a revisão sobre a base confirmada",
      "inputs": {
        "id": "originator-credit-packet-input",
        "version": "2026.10.30-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "originator-case-packet-input.v1"
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
                  "kind": {
                    "required": true,
                    "value": {
                      "type": "enum",
                      "values": [
                        "credit"
                      ]
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
                  "order": {
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
                  "records": {
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
        "id": "originator-credit-packet-output",
        "version": "2026.10.30-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "originator-case-packet.v1"
                ]
              }
            },
            "executorVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "2026.10.30-v1"
                ]
              }
            },
            "kind": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "credit"
                ]
              }
            },
            "question": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "analysisId": {
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
            "basisFingerprint": {
              "required": true,
              "value": {
                "type": "string"
              }
            },
            "credit": {
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
                            "originator-credit-review.v1"
                          ]
                        }
                      },
                      "executorVersion": {
                        "required": true,
                        "value": {
                          "type": "enum",
                          "values": [
                            "2026.10.30-v1"
                          ]
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
                      "analysisDate": {
                        "required": true,
                        "value": {
                          "type": "date"
                        }
                      },
                      "reportingDate": {
                        "required": true,
                        "value": {
                          "type": "date"
                        }
                      },
                      "fundProgramId": {
                        "required": true,
                        "value": {
                          "type": "string"
                        }
                      },
                      "policyReference": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "sourceId": {
                                  "required": true,
                                  "value": {
                                    "type": "string"
                                  }
                                },
                                "effectiveFrom": {
                                  "required": true,
                                  "value": {
                                    "type": "date"
                                  }
                                },
                                "effectiveUntil": {
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
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "financials": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "version": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "2026.10.30-v1"
                                    ]
                                  }
                                },
                                "status": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reconciled",
                                      "needs_reconciliation"
                                    ]
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
                                },
                                "ltm": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "start": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "end": {
                                        "required": true,
                                        "value": {
                                          "type": "date"
                                        }
                                      },
                                      "grossRevenue": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "netRevenue": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "ebitda": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      }
                                    }
                                  }
                                },
                                "history": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
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
                                        "scale": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "1"
                                            ]
                                          }
                                        },
                                        "start": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "end": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "grossRevenue": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        },
                                        "deductions": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        },
                                        "netRevenue": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        },
                                        "ebitda": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
                                          }
                                        },
                                        "ebitdaMargin": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "decimal_string"
                                              },
                                              {
                                                "type": "null"
                                              }
                                            ]
                                          }
                                        },
                                        "priorComparableGrossGrowth": {
                                          "required": true,
                                          "value": {
                                            "type": "union",
                                            "variants": [
                                              {
                                                "type": "decimal_string"
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
                                "assets": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "liabilitiesAndEquity": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "balanceDifference": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "utilizedBankDebt": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "unusedBankLimits": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "utilizedAboveLimits": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "bankLinesAgainstBalanceDifference": {
                                  "required": true,
                                  "value": {
                                    "type": "decimal_string"
                                  }
                                },
                                "bankLinesAgainstScrDifference": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "decimal_string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "traces": {
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
                                        "formula": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "operands": {
                                          "required": true,
                                          "value": {
                                            "type": "map",
                                            "values": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "result": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
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
                      "credit": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "version": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "2026.10.30-v1"
                                    ]
                                  }
                                },
                                "analysisDate": {
                                  "required": true,
                                  "value": {
                                    "type": "date"
                                  }
                                },
                                "reportingDate": {
                                  "required": true,
                                  "value": {
                                    "type": "date"
                                  }
                                },
                                "operationStartDate": {
                                  "required": true,
                                  "value": {
                                    "type": "date"
                                  }
                                },
                                "requestedTermDays": {
                                  "required": true,
                                  "value": {
                                    "type": "integer"
                                  }
                                },
                                "decisionAuthority": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "committee"
                                    ]
                                  }
                                },
                                "status": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "not_evaluated",
                                      "needs_evidence",
                                      "recommend_decline",
                                      "no_additional_capacity",
                                      "recommend_conditional"
                                    ]
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
                                },
                                "vetoes": {
                                  "required": true,
                                  "value": {
                                    "type": "array",
                                    "items": {
                                      "type": "string"
                                    }
                                  }
                                },
                                "metrics": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "rawRows": {
                                        "required": true,
                                        "value": {
                                          "type": "integer"
                                        }
                                      },
                                      "uniqueTitles": {
                                        "required": true,
                                        "value": {
                                          "type": "integer"
                                        }
                                      },
                                      "duplicateRows": {
                                        "required": true,
                                        "value": {
                                          "type": "integer"
                                        }
                                      },
                                      "rawFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "uniqueFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "duplicateFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "originalPastDueFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "currentPastDueFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "originalPastDueRatio": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "largestGroupFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "topFiveGroupsFace": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "largestGroupRatio": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "hhi": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "adjustedDebt": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "freeCash": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "netDebt": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "unusedBankLimits": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "netDebtToEbitda": {
                                        "required": true,
                                        "value": {
                                          "type": "union",
                                          "variants": [
                                            {
                                              "type": "decimal_string"
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
                                "eligibility": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "preliminaryFace": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "eligibleFace": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "accepted": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "reference": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "debtorId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "issueDate": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "face": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "decimal_string"
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "excluded": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "reference": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "debtorId": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "string"
                                                    }
                                                  },
                                                  "issueDate": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "date"
                                                    }
                                                  },
                                                  "face": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "decimal_string"
                                                    }
                                                  },
                                                  "reason": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "enum",
                                                      "values": [
                                                        "prior_assignment",
                                                        "related_party",
                                                        "invoice_cancelled",
                                                        "original_arrears",
                                                        "delivery_unverified",
                                                        "term_exceeded",
                                                        "unknown_evidence",
                                                        "outside_reporting_date",
                                                        "zero_balance",
                                                        "concentration"
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
                                "rating": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "points": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "grade": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "totalFaceCap": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
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
                                "capacity": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "object",
                                        "fields": {
                                          "ratingHeadroom": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "regulationHeadroom": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "collateralHeadroom": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "additionalFace": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "resultingTotalFace": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "minimumCashBeforeNewStress": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "stressedMinimumCash": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "headroomAboveCashFloor": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "severeMinimumCash": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "severeDeficit": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "requestedFaceCashDeficit": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "requestedMinimumCash": {
                                            "required": true,
                                            "value": {
                                              "type": "decimal_string"
                                            }
                                          },
                                          "liquidityHeadroom": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "decimal_string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "maturityCashAfterStress": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "decimal_string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "requestedMaturityCashAfterStress": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "decimal_string"
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
                                "traces": {
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
                                        "formula": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "operands": {
                                          "required": true,
                                          "value": {
                                            "type": "map",
                                            "values": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "result": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
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
                      "reconciliation": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "object",
                              "fields": {
                                "status": {
                                  "required": true,
                                  "value": {
                                    "type": "enum",
                                    "values": [
                                      "reconciled",
                                      "needs_reconciliation"
                                    ]
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
                                },
                                "revenue": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "monthlyGross": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "salesAbcGross": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "monthlyDifference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "abcDifference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      }
                                    }
                                  }
                                },
                                "receivables": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "recomposedClosing": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "difference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "tapeDifference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "balanceDifference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      }
                                    }
                                  }
                                },
                                "impairment": {
                                  "required": true,
                                  "value": {
                                    "type": "object",
                                    "fields": {
                                      "recomposedClosing": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "difference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "balanceDifference": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      },
                                      "olderWriteoffRecoveries": {
                                        "required": true,
                                        "value": {
                                          "type": "decimal_string"
                                        }
                                      }
                                    }
                                  }
                                },
                                "cancellationScenarioEbitda": {
                                  "required": true,
                                  "value": {
                                    "type": "union",
                                    "variants": [
                                      {
                                        "type": "decimal_string"
                                      },
                                      {
                                        "type": "null"
                                      }
                                    ]
                                  }
                                },
                                "traces": {
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
                                        "formula": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "operands": {
                                          "required": true,
                                          "value": {
                                            "type": "map",
                                            "values": {
                                              "type": "string"
                                            }
                                          }
                                        },
                                        "result": {
                                          "required": true,
                                          "value": {
                                            "type": "decimal_string"
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
                      "numericReadings": {
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
                              "value": {
                                "required": true,
                                "value": {
                                  "type": "decimal_string"
                                }
                              },
                              "unit": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "currency",
                                    "ratio",
                                    "multiple",
                                    "count"
                                  ]
                                }
                              },
                              "sourceId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "contextId": {
                                "required": true,
                                "value": {
                                  "type": "string"
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
                      "sources": {
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
                              "documentId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "sourceVersionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "sha256": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "anchor": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "quote": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "origin": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "provided_document",
                                    "authorized_public_query"
                                  ]
                                }
                              },
                              "consultedAt": {
                                "required": true,
                                "value": {
                                  "type": "date"
                                }
                              }
                            }
                          }
                        }
                      },
                      "traces": {
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
                              "formula": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "operands": {
                                "required": true,
                                "value": {
                                  "type": "map",
                                  "values": {
                                    "type": "string"
                                  }
                                }
                              },
                              "result": {
                                "required": true,
                                "value": {
                                  "type": "decimal_string"
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
                            "pending_evidence",
                            "prepared_for_committee_review"
                          ]
                        }
                      },
                      "decisionAuthority": {
                        "required": true,
                        "value": {
                          "type": "enum",
                          "values": [
                            "committee"
                          ]
                        }
                      },
                      "grantsCredit": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "grantsPurchase": {
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
            "registry": {
              "required": true,
              "value": {
                "type": "null"
              }
            },
            "kit": {
              "required": true,
              "value": {
                "type": "null"
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
      "authority": "house",
      "statement": "Executar somente registros confirmados no escopo autorizado, conservar fontes, unidades e pendências e manter a decisão com o responsável.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareOriginatorCreditPacket",
        "version": "2026.10.30-v1"
      }
    }
  ]
}
```
