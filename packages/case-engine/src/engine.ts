import {createHash} from "node:crypto";
import {buildLanguageConductTruthSet, buildMaterialTruthSet, compileMaterials, financialModelMaterial, type FinancialModelArtifactEvidence, type LanguageConductGovernance, type LanguageConductTruthSet, type Material, type MaterialExternalReleaseEvidence, type MaterialTruthSet} from "@offroad/case-materials";
import {
  runCase,
  runSubgraph,
  type CaseRunPolicy,
  type CaseRunReport,
  type RunCaseInput,
  type StageContext,
  type SubtaskDefinition,
} from "@offroad/case-runner";
import {
  assessReadiness,
  auditBrief,
  buildClaimRegistry,
  buildRedFlagTruthSet,
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
  type DeclineCommunication,
  type MandateDecision,
  type RedFlagDetectorObservation,
  type RedFlagPolicy,
  type RedFlagReview,
  type RedFlagTruthSet,
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
  buildStructureDecision,
  buildOperationTruthSet,
  compileStructureAlternatives,
  fingerprintStructureAlternative,
  fingerprintStructureVerificationContext,
  buildStructureTruthSet,
  buildTermSheet,
  designCollateralPackage,
  type AlternativePricingInput,
  type CapacityAssessment,
  type CollateralAsset,
  type CollateralPackage,
  type IndicativeTermSheet,
  type OperationPolicies,
  type OperationTruthSet,
  type StructurePolicies,
  type StructureAlternatives,
  type StructureAlternativesInput,
  type StructureAlternativeVerification,
  type StructureAlternativeDraft,
  type StructureConfirmationInput,
  type StructureDecision,
  type StructureTruthSet,
} from "@offroad/deal-structure";
import {
  assessMandateFit,
  buildMarketTruthSet,
  rankFits,
  structuralExclusions,
  type CollateralKind,
  type DealRequest,
  type Instrument,
  type MandateFit,
  type MarketTruthSet,
  type IntroductionRecipient,
  type QualifiedIntroductionAuthorization,
  type QualifiedIntroductionRecord,
  type ResolvedMandate,
} from "@offroad/fund-mandate";
import {
  buildPricingTruthSet,
  type GovernedPriceAdjustment,
  type IndicativePrice,
  type PricedInstrument,
  type PricingCostComponent,
  type PricingObservation,
  type PricingPolicy,
  type PricingTruthSet,
} from "@offroad/market-reference";
import {buildFinancialModel, financialModelVersion, toXlsxBuffer} from "@offroad/financial-model";
import {reconcileCase, type FactCandidate, type ReconciledFact, type ReconciliationReport} from "@offroad/reconciliation";
import {analyzeReceivables, type ReceivablesAnalysis, type ReceivablesCase} from "@offroad/receivables-analysis";
import {z} from "zod";

export const caseEngineVersion = "2026.08.29-v15";

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

export type StructureDesignerContext = {
  version: "2026.08.29-v1";
  caseFingerprint: string;
  archetypeId: ArchetypeId;
  locale: "pt" | "en";
  request: OperationTruthSet["request"];
  calculatedNeed: OperationTruthSet["calculatedNeed"];
  sourcesAndUses: OperationTruthSet["sourcesAndUses"];
  effects: OperationTruthSet["effects"];
  capacityEnvelope: StructureTruthSet["capacityEnvelope"];
  baseStructure: StructureTruthSet["proposal"];
  finalSizing: StructureTruthSet["finalSizing"];
  security: StructureTruthSet["security"];
  dayOne: StructureTruthSet["dayOne"];
  eligibleInstruments: Array<{
    id: string;
    route: string;
    taxonomy: InstrumentVerdict["route"];
    minimumAmount: string;
    tenorMonths: {min: number; max: number};
    buyers: readonly string[];
    requirements: readonly {pt: string; en: string}[];
  }>;
  pricing: Pick<PricingTruthSet, "decision" | "policyVersion" | "indicativePrice" | "allIn" | "missingInputs">;
  blockers: string[];
  missingInputs: string[];
  allowedBasisIds: string[];
  budget: {maxCostUsd: 0.75; maxModelCalls: 1};
};

export type StructureDesignerResult = {
  proposal: StructureAlternativesInput | null;
  blockedBy: string[];
  usage?: {costUsd: number; modelCalls: number};
  modelInvocations?: unknown[];
};

export type FinancialModelArtifact = FinancialModelArtifactEvidence & {
  version: string;
  selectedAlternativeId: string;
  proposalFingerprint: string;
  inputs: {
    amount: string;
    termMonths: number;
    graceMonths: number;
    amortization: "sac" | "price" | "bullet";
    annualInterestRate: string | null;
  };
  periods: string[];
  sheetNames: {pt: string[]; en: string[]};
  deskAssumptions: string[];
  supportIds: string[];
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
  onStage?: RunCaseInput["onStage"];
  taskCache?: RunCaseInput["taskCache"];
  runtimeVersions?: Record<string, string>;
  externalReleaseApproved: boolean;
  /** Explicit production gate. A confirmed structure alone does not authorize compiling teaser,
   * model, term sheet or data-room artifacts; the company must also approve the production plan. */
  materialsPreparationApproved?: boolean;
  materialRelease?: MaterialExternalReleaseEvidence;
  marketGovernance?: {
    mandateMaxAgeMonths: number | null;
    waveLimit: number | null;
    recipients?: IntroductionRecipient[];
    authorization?: QualifiedIntroductionAuthorization | null;
    introductions?: QualifiedIntroductionRecord[];
  };
  redFlagGovernance?: {
    policy?: RedFlagPolicy | null;
    detectorObservations?: RedFlagDetectorObservation[];
    reviews?: RedFlagReview[];
    mandateDecision?: MandateDecision | null;
    declineCommunication?: DeclineCommunication | null;
  };
  languageConductGovernance?: LanguageConductGovernance;
  claimDecisions?: ClaimDecision[];
  informationAnswers?: InformationAnswers;
  requirementResponses?: RequirementResponses;
  receivablesCase?: ReceivablesCase;
  indexLevels?: {cdi: string; tlp: string; ipca: string; tr: string};
  operationPolicies?: OperationPolicies;
  structurePolicies?: StructurePolicies;
  structureProposal?: StructureAlternativesInput | null;
  structureConfirmation?: StructureConfirmationInput | null;
  structureAlternativePricing?: Record<string, AlternativePricingInput>;
  designStructure?: (input: StructureDesignerContext) => Promise<StructureDesignerResult>;
  pricing?: {
    policy: PricingPolicy;
    observations: PricingObservation[];
    adjustments?: GovernedPriceAdjustment[];
    costs?: PricingCostComponent[];
    weightedAverageLifeYears?: string;
    sectorGroup: string;
    indexer: "cdi" | "ipca" | "fixed" | "other";
    indexerRationale?: string;
    targetBuyer?: string;
    expectedSpreadBps?: number;
    currentAllIn?: string;
  };
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
  structureAlternatives: StructureAlternatives;
  structureDecision: StructureDecision;
  pricingTruth: PricingTruthSet;
  materialTruth: MaterialTruthSet;
  languageConductTruth: LanguageConductTruthSet;
  redFlagTruth: RedFlagTruthSet;
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
  financialModel: FinancialModelArtifact | null;
  materialsBlockedBy: string[];
  dataRoom: DataRoomPlan;
  matching: {
    screened: boolean;
    fits: MandateFit[];
    structuralExclusions: string[];
    marketTruth: MarketTruthSet;
  };
  outcome: CaseOutcome;
  modelInvocations: unknown[];
  structureModelInvocations: unknown[];
};

export type CaseEngineResult = {state: CaseEngineState; report: CaseRunReport};

/** Matching information safe to return to a borrower-side workspace before an introduction. */
export type PublicMatchingSummary = {
  screened: boolean;
  counts: {fits: number; possible: number; excluded: number};
  structuralExclusions: string[];
  unlockedBy: string[];
  ourGaps: string[];
  marketTruth: PublicMarketTruthSet;
};

export type PublicMarketTruthSet=Omit<MarketTruthSet,"shortlist"|"distribution"|"introductions"|"procedureCoverage">&{
  shortlist:{eligible:number;blockedByGovernance:number;requiringConfirmation:number};
  distribution:Omit<MarketTruthSet["distribution"],"recipients">&{recipientCount:number};
  introductions:Omit<MarketTruthSet["introductions"],"records">;
  procedureCoverage:Array<Omit<MarketTruthSet["procedureCoverage"][number],"result">&{result:null}>;
};

export type PublicPricingTruthSet = Omit<PricingTruthSet, "sample" | "allIn" | "procedureCoverage"> & {
  sample: {
    eligibleCount: number;
    rejectedCount: number;
    distinctSources: number;
    latestObservation: string | null;
  };
  allIn: {
    annualizedCostBps: number | null;
    totalRate: {min: string; max: string} | null;
    componentCount: number;
  };
  procedureCoverage: Array<Omit<PricingTruthSet["procedureCoverage"][number], "result"> & {result: null}>;
};

export type PublicMaterialTruthSet = Omit<MaterialTruthSet,"procedureCoverage"|"release"> & {
  procedureCoverage:Array<Omit<MaterialTruthSet["procedureCoverage"][number],"result">&{result:null}>;
  release:Omit<MaterialTruthSet["release"],"technicalReview"|"companyAuthorization">&{
    technicalReview:{approved:boolean;fingerprint:string|null;reviewedAt:string|null};
    companyAuthorization:{authorized:boolean;fingerprint:string|null;scope:string[];recipientCount:number};
  };
};

export type PublicRedFlagTruthSet={
  version:string;
  status:"clear"|"attention_required"|"decision_required"|"declined";
  counts:{open:number;treated:number;notComputable:number};
  externalOutputsAllowed:boolean;
  qualifiedIntroductionAllowed:boolean;
  missingInputs:string[];
};

export type PublicLanguageConductTruthSet=Pick<LanguageConductTruthSet,
  "version"|"status"|"internalMaterialsAllowed"|"externalReleaseAllowed"|"qualifiedIntroductionAllowed"|"blockerCodes"|"reviewCodes"
>&{policyStatus:LanguageConductTruthSet["policy"]["status"]};

export type PublicCaseEngineState = Omit<CaseEngineState, "matching" | "pricingTruth"|"materialTruth"|"redFlagTruth"|"languageConductTruth"|"modelInvocations"|"structureModelInvocations"> & {
  matching: PublicMatchingSummary;
  pricingTruth: PublicPricingTruthSet;
  materialTruth:PublicMaterialTruthSet;
  redFlagTruth:PublicRedFlagTruthSet;
  languageConductTruth:PublicLanguageConductTruthSet;
};

