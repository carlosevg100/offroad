import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedCovenantHeadroomInputSchema, calculateAdoptedCovenantHeadroom} from "./adopted-covenant-headroom";
import {adoptedCovenantHeadroomOutputSchema} from "./ficha-calculation-results";

export const covenantHeadroomPacketVersion = "2026.10.23-v1";
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/), decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/);

/** One question about where the company stands against its covenants. The headline test is named;
 * every other measurement is a scenario, a later date or a contrast of the same basis. */
export const covenantHeadroomPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("covenant-headroom-packet-input.v1"),
  question: text,
  headlineMeasurementId: key,
  analysis: adoptedCovenantHeadroomInputSchema,
}).superRefine((i, ctx) => {
  const m = i.analysis.measurements.find((x) => x.id === i.headlineMeasurementId);
  if (!m || m.role !== "test") ctx.addIssue({code: "custom", message: "The headline must be a test measurement of the analysis"});
});
export type CovenantHeadroomPacketInput = z.infer<typeof covenantHeadroomPacketInputSchema>;

export const covenantHeadroomPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("covenant-headroom-packet.v1"), executorVersion: z.literal(covenantHeadroomPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedCovenantHeadroomInputSchema.shape.scope, entityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedCovenantHeadroomOutputSchema,
  /** What the answer must say, in order. */
  readings: z.strictObject({
    headline: z.strictObject({measurementId: key, date: z.iso.date(), ratio: decimal.nullable(), tightestLimitId: key.nullable(),
      byLimit: z.array(z.strictObject({limitId: key, kind: z.enum(["contractual", "board_policy"]), ebitdaHeadroom: decimal, netDebtHeadroom: decimal,
        unrealizedEbitdaLossToLimit: decimal.nullable(), breached: z.boolean()})).max(6)}),
    policyBindsFirst: z.boolean(),
    worst: z.strictObject({measurementId: key, limitId: key, ebitdaHeadroom: decimal}).nullable(),
    anyBreach: z.boolean(),
    contrasts: z.array(key).max(12),
    openQuestions: z.array(key).max(6),
  }).nullable(),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(["projection", "waiver_negotiation", "credit_approval", "method_release"])).length(4)
    .refine((v) => v.join("|") === "projection|waiver_negotiation|credit_approval|method_release", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type CovenantHeadroomPacket = z.infer<typeof covenantHeadroomPacketOutputSchema>;

/** Where the company stands against its covenants: the ratio at the test date by the written
 * definition; headroom in EBITDA and in net debt against the contract and against the board's
 * own policy, whichever binds first; how much of the period still ahead can be lost; the adverse
 * case, the season at the test date and later dates; readings that are not the test, named as such;
 * what a breach triggers; and the question only the company can answer. Deterministic. */
export function prepareCovenantHeadroomPacket(raw: unknown): CovenantHeadroomPacket {
  const input = covenantHeadroomPacketInputSchema.parse(raw);
  const result = adoptedCovenantHeadroomOutputSchema.parse(calculateAdoptedCovenantHeadroom(input.analysis));
  const h = result.headroom;
  const readings = h ? (() => {
    const m = h.measurements.find((x) => x.id === input.headlineMeasurementId)!;
    const tightest = m.tests.find((t) => t.limitId === m.tightestLimitId);
    return {headline: {measurementId: m.id, date: m.date, ratio: m.ratio, tightestLimitId: m.tightestLimitId,
      byLimit: m.tests.map((t) => ({limitId: t.limitId, kind: t.kind, ebitdaHeadroom: t.ebitdaHeadroom, netDebtHeadroom: t.netDebtHeadroom,
        unrealizedEbitdaLossToLimit: t.unrealizedEbitdaLossToLimit, breached: t.breached}))},
      policyBindsFirst: tightest?.kind === "board_policy", worst: h.worst, anyBreach: h.anyBreach,
      contrasts: h.measurements.filter((x) => x.role === "contrast").map((x) => x.id),
      openQuestions: result.openQuestions.map((q) => q.limitId)};
  })() : null;
  const gaps = result.gaps;
  const status = !h ? "framed" as const : gaps.length || result.openQuestions.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "covenant-headroom-packet.v1" as const, executorVersion: covenantHeadroomPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, currency: result.currency,
    result, readings, gaps, status,
    exclusions: ["projection", "waiver_negotiation", "credit_approval", "method_release"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return covenantHeadroomPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
