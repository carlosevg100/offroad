import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedRelativeDebtCostInputSchema, calculateAdoptedRelativeDebtCost} from "./adopted-relative-debt-cost";
import {adoptedRelativeCostLensInputSchema, readAdoptedRelativeCostLens} from "./adopted-relative-cost-lens";
import {adoptedRelativeDebtCostOutputSchema} from "./ficha-calculation-results";

export const relativeDebtCostPacketVersion = "2026.10.19-v1";
const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});
const text = z.string().trim().min(1).max(2000), key = z.string().trim().min(1).max(160);
const decimal = z.string().regex(/^-?\d{1,24}(?:\.\d{1,20})?$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const fmt = (v: Decimal) => v.toDecimalPlaces(20).toFixed();
const leverRoles = ["rating", "refinance_existing", "other"] as const;

/** One question about why the company pays more than a peer. The bridge, the actions and the
 * committee lens read the same adopted basis; levers say what each action is for. */
export const relativeDebtCostPacketInputSchema = z.strictObject({
  schemaVersion: z.literal("relative-debt-cost-packet-input.v1"),
  question: text,
  analysis: adoptedRelativeDebtCostInputSchema,
  lens: adoptedRelativeCostLensInputSchema,
  levers: z.array(z.strictObject({actionId: z.uuid(), role: z.enum(leverRoles), label: text, scenario: z.enum(["low", "high", "single"])})).max(16),
}).superRefine((i, ctx) => {
  const a = i.analysis, l = i.lens;
  if (a.envelope.fingerprint !== l.envelope.fingerprint || a.scope.versionId !== l.scope.versionId || a.comparisonId !== l.comparisonId || a.entityId !== l.entityId
    || a.peerEntityId !== l.peerEntityId || a.scenario !== l.scenario || a.currency !== l.currency) ctx.addIssue({code: "custom", message: "The lens must read the same adopted basis and comparison"});
  for (const lever of i.levers) if (!a.actions.some((x) => x.id === lever.actionId)) ctx.addIssue({code: "custom", message: "Lever names an action the analysis does not carry"});
  if (new Set(i.levers.map((x) => x.actionId)).size !== i.levers.length) ctx.addIssue({code: "custom", message: "Duplicate lever"});
});
export type RelativeDebtCostPacketInput = z.infer<typeof relativeDebtCostPacketInputSchema>;

const lensRow = z.strictObject({id: z.uuid(), kind: z.enum(["numeric", "qualitative"]), label: text.nullable(), own: z.string().nullable(), peer: z.string().nullable(),
  definition: text.nullable(), relativeDifference: decimal.nullable(), classification: z.enum(["weighs_against", "weighs_little", "neutral", "favours"]).nullable(),
  classificationBasis: z.enum(["calculated", "adopted_judgment"])});
export const relativeDebtCostPacketOutputSchema = z.strictObject({
  schemaVersion: z.literal("relative-debt-cost-packet.v1"), executorVersion: z.literal(relativeDebtCostPacketVersion), financialCoreVersion: key,
  question: text, basisFingerprint: hash, scope: adoptedRelativeDebtCostInputSchema.shape.scope, entityId: z.uuid(), peerEntityId: z.uuid(), currency: z.string().regex(/^[A-Z]{3}$/),
  result: adoptedRelativeDebtCostOutputSchema,
  /** The gross difference stands on the two spreads alone; the rest needs every adopted adjustment. */
  decomposition: z.strictObject({grossBps: decimal, afterPricingDateBps: decimal.nullable(), structureAndMarketBps: decimal.nullable(), creditResidualBps: decimal.nullable(),
    shareNotAboutCompanyRisk: decimal.nullable(), residualReading: z.literal("under_adopted_adjustments")}).nullable(),
  lens: z.strictObject({rows: z.array(lensRow).max(24), materialityThreshold: decimal.nullable(), notDrivers: z.array(z.uuid()).max(24),
    weighsAgainst: z.array(z.uuid()).max(24),
    impliedNotches: z.strictObject({fewest: decimal, most: decimal, bpsPerNotch: z.strictObject({low: decimal, high: decimal}), peerRating: text.nullable(), readingOnly: z.literal(true)}).nullable()}),
  levers: z.array(z.strictObject({actionId: z.uuid(), role: z.enum(leverRoles), label: text, scenario: z.enum(["low", "high", "single"]),
    savings: decimal.nullable(), knownCosts: decimal.nullable(), netOfKnownCosts: decimal.nullable(), paysForItself: z.boolean().nullable()})).max(16),
  gaps: z.array(z.strictObject({operand: text, reason: text})).max(1024),
  status: z.enum(["framed", "partial", "prepared_for_human_review"]),
  exclusions: z.array(z.enum(["official_rating", "causal_credit_attribution", "guaranteed_repricing", "publication_or_contact"])).length(4)
    .refine((v) => v.join("|") === "official_rating|causal_credit_attribution|guaranteed_repricing|publication_or_contact", "Exact exclusion ledger required"),
  grantsExecution: z.literal(false), grantsPublication: z.literal(false), fingerprint: hash,
});
export type RelativeDebtCostPacket = z.infer<typeof relativeDebtCostPacketOutputSchema>;

/** Why the company pays more than a peer, in the order a board needs it: how much of the gross
 * difference is date, structure and market rather than company risk; what the committee lens
 * shows, including what is not a driver; the residual as an implied reading in rating notches;
 * and what each lever is worth against what it costs. Deterministic; it assigns no rating and
 * recommends nothing. */
export function prepareRelativeDebtCostPacket(raw: unknown): RelativeDebtCostPacket {
  const input = relativeDebtCostPacketInputSchema.parse(raw);
  const result = adoptedRelativeDebtCostOutputSchema.parse(calculateAdoptedRelativeDebtCost(input.analysis));
  const b = result.bridge as {grossBps: string; knownAdjustmentsBps: string; residualBps: string | null; afterPricingDateBps: string | null; steps: {family: string; bps: string}[]} | null;
  const lens = readAdoptedRelativeCostLens(input.lens, b?.residualBps ?? null);
  const ownSide = result.own as {spreadBps: string | null; indexer: string | null}, peerSide = result.peer as {spreadBps: string | null; indexer: string | null};
  // Without the full bridge, a gross difference is shown only for quoted spreads on the same known
  // indexer; other spreads need an adopted equivalent curve, which only the bridge establishes.
  const comparable = ownSide.indexer !== null && ownSide.indexer === peerSide.indexer;
  const own = comparable ? ownSide.spreadBps : null, peer = comparable ? peerSide.spreadBps : null;
  const decomposition = b ? {grossBps: b.grossBps, afterPricingDateBps: b.afterPricingDateBps, structureAndMarketBps: b.knownAdjustmentsBps, creditResidualBps: b.residualBps,
    shareNotAboutCompanyRisk: new Exact(b.grossBps).isZero() ? "0" : fmt(new Exact(b.knownAdjustmentsBps).div(b.grossBps)), residualReading: "under_adopted_adjustments" as const}
    : own !== null && peer !== null ? {grossBps: fmt(new Exact(own).minus(peer)), afterPricingDateBps: null, structureAndMarketBps: null, creditResidualBps: null,
      shareNotAboutCompanyRisk: null, residualReading: "under_adopted_adjustments" as const} : null;
  const levers = input.levers.map((lever) => {
    const action = (result.actions as {actionId: string; result: {nominalSavings: string; knownCosts: string; status: string} | null}[]).find((a) => a.actionId === lever.actionId)?.result ?? null;
    const net = action ? new Exact(action.nominalSavings).minus(action.knownCosts) : null;
    // Whether a lever pays is said only when its costs cover the stated horizon.
    const covered = action?.status === "stated_horizon_estimate";
    return {...lever, savings: action?.nominalSavings ?? null, knownCosts: action?.knownCosts ?? null, netOfKnownCosts: net ? fmt(net) : null, paysForItself: net && covered ? net.gt(0) : null};
  });
  const gaps = [...result.gaps, ...lens.gaps,
    ...(!b && !comparable ? [{operand: `relative_cost.${input.analysis.comparisonId}.comparability`, reason: "Spreads on different or unknown indexers are not compared without an adopted equivalent curve"}] : [])];
  const status = !b || !decomposition ? "framed" as const : gaps.length ? "partial" as const : "prepared_for_human_review" as const;
  const payload = {schemaVersion: "relative-debt-cost-packet.v1" as const, executorVersion: relativeDebtCostPacketVersion, financialCoreVersion,
    question: input.question, basisFingerprint: result.basisFingerprint, scope: result.scope, entityId: result.entityId, peerEntityId: result.peerEntityId, currency: result.currency,
    result, decomposition,
    lens: {rows: lens.rows, materialityThreshold: lens.materialityThreshold, notDrivers: lens.notDrivers,
      weighsAgainst: lens.rows.filter((r) => r.classification === "weighs_against").map((r) => r.id), impliedNotches: lens.impliedNotches},
    levers, gaps, status,
    exclusions: ["official_rating", "causal_credit_attribution", "guaranteed_repricing", "publication_or_contact"] as const,
    grantsExecution: false as const, grantsPublication: false as const};
  return relativeDebtCostPacketOutputSchema.parse({...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")});
}
