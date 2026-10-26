import {z} from "zod";
import {artifactBlockDraftSchema, freezeArtifactValue, type ArtifactBlockDraft} from "./artifact-protocol";

/**
 * Result blocks of the methods of lote 3 (fichas C24, C26, C35 and C54). Each block copies a part of
 * the packet as it is, so the SQL mappings `private.execution_result_operating_projection_blocks_v1`,
 * `private.execution_result_projection_challenge_blocks_v1`, `private.execution_result_receivables_funding_blocks_v1`
 * and `private.execution_result_quarter_update_blocks_v1` mirror them key for key; nothing is recomputed.
 * Readers return null on any unknown, missing or inconsistent block.
 */
type Json = null | boolean | number | string | readonly Json[] | {readonly [k: string]: Json};
type Status = "framed" | "partial" | "prepared_for_human_review";
type Gap = {readonly operand: string; readonly reason: string};
type Claim = {claimId: string; kind: "calculation"; value: string; unit: string | null; period: string | null; supportIds: string[]};
type Block = {blockKey: string; kind: "section" | "table"; content: Record<string, Json>; claims: Claim[]};
type BlockLike = {readonly blockKey: string; readonly kind: string; readonly content: unknown; readonly claims: unknown};

const num = z.string().regex(/^-?\d+(?:\.\d+)?$/);
const status = z.enum(["framed", "partial", "prepared_for_human_review"]);
const claim = z.strictObject({claimId: z.string(), kind: z.literal("calculation"), value: num, unit: z.string().nullable(), period: z.string().nullable(), supportIds: z.array(z.string())});
const noClaims = z.array(z.never()).length(0);
const rows = <T extends z.ZodType>(row: T) => z.strictObject({rows: z.array(row)});
const gapsContent = rows(z.strictObject({operand: z.string(), reason: z.string()}));
const exclusionsContent = z.strictObject({items: z.array(z.string())});
const pair = z.looseObject({ebitda: num, cash: num});
const week = z.looseObject({weekStart: z.string(), closing: num});
const beforeAfter = <T extends z.ZodType>(v: T) => z.looseObject({prior: v, updated: v});

function finish(drafts: Block[]): readonly ArtifactBlockDraft[] {
  const blocks = drafts.map((draft) => artifactBlockDraftSchema.parse(draft));
  if (new Set(blocks.map((b) => b.blockKey)).size !== blocks.length) throw new Error("duplicate_block_key");
  const claims = blocks.flatMap((b) => b.claims.map((c) => c.claimId));
  if (new Set(claims).size !== claims.length) throw new Error("duplicate_claim_id");
  return freezeArtifactValue(blocks);
}
/** A claim id is at most 160 characters; an id that cannot carry its prefix within that is unmappable, here and in SQL. */
const claimable = (ids: readonly string[]) => {if (ids.some((id) => id.length > 140)) throw new Error("execution_result_unmappable");};
const copy = <T>(value: T): Json => value === undefined ? null : JSON.parse(JSON.stringify(value)) as Json;
const tail = (packet: {gaps: readonly Gap[]; exclusions: readonly string[]}): Block[] => [
  {blockKey: "information-gaps", kind: "table", claims: [], content: {rows: packet.gaps.map((g) => ({operand: g.operand, reason: g.reason}))}},
  {blockKey: "exclusions", kind: "section", claims: [], content: {items: [...packet.exclusions]}},
];
const tailSpec = {
  "information-gaps": {kind: "table" as const, claims: noClaims, content: gapsContent},
  exclusions: {kind: "section" as const, claims: noClaims, content: exclusionsContent},
};

