import {z} from "zod";

/**
 * The economic dimensions of a private-credit transaction.
 *
 * These dimensions are deliberately independent. A capital need is not an instrument, an
 * instrument is not a funding vehicle, and a funding vehicle is not the same thing as the
 * institution managing or investing through it. Keeping them separate prevents a route such as
 * FIDC from being treated as if it were the borrower's legal instrument.
 *
 * Existing package-specific vocabularies remain supported while consumers migrate. New domain
 * logic should use this contract and make any compatibility mapping explicit at its boundary.
 */

export const originationTaxonomyVersion = "2026.08.24-v2";

export const capitalNeedSchema = z.enum([
  "working_capital",
  "growth_expansion",
  "acquisition",
  "refinance",
  "equipment_finance",
  "real_estate_finance",
  "project_finance",
  "export_finance",
  "venture_debt",
  "other",
]);
export type CapitalNeed = z.infer<typeof capitalNeedSchema>;

export const repaymentSourceSchema = z.enum([
  "operating_cash_flow",
  "receivables_collection",
  "asset_cash_flow",
  "project_cash_flow",
  "refinancing_exit",
  "sponsor_support",
  "asset_sale",
  "mixed",
]);
export type RepaymentSource = z.infer<typeof repaymentSourceSchema>;

export const assetBackingSchema = z.enum([
  "unsecured",
  "corporate_assets",
  "receivables",
  "real_estate",
  "equipment",
  "shares",
  "cash_reserve",
  "financial_guarantee",
  "other",
]);
export type AssetBacking = z.infer<typeof assetBackingSchema>;

/** The legal obligation owed or asset transferred by the company. */
export const obligationInstrumentSchema = z.enum([
  "ccb",
  "debenture",
  "commercial_note",
  "direct_loan",
  "receivables_assignment",
  "leasing",
  "finame_on_lending",
  "nce",
  "cpr",
  "cdca",
  "convertible_loan",
  "other",
]);
export type ObligationInstrument = z.infer<typeof obligationInstrumentSchema>;

/** The security distributed to capital providers, when it differs from the company's obligation. */
export const distributedSecuritySchema = z.enum([
  "none",
  "debenture",
  "commercial_note",
  "cri",
  "cra",
  "fidc_senior_quota",
  "fidc_subordinated_quota",
  "other",
]);
export type DistributedSecurity = z.infer<typeof distributedSecuritySchema>;

export const structureMechanismSchema = z.enum([
  "bilateral_loan",
  "private_placement",
  "public_offering",
  "securitization",
  "receivables_purchase",
  "asset_finance",
  "project_finance",
  "venture_debt",
  "other",
]);
export type StructureMechanism = z.infer<typeof structureMechanismSchema>;

/** The balance-sheet or legal vehicle through which capital reaches the transaction. */
export const capitalVehicleSchema = z.enum([
  "bank_balance_sheet",
  "credit_fund",
  "fidc",
  "factoring_company",
  "securitization_company",
  "family_office",
  "insurance_balance_sheet",
  "development_bank_program",
  "other",
]);
export type CapitalVehicle = z.infer<typeof capitalVehicleSchema>;

/** The economic participant supplying or managing the capital. */
export const capitalProviderTypeSchema = z.enum([
  "bank",
  "asset_manager",
  "credit_fund_manager",
  "fidc_manager",
  "factor",
  "securitization_company",
  "family_office",
  "insurer",
  "development_bank",
  "institutional_investor",
  "other",
]);
export type CapitalProviderType = z.infer<typeof capitalProviderTypeSchema>;

export const distributionRouteSchema = z.enum([
  "bilateral_private",
  "institutional_sounding",
  "private_distribution",
  "public_distribution",
  "not_applicable",
]);
export type DistributionRoute = z.infer<typeof distributionRouteSchema>;

export const securityEnhancementSchema = z.enum([
  "none",
  "corporate_guarantee",
  "personal_guarantee",
  "fiduciary_assignment_receivables",
  "fiduciary_lien_real_estate",
  "fiduciary_lien_equipment",
  "share_pledge",
  "reserve_account",
  "overcollateralization",
  "subordination",
  "other",
]);
export type SecurityEnhancement = z.infer<typeof securityEnhancementSchema>;

export const transactionRouteSchema = z.object({
  capitalNeed: capitalNeedSchema,
  repaymentSources: z.array(repaymentSourceSchema).min(1),
  assetBackings: z.array(assetBackingSchema).default([]),
  obligationInstruments: z.array(obligationInstrumentSchema).default([]),
  distributedSecurities: z.array(distributedSecuritySchema).default([]),
  structureMechanisms: z.array(structureMechanismSchema).default([]),
  capitalVehicles: z.array(capitalVehicleSchema).default([]),
  capitalProviderTypes: z.array(capitalProviderTypeSchema).default([]),
  distributionRoutes: z.array(distributionRouteSchema).default([]),
  securityEnhancements: z.array(securityEnhancementSchema).default([]),
});
export type TransactionRoute = z.infer<typeof transactionRouteSchema>;

