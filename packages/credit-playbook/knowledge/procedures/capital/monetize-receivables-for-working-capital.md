---
id: monetize-receivables-for-working-capital
version: 2026.10.26-v1
maturity: implemented
title_pt: Recebíveis para giro
title_en: Monetize Receivables for Working Capital
role: credit_structuring
blueprint_stage: 6
owner_role: Autoria profissional da Offroad
effective_date: 2026-10-26
authorities: [CASA, DEF]
implementation_module: @offroad/financial-model
implementation_export: prepareReceivablesFundingPacket
result_contract: receivables-funding-packet.v1
connected_states: [framed, partial, prepared_for_human_review]
persistence_mode: derived_on_demand
persistence_target: receivables-funding-packet.v1
unit_test_files: [packages/financial-model/src/receivables-funding-packet.test.ts, packages/financial-model/src/receivables-funding-runs.test.ts, packages/financial-model/src/receivables-funding-premises.test.ts, packages/financial-core/src/receivables-funding.test.ts]
gold_case_ids: [gross-portfolio-is-not-assignable, every-exclusion-carries-its-reason, options-sized-by-eligibility-and-sublimit, cost-for-the-time-in-use-against-the-bank-line, iof-where-it-applies, discount-iof-on-whole-draws, monthly-rates-converted-before-comparing, recourse-on-the-balance-sheet-and-the-covenant, sale-is-not-a-guarantee-under-the-negative-pledge, asks-about-retailer-a-program, fifteen-to-thirty-days-with-registration-as-condition-precedent, several-buyers-and-the-bank-line-as-reserve, no-dedicated-vehicle-for-a-seasonal-need, retailer-a-program-reorders-the-plan, one-debtor-split-across-lots-shares-the-sublimit, unsold-balance-goes-to-the-next-buyer, encumbered-bucket-released-under-the-same-sublimit, largest-debtor-unknown-is-a-gap-not-a-default, absent-peak-is-a-gap-not-a-default]
adversarial_case_ids: [tampered-envelope, free-result-in-request, fabricated-grant-in-result, fabricated-approval-promise, program-buys-a-debtor-without-a-program, policy-override-to-take-encumbered-receivables, sale-carrying-collateral, discount-without-recourse, bank-line-with-portfolio-eligibility, rate-without-a-declared-period, encumbrance-without-holder, peak-below-average-need, largest-debtor-above-its-bucket, largest-debtor-cannot-hold-its-bucket, debtor-key-shared-by-a-bucket-and-a-named-debtor, lots-of-one-debtor-with-different-contracts, figure-read-in-another-scenario]
e2e_scenario_ids: [domain:gross-portfolio-is-not-assignable]
cost_eval_ids: [deterministic:no-model-calls]
task_specs: []
dependencies: []
reference_data_keys: []
calculation_ids: [financial.receivables_funding]
templates: []
max_model_calls: 0
model_purpose: []
allowed_tools: []
consistency_run_ids: [monetize-receivables-for-working-capital-2026-10-26-v1-consistency]
adversarial_run_ids: [monetize-receivables-for-working-capital-2026-10-26-v1-adversarial]
review_ids: []
gold_run_ids: [monetize-receivables-for-working-capital-2026-10-26-v1-gold]
---

# Objetivo
Dizer quanto da carteira de recebíveis vira dinheiro, com quem, a que custo e em quanto tempo, e se isso é melhor que a linha bancária. A carteira bruta não é a cedível: cliente com vedação de cessão, recebível cedido a outro credor e título vencido ficam fora, cada um com o motivo.

# Produto
Pacote de recebíveis para giro: carteira bruta, cedível e excluída com o motivo de cada exclusão e o credor e o evento que liberam o recebível onerado; volume de cada porta (programa do próprio cliente, FIDC multicedente com e sem coobrigação, desconto bancário) pela elegibilidade e pelo sublimite por sacado; custo de todas as portas para o mesmo valor e tempo de uso, contra a linha bancária, com a taxa convertida para ano efetivo e o spread sobre o DI, IOF onde houver; efeito no balanço, na dívida medida pelo covenant e na cesta da negative pledge; plano da porta mais barata até cobrir o pico, linha como reserva; data de início pelo prazo da porta; condições precedentes; leitura de operação dedicada; perguntas que mudam o plano.

# Quando ativar
- Tenho recebíveis e preciso de giro; antecipar recebíveis em vez de tomar linha no banco.
- Quais compradores comprariam a carteira e quanto ela rende em caixa.
- Comparar antecipação, FIDC, desconto e linha pelo custo no tempo de uso.

# Quando não ativar
- Analisar a carteira do lado do comprador (elegibilidade, subordinação, gatilhos) é a análise de carteira do fundo.
- Recebíveis de contrato longo vão para gestora de crédito ou securitizadora, com estrutura própria.
- Caixa semana a semana e o que vence é a demanda de caixa de curto prazo, que esta alimenta.

