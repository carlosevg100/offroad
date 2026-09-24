import type {ReferenceDataProposalFamily} from "./types";

/**
 * Intake, materials and quality control: request batches, archetype requirements, question sets,
 * rounding, QC tolerances and red flags. Every value below is a draft prepared for the founder's
 * review; the professional text of each key lives in `knowledge/reference-data/intake-materials-qc.md`.
 *
 * Field names carry their unit (`...Days`, `...BusinessDays`, `...Months`, `...Pct`, `...Pp`,
 * `...Brl`). Decimal thresholds are strings, as the registry and the red-flag consumer read them.
 * Where a consumer already reads a shape (`red_flag_policies.thresholds`, `IntakePolicy`), the
 * field names here are the ones it reads.
 */

const VERSION = "2026.09.24-v1";
const AS_OF = "2026-09-24";
const OBSERVED_BY = "Offroad (Claude, executor), 24/09/2026, aguardando revisão do fundador";
const CARD = "knowledge/reference-data/intake-materials-qc.md";
const PLAYBOOK_URL = "https://github.com/carlosevg100/offroad/blob/main/packages/credit-playbook/knowledge/HOUSE-PLAYBOOK-COMPLETO-v2.md";
const CONSTITUTION_URL = "https://github.com/carlosevg100/offroad/blob/main/docs/build/OFFROAD_DCM_OPERATING_CONSTITUTION.md";

