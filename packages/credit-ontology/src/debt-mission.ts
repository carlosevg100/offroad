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
export const debtMissionVersion = "2026.09.01-v2";

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
  schemaVersion: z.literal("debt-mission-frame.v2"),
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
