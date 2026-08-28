import Decimal from "decimal.js";

export const receivablesProviderMandateVersion = "2026.08.27-v1";

export type ReceivablesCapitalProviderKind =
  | "bank"
  | "credit_finance_company"
  | "digital_credit_company"
  | "factoring_company"
  | "fidc"
  | "private_credit_fund"
  | "family_office"
  | "institutional_investor"
  | "buyer_sponsored_program";

export type ReceivablesMandateSourceKind =
  | "direct_declaration"
  | "relationship_confirmation"
  | "published_rule"
  | "observed_transaction"
  | "desk_inference";

export type ReceivablesMandateObservation<T> = {
  value: T;
  sourceKind: ReceivablesMandateSourceKind;
  sourceId: string;
  sourceLabel: string;
  observedAt: string;
  validUntil: string;
};

export type ReceivablesProviderCriterionId =
  | "eligible_routes"
  | "currencies"
  | "ticket"
  | "weighted_average_term_days"
  | "minimum_history_months"
  | "maximum_past_due_over_30_ratio"
  | "maximum_past_due_over_90_ratio"
  | "maximum_dilution_ratio"
  | "maximum_adjusted_loss_ratio"
  | "maximum_single_obligor_ratio"
  | "maximum_top_ten_obligor_ratio"
  | "minimum_eligible_portfolio_amount"
  | "live_appetite"
  | "available_capacity";

export type DecimalRange = {min: string; max: string};
export type ReceivablesPolicyRule<T> =
  | {mode: "threshold"; value: T}
  | {mode: "no_restriction"}
  | {mode: "case_by_case"; note: string};

export type ReceivablesProviderMandate = {
  mandateId: string;
  providerId: string;
  providerLegalName: string;
  programId: string;
  programName: string;
  providerKind: ReceivablesCapitalProviderKind;
  version: number;
  effectiveFrom: string;
  eligibleRoutes: readonly ReceivablesMandateObservation<readonly string[]>[];
  currencies: readonly ReceivablesMandateObservation<readonly string[]>[];
  ticket: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<DecimalRange>>[];
  weightedAverageTermDays: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<DecimalRange>>[];
  minimumHistoryMonths: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<number>>[];
  maximumPastDueOver30Ratio: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  maximumPastDueOver90Ratio: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  maximumDilutionRatio: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  maximumAdjustedLossRatio: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  maximumSingleObligorRatio: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  maximumTopTenObligorRatio: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  minimumEligiblePortfolioAmount: readonly ReceivablesMandateObservation<ReceivablesPolicyRule<string>>[];
  liveAppetite: readonly ReceivablesMandateObservation<boolean>[];
  availableCapacity: readonly ReceivablesMandateObservation<string>[];
};

export type ResolvedReceivablesMandateCriterion<T> = {
  value: T;
  accepted: ReceivablesMandateObservation<T>;
  others: readonly ReceivablesMandateObservation<T>[];
  current: boolean;
  confirmed: boolean;
  decisionUseAllowed: boolean;
  divergent: boolean;
};

export type ResolvedReceivablesProviderMandate = {
  mandateId: string;
  providerId: string;
  providerLegalName: string;
  programId: string;
  programName: string;
  providerKind: ReceivablesCapitalProviderKind;
  version: number;
  effectiveFrom: string;
  asOf: string;
  eligibleRoutes: ResolvedReceivablesMandateCriterion<readonly string[]> | null;
  currencies: ResolvedReceivablesMandateCriterion<readonly string[]> | null;
  ticket: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<DecimalRange>> | null;
  weightedAverageTermDays: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<DecimalRange>> | null;
  minimumHistoryMonths: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<number>> | null;
  maximumPastDueOver30Ratio: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  maximumPastDueOver90Ratio: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  maximumDilutionRatio: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  maximumAdjustedLossRatio: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  maximumSingleObligorRatio: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  maximumTopTenObligorRatio: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  minimumEligiblePortfolioAmount: ResolvedReceivablesMandateCriterion<ReceivablesPolicyRule<string>> | null;
  liveAppetite: ResolvedReceivablesMandateCriterion<boolean> | null;
  availableCapacity: ResolvedReceivablesMandateCriterion<string> | null;
  missingCriteria: readonly ReceivablesProviderCriterionId[];
  staleCriteria: readonly ReceivablesProviderCriterionId[];
  unconfirmedCriteria: readonly ReceivablesProviderCriterionId[];
  divergentCriteria: readonly ReceivablesProviderCriterionId[];
};

