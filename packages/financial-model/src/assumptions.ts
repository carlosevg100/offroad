import Decimal from "decimal.js";

export type AssumptionSourceType =
  | "company_budget"
  | "company_guidance"
  | "public_filing"
  | "earnings_call"
  | "licensed_consensus"
  | "company_operating_plan"
  | "market_curve"
  | "sector_data"
  | "normalized_history"
  | "offroad_scenario";

export type AssumptionConfidence = "high" | "medium" | "low";
export type AssumptionUnit = "currency" | "percent" | "days" | "multiple" | "quantity" | "index";

export type AssumptionEvidence = {
  sourceId: string;
  title: string;
  asOfDate: string;
  locator?: string;
  url?: string;
};

export type GovernedAssumption = {
  id: string;
  label: {pt: string; en: string};
  unit: AssumptionUnit;
  values: Readonly<Record<string, string>>;
  sourceType: AssumptionSourceType;
  evidence: readonly AssumptionEvidence[];
  rationale: string;
  methodology: string;
  confidence: AssumptionConfidence;
  editable: boolean;
  lowerBound?: string;
  upperBound?: string;
  impacts: readonly string[];
};

export type ScenarioOverride = {
  assumptionId: string;
  values: Readonly<Record<string, string>>;
  rationale: string;
  requestedBy: string;
  createdAt: string;
};

export type AssumptionBook = {
  scenarioId: string;
  scenarioName: string;
  asOfDate: string;
  periods: readonly string[];
  assumptions: readonly GovernedAssumption[];
  parentScenarioId?: string;
  overrides?: readonly ScenarioOverride[];
};

export type AssumptionIssue = {
  severity: "blocker" | "warning";
  assumptionId?: string;
  message: string;
};

const d = (value: string) => new Decimal(value);

export function validateAssumptionBook(book: AssumptionBook): AssumptionIssue[] {
  const issues: AssumptionIssue[] = [];
  const ids = new Set<string>();
  if (!book.scenarioId.trim()) issues.push({severity: "blocker", message: "scenario id is required"});
  if (!/^\d{4}-\d{2}-\d{2}$/.test(book.asOfDate)) issues.push({severity: "blocker", message: "scenario as-of date must use YYYY-MM-DD"});
  if (book.periods.length === 0 || new Set(book.periods).size !== book.periods.length) {
    issues.push({severity: "blocker", message: "forecast periods must be present and unique"});
  }

  for (const assumption of book.assumptions) {
    if (!assumption.id.trim() || ids.has(assumption.id)) {
      issues.push({severity: "blocker", assumptionId: assumption.id, message: "assumption id must be present and unique"});
      continue;
    }
    ids.add(assumption.id);
    if (!assumption.rationale.trim() || !assumption.methodology.trim()) {
      issues.push({severity: "blocker", assumptionId: assumption.id, message: "material assumptions require rationale and methodology"});
    }
    if (assumption.impacts.length === 0) {
      issues.push({severity: "warning", assumptionId: assumption.id, message: "assumption has no declared model impact"});
    }
    if (assumption.sourceType !== "offroad_scenario" && assumption.evidence.length === 0) {
      issues.push({severity: "blocker", assumptionId: assumption.id, message: "external assumptions require dated evidence"});
    }
    if (assumption.sourceType === "offroad_scenario" && assumption.evidence.length === 0) {
      issues.push({severity: "warning", assumptionId: assumption.id, message: "Offroad scenario is not company guidance and must remain visibly labelled"});
    }
    for (const evidence of assumption.evidence) {
      if (!evidence.sourceId.trim() || !evidence.title.trim()) {
        issues.push({severity: "blocker", assumptionId: assumption.id, message: "assumption evidence requires source id and title"});
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.asOfDate)) {
        issues.push({severity: "blocker", assumptionId: assumption.id, message: "assumption evidence requires a valid as-of date"});
      } else if (evidence.asOfDate > book.asOfDate) {
        issues.push({severity: "blocker", assumptionId: assumption.id, message: "assumption evidence cannot be dated after the model"});
      }
    }
    for (const period of book.periods) {
      const value = assumption.values[period];
      if (value === undefined) {
        issues.push({severity: "blocker", assumptionId: assumption.id, message: `missing value for ${period}`});
        continue;
      }
      try {
        const parsed = d(value);
        if (!parsed.isFinite()) throw new Error("not finite");
        if (assumption.lowerBound !== undefined && parsed.lt(d(assumption.lowerBound))) {
          issues.push({severity: "blocker", assumptionId: assumption.id, message: `${period} is below the governed lower bound`});
        }
        if (assumption.upperBound !== undefined && parsed.gt(d(assumption.upperBound))) {
          issues.push({severity: "blocker", assumptionId: assumption.id, message: `${period} is above the governed upper bound`});
        }
      } catch {
        issues.push({severity: "blocker", assumptionId: assumption.id, message: `${period} is not a valid numeric value`});
      }
    }
  }
  return issues;
}

export function assumptionValue(book: AssumptionBook, assumptionId: string, period: string): Decimal {
  const assumption = book.assumptions.find((candidate) => candidate.id === assumptionId);
  if (!assumption) throw new RangeError(`unknown assumption: ${assumptionId}`);
  const value = assumption.values[period];
  if (value === undefined) throw new RangeError(`assumption ${assumptionId} has no value for ${period}`);
  return d(value);
}

export function applyScenarioOverrides(
  base: AssumptionBook,
  input: {scenarioId: string; scenarioName: string; overrides: readonly ScenarioOverride[]},
): AssumptionBook {
  if (!input.scenarioId.trim() || input.scenarioId === base.scenarioId) throw new RangeError("a scenario override requires a new scenario id");
  const overridesById = new Map(input.overrides.map((override) => [override.assumptionId, override]));
  for (const override of input.overrides) {
    const target = base.assumptions.find((assumption) => assumption.id === override.assumptionId);
    if (!target) throw new RangeError(`cannot override unknown assumption: ${override.assumptionId}`);
    if (!target.editable) throw new RangeError(`assumption is locked: ${override.assumptionId}`);
    if (!override.rationale.trim() || !override.requestedBy.trim()) throw new RangeError("scenario overrides require rationale and requester");
  }
  const assumptions = base.assumptions.map((assumption) => {
    const override = overridesById.get(assumption.id);
    if (!override) return assumption;
    return {
      ...assumption,
      values: {...assumption.values, ...override.values},
      sourceType: "offroad_scenario" as const,
      rationale: override.rationale,
      methodology: `Scenario override requested by ${override.requestedBy}; base methodology: ${assumption.methodology}`,
      confidence: "low" as const,
    };
  });
  const candidate: AssumptionBook = {
    scenarioId: input.scenarioId,
    scenarioName: input.scenarioName,
    asOfDate: base.asOfDate,
    periods: [...base.periods],
    assumptions,
    parentScenarioId: base.scenarioId,
    overrides: [...input.overrides],
  };
  const blockers = validateAssumptionBook(candidate).filter((issue) => issue.severity === "blocker");
  if (blockers.length > 0) throw new RangeError(blockers.map((issue) => issue.message).join("; "));
  return candidate;
}