export function summarizeMatching(matching: CaseEngineState["matching"]): PublicMatchingSummary {
  const {recipients,...publicDistribution}=matching.marketTruth.distribution;
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
    marketTruth:{
      ...matching.marketTruth,
      shortlist:{
        eligible:matching.marketTruth.shortlist.filter((entry)=>entry.eligibleForShortlist).length,
        blockedByGovernance:matching.marketTruth.shortlist.filter((entry)=>entry.blockers.length>0).length,
        requiringConfirmation:matching.marketTruth.shortlist.filter((entry)=>entry.confirmations.length>0).length,
      },
      distribution:{...publicDistribution,recipientCount:recipients.length},
      introductions:{ready:matching.marketTruth.introductions.ready,introduced:matching.marketTruth.introductions.introduced,blocked:matching.marketTruth.introductions.blocked},
      procedureCoverage:matching.marketTruth.procedureCoverage.map((procedure)=>({...procedure,result:null})),
    },
  };
}

export function publicCaseState(state: CaseEngineState): PublicCaseEngineState {
  const openFlags=state.redFlagTruth.findings.filter((finding)=>finding.status==="candidate"||finding.status==="confirmed").length;
  const {modelInvocations: _modelInvocations, structureModelInvocations: _structureModelInvocations, ...publicState} = state;
  return {
    ...publicState,
    matching: summarizeMatching(state.matching),
    pricingTruth: {
      ...state.pricingTruth,
      sample: {
        eligibleCount: state.pricingTruth.sample.eligible.length,
        rejectedCount: state.pricingTruth.sample.rejected.length,
        distinctSources: state.pricingTruth.sample.distinctSources,
        latestObservation: state.pricingTruth.sample.latestObservation,
      },
      allIn: {
        annualizedCostBps: state.pricingTruth.allIn.annualizedCostBps,
        totalRate: state.pricingTruth.allIn.totalRate,
        componentCount: state.pricingTruth.allIn.components.length,
      },
      procedureCoverage: state.pricingTruth.procedureCoverage.map((procedure) => ({...procedure, result: null})),
    },
    materialTruth:{
      ...state.materialTruth,
      procedureCoverage:state.materialTruth.procedureCoverage.map((procedure)=>({...procedure,result:null})),
      release:{
        crossValidation:state.materialTruth.release.crossValidation,
        claimAudit:state.materialTruth.release.claimAudit,
        technicalReview:{approved:state.materialTruth.release.technicalReview.approved,fingerprint:state.materialTruth.release.technicalReview.fingerprint,reviewedAt:state.materialTruth.release.technicalReview.reviewedAt},
        companyAuthorization:{authorized:state.materialTruth.release.companyAuthorization.authorized,fingerprint:state.materialTruth.release.companyAuthorization.fingerprint,scope:state.materialTruth.release.companyAuthorization.scope,recipientCount:state.materialTruth.release.companyAuthorization.recipientIds.length},
      },
    },
    redFlagTruth:{
      version:state.redFlagTruth.version,
      status:state.redFlagTruth.mandate.decision?.decision==="decline"?"declined":state.redFlagTruth.mandate.decisionStatus==="missing"&&state.redFlagTruth.mandate.recommendation==="decline_review_required"?"decision_required":openFlags>0||state.redFlagTruth.missingInputs.length>0?"attention_required":"clear",
      counts:{open:openFlags,treated:state.redFlagTruth.findings.filter((finding)=>finding.status==="treated"||finding.status==="false_positive"||finding.status==="accepted_risk").length,notComputable:state.redFlagTruth.findings.filter((finding)=>finding.status==="not_computable").length},
      externalOutputsAllowed:state.redFlagTruth.mandate.externalOutputsAllowed,
      qualifiedIntroductionAllowed:state.redFlagTruth.mandate.qualifiedIntroductionAllowed,
      missingInputs:[...state.redFlagTruth.missingInputs],
    },
    languageConductTruth:{
      version:state.languageConductTruth.version,
      status:state.languageConductTruth.status,
      internalMaterialsAllowed:state.languageConductTruth.internalMaterialsAllowed,
      externalReleaseAllowed:state.languageConductTruth.externalReleaseAllowed,
      qualifiedIntroductionAllowed:state.languageConductTruth.qualifiedIntroductionAllowed,
      blockerCodes:[...state.languageConductTruth.blockerCodes],
      reviewCodes:[...state.languageConductTruth.reviewCodes],
      policyStatus:state.languageConductTruth.policy.status,
    },
  };
}

/** Runner evidence is retained, but fund identities and mandate detail stay in the worker job. */
export function publicCaseRunReport(report: CaseRunReport): CaseRunReport {
  const matching = report.stages.find((stage) => stage.stage === "matching");
  if (!matching || matching.status !== "succeeded" || !matching.output) return report;
  const output = matching.output as CaseEngineState["matching"];
  const summary = summarizeMatching(output);
  const stages = report.stages.map((stage) => {
    if(stage.stage==="structure"&&stage.status==="succeeded"&&stage.output){
      const {structureModelInvocations: _invocations,...output}=stage.output as StructureOutput;
      return {...stage,output,outputFingerprint:fingerprintJson(output)};
    }
    if(stage.stage==="claims"&&stage.status==="succeeded"&&stage.output){
      const {modelInvocations: _invocations,...output}=stage.output as ClaimsOutput;
      return {...stage,output,outputFingerprint:fingerprintJson(output)};
    }
    if(stage.stage==="matching")return {...stage,output:summary,outputFingerprint:fingerprintJson(summary)};
    if(stage.stage==="language_conduct"&&stage.status==="succeeded"&&stage.output){
      const truth=(stage.output as LanguageConductOutput).languageConductTruth;
      const output={languageConductTruth:{
        version:truth.version,status:truth.status,internalMaterialsAllowed:truth.internalMaterialsAllowed,
        externalReleaseAllowed:truth.externalReleaseAllowed,qualifiedIntroductionAllowed:truth.qualifiedIntroductionAllowed,
        blockerCodes:truth.blockerCodes,reviewCodes:truth.reviewCodes,policyStatus:truth.policy.status,
      }};
      return {...stage,output,outputFingerprint:fingerprintJson(output)};
    }
    return stage;
  });
  const payload = {
    ...report,
    stages,
    taskRuns: report.taskRuns.map((task) => {
      const publicStage = stages.find((stage) => stage.stage === task.taskId);
      return publicStage?.outputFingerprint
        ? {...task, outputFingerprint: publicStage.outputFingerprint}
        : task;
    }),
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
  structureAlternatives: z.unknown(),
  structureDecision: z.unknown(),
  pricingTruth: z.unknown(),
  termSheet: z.unknown().nullable(),
  rating: z.unknown().nullable(),
  stress: z.array(z.unknown()),
  instruments: z.array(z.unknown()),
  collateral: z.unknown().nullable(),
  price: z.unknown().nullable(),
  verdict: z.unknown().nullable(),
  structureModelInvocations: z.array(z.unknown()),
});
const redFlagsOutputSchema=z.object({redFlagTruth:z.unknown()});
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
  financialModel: z.unknown().nullable(),
  materialsBlockedBy: z.array(z.string()),
  materialTruth:z.unknown(),
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
  marketTruth:z.unknown(),
});
const languageConductOutputSchema=z.object({languageConductTruth:z.unknown()});
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
  "capacity" | "operationTruth" | "structureTruth" | "structureAlternatives" | "structureDecision" | "pricingTruth" | "termSheet" | "rating" | "stress" | "instruments" | "collateral" | "price" | "verdict"
> & {structureModelInvocations: unknown[]};
type RedFlagsOutput={redFlagTruth:RedFlagTruthSet};
type ClaimsOutput = Pick<CaseEngineState, "brief" | "briefBlockedBy" | "modelInvocations"> & {
  proposedBrief: CaseBrief | null;
  numericAudit: AuditReport | null;
  semanticAudit: NormalizedSemanticAudit | null;
  usage: {costUsd: number; modelCalls: number};
};
type MaterialsOutput = Pick<CaseEngineState, "materials" | "financialModel" | "materialsBlockedBy" | "materialTruth" | "dataRoom" | "claimRegistry"> & {
  audit: "not_run" | "pass" | "blocked";
};
type LanguageConductOutput={languageConductTruth:LanguageConductTruthSet};
type MatchingOutput = CaseEngineState["matching"];
type OutcomeOutput = {outcome: CaseOutcome};

const outputOf = <T>(context: StageContext, stage: keyof StageContext["outputs"]): T => {
  const output = context.outputs[stage];
  if (output === undefined) throw Object.assign(new Error("missing governed predecessor"), {code: "missing_predecessor"});
  return output as T;
};

const number = (value: string | undefined) => (value && Number.isFinite(Number(value)) ? value : undefined);

function factsForStructureAlternative(
  facts: readonly ReconciledFact[],
  alternative: StructureAlternativeDraft,
): ReconciledFact[] {
  const replaced = [
    "transaction.requested_amount",
    "transaction.desired_term_months",
    "transaction.desired_grace_months",
    "transaction.sources_and_uses.",
    "structure.selected_instrument",
    "structure.target_buyer",
    "structure.term_months",
    "structure.grace_months",
    "structure.amortization_format",
  ];
  const retained = facts.filter((fact) => !replaced.some((path) => path.endsWith(".")
    ? fact.key.fieldPath.startsWith(path)
    : fact.key.fieldPath === path));
  const proposed = (
    fieldPath: string,
    normalizedValue: string,
    valueType: FactCandidate["valueType"],
    basisIds: readonly string[],
  ): ReconciledFact => {
    const accepted: FactCandidate = {
      fieldPath,
      normalizedValue,
      valueType,
      sourceDocument: `offroad:structure-proposal:${alternative.id}`,
      evidenceRank: 7,
      informationClass: "offroad_proposal",
      confidence: 1,
      anchorVerified: true,
      anchor: {alternativeId: alternative.id, basisIds: [...basisIds]},
    };
    return {key: {fieldPath}, value: normalizedValue, valueType, accepted, conflicts: [], disputed: false};
  };
  const proposalFacts: ReconciledFact[] = [
    proposed("transaction.requested_amount", alternative.amount, "number", alternative.basisIds),
    proposed("transaction.desired_term_months", String(alternative.termMonths), "number", alternative.basisIds),
    proposed("transaction.desired_grace_months", String(alternative.graceMonths), "number", alternative.basisIds),
    proposed("structure.selected_instrument", alternative.instrument, "text", alternative.basisIds),
    proposed("structure.term_months", String(alternative.termMonths), "number", alternative.basisIds),
    proposed("structure.grace_months", String(alternative.graceMonths), "number", alternative.basisIds),
    proposed("structure.amortization_format", alternative.amortization, "text", alternative.basisIds),
    ...(alternative.targetBuyer ? [proposed("structure.target_buyer", alternative.targetBuyer, "text", alternative.basisIds)] : []),
  ];
  let index = 1;
  for (const [side, lines] of [["sources", alternative.sources], ["uses", alternative.uses]] as const) {
    for (const line of lines) {
      const prefix = `transaction.sources_and_uses.${index}`;
      proposalFacts.push(
        proposed(`${prefix}.side`, side, "text", line.basisIds),
        proposed(`${prefix}.item`, line.label, "text", line.basisIds),
        proposed(`${prefix}.amount`, line.amount, "number", line.basisIds),
        proposed(`${prefix}.currency`, alternative.currency, "text", line.basisIds),
        proposed(`${prefix}.condition`, line.condition === "available" ? "available" : "conditional", "text", line.basisIds),
      );
      index += 1;
    }
  }
  return [...retained, ...proposalFacts];
}

