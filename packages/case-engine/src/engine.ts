import {compileMaterials, type Material} from "@offroad/case-materials";
import {runCase, type CaseRunPolicy, type CaseRunReport, type StageContext} from "@offroad/case-runner";
import {
  assessReadiness,
  auditBrief,
  buildClaimRegistry,
  caseBriefSchema,
  caseOutcomeSchema,
  claimFingerprint,
  deriveCaseOutcome,
  deskEvidence,
  fingerprintJson,
  normalizeSemanticAudit,
  type AuditReport,
  type CaseBrief,
  type ClaimDecision,
  type ClaimRegistry,
  type CaseOutcome,
  type NormalizedSemanticAudit,
  type ReadinessReport,
  type SemanticAudit,
} from "@offroad/case-understanding";
import {
  analyzeCreditPosition,
  buildDeskInputs,
  judgeOperation,
  projectLeverageTrajectory,
  questionsForCompany,
  rateCredit,
  stressTable,
  type ClientQuestion,
  type DeskAnalysis,
  type InternalRating,
  type OperationVerdict,
  type StressScenario,
  type Trajectory,
} from "@offroad/credit-analysis";
import {
  archetype,
  instrumentVerdicts,
  materialFieldRequirements,
  type ArchetypeId,
  type ClassifiedDocument,
  type InformationAnswers,
  type InstrumentVerdict,
  type LegalForm,
  type MaterialFieldRequirement,
  type RequirementResponses,
} from "@offroad/credit-playbook";
import {dataRoomIndex, planDataRoom, type DataRoomDocument, type DataRoomPlan} from "@offroad/data-room";
import {
  assessCapacity,
  buildOperationTruthSet,
  buildStructureTruthSet,
  buildTermSheet,
  designCollateralPackage,
  type CapacityAssessment,
  type CollateralAsset,
  type CollateralPackage,
  type IndicativeTermSheet,
  type OperationPolicies,
  type OperationTruthSet,
  type StructurePolicies,
  type StructureTruthSet,
} from "@offroad/deal-structure";
import {
  assessMandateFit,
  rankFits,
  structuralExclusions,
  type CollateralKind,
  type DealRequest,
  type Instrument,
  type MandateFit,
  type ResolvedMandate,
} from "@offroad/fund-mandate";
import {indicativePrice, type IndicativePrice, type PricedInstrument} from "@offroad/market-reference";
import {reconcileCase, type FactCandidate, type ReconciliationReport} from "@offroad/reconciliation";
import {analyzeReceivables, type ReceivablesAnalysis, type ReceivablesCase} from "@offroad/receivables-analysis";
import {z} from "zod";

export const caseEngineVersion = "2026.08.25-v7";

export type CaseDealBrief = {
  requestedAmount?: string;
  requestedTermMonths?: number;
  requestedGraceMonths?: number;
  sector?: string;
  geography?: string;
  instruments?: Instrument[];
  collateralKinds?: CollateralKind[];
  expectedRate?: string;
};

export type BriefWriterResult = {
  brief: CaseBrief | null;
  blockedBy: string[];
  usage?: {costUsd: number; modelCalls: number};
  modelInvocations?: unknown[];
};

export type BriefVerifierResult = {
  audit: SemanticAudit;
  usage?: {costUsd: number; modelCalls: number};
  modelInvocations?: unknown[];
};

export type CaseEngineInput = {
  runId: string;
  caseId: string;
  archetypeId: ArchetypeId;
  locale: "pt" | "en";
  referenceDate: string;
  candidates: FactCandidate[];
  documents: ClassifiedDocument[];
  roomDocuments: DataRoomDocument[];
  dealBrief: CaseDealBrief;
  resolvedMandates: ResolvedMandate[];
  externalReleaseApproved: boolean;
  claimDecisions?: ClaimDecision[];
  informationAnswers?: InformationAnswers;
  requirementResponses?: RequirementResponses;
  receivablesCase?: ReceivablesCase;
  indexLevels?: {cdi: string; tlp: string; ipca: string; tr: string};
  operationPolicies?: OperationPolicies;
  structurePolicies?: StructurePolicies;
  writeBrief?: (input: {
    archetypeId: ArchetypeId;
    locale: "pt" | "en";
    reconciliation: ReconciliationReport;
    desk: DeskAnalysis | null;
    trajectory: Trajectory | null;
    receivables: ReceivablesAnalysis | null;
  }) => Promise<BriefWriterResult>;
  verifyBrief?: (input: {
    brief: CaseBrief;
    facts: ReconciliationReport["facts"];
    calculations: ReconciliationReport["calculations"];
  }) => Promise<BriefVerifierResult>;
};

export type CaseEngineState = {
  reconciliation: ReconciliationReport;
  readiness: ReadinessReport;
  capacity: CapacityAssessment | null;
  operationTruth: OperationTruthSet;
  structureTruth: StructureTruthSet;
  desk: DeskAnalysis | null;
  trajectory: Trajectory | null;
  receivables: ReceivablesAnalysis | null;
  deskMissing: string[];
  clientQuestions: ClientQuestion[];
  termSheet: IndicativeTermSheet | null;
  rating: InternalRating | null;
  stress: StressScenario[];
  instruments: InstrumentVerdict[];
  collateral: CollateralPackage | null;
  price: IndicativePrice | null;
  verdict: OperationVerdict | null;
  brief: CaseBrief | null;
  briefBlockedBy: string[];
  claimRegistry: ClaimRegistry | null;
  materials: Material[];
  materialsBlockedBy: string[];
  dataRoom: DataRoomPlan;
  matching: {
    screened: boolean;
    fits: MandateFit[];
    structuralExclusions: string[];
  };
  outcome: CaseOutcome;
  modelInvocations: unknown[];
};

