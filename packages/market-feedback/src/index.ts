import {createHash} from "node:crypto";

import {processingStageEventSchema} from "@offroad/work-plan";
import Decimal from "decimal.js";
import {z} from "zod";

export const marketFeedbackVersion = "2026.08.29-v1";

const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const moneySchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/);

export const marketFeedbackEventTypeSchema = z.enum([
  "introduction_accepted",
  "case_declined",
  "diligence_requested",
  "process_advanced",
  "proposal_issued",
  "funded",
]);
export type MarketFeedbackEventType = z.infer<typeof marketFeedbackEventTypeSchema>;

export const marketFeedbackSourceSchema = z.enum(["lender", "company", "advisor", "offroad", "system"]);
export const marketFeedbackVerificationSchema = z.enum(["reported", "confirmed", "verified"]);

export const qualifiedIntroductionReferenceSchema = z.object({
  id: z.uuid(),
  caseFingerprint: fingerprintSchema,
  fundId: z.uuid(),
  mandateFingerprint: fingerprintSchema,
  materialFingerprint: fingerprintSchema,
  introducedAt: z.iso.datetime(),
}).strict();
export type QualifiedIntroductionReference = z.infer<typeof qualifiedIntroductionReferenceSchema>;

export const marketFeedbackEventSchema = z.object({
  id: z.uuid(),
  introductionId: z.uuid(),
  caseFingerprint: fingerprintSchema,
  eventType: marketFeedbackEventTypeSchema,
  occurredAt: z.iso.datetime(),
  source: marketFeedbackSourceSchema,
  verification: marketFeedbackVerificationSchema,
  reasonCode: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
  note: z.string().trim().min(3).max(4000).optional(),
  requestedInformationCount: z.number().int().positive().max(500).optional(),
  amount: moneySchema.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  supersedesEventId: z.uuid().optional(),
}).strict().superRefine((event, context) => {
  if (event.eventType === "case_declined" && !event.reasonCode) {
    context.addIssue({code: "custom", path: ["reasonCode"], message: "a declined case requires a reason code"});
  }
  if (event.eventType === "diligence_requested" && !event.requestedInformationCount) {
    context.addIssue({code: "custom", path: ["requestedInformationCount"], message: "a diligence request requires the number of requested items"});
  }
  if ((event.amount && !event.currency) || (!event.amount && event.currency)) {
    context.addIssue({code: "custom", path: [event.amount ? "currency" : "amount"], message: "amount and currency must be provided together"});
  }
});
export type MarketFeedbackEvent = z.infer<typeof marketFeedbackEventSchema>;

export const productMilestoneTypeSchema = z.enum([
  "case_started",
  "diagnosis_ready",
  "structure_recommended",
  "materials_ready",
  "matching_completed",
]);
export type ProductMilestoneType = z.infer<typeof productMilestoneTypeSchema>;

export const productMilestoneEventSchema = z.object({
  id: z.string().trim().min(1),
  caseFingerprint: fingerprintSchema,
  milestone: productMilestoneTypeSchema,
  occurredAt: z.iso.datetime(),
}).strict();
export type ProductMilestoneEvent = z.infer<typeof productMilestoneEventSchema>;

const processingMilestoneStage = {
  diagnosis_ready: "case:gaps",
  structure_recommended: "case:structure",
  materials_ready: "case:language_conduct",
  matching_completed: "case:matching",
} as const satisfies Readonly<Record<Exclude<ProductMilestoneType, "case_started">, string>>;

/**
 * Projects commercial milestones from the existing processing_runs.stages event log.
 * This deliberately does not create a second workflow ledger. A milestone exists only
 * when the corresponding governed stage was persisted as succeeded.
 */
