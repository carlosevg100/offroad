import {z} from "zod";
import {artifactBlockDraftSchema, freezeArtifactValue, type ArtifactBlockDraft} from "./artifact-protocol";

/**
 * Result blocks of evaluate-financing-paths (ficha C32, lote 4). Each block copies a part of the packet as it is,
 * so the SQL mapping `private.execution_result_financing_paths_blocks_v1` mirrors it key for key; nothing is
 * recomputed. Three blocks select rows from the result without arithmetic: the closing cash of the status quo
 * and of the recommended path by period, the instrument labels the basis adopted, and the label of each
 * amortization profile. The reader returns null on any unknown, missing or inconsistent block.
 */
type Json = null | boolean | number | string | readonly Json[] | {readonly [k: string]: Json};
type Status = "framed" | "partial" | "prepared_for_human_review";
type Gap = {readonly operand: string; readonly reason: string};
type Claim = {claimId: string; kind: "calculation"; value: string; unit: string | null; period: string | null; supportIds: string[]};
type Block = {blockKey: string; kind: "section" | "table"; content: Record<string, Json>; claims: Claim[]};
type BlockLike = {readonly blockKey: string; readonly kind: string; readonly content: unknown; readonly claims: unknown};

/** The capital paths packet as the result protocol reads it. */
export type FinancingPathsPacketLike = {
  readonly schemaVersion: "capital-structure-paths-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly result: {
    readonly contributions?: ReadonlyArray<{readonly fieldPath: string; readonly value: {readonly type: string; readonly value: unknown}}>;
    readonly evaluation: null | {readonly paths: ReadonlyArray<{readonly id: string; readonly role: string;
      readonly closingAvailableByPeriod: ReadonlyArray<{readonly periodId: string; readonly closingAvailable: string}>;
      readonly amortizationTests: ReadonlyArray<{readonly instrumentId: string; readonly profileId: string; readonly label: string}>}>};
  };
  readonly readings: null | {
    readonly horizon: {readonly lastPeriodEnd: string} & Record<string, unknown>;
    readonly withoutAction: {readonly lowest: {readonly periodId: string; readonly amount: string}; readonly peakYear: {readonly year: number; readonly service: string}} & Record<string, unknown>;
    readonly recommendation: null | ({readonly pathId: string; readonly minimumCash: {readonly periodId: string; readonly amount: string}; readonly horizonFinancingCost: string;
      readonly netDebtAtHorizon: string} & Record<string, unknown>);
    readonly alternative: unknown; readonly paths: ReadonlyArray<{readonly id: string; readonly horizonFinancingCost: string}>;
    readonly amortization: ReadonlyArray<{readonly pathId: string; readonly instrumentId: string; readonly profileId: string}>;
    readonly wouldChange: unknown; readonly assessment: unknown; readonly process: unknown;
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

const num = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const status = z.enum(["framed", "partial", "prepared_for_human_review"]);
const claim = z.strictObject({claimId: z.string(), kind: z.literal("calculation"), value: num, unit: z.string().nullable(), period: z.string().nullable(), supportIds: z.array(z.string())});
const noClaims = z.array(z.never()).length(0);
const rows = <T extends z.ZodType>(row: T) => z.strictObject({rows: z.array(row)});
const gates = z.enum(["minimum_cash_base", "cash_nonnegative_stress", "indenture_base", "indenture_stress", "policy_base", "policy_stress", "basket_without_consent", "amortization_after_horizon"]);
const amountAt = z.looseObject({periodId: z.string(), amount: num});

function finish(drafts: Block[]): readonly ArtifactBlockDraft[] {
  const blocks = drafts.map((draft) => artifactBlockDraftSchema.parse(draft));
  if (new Set(blocks.map((b) => b.blockKey)).size !== blocks.length) throw new Error("duplicate_block_key");
  const claims = blocks.flatMap((b) => b.claims.map((c) => c.claimId));
  if (new Set(claims).size !== claims.length) throw new Error("duplicate_claim_id");
  return freezeArtifactValue(blocks);
}
const copy = <T>(value: T): Json => value === undefined ? null : JSON.parse(JSON.stringify(value)) as Json;
const instrumentLabel = /\.instrument\.([a-z0-9][a-z0-9-]{0,39})\.label$/;

export function financingPathsPacketBlocks(packet: FinancingPathsPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "capital-structure-paths-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, e = packet.result.evaluation, support = [packet.fingerprint], unit = packet.currency, end = r?.horizon.lastPeriodEnd ?? null;
  // A claim id is at most 160 characters; an id that cannot carry its prefix within that is unmappable, here and in SQL.
  if ((r?.paths ?? []).some((p) => p.id.length > 140)) throw new Error("execution_result_unmappable");
  const rec = r?.recommendation ?? null;
  const statusQuo = e?.paths.find((p) => p.role === "status_quo") ?? null, recommended = rec ? e?.paths.find((p) => p.id === rec.pathId) ?? null : null;
  const cash = (statusQuo?.closingAvailableByPeriod ?? []).map((x) => ({periodId: x.periodId, withoutAction: x.closingAvailable,
    recommended: recommended?.closingAvailableByPeriod.find((y) => y.periodId === x.periodId)?.closingAvailable ?? null}));
  // The instrument labels the basis adopted, in the order the composer selected them; the first reading of an id wins.
  const instruments: {id: string; label: string}[] = [];
  for (const c of packet.result.contributions ?? []) {
    const m = instrumentLabel.exec(c.fieldPath);
    if (m && c.value.type === "text" && typeof c.value.value === "string" && !instruments.some((x) => x.id === m[1])) instruments.push({id: m[1]!, label: c.value.value});
  }
  const profileLabel = (a: {pathId: string; instrumentId: string; profileId: string}) =>
    e?.paths.find((p) => p.id === a.pathId)?.amortizationTests.find((t) => t.instrumentId === a.instrumentId && t.profileId === a.profileId)?.label ?? null;
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, currency: packet.currency, horizon: copy(r?.horizon ?? null),
      withoutAction: copy(r?.withoutAction ?? null), assessment: copy(r?.assessment ?? null), process: copy(r?.process ?? null)},
      claims: r === null ? [] : [
        {claimId: "without-action-lowest", kind: "calculation", value: r.withoutAction.lowest.amount, unit, period: r.withoutAction.lowest.periodId, supportIds: support},
        {claimId: "without-action-peak-service", kind: "calculation", value: r.withoutAction.peakYear.service, unit, period: String(r.withoutAction.peakYear.year), supportIds: support}]},
    {blockKey: "recommendation", kind: "section", content: {recommendation: copy(rec), alternative: copy(r?.alternative ?? null)},
      claims: rec === null ? [] : [
        {claimId: "recommended-minimum-cash", kind: "calculation", value: rec.minimumCash.amount, unit, period: rec.minimumCash.periodId, supportIds: support},
        {claimId: "recommended-financing-cost", kind: "calculation", value: rec.horizonFinancingCost, unit, period: end, supportIds: support},
        {claimId: "recommended-net-debt", kind: "calculation", value: rec.netDebtAtHorizon, unit, period: end, supportIds: support}]},
    {blockKey: "paths", kind: "table", content: {rows: copy(r?.paths ?? [])},
      claims: (r?.paths ?? []).map((p) => ({claimId: `cost:${p.id}`, kind: "calculation", value: p.horizonFinancingCost, unit, period: end, supportIds: support}))},
    {blockKey: "cash", kind: "table", claims: [], content: {rows: cash}},
    {blockKey: "instruments", kind: "table", claims: [], content: {rows: instruments}},
    {blockKey: "amortization", kind: "table", claims: [], content: {rows: (r?.amortization ?? []).map((a) => ({...copy(a) as Record<string, Json>, label: profileLabel(a)}))}},
    {blockKey: "would-change", kind: "section", claims: [], content: {wouldChange: copy(r?.wouldChange ?? null)}},
    {blockKey: "information-gaps", kind: "table", claims: [], content: {rows: packet.gaps.map((g) => ({operand: g.operand, reason: g.reason}))}},
    {blockKey: "exclusions", kind: "section", claims: [], content: {items: [...packet.exclusions]}},
  ]);
}

