import {z} from "zod";

export const affiliationKinds = [
  "company",
  "bank",
  "advisory",
  "asset_manager",
  "credit_fund",
  "family_office",
  "independent",
  "other",
] as const;

export const professionalRoles = [
  "cfo_treasury",
  "corporate_finance",
  "fp_and_a",
  "controller_accounting",
  "dcm_banker",
  "corporate_banker",
  "relationship_manager",
  "structured_finance_banker",
  "project_finance_banker",
  "syndicate_distribution",
  "advisor",
  "investor_lender",
  "portfolio_manager",
  "credit_analyst",
  "risk_underwriter",
  "investment_committee",
  "legal_structuring",
  "analyst",
  "executive",
  "board_shareholder",
  "other",
] as const;

export const operatingModels = [
  "raise_capital",
  "balance_sheet_lending",
  "structuring",
  "distribution",
  "advisory",
  "investing",
] as const;

export const professionalObjectives = [
  "understand_company",
  "prepare_meetings",
  "originate_ideas",
  "evaluate_capital_options",
  "structure_transactions",
  "prepare_materials",
  "connect_capital",
  "analyze_investments",
] as const;

export const productFamilies = [
  "bilateral_credit",
  "club_syndicated",
  "capital_markets",
  "securitization",
  "asset_backed",
  "project_acquisition_finance",
  "trade_export_agri",
  "structured_flexible_capital",
  "special_situations",
  "derivatives_hedging",
] as const;

export const professionalContextFormSchema = z.object({
  affiliationKind: z.enum(affiliationKinds).optional(),
  professionalRole: z.enum(professionalRoles).optional(),
  institutionName: z.string().trim().max(200).optional(),
  teamName: z.string().trim().max(160).optional(),
  operatingModels: z.array(z.enum(operatingModels)).max(operatingModels.length),
  primaryObjectives: z.array(z.enum(professionalObjectives)).max(professionalObjectives.length),
  productFamilies: z.array(z.enum(productFamilies)).max(productFamilies.length),
  capabilityNotes: z.string().trim().max(2_000).optional(),
});

export type ProfessionalContextForm = z.infer<typeof professionalContextFormSchema>;

export function professionalContextStatus(input: ProfessionalContextForm) {
  const hasAnyContext = Boolean(
    input.affiliationKind
    || input.professionalRole
    || input.institutionName
    || input.teamName
    || input.operatingModels.length
    || input.primaryObjectives.length
    || input.productFamilies.length
    || input.capabilityNotes,
  );
  if (!hasAnyContext) return "skipped" as const;
  if (input.professionalRole && input.operatingModels.length > 0 && input.primaryObjectives.length > 0) {
    return "complete" as const;
  }
  return "partial" as const;
}

export function parseProfessionalContextForm(formData: FormData) {
  const optional = (name: string) => String(formData.get(name) ?? "").trim() || undefined;
  return professionalContextFormSchema.safeParse({
    affiliationKind: optional("affiliation_kind"),
    professionalRole: optional("professional_role"),
    institutionName: optional("institution_name"),
    teamName: optional("team_name"),
    operatingModels: formData.getAll("operating_models").map(String),
    primaryObjectives: formData.getAll("primary_objectives").map(String),
    productFamilies: formData.getAll("product_families").map(String),
    capabilityNotes: optional("capability_notes"),
  });
}