/** One reader for a fixed set of blocks: each key once, each parsed by its schema, nothing extra. */
function readBlocks<S extends Record<string, {kind: "section" | "table"; content: z.ZodType; claims: z.ZodType}>>(blocks: readonly BlockLike[], spec: S):
  {[K in keyof S]: {content: z.infer<S[K]["content"]>; claims: z.infer<S[K]["claims"]>}} | null {
  const byKey = new Map<string, BlockLike>();
  for (const b of blocks) {if (byKey.has(b.blockKey)) return null; byKey.set(b.blockKey, b);}
  const out: Record<string, unknown> = {};
  for (const [key, s] of Object.entries(spec)) {
    const b = byKey.get(key);
    if (!b || b.kind !== s.kind) return null;
    const content = s.content.safeParse(b.content), claims = s.claims.safeParse(b.claims);
    if (!content.success || !claims.success) return null;
    out[key] = {content: content.data, claims: claims.data};
    byKey.delete(key);
  }
  return byKey.size ? null : out as never;
}
/** Each claim names a row by its key and carries exactly that row's number, one claim per row. */
const claimsMatch = (claims: readonly {claimId: string; value: string}[], expected: readonly (readonly [string, string])[]) =>
  JSON.stringify(claims.map((c) => [c.claimId, c.value])) === JSON.stringify(expected);

// ---------------------------------------------------------------------------------------------
// C24, the operating projection by driver.

