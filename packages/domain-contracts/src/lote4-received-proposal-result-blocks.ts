import {z} from "zod";
import {artifactBlockDraftSchema, freezeArtifactValue, type ArtifactBlockDraft} from "./artifact-protocol";

/**
 * Result blocks of the received proposal method of lote 4 (ficha C01, evaluate-received-proposal). Each block
 * copies a part of the packet as it is, so the SQL mapping `private.execution_result_received_proposal_blocks_v1`
 * mirrors it key for key; nothing is recomputed. The reader returns null on any unknown, missing or
 * inconsistent block.
 */
type Json = null | boolean | number | string | readonly Json[] | {readonly [k: string]: Json};
type Status = "framed" | "partial" | "prepared_for_human_review";
type Gap = {readonly operand: string; readonly reason: string};
type Claim = {claimId: string; kind: "calculation"; value: string; unit: string | null; period: string | null; supportIds: string[]};
type Block = {blockKey: string; kind: "section" | "table"; content: Record<string, Json>; claims: Claim[]};
type BlockLike = {readonly blockKey: string; readonly kind: string; readonly content: unknown; readonly claims: unknown};

const num = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const status = z.enum(["framed", "partial", "prepared_for_human_review"]);
const claim = z.strictObject({claimId: z.string(), kind: z.literal("calculation"), value: num, unit: z.string().nullable(), period: z.string().nullable(), supportIds: z.array(z.string())});
const noClaims = z.array(z.never()).length(0);
const rows = <T extends z.ZodType>(row: T) => z.strictObject({rows: z.array(row)});
const copy = <T>(value: T): Json => value === undefined ? null : JSON.parse(JSON.stringify(value)) as Json;

function finish(drafts: Block[]): readonly ArtifactBlockDraft[] {
  const blocks = drafts.map((draft) => artifactBlockDraftSchema.parse(draft));
  if (new Set(blocks.map((b) => b.blockKey)).size !== blocks.length) throw new Error("duplicate_block_key");
  const claims = blocks.flatMap((b) => b.claims.map((c) => c.claimId));
  if (new Set(claims).size !== claims.length) throw new Error("duplicate_claim_id");
  return freezeArtifactValue(blocks);
}
/** A claim id is at most 160 characters; an id that cannot carry its prefix within that is unmappable, here and in SQL. */
const claimable = (ids: readonly string[]) => {if (ids.some((id) => id.length > 140)) throw new Error("execution_result_unmappable");};

