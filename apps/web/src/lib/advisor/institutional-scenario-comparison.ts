import {createHash} from "node:crypto";
import {buildInstitutionalFinancialModel, parseVerifiedInstitutionalWorkbookArtifact, reviewInstitutionalFinancialModel, type InstitutionalModelInput} from "@offroad/financial-model";

export const comparisonMetrics = ["revenue", "ebitda", "cfads", "debtService", "closingGrossDebt", "unrestrictedCash", "dscr", "netDebtToEbitda", "liquidityHeadroom"] as const;
export type ComparisonMetric = typeof comparisonMetrics[number];
export type InstitutionalComparison = {
  id: string; configurationId: string; revision: number; name: string; currency: string; asOfDate: string; reviewedAt: string;
  compatibilityKey: string; sourceManifestFingerprint: string;
  periods: Array<{period: string; values: Record<ComparisonMetric, string | null>}>;
  sources: Array<{document: string; version: string; asOfDate: string}>;
  assumptions: Array<{id: string; label: {pt: string; en: string}; unit: string; values: Record<string, string>; rationale: string}>;
};

/** Runs only on the server. The client receives exact deterministic values, never a financial calculator. */
export function prepareInstitutionalComparison(result: {id: string; configurationId: string; configurationFingerprint: string; sourceManifestFingerprint: string; artifact: unknown}): InstitutionalComparison | null {
  const artifact = parseVerifiedInstitutionalWorkbookArtifact(result.artifact);
  if (!artifact || artifact.institutional.activeScenarioId !== result.configurationId || artifact.institutional.sourceManifestFingerprint !== result.sourceManifestFingerprint) return null;
  const scenario = artifact.institutional.scenarios.find(s => s.configurationId === result.configurationId && s.configurationFingerprint === result.configurationFingerprint);
  if (!scenario) return null;
  try {
    const input = scenario.input as InstitutionalModelInput;
    const model = buildInstitutionalFinancialModel(input);
    if (createHash("sha256").update(JSON.stringify(model)).digest("hex") !== scenario.outputFingerprint || reviewInstitutionalFinancialModel(input, model).status === "blocked") return null;
    // No implicit FX conversion, period interpolation, perimeter changes or source-snapshot mixing.
    const compatibilityKey = JSON.stringify([input.currency, input.openingBalanceSheet, input.assumptionBook.asOfDate, model.periods.map(p => p.period), [...new Set(scenario.lineage.map(l => JSON.stringify([l.targetPath, l.fieldPath, l.periodStart ?? null, l.periodEnd, l.entityName, l.entityScope, l.value])))].sort(), result.sourceManifestFingerprint]);
    return {id: result.id, configurationId: result.configurationId, revision: scenario.revision, name: input.assumptionBook.scenarioName, currency: input.currency, asOfDate: input.assumptionBook.asOfDate, reviewedAt: scenario.reviewedAt,
      compatibilityKey, sourceManifestFingerprint: result.sourceManifestFingerprint,
      periods: model.periods.map(p => ({period: p.period, values: Object.fromEntries(comparisonMetrics.map(key => [key, p[key]])) as Record<ComparisonMetric, string | null>})),
      sources: scenario.sourceBindings.map(s => ({document: s.sourceDocument, version: s.version, asOfDate: s.asOfDate})),
      assumptions: input.assumptionBook.assumptions.map(a => ({id: a.id, label: a.label, unit: a.unit, values: a.values, rationale: a.rationale})),
    };
  } catch { return null; }
}
