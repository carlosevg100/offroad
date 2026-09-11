import {createHash} from "node:crypto";

import Decimal from "decimal.js";
import {z} from "zod";

/**
 * What a recipient organization answers about an exact information pack revision, and what the
 * issuer side may do next. None of these values means approval, funding or closing: an answer is
 * an observation of interest, a request for information, a decline, or silence.
 */
export const distributionResponseVersion = "2026.09.11-v1";

const codeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
const moneySchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/);
const rateSchema = z.string().regex(/^-?(0|[1-9]\d*)(\.\d{1,4})?$/);

export const distributionResponseStateSchema = z.enum([
  "interested",
  "needs_information",
  "declined",
  "no_response_yet",
]);
export type DistributionResponseState = z.infer<typeof distributionResponseStateSchema>;

export const distributionNextStepSchema = z.enum([
  "prepare_information_answer",
  "revise_structure",
  "schedule_conversation",
  "keep_on_hold",
  "close_without_continuation",
]);
export type DistributionNextStep = z.infer<typeof distributionNextStepSchema>;

export const structuredFeedbackEntrySchema = z.object({
  code: codeSchema,
  note: z.string().trim().min(1).max(500).optional(),
}).strict();
export type StructuredFeedbackEntry = z.infer<typeof structuredFeedbackEntrySchema>;

export const distributionResponseSchema = z.object({
  id: z.uuid(),
  shareId: z.uuid(),
  packRevisionId: z.uuid(),
  recipientOrganizationId: z.uuid(),
  responseState: distributionResponseStateSchema,
  note: z.string().trim().min(3).max(4000).optional(),
  ticketAmount: moneySchema.optional(),
  ticketCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  tenorMonths: z.number().int().min(1).max(600).optional(),
  pricingBasis: codeSchema.optional(),
  pricingMin: rateSchema.optional(),
  pricingMax: rateSchema.optional(),
  requestedConditions: z.array(structuredFeedbackEntrySchema).max(20),
  termObjections: z.array(structuredFeedbackEntrySchema).max(20),
  supersedesResponseId: z.uuid().optional(),
  occurredAt: z.iso.datetime(),
}).strict().superRefine((response, context) => {
  if (Boolean(response.ticketAmount) !== Boolean(response.ticketCurrency)) {
    context.addIssue({code: "custom", path: ["ticketCurrency"], message: "a ticket needs its amount and its currency"});
  }
  if (response.pricingBasis && !response.pricingMin) {
    context.addIssue({code: "custom", path: ["pricingMin"], message: "a pricing basis needs at least the lower bound"});
  }
  if (response.pricingMin && response.pricingMax
    && new Decimal(response.pricingMax).lessThan(response.pricingMin)) {
    context.addIssue({code: "custom", path: ["pricingMax"], message: "the pricing range is inverted"});
  }
  if (response.responseState === "no_response_yet"
    && (response.note || response.ticketAmount || response.tenorMonths || response.pricingMin
      || response.requestedConditions.length > 0 || response.termObjections.length > 0)) {
    context.addIssue({code: "custom", path: ["responseState"], message: "silence carries no content"});
  }
  if (response.responseState === "declined" && !response.note && response.termObjections.length === 0) {
    context.addIssue({code: "custom", path: ["responseState"], message: "a decline states a reason or an objection"});
  }
});
export type DistributionResponse = z.infer<typeof distributionResponseSchema>;

/** A correction names the answer it replaces; only the unsuperseded answers stand. */
export function activeDistributionResponses(
  rawResponses: readonly DistributionResponse[],
): DistributionResponse[] {
  const responses = rawResponses.map((response) => distributionResponseSchema.parse(response));
  const superseded = new Set(responses.flatMap((response) => (
    response.supersedesResponseId ? [response.supersedesResponseId] : []
  )));
  return responses
    .filter((response) => !superseded.has(response.id))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}

export type RecipientFollowUp = {
  shareId: string;
  recipientOrganizationId: string;
  responseState: DistributionResponseState;
  packRevisionId: string;
  refersToCurrentRevision: boolean;
  respondedAt: string | null;
  availableNextSteps: readonly DistributionNextStep[];
};

/**
 * The current answer per recipient. A recipient with no answer is awaiting one; a recipient whose
 * answer refers to a superseded pack revision keeps that answer bound to the revision it read.
 */
export function recipientFollowUps(input: {
  shares: ReadonlyArray<{shareId: string; recipientOrganizationId: string; packRevisionId: string}>;
  responses: readonly DistributionResponse[];
  currentPackRevisionId: string | null;
}): RecipientFollowUp[] {
  const active = activeDistributionResponses(input.responses);
  return input.shares.map((share) => {
    const answer = [...active].reverse().find((response) => response.shareId === share.shareId) ?? null;
    const responseState: DistributionResponseState = answer?.responseState ?? "no_response_yet";
    const packRevisionId = answer?.packRevisionId ?? share.packRevisionId;
    return {
      shareId: share.shareId,
      recipientOrganizationId: share.recipientOrganizationId,
      responseState,
      packRevisionId,
      refersToCurrentRevision: input.currentPackRevisionId === packRevisionId,
      respondedAt: answer?.occurredAt ?? null,
      availableNextSteps: nextStepsForResponse(responseState),
    };
  });
}

