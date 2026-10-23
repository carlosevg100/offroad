import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedWeeklyCashInputSchema, calculateAdoptedWeeklyCash} from "./adopted-weekly-cash";
import {adoptedWeeklyCashOutputSchema} from "./ficha-calculation-results";

export const weeklyCashPacketVersion = "2026.10.23-v1";
const Exact = Decimal.clone({precision: 60});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);

/** One question about cash until a date and what falls due. Actions name the case that carries them. */
export const weeklyCashPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("weekly-cash-packet-input.v1"),
  question: text,
  analysis: adoptedWeeklyCashInputSchema,
});
export type WeeklyCashPacketInput = z.infer<typeof weeklyCashPacketInputSchema>;

export const weeklyCashPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("weekly-cash-packet.v1"), executorVersion: z.literal(weeklyCashPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedWeeklyCashInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedWeeklyCashOutputSchema,
  /** What the answer must say, in order: the week and the amount first. */
  readings: z.strictObject({
    tightestWeek: z.strictObject({weekStart: z.iso.date(), closing: decimal, belowMinimum: z.boolean()}),
    weeksBelowMinimum: z.array(z.iso.date()).max(104), shortfallToMinimum: decimal,
    causes: z.array(z.strictObject({label: text, amount: decimal})).max(3),
    closingHidesTheWeek: z.boolean(),
    /** The cheapest action whose case keeps every week at or above the minimum; null when none does. */
    cheapestCoveringAction: z.strictObject({id: key, cost: decimal, openAtCovenantTest: z.boolean().nullable()}).nullable(),
    actionsByCost: z.array(z.strictObject({id: key, cost: decimal, covers: z.boolean()})).max(8),
    sensitivities: z.array(z.strictObject({caseId: key, minimum: decimal, weekStart: z.iso.date(), weeksBelowMinimum: z.number().int().min(0).max(104)})).max(8),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(["business_day_inference", "intraday_liquidity", "receivables_assignment_eligibility", "credit_approval"])).length(4)
    .refine((v) => v.join("|") === "business_day_inference|intraday_liquidity|receivables_assignment_eligibility|credit_approval", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type WeeklyCashPacket = z.infer<typeof weeklyCashPacketOutputSchema>;

/** How cash goes week by week until a date and what falls due: the tightest week and its balance,
 * the weeks under the minimum and what makes them, that a period closing hides them, the calendar
 * of what falls due, each action costed for the time it is in use and the cheapest that covers the
 * hole, its effect on the covenant test date, and the sensitivities. Deterministic; it does not
 * certify intraday liquidity nor decide which receivables can be assigned. */
export function prepareWeeklyCashPacket(raw: unknown): WeeklyCashPacket {
  const input = weeklyCashPacketInputSchema.parse(raw);
  const result = adoptedWeeklyCashOutputSchema.parse(calculateAdoptedWeeklyCash(input.analysis));
  const w = result.weekly;
  const readings = w ? (() => {
    const informed = w.cases.find((c) => c.role === "informed")!;
    const tight = informed.rows.find((r) => r.weekStart === informed.minimum.weekStart)!;
    const covers = (caseIds: string[]) => caseIds.some((id) => w.cases.find((c) => c.id === id)!.weeksBelowMinimum.length === 0);
    const byCost = w.actions.map((a) => ({id: a.id, cost: a.cost, covers: covers(a.cases)}));
    const cheapest = w.actions.find((a) => covers(a.cases)) ?? null;
    const actionCases = new Set(w.actions.flatMap((a) => a.cases));
    return {tightestWeek: {weekStart: tight.weekStart, closing: tight.closing, belowMinimum: tight.belowMinimum},
      weeksBelowMinimum: informed.weeksBelowMinimum, shortfallToMinimum: informed.shortfallToMinimum, causes: tight.largestOutflows,
      closingHidesTheWeek: informed.weeksBelowMinimum.length > 0 && new Exact(informed.closing).gte(w.minimumCash),
      cheapestCoveringAction: cheapest === null ? null : {id: cheapest.id, cost: cheapest.cost, openAtCovenantTest: cheapest.openAtCovenantTest},
      actionsByCost: byCost,
      sensitivities: w.cases.filter((c) => c.role === "alternative" && !actionCases.has(c.id))
        .map((c) => ({caseId: c.id, minimum: c.minimum.closing, weekStart: c.minimum.weekStart, weeksBelowMinimum: c.weeksBelowMinimum.length}))};
  })() : null;
  const gaps = result.gaps;
  const status = !w ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "weekly-cash-packet.v1" as const, executorVersion: weeklyCashPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status,
    exclusions: ["business_day_inference", "intraday_liquidity", "receivables_assignment_eligibility", "credit_approval"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return weeklyCashPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