export type CaseEngineResult = {state: CaseEngineState; report: CaseRunReport};

/** Matching information safe to return to a borrower-side workspace before an introduction. */
export type PublicMatchingSummary = {
  screened: boolean;
  counts: {fits: number; possible: number; excluded: number};
  structuralExclusions: string[];
  unlockedBy: string[];
  ourGaps: string[];
};

export type PublicCaseEngineState = Omit<CaseEngineState, "matching"> & {
  matching: PublicMatchingSummary;
};

export function summarizeMatching(matching: CaseEngineState["matching"]): PublicMatchingSummary {
  return {
    screened: matching.screened,
    counts: {
      fits: matching.fits.filter((fit) => fit.verdict === "fits").length,
      possible: matching.fits.filter((fit) => fit.verdict === "possible").length,
      excluded: matching.fits.filter((fit) => fit.verdict === "excluded").length,
    },
    structuralExclusions: [...matching.structuralExclusions],
    unlockedBy: [...new Set(matching.fits.flatMap((fit) => fit.unlockedBy))].sort(),
    ourGaps: [...new Set(matching.fits.flatMap((fit) => fit.ourGaps))].sort(),
  };
}

export function publicCaseState(state: CaseEngineState): PublicCaseEngineState {
  return {...state, matching: summarizeMatching(state.matching)};
}

/** Runner evidence is retained, but fund identities and mandate detail stay in the worker job. */
export function publicCaseRunReport(report: CaseRunReport): CaseRunReport {
  const matching = report.stages.find((stage) => stage.stage === "matching");
  if (!matching || matching.status !== "succeeded" || !matching.output) return report;
  const output = matching.output as CaseEngineState["matching"];
  const summary = summarizeMatching(output);
  const stages = report.stages.map((stage) => stage.stage === "matching"
    ? {...stage, output: summary, outputFingerprint: fingerprintJson(summary)}
    : stage);
  const payload = {
    ...report,
    stages,
  };
  const {reportFingerprint: _priorFingerprint, ...withoutFingerprint} = payload;
  return {...withoutFingerprint, reportFingerprint: fingerprintJson(withoutFingerprint)};
}

const inputSchema = z.custom<CaseEngineInput>((value) => Boolean(value && typeof value === "object"));
const reconciliationReportSchema = z.object({
  facts: z.array(z.unknown()),
  exceptions: z.array(z.unknown()),
  calculations: z.array(z.unknown()),
  gaps: z.array(z.unknown()),
  questions: z.array(z.unknown()),
  financialTruth: z.unknown(),
  debtTruth: z.unknown(),
});
const extractionOutputSchema = z.object({
  candidates: z.array(z.unknown()),
  documents: z.array(z.unknown()),
  roomDocuments: z.array(z.unknown()),
});
const reconciliationOutputSchema = z.object({reconciliation: reconciliationReportSchema});
const metricsOutputSchema = z.object({
  readiness: z.object({
    state: z.enum(["blocked", "in_progress", "ready"]),
    score: z.number().min(0).max(1),
    components: z.array(z.unknown()),
    blockers: z.array(z.unknown()),
  }),
  desk: z.unknown().nullable(),
  trajectory: z.unknown().nullable(),
  deskMissing: z.array(z.string()),
  clientQuestions: z.array(z.unknown()),
  receivables: z.unknown().nullable(),
});
const gapsOutputSchema = z.object({materialGapCount: z.number().int().nonnegative(), blockers: z.array(z.string())});
const structureOutputSchema = z.object({
  capacity: z.unknown().nullable(),
  operationTruth: z.unknown(),
  structureTruth: z.unknown(),
  termSheet: z.unknown().nullable(),
  rating: z.unknown().nullable(),
  stress: z.array(z.unknown()),
  instruments: z.array(z.unknown()),
  collateral: z.unknown().nullable(),
  price: z.unknown().nullable(),
  verdict: z.unknown().nullable(),
});
const claimsOutputSchema = z.object({
  brief: caseBriefSchema.nullable(),
  proposedBrief: caseBriefSchema.nullable(),
  briefBlockedBy: z.array(z.string()),
  numericAudit: z.unknown().nullable(),
  semanticAudit: z.unknown().nullable(),
  modelInvocations: z.array(z.unknown()),
  usage: z.object({costUsd: z.number().nonnegative(), modelCalls: z.number().int().nonnegative()}),
});
const materialsOutputSchema = z.object({
  materials: z.array(z.unknown()),
  materialsBlockedBy: z.array(z.string()),
  dataRoom: z.object({
    version: z.string(),
    folders: z.array(z.unknown()),
    entries: z.array(z.unknown()),
    counts: z.object({ready: z.number().int(), held: z.number().int(), requested: z.number().int()}),
    releasable: z.boolean(),
    holds: z.array(z.unknown()),
  }),
  audit: z.enum(["not_run", "pass", "blocked"]),
  claimRegistry: z.unknown().nullable(),
});
const matchingOutputSchema = z.object({
  screened: z.boolean(),
  fits: z.array(z.unknown()),
  structuralExclusions: z.array(z.string()),
});
const outcomeOutputSchema = z.object({outcome: caseOutcomeSchema});

