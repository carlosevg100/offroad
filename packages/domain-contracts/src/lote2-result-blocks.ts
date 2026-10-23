import {z} from "zod";
import {artifactBlockDraftSchema, freezeArtifactValue, type ArtifactBlockDraft} from "./artifact-protocol";

/**
 * Result blocks of the debt methods of lote 2 (fichas C10, C12 and C18). Each block copies a part of
 * the packet as it is, so the SQL mappings `private.execution_result_debt_table_blocks_v1`,
 * `private.execution_result_covenant_headroom_blocks_v1` and `private.execution_result_weekly_cash_blocks_v1`
 * mirror them key for key; nothing is recomputed. Readers return null on any unknown, missing or
 * inconsistent block.
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

function finish(drafts: Block[]): readonly ArtifactBlockDraft[] {
  const blocks = drafts.map((draft) => artifactBlockDraftSchema.parse(draft));
  if (new Set(blocks.map((b) => b.blockKey)).size !== blocks.length) throw new Error("duplicate_block_key");
  const claims = blocks.flatMap((b) => b.claims.map((c) => c.claimId));
  if (new Set(claims).size !== claims.length) throw new Error("duplicate_claim_id");
  return freezeArtifactValue(blocks);
}
/** A claim id is at most 160 characters; an id that cannot carry its prefix within that is unmappable, here and in SQL. */
const claimable = (ids: readonly string[]) => {if (ids.some((id) => id.length > 140)) throw new Error("execution_result_unmappable");};
const copy = <T>(value: T): Json => JSON.parse(JSON.stringify(value)) as Json;
const tail = (packet: {gaps: readonly Gap[]; exclusions: readonly string[]}): Block[] => [
  {blockKey: "information-gaps", kind: "table", claims: [], content: {rows: packet.gaps.map((g) => ({operand: g.operand, reason: g.reason}))}},
  {blockKey: "exclusions", kind: "section", claims: [], content: {items: [...packet.exclusions]}},
];

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

// ---------------------------------------------------------------------------------------------
// C10, the company debt table.

/** The debt table packet as the result protocol reads it. */
export type DebtTablePacketLike = {
  readonly schemaVersion: "debt-table-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly referenceDate: string;
  readonly readings: unknown;
  readonly result: {readonly table: null | {
    readonly rows: ReadonlyArray<{readonly id: string; readonly principal: string}>;
    readonly reconciliation: unknown; readonly creditLines: readonly unknown[]; readonly unusedLimits: string; readonly outsideEveryView: readonly unknown[];
    readonly views: ReadonlyArray<{readonly id: string; readonly total: string}>;
    readonly profile: unknown; readonly negativePledgeBaskets: readonly unknown[]; readonly crossDefault: unknown;
    readonly leverage: readonly unknown[]; readonly completeness: unknown; readonly categoryCoverage: readonly unknown[];
  }};
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function debtTablePacketBlocks(packet: DebtTablePacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "debt-table-packet.v1") throw new Error("execution_result_unmappable");
  const t = packet.result.table, support = [packet.fingerprint];
  claimable([...(t?.rows ?? []).map((r) => r.id), ...(t?.views ?? []).map((v) => v.id)]);
  return finish([
    {blockKey: "framing", kind: "section", claims: [], content: {status: packet.status, question: packet.question, currency: packet.currency,
      referenceDate: packet.referenceDate, readings: copy(packet.readings)}},
    {blockKey: "instruments", kind: "table", content: {rows: copy(t?.rows ?? [])},
      claims: (t?.rows ?? []).map((r) => ({claimId: `principal:${r.id}`, kind: "calculation", value: r.principal, unit: packet.currency, period: packet.referenceDate, supportIds: support}))},
    {blockKey: "views", kind: "table", content: {rows: copy(t?.views ?? [])},
      claims: (t?.views ?? []).map((v) => ({claimId: `view:${v.id}`, kind: "calculation", value: v.total, unit: packet.currency, period: packet.referenceDate, supportIds: support}))},
    {blockKey: "reconciliation", kind: "section", claims: [], content: {reconciliation: copy(t?.reconciliation ?? null), creditLines: copy(t?.creditLines ?? []),
      unusedLimits: t?.unusedLimits ?? null, outsideEveryView: copy(t?.outsideEveryView ?? [])}},
    {blockKey: "profile", kind: "section", claims: [], content: {profile: copy(t?.profile ?? null)}},
    {blockKey: "security", kind: "section", claims: [], content: {crossDefault: copy(t?.crossDefault ?? null), negativePledgeBaskets: copy(t?.negativePledgeBaskets ?? [])}},
    {blockKey: "leverage", kind: "table", claims: [], content: {rows: copy(t?.leverage ?? [])}},
    {blockKey: "completeness", kind: "section", claims: [], content: {completeness: copy(t?.completeness ?? null), categoryCoverage: copy(t?.categoryCoverage ?? [])}},
    ...tail(packet),
  ]);
}

