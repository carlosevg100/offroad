import {compileMaterials, type Material} from "@offroad/case-materials";
import {runCase, type CaseRunPolicy, type CaseRunReport, type StageContext} from "@offroad/case-runner";
import {
  assessReadiness,
  auditBrief,
  caseBriefSchema,
  caseOutcomeSchema,
  deriveCaseOutcome,
  deskEvidence,
  fingerprintJson,
  type CaseBrief,
  type CaseOutcome,
  type ReadinessReport,
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
  type ArchetypeId,
  type ClassifiedDocument,
  type InstrumentVerdict,
  type LegalForm,
} from "@offroad/credit-playbook";
import {dataRoomIndex, planDataRoom, type DataRoomDocument, type DataRoomPlan} from "@offroad/data-room";
import {
  assessCapacity,
  buildTermSheet,
  designCollateralPackage,
  type CapacityAssessment,
  type CollateralAsset,
  type CollateralPackage,
  type IndicativeTermSheet,
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
import {z} from "zod";

export const caseEngineVersion = "2026.08.24-v1";

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
  indexLevels?: {cdi: string; tlp: string; ipca: string; tr: string};
  writeBrief?: (input: {
    archetypeId: ArchetypeId;
    locale: "pt" | "en";
    reconciliation: ReconciliationReport;
    desk: DeskAnalysis | null;
    trajectory: Trajectory | null;
  }) => Promise<BriefWriterResult>;
};

export type CaseEngineState = {
  reconciliation: ReconciliationReport;
  readiness: ReadinessReport;
  capacity: CapacityAssessment | null;
  desk: DeskAnalysis | null;
  trajectory: Trajectory | null;
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
});
const gapsOutputSchema = z.object({materialGapCount: z.number().int().nonnegative(), blockers: z.array(z.string())});
const structureOutputSchema = z.object({
  capacity: z.unknown().nullable(),
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
  briefBlockedBy: z.array(z.string()),
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
  deskMissing: string[];
  clientQuestions: ClientQuestion[];
};
type GapsOutput = {materialGapCount: number; blockers: string[]};
type StructureOutput = Pick<
  CaseEngineState,
  "capacity" | "termSheet" | "rating" | "stress" | "instruments" | "collateral" | "price" | "verdict"
>;
type ClaimsOutput = Pick<CaseEngineState, "brief" | "briefBlockedBy" | "modelInvocations"> & {
  usage: {costUsd: number; modelCalls: number};
};
type MaterialsOutput = Pick<CaseEngineState, "materials" | "materialsBlockedBy" | "dataRoom"> & {
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

export function expectedMaterialFields(archetypeId: ArchetypeId): string[] {
  const base = ["transaction.requested_amount", "debt.total_gross", "company.legal_name"];
  const perArchetype: Partial<Record<ArchetypeId, string[]>> = {
    growth_expansion: ["project.total_cost", "collateral.total_capacity"],
    working_capital: ["collateral.receivables_capacity"],
    acquisition: ["leverage.post_transaction_net_debt_ebitda"],
    equipment_finance: ["project.total_cost"],
    venture_debt: ["company.runway_months", "company.last_equity_round.amount"],
  };
  return [...base, ...(perArchetype[archetypeId] ?? [])];
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
          return {
            output: {
              readiness,
              desk,
              trajectory,
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
          const {readiness} = outputOf<MetricsOutput>(context, "metrics");
          return {
            output: {
              materialGapCount: reconciliation.gaps.filter((gap) => gap.severity === "critical" || gap.severity === "high").length,
              blockers: readiness.blockers.map((blocker) => blocker.id),
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
              briefBlockedBy: ["brief_writer_unavailable"],
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
          });
          let brief = written.brief;
          const blockedBy = [...written.blockedBy];
          if (brief) {
            const evidence = deskEvidence(metrics.desk, metrics.trajectory);
            const audited = auditBrief({
              brief,
              facts: reconciliation.facts,
              calculations: [...reconciliation.calculations, ...evidence.calculations],
            });
            if (!audited.ok) {
              brief = null;
              blockedBy.push(...audited.audit.findings.map((finding) => `${finding.claimId}: ${finding.reason}`));
            }
          }
          const usage = written.usage ?? {costUsd: 0, modelCalls: 0};
          const output: ClaimsOutput = {
            brief,
            briefBlockedBy: [...new Set(blockedBy)],
            modelInvocations: written.modelInvocations ?? [],
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
          const dataRoom = planDataRoom({
            materials,
            materialsBlockedBy,
            documents: extracted.roomDocuments,
            exceptions: reconciliation.exceptions,
            readiness: metrics.readiness,
          });
          materials = [...materials.filter((material) => material.kind !== "data_room_index"), dataRoomIndex(dataRoom)];
          return {output: {materials, materialsBlockedBy, dataRoom, audit} satisfies MaterialsOutput};
        },
      },
      matching: {
        outputSchema: matchingOutputSchema,
        execute: (context) => {
          const structure = outputOf<StructureOutput>(context, "structure");
          const metrics = outputOf<MetricsOutput>(context, "metrics");
          const request = requestForMatching(input, structure, metrics);
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
                analysisComplete: Boolean(metrics.desk && structure.capacity && structure.verdict),
                ...(structure.verdict ? {verdictStanding: structure.verdict.standing} : {}),
                materialsAudit: materials.audit,
                mandateScreeningComplete: matching.screened,
                externalReleaseApproved: input.externalReleaseApproved,
                blockers: gaps.blockers,
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
      ...(number(calculationOf("collateral_capacity_total")) ? {collateralCapacity: calculationOf("collateral_capacity_total")!} : {}),
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
  const verdict = metrics.desk && requested
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
  return {capacity, termSheet, rating, stress, instruments, collateral, price, verdict};
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

function requestForMatching(input: CaseEngineInput, structure: StructureOutput, metrics: MetricsOutput): DealRequest {
  const eligible = structure.instruments
    .filter((entry) => entry.eligible)
    .map((entry) => legacyInstrumentMap[entry.instrument.id])
    .filter((entry): entry is Instrument => Boolean(entry));
  const leverage = input.dealBrief.requestedAmount
    ? metrics.desk?.leverage.scenarios.find((scenario) => scenario.amount === input.dealBrief.requestedAmount)?.postTurns
    : metrics.desk?.leverage.scenarios[0]?.postTurns;
  return {
    ...(input.dealBrief.requestedAmount ? {amount: input.dealBrief.requestedAmount} : {}),
    ...(input.dealBrief.requestedTermMonths !== undefined ? {termMonths: input.dealBrief.requestedTermMonths} : {}),
    ...(input.dealBrief.sector ? {sector: input.dealBrief.sector} : {}),
    ...(input.dealBrief.geography ? {geography: input.dealBrief.geography} : {}),
    ...((input.dealBrief.instruments?.length ?? 0) > 0 ? {instruments: input.dealBrief.instruments} : eligible.length > 0 ? {instruments: [...new Set(eligible)]} : {}),
    ...(input.dealBrief.collateralKinds?.length ? {collateral: input.dealBrief.collateralKinds} : {}),
    ...(leverage ? {leverage} : {}),
  };
}
