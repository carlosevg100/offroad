/**
 * Canonical routes for financing Brazilian trade receivables.
 *
 * A route is not a buyer and a vehicle is not an instrument. The same receivable pool may
 * support a purchase, a secured corporate facility or a securitisation, funded by different
 * kinds of capital providers. These definitions contain only requirements and capabilities;
 * they do not contain a live mandate, a quoted price or a recommendation.
 */

export const receivablesRouteCatalogueVersion = "2026.08.27-v1";

export type KnowledgeProvenanceClass = "cited" | "measured" | "estimated";

export type CanonicalKnowledgeSource = {
  id: string;
  title: string;
  url: string;
  locator: string;
  provenanceClass: "cited";
  sourceStatus: "primary" | "official";
  checkedAt: "2026-08-27";
};

export const receivablesEligibilitySources = {
  civilCodeAssignment: {
    id: "br-civil-code-credit-assignment-286-298",
    title: "Código Civil, cessão de crédito",
    url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm",
    locator: "arts. 286 a 298",
    provenanceClass: "cited",
    sourceStatus: "primary",
    checkedAt: "2026-08-27",
  },
  duplicates: {
    id: "br-law-5474-duplicates",
    title: "Lei nº 5.474/1968, duplicatas",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l5474compilado.htm",
    locator: "arts. 7º, 8º, 15 e 20",
    provenanceClass: "cited",
    sourceStatus: "primary",
    checkedAt: "2026-08-27",
  },
  bookEntryDuplicates: {
    id: "br-law-13775-book-entry-duplicates",
    title: "Lei nº 13.775/2018, duplicata escritural",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13775.htm",
    locator: "arts. 4º, 6º, 7º e 10",
    provenanceClass: "cited",
    sourceStatus: "primary",
    checkedAt: "2026-08-27",
  },
  factoring: {
    id: "br-law-9249-factoring",
    title: "Lei nº 9.249/1995, definição legal de factoring",
    url: "https://www.planalto.gov.br/ccivil_03/leis/l9249.htm",
    locator: "art. 15, § 1º, III, d",
    provenanceClass: "cited",
    sourceStatus: "primary",
    checkedAt: "2026-08-27",
  },
  factoringBcb: {
    id: "bcb-factoring-characterisation",
    title: "Banco Central, factoring como prestador não regulado",
    url: "https://www.bcb.gov.br/Nor/relincfin/RIF2011.pdf",
    locator: "Anexo III, Factoring",
    provenanceClass: "cited",
    sourceStatus: "official",
    checkedAt: "2026-08-27",
  },
  financeCompanies: {
    id: "bcb-credit-finance-investment-companies",
    title: "Banco Central, sociedades de crédito, financiamento e investimento",
    url: "https://www.bcb.gov.br/estabilidadefinanceira/scfi",
    locator: "definição, atividades e supervisão",
    provenanceClass: "cited",
    sourceStatus: "official",
    checkedAt: "2026-08-27",
  },
  fintechCreditCompanies: {
    id: "bcb-scd-sep-operations",
    title: "Banco Central, operações e serviços prestados por SCD e SEP",
    url: "https://www.bcb.gov.br/meubc/faqs/p/operacoes-e-servicos-prestados-pela-scd-e-sep",
    locator: "operações de SCD e SEP",
    provenanceClass: "cited",
    sourceStatus: "official",
    checkedAt: "2026-08-27",
  },
  fidc: {
    id: "cvm-175-annex-ii-fidc",
    title: "Resolução CVM nº 175, Anexo Normativo II",
    url: "https://conteudo.cvm.gov.br/export/sites/cvm/legislacao/resolucoes/anexos/100/resol175consolid_Anexo02.pdf",
    locator: "regras específicas de FIDC",
    provenanceClass: "cited",
    sourceStatus: "official",
    checkedAt: "2026-08-27",
  },
  fiduciaryAssignment: {
    id: "br-law-10931-fiduciary-assignment",
    title: "Lei nº 10.931/2004, cessão fiduciária e CCB",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.931compilado.htm",
    locator: "art. 66-B e disposições sobre CCB",
    provenanceClass: "cited",
    sourceStatus: "primary",
    checkedAt: "2026-08-27",
  },
  securitisation: {
    id: "br-law-14430-securitisation",
    title: "Lei nº 14.430/2022, securitização de direitos creditórios",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14430.htm",
    locator: "arts. 18 a 26",
    provenanceClass: "cited",
    sourceStatus: "primary",
    checkedAt: "2026-08-27",
  },
} as const satisfies Record<string, CanonicalKnowledgeSource>;

