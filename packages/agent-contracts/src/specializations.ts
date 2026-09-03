import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

import {professionalFunctionSchema} from "./professional-functions";
import {executableWorkspaceJobSchema} from "./workspace-jobs";

export const specializationDimensionSchema = z.enum([
  "core",
  "economic_situation",
  "capital_objective",
  "instrument",
  "sector",
  "analysis_domain",
  "professional_function",
  "jurisdiction",
  "market_execution",
]);
export type SpecializationDimension = z.infer<typeof specializationDimensionSchema>;

export const coverageDomainSchema = z.enum([
  "company_and_business_model",
  "sector_and_competitive_position",
  "historical_financials",
  "earnings_quality",
  "cash_conversion_and_working_capital",
  "liquidity_and_debt_schedule",
  "leverage_and_debt_service",
  "covenants",
  "collateral_and_security",
  "receivables_inventory_or_contracts",
  "business_plan_and_sources_uses",
  "downside_and_sensitivities",
  "legal_tax_and_regulatory",
  "capital_alternatives",
  "structure_and_terms",
  "market_pricing_and_precedents",
  "capital_provider_fit",
  "execution_timeline_and_contingency",
  "materials_and_cross_consistency",
]);
export type CoverageDomain = z.infer<typeof coverageDomainSchema>;

const coverageMaterialitySchema = z.enum(["blocking", "high", "medium", "low"]);
const coverageMaterialityRank: Readonly<Record<z.infer<typeof coverageMaterialitySchema>, number>> = {
  blocking: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export const coverageRequirementDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  domain: coverageDomainSchema,
  label: z.string().trim().min(3).max(240),
  questionAnswered: z.string().trim().min(5).max(1_000),
  decisionImpacts: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  acceptableEvidence: z.array(z.string().trim().min(2).max(240)).max(20).default([]),
  materiality: coverageMaterialitySchema,
});
export type CoverageRequirementDefinition = z.infer<typeof coverageRequirementDefinitionSchema>;

export const depthPackManifestSchema = z.object({
  schemaVersion: z.literal("dcm-depth-pack.v1"),
  id: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  version: z.string().regex(/^\d{4}[.]\d{2}[.]\d{2}-v\d+$/),
  owner: z.string().trim().min(3).max(200),
  dimension: specializationDimensionSchema,
  activationKeys: z.array(z.string().trim().min(2).max(160)).min(1).max(50),
  supportedJobs: z.array(executableWorkspaceJobSchema).min(1),
  professionalFunctions: z.array(professionalFunctionSchema).max(28).default([]),
  requirements: z.array(coverageRequirementDefinitionSchema).min(1).max(200),
  procedureIds: z.array(z.string().regex(/^[A-Z]{1,4}-[A-Z0-9.-]{1,40}$/)).min(1).max(200),
  calculationPolicy: z.enum(["required", "conditional", "not_applicable"]),
  calculationIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(100).default([]),
  calculationRationale: z.string().trim().min(5).max(500),
  structureTermKeys: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(100).default([]),
  marketCriterionKeys: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(100).default([]),
  disconfirmers: z.array(z.string().trim().min(5).max(500)).min(1).max(100),
  qualityGateIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).min(1).max(100),
  goldCaseIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,160}$/)).max(100).default([]),
  adversarialCaseIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,160}$/)).max(100).default([]),
  generalistBenchmarkIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,160}$/)).max(100).default([]),
  dependsOn: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(30).default([]),
  incompatibleWith: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).max(30).default([]),
  maturity: z.enum(["specified", "implemented", "tested", "production"]),
  reviewedBy: z.string().trim().min(3).max(200).nullable().default(null),
  reviewedAt: z.iso.datetime().nullable().default(null),
}).superRefine((pack, context) => {
  const duplicateRequirement = pack.requirements.find((requirement, index) =>
    pack.requirements.findIndex((candidate) => candidate.key === requirement.key) !== index
  );
  if (duplicateRequirement) {
    context.addIssue({code: "custom", path: ["requirements"], message: `duplicate requirement ${duplicateRequirement.key}`});
  }
  if (pack.calculationPolicy === "required" && pack.calculationIds.length === 0) {
    context.addIssue({code: "custom", path: ["calculationIds"], message: "required calculation policy needs a deterministic calculation"});
  }
  if (pack.maturity === "production") {
    if (pack.goldCaseIds.length < 2) {
      context.addIssue({code: "custom", path: ["goldCaseIds"], message: "production packs require at least two gold cases"});
    }
    if (pack.adversarialCaseIds.length < 1) {
      context.addIssue({code: "custom", path: ["adversarialCaseIds"], message: "production packs require adversarial coverage"});
    }
    if (pack.generalistBenchmarkIds.length < 1) {
      context.addIssue({code: "custom", path: ["generalistBenchmarkIds"], message: "production packs require a benchmark against the best available generalist model"});
    }
    if (!pack.reviewedBy || !pack.reviewedAt) {
      context.addIssue({code: "custom", path: ["reviewedBy"], message: "production packs require documented expert review"});
    }
  }
});
export type DepthPackManifest = z.infer<typeof depthPackManifestSchema>;

