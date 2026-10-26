import {z} from "zod";
import type {QuarterUpdatePrior, QuarterUpdatePriors} from "@offroad/execution-request";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const pin = z.object({role: z.enum(["weekly_cash", "covenant"]), executionId: z.uuid(), resultFingerprint: hash}).strict();
/** The prior results a quarter close card was proposed over, weekly cash first. */
const pinsSchema = z.tuple([pin.extend({role: z.literal("weekly_cash")}), pin.extend({role: z.literal("covenant")})]);
export type PriorResultPins = z.infer<typeof pinsSchema>;

/** The fingerprint of the basis a stored prior input was composed on. */
export function envelopeOf(prior: QuarterUpdatePrior): string | null {
  try { return z.object({analysis: z.object({envelope: z.object({fingerprint: z.string()}).loose()}).loose()}).loose().parse(JSON.parse(prior.inputSnapshot)).analysis.envelope.fingerprint; }
  catch { return null; }
}

/** The card pins the exact prior executions and packets it showed. Confirmation goes ahead only when the latest
 * stored priors are those same executions with those same packets (and the card's basis fingerprints agree);
 * any other prior, even one composed on the same basis, makes the card superseded and asks for a new one. It
 * never moves silently to other results. */
export function checkQuarterUpdatePins(summary: Record<string, unknown>, facts: Record<string, {value?: unknown} | undefined>, priors: QuarterUpdatePriors):
  {ok: true; pins: PriorResultPins} | {ok: false; error: "superseded"} {
  const parsed = pinsSchema.safeParse(summary.priorResults);
  if (!parsed.success || !priors.weeklyCash || !priors.covenant) return {ok: false, error: "superseded"};
  const [weekly, covenant] = parsed.data;
  if (weekly.executionId !== priors.weeklyCash.executionId || weekly.resultFingerprint !== priors.weeklyCash.resultFingerprint
    || covenant.executionId !== priors.covenant.executionId || covenant.resultFingerprint !== priors.covenant.resultFingerprint) return {ok: false, error: "superseded"};
  if (facts.priorWeeklyFingerprint?.value !== envelopeOf(priors.weeklyCash) || facts.priorCovenantFingerprint?.value !== envelopeOf(priors.covenant)) return {ok: false, error: "superseded"};
  return {ok: true, pins: parsed.data};
}