export function expectedMaterialFields(archetypeId: ArchetypeId): MaterialFieldRequirement[] {
  return materialFieldRequirements(archetypeId);
}

const intakeAvailableFieldPaths = (dealBrief: CaseDealBrief): string[] => [
  ...(dealBrief.requestedAmount ? ["transaction.requested_amount"] : []),
  ...(dealBrief.requestedTermMonths !== undefined ? ["transaction.desired_term_months"] : []),
  ...(dealBrief.sector ? ["company.sector"] : []),
];

const caseSourceIds = (input: CaseEngineInput): string[] => [...new Set([
  ...input.candidates.map((candidate) => candidate.sourceDocument),
  ...input.documents.map((document) => document.id),
  ...input.roomDocuments.map((document) => document.id),
].filter(Boolean))].sort();

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
  policy: CaseRunPolicy = {maxCostUsd: 3, maxModelCalls: 4, stages: {structure: {costUsd: 0.75, modelCalls: 1}, claims: {costUsd: 2.25, modelCalls: 3}}},
): Promise<CaseEngineResult> {
  const report = await runCase({
    runId: input.runId,
    caseId: input.caseId,
    input,
    inputSchema,
    policy,
    versions: {caseEngine: caseEngineVersion, ...input.runtimeVersions},
    ...(input.onStage ? {onStage: input.onStage} : {}),
    ...(input.taskCache ? {taskCache: input.taskCache} : {}),
    stages: {
      extraction: {
        outputSchema: extractionOutputSchema,
        selectInput: () => ({candidates: input.candidates, documents: input.documents, roomDocuments: input.roomDocuments}),
        execute: () => ({
          output: {
            candidates: input.candidates,
            documents: input.documents,
            roomDocuments: input.roomDocuments,
          } satisfies ExtractionOutput,
          trace: {toolsUsed: ["document_candidates", "document_inventory"], sourceIds: caseSourceIds(input)},
        }),
      },
      reconciliation: {
        outputSchema: reconciliationOutputSchema,
        selectInput: () => ({
          archetypeId: input.archetypeId,
          locale: input.locale,
          informationAnswers: input.informationAnswers,
          requirementResponses: input.requirementResponses,
          dealBrief: input.dealBrief,
          referenceDate: input.referenceDate,
        }),
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
            trace: {toolsUsed: ["reconciliation", "evidence_ledger"], sourceIds: caseSourceIds(input)},
          };
        },
      },
      metrics: {
        outputSchema: metricsOutputSchema,
        selectInput: () => ({
          archetypeId: input.archetypeId,
          informationAnswers: input.informationAnswers,
          requirementResponses: input.requirementResponses,
          dealBrief: input.dealBrief,
          referenceDate: input.referenceDate,
          indexLevels: input.indexLevels,
          receivablesCase: input.receivablesCase,
        }),
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
            trace: {
              toolsUsed: ["readiness", "financial_core", "credit_analysis", ...(input.receivablesCase ? ["receivables_analysis"] : [])],
              sourceIds: caseSourceIds(input),
            },
          };
        },
      },
      gaps: {
        outputSchema: gapsOutputSchema,
        selectInput: () => null,
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
            trace: {toolsUsed: ["readiness", "information_request"], sourceIds: caseSourceIds(input)},
          };
        },
      },
      structure: {
        outputSchema: structureOutputSchema,
        selectInput: () => ({
          archetypeId: input.archetypeId,
          locale: input.locale,
          referenceDate: input.referenceDate,
          dealBrief: input.dealBrief,
          indexLevels: input.indexLevels,
          operationPolicies: input.operationPolicies,
          structurePolicies: input.structurePolicies,
          structureProposal: input.structureProposal,
          structureConfirmation: input.structureConfirmation,
          structureAlternativePricing: input.structureAlternativePricing,
          pricing: input.pricing,
        }),
        execute: async (context) => {
          const structure = await runStructureSubgraph(
            input,
            outputOf<ReconciliationOutput>(context, "reconciliation").reconciliation,
            outputOf<MetricsOutput>(context, "metrics"),
          );
          return {
            output: structure.output,
            usage: structure.usage,
            trace: {
              toolsUsed: ["financial_core", "deal_structure", "instrument_catalogue", "market_reference", ...(structure.usage.modelCalls > 0 ? ["structure_designer"] : [])],
              sourceIds: caseSourceIds(input),
              subtasks: structure.taskRuns,
            },
          };
        },
      },
      red_flags:{
        outputSchema:redFlagsOutputSchema,
        selectInput:()=>({referenceDate:input.referenceDate,redFlagGovernance:input.redFlagGovernance}),
        execute:(context)=>{
          const {reconciliation}=outputOf<ReconciliationOutput>(context,"reconciliation");
          const structure=outputOf<StructureOutput>(context,"structure");
          const caseFingerprint=fingerprintJson({facts:reconciliation.facts,financialTruth:reconciliation.financialTruth,debtTruth:reconciliation.debtTruth,operationTruth:structure.operationTruth,structureTruth:structure.structureTruth});
          return {output:{redFlagTruth:buildRedFlagTruthSet({
            referenceDate:input.referenceDate,
            caseFingerprint,
            facts:reconciliation.facts,
            exceptions:reconciliation.exceptions,
            ...(input.redFlagGovernance?.policy!==undefined?{policy:input.redFlagGovernance.policy}:{}),
            ...(input.redFlagGovernance?.detectorObservations?{detectorObservations:input.redFlagGovernance.detectorObservations}:{}),
            ...(input.redFlagGovernance?.reviews?{reviews:input.redFlagGovernance.reviews}:{}),
            ...(input.redFlagGovernance?.mandateDecision!==undefined?{mandateDecision:input.redFlagGovernance.mandateDecision}:{}),
            ...(input.redFlagGovernance?.declineCommunication!==undefined?{declineCommunication:input.redFlagGovernance.declineCommunication}:{}),
          })} satisfies RedFlagsOutput,trace:{toolsUsed:["red_flag_truth","red_flag_review"],sourceIds:caseSourceIds(input)}};
        },
      },
      claims: {
        outputSchema: claimsOutputSchema,
        selectInput: () => ({archetypeId: input.archetypeId, locale: input.locale, claimDecisions: input.claimDecisions, writerAvailable: Boolean(input.writeBrief), verifierAvailable: Boolean(input.verifyBrief)}),
        execute: async (context) => {
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          // The narrative case belongs to diagnosis: the company must be able to review it
          // before choosing a structure. It may explicitly carry non-blocking gaps and is not
          // equivalent to an investor-ready package. Minimum-document and critical-reconciliation
          // blockers still prevent generation; circulation and materials remain separately gated.
          if (metrics.readiness.state !== "ready") {
            const output: ClaimsOutput = {
              brief: null,
              proposedBrief: null,
              briefBlockedBy: uniqueStrings([
                "diagnostic_case_not_ready",
                ...metrics.readiness.blockers.map((blocker) => blocker.id),
              ]),
              numericAudit: null,
              semanticAudit: null,
              modelInvocations: [],
              usage: {costUsd: 0, modelCalls: 0},
            };
            return {output, usage: output.usage, trace: {toolsUsed: [], sourceIds: caseSourceIds(input)}};
          }
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
            return {output, usage: output.usage, trace: {toolsUsed: [], sourceIds: caseSourceIds(input)}};
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
          return {output, usage, trace: {toolsUsed: ["case_brief_writer", "claim_auditor"], sourceIds: caseSourceIds(input)}};
        },
      },
      materials: {
        outputSchema: materialsOutputSchema,
        selectInput: () => ({
          claimDecisions: input.claimDecisions,
          materialRelease: input.materialRelease,
          materialsPreparationApproved: input.materialsPreparationApproved === true,
        }),
        execute: async (context) => {
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const structure = outputOf<StructureOutput>(context, "structure");
          const redFlags=outputOf<RedFlagsOutput>(context,"red_flags").redFlagTruth;
          const claims = outputOf<ClaimsOutput>(context, "claims");
          const extracted = outputOf<ExtractionOutput>(context, "extraction");
          const prepared = await runMaterialsSubgraph({input, reconciliation, metrics, structure, redFlags, claims, extracted});
          return {
            output: prepared.output,
            usage: prepared.usage,
            trace: {
              toolsUsed: ["case_materials", "data_room", "claim_registry"],
              sourceIds: caseSourceIds(input),
              subtasks: prepared.taskRuns,
            },
          };
        },
      },
      language_conduct:{
        outputSchema:languageConductOutputSchema,
        selectInput:()=>({referenceDate:input.referenceDate,languageConductGovernance:input.languageConductGovernance}),
        execute:(context)=>{
          const structure=outputOf<StructureOutput>(context,"structure");
          const materials=outputOf<MaterialsOutput>(context,"materials");
          const caseFingerprint=fingerprintJson({operationTruth:structure.operationTruth,structureTruth:structure.structureTruth,pricingTruth:structure.pricingTruth});
          return {output:{languageConductTruth:buildLanguageConductTruthSet({
            caseId:input.caseId,
            referenceDate:input.referenceDate,
            caseFingerprint,
            materials:materials.materials,
            dataRoom:materials.dataRoom,
            ...(input.languageConductGovernance?{governance:input.languageConductGovernance}:{}),
          })} satisfies LanguageConductOutput,trace:{toolsUsed:["language_conduct_truth","release_gate"],sourceIds:caseSourceIds(input)}};
        },
      },
      matching: {
        outputSchema: matchingOutputSchema,
        selectInput: () => ({dealBrief: input.dealBrief, resolvedMandates: input.resolvedMandates, marketGovernance: input.marketGovernance}),
        execute: (context) => {
          const structure = outputOf<StructureOutput>(context, "structure");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const {reconciliation} = outputOf<ReconciliationOutput>(context, "reconciliation");
          const request = requestForMatching(input, structure, metrics, reconciliation);
          const fits = rankFits(input.resolvedMandates.map((mandate) => assessMandateFit(mandate, request)));
          const materials=outputOf<MaterialsOutput>(context,"materials");
          const redFlags=outputOf<RedFlagsOutput>(context,"red_flags").redFlagTruth;
          const languageConduct=outputOf<LanguageConductOutput>(context,"language_conduct").languageConductTruth;
          const structural=[...structuralExclusions(fits),...(!redFlags.mandate.qualifiedIntroductionAllowed?["red_flag_governance_blocked"]:[]),...(!languageConduct.qualifiedIntroductionAllowed?["language_conduct_governance_blocked"]:[])];
          const materialFingerprint=materials.materialTruth.fingerprint;
          const marketTruth=buildMarketTruthSet({
            mandates:input.resolvedMandates,
            fits,
            structuralExclusions:structural,
            mandateMaxAgeMonths:input.marketGovernance?.mandateMaxAgeMonths??null,
            waveLimit:input.marketGovernance?.waveLimit??null,
            caseFingerprint:fingerprintJson({operationTruth:structure.operationTruth,structureTruth:structure.structureTruth,pricingTruth:structure.pricingTruth}),
            materialGate:{releaseDecision:materials.materialTruth.releaseDecision,fingerprint:materialFingerprint,recipientIds:materials.materialTruth.release.companyAuthorization.recipientIds},
            ...(input.marketGovernance?.recipients?{recipients:input.marketGovernance.recipients}:{}),
            ...(input.marketGovernance?.authorization?{authorization:input.marketGovernance.authorization}:{}),
            ...(input.marketGovernance?.introductions?{introductions:input.marketGovernance.introductions}:{}),
          });
          return {
            output: {
              screened: input.resolvedMandates.length > 0,
              fits,
              structuralExclusions: structural,
              marketTruth,
            } satisfies MatchingOutput,
            trace: {toolsUsed: ["fund_mandate", "matching_core", "market_truth"], sourceIds: caseSourceIds(input)},
          };
        },
      },
      outcome: {
        outputSchema: outcomeOutputSchema,
        selectInput: () => ({externalReleaseApproved: input.externalReleaseApproved}),
        execute: (context) => {
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const gaps = outputOf<GapsOutput>(context, "gaps");
          const structure = outputOf<StructureOutput>(context, "structure");
          const materials = outputOf<MaterialsOutput>(context, "materials");
          const redFlags=outputOf<RedFlagsOutput>(context,"red_flags").redFlagTruth;
          const languageConduct=outputOf<LanguageConductOutput>(context,"language_conduct").languageConductTruth;
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
                blockers: [...gaps.blockers, ...structure.structureTruth.exceptions.filter((exception) => exception.severity === "critical").map((exception) => exception.id),...redFlags.blockers,...languageConduct.blockerCodes],
              }),
            } satisfies OutcomeOutput,
            trace: {toolsUsed: ["case_outcome"], sourceIds: caseSourceIds(input)},
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
  const redFlags=stage<RedFlagsOutput>("red_flags").redFlagTruth;
  const claims = stage<ClaimsOutput>("claims");
  const materials = stage<MaterialsOutput>("materials");
  const languageConduct=stage<LanguageConductOutput>("language_conduct").languageConductTruth;
  const matching = stage<MatchingOutput>("matching");
  const outcome = stage<OutcomeOutput>("outcome").outcome;
  return {
    report,
    state: {
      reconciliation,
      ...metrics,
      ...structure,
      redFlagTruth:redFlags,
      brief: claims.brief,
      briefBlockedBy: claims.briefBlockedBy,
      modelInvocations: [...structure.structureModelInvocations, ...claims.modelInvocations],
      claimRegistry: materials.claimRegistry,
      materials: materials.materials,
      financialModel: materials.financialModel,
      materialsBlockedBy: materials.materialsBlockedBy,
      materialTruth:materials.materialTruth,
      languageConductTruth:languageConduct,
      dataRoom: materials.dataRoom,
      matching,
      outcome,
    },
  };
}