/** The operating projection packet as the result protocol reads it. */
export type OperatingProjectionPacketLike = {
  readonly schemaVersion: "operating-projection-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly readings: null | {
    readonly purpose: string | null; readonly calibration: unknown; readonly ledger: readonly unknown[]; readonly questions: readonly string[]; readonly openQuestions: readonly string[];
    readonly projected: null | {
      readonly base: ReadonlyArray<{readonly periodId: string; readonly ebitda: string}>;
      readonly comparisons: readonly unknown[]; readonly sensitivities: readonly unknown[]; readonly scenarios: readonly unknown[]; readonly largestCashReduction: unknown;
    };
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function operatingProjectionPacketBlocks(packet: OperatingProjectionPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "operating-projection-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, p = r?.projected ?? null, support = [packet.fingerprint];
  claimable((p?.base ?? []).map((x) => x.periodId));
  return finish([
    {blockKey: "framing", kind: "section", claims: [], content: {status: packet.status, question: packet.question, currency: packet.currency,
      purpose: r?.purpose ?? null, calibration: copy(r?.calibration ?? null), questions: copy(r?.questions ?? []), openQuestions: copy(r?.openQuestions ?? [])}},
    {blockKey: "base", kind: "table", content: {rows: copy(p?.base ?? [])},
      claims: (p?.base ?? []).map((x) => ({claimId: `ebitda:${x.periodId}`, kind: "calculation", value: x.ebitda, unit: packet.currency, period: x.periodId, supportIds: support}))},
    {blockKey: "comparisons", kind: "table", claims: [], content: {rows: copy(p?.comparisons ?? [])}},
    {blockKey: "sensitivities", kind: "table", claims: [], content: {rows: copy(p?.sensitivities ?? [])}},
    {blockKey: "scenarios", kind: "table", claims: [], content: {rows: copy(p?.scenarios ?? []), largestCashReduction: copy(p?.largestCashReduction ?? null)}},
    {blockKey: "ledger", kind: "table", claims: [], content: {rows: copy(r?.ledger ?? [])}},
    ...tail(packet),
  ]);
}

const origin = z.enum(["document", "informed", "house", "estimate"]);
const projectionEffects = z.looseObject({ebitda: num, cashAvailableForDebt: num, changeInWorkingCapital: num});
const operatingProjectionSpec = {
  framing: {kind: "section" as const, claims: noClaims, content: z.strictObject({status, question: z.string(), currency: z.string(), purpose: z.string().nullable(),
    calibration: z.looseObject({periodId: z.string(), reportedRevenue: num, modeledRevenue: num, reportedEbitda: num, modeledEbitda: num, reproduces: z.boolean(),
      reportedRevenueOrigin: origin.nullable(), reportedEbitdaOrigin: origin.nullable(), documented: z.boolean()}).nullable(),
    questions: z.array(z.enum(["volume", "pass_through", "receivable_days"])), openQuestions: z.array(z.string())})},
  base: {kind: "table" as const, claims: z.array(claim), content: rows(z.looseObject({periodId: z.string(), revenue: num, ebitda: num, margin: num.nullable(),
    changeInWorkingCapital: num, cashAvailableForDebt: num, conversion: num.nullable()}))},
  comparisons: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({versionId: z.string(), status: z.enum(["approved", "under_review"]), periodId: z.string(),
    metric: z.enum(["revenue", "ebitda"]), companyValue: num, projectedValue: num, difference: num, unitPriceEquivalent: num.nullable(), cause: z.string().nullable()}))},
  sensitivities: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({periodId: z.string(), ebitdaPerOnePercentPrice: num,
    ebitdaLossPerOnePercentInputCost: num, workingCapitalPerReceivableDay: num}))},
  scenarios: {kind: "table" as const, claims: noClaims, content: z.strictObject({
    rows: z.array(z.looseObject({id: z.string(), role: z.enum(["alternative", "informed"]), basedOn: z.string(),
      changes: z.array(z.looseObject({item: z.string(), origin: origin.nullable(), nature: z.enum(["data", "assumption"])})),
      rows: z.array(z.looseObject({periodId: z.string(), ebitda: num, margin: num.nullable(), cashAvailableForDebt: num, effects: projectionEffects}))})),
    largestCashReduction: z.looseObject({scenarioId: z.string(), periodId: z.string(), cashEffect: num, workingCapitalChangeEffect: num}).nullable()})},
  ledger: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({driver: z.string(), periodId: z.string(), origin: origin.nullable(), nature: z.enum(["data", "assumption"])}))},
  ...tailSpec,
};
export type OperatingProjectionResultBlocksView = {
  readonly framing: z.infer<typeof operatingProjectionSpec.framing.content>;
  readonly base: z.infer<typeof operatingProjectionSpec.base.content>["rows"]; readonly comparisons: z.infer<typeof operatingProjectionSpec.comparisons.content>["rows"];
  readonly sensitivities: z.infer<typeof operatingProjectionSpec.sensitivities.content>["rows"]; readonly scenarios: z.infer<typeof operatingProjectionSpec.scenarios.content>["rows"];
  readonly largestCashReduction: z.infer<typeof operatingProjectionSpec.scenarios.content>["largestCashReduction"];
  readonly ledger: z.infer<typeof operatingProjectionSpec.ledger.content>["rows"]; readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readOperatingProjectionPacketBlocks(blocks: readonly BlockLike[]): OperatingProjectionResultBlocksView | null {
  const b = readBlocks(blocks, operatingProjectionSpec);
  if (!b) return null;
  if (!claimsMatch(b.base.claims, b.base.content.rows.map((x) => [`ebitda:${x.periodId}`, x.ebitda] as const))) return null;
  return freezeArtifactValue({framing: b.framing.content, base: b.base.content.rows, comparisons: b.comparisons.content.rows, sensitivities: b.sensitivities.content.rows,
    scenarios: b.scenarios.content.rows, largestCashReduction: b.scenarios.content.largestCashReduction, ledger: b.ledger.content.rows,
    informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as OperatingProjectionResultBlocksView;
}

// ---------------------------------------------------------------------------------------------
// C26, the projection challenge.

export type ProjectionChallengePacketLike = {
  readonly schemaVersion: "projection-challenge-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly readings: null | {
    readonly gap: {readonly targetPeriodId: string; readonly ebitda: string};
    readonly assumptions: ReadonlyArray<{readonly assumptionId: string; readonly effect: {readonly ebitda: string}}>;
    readonly largestAssumptionId: string; readonly interaction: unknown; readonly unitMargin: unknown; readonly capacity: unknown; readonly receivables: unknown;
    readonly premiumMix: unknown; readonly recommendation: unknown; readonly openQuestions: readonly string[];
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function projectionChallengePacketBlocks(packet: ProjectionChallengePacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "projection-challenge-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, support = [packet.fingerprint], target = r?.gap.targetPeriodId ?? null;
  claimable([...(r?.assumptions ?? []).map((a) => a.assumptionId), ...target === null ? [] : [target]]);
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, currency: packet.currency, gap: copy(r?.gap ?? null),
      largestAssumptionId: r?.largestAssumptionId ?? null, recommendation: copy(r?.recommendation ?? null), openQuestions: copy(r?.openQuestions ?? [])},
      claims: r === null ? [] : [{claimId: `ebitda-gap:${r.gap.targetPeriodId}`, kind: "calculation", value: r.gap.ebitda, unit: packet.currency, period: r.gap.targetPeriodId, supportIds: support}]},
    {blockKey: "assumptions", kind: "table", content: {rows: copy(r?.assumptions ?? [])},
      claims: (r?.assumptions ?? []).map((a) => ({claimId: `effect:${a.assumptionId}`, kind: "calculation", value: a.effect.ebitda, unit: packet.currency, period: target, supportIds: support}))},
    {blockKey: "margin", kind: "section", claims: [], content: {interaction: copy(r?.interaction ?? null), unitMargin: copy(r?.unitMargin ?? null)}},
    {blockKey: "rulers", kind: "section", claims: [], content: {capacity: copy(r?.capacity ?? null), receivables: copy(r?.receivables ?? null), premiumMix: copy(r?.premiumMix ?? null)}},
    ...tail(packet),
  ]);
}