const debtRow = z.looseObject({id: z.string(), label: z.string(), creditor: z.string(), principal: num, accountingBalance: num, indexer: z.string(),
  spread: num.nullable(), nominalRate: num.nullable(), finalPayment: z.string(), guarantee: z.string(), covenant: z.string(), prepayment: z.string(),
  crossDefault: z.looseObject({threshold: num.nullable(), acceleration: z.string()}).nullable()});
const debtTableSpec = {
  framing: {kind: "section" as const, claims: noClaims, content: z.strictObject({status, question: z.string(), currency: z.string(), referenceDate: z.string(),
    readings: z.looseObject({reconciled: z.boolean().nullable(), viewCount: z.number(), unusedLimits: num, categoriesNotExamined: z.array(z.string()),
      outsideEveryView: z.array(z.string()), basketsExceeded: z.array(z.string()), lowestCrossDefault: z.strictObject({instrumentId: z.string(), threshold: num}).nullable(),
      leverageDefinitions: z.number(), completenessRequest: z.boolean()}).nullable()})},
  instruments: {kind: "table" as const, claims: z.array(claim), content: rows(debtRow)},
  views: {kind: "table" as const, claims: z.array(claim), content: rows(z.looseObject({id: z.string(), label: z.string(), components: z.array(z.string()), total: num,
    bridgeFromBase: z.array(z.strictObject({component: z.string(), amount: num})), netDebt: num.nullable()}))},
  reconciliation: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    reconciliation: z.looseObject({principal: num, accruedInterest: num, unamortizedCost: num, accounting: num, reported: num.nullable(), difference: num.nullable(), status: z.string()}).nullable(),
    creditLines: z.array(z.looseObject({id: z.string(), label: z.string(), creditor: z.string(), limit: num, drawn: num, unused: num})), unusedLimits: num.nullable(),
    outsideEveryView: z.array(z.looseObject({id: z.string(), kind: z.string(), label: z.string(), creditor: z.string().nullable(), amount: num}))})},
  profile: {kind: "section" as const, claims: noClaims, content: z.strictObject({profile: z.looseObject({
    scheduleByYear: z.array(z.strictObject({year: z.number(), principal: num})), dueWithinTwelveMonths: num, dueWithinTwelveMonthsShare: num.nullable(),
    weightedAverageLifeYears: num.nullable(), largestCreditor: z.looseObject({creditor: z.string(), principal: num, share: num.nullable()}).nullable(), averageNominalCost: num.nullable()}).nullable()})},
  security: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    crossDefault: z.looseObject({chain: z.array(z.looseObject({instrumentId: z.string(), threshold: num, acceleration: z.string(), scope: z.string(), potentiallyTriggeredBy: z.array(z.string())})),
      lowestThreshold: z.strictObject({instrumentId: z.string(), threshold: num}).nullable()}).nullable(),
    negativePledgeBaskets: z.array(z.looseObject({holderId: z.string(), basket: num, occupied: num, remaining: num, exceeded: z.boolean(), usedBy: z.array(z.string())}))})},
  leverage: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({viewId: z.string(), label: z.string(), netDebt: num.nullable(), denominator: num, ratio: num.nullable()}))},
  completeness: {kind: "section" as const, claims: noClaims, content: z.strictObject({completeness: z.looseObject({status: z.string(), evidence: z.string(), request: z.string().nullable()}).nullable(),
    categoryCoverage: z.array(z.strictObject({kind: z.string(), status: z.string()}))})},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: gapsContent},
  exclusions: {kind: "section" as const, claims: noClaims, content: exclusionsContent},
};
export type DebtTableResultBlocksView = {
  readonly framing: z.infer<typeof debtTableSpec.framing.content>;
  readonly instruments: z.infer<typeof debtRow>[]; readonly views: z.infer<typeof debtTableSpec.views.content>["rows"];
  readonly reconciliation: z.infer<typeof debtTableSpec.reconciliation.content>; readonly profile: z.infer<typeof debtTableSpec.profile.content>["profile"];
  readonly security: z.infer<typeof debtTableSpec.security.content>; readonly leverage: z.infer<typeof debtTableSpec.leverage.content>["rows"];
  readonly completeness: z.infer<typeof debtTableSpec.completeness.content>; readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readDebtTablePacketBlocks(blocks: readonly BlockLike[]): DebtTableResultBlocksView | null {
  const b = readBlocks(blocks, debtTableSpec);
  if (!b) return null;
  // Each claim names a row and carries exactly its number.
  for (const c of b.instruments.claims) if (b.instruments.content.rows.find((r) => `principal:${r.id}` === c.claimId)?.principal !== c.value) return null;
  for (const c of b.views.claims) if (b.views.content.rows.find((r) => `view:${r.id}` === c.claimId)?.total !== c.value) return null;
  if (b.instruments.claims.length !== b.instruments.content.rows.length || b.views.claims.length !== b.views.content.rows.length) return null;
  return freezeArtifactValue({framing: b.framing.content, instruments: b.instruments.content.rows, views: b.views.content.rows, reconciliation: b.reconciliation.content,
    profile: b.profile.content.profile, security: b.security.content, leverage: b.leverage.content.rows, completeness: b.completeness.content,
    informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as DebtTableResultBlocksView;
}

// ---------------------------------------------------------------------------------------------
// C12, covenant headroom.

export type CovenantHeadroomPacketLike = {
  readonly schemaVersion: "covenant-headroom-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly readings: null | {readonly headline: {readonly measurementId: string; readonly date: string; readonly ratio: string | null}};
  readonly result: {readonly readingDate: string; readonly headroom: null | {readonly limits: readonly unknown[]; readonly measurements: readonly unknown[]; readonly effects: readonly unknown[]};
    readonly definitions: readonly unknown[]; readonly openQuestions: readonly unknown[]; readonly consequence: unknown};
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function covenantHeadroomPacketBlocks(packet: CovenantHeadroomPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "covenant-headroom-packet.v1") throw new Error("execution_result_unmappable");
  const h = packet.result.headroom, headline = packet.readings?.headline ?? null;
  claimable(headline ? [headline.measurementId] : []);
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, currency: packet.currency,
      readingDate: packet.result.readingDate, readings: copy(packet.readings)},
      claims: headline?.ratio == null ? [] : [{claimId: `ratio:${headline.measurementId}`, kind: "calculation", value: headline.ratio, unit: "x", period: headline.date, supportIds: [packet.fingerprint]}]},
    {blockKey: "limits", kind: "table", claims: [], content: {rows: copy(h?.limits ?? [])}},
    {blockKey: "measurements", kind: "table", claims: [], content: {rows: copy(h?.measurements ?? [])}},
    {blockKey: "effects", kind: "table", claims: [], content: {rows: copy(h?.effects ?? [])}},
    {blockKey: "consequence", kind: "section", claims: [], content: {consequence: copy(packet.result.consequence), definitions: copy(packet.result.definitions),
      openQuestions: copy(packet.result.openQuestions)}},
    ...tail(packet),
  ]);
}