type StructureSubtaskId =
  | "need_capacity"
  | "issuer_profile"
  | "credit_scenarios"
  | "instrument_screen"
  | "collateral_design"
  | "operation_verdict"
  | "operation_truth"
  | "indicative_terms"
  | "structure_truth"
  | "pricing_truth"
  | "structure_design"
  | "structure_alternatives"
  | "structure_decision"
  | "assemble";

type StructureSubgraphInput = {
  caseInput: CaseEngineInput;
  reconciliation: ReconciliationReport;
  metrics: MetricsOutput;
};

const structureCapacitySchema = z.object({requested: z.string().optional(), capacity: z.unknown().nullable()});
const issuerProfileSchema = z.object({
  legalForm: z.enum(["sa", "ltda", "other"]),
  latestYear: z.string().optional(),
  priorYear: z.string().optional(),
  evidenceRank: z.string().optional(),
  topShare: z.string().optional(),
});
const creditScenariosSchema = z.object({rating: z.unknown().nullable(), stress: z.array(z.unknown())});
const instrumentScreenSchema = z.object({instruments: z.array(z.unknown())});
const collateralDesignSchema = z.object({collateral: z.unknown().nullable()});
const operationVerdictSchema = z.object({verdict: z.unknown().nullable()});
const operationTruthSubtaskSchema = z.object({operationTruth: z.unknown()});
const indicativeTermsSchema = z.object({termSheet: z.unknown().nullable()});
const structureTruthSubtaskSchema = z.object({structureTruth: z.unknown()});
const pricingTruthSubtaskSchema = z.object({pricingTruth: z.unknown(), price: z.unknown().nullable()});
export const structureBasisLineSchema = z.object({
  id: z.string().min(1), label: z.string().min(1), amount: z.string().min(1),
  origin: z.enum(["reconciled_fact", "calculation", "company_input", "proposal"]),
  basisIds: z.array(z.string().min(1)).min(1),
  condition: z.enum(["available", "conditional", "proposed"]),
}).strict();
export const structureAlternativeDraftSchema = z.object({
  id: z.string().min(1), label: z.string().min(1), instrument: z.string().min(1), route: z.string().min(1),
  amount: z.string().min(1), currency: z.string().min(1), termMonths: z.number().int().positive(), graceMonths: z.number().int().nonnegative(),
  amortization: z.enum(["sac", "price", "bullet", "balloon"]), indexer: z.string().min(1), targetBuyer: z.string().min(1).nullable(),
  rationale: z.string().min(1), pros: z.array(z.string().min(1)).max(6), cons: z.array(z.string().min(1)).max(6), assumptions: z.array(z.string().min(1)).max(10),
  sources: z.array(structureBasisLineSchema).min(1).max(20), uses: z.array(structureBasisLineSchema).min(1).max(20),
  security: z.array(z.object({description: z.string().min(1), basisIds: z.array(z.string().min(1)).min(1)}).strict()).max(12),
  covenants: z.array(z.object({description: z.string().min(1), basisIds: z.array(z.string().min(1)).min(1)}).strict()).max(12),
  conditionsPrecedent: z.array(z.object({description: z.string().min(1), owner: z.string().min(1).nullable(), basisIds: z.array(z.string().min(1)).min(1)}).strict()).max(20),
  implementationDays: z.object({min: z.number().int().nonnegative(), max: z.number().int().nonnegative(), basisIds: z.array(z.string().min(1)).min(1)}).strict().nullable(),
  basisIds: z.array(z.string().min(1)).min(1),
}).strict();
export const structureAlternativesInputSchema = z.object({
  alternatives: z.array(structureAlternativeDraftSchema).min(1).max(3),
  recommendation: z.object({
    alternativeId: z.string().min(1), rationale: z.string().min(1), basisIds: z.array(z.string().min(1)).min(1),
    proposedBy: z.string().min(1), proposedAt: z.iso.datetime(),
  }).strict().nullable(),
}).strict();
export const structureConfirmationInputSchema = z.object({
  decision: z.enum(["confirm", "request_changes", "decline"]),
  selectedAlternativeId: z.string().min(1),
  proposalFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: z.string().min(1),
  decidedAt: z.iso.datetime(),
  rationale: z.string().min(1).optional(),
  requestedChanges: z.array(z.string().min(1)).max(20).optional(),
}).strict();
const structureDesignSubtaskSchema = z.object({
  proposal: structureAlternativesInputSchema.nullable(),
  blockedBy: z.array(z.string()),
  modelInvocations: z.array(z.unknown()),
});
const structureAlternativesSubtaskSchema = z.object({structureAlternatives: z.unknown()});
const structureDecisionSubtaskSchema = z.object({structureDecision: z.unknown()});