type ExtractionOutput = Pick<CaseEngineInput, "candidates" | "documents" | "roomDocuments">;
type ReconciliationOutput = {reconciliation: ReconciliationReport};
type MetricsOutput = {
  readiness: ReadinessReport;
  desk: DeskAnalysis | null;
  trajectory: Trajectory | null;
  receivables: ReceivablesAnalysis | null;
  deskMissing: string[];
  clientQuestions: ClientQuestion[];
};
type GapsOutput = {materialGapCount: number; blockers: string[]};
type StructureOutput = Pick<
  CaseEngineState,
  "capacity" | "operationTruth" | "structureTruth" | "termSheet" | "rating" | "stress" | "instruments" | "collateral" | "price" | "verdict"
>;
type ClaimsOutput = Pick<CaseEngineState, "brief" | "briefBlockedBy" | "modelInvocations"> & {
  proposedBrief: CaseBrief | null;
  numericAudit: AuditReport | null;
  semanticAudit: NormalizedSemanticAudit | null;
  usage: {costUsd: number; modelCalls: number};
};
type MaterialsOutput = Pick<CaseEngineState, "materials" | "materialsBlockedBy" | "dataRoom" | "claimRegistry"> & {
  audit: "not_run" | "pass" | "blocked";
};
type MatchingOutput = CaseEngineState["matching"];
type OutcomeOutput = {outcome: CaseOutcome};

const outputOf = <T>(context: StageContext, stage: keyof StageContext["outputs"]): T => {
  const output = context.outputs[stage];
  if (output === undefined) throw Object.assign(new Error("missing governed predecessor"), {code: "missing_predecessor"});
  return output as T;
};

const number = (value: string | undefined) => (value && Number.isFinite(Number(value)) ? value : undefined);

export function expectedMaterialFields(archetypeId: ArchetypeId): MaterialFieldRequirement[] {
  return materialFieldRequirements(archetypeId);
}

const intakeAvailableFieldPaths = (dealBrief: CaseDealBrief): string[] => [
  ...(dealBrief.requestedAmount ? ["transaction.requested_amount"] : []),
  ...(dealBrief.requestedTermMonths !== undefined ? ["transaction.desired_term_months"] : []),
  ...(dealBrief.sector ? ["company.sector"] : []),
];

function currentApprovedJudgments(brief: CaseBrief, decisions: readonly ClaimDecision[]): string[] {
  return brief.sections.flatMap((section) => section.claims)
    .filter((claim) => {
      if (claim.kind !== "judgment" || !claim.material) return false;
      const decision = [...decisions].reverse().find((candidate) => candidate.claimId === claim.id);
      return Boolean(decision && decision.decision === "approved" && decision.claimFingerprint === claimFingerprint(claim));
    })
    .map((claim) => claim.id);
}