const challengeSpec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({status, question: z.string(), currency: z.string(),
    gap: z.looseObject({targetPeriodId: z.string(), plan: z.looseObject({ebitda: num, margin: num.nullable(), cash: num.nullable()}),
      reference: z.looseObject({ebitda: num, margin: num.nullable(), cash: num.nullable()}), ebitda: num, cash: num, planMarginFirst: num.nullable(),
      marginExpansion: num.nullable(), marginCauseStated: z.string().nullable()}).nullable(),
    largestAssumptionId: z.string().nullable(),
    recommendation: z.looseObject({kind: z.enum(["present_plan_as_upside_case", "present_plan_with_its_evidence", "plan_within_reference"]),
      baseCase: z.enum(["reference_with_documented_assumptions", "plan"]), conditions: z.array(z.string()), capacityCondition: z.string().nullable()}).nullable(),
    openQuestions: z.array(z.enum(["installed_capacity", "current_premium_share", "premium_incremental_unit_cost", "premium_sell_in_since_launch"]))})},
  assumptions: {kind: "table" as const, claims: z.array(claim), content: rows(z.looseObject({assumptionId: z.string(), label: z.string(), effect: pair, effectFromPlan: pair,
    cumulativeShareOfEbitdaGap: num.nullable(),
    drivers: z.array(z.looseObject({driver: z.string(), plan: num, reference: num, planGrowth: num.nullable(), referenceGrowth: num.nullable()})),
    ruler: z.string().nullable(), evidenceThatWouldSustain: z.array(z.string()).nullable(), evidenceStatus: z.enum(["documented", "not_presented"]).nullable()}))},
  margin: {kind: "section" as const, claims: noClaims, content: z.strictObject({interaction: z.looseObject({fromReference: pair, fromPlan: pair}).nullable(),
    unitMargin: z.looseObject({planFirst: num, planTarget: num, referenceTarget: num, planChange: num.nullable()}).nullable()})},
  rulers: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    capacity: z.looseObject({maximumQuantity: num, firstPeriodAbove: z.string().nullable(), excessAtTarget: num.nullable(), investmentInPlan: z.boolean(),
      aboveWithoutInvestment: z.boolean(), source: z.string().nullable()}).nullable(),
    receivables: z.looseObject({planDays: num, cashPerDay: num, requestedDays: num.nullable(), cashAtRequestedDays: num.nullable()}).nullable(),
    premiumMix: z.looseObject({premiumOverAverage: num, shareNeededAtTarget: num, sharePerPeriod: num}).nullable()})},
  ...tailSpec,
};
export type ProjectionChallengeResultBlocksView = {
  readonly framing: z.infer<typeof challengeSpec.framing.content>; readonly assumptions: z.infer<typeof challengeSpec.assumptions.content>["rows"];
  readonly margin: z.infer<typeof challengeSpec.margin.content>; readonly rulers: z.infer<typeof challengeSpec.rulers.content>;
  readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readProjectionChallengePacketBlocks(blocks: readonly BlockLike[]): ProjectionChallengeResultBlocksView | null {
  const b = readBlocks(blocks, challengeSpec);
  if (!b) return null;
  const gap = b.framing.content.gap;
  if (!claimsMatch(b.framing.claims, gap === null ? [] : [[`ebitda-gap:${gap.targetPeriodId}`, gap.ebitda]])) return null;
  if (!claimsMatch(b.assumptions.claims, b.assumptions.content.rows.map((a) => [`effect:${a.assumptionId}`, a.effect.ebitda] as const))) return null;
  return freezeArtifactValue({framing: b.framing.content, assumptions: b.assumptions.content.rows, margin: b.margin.content, rulers: b.rulers.content,
    informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as ProjectionChallengeResultBlocksView;
}

// ---------------------------------------------------------------------------------------------
// C35, receivables turned into working capital.

export type ReceivablesFundingPacketLike = {
  readonly schemaVersion: "receivables-funding-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly result: {readonly funding: null | {
    readonly referenceDate: string; readonly need: unknown;
    readonly portfolio: {readonly items: readonly unknown[]};
    readonly options: ReadonlyArray<{readonly id: string; readonly label: string}>;
  }};
  readonly readings: null | {
    readonly gross: string; readonly assignable: string; readonly assignableShare: string; readonly planCoversPeak: boolean; readonly bankLineReserve: string | null;
    readonly startBy: string | null; readonly slackDays: number | null; readonly conditionsPrecedent: readonly unknown[]; readonly dedicatedVehicle: unknown; readonly process: unknown;
    readonly options: ReadonlyArray<{readonly id: string; readonly cost: string}>;
    readonly plan: readonly unknown[]; readonly releases: readonly unknown[]; readonly questions: readonly unknown[];
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function receivablesFundingPacketBlocks(packet: ReceivablesFundingPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "receivables-funding-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, f = packet.result.funding, support = [packet.fingerprint], day = f?.referenceDate ?? null;
  const labels = new Map((f?.options ?? []).map((o) => [o.id, o.label]));
  claimable([...(r?.options ?? []).map((o) => o.id)]);
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, currency: packet.currency, referenceDate: day, need: copy(f?.need ?? null),
      gross: r?.gross ?? null, assignable: r?.assignable ?? null, assignableShare: r?.assignableShare ?? null, planCoversPeak: r?.planCoversPeak ?? null,
      bankLineReserve: r?.bankLineReserve ?? null, startBy: r?.startBy ?? null, slackDays: r?.slackDays ?? null, conditionsPrecedent: copy(r?.conditionsPrecedent ?? []),
      dedicatedVehicle: copy(r?.dedicatedVehicle ?? null), process: copy(r?.process ?? null)},
      claims: r === null ? [] : [{claimId: "assignable", kind: "calculation", value: r.assignable, unit: packet.currency, period: day, supportIds: support}]},
    {blockKey: "portfolio", kind: "table", claims: [], content: {rows: copy(f?.portfolio.items ?? [])}},
    {blockKey: "options", kind: "table", content: {rows: (r?.options ?? []).map((o) => ({...copy(o) as Record<string, Json>, label: labels.get(o.id) ?? null}))},
      claims: (r?.options ?? []).map((o) => ({claimId: `cost:${o.id}`, kind: "calculation", value: o.cost, unit: packet.currency, period: day, supportIds: support}))},
    {blockKey: "plan", kind: "table", claims: [], content: {rows: copy(r?.plan ?? [])}},
    {blockKey: "releases", kind: "table", claims: [], content: {rows: copy(r?.releases ?? [])}},
    {blockKey: "questions", kind: "table", claims: [], content: {rows: copy(r?.questions ?? [])}},
    ...tail(packet),
  ]);
}