async function runStructureSubgraph(
  caseInput: CaseEngineInput,
  reconciliation: ReconciliationReport,
  metrics: MetricsOutput,
) {
  const graphInput: StructureSubgraphInput = {caseInput, reconciliation, metrics};
  const sourceIds = caseSourceIds(caseInput);
  const valueOf = (fieldPath: string) => reconciliation.facts.find((fact) => fact.key.fieldPath === fieldPath)?.value;
  const calculationOf = (id: string) => reconciliation.calculations.find((calculation) => calculation.id === id)?.value;
  const task = (
    id: StructureSubtaskId,
    dependencies: StructureSubtaskId[],
    outputSchema: z.ZodType,
    allowedTools: string[],
    execute: SubtaskDefinition<StructureSubtaskId, StructureSubgraphInput>["execute"],
    executionClass: "deterministic" | "model" = "deterministic",
  ): SubtaskDefinition<StructureSubtaskId, StructureSubgraphInput> => ({
    spec: {id, version: "1", dependencies, executionClass, allowedTools},
    outputSchema,
    selectInput: () => ({
      archetypeId: caseInput.archetypeId,
      referenceDate: caseInput.referenceDate,
      dealBrief: caseInput.dealBrief,
      factsFingerprint: fingerprintJson(reconciliation.facts),
      calculationsFingerprint: fingerprintJson(reconciliation.calculations),
      metricsFingerprint: fingerprintJson({desk: metrics.desk, trajectory: metrics.trajectory, receivables: metrics.receivables}),
    }),
    execute,
  });
  const basisIdsFor = (operationTruth: OperationTruthSet, structureTruth: StructureTruthSet) => uniqueStrings([
    ...reconciliation.facts.map((fact) => fact.key.fieldPath),
    ...reconciliation.calculations.map((calculation) => calculation.id),
    ...sourceIds,
    ...operationTruth.procedureCoverage.map((procedure) => procedure.procedureId),
    ...structureTruth.procedureCoverage.map((procedure) => procedure.procedureId),
  ]);

  const tasks: SubtaskDefinition<StructureSubtaskId, StructureSubgraphInput>[] = [
    task("need_capacity", [], structureCapacitySchema, ["financial_core"], () => {
      const requested = caseInput.dealBrief.requestedAmount ?? number(valueOf("transaction.requested_amount"));
      if (!requested) return {output: {capacity: null}, toolsUsed: ["financial_core"], sourceIds};
      const latestArr = reconciliation.facts
        .filter((fact) => /^(historical|interim)_financials\.\d{4}(_\d{2})?\.arr(_\d+m|_ytd|_ltm)?$/.test(fact.key.fieldPath))
        .sort((a, b) => b.key.fieldPath.localeCompare(a.key.fieldPath))[0]?.value;
      const capacity = assessCapacity({
        archetypeId: caseInput.archetypeId,
        requested,
        ...(number(latestArr) ? {arr: latestArr!} : {}),
        ...(number(valueOf("company.last_equity_round.amount")) ? {lastEquityRound: valueOf("company.last_equity_round.amount")!} : {}),
        ...(number(calculationOf("adjusted_ebitda")) ? {cfads: calculationOf("adjusted_ebitda")!, adjustedEbitda: calculationOf("adjusted_ebitda")!} : {}),
        ...(number(calculationOf("net_debt")) ? {existingNetDebt: calculationOf("net_debt")!} : {}),
        ...(metrics.receivables ? {collateralCapacity: metrics.receivables.structure.supportedFacility}
          : number(calculationOf("collateral_capacity_total")) ? {collateralCapacity: calculationOf("collateral_capacity_total")!} : {}),
        annualDebtServiceFactor: (1 / (archetype(caseInput.archetypeId).structure.tenorMonths.typical[1] / 12) + 0.12).toFixed(4),
      });
      return {output: {requested, capacity}, toolsUsed: ["financial_core"], sourceIds};
    }),
    task("issuer_profile", [], issuerProfileSchema, ["instrument_catalogue"], () => {
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
      return {
        output: {
          legalForm,
          ...(latestYear ? {latestYear} : {}),
          ...(priorYear ? {priorYear} : {}),
          ...(evidenceRank ? {evidenceRank} : {}),
          ...(topShare ? {topShare} : {}),
        },
        toolsUsed: ["instrument_catalogue"],
        sourceIds,
      };
    }),
    task("credit_scenarios", ["issuer_profile"], creditScenariosSchema, ["financial_core"], ({outputs}) => {
      const issuer = subtaskOutput<z.infer<typeof issuerProfileSchema>>(outputs, "issuer_profile");
      const rating = metrics.desk
        ? rateCredit({
            desk: metrics.desk,
            trajectory: metrics.trajectory,
            ...(issuer.latestYear && valueOf(`historical_financials.${issuer.latestYear}.financial_expenses`) ? {financialExpenses: valueOf(`historical_financials.${issuer.latestYear}.financial_expenses`)!} : {}),
            ...(issuer.priorYear && valueOf(`historical_financials.${issuer.priorYear}.ebitda`) ? {priorEbitda: valueOf(`historical_financials.${issuer.priorYear}.ebitda`)!} : {}),
            ...(issuer.topShare ? {topCustomerShare: issuer.topShare} : {}),
            ...(issuer.evidenceRank ? {evidenceRank: issuer.evidenceRank} : {}),
          })
        : null;
      const stress = metrics.desk?.profile === "cash_generative"
        ? stressTable({
            desk: metrics.desk,
            ...(issuer.latestYear && valueOf(`historical_financials.${issuer.latestYear}.revenue`) ? {revenue: valueOf(`historical_financials.${issuer.latestYear}.revenue`)!} : {}),
            ...(issuer.topShare ? {topCustomerShare: issuer.topShare} : {}),
          })
        : [];
      return {output: {rating, stress}, toolsUsed: ["financial_core"], sourceIds};
    }),
    task("instrument_screen", ["need_capacity", "issuer_profile"], instrumentScreenSchema, ["instrument_catalogue"], ({outputs}) => {
      const {requested} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity");
      const {legalForm} = subtaskOutput<z.infer<typeof issuerProfileSchema>>(outputs, "issuer_profile");
      const instruments = requested
        ? instrumentVerdicts({
            legalForm,
            archetypeId: caseInput.archetypeId,
            amount: requested,
            ...(metrics.desk?.profile === "cash_burning" || valueOf("company.last_equity_round.amount") ? {ventureBacked: true} : {}),
            ...(caseInput.archetypeId === "equipment_finance" ? {equipment: true} : {}),
            ...(metrics.desk?.encumbrance.free ? {receivablesCoverage: (Number(metrics.desk.encumbrance.free) / Number(requested)).toFixed(2)} : {}),
          })
        : [];
      return {output: {instruments}, toolsUsed: ["instrument_catalogue"], sourceIds};
    }),
    task("collateral_design", ["need_capacity"], collateralDesignSchema, ["deal_structure"], ({outputs}) => {
      const {requested} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity");
      const assets = collateralAssetsOf(reconciliation, metrics.desk);
      const collateral = requested && assets.length > 0 ? designCollateralPackage({assets, amount: requested}) : null;
      return {output: {collateral}, toolsUsed: ["deal_structure"], sourceIds};
    }),
    task("operation_verdict", ["need_capacity"], operationVerdictSchema, ["financial_core"], ({outputs}) => {
      const {requested, capacity} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity") as {requested?: string; capacity: CapacityAssessment | null};
      const deskVerdict = metrics.desk && requested
        ? judgeOperation({
            desk: metrics.desk,
            trajectory: metrics.trajectory,
            operation: {
              amount: requested,
              termMonths: caseInput.dealBrief.requestedTermMonths ?? Number(valueOf("transaction.desired_term_months") ?? 60),
              graceMonths: caseInput.dealBrief.requestedGraceMonths ?? Number(valueOf("transaction.desired_grace_months") ?? 12),
              instrument: valueOf("transaction.preferred_structure") ?? "dívida privada",
              ...(valueOf("transaction.refinancing") ? {refinancing: valueOf("transaction.refinancing")!} : {}),
              ...(valueOf("transaction.purpose") ? {purpose: valueOf("transaction.purpose")!} : {}),
            },
          })
        : null;
      const verdict = deskVerdict && requested ? applyCapacityCondition(deskVerdict, requested, capacity) : deskVerdict;
      return {output: {verdict}, toolsUsed: ["financial_core"], sourceIds};
    }),
    task("operation_truth", ["need_capacity"], operationTruthSubtaskSchema, ["deal_structure"], ({outputs}) => {
      const {requested, capacity} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity") as {requested?: string; capacity: CapacityAssessment | null};
      const operationTruth = buildOperationTruthSet({
        facts: reconciliation.facts,
        financialTruth: reconciliation.financialTruth,
        debtTruth: reconciliation.debtTruth,
        capacity,
        ...(requested ? {requestedAmount: requested} : {}),
        ...(caseInput.dealBrief.requestedTermMonths !== undefined ? {requestedTermMonths: caseInput.dealBrief.requestedTermMonths} : {}),
        referenceDate: caseInput.referenceDate,
        ...(caseInput.operationPolicies ? {policies: caseInput.operationPolicies} : {}),
      });
      return {output: {operationTruth}, toolsUsed: ["deal_structure"], sourceIds};
    }),
    task("indicative_terms", ["need_capacity"], indicativeTermsSchema, ["deal_structure"], ({outputs}) => {
      const {capacity} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity") as {capacity: CapacityAssessment | null};
      const termSheet = capacity
        ? buildTermSheet({
            archetypeId: caseInput.archetypeId,
            capacity,
            ...(caseInput.dealBrief.requestedTermMonths !== undefined ? {requestedTermMonths: caseInput.dealBrief.requestedTermMonths} : {}),
            ...(caseInput.dealBrief.requestedGraceMonths !== undefined ? {requestedGraceMonths: caseInput.dealBrief.requestedGraceMonths} : {}),
            ...(caseInput.dealBrief.expectedRate ? {expectedRate: caseInput.dealBrief.expectedRate} : {}),
            blockers: metrics.readiness.blockers.map((blocker) => blocker.labels[caseInput.locale]),
          })
        : null;
      return {output: {termSheet}, toolsUsed: ["deal_structure"], sourceIds};
    }),
    task("structure_truth", ["need_capacity", "operation_truth", "indicative_terms", "instrument_screen", "collateral_design"], structureTruthSubtaskSchema, ["deal_structure"], ({outputs}) => {
      const {capacity} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity") as {capacity: CapacityAssessment | null};
      const {operationTruth} = subtaskOutput<{operationTruth: OperationTruthSet}>(outputs, "operation_truth");
      const {termSheet} = subtaskOutput<{termSheet: IndicativeTermSheet | null}>(outputs, "indicative_terms");
      const {instruments} = subtaskOutput<{instruments: InstrumentVerdict[]}>(outputs, "instrument_screen");
      const {collateral} = subtaskOutput<{collateral: CollateralPackage | null}>(outputs, "collateral_design");
      const structureTruth = buildStructureTruthSet({
        archetypeId: caseInput.archetypeId,
        facts: reconciliation.facts,
        financialTruth: reconciliation.financialTruth,
        debtTruth: reconciliation.debtTruth,
        operationTruth,
        capacity,
        termSheet,
        collateral,
        instruments,
        referenceDate: caseInput.referenceDate,
        ...(caseInput.structurePolicies ? {policies: caseInput.structurePolicies} : {}),
      });
      return {output: {structureTruth}, toolsUsed: ["deal_structure"], sourceIds};
    }),
    task("pricing_truth", ["structure_truth", "credit_scenarios", "instrument_screen"], pricingTruthSubtaskSchema, ["market_reference"], ({outputs}) => {
      const {structureTruth} = subtaskOutput<{structureTruth: StructureTruthSet}>(outputs, "structure_truth");
      const {rating} = subtaskOutput<{rating: InternalRating | null}>(outputs, "credit_scenarios");
      const {instruments} = subtaskOutput<{instruments: InstrumentVerdict[]}>(outputs, "instrument_screen");
      const preferredInstrument = instruments.find((entry) => entry.eligible)?.instrument.id as PricedInstrument | undefined;
      const selectedCollateralClasses = structureTruth.security.package?.lines
        .filter((line) => line.selected)
        .map((line) => line.asset.type)
        .sort() ?? [];
      const pricingSecurityClass = selectedCollateralClasses.length > 0
        ? `secured:${[...new Set(selectedCollateralClasses)].join("+")}`
        : "unsecured";
      const pricingTarget = caseInput.pricing && rating && preferredInstrument && caseInput.indexLevels?.cdi && structureTruth.proposal.amount && structureTruth.proposal.termMonths && structureTruth.proposal.amortizationFormat
        ? {
            instrument: preferredInstrument,
            rating: rating.band,
            cdi: caseInput.indexLevels.cdi,
            tenorMonths: structureTruth.proposal.termMonths,
            securityClass: pricingSecurityClass,
            amortizationClass: structureTruth.proposal.amortizationFormat,
            sectorGroup: caseInput.pricing.sectorGroup,
            amount: structureTruth.proposal.amount,
            indexer: caseInput.pricing.indexer,
            ...(caseInput.pricing.indexerRationale ? {indexerRationale: caseInput.pricing.indexerRationale} : {}),
            ...(caseInput.pricing.targetBuyer ? {targetBuyer: caseInput.pricing.targetBuyer} : {}),
            ...(caseInput.pricing.expectedSpreadBps !== undefined ? {expectedSpreadBps: caseInput.pricing.expectedSpreadBps} : {}),
            ...(caseInput.pricing.currentAllIn ? {currentAllIn: caseInput.pricing.currentAllIn} : {}),
          }
        : null;
      const pricingTruth = buildPricingTruthSet({
        target: pricingTarget,
        ...(caseInput.pricing ? {
          policy: caseInput.pricing.policy,
          observations: caseInput.pricing.observations,
          ...(caseInput.pricing.adjustments ? {adjustments: caseInput.pricing.adjustments} : {}),
          ...(caseInput.pricing.costs ? {costs: caseInput.pricing.costs} : {}),
          ...(caseInput.pricing.weightedAverageLifeYears ? {weightedAverageLifeYears: caseInput.pricing.weightedAverageLifeYears} : {}),
        } : {}),
      });
      return {output: {pricingTruth, price: pricingTruth.indicativePrice}, toolsUsed: ["market_reference"], sourceIds};
    }),
    task("structure_design", ["operation_truth", "structure_truth", "pricing_truth", "instrument_screen"], structureDesignSubtaskSchema, ["structure_designer"], async ({outputs}) => {
      const {operationTruth} = subtaskOutput<{operationTruth: OperationTruthSet}>(outputs, "operation_truth");
      const {structureTruth} = subtaskOutput<{structureTruth: StructureTruthSet}>(outputs, "structure_truth");
      const {pricingTruth} = subtaskOutput<{pricingTruth: PricingTruthSet}>(outputs, "pricing_truth");
      const {instruments} = subtaskOutput<{instruments: InstrumentVerdict[]}>(outputs, "instrument_screen");
      if (caseInput.structureProposal) {
        return {output: {proposal: structureAlternativesInputSchema.parse(caseInput.structureProposal), blockedBy: [], modelInvocations: []}, usage: {costUsd: 0, modelCalls: 0}, toolsUsed: [], sourceIds};
      }
      const readinessBlockers = uniqueStrings([
        ...(operationTruth.sourcesAndUses.status !== "pass" ? ["sources_and_uses_not_verified"] : []),
        ...(structureTruth.status === "blocked" ? ["base_structure_truth_blocked"] : []),
        ...(instruments.some((instrument) => instrument.eligible) ? [] : ["no_eligible_instrument"]),
      ]);
      if (!caseInput.designStructure || readinessBlockers.length > 0) {
        return {
          output: {proposal: null, blockedBy: uniqueStrings([...readinessBlockers, ...(!caseInput.designStructure ? ["structure_designer_unavailable"] : [])]), modelInvocations: []},
          usage: {costUsd: 0, modelCalls: 0},
          toolsUsed: [],
          sourceIds,
        };
      }
      const context: StructureDesignerContext = {
        version: "2026.08.29-v1",
        caseFingerprint: fingerprintStructureVerificationContext(operationTruth, structureTruth),
        archetypeId: caseInput.archetypeId,
        locale: caseInput.locale,
        request: operationTruth.request,
        calculatedNeed: operationTruth.calculatedNeed,
        sourcesAndUses: operationTruth.sourcesAndUses,
        effects: operationTruth.effects,
        capacityEnvelope: structureTruth.capacityEnvelope,
        baseStructure: structureTruth.proposal,
        finalSizing: structureTruth.finalSizing,
        security: structureTruth.security,
        dayOne: structureTruth.dayOne,
        eligibleInstruments: instruments.filter((instrument) => instrument.eligible).map((instrument) => ({
          id: instrument.instrument.id,
          route: instrument.instrument.id,
          taxonomy: instrument.route,
          minimumAmount: instrument.instrument.minimumAmount,
          tenorMonths: instrument.instrument.tenorMonths,
          buyers: instrument.instrument.buyers,
          requirements: instrument.instrument.requirements,
        })),
        pricing: {
          decision: pricingTruth.decision,
          policyVersion: pricingTruth.policyVersion,
          indicativePrice: pricingTruth.indicativePrice,
          allIn: pricingTruth.allIn,
          missingInputs: pricingTruth.missingInputs,
        },
        blockers: uniqueStrings([...operationTruth.exceptions.filter((exception) => exception.severity === "critical").map((exception) => exception.id), ...structureTruth.exceptions.filter((exception) => exception.severity === "critical").map((exception) => exception.id)]),
        missingInputs: uniqueStrings([...operationTruth.missingInputs, ...structureTruth.missingInputs]),
        allowedBasisIds: basisIdsFor(operationTruth, structureTruth),
        budget: {maxCostUsd: 0.75, maxModelCalls: 1},
      };
      const designed = await caseInput.designStructure(context);
      const usage = {costUsd: designed.usage?.costUsd ?? 0, modelCalls: designed.usage?.modelCalls ?? 0};
      if (usage.costUsd > context.budget.maxCostUsd || usage.modelCalls > context.budget.maxModelCalls) {
        throw Object.assign(new Error("structure designer exceeded its hard budget"), {code: "structure_designer_budget_exceeded"});
      }
      const proposal = designed.proposal ? structureAlternativesInputSchema.parse({
        ...designed.proposal,
        recommendation: designed.proposal.recommendation ? {
          ...designed.proposal.recommendation,
          proposedBy: "offroad_structure_designer",
          proposedAt: `${caseInput.referenceDate}T00:00:00.000Z`,
        } : null,
      }) : null;
      return {output: {proposal, blockedBy: uniqueStrings(designed.blockedBy), modelInvocations: designed.modelInvocations ?? []}, usage, toolsUsed: ["structure_designer"], sourceIds};
    }, "model"),
    task("structure_alternatives", ["need_capacity", "operation_truth", "structure_truth", "pricing_truth", "instrument_screen", "collateral_design", "structure_design"], structureAlternativesSubtaskSchema, ["deal_structure", "market_reference"], ({outputs}) => {
      const {capacity} = subtaskOutput<z.infer<typeof structureCapacitySchema>>(outputs, "need_capacity") as {capacity: CapacityAssessment | null};
      const {operationTruth} = subtaskOutput<{operationTruth: OperationTruthSet}>(outputs, "operation_truth");
      const {structureTruth} = subtaskOutput<{structureTruth: StructureTruthSet}>(outputs, "structure_truth");
      const {pricingTruth} = subtaskOutput<{pricingTruth: PricingTruthSet}>(outputs, "pricing_truth");
      const {instruments} = subtaskOutput<{instruments: InstrumentVerdict[]}>(outputs, "instrument_screen");
      const {proposal} = subtaskOutput<z.infer<typeof structureDesignSubtaskSchema>>(outputs, "structure_design");
      const pricingByAlternative: Record<string, AlternativePricingInput> = {...(caseInput.structureAlternativePricing ?? {})};
      const verificationByAlternative: Record<string, StructureAlternativeVerification> = {};
      const verificationContextFingerprint = fingerprintStructureVerificationContext(operationTruth, structureTruth);
      const pricedInstrument = instruments.find((entry) => entry.eligible)?.instrument.id;
      const alternativeCollateralAssets = collateralAssetsOf(reconciliation, metrics.desk);
      for (const alternative of proposal?.alternatives ?? []) {
        const alternativeFacts = factsForStructureAlternative(reconciliation.facts, alternative);
        const alternativeCollateral = alternativeCollateralAssets.length > 0
          ? designCollateralPackage({assets: alternativeCollateralAssets, amount: alternative.amount})
          : null;
        const alternativeOperationTruth = buildOperationTruthSet({
          facts: alternativeFacts,
          financialTruth: reconciliation.financialTruth,
          debtTruth: reconciliation.debtTruth,
          capacity,
          requestedAmount: alternative.amount,
          requestedTermMonths: alternative.termMonths,
          referenceDate: caseInput.referenceDate,
          ...(caseInput.operationPolicies ? {policies: caseInput.operationPolicies} : {}),
        });
        const alternativeTermSheet = capacity ? buildTermSheet({
          archetypeId: caseInput.archetypeId,
          capacity,
          requestedTermMonths: alternative.termMonths,
          requestedGraceMonths: alternative.graceMonths,
          blockers: metrics.readiness.blockers.map((blocker) => blocker.labels[caseInput.locale]),
        }) : null;
        const alternativeStructureTruth = buildStructureTruthSet({
          archetypeId: caseInput.archetypeId,
          facts: alternativeFacts,
          financialTruth: reconciliation.financialTruth,
          debtTruth: reconciliation.debtTruth,
          operationTruth: alternativeOperationTruth,
          capacity,
          termSheet: alternativeTermSheet,
          collateral: alternativeCollateral,
          instruments,
          referenceDate: caseInput.referenceDate,
          ...(caseInput.structurePolicies ? {policies: caseInput.structurePolicies} : {}),
        });
        verificationByAlternative[alternative.id] = {
          alternativeFingerprint: fingerprintStructureAlternative(alternative),
          contextFingerprint: verificationContextFingerprint,
          verifierVersion: `${alternativeOperationTruth.version}+${alternativeStructureTruth.version}`,
          verifiedAt: `${caseInput.referenceDate}T00:00:00.000Z`,
          operationTruth: alternativeOperationTruth,
          structureTruth: alternativeStructureTruth,
        };
        if (pricingByAlternative[alternative.id] || alternative.instrument !== pricedInstrument) continue;
        pricingByAlternative[alternative.id] = {
          decision: pricingTruth.decision,
          policyVersion: pricingTruth.policyVersion,
          spreadBps: pricingTruth.indicativePrice?.bps ?? null,
          totalRate: pricingTruth.allIn.totalRate,
          annualizedCostBps: pricingTruth.allIn.annualizedCostBps,
          componentIds: pricingTruth.allIn.components.map((component) => component.id),
          missingInputs: [...pricingTruth.missingInputs],
        };
      }
      const structureAlternatives = compileStructureAlternatives({
        proposal,
        operationTruth,
        structureTruth,
        instruments,
        verificationByAlternative,
        pricingByAlternative,
        allowedBasisIds: basisIdsFor(operationTruth, structureTruth),
      });
      return {output: {structureAlternatives}, toolsUsed: ["deal_structure", "market_reference"], sourceIds};
    }),
    task("structure_decision", ["structure_alternatives"], structureDecisionSubtaskSchema, ["deal_structure"], ({outputs}) => {
      const {structureAlternatives} = subtaskOutput<{structureAlternatives: StructureAlternatives}>(outputs, "structure_alternatives");
      const structureDecision = buildStructureDecision(structureAlternatives, caseInput.structureConfirmation ?? null);
      return {output: {structureDecision}, toolsUsed: ["deal_structure"], sourceIds};
    }),
    task("assemble", ["need_capacity", "credit_scenarios", "instrument_screen", "collateral_design", "operation_verdict", "operation_truth", "indicative_terms", "structure_truth", "pricing_truth", "structure_design", "structure_alternatives", "structure_decision"], structureOutputSchema, ["deal_structure"], ({outputs}) => {
      const {capacity} = subtaskOutput<{capacity: CapacityAssessment | null}>(outputs, "need_capacity");
      const {rating, stress} = subtaskOutput<{rating: InternalRating | null; stress: StressScenario[]}>(outputs, "credit_scenarios");
      const {instruments} = subtaskOutput<{instruments: InstrumentVerdict[]}>(outputs, "instrument_screen");
      const {collateral} = subtaskOutput<{collateral: CollateralPackage | null}>(outputs, "collateral_design");
      const {verdict} = subtaskOutput<{verdict: OperationVerdict | null}>(outputs, "operation_verdict");
      const {operationTruth} = subtaskOutput<{operationTruth: OperationTruthSet}>(outputs, "operation_truth");
      const {termSheet} = subtaskOutput<{termSheet: IndicativeTermSheet | null}>(outputs, "indicative_terms");
      const {structureTruth} = subtaskOutput<{structureTruth: StructureTruthSet}>(outputs, "structure_truth");
      const {pricingTruth, price} = subtaskOutput<{pricingTruth: PricingTruthSet; price: IndicativePrice | null}>(outputs, "pricing_truth");
      const {structureAlternatives} = subtaskOutput<{structureAlternatives: StructureAlternatives}>(outputs, "structure_alternatives");
      const {structureDecision} = subtaskOutput<{structureDecision: StructureDecision}>(outputs, "structure_decision");
      const {modelInvocations: structureModelInvocations} = subtaskOutput<z.infer<typeof structureDesignSubtaskSchema>>(outputs, "structure_design");
      const output: StructureOutput = {capacity, operationTruth, structureTruth, structureAlternatives, structureDecision, pricingTruth, termSheet, rating, stress, instruments, collateral, price, verdict, structureModelInvocations};
      return {output, toolsUsed: ["deal_structure"], sourceIds};
    }),
  ];

  const result = await runSubgraph({
    graphId: "deal_structuring",
    caseId: caseInput.caseId,
    input: graphInput,
    tasks,
    versions: {caseEngine: caseEngineVersion, ...(caseInput.runtimeVersions ?? {})},
  });
  return {
    output: result.outputs.assemble as StructureOutput,
    taskRuns: result.taskRuns,
    usage: result.usage,
  };
}