export async function executeCaseEngine(
  input: CaseEngineInput,
  policy: CaseRunPolicy = {maxCostUsd: 3, maxModelCalls: 4, stages: {claims: {costUsd: 3, modelCalls: 4}}},
): Promise<CaseEngineResult> {
  const report = await runCase({
    runId: input.runId,
    caseId: input.caseId,
    input,
    inputSchema,
    policy,
    versions: {caseEngine: caseEngineVersion},
    stages: {
      extraction: {
        outputSchema: extractionOutputSchema,
        execute: () => ({
          output: {
            candidates: input.candidates,
            documents: input.documents,
            roomDocuments: input.roomDocuments,
          } satisfies ExtractionOutput,
        }),
      },
      reconciliation: {
        outputSchema: reconciliationOutputSchema,
        execute: (context) => {
          const extracted = outputOf<ExtractionOutput>(context, "extraction");
          return {
            output: {
              reconciliation: reconcileCase({
                archetypeId: input.archetypeId,
                candidates: extracted.candidates,
                documents: extracted.documents,
                locale: input.locale,
                ...(input.informationAnswers ? {informationAnswers: input.informationAnswers} : {}),
                ...(input.requirementResponses ? {requirementResponses: input.requirementResponses} : {}),
                additionalAvailableFieldPaths: intakeAvailableFieldPaths(input.dealBrief),
                referenceDate: input.referenceDate,
              }),
            } satisfies ReconciliationOutput,
          };
        },
      },
      metrics: {
        outputSchema: metricsOutputSchema,
        execute: (context) => {
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const readiness = assessReadiness({
            archetypeId: input.archetypeId,
            documents: input.documents,
            facts: reconciliation.facts,
            exceptions: reconciliation.exceptions,
            gaps: reconciliation.gaps,
            expectedMaterialFields: expectedMaterialFields(input.archetypeId),
            ...(input.informationAnswers ? {informationAnswers: input.informationAnswers} : {}),
            ...(input.requirementResponses ? {requirementResponses: input.requirementResponses} : {}),
            additionalAvailableFieldPaths: intakeAvailableFieldPaths(input.dealBrief),
          });
          const deskInputs = buildDeskInputs(
            reconciliation.facts.map((fact) => ({fieldPath: fact.key.fieldPath, value: fact.value})),
            {
              referenceDate: input.referenceDate,
              indexLevels: input.indexLevels ?? {cdi: "0.105", tlp: "0.079", ipca: "0.045", tr: "0.002"},
              statedRequest: {
                ...(input.dealBrief.requestedAmount ? {amount: input.dealBrief.requestedAmount} : {}),
                ...(input.dealBrief.requestedTermMonths !== undefined ? {termMonths: input.dealBrief.requestedTermMonths} : {}),
                ...(input.dealBrief.requestedGraceMonths !== undefined ? {graceMonths: input.dealBrief.requestedGraceMonths} : {}),
                ...(input.dealBrief.expectedRate ? {expectedRate: input.dealBrief.expectedRate} : {}),
              },
            },
          );
          const desk = deskInputs.desk ? analyzeCreditPosition(deskInputs.desk) : null;
          const trajectory = deskInputs.trajectory ? projectLeverageTrajectory(deskInputs.trajectory) : null;
          const receivables = input.receivablesCase ? analyzeReceivables(input.receivablesCase) : null;
          return {
            output: {
              readiness,
              desk,
              trajectory,
              receivables,
              deskMissing: deskInputs.missing,
              clientQuestions: questionsForCompany(desk, trajectory, deskInputs.missing),
            } satisfies MetricsOutput,
          };
        },
      },
      gaps: {
        outputSchema: gapsOutputSchema,
        execute: (context) => {
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const {readiness} = metrics;
          return {
            output: {
              materialGapCount: reconciliation.gaps.filter((gap) => gap.severity === "critical" || gap.severity === "high").length
                + (metrics.receivables?.gaps.filter((gap) => gap.severity === "blocking" || gap.severity === "material").length ?? 0),
              blockers: [
                ...readiness.blockers.map((blocker) => blocker.id),
                ...(metrics.receivables?.decision.blockingCodes ?? []),
              ],
            } satisfies GapsOutput,
          };
        },
      },
      structure: {
        outputSchema: structureOutputSchema,
        execute: (context) => ({
          output: structureCase(input, outputOf<ReconciliationOutput>(context, "reconciliation").reconciliation, outputOf<MetricsOutput>(context, "metrics")),
        }),
      },
      claims: {
        outputSchema: claimsOutputSchema,
        execute: async (context) => {
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          if (!input.writeBrief) {
            const output: ClaimsOutput = {
              brief: null,
              proposedBrief: null,
              briefBlockedBy: ["brief_writer_unavailable"],
              numericAudit: null,
              semanticAudit: null,
              modelInvocations: [],
              usage: {costUsd: 0, modelCalls: 0},
            };
            return {output, usage: output.usage};
          }
          const written = await input.writeBrief({
            archetypeId: input.archetypeId,
            locale: input.locale,
            reconciliation,
            desk: metrics.desk,
            trajectory: metrics.trajectory,
            receivables: metrics.receivables,
          });
          const proposedBrief = written.brief;
          let brief = proposedBrief;
          const blockedBy = [...written.blockedBy];
          let numericAudit: AuditReport | null = null;
          let semanticAudit: NormalizedSemanticAudit | null = null;
          let verifierUsage = {costUsd: 0, modelCalls: 0};
          let verifierInvocations: unknown[] = [];
          if (brief) {
            const evidence = deskEvidence(metrics.desk, metrics.trajectory);
            const approvedJudgmentIds = currentApprovedJudgments(brief, input.claimDecisions ?? []);
            const audited = auditBrief({
              brief,
              facts: reconciliation.facts,
              calculations: [...reconciliation.calculations, ...evidence.calculations],
              approvedJudgmentIds,
              requireJudgmentApproval: false,
            });
            numericAudit = audited.audit;
            if (!audited.ok) {
              brief = null;
              blockedBy.push(...audited.audit.findings.map((finding) => `${finding.claimId}: ${finding.reason}`));
            } else if (!input.verifyBrief) {
              semanticAudit = normalizeSemanticAudit(audited.brief, {reviews: []});
              brief = null;
              blockedBy.push("semantic_verifier_unavailable");
            } else {
              const verified = await input.verifyBrief({
                brief: audited.brief,
                facts: reconciliation.facts,
                calculations: [...reconciliation.calculations, ...evidence.calculations],
              });
              semanticAudit = normalizeSemanticAudit(audited.brief, verified.audit);
              verifierUsage = verified.usage ?? verifierUsage;
              verifierInvocations = verified.modelInvocations ?? [];
              if (semanticAudit.status === "blocked") {
                brief = null;
                blockedBy.push(...semanticAudit.findings.map((finding) => `${finding.claimId}: semantic:${finding.reason}`));
              }
            }
          }
          if (proposedBrief && numericAudit && !semanticAudit) semanticAudit = normalizeSemanticAudit(proposedBrief, {reviews: []});
          const writerUsage = written.usage ?? {costUsd: 0, modelCalls: 0};
          const usage = {costUsd: writerUsage.costUsd + verifierUsage.costUsd, modelCalls: writerUsage.modelCalls + verifierUsage.modelCalls};
          const output: ClaimsOutput = {
            brief,
            proposedBrief,
            briefBlockedBy: [...new Set(blockedBy)],
            numericAudit,
            semanticAudit,
            modelInvocations: [...(written.modelInvocations ?? []), ...verifierInvocations],
            usage,
          };
          return {output, usage};
        },
      },
      materials: {
        outputSchema: materialsOutputSchema,
        execute: (context) => {
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const structure = outputOf<StructureOutput>(context, "structure");
          const claims = outputOf<ClaimsOutput>(context, "claims");
          const extracted = outputOf<ExtractionOutput>(context, "extraction");
          let materials: Material[] = [];
          let materialsBlockedBy: string[] = [];
          let audit: MaterialsOutput["audit"] = "not_run";
          let claimRegistry: ClaimRegistry | null = null;
          const approvedJudgmentIds = claims.proposedBrief
            ? currentApprovedJudgments(claims.proposedBrief, input.claimDecisions ?? [])
            : [];
          if (claims.brief) {
            const evidence = deskEvidence(metrics.desk, metrics.trajectory);
            const compiled = compileMaterials({
              brief: claims.brief,
              facts: reconciliation.facts,
              calculations: [...reconciliation.calculations, ...evidence.calculations],
              exceptions: reconciliation.exceptions,
              readiness: metrics.readiness,
              desk: metrics.desk,
              trajectory: metrics.trajectory,
              ...(structure.termSheet ? {termSheet: structure.termSheet} : {}),
              ...(structure.rating ? {rating: structure.rating} : {}),
              stress: structure.stress,
              instruments: structure.instruments,
              ...(structure.collateral ? {collateral: structure.collateral} : {}),
              ...(structure.price ? {price: structure.price} : {}),
              ...(structure.verdict ? {verdict: structure.verdict} : {}),
              approvedJudgmentIds,
            });
            if (compiled.ok) {
              materials = compiled.materials;
              audit = "pass";
            } else {
              materialsBlockedBy = compiled.detail;
              audit = "blocked";
            }
          } else {
            materialsBlockedBy = ["brief_unavailable", ...claims.briefBlockedBy];
          }
          let dataRoom = planDataRoom({
            materials,
            materialsBlockedBy,
            documents: extracted.roomDocuments,
            exceptions: reconciliation.exceptions,
            readiness: metrics.readiness,
          });
          materials = [...materials.filter((material) => material.kind !== "data_room_index"), dataRoomIndex(dataRoom)];
          if (claims.proposedBrief && claims.numericAudit && claims.semanticAudit) {
            claimRegistry = buildClaimRegistry({
              brief: claims.proposedBrief,
              numericAudit: claims.numericAudit,
              semanticAudit: claims.semanticAudit,
              decisions: input.claimDecisions ?? [],
              artifacts: materials.map((material) => ({
                artifactId: material.kind,
                claimIds: material.blocks.flatMap((block) => block.type === "paragraph" && block.claimId ? [block.claimId] : []),
                supportIds: material.dependsOn,
              })),
            });
            if (!claimRegistry.publication.allowed) {
              materials = [];
              materialsBlockedBy = [...new Set([...materialsBlockedBy, ...claimRegistry.publication.blockers])];
              audit = "blocked";
              dataRoom = planDataRoom({
                materials: [],
                materialsBlockedBy,
                documents: extracted.roomDocuments,
                exceptions: reconciliation.exceptions,
                readiness: metrics.readiness,
              });
            }
          }
          return {output: {materials, materialsBlockedBy, dataRoom, audit, claimRegistry} satisfies MaterialsOutput};
        },
      },
      matching: {
        outputSchema: matchingOutputSchema,
        execute: (context) => {
          const structure = outputOf<StructureOutput>(context, "structure");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const request = requestForMatching(input, structure, metrics, reconciliation);
          const fits = rankFits(input.resolvedMandates.map((mandate) => assessMandateFit(mandate, request)));
          return {
            output: {
              screened: input.resolvedMandates.length > 0,
              fits,
              structuralExclusions: structuralExclusions(fits),
            } satisfies MatchingOutput,
          };
        },
      },
      outcome: {
        outputSchema: outcomeOutputSchema,
        execute: (context) => {
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const gaps = outputOf<GapsOutput>(context, "gaps");
          const structure = outputOf<StructureOutput>(context, "structure");
          const materials = outputOf<MaterialsOutput>(context, "materials");
          const matching = outputOf<MatchingOutput>(context, "matching");
          return {
            output: {
              outcome: deriveCaseOutcome({
                informationSufficient: !metrics.readiness.blockers.some((blocker) => blocker.id === "minimum_documents"),
                materialGapCount: gaps.materialGapCount,
                analysisComplete: structure.structureTruth.status !== "blocked" && (metrics.receivables
                  ? true
                  : Boolean(metrics.desk && structure.capacity && structure.verdict)),
                ...(structure.verdict
                  ? {
                      structureSupportability:
                        structure.verdict.standing === "stands"
                          ? ("supportable_as_proposed" as const)
                          : structure.verdict.standing === "stands_with_conditions"
                            ? ("supportable_with_adjustments" as const)
                            : ("not_supported_as_proposed" as const),
                    }
                  : {}),
                materialsAudit: materials.audit,
                mandateScreeningComplete: matching.screened,
                platformExternalReleaseEnabled: input.externalReleaseApproved,
                clientIntroductionAuthorized: false,
                blockers: [...gaps.blockers, ...structure.structureTruth.exceptions.filter((exception) => exception.severity === "critical").map((exception) => exception.id)],
              }),
            } satisfies OutcomeOutput,
          };
        },
      },
    },
  });

  if (report.status !== "succeeded") {
    throw Object.assign(new Error("governed case rail did not complete"), {code: "case_run_incomplete", report});
  }
  const stage = <T>(id: CaseRunReport["stages"][number]["stage"]): T => {
    const output = report.stages.find((entry) => entry.stage === id)?.output;
    if (output === undefined) throw Object.assign(new Error("completed case lacks output"), {code: "case_output_missing"});
    return output as T;
  };
  const reconciliation = stage<ReconciliationOutput>("reconciliation").reconciliation;
  const metrics = stage<MetricsOutput>("metrics");
  const structure = stage<StructureOutput>("structure");
  const claims = stage<ClaimsOutput>("claims");
  const materials = stage<MaterialsOutput>("materials");
  const matching = stage<MatchingOutput>("matching");
  const outcome = stage<OutcomeOutput>("outcome").outcome;
  return {
    report,
    state: {
      reconciliation,
      ...metrics,
      ...structure,
      brief: claims.brief,
      briefBlockedBy: claims.briefBlockedBy,
      modelInvocations: claims.modelInvocations,
      claimRegistry: materials.claimRegistry,
      materials: materials.materials,
      materialsBlockedBy: materials.materialsBlockedBy,
      dataRoom: materials.dataRoom,
      matching,
      outcome,
    },
  };
}