export const intakeMaterialsQcProposals: ReferenceDataProposalFamily = {
  "policy.intake.request_batch.max_items": {
    version: VERSION,
    value: {
      defaultActiveRequests: 4,
      maxActiveRequests: 5,
      fifthSlot: {
        opensOnlyForPriority: "case_blocker",
        condition: "o quinto item, na ordem de prioridade do estágio ativo, é bloqueador de entendimento (requisito do nível mínimo)",
      },
      priorityOrder: ["case_blocker", "structure_driver", "mandate_driver", "material_quality"],
      tieBreakers: ["purpose_order", "playbook_order"],
      purposeOrder: ["financials", "structure", "investor_case", "storytelling"],
      activeStageOrder: ["now", "structuring"],
      neverActiveStages: ["diligence", "closing"],
      batchMode: "closed_batch",
      nextBatchCondition: "todo item do lote atual resolvido (satisfeito; não se aplica com motivo; não disponível; após NDA) ou dispensado por decisão registrada do responsável pelo caso, e a evidência recebida lida pelo sistema",
      itemDefinition: "um requisito por item; artefatos alternativos aceitos para o mesmo requisito contam como um único item",
      ladderBeforeRequest: {
        degrees: [1, 2, 3],
        rule: "IN-13: busca na sala classificada, derivação declarada e fonte pública registrada, com o motivo da descida, antes de o item entrar no lote",
      },
      suppressAlreadySatisfied: true,
      responseWindowsKey: "policy.red-flags.response-sla",
      telemetry: {
        targetBatchesBeforeAnalysis: 3,
        unavailableShareReviewTrigger: "0.25",
        unavailableShareWindowClosedBatches: 20,
        reviewRuleOnTrigger: "IN-11: auditoria da lista do arquétipo",
      },
    },
    unit: "itens ativos por lote",
    source: {
      title: "Constituição de Produto e Operação da Offroad, versão 2.6, seção 6.2 (quatro solicitações por padrão e nunca mais de cinco); House Playbook v2.1, IN-13 e IN-14",
      url: CONSTITUTION_URL,
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: `${CARD}#policy.intake.request_batch.max_items`,
  },

  "policy.intake.archetype-requirements": {
    version: VERSION,
    value: {
      tiers: {
        minimum: {gate: "etapa_05_conciliacao", test: "decisão que fica impossível sem o item (IN-11)", blocksAnalysisStart: true},
        target: {gate: "etapa_07_e_materiais", test: "conclusão de estrutura ou material que sairia com limitação declarada sem o item", missingItemRequires: "limitação registrada pelo responsável pelo caso e divulgada no memo (IN-16)"},
        ideal: {gate: "nenhum", test: "item que muda preço ou velocidade de execução", blocksAnalysisStart: false},
      },
      sufficiencyDisplay: "mínimo N de M; alvo X de Y; ideal Z de W",
      archetypeTierOverridesCommon: true,
      periods: {
        annualFiscalYears: 3,
        annualFiscalYearsWhenYounger: "todos os exercícios encerrados",
        interimMaxAgeDaysAtRequest: 90,
        interimMaxAgeDaysAtMaterialRelease: 135,
        interimPriorYearComparablePeriodTier: "target",
        monthlySeriesMonthsMinimumWorkingCapital: 12,
        monthlySeriesMonthsTarget: 24,
        monthlySeriesGovernedBy: "policy.seasonality.materiality (window.minimumMonths 24; quarterlyDataMinimumQuarters 8)",
        bankStatementsMonthsIdeal: 12,
        bankStatementsMonthsVentureTarget: 6,
        agingDatesCount: 3,
        agingWindowMonths: 12,
        agingDatesGovernedBy: "policy.receivables.aging (snapshots: último fechamento mensal, fechamento do exercício anterior, fechamento trimestral do pico sazonal de recebíveis)",
        covenantAndWaiverLookbackMonths: 36,
        rampHistoryMonths: 24,
        ventureMetricsMonths: 24,
        runwayBurnWindowMonths: 3,
        receivablesLossHistoryMonths: 24,
        lienCertificateMaxAgeDays: 30,
      },
      maxDirectQuestionsDayZero: 4,
      ladderFirstItems: {
        info_why_now: "quadro do pedido registrado no intake (IN-01: uso, urgência e consequência)",
        info_business_model: "pesquisa pública da companhia e material institucional já recebido",
        info_cash_cycle: "derivação de PMR, PME e PMP das demonstrações e balancetes",
        info_runway: "derivação do caixa sobre a queima líquida média de 3 meses",
        info_deal_terms: "extração dos documentos da transação (LOI, MOU ou SPA)",
        info_equipment_profile: "extração da proposta ou do orçamento do fornecedor",
        corporate_identity: "cadastro público do CNPJ e certidão da junta comercial; organograma só quando IN-02 indicar grupo",
        request: "quadro do pedido registrado no intake (IN-01)",
      },
      common: {
        minimum: ["financials_historical", "financials_interim", "debt_schedule", "corporate_identity", "request", "info_why_now", "info_business_model", "info_customer_concentration"],
        target: ["auditor_opinion", "monthly_financials_24m", "info_related_parties", "info_seasonality", "info_management"],
        ideal: ["reviewed_interim", "institutional_materials", "bank_statements", "tax_clearance"],
        noticeOnly: ["closing_corporate_approvals", "closing_certificates", "closing_security_registration", "closing_legal_opinion", "closing_disbursement_evidence"],
      },
      archetypes: {
        growth_expansion: {
          playbookRule: "IN-04",
          addMinimum: ["project_plan", "info_ramp_history", "info_capex_actual"],
          addTarget: ["project_schedule", "info_permits", "unit_economics", "project_contracts", "info_project_spent_to_date", "info_contractor", "info_minimum_viable_scope"],
          conditionalTarget: {
            appraisal: "pacote com alienação fiduciária de imóvel ou de equipamento",
            receivables_aging_for_collateral: "pacote com cessão fiduciária de recebíveis",
          },
          addIdeal: [],
          minimumCount: 11,
        },
        working_capital: {
          playbookRule: "IN-05",
          addMinimum: ["revenue_evidence", "info_assigned_receivables", "info_cash_cycle", "info_seasonality", "info_supplier_finance"],
          addTarget: ["receivables_aging", "payables_aging", "info_customer_terms_change"],
          conditionalTarget: {customer_contracts: "pacote com cessão fiduciária de recebíveis de contratos"},
          addIdeal: [],
          contentRules: {debt_schedule: "limites aprovados e utilizados de cada linha de curto prazo, com data de renovação (D-05)"},
          minimumCount: 13,
        },
        refinance: {
          playbookRule: "IN-06",
          addMinimum: ["debt_contracts", "info_prepayment", "info_waiver_in_progress"],
          addTarget: ["collateral_release", "waivers", "lien_certificates"],
          conditionalTarget: {},
          addIdeal: [],
          contentRules: {debt_schedule: "relação completa contrato a contrato com cronograma; reconstrução pelas notas explicativas não satisfaz o mínimo neste arquétipo"},
          minimumCount: 11,
        },
        acquisition: {
          playbookRule: "IN-07",
          addMinimum: ["target_financials", "transaction_documents", "info_synergies", "info_deal_terms"],
          addTarget: ["due_diligence", "post_structure"],
          conditionalTarget: {},
          addIdeal: [],
          perimeter: "compradora e adquirida; demonstrações e posição intermediária exigidas para as duas",
          minimumCount: 12,
        },
        equipment_finance: {
          playbookRule: "IN-08",
          addMinimum: ["equipment_quote", "info_asset_productivity", "info_equipment_profile"],
          addTarget: ["equipment_appraisal"],
          conditionalTarget: {},
          addIdeal: ["insurance"],
          minimumCount: 11,
        },
        venture_debt: {
          playbookRule: "IN-09",
          addMinimum: ["metrics_export", "cap_table_and_round", "info_runway", "info_next_round", "info_board_debt_approval"],
          addTarget: ["bank_statements", "info_warrant_appetite"],
          conditionalTarget: {},
          addIdeal: [],
          minimumCount: 13,
        },
        receivables: {
          playbookRule: "IN-10",
          route: "receivables_vertical",
          catalogue: "receivables-evidence 2026.08.28-v1 (packages/credit-playbook/src/receivables-evidence.ts)",
          minimumFacts: ["claim_existence_evidenced", "analytical_tape_available", "cedent_ownership_confirmed", "unresolved_prior_assignment_or_lien", "title_control_and_duplicate_check_available", "contractual_assignability_confirmed", "historical_performance_available", "performance_or_delivery_evidenced", "company_credit_package_available"],
          targetFacts: ["debtor_notice_or_acknowledgement_feasible", "controlled_collections_feasible", "servicing_capability_available"],
          idealFactsByStructure: ["recurring_origination_available", "buyer_confirmed_program_available", "economically_viable_scale_confirmed", "institutional_vehicle_governance_ready", "eligible_collateral_pool_identified", "security_perfection_feasible"],
        },
        other: {
          playbookRule: "IN-03",
          addMinimum: [],
          addTarget: [],
          conditionalTarget: {},
          addIdeal: [],
          contentRules: {request: "uso dos recursos com valor por destinação"},
          deskReviewBusinessDays: 1,
          minimumCount: 8,
        },
      },
      groupExpansion: {
        trigger: "IN-02 ou IN-24 indicam grupo econômico",
        materialEntityRule: "entidade que toma, garante ou gera o caixa da operação, ou com receita, ativo total ou dívida bruta igual ou superior a 10% do consolidado",
        materialEntityThresholdShare: "0.10",
        addPerMaterialEntity: ["financials_historical", "financials_interim"],
        addOnce: "organograma societário com participações e papéis das entidades",
      },
      substitutes: {
        financials_historical: {
          preferred: ["audited_financial_statements"],
          accepted: ["reviewed_interim_statements", "management_accounts"],
          verifiableEvidenceForUnaudited: "ECD transmitida ao Sped com recibo de entrega (IN RFB 2.003/2021, arts. 3º e 5º)",
          mandatoryAuditThresholds: {totalAssetsBrl: "240000000.00", grossRevenueBrl: "300000000.00", basis: "Lei 11.638/2007, art. 3º, parágrafo único; companhia ou grupo sob controle comum, no exercício anterior"},
          whenMandatoryAuditMissing: "substituto não aceito; ausência de auditoria obrigatória registrada como achado de conformidade",
          effectsOfSubstitute: ["buyer_universe_limited_unaudited", "disclosed_in_memo", "q09_reconciliation_required"],
        },
        financials_interim: {
          preferred: ["reviewed_interim_statements", "trial_balance"],
          accepted: ["erp_export", "management_accounts"],
          staleRule: "data-base acima de 90 dias no pedido exige atualização; acima de 135 dias na liberação de material bloqueia o material",
          effectsOfSubstitute: ["interim_unreviewed_label"],
        },
        debt_schedule: {
          preferred: ["debt_schedule"],
          accepted: ["loan_agreement", "debenture_indenture"],
          complementaryOnly: ["notas explicativas (reconstrução rotulada como estimativa)", "relatório SCR obtido pela companhia no Registrato (conciliação, D-23)"],
          effectsOfSubstitute: ["house_builds_schedule_from_contracts"],
        },
        corporate_identity: {
          preferred: ["corporate_docs", "company_registration"],
          accepted: ["cadastro público do CNPJ", "certidão simplificada da junta comercial"],
          effectsOfSubstitute: [],
        },
        monthly_financials_24m: {
          preferred: ["trial_balance", "erp_export"],
          accepted: ["management_accounts", "ECD com saldos mensais"],
          degradedSubstitute: "balancetes trimestrais de 8 trimestres, com ressalva registrada (Q-04; policy.seasonality.materiality)",
          effectsOfSubstitute: ["seasonality_single_cycle_label"],
        },
        auditor_opinion: {
          preferred: ["audited_financial_statements", "auditor_report_only"],
          accepted: [],
          whenCompanyUnaudited: "não se aplica, com motivo registrado",
          effectsOfSubstitute: [],
        },
        receivables_aging: {
          preferred: ["receivables_aging"],
          accepted: ["erp_export"],
          degradedSubstitute: "aging por faixa com os 10 maiores devedores e conciliação ao contas a receber",
          effectsOfSubstitute: ["disclosed_in_memo"],
        },
        bank_statements: {
          preferred: ["bank_statements"],
          accepted: ["open_finance_export"],
          degradedSubstitute: "declaração de saldos emitida pela instituição financeira",
          effectsOfSubstitute: [],
        },
      },
      newRequirements: {
        monthly_financials_24m: {source: "document", tier: "target", archetypes: "todos", acceptedKinds: ["trial_balance", "erp_export", "management_accounts"], period: "balancetes mensais dos últimos 24 meses", rules: ["Q-04", "Q-11"]},
        project_contracts: {source: "document", tier: "target", archetypes: ["growth_expansion"], acceptedKinds: ["supplier_contract", "project_memorandum", "technical_report"], period: "contratos relevantes assinados do projeto (obra, equipamentos, fornecimento)", rules: ["IN-04"]},
        lien_certificates: {source: "document", tier: "target", archetypes: ["refinance"], acceptedKinds: ["collateral_inventory", "regulatory_filing"], period: "certidões de ônus e gravames das garantias dadas, emitidas há no máximo 30 dias", rules: ["IN-06", "D-19"]},
        info_project_spent_to_date: {source: "information", tier: "target", archetypes: ["growth_expansion"], answerFormat: "currency", question: "Quanto do projeto já foi desembolsado, em quê e com que recursos?", rules: ["IN-04"]},
        info_contractor: {source: "information", tier: "target", archetypes: ["growth_expansion"], answerFormat: "text", question: "Quem executa a obra e em que regime de contratação (preço global, preço unitário ou administração)?", rules: ["IN-04"]},
        info_minimum_viable_scope: {source: "information", tier: "target", archetypes: ["growth_expansion"], answerFormat: "text", question: "O projeto funciona em escala menor ou em fases? Com qual valor mínimo?", rules: ["IN-04", "OP-07"]},
        info_supplier_finance: {source: "information", tier: "minimum", archetypes: ["working_capital"], answerFormat: "text", question: "A companhia usa antecipação a fornecedores (risco sacado, confirming ou forfait)? Com que saldo e com quais instituições?", rules: ["IN-05", "D-06"]},
        info_customer_terms_change: {source: "information", tier: "target", archetypes: ["working_capital"], answerFormat: "text", question: "O prazo de pagamento de algum cliente relevante mudou nos últimos 12 meses?", rules: ["IN-05", "RF-02"]},
        info_waiver_in_progress: {source: "information", tier: "minimum", archetypes: ["refinance"], answerFormat: "text", question: "Há waiver, repactuação ou negociação de covenant em curso com algum credor?", rules: ["IN-06", "D-21"]},
        info_deal_terms: {source: "information", tier: "minimum", archetypes: ["acquisition"], answerFormat: "text", question: "Qual o preço, a forma de pagamento, o earn-out e o tratamento da dívida da adquirida (assumida ou quitada)?", rules: ["IN-07"]},
        info_equipment_profile: {source: "information", tier: "minimum", archetypes: ["equipment_finance"], answerFormat: "text", question: "O bem é nacional ou importado, novo ou usado, de fornecedor credenciado? Qual o prazo de entrega?", rules: ["IN-08"]},
        info_board_debt_approval: {source: "information", tier: "minimum", archetypes: ["venture_debt"], answerFormat: "text", question: "O acordo de investimento exige aprovação dos investidores ou do conselho para contrair dívida e dar garantias? Em que termos?", rules: ["IN-09"]},
        info_warrant_appetite: {source: "information", tier: "target", archetypes: ["venture_debt"], answerFormat: "percentage", question: "Que diluição via warrant a companhia aceita em troca de preço menor?", rules: ["IN-09"]},
      },
      codeAlignment: {
        promotedFromIdeal: {working_capital: ["info_seasonality"], venture_debt: ["bank_statements"]},
        extendedPeriod: {revenue_evidence: "12 meses no mínimo; série mensal de 24 meses no alvo por monthly_financials_24m"},
      },
      listAudit: {
        cadence: "trimestral",
        demotionWindowCases: 10,
        demotionAbsentWithoutLimitationShare: "0.30",
        rule: "item do mínimo ausente em 30% ou mais dos 10 últimos casos do arquétipo sem limitar conclusão é rebaixado ao alvo (IN-11)",
      },
    },
    unit: "requisitos por arquétipo e nível; períodos em exercícios, meses e dias corridos",
    source: {
      title: "House Playbook v2.1, IN-03 a IN-12 (listas dia-zero, mínimo e ideal, régua de suficiência); auditoria obrigatória de grande porte pela Lei 11.638/2007, art. 3º",
      url: PLAYBOOK_URL,
      observedBy: OBSERVED_BY,
    },
    asOf: AS_OF,
    documentation: `${CARD}#policy.intake.archetype-requirements`,
  },
};
