---
id: prepare-originator-registry
version: 2026.10.30-v1
maturity: candidate
title_pt: Revisar os documentos de cadastro do cedente e dos sócios
title_en: Review the Cedent and Shareholders Registry Documents
role: intake_evidence
blueprint_stage: 3
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-30
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareOriginatorRegistryPacket
result_contract: originator-case-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: originator-case-packet.v1
unit_test_files: [packages/financial-core/src/receivables/originator-ownership.test.ts, packages/financial-model/src/originator-registry.test.ts, packages/financial-model/src/originator-case.test.ts]
gold_case_ids: [originator-registry-structured-gold]
adversarial_case_ids: [originator-registry-adoption-and-source-adversarial]
e2e_scenario_ids: [pending:originator-registry-native-product-journey]
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
Organizar a cadeia societária, os poderes documentados de assinatura e os relatórios recebidos de consultas para a decisão do responsável por cadastro. Não substituir a aprovação cadastral, o comitê ou a revisão jurídica.

# Produto
Quadro de participações diretas e indiretas, signatários e forma de assinatura por ato, versões selecionadas em vigor, procurações vencidas, homônimos não atribuídos, achados e pendências com fonte e data.

# Quando ativar
- Pedido dirigido ao assessor para conferir cadastro, sócios ou poderes nos documentos e relatórios autorizados recebidos.

# Quando não ativar
- Pedido de aprovação jurídica, autorização da operação ou consulta externa sem autorização e sem provedor disponível.

# Inputs mínimos e substitutos
- schemaVersion (string, required): originator-case-packet-input.v1.
- question (string, required): pergunta de cadastro.
- analysis (object, required): base imutável confirmada, escopo autorizado, tipo registry e seleção integral de registros. Cada fonte identifica documento, versão, hash, trecho, página ou seção e data da consulta que o relatório declara. Cadeia societária, identidade das pessoas, poderes, ato solicitado, textos em vigor e régua de consultas são explícitos. Nome igual não confirma identidade. Sem cadeia ou relatório, registrar lacuna.

# Sequência operacional
1. [deterministic] Conferir base e documentos :: Validar fingerprint, escopo e seleção integral; conservar fonte e data de cada leitura ; Não tratar relatório recebido como nova consulta realizada pelo sistema
2. [deterministic] Reconstituir participações :: Multiplicar cada caminho e somar os caminhos da mesma pessoa ; Holding sem abertura, identidade faltante, ciclo ou parcela residual deixam a cadeia parcial
3. [deterministic] Conferir poderes :: Examinar o ato solicitado nos textos selecionados, vigência, substituição, procuração e assinatura conjunta ou isolada ; Texto concorrente sem solução deixa a conclusão pendente
4. [deterministic] Examinar relatórios :: Exigir identidade confirmada, data e origem; aplicar a régua da instituição por pessoa e tipo de consulta ; Homônimo não é atribuído, consulta vencida não fica negativa atual
5. [deterministic] Preparar a revisão :: Separar achado, disposição registrada e pendência; decisão de cadastro continua com o responsável ; Não autorizar operação

# Cálculos determinísticos
- Participação indireta é o produto das participações diretas do caminho. Caminhos da mesma pessoa são somados e conciliados com parcelas ainda não identificadas.
- Atualidade usa a data da consulta documentada no relatório, não a data de upload.

# Julgamentos permitidos
- Propor a identificação e o vínculo entre fontes para confirmação; registrar o tratamento informado pelo responsável para um achado. Não declarar ausência de risco a partir de nome parecido ou ausência de documento.

# Perguntas que mudam o trabalho
- Qual é o ato a assinar e quais textos foram confirmados como vigentes?
- A instituição exige quais consultas, sobre quais pessoas e com qual prazo?
- Quem é o responsável pelo tratamento de um achado atribuído?

# Red flags
- Holding não aberta, documento substituído, poderes divergentes, procuração vencida, consulta antiga, resultado inconclusivo, homônimo sem identidade e achado atribuído sem disposição.

# Stop conditions
- Cadeia incompleta, identidade não confirmada, poderes conflitantes, fonte posterior à data da análise ou consulta obrigatória ausente, vencida ou conflitante. A decisão permanece pendente com a causa e a fonte.

# Outputs
- schemaVersion (string, required): originator-case-packet.v1.
- executorVersion (string, required): versão do executor.
- kind (enum, required): tipo registry | values: registry
- question (string, required): pedido atendido.
- analysisId (string, required): identidade da análise confirmada.
- scope (object, required): trabalho, finalidade e versão da base autorizada.
- entityId (string, required): entidade da base.
- basisFingerprint (string, required): fingerprint da base confirmada.
- credit (null, required): sempre nulo neste método.
- registry (object|null, required): cadeia, poderes, relatórios, achados, fontes e pendências; decisão humana pendente, operação não autorizada, documentos não autenticados e nenhuma consulta externa realizada pelo executor.
- kit (null, required): sempre nulo neste método.
- gaps (array, required): pendências impeditivas.
- bindings (array, required): decisões por registro.
- contributions (array, required): contribuições efetivamente lidas.
- status (enum, required): estado do pacote | values: framed, partial, prepared_for_human_review
- grantsExecution (boolean, required): falso.
- grantsPublication (boolean, required): falso.
- fingerprint (string, required): fingerprint do resultado.