function structureCase(
  input: CaseEngineInput,
  reconciliation: ReconciliationReport,
  metrics: MetricsOutput,
): StructureOutput {
  const valueOf = (fieldPath: string) => reconciliation.facts.find((fact) => fact.key.fieldPath === fieldPath)?.value;
  const calculationOf = (id: string) => reconciliation.calculations.find((calculation) => calculation.id === id)?.value;
  const requested = input.dealBrief.requestedAmount ?? number(valueOf("transaction.requested_amount"));
  let capacity: CapacityAssessment | null = null;
  let termSheet: IndicativeTermSheet | null = null;
  if (requested) {
    const latestArr = reconciliation.facts
      .filter((fact) => /^(historical|interim)_financials\.\d{4}(_\d{2})?\.arr(_\d+m|_ytd|_ltm)?$/.test(fact.key.fieldPath))
      .sort((a, b) => b.key.fieldPath.localeCompare(a.key.fieldPath))[0]?.value;
    capacity = assessCapacity({
      archetypeId: input.archetypeId,
      requested,
      ...(number(latestArr) ? {arr: latestArr!} : {}),
      ...(number(valueOf("company.last_equity_round.amount")) ? {lastEquityRound: valueOf("company.last_equity_round.amount")!} : {}),
      ...(number(calculationOf("adjusted_ebitda")) ? {cfads: calculationOf("adjusted_ebitda")!, adjustedEbitda: calculationOf("adjusted_ebitda")!} : {}),
      ...(number(calculationOf("net_debt")) ? {existingNetDebt: calculationOf("net_debt")!} : {}),
      ...(metrics.receivables ? {collateralCapacity: metrics.receivables.structure.supportedFacility}
        : number(calculationOf("collateral_capacity_total")) ? {collateralCapacity: calculationOf("collateral_capacity_total")!} : {}),
      annualDebtServiceFactor: (1 / (archetype(input.archetypeId).structure.tenorMonths.typical[1] / 12) + 0.12).toFixed(4),
    });
    termSheet = buildTermSheet({
      archetypeId: input.archetypeId,
      capacity,
      ...(input.dealBrief.requestedTermMonths !== undefined ? {requestedTermMonths: input.dealBrief.requestedTermMonths} : {}),
      ...(input.dealBrief.requestedGraceMonths !== undefined ? {requestedGraceMonths: input.dealBrief.requestedGraceMonths} : {}),
      ...(input.dealBrief.expectedRate ? {expectedRate: input.dealBrief.expectedRate} : {}),
      blockers: metrics.readiness.blockers.map((blocker) => blocker.labels[input.locale]),
    });
  }

  const legalName = valueOf("company.legal_name") ?? "";
  const legalForm: LegalForm = /\bS\.?A\.?\b|sociedade an[oô]nima/i.test(legalName)
    ? "sa"
    : /ltda|limitada/i.test(legalName)
      ? "ltda"
      : "other";
  const latestYear = reconciliation.facts
    .map((fact) => fact.key.fieldPath.match(/^historical_financials\.(\d{4})\./)?.[1])
    .filter((year): year is string => Boolean(year))
    .sort()
    .at(-1);
  const priorYear = latestYear ? String(Number(latestYear) - 1) : undefined;
  const materialFacts = reconciliation.facts.filter((fact) => fact.accepted.evidenceRank <= 7);
  const evidenceRank = materialFacts.length
    ? (materialFacts.reduce((sum, fact) => sum + fact.accepted.evidenceRank, 0) / materialFacts.length).toFixed(2)
    : undefined;
  const topShare = valueOf("customers.top_customers.1.share_pct");
  const rating = metrics.desk
    ? rateCredit({
        desk: metrics.desk,
        trajectory: metrics.trajectory,
        ...(latestYear && valueOf(`historical_financials.${latestYear}.financial_expenses`) ? {financialExpenses: valueOf(`historical_financials.${latestYear}.financial_expenses`)!} : {}),
        ...(priorYear && valueOf(`historical_financials.${priorYear}.ebitda`) ? {priorEbitda: valueOf(`historical_financials.${priorYear}.ebitda`)!} : {}),
        ...(topShare ? {topCustomerShare: topShare} : {}),
        ...(evidenceRank ? {evidenceRank} : {}),
      })
    : null;
  const stress = metrics.desk?.profile === "cash_generative"
    ? stressTable({
        desk: metrics.desk,
        ...(latestYear && valueOf(`historical_financials.${latestYear}.revenue`) ? {revenue: valueOf(`historical_financials.${latestYear}.revenue`)!} : {}),
        ...(topShare ? {topCustomerShare: topShare} : {}),
      })
    : [];
  const instruments = requested
    ? instrumentVerdicts({
        legalForm,
        archetypeId: input.archetypeId,
        amount: requested,
        ...(metrics.desk?.profile === "cash_burning" || valueOf("company.last_equity_round.amount") ? {ventureBacked: true} : {}),
        ...(input.archetypeId === "equipment_finance" ? {equipment: true} : {}),
        ...(metrics.desk?.encumbrance.free ? {receivablesCoverage: (Number(metrics.desk.encumbrance.free) / Number(requested)).toFixed(2)} : {}),
      })
    : [];
  const collateralAssets = collateralAssetsOf(reconciliation, metrics.desk);
  const collateral = requested && collateralAssets.length > 0 ? designCollateralPackage({assets: collateralAssets, amount: requested}) : null;
  const preferredInstrument = instruments.find((entry) => entry.eligible)?.instrument.id as PricedInstrument | undefined;
  const price = rating && preferredInstrument && requested
    ? indicativePrice({
        instrument: preferredInstrument,
        rating: rating.band,
        cdi: input.indexLevels?.cdi ?? "0.105",
        amount: requested,
        ...(input.dealBrief.requestedTermMonths !== undefined ? {tenorMonths: input.dealBrief.requestedTermMonths} : {}),
        ...(collateral ? {collateralCoverage: collateral.coverageAchieved} : {}),
      })
    : null;
  const deskVerdict = metrics.desk && requested
    ? judgeOperation({
        desk: metrics.desk,
        trajectory: metrics.trajectory,
        operation: {
          amount: requested,
          termMonths: input.dealBrief.requestedTermMonths ?? Number(valueOf("transaction.desired_term_months") ?? 60),
          graceMonths: input.dealBrief.requestedGraceMonths ?? Number(valueOf("transaction.desired_grace_months") ?? 12),
          instrument: valueOf("transaction.preferred_structure") ?? "dívida privada",
          ...(valueOf("transaction.refinancing") ? {refinancing: valueOf("transaction.refinancing")!} : {}),
          ...(valueOf("transaction.purpose") ? {purpose: valueOf("transaction.purpose")!} : {}),
        },
      })
    : null;
  const verdict = deskVerdict && requested
    ? applyCapacityCondition(deskVerdict, requested, capacity)
    : deskVerdict;
  const operationTruth = buildOperationTruthSet({
    facts: reconciliation.facts,
    financialTruth: reconciliation.financialTruth,
    debtTruth: reconciliation.debtTruth,
    capacity,
    ...(requested ? {requestedAmount: requested} : {}),
    ...(input.dealBrief.requestedTermMonths !== undefined ? {requestedTermMonths: input.dealBrief.requestedTermMonths} : {}),
    referenceDate: input.referenceDate,
    ...(input.operationPolicies ? {policies: input.operationPolicies} : {}),
  });
  const structureTruth = buildStructureTruthSet({
    archetypeId: input.archetypeId,
    facts: reconciliation.facts,
    financialTruth: reconciliation.financialTruth,
    debtTruth: reconciliation.debtTruth,
    operationTruth,
    capacity,
    termSheet,
    collateral,
    instruments,
    referenceDate: input.referenceDate,
    ...(input.structurePolicies ? {policies: input.structurePolicies} : {}),
  });
  return {capacity, operationTruth, structureTruth, termSheet, rating, stress, instruments, collateral, price, verdict};
}