const sourcePriority: Readonly<Record<ReceivablesMandateSourceKind, number>> = {
  direct_declaration: 1,
  relationship_confirmation: 2,
  published_rule: 3,
  observed_transaction: 4,
  desk_inference: 5,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function resolveCriterion<T>(
  observations: readonly ReceivablesMandateObservation<T>[],
  asOf: string,
): ResolvedReceivablesMandateCriterion<T> | null {
  if (observations.length === 0) return null;
  const asOfTime = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(asOfTime)) throw new RangeError(`invalid mandate as-of date: ${asOf}`);
  for (const observation of observations) {
    const observedAt = Date.parse(`${observation.observedAt}T00:00:00.000Z`);
    const validUntil = Date.parse(`${observation.validUntil}T23:59:59.999Z`);
    if (!Number.isFinite(observedAt) || !Number.isFinite(validUntil)) throw new RangeError(`invalid mandate observation date: ${observation.sourceId}`);
    if (observedAt > asOfTime) throw new RangeError(`future mandate observation: ${observation.sourceId}`);
    if (validUntil < observedAt) throw new RangeError(`mandate observation expires before it is observed: ${observation.sourceId}`);
  }
  const currentAt = (observation: ReceivablesMandateObservation<T>) =>
    Date.parse(`${observation.validUntil}T23:59:59.999Z`) >= asOfTime;
  const ordered = [...observations].sort((left, right) =>
    Number(currentAt(right)) - Number(currentAt(left))
    || sourcePriority[left.sourceKind] - sourcePriority[right.sourceKind]
    || Date.parse(right.observedAt) - Date.parse(left.observedAt)
    || left.sourceId.localeCompare(right.sourceId));
  const accepted = ordered[0]!;
  const current = currentAt(accepted);
  const confirmed = accepted.sourceKind === "direct_declaration" || accepted.sourceKind === "relationship_confirmation";
  const decisionUseAllowed = current && accepted.sourceKind !== "desk_inference";
  const divergent = ordered.slice(1).some((observation) =>
    currentAt(observation) && canonical(observation.value) !== canonical(accepted.value));
  return {value: accepted.value, accepted, others: ordered.slice(1), current, confirmed, decisionUseAllowed, divergent};
}

const entries = [
  ["eligible_routes", "eligibleRoutes"],
  ["currencies", "currencies"],
  ["ticket", "ticket"],
  ["weighted_average_term_days", "weightedAverageTermDays"],
  ["minimum_history_months", "minimumHistoryMonths"],
  ["maximum_past_due_over_30_ratio", "maximumPastDueOver30Ratio"],
  ["maximum_past_due_over_90_ratio", "maximumPastDueOver90Ratio"],
  ["maximum_dilution_ratio", "maximumDilutionRatio"],
  ["maximum_adjusted_loss_ratio", "maximumAdjustedLossRatio"],
  ["maximum_single_obligor_ratio", "maximumSingleObligorRatio"],
  ["maximum_top_ten_obligor_ratio", "maximumTopTenObligorRatio"],
  ["minimum_eligible_portfolio_amount", "minimumEligiblePortfolioAmount"],
  ["live_appetite", "liveAppetite"],
  ["available_capacity", "availableCapacity"],
] as const satisfies readonly [ReceivablesProviderCriterionId, keyof ReceivablesProviderMandate][];