const longInstrument = z.looseObject({id: z.string(), issueTarget: num, issueFloorInsideGates: num.nullable(), drawPeriodId: z.string().nullable(), termYears: num.nullable(),
  firstAmortizationYear: z.number().nullable(), lastAmortizationYear: z.number().nullable(), equivalentSpread: num.nullable(), maximumSpread: num,
  equivalentSpreadAtCondition: num.nullable(), insideGatesAtCondition: z.boolean().nullable(),
  chargesOutsideSpread: z.array(z.looseObject({id: z.string(), instrumentId: z.string(), periodEnd: z.string(), amount: num}))});
const spec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(2), content: z.strictObject({status, question: z.string(), currency: z.string(),
    horizon: z.looseObject({firstPeriodEnd: z.string(), lastPeriodEnd: z.string(), candidatePaths: z.number(), companionPaths: z.number(), minimumCash: num}).nullable(),
    withoutAction: z.looseObject({pathId: z.string(), firstBelowMinimum: z.string().nullable(), lowest: amountAt,
      peakYear: z.looseObject({year: z.number(), service: num, principal: num, interestPaid: num, availableForService: num, gap: num})}).nullable(),
    assessment: z.looseObject({facts: z.array(z.string()), readings: z.array(z.string()), recommendations: z.array(z.string()), wouldChange: z.array(z.string())}).nullable(),
    process: z.looseObject({contactsInvestors: z.literal(false), contactsLenders: z.literal(false), issuesOrSigns: z.literal(false)}).nullable()})},
  recommendation: {kind: "section" as const, claims: z.array(claim).max(3), content: z.strictObject({
    recommendation: z.looseObject({pathId: z.string(), label: z.string(), minimumCash: amountAt, horizonFinancingCost: num, netDebtAtHorizon: num,
      leverage: z.array(z.looseObject({periodId: z.string(), ratio: num})), stressWorst: z.looseObject({periodId: z.string(), ratio: num}), indentureLimit: num, policyLimit: num.nullable(),
      prepaidInstrumentIds: z.array(z.string()), ebitdaByYear: z.array(z.looseObject({year: z.number(), ebitda: num})), longInstrument: longInstrument.nullable(),
      soundingBy: z.string(), routeDecisionBy: z.string(), mustPrecede: z.looseObject({instrumentId: z.string(), date: z.string()}).nullable(), daysToMaturity: z.number().nullable()}).nullable(),
    alternative: z.looseObject({pathId: z.string(), label: z.string(), longInstrumentId: z.string(), issueTarget: num, conditions: z.array(gates), decisionBy: z.string()}).nullable()})},
  paths: {kind: "table" as const, claims: z.array(claim), content: rows(z.looseObject({id: z.string(), label: z.string(), role: z.enum(["status_quo", "candidate", "companion"]),
    rank: z.number(), eligible: z.boolean(), failedGates: z.array(gates), minimumCash: amountAt, shortfallVsPolicyMinimum: num, horizonFinancingCost: num, netDebtAtHorizon: num,
    worstLeverage: num, stressWorstLeverage: num, consentRequired: z.boolean()}))},
  cash: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({periodId: z.string(), withoutAction: num, recommended: num.nullable()}))},
  instruments: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), label: z.string()}))},
  amortization: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({pathId: z.string(), instrumentId: z.string(), profileId: z.string(), label: z.string().nullable(),
    passes: z.boolean(), firstShortfallYear: z.number().nullable(), firstYear: z.looseObject({year: z.number(), scheduledAmortization: num, availableAfterInterest: num})}))},
  "would-change": {kind: "section" as const, claims: noClaims, content: z.strictObject({wouldChange: z.looseObject({
    demand: z.looseObject({instrumentId: z.string(), issueTarget: num, issueFloorInsideGates: num}).nullable(),
    sensitivities: z.array(z.looseObject({id: z.string(), label: z.string(), recommendationHolds: z.boolean(), recommendedPathId: z.string().nullable(), failedGatesOnRecommended: z.array(gates),
      ebitdaByYear: z.array(z.looseObject({year: z.number(), ebitda: num}))}))}).nullable()})},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({operand: z.string(), reason: z.string()}))},
  exclusions: {kind: "section" as const, claims: noClaims, content: z.strictObject({items: z.array(z.string())})},
};
type Spec = typeof spec;
export type FinancingPathsResultBlocksView = {
  readonly framing: z.infer<Spec["framing"]["content"]>; readonly recommendation: z.infer<Spec["recommendation"]["content"]>["recommendation"];
  readonly alternative: z.infer<Spec["recommendation"]["content"]>["alternative"]; readonly paths: z.infer<Spec["paths"]["content"]>["rows"];
  readonly cash: z.infer<Spec["cash"]["content"]>["rows"]; readonly instruments: z.infer<Spec["instruments"]["content"]>["rows"];
  readonly amortization: z.infer<Spec["amortization"]["content"]>["rows"]; readonly wouldChange: z.infer<Spec["would-change"]["content"]>["wouldChange"];
  readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

const sameClaims = (claims: readonly {claimId: string; value: string; period: string | null}[], expected: readonly (readonly [string, string, string | null])[]) =>
  JSON.stringify(claims.map((c) => [c.claimId, c.value, c.period])) === JSON.stringify(expected);

export function readFinancingPathsPacketBlocks(blocks: readonly BlockLike[]): FinancingPathsResultBlocksView | null {
  const byKey = new Map<string, BlockLike>();
  for (const b of blocks) {if (byKey.has(b.blockKey)) return null; byKey.set(b.blockKey, b);}
  const out: Record<string, {content: unknown; claims: unknown}> = {};
  for (const [key, s] of Object.entries(spec)) {
    const b = byKey.get(key);
    if (!b || b.kind !== s.kind) return null;
    const content = s.content.safeParse(b.content), claims = s.claims.safeParse(b.claims);
    if (!content.success || !claims.success) return null;
    out[key] = {content: content.data, claims: claims.data};
    byKey.delete(key);
  }
  if (byKey.size) return null;
  const framing = out.framing!.content as z.infer<Spec["framing"]["content"]>, rec = out.recommendation!.content as z.infer<Spec["recommendation"]["content"]>;
  const paths = (out.paths!.content as z.infer<Spec["paths"]["content"]>).rows, end = framing.horizon?.lastPeriodEnd ?? null, w = framing.withoutAction;
  // Each claim carries exactly the number of the row it names, in order.
  if (!sameClaims(out.framing!.claims as Claim[], w === null ? [] : [["without-action-lowest", w.lowest.amount, w.lowest.periodId], ["without-action-peak-service", w.peakYear.service, String(w.peakYear.year)]])) return null;
  const r = rec.recommendation;
  if (!sameClaims(out.recommendation!.claims as Claim[], r === null ? [] : [["recommended-minimum-cash", r.minimumCash.amount, r.minimumCash.periodId],
    ["recommended-financing-cost", r.horizonFinancingCost, end], ["recommended-net-debt", r.netDebtAtHorizon, end]])) return null;
  if (!sameClaims(out.paths!.claims as Claim[], paths.map((p) => [`cost:${p.id}`, p.horizonFinancingCost, end] as const))) return null;
  // The recommendation names a path of the table that passes every gate.
  if (r !== null && !paths.some((p) => p.id === r.pathId && p.eligible && !p.failedGates.length)) return null;
  return freezeArtifactValue({framing, recommendation: r, alternative: rec.alternative, paths, cash: (out.cash!.content as z.infer<Spec["cash"]["content"]>).rows,
    instruments: (out.instruments!.content as z.infer<Spec["instruments"]["content"]>).rows, amortization: (out.amortization!.content as z.infer<Spec["amortization"]["content"]>).rows,
    wouldChange: (out["would-change"]!.content as z.infer<Spec["would-change"]["content"]>).wouldChange,
    informationGaps: (out["information-gaps"]!.content as z.infer<Spec["information-gaps"]["content"]>).rows,
    exclusions: (out.exclusions!.content as z.infer<Spec["exclusions"]["content"]>).items}) as FinancingPathsResultBlocksView;
}