function applyCapacityCondition(
  verdict: OperationVerdict,
  requested: string,
  capacity: CapacityAssessment | null,
): OperationVerdict {
  if (!capacity || capacity.bindingConstraint !== "collateral") return verdict;
  const requestedAmount = Number(requested);
  const supportedAmount = Number(capacity.recommended);
  if (!Number.isFinite(requestedAmount) || !Number.isFinite(supportedAmount) || supportedAmount >= requestedAmount) return verdict;

  const money = (value: number, locale: "pt-BR" | "en-US") =>
    `R$ ${value.toLocaleString(locale, {maximumFractionDigits: 0})}`;
  const condition = {
    id: "collateral-capacity-shortfall",
    pt: `A capacidade indicativa de garantias sustenta ${money(supportedAmount, "pt-BR")}, abaixo do pedido de ${money(requestedAmount, "pt-BR")}. Antes do desembolso, a companhia precisa reduzir o montante ou comprovar garantia elegível adicional e a liberação dos gravames existentes.`,
    en: `Indicative collateral capacity supports ${money(supportedAmount, "en-US")}, below the ${money(requestedAmount, "en-US")} request. Before disbursement, the company must reduce the amount or evidence additional eligible collateral and release existing liens.`,
  };
  return {
    ...verdict,
    standing: verdict.standing === "does_not_stand" ? "does_not_stand" : "stands_with_conditions",
    headline: verdict.standing === "does_not_stand"
      ? verdict.headline
      : {
          pt: "A operação é economicamente viável, condicionada ao fechamento da diferença entre o pedido e a capacidade de garantias.",
          en: "The operation is economically viable, subject to closing the gap between the request and collateral capacity.",
        },
    conditions: verdict.conditions.some((existing) => existing.id === condition.id)
      ? verdict.conditions
      : [...verdict.conditions, condition],
  };
}