type MaterialsSubtaskId =
  | "material_inputs"
  | "financial_model"
  | "compile_documents"
  | "plan_room"
  | "claim_registry"
  | "publication_gate"
  | "material_truth"
  | "assemble";

type MaterialsSubgraphInput = {
  input: CaseEngineInput;
  reconciliation: ReconciliationReport;
  metrics: MetricsOutput;
  structure: StructureOutput;
  redFlags: RedFlagTruthSet;
  claims: ClaimsOutput;
  extracted: ExtractionOutput;
};

const materialInputsSchema = z.object({
  approvedJudgmentIds: z.array(z.string()),
  canCompileDocuments: z.boolean(),
  canCompileFinancialModel: z.boolean(),
  initialBlockers: z.array(z.string()),
});
const financialModelSubtaskSchema = z.object({
  financialModel: z.unknown().nullable(),
  material: z.unknown().nullable(),
  blockers: z.array(z.string()),
});
const compiledDocumentsSchema = z.object({
  materials: z.array(z.unknown()),
  materialsBlockedBy: z.array(z.string()),
  audit: z.enum(["not_run", "pass", "blocked"]),
});
const plannedRoomSchema = z.object({materials: z.array(z.unknown()), dataRoom: z.unknown()});
const claimRegistrySubtaskSchema = z.object({claimRegistry: z.unknown().nullable()});
const publicationGateSchema = z.object({
  materials: z.array(z.unknown()),
  financialModel: z.unknown().nullable(),
  materialsBlockedBy: z.array(z.string()),
  audit: z.enum(["not_run", "pass", "blocked"]),
  dataRoom: z.unknown(),
  claimRegistry: z.unknown().nullable(),
});
const materialTruthSubtaskSchema = z.object({materialTruth: z.unknown()});

