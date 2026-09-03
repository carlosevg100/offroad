import {describe, expect, it} from "vitest";

import {
  assessDomainSurvival,
  buildDecisionCoverageMap,
  composeDepthPacks,
  depthPackManifestSchema,
  professionalFunctionGroupByFunction,
  type CoverageRequirementDefinition,
  type DepthPackManifest,
} from "./index";

const requirement = (
  key: string,
  materiality: CoverageRequirementDefinition["materiality"],
  domain: CoverageRequirementDefinition["domain"] = "liquidity_and_debt_schedule",
): CoverageRequirementDefinition => ({
  key,
  domain,
  label: key === "debt.schedule" ? "Cronograma da dívida" : "Custo de saída",
  questionAnswered: key === "debt.schedule"
    ? "Quando e como cada instrumento vence?"
    : "Qual é o custo econômico de substituir a dívida?",
  decisionImpacts: ["Prazo, volume e caminho de refinanciamento"],
  acceptableEvidence: ["Planilha de dívida", "Contrato ou escritura"],
  materiality,
});

const pack = (overrides: Partial<DepthPackManifest> & Pick<DepthPackManifest, "id" | "dimension">): DepthPackManifest => ({
  schemaVersion: "dcm-depth-pack.v1",
  version: "2026.09.03-v1",
  owner: "Offroad DCM desk",
  activationKeys: [overrides.id],
  supportedJobs: ["capital_planning", "origination_thesis"],
  professionalFunctions: [],
  requirements: [requirement(`${overrides.id}.coverage`, "high")],
  procedureIds: [`PK-${overrides.id.replaceAll("_", "-").toUpperCase()}`],
  calculationPolicy: "conditional",
  calculationIds: [],
  calculationRationale: "Calculations are selected from the facts available in the case.",
  structureTermKeys: [],
  marketCriterionKeys: [],
  disconfirmers: [`Evidence could invalidate ${overrides.id}.`],
  qualityGateIds: [`${overrides.id}.quality`],
  goldCaseIds: [],
  adversarialCaseIds: [],
  generalistBenchmarkIds: [],
  dependsOn: [],
  incompatibleWith: [],
  maturity: "implemented",
  reviewedBy: null,
  reviewedAt: null,
  ...overrides,
});

describe("composable DCM depth engine", () => {
  it("represents a credit analyst explicitly instead of collapsing every analyst role", () => {
    expect(professionalFunctionGroupByFunction.credit_analyst).toBe("credit_analysis");
    expect(professionalFunctionGroupByFunction.underwriter).toBe("risk_and_underwriting");
    expect(professionalFunctionGroupByFunction.syndicate_or_distribution).toBe("syndicate_distribution");
  });

  it("composes need, sector, instrument, analysis and user-function packs without a bespoke combination", () => {
    const core = pack({
      id: "core.dcm",
      dimension: "core",
      requirements: [requirement("debt.schedule", "blocking")],
      procedureIds: ["CORE-01"],
    });
    const refinance = pack({
      id: "need.refinance",
      dimension: "economic_situation",
      requirements: [requirement("debt.schedule", "high"), requirement("refinance.exit_cost", "blocking")],
      dependsOn: ["core.dcm"],
    });
    const compiled = composeDepthPacks([
      core,
      refinance,
      pack({id: "sector.retail", dimension: "sector", dependsOn: ["core.dcm"]}),
      pack({id: "instrument.debenture", dimension: "instrument", dependsOn: ["core.dcm"]}),
      pack({id: "analysis.covenants", dimension: "analysis_domain", dependsOn: ["core.dcm"]}),
      pack({id: "function.dcm_origination", dimension: "professional_function", dependsOn: ["core.dcm"]}),
    ]);

    expect(compiled.packIds).toEqual([
      "core.dcm",
      "need.refinance",
      "instrument.debenture",
      "sector.retail",
      "analysis.covenants",
      "function.dcm_origination",
    ]);
    expect(compiled.requirements.find((item) => item.key === "debt.schedule")).toMatchObject({
      materiality: "blocking",
      sourcePackIds: ["core.dcm", "need.refinance"],
    });
    expect(compiled.fingerprint).toHaveLength(64);
  });

  it("refuses to promote a shallow pack to production", () => {
    expect(depthPackManifestSchema.safeParse(pack({
      id: "instrument.shallow",
      dimension: "instrument",
      maturity: "production",
    })).success).toBe(false);
  });

  it("makes omissions explicit and blocks a decision when a blocking dimension was not examined", () => {
    const profile = composeDepthPacks([pack({
      id: "core.dcm",
      dimension: "core",
      requirements: [
        requirement("debt.schedule", "blocking"),
        requirement("refinance.exit_cost", "high"),
      ],
      procedureIds: ["CORE-01"],
    })]);
    const initial = buildDecisionCoverageMap(profile, []);
    expect(initial.decisionReady).toBe(false);
    expect(initial.unexaminedKeys).toEqual(["debt.schedule", "refinance.exit_cost"]);
    expect(initial.blockingKeys).toEqual(["debt.schedule"]);

    const assessed = buildDecisionCoverageMap(profile, [{
      requirementKey: "debt.schedule",
      status: "covered",
      evidenceRefs: ["document:debt-schedule:sheet-1"],
      rationale: null,
      assessedAt: "2026-09-03T14:00:00.000Z",
    }]);
    expect(assessed.decisionReady).toBe(true);
    expect(assessed.complete).toBe(false);
    expect(assessed.unexaminedKeys).toEqual(["refinance.exit_cost"]);

    const deferred = buildDecisionCoverageMap(profile, [{
      requirementKey: "debt.schedule",
      status: "deferred",
      evidenceRefs: [],
      rationale: "The debt schedule was requested and will be reviewed when received.",
      assessedAt: "2026-09-03T14:05:00.000Z",
    }]);
    expect(deferred.decisionReady).toBe(false);
    expect(deferred.blockingKeys).toEqual(["debt.schedule"]);
  });

  it("fails the survival test when the output is polished but has no supported decision impact", () => {
    const check = (criterion: "coverage_completeness" | "evidence_traceability") => ({
      criterion,
      required: true,
      status: "passed" as const,
      evidenceRefs: [`artifact:${criterion}`],
      rationale: "The governed artifact demonstrates this criterion.",
    });
    const assessment = assessDomainSurvival({
      checks: [check("coverage_completeness"), check("evidence_traceability")],
      valueObservations: [],
    });
    expect(assessment.survives).toBe(false);
    expect(assessment.failureReasons).toContain("no materially supported decision-value observation");
  });
});