const nextStepsByState: Readonly<Record<DistributionResponseState, readonly DistributionNextStep[]>> = {
  interested: ["schedule_conversation", "prepare_information_answer"],
  needs_information: ["prepare_information_answer", "revise_structure"],
  declined: ["revise_structure", "close_without_continuation"],
  no_response_yet: ["keep_on_hold", "schedule_conversation"],
};

/** The work the issuer side may choose. No option here asserts an outcome. */
export function nextStepsForResponse(state: DistributionResponseState): readonly DistributionNextStep[] {
  return nextStepsByState[distributionResponseStateSchema.parse(state)];
}

export type FeedbackCodeTally = {code: string; count: number; shareIds: string[]};
export type TicketRange = {currency: string; min: string; max: string; count: number};
export type PricingRange = {basis: string; min: string; max: string | null; count: number};

export type DistributionFeedbackSummary = {
  version: string;
  respondedCount: number;
  awaitingCount: number;
  interestedCount: number;
  needsInformationCount: number;
  declinedCount: number;
  objectedTerms: FeedbackCodeTally[];
  requestedConditions: FeedbackCodeTally[];
  ticketRanges: TicketRange[];
  tenorMonths: {min: number; max: number; count: number} | null;
  pricingRanges: PricingRange[];
  fingerprint: string;
};

/**
 * What the structuring side needs in order to address the market in the next revision: which terms
 * were objected, which conditions were requested, and the observed ticket, tenor and pricing
 * ranges. It reports what was said and never converts it into a recommendation.
 */
export function aggregateDistributionFeedback(input: {
  shares: ReadonlyArray<{shareId: string; recipientOrganizationId: string; packRevisionId: string}>;
  responses: readonly DistributionResponse[];
}): DistributionFeedbackSummary {
  const active = activeDistributionResponses(input.responses);
  const latestByShare = new Map<string, DistributionResponse>();
  for (const response of active) latestByShare.set(response.shareId, response);
  const answers = [...latestByShare.values()];
  const spoke = answers.filter((response) => response.responseState !== "no_response_yet");

  const tally = (pick: (response: DistributionResponse) => readonly StructuredFeedbackEntry[]) => {
    const groups = new Map<string, Set<string>>();
    for (const response of answers) {
      for (const entry of pick(response)) {
        groups.set(entry.code, (groups.get(entry.code) ?? new Set<string>()).add(response.shareId));
      }
    }
    return [...groups.entries()]
      .map(([code, shareIds]) => ({code, count: shareIds.size, shareIds: [...shareIds].sort()}))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
  };

  const ticketGroups = new Map<string, Decimal[]>();
  for (const response of answers) {
    if (!response.ticketAmount || !response.ticketCurrency) continue;
    ticketGroups.set(response.ticketCurrency, [
      ...(ticketGroups.get(response.ticketCurrency) ?? []),
      new Decimal(response.ticketAmount),
    ]);
  }
  const tenors = answers.flatMap((response) => (response.tenorMonths ? [response.tenorMonths] : []));
  const pricingGroups = new Map<string, {min: Decimal; max: Decimal | null; count: number}>();
  for (const response of answers) {
    if (!response.pricingBasis || !response.pricingMin) continue;
    const current = pricingGroups.get(response.pricingBasis);
    const min = new Decimal(response.pricingMin);
    const max = response.pricingMax ? new Decimal(response.pricingMax) : null;
    pricingGroups.set(response.pricingBasis, {
      min: current ? Decimal.min(current.min, min) : min,
      max: current?.max && max ? Decimal.max(current.max, max) : (current?.max ?? max),
      count: (current?.count ?? 0) + 1,
    });
  }

  const payload = {
    version: distributionResponseVersion,
    respondedCount: spoke.length,
    awaitingCount: input.shares.length - spoke.length,
    interestedCount: answers.filter((response) => response.responseState === "interested").length,
    needsInformationCount: answers.filter((response) => response.responseState === "needs_information").length,
    declinedCount: answers.filter((response) => response.responseState === "declined").length,
    objectedTerms: tally((response) => response.termObjections),
    requestedConditions: tally((response) => response.requestedConditions),
    ticketRanges: [...ticketGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amounts]) => ({
        currency,
        min: Decimal.min(...amounts).toFixed(2),
        max: Decimal.max(...amounts).toFixed(2),
        count: amounts.length,
      })),
    tenorMonths: tenors.length
      ? {min: Math.min(...tenors), max: Math.max(...tenors), count: tenors.length}
      : null,
    pricingRanges: [...pricingGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([basis, range]) => ({
        basis,
        min: range.min.toFixed(4),
        max: range.max ? range.max.toFixed(4) : null,
        count: range.count,
      })),
  };
  return {...payload, fingerprint: fingerprint(payload)};
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