async function runMaterialsSubgraph(graphInput: MaterialsSubgraphInput) {
  const {input, reconciliation, metrics, structure, redFlags, claims, extracted} = graphInput;
  const sourceIds = caseSourceIds(input);
  const task = (
    id: MaterialsSubtaskId,
    dependencies: MaterialsSubtaskId[],
    outputSchema: z.ZodType,
    allowedTools: string[],
    execute: SubtaskDefinition<MaterialsSubtaskId, MaterialsSubgraphInput>["execute"],
  ): SubtaskDefinition<MaterialsSubtaskId, MaterialsSubgraphInput> => ({
    spec: {id, version: "1", dependencies, executionClass: "deterministic", allowedTools},
    outputSchema,
    selectInput: () => ({
      claimDecisions: input.claimDecisions ?? [],
      materialRelease: input.materialRelease ?? null,
      materialsPreparationApproved: input.materialsPreparationApproved === true,
      claimsFingerprint: fingerprintJson(claims),
      structureFingerprint: fingerprintJson(structure),
      reconciliationFingerprint: fingerprintJson(reconciliation),
      roomDocumentsFingerprint: fingerprintJson(extracted.roomDocuments),
    }),
    execute,
  });

  const tasks: SubtaskDefinition<MaterialsSubtaskId, MaterialsSubgraphInput>[] = [
    task("material_inputs", [], materialInputsSchema, ["claim_registry"], () => {
      const approvedJudgmentIds = claims.proposedBrief
        ? currentApprovedJudgments(claims.proposedBrief, input.claimDecisions ?? [])
        : [];
      return {
        output: {
          approvedJudgmentIds,
          canCompileDocuments: input.materialsPreparationApproved === true
            && structure.structureDecision.status === "confirmed"
            && structure.structureDecision.materialsPreparationAllowed
            && Boolean(claims.brief),
          canCompileFinancialModel: input.materialsPreparationApproved === true
            && structure.structureDecision.status === "confirmed"
            && structure.structureDecision.materialsPreparationAllowed
            && Boolean(structure.structureDecision.selectedAlternativeId),
          initialBlockers: uniqueStrings([
            ...(input.materialsPreparationApproved ? [] : ["production_plan_not_approved"]),
            ...(structure.structureDecision.status === "confirmed" ? [] : ["confirmed_structure_unavailable"]),
            ...(claims.brief ? [] : ["brief_unavailable", ...claims.briefBlockedBy]),
          ]),
        },
        toolsUsed: ["claim_registry"],
        sourceIds,
      };
    }),
    task("financial_model", ["material_inputs"], financialModelSubtaskSchema, ["financial_model"], ({outputs}) => {
      const materialInputs = subtaskOutput<z.infer<typeof materialInputsSchema>>(outputs, "material_inputs");
      if (!materialInputs.canCompileFinancialModel || !structure.structureDecision.selectedAlternativeId || !structure.structureAlternatives.proposalFingerprint) {
        return {
          output: {financialModel: null, material: null, blockers: ["confirmed_structure_unavailable_for_financial_model"]},
          toolsUsed: ["financial_model"],
          sourceIds,
        };
      }
      const selected = structure.structureAlternatives.alternatives.find(
        (alternative) => alternative.id === structure.structureDecision.selectedAlternativeId,
      );
      if (!selected || !selected.confirmationEligible) {
        return {
          output: {financialModel: null, material: null, blockers: ["selected_structure_not_model_eligible"]},
          toolsUsed: ["financial_model"],
          sourceIds,
        };
      }
      if (selected.amortization !== "sac" && selected.amortization !== "price" && selected.amortization !== "bullet") {
        return {
          output: {financialModel: null, material: null, blockers: [`financial_model_amortization_not_supported:${selected.amortization}`]},
          toolsUsed: ["financial_model"],
          sourceIds,
        };
      }
      const amortization: "sac" | "price" | "bullet" = selected.amortization;
      const evidence = deskEvidence(metrics.desk, metrics.trajectory);
      const filenames = new Map(extracted.roomDocuments.map((document) => [document.id, document.originalName]));
      const rate = selected.totalCost.totalRate;
      const annualInterestRate = rate ? midpointDecimal(rate.min, rate.max) : null;
      const modelInput = {
        archetypeId: input.archetypeId,
        facts: reconciliation.facts,
        calculations: [...reconciliation.calculations, ...evidence.calculations],
        requestedAmount: selected.amount,
        requestedTermMonths: selected.termMonths,
        requestedGraceMonths: selected.graceMonths,
        amortizationFormat: amortization,
        ...(annualInterestRate ? {annualInterestRate} : {}),
        filenames,
      } as const;
      const modelPt = buildFinancialModel({...modelInput, lang: "pt"});
      const modelEn = buildFinancialModel({...modelInput, lang: "en"});
      const bytesPt = toXlsxBuffer(modelPt, "pt");
      const bytesEn = toXlsxBuffer(modelEn, "en");
      if (bytesPt.byteLength < 4_000 || bytesEn.byteLength < 4_000 || bytesPt[0] !== 0x50 || bytesPt[1] !== 0x4b || bytesEn[0] !== 0x50 || bytesEn[1] !== 0x4b) {
        throw Object.assign(new Error("compiled financial model is not a valid XLSX payload"), {code: "financial_model_binary_invalid"});
      }
      const supportIds = uniqueStrings([
        ...selected.basisIds,
        ...selected.sources.flatMap((line) => line.basisIds),
        ...selected.uses.flatMap((line) => line.basisIds),
        ...selected.security.flatMap((line) => line.basisIds),
        ...selected.covenants.flatMap((line) => line.basisIds),
        ...reconciliation.calculations.map((calculation) => calculation.id),
      ]);
      const payload = {
        version: financialModelVersion,
        selectedAlternativeId: selected.id,
        proposalFingerprint: structure.structureAlternatives.proposalFingerprint,
        inputs: {
          amount: selected.amount,
          termMonths: selected.termMonths,
          graceMonths: selected.graceMonths,
          amortization,
          annualInterestRate,
        },
        periods: [...modelPt.periods],
        sheetNames: {
          pt: modelPt.sheets.map((sheet) => sheet.name.pt),
          en: modelEn.sheets.map((sheet) => sheet.name.en),
        },
        deskAssumptions: [...modelPt.deskAssumptions],
        supportIds,
        workbooks: {
          pt: {sha256: sha256Bytes(bytesPt), byteSize: bytesPt.byteLength},
          en: {sha256: sha256Bytes(bytesEn), byteSize: bytesEn.byteLength},
        },
      };
      const fingerprint = fingerprintJson(payload);
      const financialModel: FinancialModelArtifact = {...payload, fingerprint};
      const material = financialModelMaterial({
        artifactFingerprint: fingerprint,
        periods: financialModel.periods,
        sheetNames: financialModel.sheetNames,
        deskAssumptions: financialModel.deskAssumptions,
        selectedAlternativeId: selected.id,
        amount: selected.amount,
        termMonths: selected.termMonths,
        graceMonths: selected.graceMonths,
        supportIds,
      });
      return {output: {financialModel, material, blockers: []}, toolsUsed: ["financial_model"], sourceIds};
    }),
    task("compile_documents", ["material_inputs"], compiledDocumentsSchema, ["case_materials"], ({outputs}) => {
      const materialInputs = subtaskOutput<z.infer<typeof materialInputsSchema>>(outputs, "material_inputs");
      if (!materialInputs.canCompileDocuments || !claims.brief) {
        return {
          output: {materials: [], materialsBlockedBy: materialInputs.initialBlockers, audit: "not_run"},
          toolsUsed: ["case_materials"],
          sourceIds,
        };
      }
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
        approvedJudgmentIds: materialInputs.approvedJudgmentIds,
      });
      return compiled.ok
        ? {output: {materials: compiled.materials, materialsBlockedBy: [], audit: "pass"}, toolsUsed: ["case_materials"], sourceIds}
        : {output: {materials: [], materialsBlockedBy: compiled.detail, audit: "blocked"}, toolsUsed: ["case_materials"], sourceIds};
    }),
    task("plan_room", ["compile_documents", "financial_model"], plannedRoomSchema, ["data_room"], ({outputs}) => {
      const compiled = subtaskOutput<{materials: Material[]; materialsBlockedBy: string[]}>(outputs, "compile_documents");
      const model = subtaskOutput<{financialModel: FinancialModelArtifact | null; material: Material | null; blockers: string[]}>(outputs, "financial_model");
      const packageMaterials = [...compiled.materials, ...(model.material ? [model.material] : [])];
      const materialsBlockedBy = uniqueStrings([...compiled.materialsBlockedBy, ...model.blockers]);
      const dataRoom = planDataRoom({
        materials: packageMaterials,
        materialsBlockedBy,
        documents: extracted.roomDocuments,
        exceptions: reconciliation.exceptions,
        readiness: metrics.readiness,
      });
      const materials = [...packageMaterials.filter((material) => material.kind !== "data_room_index"), dataRoomIndex(dataRoom)];
      return {output: {materials, dataRoom}, toolsUsed: ["data_room"], sourceIds};
    }),
    task("claim_registry", ["plan_room"], claimRegistrySubtaskSchema, ["claim_registry"], ({outputs}) => {
      const {materials} = subtaskOutput<{materials: Material[]}>(outputs, "plan_room");
      const claimRegistry = claims.proposedBrief && claims.numericAudit && claims.semanticAudit
        ? buildClaimRegistry({
            brief: claims.proposedBrief,
            numericAudit: claims.numericAudit,
            semanticAudit: claims.semanticAudit,
            decisions: input.claimDecisions ?? [],
            artifacts: materials.map((material) => ({
              artifactId: material.kind,
              claimIds: material.blocks.flatMap((block) => block.type === "paragraph" && block.claimId ? [block.claimId] : []),
              supportIds: material.dependsOn,
            })),
          })
        : null;
      return {output: {claimRegistry}, toolsUsed: ["claim_registry"], sourceIds};
    }),
    task("publication_gate", ["compile_documents", "financial_model", "plan_room", "claim_registry"], publicationGateSchema, ["case_materials", "data_room", "claim_registry"], ({outputs}) => {
      const compiled = subtaskOutput<{materialsBlockedBy: string[]; audit: MaterialsOutput["audit"]}>(outputs, "compile_documents");
      const model = subtaskOutput<{financialModel: FinancialModelArtifact | null; blockers: string[]}>(outputs, "financial_model");
      const planned = subtaskOutput<{materials: Material[]; dataRoom: DataRoomPlan}>(outputs, "plan_room");
      const {claimRegistry} = subtaskOutput<{claimRegistry: ClaimRegistry | null}>(outputs, "claim_registry");
      if (!input.materialsPreparationApproved) {
        const materialsBlockedBy = uniqueStrings([
          "production_plan_not_approved",
          ...compiled.materialsBlockedBy,
          ...model.blockers,
        ]);
        const dataRoom = planDataRoom({
          materials: [],
          materialsBlockedBy,
          documents: extracted.roomDocuments,
          exceptions: reconciliation.exceptions,
          readiness: metrics.readiness,
        });
        return {
          output: {materials: [], financialModel: null, materialsBlockedBy, audit: "not_run", dataRoom, claimRegistry},
          toolsUsed: ["case_materials", "data_room", "claim_registry"],
          sourceIds,
        };
      }
      if (claimRegistry && !claimRegistry.publication.allowed) {
        const materialsBlockedBy = uniqueStrings([...compiled.materialsBlockedBy, ...model.blockers, ...claimRegistry.publication.blockers]);
        const dataRoom = planDataRoom({
          materials: [],
          materialsBlockedBy,
          documents: extracted.roomDocuments,
          exceptions: reconciliation.exceptions,
          readiness: metrics.readiness,
        });
        return {
          output: {materials: [], financialModel: model.financialModel, materialsBlockedBy, audit: "blocked", dataRoom, claimRegistry},
          toolsUsed: ["case_materials", "data_room", "claim_registry"],
          sourceIds,
        };
      }
      return {
        output: {
          materials: planned.materials,
          financialModel: model.financialModel,
          materialsBlockedBy: uniqueStrings([...compiled.materialsBlockedBy, ...model.blockers]),
          audit: compiled.audit,
          dataRoom: planned.dataRoom,
          claimRegistry,
        },
        toolsUsed: ["case_materials", "data_room", "claim_registry"],
        sourceIds,
      };
    }),
    task("material_truth", ["publication_gate"], materialTruthSubtaskSchema, ["case_materials"], ({outputs}) => {
      const gated = subtaskOutput<{
        materials: Material[];
        financialModel: FinancialModelArtifact | null;
        dataRoom: DataRoomPlan;
        claimRegistry: ClaimRegistry | null;
      }>(outputs, "publication_gate");
      const materialTruth = buildMaterialTruthSet({
        materials: gated.materials,
        dataRoom: gated.dataRoom,
        financialModel: gated.financialModel,
        claimAuditApproved: gated.claimRegistry?.publication.allowed === true,
        governanceBlockers: redFlags.mandate.externalOutputsAllowed ? [] : redFlags.blockers,
        ...(input.materialRelease ? {release: input.materialRelease} : {}),
      });
      return {output: {materialTruth}, toolsUsed: ["case_materials"], sourceIds};
    }),
    task("assemble", ["publication_gate", "material_truth"], materialsOutputSchema, ["case_materials"], ({outputs}) => {
      const gated = subtaskOutput<Omit<MaterialsOutput, "materialTruth">>(outputs, "publication_gate");
      const {materialTruth} = subtaskOutput<{materialTruth: MaterialTruthSet}>(outputs, "material_truth");
      const output: MaterialsOutput = {...gated, materialTruth};
      return {output, toolsUsed: ["case_materials"], sourceIds};
    }),
  ];

  const result = await runSubgraph({
    graphId: "materials_preparation",
    caseId: input.caseId,
    input: graphInput,
    tasks,
    versions: {caseEngine: caseEngineVersion, ...(input.runtimeVersions ?? {})},
  });
  return {
    output: result.outputs.assemble as MaterialsOutput,
    taskRuns: result.taskRuns,
    usage: result.usage,
  };
}

function subtaskOutput<T>(outputs: Readonly<Partial<Record<string, unknown>>>, taskId: string): T {
  const output = outputs[taskId];
  if (output === undefined) throw Object.assign(new Error(`missing subtask output ${taskId}`), {code: "missing_subtask_output"});
  return output as T;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function midpointDecimal(minimum: string, maximum: string): string | null {
  const min = Number(minimum);
  const max = Number(maximum);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return String((min + max) / 2);
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