export const receivablesEligibilityFactIds = [
  "claim_existence_evidenced",
  "cedent_ownership_confirmed",
  "contractual_assignability_confirmed",
  "unresolved_prior_assignment_or_lien",
  "performance_or_delivery_evidenced",
  "title_control_and_duplicate_check_available",
  "debtor_notice_or_acknowledgement_feasible",
  "analytical_tape_available",
  "historical_performance_available",
  "controlled_collections_feasible",
  "servicing_capability_available",
  "buyer_confirmed_program_available",
  "recurring_origination_available",
  "economically_viable_scale_confirmed",
  "institutional_vehicle_governance_ready",
  "company_credit_package_available",
  "eligible_collateral_pool_identified",
  "security_perfection_feasible",
] as const;

export type ReceivablesEligibilityFactId = typeof receivablesEligibilityFactIds[number];

export type ReceivablesFactResolutionDefinition = {
  id: ReceivablesEligibilityFactId;
  safeState: "true" | "false";
  /** A route-level safe assertion always requires evidence covering the complete relevant universe. */
  safeCoverage: "complete";
  /** Only a known unresolved prior right is adverse enough to decide from partial coverage. */
  adverseHandling: "complete_only" | "any_confirmed_observation";
  unresolvedRequest: string;
};

/**
 * Canonical semantics used to resolve evidence into route facts. Knowledge remains here;
 * the analysis package only executes this versioned contract.
 */