# Inputs mínimos e substitutos
- Carteira por sacado e situação na data: valor, vencimento, atraso, registro da duplicata.
- Contratos dos maiores clientes, para vedação de cessão, e a informação se o cliente tem programa de antecipação a fornecedores.
- Tabela de dívida com cessões, ônus e o que resta da cesta permitida da escritura.
- Necessidade: valor médio, pico, data em que o dinheiro precisa estar disponível e tempo de uso.
- Critérios e preços de cada porta como faixa de mercado até a proposta; DI anual adotado.
- Sem o maior sacado de um grupo pulverizado, o sublimite não é provado: o volume é um teto e a lacuna vai junto.

# Sequência operacional
1. [human_judgment] Enquadrar :: Necessidade, prazo, tempo de uso e o que a pergunta precisa | evidence: base autorizada, fontes e versões
2. [deterministic] Classificar a carteira :: Cada grupo pelo contrato, pelo ônus, pelo atraso e pelo registro | evidence: carteira, contratos e tabela de dívida adotados
3. [deterministic] Dimensionar as portas :: Elegibilidade e sublimite por sacado; programa do cliente só para o próprio cliente | evidence: critérios adotados
4. [deterministic] Custear :: Mesmo valor e tempo de uso; taxa convertida; IOF e comissão | evidence: premissas adotadas
5. [deterministic] Efeitos :: Balanço, dívida medida e cesta da negative pledge por porta | evidence: tabela de dívida adotada
6. [deterministic] Plano e prazo :: Da porta mais barata até o pico, linha como reserva; início pelo prazo da porta | evidence: base adotada
7. [human_judgment] Devolver :: A carteira cedível e os motivos, as portas com volume e custo, o que decide, a pergunta e o prazo | evidence: base autorizada, fontes e versões

# Cálculos determinísticos
- Elegibilidade pelo núcleo de elegibilidade de carteira: atraso, prazo remanescente, cessão permitida, ônus e registro. Registro ausente é condição precedente; os outros motivos excluem.
- Programa do próprio cliente compra só esse cliente e dispensa a anuência; sacado com programa ativo vai pelo programa e não é oferecido às outras portas.
- Sublimite por sacado: um sacado fica no menor entre o saldo e o sublimite; um grupo pulverizado só é provado dentro do sublimite pelo maior sacado, senão o volume é teto. Grupo maior que o número de sacados vezes o maior saldo é dado contraditório e é recusado. Cada sacado nomeado tem uma chave canônica (documento ou chave de registro); os lotes de um mesmo sacado somam a exposição antes do sublimite, dentro de cada porta. Grupo pulverizado tem a chave do seu conjunto de sacados, que não pode ser de outro item, e declara se o conjunto é disjunto dos demais; sem a declaração, o sublimite não é provado e o volume é teto com lacuna. Lotes de um sacado com contrato ou programa diferentes, ou programa que nomeia só um dos lotes, são recusados.
- Cedível = soma, por grupo, do maior volume que alguma porta de venda compra; bruta = cedível + excluída, sem resíduo.
- Taxa mensal: fator (1 + taxa) elevado a dias corridos sobre 30; ano efetivo = (1 + taxa) elevado a 12, menos 1. DI mais spread: (1 + DI) vezes (1 + spread), elevado a dias úteis sobre 252. Spread sobre o DI = (1 + taxa anual) sobre (1 + DI), menos 1.
- Custo = juros pelo tempo de uso + IOF diário sobre os dias de cada desembolso, com teto, + IOF adicional por desembolso + comissão. Desembolsos inteiros: rolagem iniciada dentro do tempo de uso é um desembolso e paga o IOF adicional inteiro; o último pode ser mais curto (180 dias com rolagem de 50 são quatro desembolsos de 50, 50, 50 e 30 dias).
- Coobrigação mantém o valor como passivo e soma à dívida medida; venda sem regresso sai do balanço. Venda não é garantia real (confirmar com o jurídico); crédito com cessão usa a cesta da negative pledge.
- Plano: portas pela ordem de custo; cada porta compra, grupo a grupo, o menor entre o que ela aceita, o saldo ainda não vendido do grupo e o que falta para o pico, e mostra a capacidade que tinha; a última recebe só o que cobre o pico; linha bancária como reserva. Início = data da necessidade menos o maior prazo das portas do plano.
- Volume cedível por mês = maior volume de FIDC vezes 30 sobre o prazo médio; necessidade sazonal não leva a operação dedicada.
- Precisão: aritmética decimal de alta precisão, sem arredondamento intermediário.

