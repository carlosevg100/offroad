type Labels = {pt: string; en: string};
export const sectorContextEvidenceLabels: Record<string, Labels> = {
  requested_fact_and_object_scope: {pt: "Fato solicitado e perímetro do objeto", en: "Requested fact and object scope"},
  source_version_and_locator: {pt: "Fonte, versão e localização da evidência", en: "Source, version and evidence location"},
  current_contracts_amendments_and_waivers: {pt: "Contratos, aditivos e dispensas vigentes", en: "Current contracts, amendments and waivers"},
  requested_clause_and_applicability: {pt: "Cláusula solicitada e sua aplicabilidade", en: "Requested clause and its applicability"},
  units_periods_entity_perimeter: {pt: "Unidades, períodos e perímetro das entidades", en: "Units, periods and entity perimeter"},
  documented_or_explicitly_proposed_scenario_assumptions: {pt: "Premissas de cenário documentadas ou explicitamente propostas", en: "Documented or explicitly proposed scenario assumptions"},
  dated_authorized_provider_mandate: {pt: "Mandato do financiador com data e acesso autorizado", en: "Dated provider mandate with authorized access"},
  requested_financing_scope: {pt: "Perímetro do financiamento solicitado", en: "Requested financing scope"},
  asset_boundary_capacity_and_connection: {pt: "Perímetro, capacidade e conexão do ativo", en: "Asset boundary, capacity and connection"},
  production_profile_and_resource_basis: {pt: "Perfil de produção e base do recurso energético", en: "Production profile and energy resource basis"},
  technical_reports_and_operating_constraints: {pt: "Relatórios técnicos e restrições operacionais", en: "Technical reports and operating constraints"},
  contract_volume_price_indexation_and_tenor: {pt: "Volume, preço, indexação e prazo contratados", en: "Contracted volume, price, indexation and tenor"},
  delivery_settlement_and_residual_exposure: {pt: "Entrega, liquidação e exposição residual", en: "Delivery, settlement and residual exposure"},
  counterparty_payment_and_termination_terms: {pt: "Contraparte, pagamento e condições de rescisão", en: "Counterparty, payment and termination terms"},
  volume_profile_and_location: {pt: "Perfil de volume e localização", en: "Volume profile and location"},
  dated_price_basis_and_market_source: {pt: "Base de preços datada e fonte de mercado", en: "Dated price basis and market source"},
  hedge_terms_and_uncovered_exposure: {pt: "Termos de proteção e exposição não coberta", en: "Hedge terms and uncovered exposure"},
  construction_budget_schedule_and_milestones: {pt: "Orçamento, cronograma e marcos de construção", en: "Construction budget, schedule and milestones"},
  permits_completion_tests_and_contract_risk_allocation: {pt: "Licenças, testes de conclusão e alocação contratual de riscos", en: "Permits, completion tests and contractual risk allocation"},
  funding_commitments_and_contingency_support: {pt: "Compromissos de financiamento e apoio para contingências", en: "Funding commitments and contingency support"},
  operating_history_and_service_performance: {pt: "Histórico operacional e desempenho do serviço", en: "Operating history and service performance"},
  maintenance_obligations_and_costs: {pt: "Obrigações e custos de manutenção", en: "Maintenance obligations and costs"},
  actual_budget_and_cash_reconciliation: {pt: "Conciliação de realizado, orçamento e caixa", en: "Actual, budget and cash reconciliation"},
  stores_channels_categories_and_cohorts: {pt: "Lojas, canais, categorias e coortes", en: "Stores, channels, categories and cohorts"},
  same_store_sales_margin_and_inventory: {pt: "Vendas nas mesmas lojas, margem e estoque", en: "Same-store sales, margin and inventory"},
  supplier_terms_leases_and_expansion_plan: {pt: "Condições de fornecedores, aluguéis e plano de expansão", en: "Supplier terms, leases and expansion plan"},
  title_level_pool_and_reconciled_collections: {pt: "Carteira por título e recebimentos conciliados", en: "Title-level pool and reconciled collections"},
  reporting_date_and_latest_origination_date: {pt: "Data de referência e última data de originação", en: "Reporting date and latest origination date"},
  obligor_originator_servicer_and_group_identity: {pt: "Identidade de sacados, originadores, servicers e grupos", en: "Obligor, originator, servicer and group identity"},
  assignment_eligibility_dilution_and_loss_evidence: {pt: "Evidências de cessão, elegibilidade, diluição e perdas", en: "Assignment, eligibility, dilution and loss evidence"},
  traffic_by_vehicle_class_and_effective_tariff: {pt: "Tráfego por classe de veículo e tarifa efetiva", en: "Traffic by vehicle class and effective tariff"},
  tariff_adjustment_evasion_and_concession_term: {pt: "Reajuste tarifário, evasão e prazo de concessão", en: "Tariff adjustment, evasion and concession term"},
  capex_maintenance_and_handover_obligations: {pt: "Investimentos, manutenção e obrigações de devolução", en: "Capital expenditure, maintenance and handover obligations"},
  availability_payment_formula_and_performance_deductions: {pt: "Fórmula de pagamento por disponibilidade e deduções de desempenho", en: "Availability payment formula and performance deductions"},
  counterparty_payment_capacity_and_budget_basis: {pt: "Capacidade de pagamento da contraparte e base orçamentária", en: "Counterparty payment capacity and budget basis"},
  service_obligations_and_payment_calendar: {pt: "Obrigações de serviço e calendário de pagamento", en: "Service obligations and payment calendar"},
};
export const sectorContextDimensionLabels = {
  cost_model: {pt: "Estrutura de custos", en: "Cost structure"},
  working_capital: {pt: "Dinâmica do capital de giro", en: "Working capital dynamics"},
  asset_model: {pt: "Ativos e utilização", en: "Assets and utilization"},
  capital_expenditure: {pt: "Investimentos e manutenção", en: "Capital expenditure and maintenance"},
  regulation: {pt: "Regulação e obrigações", en: "Regulation and obligations"},
  operating_driver: {pt: "Drivers operacionais", en: "Operating drivers"},
  sector: {pt: "Setor", en: "Sector"}, subsector: {pt: "Subsetor", en: "Subsector"}, business_model: {pt: "Modelo de negócio", en: "Business model"}, revenue_model: {pt: "Modelo de receita", en: "Revenue model"}, lifecycle: {pt: "Estágio", en: "Lifecycle"}, recourse: {pt: "Recurso", en: "Recourse"}, jurisdiction: {pt: "Jurisdição", en: "Jurisdiction"},
} satisfies Record<string, Labels>;
export const sectorContextValueLabels: Record<string, Labels> = {
  energy: {pt: "Energia", en: "Energy"}, retail: {pt: "Varejo", en: "Retail"}, transport: {pt: "Transporte", en: "Transport"}, solar: {pt: "Geração solar", en: "Solar generation"}, road: {pt: "Rodovia", en: "Road"}, contracted: {pt: "Receita contratada", en: "Contracted revenue"}, merchant: {pt: "Exposição ao mercado", en: "Merchant exposure"}, toll: {pt: "Pedágio", en: "Toll"}, availability: {pt: "Disponibilidade", en: "Availability"}, construction: {pt: "Construção", en: "Construction"}, operating: {pt: "Operação", en: "Operating"}, receivables_pool: {pt: "Carteira de recebíveis", en: "Receivables pool"}, BR: {pt: "Brasil", en: "Brazil"}, US: {pt: "Estados Unidos", en: "United States"}, limited_recourse: {pt: "Recurso limitado", en: "Limited recourse"}, corporate: {pt: "Recurso corporativo", en: "Corporate recourse"},
};
const aliases: Record<string, Record<string, readonly string[]>> = {
  sector: {energy: ["energia", "energy"], retail: ["varejo", "retail"], transport: ["transporte", "transport"]},
  subsector: {solar: ["solar", "energia solar", "geracao solar", "solar generation"], road: ["road", "rodovia", "rodovias"]},
  business_model: {retail: ["varejo", "retail"], receivables_pool: ["receivables_pool", "receivables pool", "carteira de recebiveis"]},
  revenue_model: {contracted: ["contracted", "contratada", "receita contratada"], merchant: ["merchant", "exposicao ao mercado"], toll: ["toll", "pedagio"], availability: ["availability", "disponibilidade"]},
  lifecycle: {construction: ["construction", "construcao", "em construcao"], operating: ["operating", "operacao", "em operacao"]},
  recourse: {limited_recourse: ["limited_recourse", "limited recourse", "recurso limitado"], corporate: ["corporate", "corporate recourse", "recurso corporativo"]},
  jurisdiction: {BR: ["br", "brasil", "brazil"], US: ["us", "usa", "estados unidos", "united states"]},
};
/** Exact dimension-scoped aliases only: never infer a sector or parse free-form prose. */
export function normalizeSectorContextValue(dimension: string, raw: string): string | null {
  const normalized = raw.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();
  if (!Object.hasOwn(aliases, dimension)) return null;
  for (const [value, names] of Object.entries(aliases[dimension]!)) if (names.includes(normalized)) return value;
  return null;
}
