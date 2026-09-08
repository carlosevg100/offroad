/** Specifications for object-scoped composition, not executable methods or promoted depth packs.
 * No registry activation, financial constants or eligibility thresholds are implied here.
 * Intent/dimension strings deliberately avoid coupling this catalog to agent-contracts.
 */
export type SectorContextRequirement = {
  id: string;
  intents: readonly string[];
  evidenceNeeded: readonly string[];
  scenarioIds: readonly string[];
  methods: readonly {id: string; status: "specified"}[];
  marketCriteriaIds: readonly string[];
  outputSuggestions: readonly string[];
};
export type SectorContextModule = {
  id: string;
  version: string;
  labels: {pt: string; en: string};
  status: "specified";
  /** Every predicate must match on the same object and a compatible economic period.
   * The compositor owns evidence-state and period handling; there are no global exclusions.
   */
  applicability: readonly {dimension: string; value: string}[];
  /** Specific signal needed before requesting missing companion predicates. */
  activationDiscriminator: {dimension: string; value: string};
  requirements: readonly SectorContextRequirement[];
};
const version = "sector-context-catalog.2026-09-08.v1";
function module(id: string, pt: string, en: string, applicability: SectorContextModule["applicability"], evidence: readonly string[], scenarios: readonly string[], method: string, criteria: readonly string[], output: string): SectorContextModule {
  return {
    id, version, labels: {pt, en}, status: "specified", applicability,
    activationDiscriminator: applicability[applicability.length - 1]!,
    requirements: [
      {id: `${id}.factual`, intents: ["factual_answer"], evidenceNeeded: ["requested_fact_and_object_scope", "source_version_and_locator"], scenarioIds: [], methods: [], marketCriteriaIds: [], outputSuggestions: ["sourced_factual_answer"]},
      {id: `${id}.contract`, intents: ["contract_review"], evidenceNeeded: ["current_contracts_amendments_and_waivers", "requested_clause_and_applicability", ...evidence], scenarioIds: [], methods: [{id: `${method}.contract_review`, status: "specified"}], marketCriteriaIds: [], outputSuggestions: ["clause_and_residual_risk_review"]},
      {id: `${id}.analysis`, intents: ["financial_analysis", "financing_comparison"], evidenceNeeded: [...evidence, "units_periods_entity_perimeter", "documented_or_explicitly_proposed_scenario_assumptions"], scenarioIds: scenarios, methods: [{id: method, status: "specified"}], marketCriteriaIds: [], outputSuggestions: [output, "unexamined_and_unresolved_requirements"]},
      {id: `${id}.market`, intents: ["market_matching"], evidenceNeeded: [...evidence, "dated_authorized_provider_mandate", "requested_financing_scope"], scenarioIds: [], methods: [], marketCriteriaIds: criteria, outputSuggestions: ["mandate_compatibility_and_unknowns"]},
    ],
  };
}

/** Mechanisms compose; contracted and merchant revenue may coexist across tranches/periods.
 * Evidence IDs name what must be investigated, not a claim that the evidence exists.
 */
