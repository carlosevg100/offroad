/**
 * Versioned desk knowledge for receivables-backed transactions.
 *
 * A FIDC is a capital vehicle. It is not the borrower's obligation instrument. The economic
 * object assessed here is the receivables portfolio, its obligors, the assignment mechanics and
 * servicing controls. Legal formation and fund administration remain with regulated providers
 * and counsel.
 */
export const receivablesPlaybook = {
  version: "2026.08.24-v1",
  reviewedAsOf: "2026-08-24",
  boundary: {
    pt: "A Offroad prepara e testa a oportunidade até a introdução qualificada. Não constitui o fundo, não verifica lastro em nome do gestor, não aprova crédito e não executa cobrança, documentação ou liquidação.",
    en: "Offroad prepares and tests the opportunity through qualified introduction. It does not form the fund, verify backing documents on behalf of the manager, approve credit, or execute collections, documentation or settlement.",
  },
  economicObject: {
    capitalVehicle: "fidc",
    obligationInstrument: "receivables_assignment",
    repaymentSource: "receivables_collection",
    riskUnits: ["portfolio", "cedent", "obligor", "servicing", "structure"],
  },
  roles: [
    {id: "cedent", pt: "Cedente", en: "Assignor", responsibility: {pt: "Origina ou detém os direitos creditórios e fornece histórico, lastro e regras operacionais.", en: "Originates or owns the receivables and supplies history, backing documents and operating rules."}},
    {id: "obligor", pt: "Sacado ou devedor", en: "Obligor", responsibility: {pt: "É a fonte primária de pagamento de cada direito creditório.", en: "Is the primary payment source for each receivable."}},
    {id: "servicer", pt: "Agente de cobrança ou servicer", en: "Servicer or collection agent", responsibility: {pt: "Processa cobrança, baixa, conciliação e tratamento de inadimplência conforme a estrutura.", en: "Processes collections, application of cash, reconciliation and delinquency treatment under the structure."}},
    {id: "capital_provider", pt: "Gestor de FIDC ou comprador de recebíveis", en: "FIDC manager or receivables buyer", responsibility: {pt: "Define política, critérios, concentração e parâmetros da estrutura e decide se analisa a oportunidade.", en: "Defines policy, eligibility, concentration and structure parameters and decides whether to assess the opportunity."}},
  ],
  stages: [
    {id: "guided_intake", pt: "Intake guiado", en: "Guided intake", outcome: {pt: "Loan tape, balancete, extratos de cobrança, contratos, políticas e histórico chegam com período, formato e finalidade claros.", en: "The loan tape, trial balance, collection statements, contracts, policies and history arrive with clear period, format and purpose."}},
    {id: "read_and_classify", pt: "Leitura e classificação", en: "Read and classify", outcome: {pt: "Cada arquivo é identificado, preservado e ligado às linhas e campos que sustenta.", en: "Each file is identified, preserved and linked to the rows and fields it supports."}},
    {id: "reconcile", pt: "Conciliação", en: "Reconciliation", outcome: {pt: "Loan tape fecha com contabilidade; recebimentos fecham com caixa; diferenças permanecem explícitas.", en: "The loan tape ties to accounting; collections tie to cash; differences remain explicit."}},
    {id: "portfolio_analysis", pt: "Análise da carteira", en: "Portfolio analysis", outcome: {pt: "Aging, concentração, inadimplência, perda, recuperação, diluição, recompra, substituição e prazo médio são calculados sobre evidências.", en: "Aging, concentration, delinquency, loss, recovery, dilution, repurchase, substitution and weighted maturity are calculated from evidence."}},
    {id: "eligibility", pt: "Elegibilidade título a título", en: "Receivable-level eligibility", outcome: {pt: "Cada título recebe uma decisão e motivos nomeados; concentração é tratada separadamente como limite de carteira.", en: "Each receivable receives a decision and named reasons; concentration is treated separately as a portfolio limit."}},
    {id: "indicative_structure", pt: "Estrutura indicativa", en: "Indicative structure", outcome: {pt: "Base elegível, taxa de avanço, sobrecolateralização, subordinação, reserva, gatilhos e waterfall são testados sem prometer funding.", en: "Eligible base, advance rate, overcollateralization, subordination, reserve, triggers and waterfall are tested without promising funding."}},
    {id: "materials", pt: "Materiais institucionais", en: "Institutional materials", outcome: {pt: "A oportunidade é apresentada com tese, carteira, metodologia, exceções, riscos, estrutura e evidências rastreáveis.", en: "The opportunity is presented with thesis, portfolio, methodology, exceptions, risks, structure and traceable evidence."}},
    {id: "mandate_screen", pt: "Aderência ao mandato", en: "Mandate screen", outcome: {pt: "Somente gestores compatíveis com ativo, ticket, concentração, prazo, retorno e estrutura entram na lista de introdução.", en: "Only managers compatible with asset, ticket, concentration, tenor, return and structure enter the introduction list."}},
  ],
  intake: {
    minimum: [
      "loan_tape_with_receivable_obligor_dates_balances_status",
      "trial_balance_and_receivables_control_account",
      "collection_bank_statement_or_linked_account_export",
      "sample_backing_documents_and_assignment_contracts",
      "current_encumbrance_and_prior_assignment_report",
      "historical_delinquency_loss_recovery_dilution_repurchase",
    ],
    ideal: [
      "complete_backing_document_index",
      "registry_or_custody_status_by_receivable",
      "obligor_group_and_sector_mapping",
      "servicing_policy_and_collection_sla",
      "monthly_vintages_and_roll_rates",
      "cash_application_log_with_receivable_identifier",
      "prior_eligibility_and_concentration_reports",
    ],
  },
  hardRefusalConditions: [
    "no_economically_eligible_receivables",
    "material_loan_tape_accounting_mismatch",
    "material_collections_cash_mismatch",
    "backing_evidence_below_policy",
    "registration_or_ownership_conflict",
    "requested_facility_exceeds_supported_borrowing_base",
  ],
  sourceNotes: [
    {
      authority: "CVM",
      title: "Resolução CVM 175, Anexo Normativo II",
      url: "https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol175consolid.pdf",
      relevance: "Critérios de elegibilidade, composição e diversificação, verificação de lastro, subordinação, cobrança, inadimplência e prazo médio ponderado.",
    },
    {
      authority: "ANBIMA",
      title: "Guia para elaboração de metodologia de PDD de direitos creditórios",
      url: "https://www.anbima.com.br/pt_br/noticias/anbima-lanca-guia-para-elaboracao-de-metodologia-de-pdd-de-direitos-creditorios-8A2AB2AE96A2B1F20196A6285B3A038F-00.htm",
      relevance: "Histórico de perdas, renegociações, recompras, substituições e extensões de prazo.",
    },
    {
      authority: "ANBIMA",
      title: "Comunicado de prevenção e verificação do lastro dos direitos creditórios do FIDC",
      url: "https://www.anbima.com.br/pt_br/autorregular/comunicados/integra/comunicado/comunicado-de-prevencao-verificacao-do-lastro-dos-direitos-creditorios-do-fidc/numero/2023-000017.htm",
      relevance: "Controles e responsabilidades relacionados à existência, integridade e titularidade do lastro.",
    },
  ],
} as const;
