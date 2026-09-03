import {z} from "zod";
import {advisorLanguagePolicySchema, debtJurisdictionProfileSchema} from "./jurisdiction-language";

/**
 * The universal debt-advisory frame.
 *
 * A user does not need to choose an instrument before Offroad can work. The system first
 * represents the economic need, the sources that may repay it, the eligible capital families,
 * the proposed allocation of risk and the conditions required for market execution. These five
 * axes are independent and composable: one project may have mixed uses, multiple tranches and
 * different repayment sources without being forced into a receivables, bank or capital-markets
 * product funnel.
 */
export const debtMissionVersion = "2026.09.03-v3";

export const capitalNeedKindSchema = z.enum([
  "refinancing_liability_management",
  "liquidity_working_capital",
  "capex_expansion_ramp_up",
  "acquisition_m_and_a",
  "project_finance_infrastructure",
  "asset_equipment_fleet_real_estate",
  "receivables_inventory_contracts",
  "bridge_take_out",
  "shareholder_event_dividend_recap",
  "trade_finance_seasonality_supply_chain",
  "venture_mezzanine_subordinated_hybrid",
  "restructuring_special_situations",
  "other",
]);
export type CapitalNeedKind = z.infer<typeof capitalNeedKindSchema>;

/**
 * What is happening in the company or its liability profile. A situation is deliberately not an
 * objective and not an instrument: a maturity wall may lead to an amend-and-extend, a bilateral
 * refinancing, a capital-markets take-out or no transaction at all.
 */
export const capitalSituationSchema = z.enum([
  "near_term_maturity_concentration",
  "medium_term_maturity_concentration",
  "preventive_liquidity_need",
  "minimum_cash_buffer_pressure",
  "seasonal_working_capital_need",
  "cash_conversion_pressure",
  "growth_funding_gap",
  "capex_funding_gap",
  "acquisition_funding_gap",
  "bridge_or_take_out_need",
  "construction_or_ramp_up_risk",
  "high_cost_existing_debt",
  "inadequate_amortization_profile",
  "inadequate_currency_or_indexer",
  "covenant_headroom_pressure",
  "covenant_breach_or_waiver_need",
  "trapped_or_overallocated_collateral",
  "concentrated_funding_sources",
  "excessive_bilateral_bank_dependency",
  "limited_capital_markets_access",
  "underused_receivables_capacity",
  "underused_inventory_capacity",
  "underused_asset_capacity",
  "underused_contracted_cash_flow",
  "shareholder_liquidity_or_distribution_event",
  "stressed_or_distressed_balance_sheet",
  "credit_profile_or_rating_transition",
  "opportunistic_market_window",
  "regulatory_tax_or_legal_constraint",
  "other",
]);
export type CapitalSituation = z.infer<typeof capitalSituationSchema>;

/** What the user wants the capital strategy to accomplish. */
export const capitalObjectiveSchema = z.enum([
  "refinance_maturities",
  "extend_duration",
  "smooth_amortization_profile",
  "reduce_all_in_cost",
  "reprice_credit_spread",
  "change_currency_or_indexer",
  "diversify_funding_sources",
  "access_new_capital_provider_base",
  "release_or_reorganize_collateral",
  "increase_financial_flexibility",
  "add_preventive_liquidity",
  "fund_working_capital",
  "fund_capex_or_expansion",
  "fund_acquisition",
  "finance_or_monetize_assets",
  "monetize_receivables",
  "finance_inventory_or_supply_chain",
  "finance_contracted_cash_flows",
  "bridge_to_long_term_take_out",
  "reset_or_create_covenant_headroom",
  "obtain_waiver_or_amendment",
  "execute_exchange_tender_or_other_liability_management",
  "recapitalize_balance_sheet",
  "fund_shareholder_distribution_or_buyout",
  "rescue_restructure_or_reprofile",
  "optimize_cash_interest",
  "preserve_dry_powder",
  "other",
]);
export type CapitalObjective = z.infer<typeof capitalObjectiveSchema>;

