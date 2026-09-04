import {z} from "zod";

/**
 * The personal professional context. Every list here is multi-valued on purpose: a person can be
 * a banker and an advisor, cover DCM and corporate banking, and use the product both inside an
 * institution and on their own. Forcing one answer per question produced a profile that was
 * tidy and wrong.
 *
 * These answers are guidance. They change how work is approached and what is delivered. They
 * never narrow the economic universe, never authorize access to a document, never prove what an
 * institution is able to do and are never read as a mandate.
 */
export const useForms = [
  "institutional_work",
  "independent_practice",
  "personal_projects",
  "exploring",
] as const;

export const professionalRoles = [
  "ceo_founder",
  "board_shareholder",
  "cfo",
  "treasury",
  "corporate_finance",
  "banker",
  "financial_advisor",
  "originator",
  "credit_analyst",
  "risk_underwriting",
  "investor_portfolio_manager",
  "legal_operations",
  "independent_consultant",
  "student_researcher",
  "other",
] as const;

export const practiceAreas = [
  "treasury",
  "corporate_finance",
  "fp_and_a",
  "strategy",
  "corporate_development",
  "investor_relations",
  "dcm",
  "investment_banking",
  "corporate_banking",
  "structured_finance",
  "project_finance",
  "origination",
  "syndicate_distribution",
  "credit",
  "underwriting",
  "risk",
  "private_credit",
  "investments",
  "portfolio_management",
  "special_situations",
  "legal",
  "operations",
  "other",
] as const;

export const professionalObjectives = [
  "understand_company",
  "understand_capital_structure",
  "evaluate_capital_options",
  "prepare_meetings",
  "originate_ideas",
  "organize_documents",
  "analyze_investments",
  "structure_transactions",
  "prepare_materials",
  "connect_capital",
  "monitor_positions",
  "explore_platform",
  "other",
] as const;

export type UseForm = (typeof useForms)[number];
export type ProfessionalRole = (typeof professionalRoles)[number];
export type PracticeArea = (typeof practiceAreas)[number];
export type ProfessionalObjective = (typeof professionalObjectives)[number];

export const professionalContextFormSchema = z.object({
  useForms: z.array(z.enum(useForms)).max(useForms.length),
  professionalRoles: z.array(z.enum(professionalRoles)).max(professionalRoles.length),
  practiceAreas: z.array(z.enum(practiceAreas)).max(practiceAreas.length),
  primaryObjectives: z.array(z.enum(professionalObjectives)).max(professionalObjectives.length),
  institutionName: z.string().trim().max(200).optional(),
});

export type ProfessionalContextForm = z.infer<typeof professionalContextFormSchema>;

/**
 * The organization name only means something for someone who said they work at one. Keeping it
 * otherwise would record an affiliation the person did not declare, which the database rejects
 * as well; dropping it here keeps the two sides in agreement.
 */
export function normalizeProfessionalContext(input: ProfessionalContextForm): ProfessionalContextForm {
  const institutional = input.useForms.includes("institutional_work");
  return {...input, institutionName: institutional ? input.institutionName : undefined};
}

export function professionalContextStatus(input: ProfessionalContextForm) {
  const normalized = normalizeProfessionalContext(input);
  const answered = normalized.useForms.length
    + normalized.professionalRoles.length
    + normalized.practiceAreas.length
    + normalized.primaryObjectives.length
    + (normalized.institutionName ? 1 : 0);
  if (answered === 0) return "skipped" as const;
  if (normalized.useForms.length > 0 && normalized.professionalRoles.length > 0 && normalized.primaryObjectives.length > 0) {
    return "complete" as const;
  }
  return "partial" as const;
}

export function parseProfessionalContextForm(formData: FormData) {
  return professionalContextFormSchema.safeParse({
    useForms: formData.getAll("use_forms").map(String),
    professionalRoles: formData.getAll("professional_roles").map(String),
    practiceAreas: formData.getAll("practice_areas").map(String),
    primaryObjectives: formData.getAll("primary_objectives").map(String),
    institutionName: String(formData.get("institution_name") ?? "").trim() || undefined,
  });
}