const fundingSpec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({status, question: z.string(), currency: z.string(), referenceDate: z.string().nullable(),
    need: z.looseObject({average: num, peak: num, startDate: z.string(), calendarDays: z.number(), businessDays: z.number(), profile: z.enum(["seasonal", "structural"])}).nullable(),
    gross: num.nullable(), assignable: num.nullable(), assignableShare: num.nullable(), planCoversPeak: z.boolean().nullable(), bankLineReserve: z.string().nullable(),
    startBy: z.string().nullable(), slackDays: z.number().nullable(), conditionsPrecedent: z.array(z.looseObject({code: z.enum(["duplicata_registration", "other"]), amount: num})),
    dedicatedVehicle: z.looseObject({monthlyAssignable: num, reading: z.enum(["not_for_seasonal_need", "worth_studying", "below_threshold", "borderline"])}).nullable(),
    process: z.looseObject({buyers: z.literal("several_in_parallel"), buyersNamed: z.literal(false), buyersContacted: z.literal(false), approvalPromised: z.literal(false)}).nullable()})},
  portfolio: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({itemId: z.string(), label: z.string(), amount: num, assignable: num, excluded: num,
    reasons: z.array(z.string()), encumbranceHolder: z.string().nullable(), releaseEvent: z.string().nullable()}))},
  options: {kind: "table" as const, claims: z.array(claim), content: rows(z.looseObject({id: z.string(), label: z.string().nullable(),
    kind: z.enum(["anchor_program", "fidc", "bank_discount", "bank_line"]), volume: num.nullable(), volumeVerified: z.boolean(), cost: num, differenceToBankLine: num.nullable(),
    annualEffective: num, spreadOverDi: num, iofApplies: z.boolean(), balanceSheet: z.enum(["derecognized", "tends_to_remain_as_liability", "liability"]), measuredDebtAdded: num,
    lien: z.enum(["not_a_guarantee_confirm_with_counsel", "uses_basket", "uses_basket_if_collateralized", "none"]), coversAverage: z.boolean().nullable()}))},
  plan: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({optionId: z.string(), capacity: num, amount: num, cumulative: num}))},
  releases: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({itemId: z.string(), amount: num, releaseEvent: z.string(), assignableAfterRelease: num, verified: z.boolean()}))},
  questions: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({code: z.enum(["anchor_program_of_restricted_debtor", "anchor_program_terms", "duplicata_registration_capability"]),
    itemId: z.string().nullable(), amount: num}))},
  ...tailSpec,
};
export type ReceivablesFundingResultBlocksView = {
  readonly framing: z.infer<typeof fundingSpec.framing.content>; readonly portfolio: z.infer<typeof fundingSpec.portfolio.content>["rows"];
  readonly options: z.infer<typeof fundingSpec.options.content>["rows"]; readonly plan: z.infer<typeof fundingSpec.plan.content>["rows"];
  readonly releases: z.infer<typeof fundingSpec.releases.content>["rows"]; readonly questions: z.infer<typeof fundingSpec.questions.content>["rows"];
  readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readReceivablesFundingPacketBlocks(blocks: readonly BlockLike[]): ReceivablesFundingResultBlocksView | null {
  const b = readBlocks(blocks, fundingSpec);
  if (!b) return null;
  const assignable = b.framing.content.assignable;
  if (!claimsMatch(b.framing.claims, assignable === null ? [] : [["assignable", assignable]])) return null;
  if (!claimsMatch(b.options.claims, b.options.content.rows.map((o) => [`cost:${o.id}`, o.cost] as const))) return null;
  return freezeArtifactValue({framing: b.framing.content, portfolio: b.portfolio.content.rows, options: b.options.content.rows, plan: b.plan.content.rows,
    releases: b.releases.content.rows, questions: b.questions.content.rows, informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as ReceivablesFundingResultBlocksView;
}

// ---------------------------------------------------------------------------------------------
// C54, the quarter close carried forward.

export type QuarterUpdatePacketLike = {
  readonly schemaVersion: "quarter-update-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly result: {readonly update: null | {
    readonly quarterStart: string; readonly quarterEnd: string; readonly lines: readonly unknown[];
    readonly action: {readonly steps: readonly unknown[]}; readonly dependents: readonly unknown[];
  }};
  readonly readings: null | {
    readonly tightestWeek: {readonly updated: {readonly weekStart: string; readonly closing: string}};
    readonly shortfallToMinimum: unknown; readonly closingAtHorizon: unknown; readonly topUp: unknown; readonly projectedEbitda: unknown; readonly decisionsChanged: readonly string[];
    readonly materiality: unknown; readonly priorVersionsKept: boolean; readonly sentToThirdParties: boolean;
    readonly bridges: readonly unknown[]; readonly persisting: readonly unknown[]; readonly oneOff: readonly string[]; readonly balanceShiftsCarriedOnce: readonly unknown[];
    readonly action: {readonly withinApproved: boolean; readonly covers: boolean | null; readonly minimumAfter: unknown};
    readonly covenant: unknown; readonly ownedElsewhere: readonly unknown[]; readonly openQuestions: readonly unknown[];
  };
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function quarterUpdatePacketBlocks(packet: QuarterUpdatePacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "quarter-update-packet.v1") throw new Error("execution_result_unmappable");
  const r = packet.readings, u = packet.result.update, tight = r?.tightestWeek.updated ?? null;
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, currency: packet.currency,
      quarterStart: u?.quarterStart ?? null, quarterEnd: u?.quarterEnd ?? null, tightestWeek: copy(r?.tightestWeek ?? null), shortfallToMinimum: copy(r?.shortfallToMinimum ?? null),
      closingAtHorizon: copy(r?.closingAtHorizon ?? null), topUp: copy(r?.topUp ?? null), projectedEbitda: copy(r?.projectedEbitda ?? null),
      decisionsChanged: copy(r?.decisionsChanged ?? []), materiality: copy(r?.materiality ?? null), priorVersionsKept: r?.priorVersionsKept ?? null,
      sentToThirdParties: r?.sentToThirdParties ?? null},
      claims: tight === null ? [] : [{claimId: "tightest-week", kind: "calculation", value: tight.closing, unit: packet.currency, period: tight.weekStart, supportIds: [packet.fingerprint]}]},
    {blockKey: "lines", kind: "table", claims: [], content: {rows: copy(u?.lines ?? [])}},
    {blockKey: "bridges", kind: "table", claims: [], content: {rows: copy(r?.bridges ?? [])}},
    {blockKey: "persisting", kind: "table", claims: [], content: {rows: copy(r?.persisting ?? []), oneOff: copy(r?.oneOff ?? []), balanceShiftsCarriedOnce: copy(r?.balanceShiftsCarriedOnce ?? [])}},
    {blockKey: "action", kind: "section", claims: [], content: {steps: copy(u?.action.steps ?? []), withinApproved: r?.action.withinApproved ?? null, covers: r?.action.covers ?? null,
      minimumAfter: copy(r?.action.minimumAfter ?? null)}},
    {blockKey: "covenant", kind: "section", claims: [], content: {covenant: copy(r?.covenant ?? null)}},
    {blockKey: "dependents", kind: "table", claims: [], content: {rows: copy(u?.dependents ?? []), ownedElsewhere: copy(r?.ownedElsewhere ?? [])}},
    {blockKey: "open-questions", kind: "table", claims: [], content: {rows: copy(r?.openQuestions ?? [])}},
    ...tail(packet),
  ]);
}