# Exemplos
## Bom
- O documento antigo previa assinatura isolada, mas o texto confirmado em vigor exige assinatura conjunta. Mostrar a mudança com as fontes e reter a conclusão se houver texto concorrente.
## Ruim
- Atribuir notícia ou processo a um sócio porque os nomes coincidem.

# Testes
## Unit
- Cadeia completa e parcial, caminhos múltiplos, ciclo, literal sem trecho, texto substituído, poderes concorrentes, procuração vencida, homônimo, consulta faltante ou antiga, achado sem disposição e base adulterada.
## Gold
- Caso sintético estruturado e oráculo de autoria independente, separados dos dados lidos pelo executor; conferir resultados e pendências nos testes declarados.
## Adversarial
- Base, seleção, fonte, versão, entidade, unidade ou data conflitantes são recusadas ou mantidas como lacuna; nunca completadas por suposição.
## Aceitação
- O ensaio nativo de documentos, a ponte com a conversa e o resultado citado ainda são exigidos para liberação. Não há prova de integração externa de KYC por estes testes.

# Evidência
## Hierarquia
- Documento primário e sua versão, com trecho e data de corte; relatório de consulta recebido com identidade e data da consulta.
- Fato informado e vínculo confirmado pela pessoa, separados de regra da casa e estimativa.
## Regras
- Relatórios recebidos são fatos documentais, com fonte e data. Consulta externa só poderá ser afirmada quando o conector autorizado registrar a consulta real. Disposição de achado é fato informado pelo responsável e não apaga o achado.

# Limites declarados
- Candidato em implementação. Não publicado, sem perfil e sem liberação. Não autentica documento, não realiza consultas a SCR, bureau, tribunais ou listas, não emite aprovação jurídica e não autoriza crédito ou compra de títulos.

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
        "packages/credit-playbook/knowledge/procedures/receivables/prepare-originator-registry.md"
      ],
      "id": "originator-registry.packet",
      "kind": "rule",
      "title": "Preparar a revisão sobre a base confirmada",
      "inputs": {
        "id": "originator-registry-packet-input",
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
                        "registry"
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
        "id": "originator-registry-packet-output",
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
                  "registry"
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
                "type": "null"
              }
            },
            "registry": {
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
                            "originator-registry-documentary-review.v1"
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
                      "asOf": {
                        "required": true,
                        "value": {
                          "type": "date"
                        }
                      },
                      "rootEntityId": {
                        "required": true,
                        "value": {
                          "type": "string"
                        }
                      },
                      "ownership": {
                        "required": true,
                        "value": {
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
                                  "complete",
                                  "partial"
                                ]
                              }
                            },
                            "resolvedPersons": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "personId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "resolvedShare": {
                                      "required": true,
                                      "value": {
                                        "type": "decimal_string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "unresolved": {
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
                                    "share": {
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
                                          "ownership_missing",
                                          "identity_missing",
                                          "cycle",
                                          "unallocated_share",
                                          "depth_limit"
                                        ]
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
                            }
                          }
                        }
                      },
                      "signing": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "status": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "documented",
                                  "pending"
                                ]
                              }
                            },
                            "action": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "receivables_assignment",
                                  "guarantee",
                                  "borrowing"
                                ]
                              }
                            },
                            "powers": {
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
                                    "signingMode": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "all",
                                          "any"
                                        ]
                                      }
                                    },
                                    "signatoryIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "sourceId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "signatoryIds": {
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
                      "screenings": {
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
                                  "type": "enum",
                                  "values": [
                                    "pep",
                                    "sanctions",
                                    "litigation",
                                    "negative_news"
                                  ]
                                }
                              },
                              "subjectId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "sourceId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "attributed": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "result": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "no_hit_reported",
                                    "hit_reported",
                                    "inconclusive"
                                  ]
                                }
                              },
                              "disposition": {
                                "required": true,
                                "value": {
                                  "type": "union",
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
                      "gaps": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "code": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "subjectId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "sourceId": {
                                "required": true,
                                "value": {
                                  "type": "union",
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
                      "findings": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "code": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "subjectId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "sourceId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "detail": {
                                "required": true,
                                "value": {
                                  "type": "union",
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
                            "prepared_for_registry_decision"
                          ]
                        }
                      },
                      "decisions": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "registry": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "pending_human_decision"
                                ]
                              }
                            },
                            "credit": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "outside_scope"
                                ]
                              }
                            },
                            "operation": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "not_authorized"
                                ]
                              }
                            }
                          }
                        }
                      },
                      "documentsAuthenticated": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "liveQueriesPerformedByThisExecutor": {
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
        "exportName": "prepareOriginatorRegistryPacket",
        "version": "2026.10.30-v1"
      }
    }
  ]
}
```
