import {z} from "zod";
import {adoptedCovenantHeadroomInputSchema} from "./adopted-covenant-headroom";
import {adoptedWeeklyCashInputSchema} from "./adopted-weekly-cash";
import {composeQuarterUpdateClose} from "./quarter-update-composer";
import {quarterUpdatePacketInputSchema, type QuarterUpdatePacketInput} from "./quarter-update-packet";

const text = z.string().trim().min(1).max(2000);
const bound = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
});
/** A stored input snapshot of a prior execution, as its canonical text or already parsed. */
const stored = z.union([z.string().min(2).max(8388608).transform((t, ctx) => {
  try { return JSON.parse(t) as unknown; } catch { ctx.addIssue({code: "custom", message: "The stored prior input is not JSON"}); return z.NEVER; }
}), z.record(z.string(), z.unknown())]);
const storedWeekly = z.looseObject({schemaVersion: z.literal("weekly-cash-packet-input.v1"), analysis: adoptedWeeklyCashInputSchema});
const storedCovenant = z.looseObject({schemaVersion: z.literal("covenant-headroom-packet-input.v1"), analysis: adoptedCovenantHeadroomInputSchema});

export const storedPriorsQuarterUpdateInputSchema = z.strictObject({
  /** The close: the one working basis the execution pins. */
  update: bound,
  question: text,
  askedDependentIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)).max(24).default([]),
  /** The stored input snapshots of the prior completed weekly cash and covenant executions of the same work. */
  prior: z.strictObject({weeklyCash: stored, covenant: stored}),
});

/** Composes the quarter update packet input from the close basis and the stored inputs of the prior
 * executions. The close is composed exactly as from bases; each prior analysis is taken verbatim from its
 * stored input, never recomposed, so the database can check it byte for byte against the stored snapshot.
 * A stored input of another method refuses the composition by name. */
export function composeQuarterUpdateFromStoredPriors(raw: unknown): QuarterUpdatePacketInput {
  const input = storedPriorsQuarterUpdateInputSchema.parse(raw);
  const weekly = storedWeekly.safeParse(input.prior.weeklyCash);
  if (!weekly.success) throw new Error("quarter_update_prior_weekly_cash_invalid");
  const covenant = storedCovenant.safeParse(input.prior.covenant);
  if (!covenant.success) throw new Error("quarter_update_prior_covenant_invalid");
  const {update} = composeQuarterUpdateClose(input.update);
  // The verbatim stored analyses: the parsed objects above are only checks.
  const priorOf = (x: unknown) => (x as {analysis: unknown}).analysis;
  return quarterUpdatePacketInputSchema.parse({schemaVersion: "quarter-update-packet-input.v1", question: input.question,
    analysis: {prior: {weeklyCash: priorOf(input.prior.weeklyCash), covenant: priorOf(input.prior.covenant)}, update}, askedDependentIds: input.askedDependentIds});
}
