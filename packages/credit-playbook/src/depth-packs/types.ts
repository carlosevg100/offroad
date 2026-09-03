export type DepthPackDimension = "core" | "economic_situation" | "capital_objective" | "instrument" | "sector" | "analysis_domain" | "professional_function" | "jurisdiction" | "market_execution";
export type CoverageDomain = "company_and_business_model" | "sector_and_competitive_position" | "historical_financials" | "earnings_quality" | "cash_conversion_and_working_capital" | "liquidity_and_debt_schedule" | "leverage_and_debt_service" | "covenants" | "collateral_and_security" | "receivables_inventory_or_contracts" | "business_plan_and_sources_uses" | "downside_and_sensitivities" | "legal_tax_and_regulatory" | "capital_alternatives" | "structure_and_terms" | "market_pricing_and_precedents" | "capital_provider_fit" | "execution_timeline_and_contingency" | "materials_and_cross_consistency";
export type CoverageMateriality = "blocking" | "high" | "medium" | "low";

export type CoverageRequirementDefinition = {
  key: string;
  domain: CoverageDomain;
  label: string;
  questionAnswered: string;
  decisionImpacts: string[];
  acceptableEvidence: string[];
  materiality: CoverageMateriality;
};

/** Structural twin of the agent-contract manifest, kept dependency-free inside canonical knowledge. */
export type CanonicalDepthPack = {
  schemaVersion: "dcm-depth-pack.v1";
  id: string;
  version: string;
  owner: string;
  dimension: DepthPackDimension;
  activationKeys: string[];
  supportedJobs: string[];
  professionalFunctions: string[];
  requirements: CoverageRequirementDefinition[];
  procedureIds: string[];
  calculationPolicy: "required" | "conditional" | "not_applicable";
  calculationIds: string[];
  calculationRationale: string;
  structureTermKeys: string[];
  marketCriterionKeys: string[];
  disconfirmers: string[];
  qualityGateIds: string[];
  goldCaseIds: string[];
  adversarialCaseIds: string[];
  generalistBenchmarkIds: string[];
  dependsOn: string[];
  incompatibleWith: string[];
  maturity: "specified" | "implemented" | "tested" | "production";
  reviewedBy: string | null;
  reviewedAt: string | null;
};