function collateralAssetsOf(reconciliation: ReconciliationReport, desk: DeskAnalysis | null): CollateralAsset[] {
  const valueOf = (fieldPath: string) => reconciliation.facts.find((fact) => fact.key.fieldPath === fieldPath)?.value;
  const assets: CollateralAsset[] = reconciliation.facts
    .filter((fact) => /^collateral\.assets\.\d+\.type$/.test(fact.key.fieldPath))
    .map((fact) => {
      const base = fact.key.fieldPath.replace(/\.type$/, "");
      const classify = (text: string): CollateralAsset["type"] =>
        /receb|duplicat/i.test(text) ? "receivables"
          : /estoque|invent/i.test(text) ? "inventory"
            : /im[oó]vel|galp|terreno|property/i.test(text) ? "property"
              : /ve[ií]culo|frota|caminh/i.test(text) ? "vehicles"
                : /m[aá]quina|equip/i.test(text) ? "equipment"
                  : /quota|a[çc][õo]es|shares/i.test(text) ? "shares"
                    : /aval|fian/i.test(text) ? "guarantee"
                      : /aplica|financ/i.test(text) ? "financial"
                        : "other";
      const appraisal = valueOf(`${base}.appraisal_value`);
      const book = valueOf(`${base}.book_value`);
      return {
        description: valueOf(`${base}.description`) ?? fact.value,
        type: classify(fact.value),
        value: appraisal ?? book ?? "0",
        ...(appraisal ? {appraised: true} : {}),
        ...(number(valueOf(`${base}.encumbrances`)) ? {encumbered: valueOf(`${base}.encumbrances`)!} : {}),
        ...(valueOf(`${base}.policy_haircut`) ? {haircut: valueOf(`${base}.policy_haircut`)!} : {}),
      };
    });
  if (desk && assets.every((asset) => asset.type !== "receivables") && Number(desk.encumbrance.receivablesBase) > 0) {
    assets.push({
      description: "Recebíveis de clientes",
      type: "receivables",
      value: desk.encumbrance.receivablesBase,
      encumbered: desk.encumbrance.encumbered,
    });
  }
  return assets;
}