# Julgamentos permitidos
- Dizer que a diferença de custo é pequena quando é, e o que decide: negative pledge, efeito no covenant, diversificação de credores.
- Recomendar processo com vários compradores ao mesmo tempo e a linha em negociação até a primeira compra.
- Levantar a hipótese do programa do maior cliente como a que pode mudar a conta.

# Perguntas que mudam o trabalho
- O cliente com vedação de cessão tem programa de antecipação a fornecedores?
- O ERP já emite duplicata escritural?
- Qual o maior sacado de cada grupo pulverizado, e algum deles aparece em outro grupo?

# Red flags
- Tratar a carteira bruta como cedível.
- Ceder recebível vedado ou onerado.
- Recomendar veículo próprio para necessidade sazonal.
- Comparar taxa ao mês com taxa ao ano sem converter.
- Prometer aprovação ou nomear fundo sem aderência ao mandato.

# Stop conditions
- Número sem contribuição adotada vira lacuna; a carteira não é montada com valor presumido.
- Programa sem o cliente ativo, venda com garantia, desconto sem regresso e linha com elegibilidade de carteira são recusados.
- O pacote não contata comprador, não escolhe fundo, não aprova crédito, não emite opinião jurídica ou contábil e não publica nem altera a base.

# Outputs
- schemaVersion (string, required): Versão do pacote | values: receivables-funding-packet.v1
- status (enum, required): Suficiência do pacote | values: framed, partial, prepared_for_human_review
- result (object, required): Carteira por grupo, portas com volume e custo, plano, prazo, operação dedicada, perguntas e lacunas
- readings (object, required): Cedível e exclusões, portas por custo com efeitos, plano, reserva, início, condições precedentes, liberações, perguntas e processo
- exclusions (array, required): Contato com comprador, escolha de fundo, aprovação de crédito, opinião jurídica, opinião contábil
- grantsExecution (boolean, required): Sempre falso
- grantsPublication (boolean, required): Sempre falso
- fingerprint (string, required): Hash do pacote

# Exemplos
## Bom
- Da carteira de R$ 62 milhões, cerca de R$ 25 milhões podem ser vendidos hoje. Ficam fora R$ 37 milhões: R$ 19,8 milhões da rede A têm vedação de cessão, R$ 12 milhões estão cedidos ao Bradesco até o pré-pagamento, R$ 2,2 milhões estão vencidos e R$ 1,5 milhão de cada uma das redes E e F passa do sublimite de R$ 3 milhões por sacado. Para R$ 17 milhões por seis meses, o FIDC com coobrigação custa perto de R$ 1,75 milhão contra R$ 1,82 milhão da linha; a rede A tem programa de antecipação a fornecedores?
## Ruim
- "Com R$ 60 milhões de carteira, vocês levantam algo próximo desse valor, a 1,5% a 3% ao mês." (carteira bruta como cedível, sem comparar com a linha)
- "Recomendo montar um FIDC próprio." (veículo próprio para necessidade sazonal)

# Testes
## Unit
- packages/financial-core/src/receivables-funding.test.ts: núcleo contra o oráculo da ficha.
- packages/financial-model/src/receivables-funding-packet.test.ts: leitor adotado e pacote.
- packages/financial-model/src/receivables-funding-premises.test.ts: premissas, composição e ida e volta.
## Gold
- gross-portfolio-is-not-assignable, every-exclusion-carries-its-reason, options-sized-by-eligibility-and-sublimit, cost-for-the-time-in-use-against-the-bank-line, iof-where-it-applies, discount-iof-on-whole-draws, monthly-rates-converted-before-comparing, recourse-on-the-balance-sheet-and-the-covenant, sale-is-not-a-guarantee-under-the-negative-pledge, asks-about-retailer-a-program, fifteen-to-thirty-days-with-registration-as-condition-precedent, several-buyers-and-the-bank-line-as-reserve, no-dedicated-vehicle-for-a-seasonal-need, retailer-a-program-reorders-the-plan, one-debtor-split-across-lots-shares-the-sublimit, unsold-balance-goes-to-the-next-buyer, encumbered-bucket-released-under-the-same-sublimit, largest-debtor-unknown-is-a-gap-not-a-default, absent-peak-is-a-gap-not-a-default
## Adversarial
- Base adulterada, resultado livre no pedido, concessão fabricada, promessa de aprovação fabricada, programa comprando cliente sem programa, política tentando aceitar recebível onerado, venda com garantia, desconto sem regresso, linha com elegibilidade de carteira, taxa sem período declarado, ônus sem credor, pico abaixo da média, maior sacado acima do grupo, grupo maior que os sacados comportam, chave de sacado repetida entre grupo e sacado nomeado, lotes de um sacado com contratos diferentes, número lido em outro cenário.
## Aceitação
- Reproduzir o caso de calibração pelo oráculo independente sem alterar seus scripts.
- Executar a conversa da ficha C35 turno a turno pela interface real; guardar plano, versões, cálculo, resposta, custo e latência.