export const receivablesFactResolutionDefinitions: readonly ReceivablesFactResolutionDefinition[] = [
  {id: "claim_existence_evidenced", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Entregar a relação completa dos créditos, com documento de origem e identificador por título."},
  {id: "cedent_ownership_confirmed", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Comprovar a titularidade do cedente para o universo de créditos considerado."},
  {id: "contractual_assignability_confirmed", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Entregar os contratos comerciais aplicáveis para verificar restrições à cessão."},
  {id: "unresolved_prior_assignment_or_lien", safeState: "false", safeCoverage: "complete", adverseHandling: "any_confirmed_observation", unresolvedRequest: "Comprovar, título a título, a ausência ou a resolução de cessões, ônus e gravames anteriores."},
  {id: "performance_or_delivery_evidenced", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Entregar comprovantes de entrega, aceite ou prestação para os créditos considerados."},
  {id: "title_control_and_duplicate_check_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Disponibilizar controle verificável de titularidade, pagamentos, ônus e duplicidade."},
  {id: "debtor_notice_or_acknowledgement_feasible", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Confirmar como será feita a ciência do sacado e a instrução de pagamento."},
  {id: "analytical_tape_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Entregar a carteira completa em base analítica reconciliável, título a título."},
  {id: "historical_performance_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Entregar histórico suficiente de pagamentos, atrasos, perdas, diluições, recompras e prorrogações."},
  {id: "controlled_collections_feasible", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Descrever e evidenciar o fluxo de cobrança, recebimento e reconciliação."},
  {id: "servicing_capability_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Identificar responsáveis e processos de originação, cobrança, baixa e conciliação."},
  {id: "buyer_confirmed_program_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Confirmar a existência e a aplicabilidade do programa patrocinado pelo sacado."},
  {id: "recurring_origination_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Comprovar volume e recorrência de originação compatíveis com a utilização pretendida."},
  {id: "economically_viable_scale_confirmed", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Comprovar escala econômica após custos fixos, operacionais e de estruturação."},
  {id: "institutional_vehicle_governance_ready", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Confirmar governança, prestadores e controles necessários ao veículo dedicado."},
  {id: "company_credit_package_available", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Completar o pacote de informações financeiras, societárias e operacionais da companhia."},
  {id: "eligible_collateral_pool_identified", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Identificar a carteira elegível oferecida em garantia e suas regras de substituição."},
  {id: "security_perfection_feasible", safeState: "true", safeCoverage: "complete", adverseHandling: "complete_only", unresolvedRequest: "Confirmar a viabilidade de formalização, registro e controle da garantia."},
];

export type FinancingMechanism =
  | "receivable_purchase"
  | "corporate_credit_secured_by_receivables"
  | "buyer_sponsored_supply_chain_finance"
  | "capital_markets_securitisation";

export type ReceivablesFinancingRouteId =
  | "factoring_purchase"
  | "financial_institution_receivables_discount"
  | "digital_credit_receivables_purchase"
  | "fidc_multicedent_assignment"
  | "buyer_confirmed_payables_program"
  | "secured_revolving_facility"
  | "ccb_with_fiduciary_assignment"
  | "dedicated_receivables_vehicle"
  | "receivables_certificate_securitisation";

export type CapitalProviderType =
  | "bank"
  | "credit_finance_investment_company"
  | "direct_credit_company"
  | "factoring_company"
  | "fidc_or_receivables_fund"
  | "private_credit_fund"
  | "family_office"
  | "institutional_investor"
  | "obligor_sponsored_program";

export type RouteServiceProviderType =
  | "technology_origination_platform"
  | "fund_manager"
  | "fund_administrator"
  | "custodian_or_registry"
  | "securitisation_company"
  | "trustee"
  | "servicer";

export type ReceivablesRouteCriterion = {
  id: string;
  factId: ReceivablesEligibilityFactId;
  expected: "true" | "false";
  severity: "hard" | "remediable";
  description: string;
  sourceIds: readonly (keyof typeof receivablesEligibilitySources)[];
};

export type ReceivablesRouteDefinition = {
  id: ReceivablesFinancingRouteId;
  label: string;
  mechanism: FinancingMechanism;
  capitalProviderTypes: readonly CapitalProviderType[];
  serviceProviderTypes: readonly RouteServiceProviderType[];
  criteria: readonly ReceivablesRouteCriterion[];
  /** Relative desk observation only. It never creates eligibility or a recommendation. */
  deskCharacteristics: {
    implementation: "potentially_fast" | "intermediate" | "structuring_intensive" | "depends_on_existing_program";
    economics: "often_higher" | "market_dependent" | "scale_sensitive" | "potentially_lower_with_scale";
    provenanceClass: "estimated";
  };
};

const commonAssignmentCriteria: readonly ReceivablesRouteCriterion[] = [
  {id: "assignment.claim_exists", factId: "claim_existence_evidenced", expected: "true", severity: "hard", description: "O crédito deve existir e estar identificado.", sourceIds: ["civilCodeAssignment", "duplicates"]},
  {id: "assignment.cedent_owns_claim", factId: "cedent_ownership_confirmed", expected: "true", severity: "hard", description: "A titularidade do cedente deve estar comprovada.", sourceIds: ["civilCodeAssignment", "bookEntryDuplicates"]},
  {id: "assignment.assignable", factId: "contractual_assignability_confirmed", expected: "true", severity: "hard", description: "A cessão deve ser juridicamente possível no contrato e no tipo de crédito.", sourceIds: ["civilCodeAssignment", "bookEntryDuplicates"]},
  {id: "assignment.no_unresolved_prior_right", factId: "unresolved_prior_assignment_or_lien", expected: "false", severity: "hard", description: "Cessão, ônus ou gravame anterior precisa estar ausente ou ter prioridade resolvida.", sourceIds: ["civilCodeAssignment", "bookEntryDuplicates"]},
  {id: "assignment.performance_evidence", factId: "performance_or_delivery_evidenced", expected: "true", severity: "remediable", description: "A entrega da mercadoria ou prestação do serviço deve ter comprovação verificável.", sourceIds: ["duplicates", "bookEntryDuplicates"]},
  {id: "assignment.title_control", factId: "title_control_and_duplicate_check_available", expected: "true", severity: "remediable", description: "O controle de titularidade, pagamentos, ônus e duplicidade deve ser verificável.", sourceIds: ["bookEntryDuplicates"]},
  {id: "assignment.notice", factId: "debtor_notice_or_acknowledgement_feasible", expected: "true", severity: "remediable", description: "A notificação ou ciência do sacado e a instrução de pagamento devem ser operacionalmente viáveis.", sourceIds: ["civilCodeAssignment", "bookEntryDuplicates"]},
];

const institutionalPortfolioCriteria: readonly ReceivablesRouteCriterion[] = [
  {id: "portfolio.analytical_tape", factId: "analytical_tape_available", expected: "true", severity: "remediable", description: "A carteira deve ser entregue título a título em base analítica reconciliável.", sourceIds: ["fidc"]},
  {id: "portfolio.performance_history", factId: "historical_performance_available", expected: "true", severity: "remediable", description: "A performance histórica deve permitir medir perdas, atrasos, diluição, recompras e prorrogações.", sourceIds: ["fidc"]},
  {id: "portfolio.cash_control", factId: "controlled_collections_feasible", expected: "true", severity: "remediable", description: "O fluxo de cobrança deve admitir controle e reconciliação.", sourceIds: ["fidc", "bookEntryDuplicates"]},
  {id: "portfolio.servicing", factId: "servicing_capability_available", expected: "true", severity: "remediable", description: "A originação, cobrança e conciliação precisam ter responsável e processo verificáveis.", sourceIds: ["fidc"]},
];

export const receivablesRouteDefinitions: readonly ReceivablesRouteDefinition[] = [
  {
    id: "factoring_purchase",
    label: "Compra por factoring",
    mechanism: "receivable_purchase",
    capitalProviderTypes: ["factoring_company"],
    serviceProviderTypes: ["servicer"],
    criteria: commonAssignmentCriteria,
    deskCharacteristics: {implementation: "potentially_fast", economics: "often_higher", provenanceClass: "estimated"},
  },
  {
    id: "financial_institution_receivables_discount",
    label: "Desconto ou aquisição por instituição financeira",
    mechanism: "receivable_purchase",
    capitalProviderTypes: ["bank", "credit_finance_investment_company"],
    serviceProviderTypes: ["custodian_or_registry", "servicer"],
    criteria: [...commonAssignmentCriteria, {id: "financial_institution.company_package", factId: "company_credit_package_available", expected: "true", severity: "remediable", description: "Quando houver coobrigação ou exposição à companhia, o pacote de crédito corporativo precisa estar disponível.", sourceIds: ["financeCompanies"]}],
    deskCharacteristics: {implementation: "intermediate", economics: "market_dependent", provenanceClass: "estimated"},
  },
  {
    id: "digital_credit_receivables_purchase",
    label: "Aquisição digital por SCD ou estrutura parceira",
    mechanism: "receivable_purchase",
    capitalProviderTypes: ["direct_credit_company", "bank", "fidc_or_receivables_fund"],
    serviceProviderTypes: ["technology_origination_platform", "custodian_or_registry", "servicer"],
    criteria: [...commonAssignmentCriteria, {id: "digital_credit.company_package", factId: "company_credit_package_available", expected: "true", severity: "remediable", description: "A instituição e seus financiadores podem exigir análise da companhia além da carteira.", sourceIds: ["fintechCreditCompanies"]}],
    deskCharacteristics: {implementation: "potentially_fast", economics: "market_dependent", provenanceClass: "estimated"},
  },
  {
    id: "fidc_multicedent_assignment",
    label: "Cessão para FIDC multicedente",
    mechanism: "receivable_purchase",
    capitalProviderTypes: ["fidc_or_receivables_fund"],
    serviceProviderTypes: ["fund_manager", "fund_administrator", "custodian_or_registry", "servicer"],
    criteria: [...commonAssignmentCriteria, ...institutionalPortfolioCriteria, {id: "fidc.recurring_origination", factId: "recurring_origination_available", expected: "true", severity: "remediable", description: "A cessão recorrente exige originação compatível com a utilização pretendida.", sourceIds: ["fidc"]}],
    deskCharacteristics: {implementation: "intermediate", economics: "potentially_lower_with_scale", provenanceClass: "estimated"},
  },
  {
    id: "buyer_confirmed_payables_program",
    label: "Programa confirmado pelo sacado",
    mechanism: "buyer_sponsored_supply_chain_finance",
    capitalProviderTypes: ["obligor_sponsored_program", "bank", "direct_credit_company", "fidc_or_receivables_fund"],
    serviceProviderTypes: ["technology_origination_platform", "servicer"],
    criteria: [
      {id: "confirmed.claim_exists", factId: "claim_existence_evidenced", expected: "true", severity: "hard", description: "A obrigação comercial precisa estar identificada.", sourceIds: ["duplicates"]},
      {id: "confirmed.cedent_owns_claim", factId: "cedent_ownership_confirmed", expected: "true", severity: "hard", description: "O fornecedor que solicita a antecipação deve ser titular do crédito.", sourceIds: ["civilCodeAssignment", "bookEntryDuplicates"]},
      {id: "confirmed.performance", factId: "performance_or_delivery_evidenced", expected: "true", severity: "remediable", description: "A entrega ou prestação deve estar confirmada.", sourceIds: ["duplicates", "bookEntryDuplicates"]},
      {id: "confirmed.program_exists", factId: "buyer_confirmed_program_available", expected: "true", severity: "hard", description: "O sacado deve manter ou aprovar um programa de antecipação aplicável.", sourceIds: ["duplicates"]},
    ],
    deskCharacteristics: {implementation: "depends_on_existing_program", economics: "potentially_lower_with_scale", provenanceClass: "estimated"},
  },
  {
    id: "secured_revolving_facility",
    label: "Linha rotativa garantida por recebíveis",
    mechanism: "corporate_credit_secured_by_receivables",
    capitalProviderTypes: ["bank", "credit_finance_investment_company", "direct_credit_company", "private_credit_fund", "family_office"],
    serviceProviderTypes: ["custodian_or_registry", "servicer"],
    criteria: [
      {id: "secured.company_package", factId: "company_credit_package_available", expected: "true", severity: "hard", description: "A linha é crédito corporativo e depende da análise da companhia.", sourceIds: ["financeCompanies", "fintechCreditCompanies"]},
      {id: "secured.cedent_owns_claim", factId: "cedent_ownership_confirmed", expected: "true", severity: "hard", description: "A companhia deve ser titular dos recebíveis oferecidos em garantia.", sourceIds: ["civilCodeAssignment", "fiduciaryAssignment"]},
      {id: "secured.collateral_pool", factId: "eligible_collateral_pool_identified", expected: "true", severity: "remediable", description: "A carteira dada em garantia deve ser identificada e monitorável.", sourceIds: ["fiduciaryAssignment"]},
      {id: "secured.perfection", factId: "security_perfection_feasible", expected: "true", severity: "remediable", description: "A cessão fiduciária, o registro e o controle de fluxo devem ser implementáveis.", sourceIds: ["fiduciaryAssignment", "bookEntryDuplicates"]},
      {id: "secured.no_unresolved_prior_right", factId: "unresolved_prior_assignment_or_lien", expected: "false", severity: "hard", description: "Direitos anteriores sobre a carteira precisam estar ausentes ou subordinados de forma válida.", sourceIds: ["bookEntryDuplicates", "fiduciaryAssignment"]},
    ],
    deskCharacteristics: {implementation: "intermediate", economics: "market_dependent", provenanceClass: "estimated"},
  },
  {
    id: "ccb_with_fiduciary_assignment",
    label: "CCB com cessão fiduciária de recebíveis",
    mechanism: "corporate_credit_secured_by_receivables",
    capitalProviderTypes: ["bank", "credit_finance_investment_company", "direct_credit_company", "private_credit_fund", "fidc_or_receivables_fund", "family_office"],
    serviceProviderTypes: ["custodian_or_registry", "servicer"],
    criteria: [
      {id: "ccb.company_package", factId: "company_credit_package_available", expected: "true", severity: "hard", description: "A CCB representa exposição de crédito à companhia.", sourceIds: ["fiduciaryAssignment"]},
      {id: "ccb.cedent_owns_claim", factId: "cedent_ownership_confirmed", expected: "true", severity: "hard", description: "A companhia deve ser titular dos direitos cedidos fiduciariamente.", sourceIds: ["civilCodeAssignment", "fiduciaryAssignment"]},
      {id: "ccb.collateral_pool", factId: "eligible_collateral_pool_identified", expected: "true", severity: "remediable", description: "O pacote de garantia precisa identificar a carteira e suas regras de substituição.", sourceIds: ["fiduciaryAssignment"]},
      {id: "ccb.perfection", factId: "security_perfection_feasible", expected: "true", severity: "remediable", description: "A garantia e o controle dos recebimentos precisam ser formalizáveis.", sourceIds: ["fiduciaryAssignment", "bookEntryDuplicates"]},
      {id: "ccb.no_unresolved_prior_right", factId: "unresolved_prior_assignment_or_lien", expected: "false", severity: "hard", description: "Ônus ou cessão anterior não resolvidos bloqueiam a garantia.", sourceIds: ["bookEntryDuplicates", "fiduciaryAssignment"]},
    ],
    deskCharacteristics: {implementation: "intermediate", economics: "market_dependent", provenanceClass: "estimated"},
  },
  {
    id: "dedicated_receivables_vehicle",
    label: "Veículo dedicado de recebíveis",
    mechanism: "receivable_purchase",
    capitalProviderTypes: ["fidc_or_receivables_fund", "institutional_investor", "private_credit_fund"],
    serviceProviderTypes: ["fund_manager", "fund_administrator", "custodian_or_registry", "servicer"],
    criteria: [
      ...commonAssignmentCriteria,
      ...institutionalPortfolioCriteria,
      {id: "vehicle.recurring_origination", factId: "recurring_origination_available", expected: "true", severity: "remediable", description: "A carteira deve sustentar a revolvência ou o cronograma da estrutura.", sourceIds: ["fidc"]},
      {id: "vehicle.scale", factId: "economically_viable_scale_confirmed", expected: "true", severity: "remediable", description: "A escala deve cobrir custos fixos e concentração sem usar limite genérico não governado.", sourceIds: ["fidc"]},
      {id: "vehicle.governance", factId: "institutional_vehicle_governance_ready", expected: "true", severity: "remediable", description: "Gestão, administração, registro ou custódia, auditoria e servicing precisam ser desenhados.", sourceIds: ["fidc"]},
    ],
    deskCharacteristics: {implementation: "structuring_intensive", economics: "scale_sensitive", provenanceClass: "estimated"},
  },
  {
    id: "receivables_certificate_securitisation",
    label: "Securitização com Certificados de Recebíveis",
    mechanism: "capital_markets_securitisation",
    capitalProviderTypes: ["institutional_investor", "private_credit_fund", "family_office"],
    serviceProviderTypes: ["securitisation_company", "trustee", "custodian_or_registry", "servicer"],
    criteria: [
      ...commonAssignmentCriteria,
      ...institutionalPortfolioCriteria,
      {id: "securitisation.scale", factId: "economically_viable_scale_confirmed", expected: "true", severity: "remediable", description: "A escala deve justificar a emissão e os prestadores, sem corte genérico não governado.", sourceIds: ["securitisation"]},
      {id: "securitisation.governance", factId: "institutional_vehicle_governance_ready", expected: "true", severity: "remediable", description: "Termo, regime fiduciário quando aplicável, agente fiduciário e controles da emissão devem ser viáveis.", sourceIds: ["securitisation"]},
    ],
    deskCharacteristics: {implementation: "structuring_intensive", economics: "scale_sensitive", provenanceClass: "estimated"},
  },
];

export function receivablesRouteDefinition(id: ReceivablesFinancingRouteId): ReceivablesRouteDefinition {
  const route = receivablesRouteDefinitions.find((candidate) => candidate.id === id);
  if (!route) throw new RangeError(`unknown receivables route: ${id}`);
  return route;
}