export function projectProductMilestones(input: {
  processingRunId: string;
  caseFingerprint: string;
  runStartedAt: string;
  stages: unknown;
}): ProductMilestoneEvent[] {
  const caseFingerprint = fingerprintSchema.parse(input.caseFingerprint);
  const runStartedAt = z.iso.datetime().parse(input.runStartedAt);
  const stages = z.array(processingStageEventSchema).parse(input.stages);
  const milestones: ProductMilestoneEvent[] = [{
    id: `${input.processingRunId}:case_started`,
    caseFingerprint,
    milestone: "case_started",
    occurredAt: runStartedAt,
  }];
  for (const [milestone, stageName] of Object.entries(processingMilestoneStage) as Array<[
    Exclude<ProductMilestoneType, "case_started">,
    string,
  ]>) {
    const completedAt = stages
      .filter((stage) => stage.stage === stageName && stage.status === "succeeded" && stage.at)
      .map((stage) => stage.at!)
      .sort()
      .at(0);
    if (completedAt) milestones.push({
      id: `${input.processingRunId}:${milestone}`,
      caseFingerprint,
      milestone,
      occurredAt: z.iso.datetime().parse(completedAt),
    });
  }
  return milestones.map((milestone) => productMilestoneEventSchema.parse(milestone));
}

export type IntroductionOutcomeStatus = "introduced" | "accepted" | "diligence" | "advanced" | "proposed" | "funded" | "declined";

export type IntroductionOutcome = {
  introductionId: string;
  caseFingerprint: string;
  fundId: string;
  mandateFingerprint: string;
  status: IntroductionOutcomeStatus;
  accepted: boolean;
  advancedToLenderReview: boolean;
  additionalInformationRequests: number;
  proposalIssued: boolean;
  funded: boolean;
  fundedAmount: {amount: string; currency: string} | null;
  declineReason: string | null;
  latestSignalAt: string | null;
  activeEventIds: string[];
  fingerprint: string;
};

const positiveEventTypes = new Set<MarketFeedbackEventType>([
  "introduction_accepted",
  "diligence_requested",
  "process_advanced",
  "proposal_issued",
  "funded",
]);

const statusRank: Readonly<Record<Exclude<MarketFeedbackEventType, "case_declined">, number>> = {
  introduction_accepted: 1,
  diligence_requested: 2,
  process_advanced: 3,
  proposal_issued: 4,
  funded: 5,
};

export function buildIntroductionOutcome(
  rawIntroduction: QualifiedIntroductionReference,
  rawEvents: readonly MarketFeedbackEvent[],
): IntroductionOutcome {
  const introduction = qualifiedIntroductionReferenceSchema.parse(rawIntroduction);
  const events = rawEvents.map((event) => marketFeedbackEventSchema.parse(event));
  validateTimeline(introduction, events);

  const superseded = new Set(events.flatMap((event) => event.supersedesEventId ? [event.supersedesEventId] : []));
  const active = [...events]
    .filter((event) => !superseded.has(event.id))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  const decline = [...active].reverse().find((event) => event.eventType === "case_declined");
  const positive = active.filter((event) => positiveEventTypes.has(event.eventType));
  if (decline && positive.some((event) => event.occurredAt >= decline.occurredAt)) {
    throw new Error("a positive signal after a decline must explicitly supersede the decline event");
  }

  const strongest = positive.reduce<MarketFeedbackEvent | null>((best, event) => {
    if (event.eventType === "case_declined") return best;
    if (!best || best.eventType === "case_declined") return event;
    return statusRank[event.eventType] > statusRank[best.eventType] ? event : best;
  }, null);
  const status: IntroductionOutcomeStatus = decline
    ? "declined"
    : strongest
      ? ({
          introduction_accepted: "accepted",
          diligence_requested: "diligence",
          process_advanced: "advanced",
          proposal_issued: "proposed",
          funded: "funded",
        } as const)[strongest.eventType as Exclude<MarketFeedbackEventType, "case_declined">]
      : "introduced";
  const fundedEvent = [...active].reverse().find((event) => event.eventType === "funded");
  const payload = {
    introductionId: introduction.id,
    caseFingerprint: introduction.caseFingerprint,
    fundId: introduction.fundId,
    mandateFingerprint: introduction.mandateFingerprint,
    status,
    accepted: positive.length > 0,
    advancedToLenderReview: positive.some((event) => ["diligence_requested", "process_advanced", "proposal_issued", "funded"].includes(event.eventType)),
    additionalInformationRequests: active
      .filter((event) => event.eventType === "diligence_requested")
      .reduce((total, event) => total + (event.requestedInformationCount ?? 0), 0),
    proposalIssued: positive.some((event) => ["proposal_issued", "funded"].includes(event.eventType)),
    funded: Boolean(fundedEvent),
    fundedAmount: fundedEvent?.amount && fundedEvent.currency ? {amount: fundedEvent.amount, currency: fundedEvent.currency} : null,
    declineReason: decline?.reasonCode ?? null,
    latestSignalAt: active.at(-1)?.occurredAt ?? null,
    activeEventIds: active.map((event) => event.id),
  };
  return {...payload, fingerprint: fingerprint(payload)};
}