export const compiledCoverageRequirementSchema = coverageRequirementDefinitionSchema.extend({
  sourcePackIds: z.array(z.string().regex(/^[a-z0-9_.-]{3,120}$/)).min(1),
});

export const compiledSpecializationProfileSchema = z.object({
  schemaVersion: z.literal("dcm-specialization-profile.v1"),
  packIds: z.array(z.string()).min(1),
  activatedDimensions: z.array(z.object({
    dimension: specializationDimensionSchema,
    packIds: z.array(z.string()).min(1),
  })).min(1),
  requirements: z.array(compiledCoverageRequirementSchema).min(1),
  procedureIds: z.array(z.string()).min(1),
  calculationIds: z.array(z.string()),
  structureTermKeys: z.array(z.string()),
  marketCriterionKeys: z.array(z.string()),
  disconfirmers: z.array(z.string()).min(1),
  qualityGateIds: z.array(z.string()).min(1),
  minimumMaturity: z.enum(["specified", "implemented", "tested", "production"]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CompiledSpecializationProfile = z.infer<typeof compiledSpecializationProfileSchema>;

const dimensionOrder = specializationDimensionSchema.options;
const maturityOrder = ["specified", "implemented", "tested", "production"] as const;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Composes independent depth packs. It intentionally does not create a bespoke implementation for
 * combinations such as `retail + refinance + debenture`: those cases are compiled from reusable,
 * reviewable packs and retain the lineage of every contributed rule.
 */
export function composeDepthPacks(rawPacks: readonly DepthPackManifest[]): CompiledSpecializationProfile {
  const packs = rawPacks.map((pack) => depthPackManifestSchema.parse(pack));
  if (!packs.some((pack) => pack.dimension === "core")) throw new Error("a core DCM pack is required");
  const byId = new Map(packs.map((pack) => [pack.id, pack]));
  if (byId.size !== packs.length) throw new Error("depth pack ids must be unique");
  for (const pack of packs) {
    for (const dependency of pack.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`${pack.id} requires missing pack ${dependency}`);
    }
    for (const incompatible of pack.incompatibleWith) {
      if (byId.has(incompatible)) throw new Error(`${pack.id} is incompatible with ${incompatible}`);
    }
  }

  const requirementMap = new Map<string, z.infer<typeof compiledCoverageRequirementSchema>>();
  for (const pack of packs) {
    for (const requirement of pack.requirements) {
      const existing = requirementMap.get(requirement.key);
      if (!existing) {
        requirementMap.set(requirement.key, {...requirement, sourcePackIds: [pack.id]});
        continue;
      }
      if (existing.domain !== requirement.domain || existing.label !== requirement.label) {
        throw new Error(`conflicting definition for coverage requirement ${requirement.key}`);
      }
      requirementMap.set(requirement.key, {
        ...existing,
        questionAnswered: existing.questionAnswered === requirement.questionAnswered
          ? existing.questionAnswered
          : `${existing.questionAnswered} / ${requirement.questionAnswered}`,
        decisionImpacts: uniqueSorted([...existing.decisionImpacts, ...requirement.decisionImpacts]),
        acceptableEvidence: uniqueSorted([...existing.acceptableEvidence, ...requirement.acceptableEvidence]),
        materiality: coverageMaterialityRank[requirement.materiality] > coverageMaterialityRank[existing.materiality]
          ? requirement.materiality
          : existing.materiality,
        sourcePackIds: uniqueSorted([...existing.sourcePackIds, pack.id]),
      });
    }
  }

  const sortedPacks = [...packs].sort((left, right) =>
    dimensionOrder.indexOf(left.dimension) - dimensionOrder.indexOf(right.dimension)
      || left.id.localeCompare(right.id)
  );
  const payload = {
    schemaVersion: "dcm-specialization-profile.v1" as const,
    packIds: sortedPacks.map((pack) => pack.id),
    activatedDimensions: dimensionOrder.flatMap((dimension) => {
      const packIds = sortedPacks.filter((pack) => pack.dimension === dimension).map((pack) => pack.id);
      return packIds.length ? [{dimension, packIds}] : [];
    }),
    requirements: [...requirementMap.values()].sort((left, right) => left.key.localeCompare(right.key)),
    procedureIds: uniqueSorted(packs.flatMap((pack) => pack.procedureIds)),
    calculationIds: uniqueSorted(packs.flatMap((pack) => pack.calculationIds)),
    structureTermKeys: uniqueSorted(packs.flatMap((pack) => pack.structureTermKeys)),
    marketCriterionKeys: uniqueSorted(packs.flatMap((pack) => pack.marketCriterionKeys)),
    disconfirmers: uniqueSorted(packs.flatMap((pack) => pack.disconfirmers)),
    qualityGateIds: uniqueSorted(packs.flatMap((pack) => pack.qualityGateIds)),
    minimumMaturity: maturityOrder[Math.min(...packs.map((pack) => maturityOrder.indexOf(pack.maturity)))]!,
  };
  return compiledSpecializationProfileSchema.parse({...payload, fingerprint: fingerprintJson(payload)});
}

export const coverageAssessmentStatusSchema = z.enum([
  "not_examined",
  "insufficient_evidence",
  "covered",
  "conflicting",
  "not_applicable",
  "deferred",
]);
export type CoverageAssessmentStatus = z.infer<typeof coverageAssessmentStatusSchema>;

export const coverageAssessmentSchema = z.object({
  requirementKey: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  status: coverageAssessmentStatusSchema,
  evidenceRefs: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  rationale: z.string().trim().min(3).max(1_000).nullable().default(null),
  assessedAt: z.iso.datetime().nullable().default(null),
}).superRefine((assessment, context) => {
  if (assessment.status === "covered" && assessment.evidenceRefs.length === 0) {
    context.addIssue({code: "custom", path: ["evidenceRefs"], message: "covered dimensions require evidence"});
  }
  if (["insufficient_evidence", "conflicting", "not_applicable", "deferred"].includes(assessment.status)
      && !assessment.rationale) {
    context.addIssue({code: "custom", path: ["rationale"], message: "this status requires an explicit rationale"});
  }
});
export type CoverageAssessment = z.infer<typeof coverageAssessmentSchema>;

export const decisionCoverageMapSchema = z.object({
  schemaVersion: z.literal("dcm-decision-coverage-map.v1"),
  specializationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  dimensions: z.array(compiledCoverageRequirementSchema.extend({
    status: coverageAssessmentStatusSchema,
    evidenceRefs: z.array(z.string()),
    rationale: z.string().nullable(),
    assessedAt: z.iso.datetime().nullable(),
  })).min(1),
  blockingKeys: z.array(z.string()),
  unexaminedKeys: z.array(z.string()),
  disclosedGapKeys: z.array(z.string()),
  decisionReady: z.boolean(),
  complete: z.boolean(),
});
export type DecisionCoverageMap = z.infer<typeof decisionCoverageMapSchema>;

export function buildDecisionCoverageMap(
  profile: CompiledSpecializationProfile,
  rawAssessments: readonly CoverageAssessment[],
): DecisionCoverageMap {
  const assessments = rawAssessments.map((assessment) => coverageAssessmentSchema.parse(assessment));
  const assessmentByKey = new Map(assessments.map((assessment) => [assessment.requirementKey, assessment]));
  if (assessmentByKey.size !== assessments.length) throw new Error("coverage assessments must be unique by requirement");
  for (const key of assessmentByKey.keys()) {
    if (!profile.requirements.some((requirement) => requirement.key === key)) {
      throw new Error(`assessment references unknown coverage requirement ${key}`);
    }
  }
  const dimensions = profile.requirements.map((requirement) => {
    const assessment = assessmentByKey.get(requirement.key) ?? {
      requirementKey: requirement.key,
      status: "not_examined" as const,
      evidenceRefs: [],
      rationale: null,
      assessedAt: null,
    };
    return {...requirement, ...assessment};
  });
  const unresolved = new Set(["not_examined", "insufficient_evidence", "conflicting", "deferred"]);
  const blockingKeys = dimensions
    .filter((dimension) => dimension.materiality === "blocking" && unresolved.has(dimension.status))
    .map((dimension) => dimension.key);
  const unexaminedKeys = dimensions.filter((dimension) => dimension.status === "not_examined").map((dimension) => dimension.key);
  const disclosedGapKeys = dimensions
    .filter((dimension) => ["insufficient_evidence", "conflicting", "deferred"].includes(dimension.status))
    .map((dimension) => dimension.key);
  return decisionCoverageMapSchema.parse({
    schemaVersion: "dcm-decision-coverage-map.v1",
    specializationFingerprint: profile.fingerprint,
    dimensions,
    blockingKeys,
    unexaminedKeys,
    disclosedGapKeys,
    decisionReady: blockingKeys.length === 0,
    complete: dimensions.every((dimension) => ["covered", "not_applicable"].includes(dimension.status)),
  });
}
