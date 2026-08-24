import {transactionRouteSchema, type TransactionRoute} from "@offroad/credit-ontology";

import type {InstrumentId, IssuerProfile} from "./instruments";
import type {ArchetypeId} from "./types";

const capitalNeed = (archetypeId: ArchetypeId): TransactionRoute["capitalNeed"] =>
  archetypeId === "other" ? "other" : archetypeId;

/**
 * Compatibility boundary from the original instrument menu to the orthogonal taxonomy.
 *
 * The legacy id remains stable for existing screens and snapshots. The returned route is the
 * economic interpretation used by new analysis, evals and artifacts. No consumer should infer
 * that a vehicle such as a FIDC is the company's obligation merely because the old menu used one
 * id for the commercial route.
 */
export function routeForLegacyInstrument(id: InstrumentId, profile: IssuerProfile): TransactionRoute {
  const common = {capitalNeed: capitalNeed(profile.archetypeId)};

  switch (id) {
    case "ccb":
      return transactionRouteSchema.parse({...common, repaymentSources: ["operating_cash_flow"], obligationInstruments: ["ccb"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet", "credit_fund"], capitalProviderTypes: ["bank", "credit_fund_manager"], distributionRoutes: ["bilateral_private"]});
    case "nce":
      return transactionRouteSchema.parse({...common, repaymentSources: ["operating_cash_flow"], obligationInstruments: ["nce"], structureMechanisms: ["bilateral_loan"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"]});
    case "debenture_476":
      return transactionRouteSchema.parse({...common, repaymentSources: ["operating_cash_flow"], obligationInstruments: ["debenture"], distributedSecurities: ["debenture"], structureMechanisms: ["private_placement"], capitalVehicles: ["credit_fund", "family_office", "insurance_balance_sheet"], capitalProviderTypes: ["asset_manager", "institutional_investor", "family_office", "insurer"], distributionRoutes: ["private_distribution"]});
    case "debenture_160":
      return transactionRouteSchema.parse({...common, repaymentSources: ["operating_cash_flow"], obligationInstruments: ["debenture"], distributedSecurities: ["debenture"], structureMechanisms: ["public_offering"], capitalVehicles: ["credit_fund", "family_office", "insurance_balance_sheet"], capitalProviderTypes: ["asset_manager", "institutional_investor", "family_office", "insurer"], distributionRoutes: ["public_distribution"]});
    case "cra":
      return transactionRouteSchema.parse({...common, repaymentSources: ["receivables_collection", "operating_cash_flow"], assetBackings: ["receivables"], obligationInstruments: ["other"], distributedSecurities: ["cra"], structureMechanisms: ["securitization"], capitalVehicles: ["securitization_company", "credit_fund"], capitalProviderTypes: ["securitization_company", "asset_manager", "institutional_investor"], distributionRoutes: ["institutional_sounding"]});
    case "cri":
      return transactionRouteSchema.parse({...common, repaymentSources: ["asset_cash_flow", "operating_cash_flow"], assetBackings: ["real_estate"], obligationInstruments: ["other"], distributedSecurities: ["cri"], structureMechanisms: ["securitization"], capitalVehicles: ["securitization_company", "credit_fund"], capitalProviderTypes: ["securitization_company", "asset_manager", "institutional_investor"], distributionRoutes: ["institutional_sounding"], securityEnhancements: ["fiduciary_lien_real_estate"]});
    case "fidc":
      return transactionRouteSchema.parse({...common, repaymentSources: ["receivables_collection"], assetBackings: ["receivables"], obligationInstruments: ["receivables_assignment"], distributedSecurities: ["fidc_senior_quota", "fidc_subordinated_quota"], structureMechanisms: ["receivables_purchase"], capitalVehicles: ["fidc"], capitalProviderTypes: ["fidc_manager"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["overcollateralization", "subordination"]});
    case "venture_debt":
      return transactionRouteSchema.parse({...common, repaymentSources: ["sponsor_support", "operating_cash_flow"], obligationInstruments: ["other"], structureMechanisms: ["venture_debt"], capitalVehicles: ["credit_fund"], capitalProviderTypes: ["credit_fund_manager"], distributionRoutes: ["bilateral_private"]});
    case "finame":
      return transactionRouteSchema.parse({...common, repaymentSources: ["operating_cash_flow"], assetBackings: ["equipment"], obligationInstruments: ["finame_on_lending"], structureMechanisms: ["asset_finance"], capitalVehicles: ["development_bank_program", "bank_balance_sheet"], capitalProviderTypes: ["development_bank", "bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_lien_equipment"]});
    case "leasing":
      return transactionRouteSchema.parse({...common, repaymentSources: ["operating_cash_flow"], assetBackings: ["equipment"], obligationInstruments: ["leasing"], structureMechanisms: ["asset_finance"], capitalVehicles: ["bank_balance_sheet"], capitalProviderTypes: ["bank"], distributionRoutes: ["bilateral_private"], securityEnhancements: ["fiduciary_lien_equipment"]});
  }
}

