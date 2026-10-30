---
id: prepare-originator-kit
version: 2026.10.30-v1
maturity: candidate
title_pt: Conferir se o kit do cedente permite começar a análise
title_en: Check Whether the Cedent Kit Is Ready for Analysis
role: intake_evidence
blueprint_stage: 2
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-30
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareOriginatorKitPacket
result_contract: originator-case-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: originator-case-packet.v1
unit_test_files: [packages/financial-model/src/originator-kit.test.ts, packages/financial-model/src/originator-case.test.ts]
gold_case_ids: [originator-kit-structured-gold]
adversarial_case_ids: [originator-kit-adoption-and-source-adversarial]
e2e_scenario_ids: [pending:originator-kit-native-product-journey]
cost_eval_ids: [deterministic:no-model-calls]
dependencies: [organize-document-folder]
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
Dizer o que chegou do cedente, o que pôde ser lido, qual versão foi selecionada e o que falta para iniciar a análise. Receber documentos não equivale a validar documentos ou aprovar crédito.

# Produto
Inventário por arquivo, sem apagar cópias ou versões anteriores; lista curta de pendências por finalidade, com a data de corte e o prazo da instituição que fundamenta cada pedido de atualização.

# Quando ativar
- A pessoa pede para conferir ou organizar o kit recebido de um cedente.

# Quando não ativar
- Relato de terceiro, texto citado, recusa ou pedido de envio de documentos.
- Pedido de parecer de crédito ou de liberação de borderô.

# Inputs mínimos e substitutos
- schemaVersion (string, required): originator-case-packet-input.v1.
- question (string, required): pedido dirigido ao assessor.
- analysis (object, required): base imutável confirmada, escopo autorizado, tipo kit, ordem e seleções de todos os registros. O inventário contém a leitura por conteúdo de cada arquivo, identidade, hash, páginas não lidas, entidade, período, unidade e versão. A pessoa confirma os papéis e as versões selecionadas. A lista de exigências da instituição identifica origem, vigência e prazo por papel; ausente, fica como lacuna.

# Sequência operacional
1. [deterministic] Ler a base confirmada :: Conferir fingerprint, escopo, dimensões e cobertura integral dos registros ; Base adulterada ou outra organização não é entrada válida
2. [deterministic] Organizar os arquivos :: Reutilizar o motor de inventário publicado, preservando cada arquivo, cópia, versão e página não lida ; O nome do arquivo não escolhe a versão
3. [deterministic] Conferir a lista da instituição :: Para cada papel obrigatório, conferir a versão selecionada, entidade, leitura, data de corte e atualidade ; Duas versões selecionadas deixam a escolha pendente
4. [deterministic] Preparar as pendências :: Explicar o documento faltante, desatualizado ou sem leitura, com o prazo da instituição ; Não criar um prazo padrão

# Cálculos determinísticos
- A idade usa a data de referência declarada no documento ou o fim do período exigido pela instituição. A data do upload não renova um SCR antigo.
- Reutilizar o inventário existente. Este método não calcula limite, índice de crédito ou aprovação.

# Julgamentos permitidos
- Propor o papel de um documento pela leitura de seu conteúdo. A seleção da versão e o vínculo com o cedente são confirmados na base de trabalho.

# Perguntas que mudam o trabalho
- Qual lista de documentos e quais prazos esta instituição adota para este tipo de cedente?
- Entre as versões concorrentes, qual foi confirmada como a que será analisada?

# Red flags
- Relatório de outra entidade apresentado como se fosse do cedente; documento antigo reenviado como atualização; cópia com leitura conflitante; versão substituída selecionada.

# Stop conditions
- Sem direito atual de leitura de um arquivo, a sua leitura fica retida pelo loader autorizado.
- Sem lista da instituição, o inventário existe, mas a suficiência do kit fica pendente.
- Pendência obrigatória impede marcar o kit como pronto para análise.