# Evidência
## Hierarquia
- Carteira por sacado e relatório de contas a receber; contratos dos clientes; tabela de dívida com cessões e cesta da escritura; critérios e faixas do módulo de recebíveis.
- Ficha C35 e seu oráculo como calibração independente, nunca como dado de outra companhia. O oráculo libera 90% das redes C e D depois do pré-pagamento; o método aplica o mesmo sublimite e devolve um teto.
- Reprodução: com as mesmas entradas do oráculo, risco sacado B e os dois FIDCs ficam dentro de R$ 0,02 milhão. A linha reproduz dentro da tolerância com entrada diferente: IOF diário sobre 180 dias, contra 182 no oráculo (R$ 0,003 milhão a menos). O desconto difere por convenção: o oráculo cobra 3,6 rolagens fracionárias; o método cobra quatro desembolsos inteiros, R$ 1,99 milhão contra R$ 1,96 milhão, sem mudar a ordem das portas.
## Regras
- Nenhum valor de calibração vira parâmetro de produção.
- Cada número do pacote abre até o operando adotado, sua origem e sua versão.

# Aprovação profissional e publicação governada
Conteúdo profissional pendente de aprovação do fundador para esta versão. Revisão técnica independente separada da autoria. Publicação e ativação seguem os atos de operador já existentes; nada neste documento concede execução.

# Narrativa
## N1. A decisão que organiza o trabalho
O tesoureiro quer saber se a carteira paga a safra no lugar da linha do banco. A pergunta real é quanto da carteira vira dinheiro, com quem, a que custo e em quanto tempo, e o que isso faz no balanço e nos contratos.

## N2. Árvore de decisão
- Cliente com vedação de cessão: perguntar se ele tem programa de antecipação a fornecedores antes de descartar o volume.
- Cliente com programa ativo: o programa vem primeiro, no risco dele, sem regresso e sem IOF.
- Carteira livre e pulverizada: FIDC multicedente com vários compradores ao mesmo tempo, linha bancária como reserva até a primeira compra.
- Necessidade estrutural acima do ponto de virada o ano todo: estudar operação dedicada; necessidade sazonal não justifica veículo próprio.

## N3. Suficiência por conclusão
- Para a carteira cedível: carteira por sacado e situação, contratos dos maiores clientes, tabela de dívida com cessões e ônus.
- Para o volume por porta: critérios de elegibilidade e sublimite por sacado, com o maior sacado de cada grupo pulverizado.
- Para o custo: taxa com o período declarado, IOF, comissão e tempo de uso. O que faltar vira lacuna declarada.

## N4. Voz e três níveis de afirmação
Fato (a carteira, os contratos, as cessões), leitura (o que cada porta compra e o efeito contábil) e recomendação (a ordem das portas e o prazo) separados. Faixas de mercado ditas como faixas; nenhum fundo nomeado e nenhuma aprovação prometida.

# Template
## T1. Uma leitura útil, com evidência aprofundável
1. Quanto da carteira é cedível, contra a bruta, e o motivo de cada exclusão.
2. As portas com volume, custo para o mesmo valor e tempo, IOF e taxa convertida, contra a linha.
3. O que decide quando o custo empata: negative pledge, covenant, credores.
4. A pergunta que pode mudar a conta.
5. Prazo, condição precedente e processo com vários compradores, linha como reserva.

## T2. Peças
Tabela das portas com volume, custo, IOF e efeito no balanço; ponte da carteira bruta à cedível; um elemento em foco, fundo branco, sem vermelho.

# Regra
## R1. Precedência
Contrato do cliente e tabela de dívida prevalecem sobre a carteira informada; proposta prevalece sobre faixa de mercado.

## R2. Comparação
Todas as portas no mesmo valor e tempo de uso; taxa ao mês convertida para ano efetivo antes de comparar.

## R3. Compradores
Faixas de mercado não nomeiam fundo; nenhuma aprovação é prometida; nenhum comprador é contatado.

# Qualidade
## Q1. Teste do MD
A resposta corrige o número de partida com o motivo de cada exclusão? As portas têm volume e custo contra a linha? O IOF e a conversão de taxa estão lá? O efeito contábil e a negative pledge foram ditos? A pergunta do programa do maior cliente foi feita? Um MD de mercado assinaria?

## Q2. Verificação
Corridas gold, adversarial e de consistência reexecutadas a cada versão; revisão técnica independente; aprovação de conteúdo registrada; conversa real pela interface antes de declarar a demanda atendida.

# Fundamentação profissional
## Carteira bruta e cedível
Regulamento de FIDC compra crédito livre de ônus, não vencido e cedível; cliente grande costuma vedar a cessão e concentra o limite por sacado.

## Programa do cliente
Rede que veda a cessão costuma ter programa próprio de antecipação a fornecedores com banco parceiro, no risco dela, sem regresso e sem IOF.