/** The received proposal packet as the result protocol reads it. */
export type ReceivedProposalPacketLike = {
  readonly schemaVersion: "received-proposal-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly openQuestions: readonly string[];
  readonly result: {readonly evaluation: null | {
    readonly proposal: {readonly lender: string};
    readonly calendar: {readonly years: readonly unknown[]};
    readonly fit: {readonly uses: ReadonlyArray<{readonly id: string; readonly label: string; readonly kind: string}>};
    readonly collateral: {readonly coverageReference: unknown; readonly portfolio: {readonly buckets: ReadonlyArray<{readonly id: string; readonly label: string}>}};
    readonly price: {readonly market: unknown; readonly history: null | {readonly peer: string; readonly peerDate: string; readonly steps: readonly unknown[]}};
    readonly alternatives: ReadonlyArray<{readonly id: string; readonly label: string; readonly allInSpread: string | null; readonly collateral: string; readonly monthsToMoney: unknown}>;
  }};
  readonly readings: null | {
    readonly firmness: unknown;
    readonly liquidity: {readonly peakYear: number; readonly totalService: string};
    readonly fit: {readonly seasonalShare: string; readonly weightedAverageLifeYears: string; readonly finalPaymentDate: string; readonly uses: ReadonlyArray<{readonly id: string}>};
    readonly covenant: {readonly rows: readonly unknown[]; readonly testsPerYear: unknown; readonly anyBreachWith: boolean | null; readonly missingTests: readonly unknown[];
      readonly untestedLimits: readonly string[]; readonly lenderDatesBeforeDraw: readonly string[]};
    readonly collateral: {readonly excluded: ReadonlyArray<{readonly id: string}>};
    readonly negativePledge: unknown;
    readonly price: {readonly equivalentSpread: string; readonly equivalentSpreadNet: string | null};
    readonly asks: ReadonlyArray<{readonly id: string; readonly peakYearServiceDelta: string}>;
    readonly alternatives: ReadonlyArray<{readonly id: string}>;
    readonly assessment: {readonly facts: readonly string[]; readonly readings: readonly string[]; readonly recommendations: readonly string[]; readonly wouldChange: readonly string[]};
    readonly questions: readonly string[];
    readonly process: unknown;
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function receivedProposalPacketBlocks(packet: ReceivedProposalPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "received-proposal-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, e = packet.result.evaluation, support = [packet.fingerprint];
  const useLabels = new Map((e?.fit.uses ?? []).map((u) => [u.id, u.label]));
  const bucketLabels = new Map((e?.collateral.portfolio.buckets ?? []).map((b) => [b.id, b.label]));
  const alternatives = new Map((e?.alternatives ?? []).map((a) => [a.id, a]));
  claimable((r?.asks ?? []).map((a) => a.id));
  const peak = r === null ? null : String(r.liquidity.peakYear);
  return finish([
    {blockKey: "framing", kind: "section", claims: [], content: {status: packet.status, question: packet.question, currency: packet.currency, lender: e?.proposal.lender ?? null,
      firmness: copy(r?.firmness ?? null), openQuestions: copy(packet.openQuestions), process: copy(r?.process ?? null)}},
    {blockKey: "liquidity", kind: "section", content: {peak: copy(r?.liquidity ?? null), years: copy(e?.calendar.years ?? [])},
      claims: r === null ? [] : [{claimId: `service:${peak}`, kind: "calculation", value: r.liquidity.totalService, unit: packet.currency, period: peak, supportIds: support}]},
    {blockKey: "fit", kind: "section", claims: [], content: {seasonalShare: r?.fit.seasonalShare ?? null, weightedAverageLifeYears: r?.fit.weightedAverageLifeYears ?? null,
      finalPaymentDate: r?.fit.finalPaymentDate ?? null, uses: (r?.fit.uses ?? []).map((u) => ({...copy(u) as Record<string, Json>, label: useLabels.get(u.id) ?? null}))}},
    {blockKey: "covenant", kind: "table", claims: [], content: {rows: copy(r?.covenant.rows ?? []), testsPerYear: copy(r?.covenant.testsPerYear ?? null),
      anyBreachWith: r?.covenant.anyBreachWith ?? null, missingTests: copy(r?.covenant.missingTests ?? []), untestedLimits: copy(r?.covenant.untestedLimits ?? []),
      lenderDatesBeforeDraw: copy(r?.covenant.lenderDatesBeforeDraw ?? [])}},
    {blockKey: "collateral", kind: "section", claims: [], content: {collateral: r === null ? null : {...copy(r.collateral) as Record<string, Json>,
      excluded: r.collateral.excluded.map((x) => ({...copy(x) as Record<string, Json>, label: bucketLabels.get(x.id) ?? null}))},
      reference: copy(e?.collateral.coverageReference ?? null), negativePledge: copy(r?.negativePledge ?? null)}},
    {blockKey: "price", kind: "section", content: {price: copy(r?.price ?? null), market: copy(e?.price.market ?? null),
      history: e?.price.history ? {peer: e.price.history.peer, peerDate: e.price.history.peerDate, steps: copy(e.price.history.steps)} : null},
      claims: r === null ? [] : [{claimId: "equivalent-spread", kind: "calculation", value: r.price.equivalentSpread, unit: "ratio", period: null, supportIds: support},
        ...r.price.equivalentSpreadNet === null ? [] : [{claimId: "equivalent-spread-net", kind: "calculation" as const, value: r.price.equivalentSpreadNet, unit: "ratio", period: null, supportIds: support}]]},
    {blockKey: "asks", kind: "table", content: {rows: copy(r?.asks ?? [])},
      claims: (r?.asks ?? []).map((a) => ({claimId: `ask-service:${a.id}`, kind: "calculation", value: a.peakYearServiceDelta, unit: packet.currency, period: peak, supportIds: support}))},
    {blockKey: "alternatives", kind: "table", claims: [], content: {rows: (r?.alternatives ?? []).map((a) => {const x = alternatives.get(a.id);
      return {...copy(a) as Record<string, Json>, label: x?.label ?? null, allInSpread: x?.allInSpread ?? null, collateral: x?.collateral ?? null, monthsToMoney: copy(x?.monthsToMoney ?? null)};})}},
    {blockKey: "assessment", kind: "section", claims: [], content: {facts: copy(r?.assessment.facts ?? []), readings: copy(r?.assessment.readings ?? []),
      recommendations: copy(r?.assessment.recommendations ?? []), wouldChange: copy(r?.assessment.wouldChange ?? []), questions: copy(r?.questions ?? [])}},
    {blockKey: "information-gaps", kind: "table", claims: [], content: {rows: packet.gaps.map((g) => ({operand: g.operand, reason: g.reason}))}},
    {blockKey: "exclusions", kind: "section", claims: [], content: {items: [...packet.exclusions]}},
  ]);
}

const limitId = z.enum(["indenture", "proposal", "board-policy"]);
const netConvention = z.enum(["full_deductibility_simplified", "not_all_periods_taxable", "life_beyond_fiscal_calendar", "no_deduction_presumido", "regime_unknown"]);
const spec = {
  framing: {kind: "section" as const, claims: noClaims, content: z.strictObject({status, question: z.string(), currency: z.string(), lender: z.string().nullable(),
    firmness: z.looseObject({firmness: z.enum(["indicative", "committed"]), validUntil: date, bankSawIndenture: z.boolean(), diligenceMayReopenStructure: z.boolean()}).nullable(),
    openQuestions: z.array(z.enum(["indexer_confirmation"])),
    process: z.looseObject({acceptsProposal: z.literal(false), contactsLender: z.literal(false), counterproposalSent: z.literal(false)}).nullable()})},
  liquidity: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({
    peak: z.looseObject({peakYear: z.number().int(), existingService: num, proposalService: num, totalService: num, availableForService: num, peakQuarter: date,
      minimumCashWith: z.looseObject({periodEnd: date, amount: num}), firstBelowPolicyWith: date.nullable(), firstBelowPolicyWithout: date.nullable()}).nullable(),
    years: z.array(z.looseObject({year: z.number().int(), existingService: num, proposalService: num, totalService: num, availableForService: num, shortfallWithout: num, shortfallWith: num}))})},
  fit: {kind: "section" as const, claims: noClaims, content: z.strictObject({seasonalShare: num.nullable(), weightedAverageLifeYears: num.nullable(), finalPaymentDate: date.nullable(),
    uses: z.array(z.looseObject({id: z.string(), label: z.string().nullable(), amount: num, reading: z.enum(["longer_than_use", "shorter_than_use", "within_use"])}))})},
  covenant: {kind: "table" as const, claims: noClaims, content: z.strictObject({
    rows: z.array(z.looseObject({date, scenario: z.string(), ratioWith: num.nullable(),
      headroom: z.array(z.looseObject({limitId, testedOnDate: z.boolean(), headroomWith: num.nullable(), breachedWith: z.boolean()}))})),
    testsPerYear: z.looseObject({indenture: z.number().int(), lender: z.number().int()}).nullable(), anyBreachWith: z.boolean().nullable(),
    missingTests: z.array(z.looseObject({date, scenario: z.string()})), untestedLimits: z.array(limitId), lenderDatesBeforeDraw: z.array(date)})},
  collateral: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    collateral: z.looseObject({required: num, nominallyFree: num, assignable: num, shortfallToAssignable: num.nullable(), assignableLeftAfter: num.nullable(), seasonalPeak: num.nullable(),
      excluded: z.array(z.looseObject({id: z.string(), label: z.string().nullable(), amount: num, holder: z.string().nullable(),
        reasons: z.array(z.enum(["assigned_to_other_creditor", "assignment_prohibited_without_debtor_consent", "past_due"]))})), coverage: num, restrictedAccount: z.boolean()}).nullable(),
    reference: z.looseObject({low: num, high: num, atOrAboveTop: z.boolean()}).nullable(),
    negativePledge: z.looseObject({basis: z.enum(["aggregate", "per_operation"]), limit: num, occupied: num, remaining: num, consentRequired: z.boolean(), excess: num.nullable(),
      consentBy: date, needDate: date, slackDays: z.number().int()}).nullable()})},
  price: {kind: "section" as const, claims: z.array(claim).max(2), content: z.strictObject({
    price: z.looseObject({nominalSpread: num, equivalentSpread: num, equivalentSpreadNet: num.nullable(), netConvention, upfrontShare: num, creditTaxRate: num, weightedAverageLifeYears: num,
      marketPosition: z.enum(["below_range", "at_or_below_median", "above_median_within_range", "above_range"]).nullable(),
      history: z.looseObject({observedBps: num, expectedBps: num, residualBps: num.nullable()}).nullable()}).nullable(),
    market: z.looseObject({low: num, median: num, high: num, sample: z.number().int(), confidence: z.enum(["high", "moderate", "low"]), observedOn: date}).nullable(),
    history: z.strictObject({peer: z.string(), peerDate: date, steps: z.array(z.looseObject({id: z.string(), family: z.string(), bps: num}))}).nullable()})},
  asks: {kind: "table" as const, claims: z.array(claim), content: rows(z.looseObject({id: z.string(), label: z.string(), peakYearServiceDelta: num, equivalentSpreadDeltaBps: num,
    collateralDelta: num, consentStillRequired: z.boolean(), netConvention, restrictedAccount: z.boolean()}))},
  alternatives: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), label: z.string().nullable(), usesCovered: z.array(z.string()),
    allInSpread: num.nullable(), allInSpreadDifferenceBps: num.nullable(), collateral: num.nullable(), consentRequired: z.boolean(),
    monthsToMoney: z.looseObject({min: z.number().int(), max: z.number().int()}).nullable()}))},
  assessment: {kind: "section" as const, claims: noClaims, content: z.strictObject({facts: z.array(z.string()), readings: z.array(z.string()), recommendations: z.array(z.string()),
    wouldChange: z.array(z.string()), questions: z.array(z.string())})},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({operand: z.string(), reason: z.string()}))},
  exclusions: {kind: "section" as const, claims: noClaims, content: z.strictObject({items: z.array(z.string())})},
};
type Spec = typeof spec;
type Content<K extends keyof Spec> = z.infer<Spec[K]["content"]>;
export type ReceivedProposalResultBlocksView = {
  readonly framing: Content<"framing">; readonly liquidity: Content<"liquidity">; readonly fit: Content<"fit">; readonly covenant: Content<"covenant">;
  readonly collateral: Content<"collateral">; readonly price: Content<"price">; readonly asks: Content<"asks">["rows"]; readonly alternatives: Content<"alternatives">["rows"];
  readonly assessment: Content<"assessment">; readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

/** Each key once, each parsed by its schema, nothing extra, every claim the number of its row. */
export function readReceivedProposalPacketBlocks(blocks: readonly BlockLike[]): ReceivedProposalResultBlocksView | null {
  const byKey = new Map<string, BlockLike>();
  for (const b of blocks) {if (byKey.has(b.blockKey)) return null; byKey.set(b.blockKey, b);}
  const out: Record<string, {content: unknown; claims: z.infer<typeof claim>[]}> = {};
  for (const [key, s] of Object.entries(spec)) {
    const b = byKey.get(key);
    if (!b || b.kind !== s.kind) return null;
    const content = (s.content as z.ZodType).safeParse(b.content), claims = (s.claims as z.ZodType).safeParse(b.claims);
    if (!content.success || !claims.success) return null;
    out[key] = {content: content.data, claims: claims.data as z.infer<typeof claim>[]};
    byKey.delete(key);
  }
  if (byKey.size) return null;
  const match = (claims: readonly z.infer<typeof claim>[], expected: readonly (readonly [string, string, string | null])[]) =>
    JSON.stringify(claims.map((c) => [c.claimId, c.value, c.period])) === JSON.stringify(expected);
  const liquidity = out.liquidity!.content as Content<"liquidity">, price = out.price!.content as Content<"price">, asks = out.asks!.content as Content<"asks">;
  const peak = liquidity.peak === null ? null : String(liquidity.peak.peakYear);
  if (!match(out.liquidity!.claims, liquidity.peak === null ? [] : [[`service:${peak}`, liquidity.peak.totalService, peak]])) return null;
  if (!match(out.price!.claims, price.price === null ? [] : [["equivalent-spread", price.price.equivalentSpread, null],
    ...price.price.equivalentSpreadNet === null ? [] : [["equivalent-spread-net", price.price.equivalentSpreadNet, null] as const]])) return null;
  if (!match(out.asks!.claims, asks.rows.map((a) => [`ask-service:${a.id}`, a.peakYearServiceDelta, peak] as const))) return null;
  return freezeArtifactValue({framing: out.framing!.content, liquidity, fit: out.fit!.content, covenant: out.covenant!.content, collateral: out.collateral!.content, price,
    asks: asks.rows, alternatives: (out.alternatives!.content as Content<"alternatives">).rows, assessment: out.assessment!.content,
    informationGaps: (out["information-gaps"]!.content as Content<"information-gaps">).rows, exclusions: (out.exclusions!.content as Content<"exclusions">).items}) as ReceivedProposalResultBlocksView;
}