const covenantTest = z.looseObject({limitId: z.string(), kind: z.enum(["contractual", "board_policy"]), maximumRatio: num, ebitdaHeadroom: num, netDebtHeadroom: num,
  unrealizedEbitdaLossToLimit: num.nullable(), breached: z.boolean()});
const covenantSpec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({status, question: z.string(), currency: z.string(), readingDate: z.string(),
    readings: z.looseObject({headline: z.looseObject({measurementId: z.string(), date: z.string(), ratio: num.nullable(), tightestLimitId: z.string().nullable(),
      byLimit: z.array(z.looseObject({limitId: z.string(), kind: z.string(), ebitdaHeadroom: num, netDebtHeadroom: num, unrealizedEbitdaLossToLimit: num.nullable(), breached: z.boolean()}))}),
      policyBindsFirst: z.boolean(), worst: z.looseObject({measurementId: z.string(), limitId: z.string(), ebitdaHeadroom: num}).nullable(), anyBreach: z.boolean(),
      contrasts: z.array(z.string()), openQuestions: z.array(z.string())}).nullable()})},
  limits: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), label: z.string(), kind: z.string()}))},
  measurements: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), label: z.string(), date: z.string(), scenario: z.string(),
    role: z.enum(["test", "contrast"]), netDebt: num, ebitda: num, ratio: num.nullable(), tests: z.array(covenantTest), tightestLimitId: z.string().nullable()}))},
  effects: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), label: z.string(), ratioEffect: num.nullable(), netDebtEffect: num}))},
  consequence: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    consequence: z.looseObject({acceleration: z.string().nullable(), process: z.string().nullable(), crossDefault: z.string().nullable()}),
    definitions: z.array(z.looseObject({limitId: z.string(), definition: z.string().nullable()})),
    openQuestions: z.array(z.looseObject({limitId: z.string(), question: z.string()}))})},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: gapsContent},
  exclusions: {kind: "section" as const, claims: noClaims, content: exclusionsContent},
};
export type CovenantHeadroomResultBlocksView = {
  readonly framing: z.infer<typeof covenantSpec.framing.content>; readonly limits: z.infer<typeof covenantSpec.limits.content>["rows"];
  readonly measurements: z.infer<typeof covenantSpec.measurements.content>["rows"]; readonly effects: z.infer<typeof covenantSpec.effects.content>["rows"];
  readonly consequence: z.infer<typeof covenantSpec.consequence.content>; readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readCovenantHeadroomPacketBlocks(blocks: readonly BlockLike[]): CovenantHeadroomResultBlocksView | null {
  const b = readBlocks(blocks, covenantSpec);
  if (!b) return null;
  const headline = b.framing.content.readings?.headline ?? null;
  const expected = headline?.ratio == null ? [] : [`ratio:${headline.measurementId}:${headline.ratio}`];
  if (JSON.stringify(b.framing.claims.map((c) => `${c.claimId}:${c.value}`)) !== JSON.stringify(expected)) return null;
  return freezeArtifactValue({framing: b.framing.content, limits: b.limits.content.rows, measurements: b.measurements.content.rows, effects: b.effects.content.rows,
    consequence: b.consequence.content, informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as CovenantHeadroomResultBlocksView;
}

// ---------------------------------------------------------------------------------------------
// C18, weekly cash.

export type WeeklyCashPacketLike = {
  readonly schemaVersion: "weekly-cash-packet.v1"; readonly status: Status; readonly question: string; readonly currency: string; readonly fingerprint: string;
  readonly readings: null | {readonly tightestWeek: {readonly weekStart: string; readonly closing: string}};
  readonly result: {readonly weekly: null | {
    readonly firstMonday: string; readonly horizonEnd: string; readonly openingCash: string; readonly minimumCash: string;
    readonly cases: ReadonlyArray<{readonly id: string; readonly label: string; readonly role: string;
      readonly rows: ReadonlyArray<{readonly weekStart: string; readonly inflows: string; readonly outflows: string; readonly closing: string; readonly belowMinimum: boolean;
        readonly largestOutflows: ReadonlyArray<{readonly label: string; readonly amount: string}>}>;
      readonly minimum: {readonly weekStart: string; readonly closing: string}; readonly weeksBelowMinimum: readonly string[]; readonly closing: string; readonly shortfallToMinimum: string}>;
    readonly calendar: readonly unknown[]; readonly actions: readonly unknown[]; readonly reconciliation: unknown; readonly coverage: readonly unknown[]}};
  readonly gaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function weeklyCashPacketBlocks(packet: WeeklyCashPacketLike): readonly ArtifactBlockDraft[] {
  if (packet.schemaVersion !== "weekly-cash-packet.v1") throw new Error("execution_result_unmappable");
  const w = packet.result.weekly, tight = packet.readings?.tightestWeek ?? null;
  return finish([
    {blockKey: "framing", kind: "section", content: {status: packet.status, question: packet.question, currency: packet.currency, readings: copy(packet.readings),
      firstMonday: w?.firstMonday ?? null, horizonEnd: w?.horizonEnd ?? null, openingCash: w?.openingCash ?? null, minimumCash: w?.minimumCash ?? null},
      claims: tight === null ? [] : [{claimId: "tightest-week", kind: "calculation", value: tight.closing, unit: packet.currency, period: tight.weekStart, supportIds: [packet.fingerprint]}]},
    {blockKey: "cases", kind: "table", claims: [], content: {rows: (w?.cases ?? []).map((c) => ({id: c.id, label: c.label, role: c.role, minimum: c.minimum.closing,
      minimumWeek: c.minimum.weekStart, weeksBelowMinimum: [...c.weeksBelowMinimum], closing: c.closing, shortfallToMinimum: c.shortfallToMinimum}))}},
    {blockKey: "weeks", kind: "table", claims: [], content: {rows: (w?.cases ?? []).flatMap((c) => c.rows.map((r) => ({caseId: c.id, weekStart: r.weekStart, inflows: r.inflows,
      outflows: r.outflows, closing: r.closing, belowMinimum: r.belowMinimum, largestOutflows: r.largestOutflows.map((o) => ({label: o.label, amount: o.amount}))})))}},
    {blockKey: "calendar", kind: "table", claims: [], content: {rows: copy(w?.calendar ?? [])}},
    {blockKey: "actions", kind: "table", claims: [], content: {rows: copy(w?.actions ?? [])}},
    {blockKey: "reconciliation", kind: "section", claims: [], content: {reconciliation: copy(w?.reconciliation ?? null), coverage: copy(w?.coverage ?? [])}},
    ...tail(packet),
  ]);
}

const weeklySpec = {
  framing: {kind: "section" as const, claims: z.array(claim).max(1), content: z.strictObject({status, question: z.string(), currency: z.string(),
    readings: z.looseObject({tightestWeek: z.strictObject({weekStart: z.string(), closing: num, belowMinimum: z.boolean()}), weeksBelowMinimum: z.array(z.string()), shortfallToMinimum: num,
      causes: z.array(z.strictObject({streamId: z.string(), label: z.string(), amount: num})), obligationsNotExamined: z.array(z.string()), closingHidesTheWeek: z.boolean(),
      cheapestCoveringAction: z.strictObject({id: z.string(), cost: num, openAtCovenantTest: z.boolean().nullable()}).nullable(),
      actionsByCost: z.array(z.strictObject({id: z.string(), cost: num, covers: z.boolean()})),
      sensitivities: z.array(z.strictObject({caseId: z.string(), minimum: num, weekStart: z.string(), weeksBelowMinimum: z.number()}))}).nullable(),
    firstMonday: z.string().nullable(), horizonEnd: z.string().nullable(), openingCash: num.nullable(), minimumCash: num.nullable()})},
  cases: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({id: z.string(), label: z.string(), role: z.string(), minimum: num, minimumWeek: z.string(),
    weeksBelowMinimum: z.array(z.string()), closing: num, shortfallToMinimum: num}))},
  weeks: {kind: "table" as const, claims: noClaims, content: rows(z.strictObject({caseId: z.string(), weekStart: z.string(), inflows: num, outflows: num, closing: num, belowMinimum: z.boolean(),
    largestOutflows: z.array(z.strictObject({label: z.string(), amount: num}))}))},
  calendar: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({date: z.string(), label: z.string(), category: z.string(), amount: num}))},
  actions: {kind: "table" as const, claims: noClaims, content: rows(z.looseObject({id: z.string(), label: z.string(), amount: num, days: z.number(), interest: num, iof: num, fee: num,
    cost: num, openAtCovenantTest: z.boolean().nullable()}))},
  reconciliation: {kind: "section" as const, claims: noClaims, content: z.strictObject({
    reconciliation: z.looseObject({date: z.string(), weekly: num, projection: num, difference: num}).nullable(),
    coverage: z.array(z.strictObject({obligation: z.string(), status: z.string()}))})},
  "information-gaps": {kind: "table" as const, claims: noClaims, content: gapsContent},
  exclusions: {kind: "section" as const, claims: noClaims, content: exclusionsContent},
};
export type WeeklyCashResultBlocksView = {
  readonly framing: z.infer<typeof weeklySpec.framing.content>; readonly cases: z.infer<typeof weeklySpec.cases.content>["rows"];
  readonly weeks: z.infer<typeof weeklySpec.weeks.content>["rows"]; readonly calendar: z.infer<typeof weeklySpec.calendar.content>["rows"];
  readonly actions: z.infer<typeof weeklySpec.actions.content>["rows"]; readonly reconciliation: z.infer<typeof weeklySpec.reconciliation.content>;
  readonly informationGaps: readonly Gap[]; readonly exclusions: readonly string[];
};

export function readWeeklyCashPacketBlocks(blocks: readonly BlockLike[]): WeeklyCashResultBlocksView | null {
  const b = readBlocks(blocks, weeklySpec);
  if (!b) return null;
  const tight = b.framing.content.readings?.tightestWeek ?? null;
  const expected = tight === null ? [] : [`tightest-week:${tight.closing}:${tight.weekStart}`];
  if (JSON.stringify(b.framing.claims.map((c) => `${c.claimId}:${c.value}:${c.period}`)) !== JSON.stringify(expected)) return null;
  return freezeArtifactValue({framing: b.framing.content, cases: b.cases.content.rows, weeks: b.weeks.content.rows, calendar: b.calendar.content.rows,
    actions: b.actions.content.rows, reconciliation: b.reconciliation.content, informationGaps: b["information-gaps"].content.rows, exclusions: b.exclusions.content.items}) as WeeklyCashResultBlocksView;
}