export type LenderFeedbackProjection = {
  fundId: string;
  introductions: number;
  accepted: number;
  declined: number;
  diligenceRequests: number;
  advanced: number;
  proposals: number;
  funded: number;
  declineReasons: Record<string, number>;
  mandateOutcomes: Array<{mandateFingerprint: string; introductions: number; accepted: number; proposals: number; funded: number}>;
  latestSignalAt: string | null;
  fingerprint: string;
};

export function buildLenderFeedbackProjection(outcomes: readonly IntroductionOutcome[]): LenderFeedbackProjection[] {
  const groups = new Map<string, IntroductionOutcome[]>();
  for (const outcome of outcomes) groups.set(outcome.fundId, [...(groups.get(outcome.fundId) ?? []), outcome]);
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([fundId, fundOutcomes]) => {
    const mandateGroups = new Map<string, IntroductionOutcome[]>();
    const declineReasons: Record<string, number> = {};
    for (const outcome of fundOutcomes) {
      mandateGroups.set(outcome.mandateFingerprint, [...(mandateGroups.get(outcome.mandateFingerprint) ?? []), outcome]);
      if (outcome.declineReason) declineReasons[outcome.declineReason] = (declineReasons[outcome.declineReason] ?? 0) + 1;
    }
    const payload = {
      fundId,
      introductions: fundOutcomes.length,
      accepted: fundOutcomes.filter((outcome) => outcome.accepted).length,
      declined: fundOutcomes.filter((outcome) => outcome.status === "declined").length,
      diligenceRequests: fundOutcomes.reduce((total, outcome) => total + outcome.additionalInformationRequests, 0),
      advanced: fundOutcomes.filter((outcome) => outcome.advancedToLenderReview).length,
      proposals: fundOutcomes.filter((outcome) => outcome.proposalIssued).length,
      funded: fundOutcomes.filter((outcome) => outcome.funded).length,
      declineReasons,
      mandateOutcomes: [...mandateGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([mandateFingerprint, mandate]) => ({
        mandateFingerprint,
        introductions: mandate.length,
        accepted: mandate.filter((outcome) => outcome.accepted).length,
        proposals: mandate.filter((outcome) => outcome.proposalIssued).length,
        funded: mandate.filter((outcome) => outcome.funded).length,
      })),
      latestSignalAt: fundOutcomes.map((outcome) => outcome.latestSignalAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    };
    return {...payload, fingerprint: fingerprint(payload)};
  });
}

type RateMetric = {numerator: number; denominator: number; value: number | null};
type DurationMetric = {observations: number; averageMs: number | null; medianMs: number | null};

export type ProductOutcomeMetrics = {
  timeToDiagnosis: DurationMetric;
  timeToRecommendedStructure: DurationMetric;
  timeToMaterialsReady: DurationMetric;
  matchingPrecision: RateMetric;
  introductionAcceptanceRate: RateMetric;
  advancedToLenderReviewRate: RateMetric;
  additionalInformationRequests: {total: number; perIntroduction: number | null};
  proposalRatePerIntroduction: RateMetric;
  fundedByMandate: Array<{mandateFingerprint: string; fundedCount: number; fundedAmountByCurrency: Record<string, string>}>;
};

