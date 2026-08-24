import type {ArchetypeId} from "./types";

/**
 * One economic requirement may be stated under more than one canonical path.
 *
 * Current gross debt is the clearest example: a debt schedule can state it as
 * `debt.total_gross`, while financial statements state it under a dated historical or interim
 * path. Requiring one spelling would turn a complete case into a false gap. The requirement is
 * therefore named once and discharged by any of its accepted patterns.
 */
export type MaterialFieldRequirement = {
  id: string;
  anyOf: readonly string[];
};

const requirement = (id: string, ...anyOf: string[]): MaterialFieldRequirement => ({id, anyOf});

const common: readonly MaterialFieldRequirement[] = [
  requirement("company_legal_name", "company.legal_name"),
  requirement("requested_amount", "transaction.requested_amount"),
  requirement(
    "current_gross_debt",
    "debt.total_gross",
    "interim_financials.*.gross_debt",
    "historical_financials.*.gross_debt",
  ),
];

const perArchetype: Readonly<Record<ArchetypeId, readonly MaterialFieldRequirement[]>> = {
  growth_expansion: [
    requirement("project_total_cost", "project.total_cost"),
    requirement("project_investment", "project.investments.*.amount"),
    requirement("desired_term", "transaction.desired_term_months"),
    requirement("collateral_capacity", "collateral.total_capacity"),
    requirement("minimum_dscr", "projections.minimum_dscr"),
  ],
  working_capital: [
    requirement("receivables_capacity", "collateral.receivables_capacity"),
    requirement("customer_concentration", "customers.top_customers.*.share_pct"),
  ],
  refinance: [
    requirement("debt_maturity", "debt.instruments.*.maturity"),
    requirement("debt_rate", "debt.instruments.*.rate"),
  ],
  acquisition: [
    requirement("post_transaction_leverage", "leverage.post_transaction_net_debt_ebitda"),
  ],
  equipment_finance: [
    requirement("project_total_cost", "project.total_cost"),
    requirement("asset_appraisal", "collateral.assets.*.appraisal_value"),
  ],
  venture_debt: [
    requirement("runway", "company.runway_months"),
    requirement("net_revenue_retention", "company.net_revenue_retention"),
    requirement("last_equity_round", "company.last_equity_round.amount"),
  ],
  other: [],
};

export function materialFieldRequirements(archetypeId: ArchetypeId): MaterialFieldRequirement[] {
  return [...common, ...perArchetype[archetypeId]];
}

const regexpFor = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^.]+");
  return new RegExp(`^${escaped}$`);
};

export function fieldMatchesPattern(fieldPath: string, pattern: string): boolean {
  return regexpFor(pattern).test(fieldPath);
}

export function requirementIsSatisfied(
  requirement: MaterialFieldRequirement,
  availableFieldPaths: ReadonlySet<string>,
): boolean {
  return requirement.anyOf.some((pattern) =>
    [...availableFieldPaths].some((fieldPath) => fieldMatchesPattern(fieldPath, pattern)),
  );
}

export function fieldsForRequirement<T extends {key: {fieldPath: string}}>(
  requirement: MaterialFieldRequirement,
  facts: readonly T[],
): T[] {
  return facts.filter((fact) => requirement.anyOf.some((pattern) => fieldMatchesPattern(fact.key.fieldPath, pattern)));
}
