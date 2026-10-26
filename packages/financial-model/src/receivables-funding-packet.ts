import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedReceivablesFundingInputSchema, calculateAdoptedReceivablesFunding} from "./adopted-receivables-funding";
import {adoptedReceivablesFundingOutputSchema, receivablesFundingExclusionReasons} from "./receivables-funding-results";

export const receivablesFundingPacketVersion = "2026.10.26-v1";
const Exact = Decimal.clone({precision: 60});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);
export const receivablesFundingPacketExclusions = ["buyer_contact", "fund_selection", "credit_approval", "legal_opinion", "accounting_opinion"] as const;

/** One question about financing working capital with receivables instead of, or beside, the bank line. */
export const receivablesFundingPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("receivables-funding-packet-input.v1"),
  question: text,
  analysis: adoptedReceivablesFundingInputSchema,
});
export type ReceivablesFundingPacketInput = z.infer<typeof receivablesFundingPacketInputSchema>;

export const receivablesFundingPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("receivables-funding-packet.v1"), executorVersion: z.literal(receivablesFundingPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedReceivablesFundingInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedReceivablesFundingOutputSchema,
  /** What the answer must say, in order: how much of the gross can be sold and why the rest cannot. */
  readings: z.strictObject({
    gross: decimal, assignable: decimal, assignableShare: decimal,
    exclusions: z.array(z.strictObject({itemId: key, label: text, amount: decimal, reasons: z.array(z.enum(receivablesFundingExclusionReasons)).min(1).max(17),
      holder: text.nullable(), releaseEvent: text.nullable()})).max(32),
    /** Each option with its volume, its cost for the same amount and time, the rate converted, IOF and the effects. */
    options: z.array(z.strictObject({id: key, kind: z.enum(["anchor_program", "fidc", "bank_discount", "bank_line"]), volume: decimal.nullable(), volumeVerified: z.boolean(),
      cost: decimal, differenceToBankLine: decimal.nullable(), annualEffective: decimal, spreadOverDi: decimal, iofApplies: z.boolean(),
      balanceSheet: z.enum(["derecognized", "tends_to_remain_as_liability", "liability"]), measuredDebtAdded: decimal,
      lien: z.enum(["not_a_guarantee_confirm_with_counsel", "uses_basket", "uses_basket_if_collateralized", "none"]), coversAverage: z.boolean().nullable()})).max(8),
    /** Each step: what the option could still buy, and what it is allocated to reach the peak. */
    plan: z.array(z.strictObject({optionId: key, capacity: decimal, amount: decimal, cumulative: decimal})).max(8), planCoversPeak: z.boolean(),
    /** The bank line stays in negotiation until the first funding: it is the reserve, not the first step. */
    bankLineReserve: key.nullable(),
    startBy: z.iso.date().nullable(), slackDays: z.number().int().nullable(),
    conditionsPrecedent: z.array(z.strictObject({code: z.enum(["duplicata_registration", "other"]), amount: decimal})).max(2),
    releases: z.array(z.strictObject({itemId: key, amount: decimal, releaseEvent: text, assignableAfterRelease: decimal, verified: z.boolean()})).max(32),
    dedicatedVehicle: z.strictObject({monthlyAssignable: decimal, reading: z.enum(["not_for_seasonal_need", "worth_studying", "below_threshold", "borderline"])}),
    questions: z.array(z.strictObject({code: z.enum(["anchor_program_of_restricted_debtor", "anchor_program_terms", "duplicata_registration_capability"]),
      itemId: key.nullable(), amount: decimal})).max(65),
    /** Several buyers at once, from the same package; no buyer is named or contacted, no approval is promised. */
    process: z.strictObject({buyers: z.literal("several_in_parallel"), buyersNamed: z.literal(false), buyersContacted: z.literal(false), approvalPromised: z.literal(false)}),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(receivablesFundingPacketExclusions)).length(5)
    .refine((v) => v.join("|") === receivablesFundingPacketExclusions.join("|"), "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type ReceivablesFundingPacket = z.infer<typeof receivablesFundingPacketOutputSchema>;

/** How much of a receivables portfolio turns into cash, with whom, at what cost and in how long,
 * against the bank line: the assignable part with the reason for every exclusion, each option's
 * volume and cost for the same amount and time in use with rates converted before comparing, the
 * balance sheet and negative pledge effects, the plan from the cheapest option with the line as
 * reserve, the start date, the conditions precedent and the questions that can change the plan.
 * Deterministic; it contacts no buyer, names no fund and promises no approval. */
export function prepareReceivablesFundingPacket(raw: unknown): ReceivablesFundingPacket {
  const input = receivablesFundingPacketInputSchema.parse(raw);
  const result = adoptedReceivablesFundingOutputSchema.parse(calculateAdoptedReceivablesFunding(input.analysis));
  const f = result.funding;
  const readings = f ? {
    gross: f.portfolio.gross, assignable: f.portfolio.assignable,
    assignableShare: new Exact(f.portfolio.assignable).div(f.portfolio.gross).toDecimalPlaces(20).toFixed(),
    exclusions: f.portfolio.items.filter((i) => new Exact(i.excluded).gt(0))
      .map((i) => ({itemId: i.itemId, label: i.label, amount: i.excluded, reasons: i.reasons, holder: i.encumbranceHolder, releaseEvent: i.releaseEvent})),
    options: f.ranking.map((r) => {
      const o = f.options.find((x) => x.id === r.id)!;
      return {id: o.id, kind: o.kind, volume: o.volume, volumeVerified: o.volumeVerified, cost: o.cost.total, differenceToBankLine: r.differenceToBankLine,
        annualEffective: o.rates.annualEffective, spreadOverDi: o.rates.spreadOverDi, iofApplies: o.iofApplies, balanceSheet: o.balanceSheet,
        measuredDebtAdded: o.measuredDebtAdded, lien: o.lien, coversAverage: o.coversAverage};
    }),
    plan: f.plan.steps, planCoversPeak: f.plan.coversPeak, bankLineReserve: f.plan.reserve,
    startBy: f.timing.startBy, slackDays: f.timing.slackDays, conditionsPrecedent: f.timing.conditionsPrecedent,
    releases: f.portfolio.releases.map((r) => ({itemId: r.itemId, amount: r.amount, releaseEvent: r.releaseEvent, assignableAfterRelease: r.assignableAfterRelease, verified: r.verified})),
    dedicatedVehicle: {monthlyAssignable: f.dedicatedVehicle.monthlyAssignable, reading: f.dedicatedVehicle.reading},
    questions: f.questions,
    process: {buyers: "several_in_parallel" as const, buyersNamed: false as const, buyersContacted: false as const, approvalPromised: false as const},
  } : null;
  const prefix = `receivables_funding.${input.analysis.analysisId}.`;
  const gaps = [...result.gaps, ...(f?.gaps ?? []).map((g) => ({operand: prefix + g.item, reason: g.reason}))];
  const status = !f ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "receivables-funding-packet.v1" as const, executorVersion: receivablesFundingPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status, exclusions: [...receivablesFundingPacketExclusions],
    grantsExecution: false as const, grantsPublication: false as const};
  return receivablesFundingPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