# Outputs
- schemaVersion (string, required): originator-case-packet.v1.
- executorVersion (string, required): versão do executor.
- kind (enum, required): tipo kit | values: kit
- question (string, required): pedido atendido.
- analysisId (string, required): identidade da análise confirmada.
- scope (object, required): trabalho, finalidade e versão da base autorizada.
- entityId (string, required): entidade da base.
- basisFingerprint (string, required): fingerprint da base confirmada.
- credit (null, required): sempre nulo neste método.
- registry (null, required): sempre nulo neste método.
- kit (object|null, required): inventário completo, situação por papel, datas, idades, prazos e pendências; nulo quando falta registro da base.
- gaps (array, required): lacunas que impedem a conclusão.
- bindings (array, required): decisões adotadas por registro.
- contributions (array, required): contribuições efetivamente lidas.
- status (enum, required): estado do pacote | values: framed, partial, prepared_for_human_review
- grantsExecution (boolean, required): falso.
- grantsPublication (boolean, required): falso.
- fingerprint (string, required): fingerprint do resultado.

# Exemplos
## Bom
- O SCR tem data de corte anterior ao prazo da instituição. Pedir a versão atualizada e preservar a antiga no inventário.
## Ruim
- Declarar o kit completo porque todos os arquivos foram enviados.

# Testes
## Unit
- Inventário preservado, lista ausente, papel faltante, versões concorrentes, minuta substituída, outra entidade, idade pelo corte e base adulterada.
## Gold
- Caso sintético estruturado e oráculo de autoria independente, separados dos dados lidos pelo executor; conferir resultados e pendências nos testes declarados.
## Adversarial
- Base, seleção, fonte, versão, entidade, unidade ou data conflitantes são recusadas ou mantidas como lacuna; nunca completadas por suposição.
## Aceitação
- O ensaio com arquivos nativos, conversa, confirmação, página e resposta citada ainda é gate de liberação. Testes de registros estruturados não o substituem.

# Evidência
## Hierarquia
- Documento primário e sua versão, com trecho e data de corte; relatório de consulta recebido com identidade e data da consulta.
- Fato informado e vínculo confirmado pela pessoa, separados de regra da casa e estimativa.
## Regras
- Cada arquivo conserva sua identidade e hash. Toda seleção vem da base confirmada; hipóteses propostas ainda não são fatos adotados.