export function buildProductOutcomeMetrics(input: {
  milestones: readonly ProductMilestoneEvent[];
  outcomes: readonly IntroductionOutcome[];
}): ProductOutcomeMetrics {
  const milestones = input.milestones.map((event) => productMilestoneEventSchema.parse(event));
  const started = milestoneByCase(milestones, "case_started");
  const durations = (target: ProductMilestoneType) => durationMetric(
    [...milestoneByCase(milestones, target)].flatMap(([caseFingerprint, occurredAt]) => {
      const start = started.get(caseFingerprint);
      return start ? [Date.parse(occurredAt) - Date.parse(start)] : [];
    }).filter((duration) => duration >= 0),
  );
  const knownOutcomes = input.outcomes.filter((outcome) => outcome.accepted || outcome.status === "declined");
  const positiveKnown = knownOutcomes.filter((outcome) => outcome.accepted);
  const totalIntroductions = input.outcomes.length;
  const requests = input.outcomes.reduce((total, outcome) => total + outcome.additionalInformationRequests, 0);
  const fundedGroups = new Map<string, IntroductionOutcome[]>();
  for (const outcome of input.outcomes.filter((entry) => entry.funded)) {
    fundedGroups.set(outcome.mandateFingerprint, [...(fundedGroups.get(outcome.mandateFingerprint) ?? []), outcome]);
  }
  return {
    timeToDiagnosis: durations("diagnosis_ready"),
    timeToRecommendedStructure: durations("structure_recommended"),
    timeToMaterialsReady: durations("materials_ready"),
    matchingPrecision: rate(positiveKnown.length, knownOutcomes.length),
    introductionAcceptanceRate: rate(input.outcomes.filter((outcome) => outcome.accepted).length, totalIntroductions),
    advancedToLenderReviewRate: rate(input.outcomes.filter((outcome) => outcome.advancedToLenderReview).length, totalIntroductions),
    additionalInformationRequests: {total: requests, perIntroduction: totalIntroductions ? requests / totalIntroductions : null},
    proposalRatePerIntroduction: rate(input.outcomes.filter((outcome) => outcome.proposalIssued).length, totalIntroductions),
    fundedByMandate: [...fundedGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([mandateFingerprint, outcomes]) => {
      const totals = new Map<string, Decimal>();
      for (const outcome of outcomes) {
        if (!outcome.fundedAmount) continue;
        totals.set(outcome.fundedAmount.currency, (totals.get(outcome.fundedAmount.currency) ?? new Decimal(0)).plus(outcome.fundedAmount.amount));
      }
      return {mandateFingerprint, fundedCount: outcomes.length, fundedAmountByCurrency: Object.fromEntries([...totals.entries()].map(([currency, amount]) => [currency, amount.toFixed(2)]))};
    }),
  };
}

function validateTimeline(introduction: QualifiedIntroductionReference, events: readonly MarketFeedbackEvent[]): void {
  const ids = new Set<string>();
  const byId = new Map(events.map((event) => [event.id, event]));
  for (const event of events) {
    if (ids.has(event.id)) throw new Error(`duplicate feedback event: ${event.id}`);
    ids.add(event.id);
    if (event.introductionId !== introduction.id) throw new Error(`feedback event ${event.id} belongs to another introduction`);
    if (event.caseFingerprint !== introduction.caseFingerprint) throw new Error(`feedback event ${event.id} belongs to another case snapshot`);
    if (Date.parse(event.occurredAt) < Date.parse(introduction.introducedAt)) throw new Error(`feedback event ${event.id} predates the introduction`);
    if (event.supersedesEventId) {
      const prior = byId.get(event.supersedesEventId);
      if (!prior) throw new Error(`feedback event ${event.id} supersedes an unknown event`);
      if (prior.introductionId !== event.introductionId || prior.occurredAt > event.occurredAt) throw new Error(`feedback event ${event.id} has an invalid supersession`);
    }
  }
}

function milestoneByCase(events: readonly ProductMilestoneEvent[], milestone: ProductMilestoneType): Map<string, string> {
  const values = new Map<string, string>();
  for (const event of events.filter((entry) => entry.milestone === milestone).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))) {
    if (!values.has(event.caseFingerprint)) values.set(event.caseFingerprint, event.occurredAt);
  }
  return values;
}

function durationMetric(values: number[]): DurationMetric {
  if (!values.length) return {observations: 0, averageMs: null, medianMs: null};
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {observations: sorted.length, averageMs: sorted.reduce((total, value) => total + value, 0) / sorted.length, medianMs: median};
}

function rate(numerator: number, denominator: number): RateMetric {
  return {numerator, denominator, value: denominator ? numerator / denominator : null};
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