/** The economic deployment of new money, if the work involves new money at all. */
export const capitalUseSchema = z.enum([
  "no_new_money",
  "general_corporate_purposes",
  "working_capital",
  "inventory",
  "supplier_or_trade_payables",
  "growth_capex",
  "maintenance_capex",
  "greenfield_project",
  "brownfield_expansion",
  "acquisition_purchase_price",
  "acquisition_refinancing",
  "equipment_or_fleet",
  "real_estate",
  "research_development_or_technology",
  "tax_or_legal_obligation",
  "shareholder_distribution",
  "shareholder_buyout",
  "fees_expenses_and_reserves",
  "mixed",
  "unknown",
  "other",
]);
export type CapitalUse = z.infer<typeof capitalUseSchema>;

export const debtRepaymentSourceSchema = z.enum([
  "corporate_operating_cash_flow",
  "project_cash_flow",
  "receivables_collection",
  "contracted_cash_flow",
  "inventory_monetization",
  "asset_cash_flow",
  "asset_sale",
  "subsidiary_distributions",
  "sponsor_support",
  "refinancing_take_out",
  "mixed",
  "unknown",
]);
export type DebtRepaymentSource = z.infer<typeof debtRepaymentSourceSchema>;

export const debtCapitalFamilySchema = z.enum([
  "bilateral_bank",
  "club_or_syndicated",
  "capital_markets",
  "securitization",
  "private_credit_funds",
  "receivables_finance",
  "asset_backed",
  "project_or_acquisition_finance",
  "trade_export_or_agri_finance",
  "flexible_capital",
  "special_situations",
  "credit_enhancement",
]);
export type DebtCapitalFamily = z.infer<typeof debtCapitalFamilySchema>;

export const debtEvidenceRegimeSchema = z.enum([
  "public_only",
  "authorized_private",
  "hybrid",
]);
export type DebtEvidenceRegime = z.infer<typeof debtEvidenceRegimeSchema>;

export const debtMissionContextSchema = z.object({
  purpose: z.string().trim().min(3).max(5_000),
  audience: z.string().trim().max(500).optional(),
  desiredOutcome: z.string().trim().max(2_000).optional(),
  relationshipContext: z.string().trim().max(2_000).optional(),
  meetingDate: z.iso.date().optional(),
});
export type DebtMissionContext = z.infer<typeof debtMissionContextSchema>;

export const debtMissionNeedSchema = z.object({
  kind: capitalNeedKindSchema,
  description: z.string().trim().min(3).max(2_000),
  priority: z.enum(["primary", "secondary"]),
  situations: z.array(capitalSituationSchema).max(20).default([]),
  objectives: z.array(capitalObjectiveSchema).max(20).default([]),
  uses: z.array(capitalUseSchema).max(20).default([]),
  amount: z.string().trim().max(120).optional(),
  timing: z.string().trim().max(240).optional(),
});

export const debtRiskAllocationSchema = z.object({
  borrowerPerimeter: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  recourse: z.enum(["full", "limited", "non_recourse", "mixed", "unknown"]),
  seniority: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  collateral: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
  covenants: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  tranches: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  conditionsPrecedent: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  constraints: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
});

export const debtMarketExecutionSchema = z.object({
  eligibleFamilies: z.array(debtCapitalFamilySchema).max(12).default([]),
  hardConstraints: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  pricingReferences: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  comparableTransactions: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  lenderFitCriteria: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  asOfDate: z.iso.date().optional(),
});

export const debtMissionFrameSchema = z.object({
  schemaVersion: z.literal("debt-mission-frame.v3"),
  evidenceRegime: debtEvidenceRegimeSchema,
  jurisdiction: debtJurisdictionProfileSchema,
  language: advisorLanguagePolicySchema,
  context: debtMissionContextSchema,
  needs: z.array(debtMissionNeedSchema).min(1).max(12),
  repaymentSources: z.array(debtRepaymentSourceSchema).min(1).max(12),
  capitalFamilies: z.array(debtCapitalFamilySchema).max(12).default([]),
  riskAllocation: debtRiskAllocationSchema,
  marketExecution: debtMarketExecutionSchema,
  unknowns: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
});
export type DebtMissionFrame = z.infer<typeof debtMissionFrameSchema>;