# Limites declarados
- Candidato em implementação. Não publicado, sem perfil e sem liberação. Não autentica documentos, consulta bureau ou aprova crédito.

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
        "packages/credit-playbook/knowledge/procedures/receivables/prepare-originator-kit.md"
      ],
      "id": "originator-kit.packet",
      "kind": "rule",
      "title": "Preparar a revisão sobre a base confirmada",
      "inputs": {
        "id": "originator-kit-packet-input",
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
                        "kit"
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
        "id": "originator-kit-packet-output",
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
                  "kit"
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
                "type": "null"
              }
            },
            "kit": {
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
                            "originator-kit-review.v1"
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
                      "inventory": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "schemaVersion": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "document-folder-inventory.v1"
                                ]
                              }
                            },
                            "version": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "2026.10.27-v1"
                                ]
                              }
                            },
                            "asOf": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "mode": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "organize",
                                  "organize_only",
                                  "organize_for_debt"
                                ]
                              }
                            },
                            "partitionByEntity": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "rows": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "fileId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileName": {
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
                                    "order": {
                                      "required": true,
                                      "value": {
                                        "type": "integer"
                                      }
                                    },
                                    "partition": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "economicGroup": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "group": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "statements",
                                          "management",
                                          "debt",
                                          "contracts",
                                          "governance",
                                          "receivables",
                                          "assets",
                                          "other"
                                        ]
                                      }
                                    },
                                    "groupLabel": {
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
                                          "annual_financial_statements",
                                          "auditor_management_letter",
                                          "trial_balance",
                                          "management_report",
                                          "budget",
                                          "cash_flow_forecast",
                                          "debt_schedule",
                                          "debenture_indenture",
                                          "bank_credit_note",
                                          "development_bank_financing",
                                          "customer_contract",
                                          "supplier_contract",
                                          "board_minutes",
                                          "shareholders_minutes",
                                          "receivables_aging",
                                          "appraisal_report",
                                          "property_registry",
                                          "institutional_presentation",
                                          "invoice",
                                          "unidentified"
                                        ]
                                      }
                                    },
                                    "description": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "entity": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "period": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "version": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "audited",
                                              "draft",
                                              "signed",
                                              "registered",
                                              "approved",
                                              "working_revision",
                                              "closed",
                                              "management",
                                              "final",
                                              "outdated",
                                              "marketing",
                                              "image"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "situation": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "read": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "complete",
                                                "partial",
                                                "unreadable",
                                                "conflicted"
                                              ]
                                            }
                                          },
                                          "unreadablePages": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "integer"
                                              }
                                            }
                                          },
                                          "pagesFrom": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "object",
                                                "fields": {
                                                  "page": {
                                                    "required": true,
                                                    "value": {
                                                      "type": "integer"
                                                    }
                                                  },
                                                  "fileId": {
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
                                                  }
                                                }
                                              }
                                            }
                                          },
                                          "duplicateOf": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "supersededBy": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "object",
                                                  "fields": {
                                                    "fileId": {
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
                                                          "audited_over_draft",
                                                          "higher_assurance",
                                                          "later_version",
                                                          "later_position"
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
                                          "sideBySideWith": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "string"
                                              }
                                            }
                                          },
                                          "inVault": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
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
                                    "situationLabel": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "findingIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "validated": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "groups": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "partition": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "group": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "statements",
                                          "management",
                                          "debt",
                                          "contracts",
                                          "governance",
                                          "receivables",
                                          "assets",
                                          "other"
                                        ]
                                      }
                                    },
                                    "label": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
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
                            "families": {
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
                                    "basis": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "period",
                                          "position",
                                          "instrument"
                                        ]
                                      }
                                    },
                                    "resolution": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "audited_over_draft",
                                          "higher_assurance",
                                          "later_version",
                                          "later_position",
                                          "side_by_side",
                                          "unresolved",
                                          "effective_text",
                                          "same_text"
                                        ]
                                      }
                                    },
                                    "prevails": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "superseded": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "sideBySide": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "highlighted": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "effectiveTexts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "instrumentRef": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "entityId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "clauses": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "clauseId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "knowledge": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "known",
                                          "future",
                                          "unread",
                                          "missing_source",
                                          "conflict"
                                        ]
                                      }
                                    },
                                    "conflicts": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileIds": {
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
                                    "unread": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "type": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "fileIds": {
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
                                    "future": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "from": {
                                              "required": true,
                                              "value": {
                                                "type": "date"
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
                            "findings": {
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
                                    "code": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "duplicate",
                                          "draft_superseded",
                                          "version_superseded",
                                          "position_superseded",
                                          "versions_side_by_side",
                                          "versions_unresolved",
                                          "series_gap",
                                          "mixed_units",
                                          "stale_forecast",
                                          "total_includes_unused_limit",
                                          "total_difference_unexplained",
                                          "total_not_recomposed",
                                          "amended_original",
                                          "amendment_in_force",
                                          "amendment_superseded",
                                          "amendment_not_in_force",
                                          "amendment_conflict",
                                          "amendment_future",
                                          "amendment_without_original",
                                          "clause_unread",
                                          "effect_blocked",
                                          "substitute_not_binding",
                                          "clause_future",
                                          "figure_conflict",
                                          "instrument_not_in_force",
                                          "instrument_superseded",
                                          "instrument_conflict",
                                          "instrument_future",
                                          "clause_superseded",
                                          "clause_conflict",
                                          "clause_not_in_force",
                                          "reading_conflict",
                                          "substitute_conflict",
                                          "page_unreadable",
                                          "file_unreadable",
                                          "clause",
                                          "observation",
                                          "subsidiary_in_consolidated",
                                          "appraisal_without_registry",
                                          "figure_basis_differs"
                                        ]
                                      }
                                    },
                                    "anchor": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "sources": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "fileId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "page": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
                                                "variants": [
                                                  {
                                                    "type": "integer"
                                                  },
                                                  {
                                                    "type": "null"
                                                  }
                                                ]
                                              }
                                            },
                                            "section": {
                                              "required": true,
                                              "value": {
                                                "type": "union",
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
                                    "statement": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "topic": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "debt_covenant",
                                              "debt_policy",
                                              "receivables_assignment",
                                              "supplier_contract",
                                              "debt_position",
                                              "statements_version",
                                              "group_perimeter"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "effect": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "decisionStatement": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "knowledge": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "known",
                                          "future",
                                          "unread",
                                          "missing_source",
                                          "conflict"
                                        ]
                                      }
                                    },
                                    "quoted": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "fileId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "page": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "integer"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "section": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "text": {
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
                                    "changes": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "type": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "current": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "boolean"
                                                  }
                                                },
                                                "before": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "object",
                                                        "fields": {
                                                          "fileId": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "string"
                                                            }
                                                          },
                                                          "page": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "union",
                                                              "variants": [
                                                                {
                                                                  "type": "integer"
                                                                },
                                                                {
                                                                  "type": "null"
                                                                }
                                                              ]
                                                            }
                                                          },
                                                          "section": {
                                                            "required": true,
                                                            "value": {
                                                              "type": "union",
                                                              "variants": [
                                                                {
                                                                  "type": "string"
                                                                },
                                                                {
                                                                  "type": "null"
                                                                }
                                                              ]
                                                            }
                                                          },
                                                          "text": {
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
                                                "after": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "object",
                                                    "fields": {
                                                      "fileId": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "string"
                                                        }
                                                      },
                                                      "page": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "integer"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "section": {
                                                        "required": true,
                                                        "value": {
                                                          "type": "union",
                                                          "variants": [
                                                            {
                                                              "type": "string"
                                                            },
                                                            {
                                                              "type": "null"
                                                            }
                                                          ]
                                                        }
                                                      },
                                                      "text": {
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
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "resolved"
                                        ]
                                      }
                                    },
                                    "resolvedBy": {
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
                            "decisionFindings": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "rank": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "findingId": {
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
                                        },
                                        "effect": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          }
                                        },
                                        "statement": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "sources": {
                                          "required": true,
                                          "value": {
                                            "type": "array",
                                            "items": {
                                              "type": "object",
                                              "fields": {
                                                "fileId": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "string"
                                                  }
                                                },
                                                "page": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
                                                    "variants": [
                                                      {
                                                        "type": "integer"
                                                      },
                                                      {
                                                        "type": "null"
                                                      }
                                                    ]
                                                  }
                                                },
                                                "section": {
                                                  "required": true,
                                                  "value": {
                                                    "type": "union",
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
                                  {
                                    "type": "null"
                                  }
                                ]
                              }
                            },
                            "generalFindings": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "array",
                                    "items": {
                                      "type": "object",
                                      "fields": {
                                        "rank": {
                                          "required": true,
                                          "value": {
                                            "type": "integer"
                                          }
                                        },
                                        "findingId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "effect": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "binding_limit",
                                              "policy_limit",
                                              "collateral_restriction",
                                              "deadline",
                                              "figure_correction",
                                              "version_conflict",
                                              "perimeter"
                                            ]
                                          }
                                        },
                                        "statement": {
                                          "required": true,
                                          "value": {
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
                            "identityChecks": {
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
                                          "reported_total",
                                          "period_against_months"
                                        ]
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "matches",
                                          "differs",
                                          "not_run"
                                        ]
                                      }
                                    },
                                    "reported": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "recomposed": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
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
                                        "type": "string"
                                      }
                                    },
                                    "reason": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
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
                                    "id": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "need": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "monthly_series",
                                          "reading_substitute",
                                          "real_collateral",
                                          "group_perimeter",
                                          "liquidity_projection"
                                        ]
                                      }
                                    },
                                    "item": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "why": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "quoted": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "fileId": {
                                                "required": true,
                                                "value": {
                                                  "type": "string"
                                                }
                                              },
                                              "page": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "integer"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "section": {
                                                "required": true,
                                                "value": {
                                                  "type": "union",
                                                  "variants": [
                                                    {
                                                      "type": "string"
                                                    },
                                                    {
                                                      "type": "null"
                                                    }
                                                  ]
                                                }
                                              },
                                              "text": {
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
                                    "purposes": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "findingId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "conditional": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "status": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "resolved"
                                        ]
                                      }
                                    },
                                    "resolvedBy": {
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
                            "questions": {
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
                                    "text": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "fileIds": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "string"
                                        }
                                      }
                                    },
                                    "findingId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
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
                                        "type": "enum",
                                        "values": [
                                          "open",
                                          "answered"
                                        ]
                                      }
                                    },
                                    "answeredBy": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
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
                            "informed": {
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
                                    "questionId": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "statement": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "author": {
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
                                    "origin": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "informed"
                                        ]
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "followUps": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "object",
                                      "fields": {
                                        "kind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "notice_deadline"
                                            ]
                                          }
                                        },
                                        "date": {
                                          "required": true,
                                          "value": {
                                            "type": "date"
                                          }
                                        },
                                        "fileId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "clauseId": {
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
                                        },
                                        "scheduled": {
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
                                        "kind": {
                                          "required": true,
                                          "value": {
                                            "type": "enum",
                                            "values": [
                                              "effective_text"
                                            ]
                                          }
                                        },
                                        "instrumentRef": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "entityId": {
                                          "required": true,
                                          "value": {
                                            "type": "string"
                                          }
                                        },
                                        "fileIds": {
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
                              }
                            },
                            "counts": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "files": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "duplicates": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "incompleteReadings": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "superseded": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "inVault": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "withFinding": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "pageSubstitutes": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  }
                                }
                              }
                            },
                            "readingConflicts": {
                              "required": true,
                              "value": {
                                "type": "array",
                                "items": {
                                  "type": "object",
                                  "fields": {
                                    "sha256": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "page": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "integer"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "fileIds": {
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
                            "update": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "object",
                                    "fields": {
                                      "priorFingerprint": {
                                        "required": true,
                                        "value": {
                                          "type": "string"
                                        }
                                      },
                                      "rowsUpdated": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "rowsAdded": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "rowsPreserved": {
                                        "required": true,
                                        "value": {
                                          "type": "integer"
                                        }
                                      },
                                      "findingsResolved": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "findingsAdded": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "gapsResolved": {
                                        "required": true,
                                        "value": {
                                          "type": "array",
                                          "items": {
                                            "type": "string"
                                          }
                                        }
                                      },
                                      "questionsAnswered": {
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
                            }
                          }
                        }
                      },
                      "readiness": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "role": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "financial_statements",
                                    "interim_statements",
                                    "monthly_revenue",
                                    "sales_abc",
                                    "receivables_tape",
                                    "debtor_registry",
                                    "assignment_evidence",
                                    "collections_and_losses",
                                    "bank_lines",
                                    "scr",
                                    "credit_policy",
                                    "cash_projection",
                                    "articles_and_amendments",
                                    "powers",
                                    "ownership_chain",
                                    "screening_reports"
                                  ]
                                }
                              },
                              "fileIds": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "string"
                                  }
                                }
                              },
                              "status": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "available",
                                    "not_required",
                                    "missing",
                                    "selection_conflict",
                                    "unread_or_conflicted",
                                    "superseded",
                                    "outdated",
                                    "date_unconfirmed",
                                    "future_dated",
                                    "subject_mismatch"
                                  ]
                                }
                              },
                              "date": {
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
                              "ageDays": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "integer"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "maxAgeDays": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "integer"
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
                      "policySource": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
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
                          "type": "enum",
                          "values": [
                            "pending_evidence",
                            "ready_for_analysis"
                          ]
                        }
                      },
                      "documentsValidated": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "committeeDecision": {
                        "required": true,
                        "value": {
                          "type": "enum",
                          "values": [
                            "not_requested"
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
        "exportName": "prepareOriginatorKitPacket",
        "version": "2026.10.30-v1"
      }
    }
  ]
}
```