## Efeito contábil
Com coobrigação o risco fica com a cedente e o valor tende a ficar no passivo; sem coobrigação sai do balanço e reduz a dívida medida.

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
      "id": "receivables-funding.request-framing",
      "version": "2026.10.26-v1",
      "kind": "narrative",
      "title": "Enquadramento profissional dos recebíveis para giro",
      "inputs": {
        "id": "receivables-funding.framing-input",
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
        "id": "receivables-funding.framing-output",
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
      "text": "Narrativa\nN1. A decisão que organiza o trabalho\nO tesoureiro quer saber se a carteira paga a safra no lugar da linha do banco. A pergunta real é quanto da carteira vira dinheiro, com quem, a que custo e em quanto tempo, e o que isso faz no balanço e nos contratos.\n\nN2. Árvore de decisão\n- Cliente com vedação de cessão: perguntar se ele tem programa de antecipação a fornecedores antes de descartar o volume.\n- Cliente com programa ativo: o programa vem primeiro, no risco dele, sem regresso e sem IOF.\n- Carteira livre e pulverizada: FIDC multicedente com vários compradores ao mesmo tempo, linha bancária como reserva até a primeira compra.\n- Necessidade estrutural acima do ponto de virada o ano todo: estudar operação dedicada; necessidade sazonal não justifica veículo próprio.\n\nN3. Suficiência por conclusão\n- Para a carteira cedível: carteira por sacado e situação, contratos dos maiores clientes, tabela de dívida com cessões e ônus.\n- Para o volume por porta: critérios de elegibilidade e sublimite por sacado, com o maior sacado de cada grupo pulverizado.\n- Para o custo: taxa com o período declarado, IOF, comissão e tempo de uso. O que faltar vira lacuna declarada.\n\nN4. Voz e três níveis de afirmação\nFato (a carteira, os contratos, as cessões), leitura (o que cada porta compra e o efeito contábil) e recomendação (a ordem das portas e o prazo) separados. Faixas de mercado ditas como faixas; nenhum fundo nomeado e nenhuma aprovação prometida."
    },
    {
      "id": "receivables-funding.packet",
      "version": "2026.10.26-v1",
      "kind": "rule",
      "title": "Ler a carteira contra cada porta e custear contra a linha bancária",
      "authority": "house",
      "statement": "Separar a carteira cedível da bruta com o motivo de cada exclusão, dimensionar cada porta pela elegibilidade e pelo sublimite, custear todas pelo mesmo valor e tempo de uso contra a linha bancária com as taxas convertidas antes de comparar e o IOF onde houver, dizer o efeito no balanço, no covenant e na negative pledge, ordenar as portas da mais barata com a linha como reserva e datar o início, sem contatar comprador, sem nomear fundo, sem prometer aprovação e sem adotar ou publicar por cálculo.",
      "executor": {
        "module": "@offroad/financial-model",
        "exportName": "prepareReceivablesFundingPacket",
        "version": "2026.10.26-v1"
      },
      "inputs": {
        "id": "receivables-funding-packet-input",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "receivables-funding-packet-input.v1"
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
                  "needAverage": {
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
                  "needPeak": {
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
                  "needStartDate": {
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
                  "calendarDays": {
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
                  "businessDays": {
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
                  "annualDi": {
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
                  "averageTermDays": {
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
                  "needProfile": {
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
                  "vehicleThresholdMin": {
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
                  "vehicleThresholdMax": {
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
                  "lienBasketRemaining": {
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
                  "items": {
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
                          },
                          "contract": {
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
                          "encumbrance": {
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
                          "encumbranceHolder": {
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
                          "releaseEvent": {
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
                          "originDate": {
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
                          "dueDate": {
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
                          "registration": {
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
                          "creditTier": {
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
                          "anchorProgram": {
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
                          "debtorCount": {
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
                          "largestDebtorAmount": {
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
                          "debtorKey": {
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
                          "debtorSetDisjoint": {
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
                  "options": {
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
                          "recourse": {
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
                          "rateBasis": {
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
                          "rolloverDays": {
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
                          "collateral": {
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
                          "leadDaysMin": {
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
                          "leadDaysMax": {
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
                          "eligibility": {
                            "required": true,
                            "value": {
                              "type": "union",
                              "variants": [
                                {
                                  "type": "object",
                                  "fields": {
                                    "maxDaysPastDue": {
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
                                    "maxRemainingTermDays": {
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
                                    "registrationRule": {
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
                                    "minCreditTier": {
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
                                    "sublimitPerDebtor": {
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
                                    "anchorItemIds": {
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
      "outputs": {
        "id": "receivables-funding-packet-output",
        "version": "2026.10.26-v1",
        "value": {
          "type": "object",
          "fields": {
            "schemaVersion": {
              "required": true,
              "value": {
                "type": "enum",
                "values": [
                  "receivables-funding-packet.v1"
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
                        "adopted-receivables-funding.v1"
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
                  "funding": {
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
                                  "receivables-funding.v1"
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
                            "referenceDate": {
                              "required": true,
                              "value": {
                                "type": "date"
                              }
                            },
                            "need": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "average": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "peak": {
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
                                  "calendarDays": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "businessDays": {
                                    "required": true,
                                    "value": {
                                      "type": "integer"
                                    }
                                  },
                                  "profile": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "seasonal",
                                        "structural"
                                      ]
                                    }
                                  }
                                }
                              }
                            },
                            "portfolio": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "gross": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "assignable": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "excluded": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "items": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "itemId": {
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
                                          "assignable": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "excluded": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "reasons": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "enum",
                                                "values": [
                                                  "zero_balance",
                                                  "defaulted",
                                                  "past_due",
                                                  "remaining_term",
                                                  "seasoning",
                                                  "not_assignable",
                                                  "evidence_unverified",
                                                  "anchor_unverified",
                                                  "registration_missing",
                                                  "registration_conflict",
                                                  "encumbered",
                                                  "disputed",
                                                  "related_party",
                                                  "sector_outside_policy",
                                                  "credit_tier_outside_policy",
                                                  "debtor_sublimit",
                                                  "not_offered_to_any_sale_option"
                                                ]
                                              }
                                            }
                                          },
                                          "curable": {
                                            "required": true,
                                            "value": {
                                              "type": "array",
                                              "items": {
                                                "type": "enum",
                                                "values": [
                                                  "zero_balance",
                                                  "defaulted",
                                                  "past_due",
                                                  "remaining_term",
                                                  "seasoning",
                                                  "not_assignable",
                                                  "evidence_unverified",
                                                  "anchor_unverified",
                                                  "registration_missing",
                                                  "registration_conflict",
                                                  "encumbered",
                                                  "disputed",
                                                  "related_party",
                                                  "sector_outside_policy",
                                                  "credit_tier_outside_policy",
                                                  "debtor_sublimit",
                                                  "not_offered_to_any_sale_option"
                                                ]
                                              }
                                            }
                                          },
                                          "encumbranceHolder": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
                                                  "type": "string"
                                                },
                                                {
                                                  "type": "null"
                                                }
                                              ]
                                            }
                                          },
                                          "releaseEvent": {
                                            "required": true,
                                            "value": {
                                              "type": "union",
                                              "variants": [
                                                {
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
                                  "releases": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "itemId": {
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
                                          "holder": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "releaseEvent": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "assignableAfterRelease": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "verified": {
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
                            "options": {
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
                                          "anchor_program",
                                          "fidc",
                                          "bank_discount",
                                          "bank_line"
                                        ]
                                      }
                                    },
                                    "recourse": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "with_recourse",
                                          "without_recourse"
                                        ]
                                      }
                                    },
                                    "indicative": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "volume": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "string"
                                          },
                                          {
                                            "type": "null"
                                          }
                                        ]
                                      }
                                    },
                                    "volumeVerified": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "byItem": {
                                      "required": true,
                                      "value": {
                                        "type": "array",
                                        "items": {
                                          "type": "object",
                                          "fields": {
                                            "itemId": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "offered": {
                                              "required": true,
                                              "value": {
                                                "type": "boolean"
                                              }
                                            },
                                            "reasons": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "enum",
                                                  "values": [
                                                    "zero_balance",
                                                    "defaulted",
                                                    "past_due",
                                                    "remaining_term",
                                                    "seasoning",
                                                    "not_assignable",
                                                    "evidence_unverified",
                                                    "anchor_unverified",
                                                    "registration_missing",
                                                    "registration_conflict",
                                                    "encumbered",
                                                    "disputed",
                                                    "related_party",
                                                    "sector_outside_policy",
                                                    "credit_tier_outside_policy",
                                                    "debtor_sublimit",
                                                    "not_offered_to_any_sale_option"
                                                  ]
                                                }
                                              }
                                            },
                                            "curable": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "enum",
                                                  "values": [
                                                    "zero_balance",
                                                    "defaulted",
                                                    "past_due",
                                                    "remaining_term",
                                                    "seasoning",
                                                    "not_assignable",
                                                    "evidence_unverified",
                                                    "anchor_unverified",
                                                    "registration_missing",
                                                    "registration_conflict",
                                                    "encumbered",
                                                    "disputed",
                                                    "related_party",
                                                    "sector_outside_policy",
                                                    "credit_tier_outside_policy",
                                                    "debtor_sublimit",
                                                    "not_offered_to_any_sale_option"
                                                  ]
                                                }
                                              }
                                            },
                                            "retained": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            },
                                            "sublimitVerified": {
                                              "required": true,
                                              "value": {
                                                "type": "boolean"
                                              }
                                            },
                                            "unverifiedBy": {
                                              "required": true,
                                              "value": {
                                                "type": "array",
                                                "items": {
                                                  "type": "enum",
                                                  "values": [
                                                    "largest_debtor",
                                                    "debtor_set_overlap"
                                                  ]
                                                }
                                              }
                                            },
                                            "sublimitExcess": {
                                              "required": true,
                                              "value": {
                                                "type": "string"
                                              }
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "rates": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "basis": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "monthly",
                                                "annual",
                                                "di_plus"
                                              ]
                                            }
                                          },
                                          "quoted": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "annualEffective": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "monthlyEquivalent": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "spreadOverDi": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "cost": {
                                      "required": true,
                                      "value": {
                                        "type": "object",
                                        "fields": {
                                          "amount": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "calendarDays": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "businessDays": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "draws": {
                                            "required": true,
                                            "value": {
                                              "type": "integer"
                                            }
                                          },
                                          "iofDays": {
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
                                          "total": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "allInPeriod": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "allInAnnual": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    },
                                    "iofApplies": {
                                      "required": true,
                                      "value": {
                                        "type": "boolean"
                                      }
                                    },
                                    "coversAverage": {
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
                                    "coversPeak": {
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
                                    "balanceSheet": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "derecognized",
                                          "tends_to_remain_as_liability",
                                          "liability"
                                        ]
                                      }
                                    },
                                    "measuredDebtAdded": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "lien": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "not_a_guarantee_confirm_with_counsel",
                                          "uses_basket",
                                          "uses_basket_if_collateralized",
                                          "none"
                                        ]
                                      }
                                    },
                                    "fitsLienBasket": {
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
                                    "leadDays": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
                                            "type": "object",
                                            "fields": {
                                              "min": {
                                                "required": true,
                                                "value": {
                                                  "type": "integer"
                                                }
                                              },
                                              "max": {
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
                                    }
                                  }
                                }
                              }
                            },
                            "ranking": {
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
                                    "total": {
                                      "required": true,
                                      "value": {
                                        "type": "string"
                                      }
                                    },
                                    "differenceToBankLine": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
                                          {
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
                            "bankLine": {
                              "required": true,
                              "value": {
                                "type": "union",
                                "variants": [
                                  {
                                    "type": "string"
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
                                "type": "object",
                                "fields": {
                                  "steps": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "optionId": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          },
                                          "capacity": {
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
                                          "cumulative": {
                                            "required": true,
                                            "value": {
                                              "type": "string"
                                            }
                                          }
                                        }
                                      }
                                    }
                                  },
                                  "covered": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "coversPeak": {
                                    "required": true,
                                    "value": {
                                      "type": "boolean"
                                    }
                                  },
                                  "reserve": {
                                    "required": true,
                                    "value": {
                                      "type": "union",
                                      "variants": [
                                        {
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
                            "timing": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "startBy": {
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
                                  "slackDays": {
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
                                  "leadDaysMax": {
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
                                  "conditionsPrecedent": {
                                    "required": true,
                                    "value": {
                                      "type": "array",
                                      "items": {
                                        "type": "object",
                                        "fields": {
                                          "code": {
                                            "required": true,
                                            "value": {
                                              "type": "enum",
                                              "values": [
                                                "duplicata_registration",
                                                "other"
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
                            },
                            "dedicatedVehicle": {
                              "required": true,
                              "value": {
                                "type": "object",
                                "fields": {
                                  "monthlyAssignable": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "thresholdMin": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "thresholdMax": {
                                    "required": true,
                                    "value": {
                                      "type": "string"
                                    }
                                  },
                                  "profile": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "seasonal",
                                        "structural"
                                      ]
                                    }
                                  },
                                  "reading": {
                                    "required": true,
                                    "value": {
                                      "type": "enum",
                                      "values": [
                                        "not_for_seasonal_need",
                                        "worth_studying",
                                        "below_threshold",
                                        "borderline"
                                      ]
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
                                    "code": {
                                      "required": true,
                                      "value": {
                                        "type": "enum",
                                        "values": [
                                          "anchor_program_of_restricted_debtor",
                                          "anchor_program_terms",
                                          "duplicata_registration_capability"
                                        ]
                                      }
                                    },
                                    "itemId": {
                                      "required": true,
                                      "value": {
                                        "type": "union",
                                        "variants": [
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
                                          "largest_debtor_not_informed",
                                          "debtor_set_not_declared_disjoint",
                                          "lead_time_not_informed"
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
                          "buyer_contact",
                          "fund_selection",
                          "credit_approval",
                          "legal_opinion",
                          "accounting_opinion",
                          "debtor_dispute_and_related_party_screening",
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
                      "gross": {
                        "required": true,
                        "value": {
                          "type": "string"
                        }
                      },
                      "assignable": {
                        "required": true,
                        "value": {
                          "type": "string"
                        }
                      },
                      "assignableShare": {
                        "required": true,
                        "value": {
                          "type": "string"
                        }
                      },
                      "exclusions": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "itemId": {
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
                              "reasons": {
                                "required": true,
                                "value": {
                                  "type": "array",
                                  "items": {
                                    "type": "enum",
                                    "values": [
                                      "zero_balance",
                                      "defaulted",
                                      "past_due",
                                      "remaining_term",
                                      "seasoning",
                                      "not_assignable",
                                      "evidence_unverified",
                                      "anchor_unverified",
                                      "registration_missing",
                                      "registration_conflict",
                                      "encumbered",
                                      "disputed",
                                      "related_party",
                                      "sector_outside_policy",
                                      "credit_tier_outside_policy",
                                      "debtor_sublimit",
                                      "not_offered_to_any_sale_option"
                                    ]
                                  }
                                }
                              },
                              "holder": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "releaseEvent": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
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
                      "options": {
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
                                    "anchor_program",
                                    "fidc",
                                    "bank_discount",
                                    "bank_line"
                                  ]
                                }
                              },
                              "volume": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "volumeVerified": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "cost": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "differenceToBankLine": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
                                    {
                                      "type": "string"
                                    },
                                    {
                                      "type": "null"
                                    }
                                  ]
                                }
                              },
                              "annualEffective": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "spreadOverDi": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "iofApplies": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              },
                              "balanceSheet": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "derecognized",
                                    "tends_to_remain_as_liability",
                                    "liability"
                                  ]
                                }
                              },
                              "measuredDebtAdded": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "lien": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "not_a_guarantee_confirm_with_counsel",
                                    "uses_basket",
                                    "uses_basket_if_collateralized",
                                    "none"
                                  ]
                                }
                              },
                              "coversAverage": {
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
                        }
                      },
                      "plan": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "optionId": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "capacity": {
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
                              "cumulative": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              }
                            }
                          }
                        }
                      },
                      "planCoversPeak": {
                        "required": true,
                        "value": {
                          "type": "boolean"
                        }
                      },
                      "bankLineReserve": {
                        "required": true,
                        "value": {
                          "type": "union",
                          "variants": [
                            {
                              "type": "string"
                            },
                            {
                              "type": "null"
                            }
                          ]
                        }
                      },
                      "startBy": {
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
                      "slackDays": {
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
                      "conditionsPrecedent": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "code": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "duplicata_registration",
                                    "other"
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
                      "releases": {
                        "required": true,
                        "value": {
                          "type": "array",
                          "items": {
                            "type": "object",
                            "fields": {
                              "itemId": {
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
                              "releaseEvent": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "assignableAfterRelease": {
                                "required": true,
                                "value": {
                                  "type": "string"
                                }
                              },
                              "verified": {
                                "required": true,
                                "value": {
                                  "type": "boolean"
                                }
                              }
                            }
                          }
                        }
                      },
                      "dedicatedVehicle": {
                        "required": true,
                        "value": {
                          "type": "object",
                          "fields": {
                            "monthlyAssignable": {
                              "required": true,
                              "value": {
                                "type": "string"
                              }
                            },
                            "reading": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "not_for_seasonal_need",
                                  "worth_studying",
                                  "below_threshold",
                                  "borderline"
                                ]
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
                              "code": {
                                "required": true,
                                "value": {
                                  "type": "enum",
                                  "values": [
                                    "anchor_program_of_restricted_debtor",
                                    "anchor_program_terms",
                                    "duplicata_registration_capability"
                                  ]
                                }
                              },
                              "itemId": {
                                "required": true,
                                "value": {
                                  "type": "union",
                                  "variants": [
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
                                  "type": "string"
                                }
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
                            "buyers": {
                              "required": true,
                              "value": {
                                "type": "enum",
                                "values": [
                                  "several_in_parallel"
                                ]
                              }
                            },
                            "buyersNamed": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "buyersContacted": {
                              "required": true,
                              "value": {
                                "type": "boolean"
                              }
                            },
                            "approvalPromised": {
                              "required": true,
                              "value": {
                                "type": "boolean"
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
                    "buyer_contact",
                    "fund_selection",
                    "credit_approval",
                    "legal_opinion",
                    "accounting_opinion"
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
          "id": "receivables-funding.request-framing",
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
        "packages/credit-playbook/knowledge/reviews/runs/monetize-receivables-for-working-capital-2026-10-26-v1-gold/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/monetize-receivables-for-working-capital-2026-10-26-v1-adversarial/run.json",
        "packages/credit-playbook/knowledge/reviews/runs/monetize-receivables-for-working-capital-2026-10-26-v1-consistency/run.json"
      ]
    }
  ]
}
```