const legacyInstrumentMap: Partial<Record<string, Instrument>> = {
  ccb: "ccb",
  debenture_476: "debenture",
  debenture_160: "debenture",
  cra: "cra",
  cri: "cri",
  fidc: "fidc",
  venture_debt: "equity_kicker_debt",
  nce: "direct_loan",
  finame: "direct_loan",
  leasing: "direct_loan",
};

function requestForMatching(
  input: CaseEngineInput,
  structure: StructureOutput,
  metrics: MetricsOutput,
  reconciliation: ReconciliationReport,
): DealRequest {
  const proposedAmount = structure.structureTruth.proposal.amount ?? input.dealBrief.requestedAmount;
  const eligible = structure.instruments
    .filter((entry) => entry.eligible)
    .map((entry) => legacyInstrumentMap[entry.instrument.id])
    .filter((entry): entry is Instrument => Boolean(entry));
  const deskLeverage = proposedAmount
    ? metrics.desk?.leverage.scenarios.find((scenario) => scenario.amount === proposedAmount)?.postTurns
    : metrics.desk?.leverage.scenarios[0]?.postTurns;
  const leverage = deskLeverage
    ?? reconciliation.calculations.find((calculation) => calculation.id === "leverage_post_transaction")?.value
    ?? reconciliation.facts.find((fact) => fact.key.fieldPath === "leverage.post_transaction_net_debt_ebitda")?.value;
  const dscr = reconciliation.facts.find((fact) => fact.key.fieldPath === "projections.minimum_dscr")?.value;
  return {
    ...(proposedAmount ? {amount: proposedAmount} : {}),
    ...(input.dealBrief.requestedTermMonths !== undefined ? {termMonths: input.dealBrief.requestedTermMonths} : {}),
    ...(input.dealBrief.sector ? {sector: input.dealBrief.sector} : {}),
    ...(input.dealBrief.geography ? {geography: input.dealBrief.geography} : {}),
    ...((input.dealBrief.instruments?.length ?? 0) > 0 ? {instruments: input.dealBrief.instruments} : eligible.length > 0 ? {instruments: [...new Set(eligible)]} : {}),
    ...(input.dealBrief.collateralKinds?.length ? {collateral: input.dealBrief.collateralKinds} : {}),
    ...(leverage ? {leverage} : {}),
    ...(dscr ? {dscr} : {}),
  };
}