export function resolveReceivablesProviderMandate(
  mandate: ReceivablesProviderMandate,
  asOf: string,
): ResolvedReceivablesProviderMandate {
  if (!Number.isInteger(mandate.version) || mandate.version < 1) throw new RangeError("mandate version must be a positive integer");
  const resolved = Object.fromEntries(entries.map(([criterionId, field]) => [field, resolveCriterion(mandate[field] as readonly ReceivablesMandateObservation<unknown>[], asOf)])) as Record<string, ResolvedReceivablesMandateCriterion<unknown> | null>;
  const missingCriteria = entries.filter(([, field]) => resolved[field] === null).map(([criterionId]) => criterionId);
  const staleCriteria = entries.filter(([, field]) => resolved[field]?.current === false).map(([criterionId]) => criterionId);
  const unconfirmedCriteria = entries.filter(([criterionId, field]) =>
    (criterionId === "live_appetite" || criterionId === "available_capacity")
    && resolved[field] !== null
    && resolved[field]?.confirmed === false).map(([criterionId]) => criterionId);
  const divergentCriteria = entries.filter(([, field]) => resolved[field]?.divergent === true).map(([criterionId]) => criterionId);
  return {
    mandateId: mandate.mandateId,
    providerId: mandate.providerId,
    providerLegalName: mandate.providerLegalName,
    programId: mandate.programId,
    programName: mandate.programName,
    providerKind: mandate.providerKind,
    version: mandate.version,
    effectiveFrom: mandate.effectiveFrom,
    asOf,
    eligibleRoutes: resolved.eligibleRoutes as ResolvedReceivablesProviderMandate["eligibleRoutes"],
    currencies: resolved.currencies as ResolvedReceivablesProviderMandate["currencies"],
    ticket: resolved.ticket as ResolvedReceivablesProviderMandate["ticket"],
    weightedAverageTermDays: resolved.weightedAverageTermDays as ResolvedReceivablesProviderMandate["weightedAverageTermDays"],
    minimumHistoryMonths: resolved.minimumHistoryMonths as ResolvedReceivablesProviderMandate["minimumHistoryMonths"],
    maximumPastDueOver30Ratio: resolved.maximumPastDueOver30Ratio as ResolvedReceivablesProviderMandate["maximumPastDueOver30Ratio"],
    maximumPastDueOver90Ratio: resolved.maximumPastDueOver90Ratio as ResolvedReceivablesProviderMandate["maximumPastDueOver90Ratio"],
    maximumDilutionRatio: resolved.maximumDilutionRatio as ResolvedReceivablesProviderMandate["maximumDilutionRatio"],
    maximumAdjustedLossRatio: resolved.maximumAdjustedLossRatio as ResolvedReceivablesProviderMandate["maximumAdjustedLossRatio"],
    maximumSingleObligorRatio: resolved.maximumSingleObligorRatio as ResolvedReceivablesProviderMandate["maximumSingleObligorRatio"],
    maximumTopTenObligorRatio: resolved.maximumTopTenObligorRatio as ResolvedReceivablesProviderMandate["maximumTopTenObligorRatio"],
    minimumEligiblePortfolioAmount: resolved.minimumEligiblePortfolioAmount as ResolvedReceivablesProviderMandate["minimumEligiblePortfolioAmount"],
    liveAppetite: resolved.liveAppetite as ResolvedReceivablesProviderMandate["liveAppetite"],
    availableCapacity: resolved.availableCapacity as ResolvedReceivablesProviderMandate["availableCapacity"],
    missingCriteria,
    staleCriteria,
    unconfirmedCriteria,
    divergentCriteria,
  };
}

export function assertValidDecimalRange(range: DecimalRange, id: string): void {
  const min = new Decimal(range.min);
  const max = new Decimal(range.max);
  if (!min.isFinite() || !max.isFinite() || min.isNegative() || max.lt(min)) throw new RangeError(`invalid decimal range for ${id}`);
}