export const sectorContextCatalog: readonly SectorContextModule[] = [
  module("sector.solar", "Geração solar", "Solar generation", [{dimension: "sector", value: "energy"}, {dimension: "subsector", value: "solar"}],
    ["asset_boundary_capacity_and_connection", "production_profile_and_resource_basis", "technical_reports_and_operating_constraints"],
    ["solar.production_resource_downside", "solar.curtailment_and_connection"], "specified.solar.production_review", ["mandate.technology_and_asset_scope"], "production_and_constraint_bridge"),
  module("revenue.contracted", "Receita contratada", "Contracted revenue", [{dimension: "revenue_model", value: "contracted"}],
    ["contract_volume_price_indexation_and_tenor", "delivery_settlement_and_residual_exposure", "counterparty_payment_and_termination_terms"],
    ["contracted.delivery_shortfall", "contracted.counterparty_delay", "contracted.expiry_mismatch"], "specified.contracted_revenue.exposure_review", ["mandate.counterparty_contract_tenor", "mandate.residual_revenue_exposure"], "contracted_and_residual_cash_flow_map"),
  module("revenue.merchant", "Exposição de receita ao mercado", "Merchant revenue exposure", [{dimension: "revenue_model", value: "merchant"}],
    ["volume_profile_and_location", "dated_price_basis_and_market_source", "hedge_terms_and_uncovered_exposure"],
    ["merchant.joint_price_volume_downside", "merchant.hedge_basis_mismatch"], "specified.merchant_revenue.exposure_review", ["mandate.merchant_exposure_and_hedge"], "joint_price_volume_and_hedge_exposure"),
  module("lifecycle.construction", "Construção", "Construction", [{dimension: "lifecycle", value: "construction"}],
    ["construction_budget_schedule_and_milestones", "permits_completion_tests_and_contract_risk_allocation", "funding_commitments_and_contingency_support"],
    ["construction.delay", "construction.cost_overrun", "construction.funding_gap"], "specified.construction.completion_review", ["mandate.completion_risk_and_sponsor_support"], "milestone_funding_and_completion_risk_map"),
  module("lifecycle.operating", "Operação", "Operating", [{dimension: "lifecycle", value: "operating"}],
    ["operating_history_and_service_performance", "maintenance_obligations_and_costs", "actual_budget_and_cash_reconciliation"],
    ["operating.downtime", "operating.maintenance_and_cost_stress"], "specified.operating.performance_review", ["mandate.operating_history_and_maintenance"], "operating_performance_and_cash_bridge"),
  module("business.retail", "Varejo", "Retail", [{dimension: "sector", value: "retail"}, {dimension: "business_model", value: "retail"}],
    ["stores_channels_categories_and_cohorts", "same_store_sales_margin_and_inventory", "supplier_terms_leases_and_expansion_plan"],
    ["retail.margin_compression", "retail.inventory_and_working_capital_peak", "retail.new_store_ramp_up"], "specified.retail.cohort_cash_review", ["mandate.retail_cash_cycle_and_security"], "store_cohort_margin_and_working_capital_bridge"),
  module("business.receivables", "Carteira de recebíveis", "Receivables pool", [{dimension: "business_model", value: "receivables_pool"}],
    ["title_level_pool_and_reconciled_collections", "reporting_date_and_latest_origination_date", "obligor_originator_servicer_and_group_identity", "assignment_eligibility_dilution_and_loss_evidence"],
    ["receivables.delinquency_and_loss", "receivables.dilution_and_collection_delay", "receivables.concentration_stress"], "specified.receivables.pool_review", ["mandate.confirmed_eligibility_policy", "mandate.capacity_and_appetite"], "pool_collection_reconciliation_and_evidence_classes"),
  module("revenue.toll", "Pedágio", "Toll revenue", [{dimension: "sector", value: "transport"}, {dimension: "subsector", value: "road"}, {dimension: "revenue_model", value: "toll"}],
    ["traffic_by_vehicle_class_and_effective_tariff", "tariff_adjustment_evasion_and_concession_term", "capex_maintenance_and_handover_obligations"],
    ["toll.traffic_mix_downside", "toll.tariff_and_capex_timing"], "specified.toll.traffic_revenue_review", ["mandate.concession_term_and_traffic_risk"], "traffic_tariff_and_concession_cash_bridge"),
  module("revenue.availability", "Receita por disponibilidade", "Availability revenue", [{dimension: "revenue_model", value: "availability"}],
    ["availability_payment_formula_and_performance_deductions", "counterparty_payment_capacity_and_budget_basis", "service_obligations_and_payment_calendar"],
    ["availability.performance_deductions", "availability.counterparty_payment_delay"], "specified.availability.payment_review", ["mandate.payment_counterparty_and_deductions"], "availability_deductions_and_payment_risk_map"),
];