const quarterSpec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({status, question: z.string(), currency: z.string(),
    quarterStart: z.string().nullable(), quarterEnd: z.string().nullable(), tightestWeek: beforeAfter(week).nullable(), shortfallToMinimum: beforeAfter(num).nullable(),
    closingAtHorizon: beforeAfter(num).nullable(),
    topUp: z.looseObject({facilityId: z.string(), limit: num, needExceedsLimit: z.boolean(), fullLimitMinimum: week, fullLimitCovers: z.boolean()}).nullable(),
    projectedEbitda: beforeAfter(num).nullable(), decisionsChanged: z.array(z.enum(["short_term_financing", "covenant_headroom", "third_party_material"])),
    materiality: z.looseObject({absolute: num, relative: num}).nullable(), priorVersionsKept: z.boolean().nullable(), sentToThirdParties: z.boolean().nullable()})},
  lines: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), label: z.string(), unit: z.enum(["currency", "days", "ratio"]), projected: num, actual: num, deviation: num}))},
  bridges: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({lineId: z.string(), deviation: num, residual: num,
    causes: z.array(z.looseObject({id: z.string(), label: z.string(), amount: num, classification: z.enum(["calendar", "structural"]), until: z.string().nullable()}))}))},
  persisting: {kind: "table" as const, claims: noClaims, content: z.strictObject({
    rows: z.array(z.looseObject({causeId: z.string(), until: z.string(), nature: z.enum(["flow", "balance"]), weeklyEffect: num.nullable(), materialityFloor: num, ebitdaAhead: num, cashAhead: num})),
    oneOff: z.array(z.string()), balanceShiftsCarriedOnce: z.array(z.looseObject({causeId: z.string(), amount: num}))})},
  action: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    steps: z.array(z.looseObject({facilityId: z.string(), mode: z.enum(["fixed", "residual"]), amount: num, limit: num, withinLimit: z.boolean(), source: z.string(), minimum: week, covers: z.boolean()})),
    withinApproved: z.boolean().nullable(), covers: z.boolean().nullable(), minimumAfter: week.nullable()})},
  covenant: {kind: "section" as const, claims: noClaims, content: z.strictObject({covenant: z.looseObject({
    measurements: z.array(z.looseObject({measurementId: z.string(), definitionRead: z.string(), ratio: beforeAfter(num.nullable()), trailingEbitda: beforeAfter(num)})),
    headroom: z.array(z.looseObject({measurementId: z.string(), definitionRead: z.string(), limitId: z.string(), kind: z.enum(["contractual", "board_policy"]),
      limitDefinition: z.string().nullable(), ebitdaHeadroom: beforeAfter(num), breached: z.boolean()})),
    anyBreach: z.boolean(), notUpdated: z.array(z.string())}).nullable()})},
  dependents: {kind: "table" as const, claims: noClaims, content: z.strictObject({
    rows: z.array(z.looseObject({id: z.string(), label: z.string(), kind: z.enum(["analysis", "plan", "material"]), status: z.enum(["updated", "affected_not_recomputed", "stale", "unchanged"]),
      owner: z.string().nullable()})),
    ownedElsewhere: z.array(z.looseObject({dependentId: z.string(), owner: z.string().nullable()}))})},
  "open-questions": {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({causeId: z.string(), question: z.string()}))},
  ...tailSpec,
};
export type QuarterUpdateResultBlocksView = {
  readonly framing: z.infer<typeof quarterSpec.framing.content>; readonly lines: z.infer<typeof quarterSpec.lines.content>["rows"];
  readonly bridges: z.infer<typeof quarterSpec.bridges.content>["rows"]; readonly persisting: z.infer<typeof quarterSpec.persisting.content>;
  readonly action: z.infer<typeof quarterSpec.action.content>; readonly covenant: z.infer<typeof quarterSpec.covenant.content>["covenant"];
  readonly dependents: z.infer<typeof quarterSpec.dependents.content>; readonly openQuestions: z.infer<typeof quarterSpec["open-questions"]["content"]>["rows"];
  readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readQuarterUpdatePacketBlocks(blocks: readonly BlockLike[]): QuarterUpdateResultBlocksView | null {
  const b = readBlocks(blocks, quarterSpec);
  if (!b) return null;
  const tight = b.framing.content.tightestWeek?.updated ?? null;
  const expected = tight === null ? [] : [`tightest-week:${tight.closing}:${tight.weekStart}`];
  if (JSON.stringify(b.framing.claims.map((c) => `${c.claimId}:${c.value}:${c.period}`)) !== JSON.stringify(expected)) return null;
  return freezeArtifactValue({framing: b.framing.content, lines: b.lines.content.rows, bridges: b.bridges.content.rows, persisting: b.persisting.content,
    action: b.action.content, covenant: b.covenant.content.covenant, dependents: b.dependents.content, openQuestions: b["open-questions"].content.rows,
    informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as QuarterUpdateResultBlocksView;
}
