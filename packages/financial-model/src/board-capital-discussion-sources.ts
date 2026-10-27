import {createHash} from "node:crypto";
import {z} from "zod";
import {investmentDecisionPacketOutputSchema} from "./investment-decision-packet";
import {debtTablePacketOutputSchema} from "./debt-table-packet";
import {covenantHeadroomPacketOutputSchema} from "./covenant-headroom-packet";
import {weeklyCashPacketOutputSchema} from "./weekly-cash-packet";
import {operatingProjectionPacketOutputSchema} from "./operating-projection-packet";
import {projectionChallengePacketOutputSchema} from "./projection-challenge-packet";
import {receivablesFundingPacketOutputSchema} from "./receivables-funding-packet";
import {relativeDebtCostPacketOutputSchema} from "./relative-debt-cost-packet";
import {financingComparisonPacketOutputSchema} from "./financing-comparison-packet";
import {debtCapacityPacketOutputSchema} from "./debt-capacity-packet";
import {quarterUpdatePacketOutputSchema} from "./quarter-update-packet";
import {capitalPathsPacketOutputSchema} from "./capital-structure-paths-packet";
import type {BoardSourceReading} from "./board-capital-discussion";

/** The released methods whose reviewed results a board material may read, each pinned to the released
 * method version, executor version and packet schema. A result of any other method or version is refused. */
export const boardReleasedSources = {
  "analyze-investment-project": {methodVersion: "2026.10.09-v2", executorVersion: "2026.10.09-v1", packet: "investment-decision-packet.v1", schema: investmentDecisionPacketOutputSchema},
  "build-company-debt-table": {methodVersion: "2026.10.23-v1", executorVersion: "2026.10.23-v1", packet: "debt-table-packet.v1", schema: debtTablePacketOutputSchema},
  "measure-covenant-headroom": {methodVersion: "2026.10.23-v1", executorVersion: "2026.10.23-v1", packet: "covenant-headroom-packet.v1", schema: covenantHeadroomPacketOutputSchema},
  "project-weekly-cash": {methodVersion: "2026.10.23-v1", executorVersion: "2026.10.23-v1", packet: "weekly-cash-packet.v1", schema: weeklyCashPacketOutputSchema},
  "build-operating-projection": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "operating-projection-packet.v1", schema: operatingProjectionPacketOutputSchema},
  "challenge-financial-projection": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "projection-challenge-packet.v1", schema: projectionChallengePacketOutputSchema},
  "monetize-receivables-for-working-capital": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "receivables-funding-packet.v1", schema: receivablesFundingPacketOutputSchema},
  "analyze-relative-debt-cost": {methodVersion: "2026.10.19-v2", executorVersion: "2026.10.19-v1", packet: "relative-debt-cost-packet.v1", schema: relativeDebtCostPacketOutputSchema},
  "compare-financing-proposals": {methodVersion: "2026.10.19-v2", executorVersion: "2026.10.19-v1", packet: "financing-comparison-packet.v1", schema: financingComparisonPacketOutputSchema},
  "assess-debt-capacity": {methodVersion: "2026.10.19-v2", executorVersion: "2026.10.19-v1", packet: "debt-capacity-packet.v1", schema: debtCapacityPacketOutputSchema},
  "evaluate-financing-paths": {methodVersion: "2026.10.27-v1", executorVersion: "2026.10.27-v1", packet: "capital-structure-paths-packet.v1", schema: capitalPathsPacketOutputSchema},
  "update-after-quarter-close": {methodVersion: "2026.10.26-v1", executorVersion: "2026.10.26-v1", packet: "quarter-update-packet.v1", schema: quarterUpdatePacketOutputSchema},
} as const;
export type BoardSourceMethodId = keyof typeof boardReleasedSources;
export const boardSourceMethodIds = Object.keys(boardReleasedSources) as [BoardSourceMethodId, ...BoardSourceMethodId[]];

/** A reviewed result as the conversation brings it: the packet of a completed execution, verbatim, as its JSON text. */
export const boardSourcePacketSchema = z.strictObject({id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), packet: z.string().min(2).max(8388608)});

/** The stored text of one result, as an object; anything else is refused by name. */
export function parseBoardSourceText(id: string, text: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(`board_capital_source_invalid:${id}`); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`board_capital_source_invalid:${id}`);
  return value as Record<string, unknown>;
}

/** Checks one reviewed result against the method and fingerprint the basis names: parsed by the released
 * packet schema (which also restores the key order the fingerprint was taken on), fingerprint recomputed,
 * same company and currency as the discussion. Nothing in it is recalculated. */
export function verifyBoardSource(named: {id: string; methodId: string; packetFingerprint: string}, raw: Record<string, unknown>, context: {entityId: string; currency: string}): BoardSourceReading {
  const released = boardReleasedSources[named.methodId as BoardSourceMethodId];
  if (!released) throw new Error(`board_capital_source_method_not_released:${named.id}`);
  if (raw.schemaVersion !== released.packet || raw.executorVersion !== released.executorVersion) throw new Error(`board_capital_source_version_mismatch:${named.id}`);
  const parsed = (released.schema as unknown as {safeParse: (v: unknown) => {success: boolean; data?: Record<string, unknown>}}).safeParse(raw);
  if (!parsed.success || !parsed.data) throw new Error(`board_capital_source_invalid:${named.id}`);
  const {fingerprint, ...payload} = parsed.data;
  if (createHash("sha256").update(JSON.stringify(payload)).digest("hex") !== fingerprint) throw new Error(`board_capital_source_fingerprint_mismatch:${named.id}`);
  if (fingerprint !== named.packetFingerprint) throw new Error(`board_capital_source_not_named:${named.id}`);
  if (payload.entityId !== context.entityId || payload.currency !== context.currency) throw new Error(`board_capital_source_context_mismatch:${named.id}`);
  const gaps = Array.isArray(payload.gaps) ? (payload.gaps as {operand: string; reason: string}[]).map((g) => ({operand: g.operand, reason: g.reason})) : [];
  return {id: named.id, methodId: named.methodId, methodVersion: released.methodVersion, executorVersion: released.executorVersion, packetSchemaVersion: released.packet,
    packetFingerprint: fingerprint as string, status: String(payload.status), gaps, packet: parsed.data};
}

/** What a field of a released result is: its kind, the scale it is stored in and, for rates and flows, its
 * periodicity. The material shows a reading only through this registry: the contribution chooses which
 * reading and how many decimals, never the unit, the scale, the periodicity or the date format. */
export type BoardFieldKind = "money" | "rate" | "multiple" | "years" | "months" | "bps" | "count" | "calendar" | "date" | "label" | "flag";
export type BoardFieldSpec = {kind: BoardFieldKind; scale: "reais" | "millions" | "ratio" | "native"; period: "annual" | "none"; formats: readonly ("day_month" | "month_year" | "year")[]};
const money = (scale: "reais" | "millions", period: "annual" | "none" = "none"): BoardFieldSpec => ({kind: "money", scale, period, formats: []});
const rate = (period: "annual" | "none"): BoardFieldSpec => ({kind: "rate", scale: "ratio", period, formats: []});
const plain = (kind: BoardFieldKind): BoardFieldSpec => ({kind, scale: "native", period: "none", formats: []});
const date = (...formats: ("day_month" | "month_year" | "year")[]): BoardFieldSpec => ({kind: "date", scale: "native", period: "none", formats});
/** Field paths with every selector written as [*]. */
export const boardFieldRegistry: Partial<Record<BoardSourceMethodId, Record<string, BoardFieldSpec>>> = {
  "build-company-debt-table": {
    "result.table.reconciliation.principal": money("millions"), "result.table.profile.scheduleByYear[*].principal": money("millions"),
    "result.table.profile.scheduleByYear[*].year": {kind: "calendar", scale: "native", period: "none", formats: ["year"]},
    "result.table.profile.dueWithinTwelveMonthsShare": rate("none"), "result.table.profile.weightedAverageLifeYears": plain("years"),
    "result.table.profile.largestCreditor.creditor": plain("label"), "result.table.profile.largestCreditor.share": rate("none"),
    "result.table.negativePledgeBaskets[*].basket": money("millions"), "result.table.negativePledgeBaskets[*].occupied": money("millions"),
    "result.table.negativePledgeBaskets[*].remaining": money("millions"), "result.table.rows[*].finalPayment": date("month_year", "year"),
    "result.table.profile.twelveMonthHorizon": date("month_year")},
  "measure-covenant-headroom": {
    "result.headroom.limits[*].maximumRatio": plain("multiple"), "result.headroom.measurements[*].ratio": plain("multiple"),
    "result.headroom.measurements[*].reportedEbitda": money("millions"), "result.headroom.measurements[*].date": date("month_year", "year")},
  "project-weekly-cash": {
    "result.weekly.minimumCash": money("millions"), "readings.sensitivities[*].minimum": money("millions"),
    "readings.sensitivities[*].weekStart": date("day_month"), "readings.tightestWeek.weekStart": date("day_month")},
  "analyze-investment-project": {
    "comparison.metrics[*].annualIrr": rate("annual"), "comparison.metrics[*].discountRate": rate("annual"),
    "comparison.metrics[*].netPresentValue": money("reais"), "comparison.metrics[*].paybackYears": plain("years"),
    "comparison.metrics[*].peakCumulativeCashNeed.amount": money("reais"), "comparison.metrics[*].peakCumulativeCashNeed.periodEndDate": date("month_year", "year"),
    "cases[*].label": plain("label")},
  "build-operating-projection": {
    "result.projection.projection.scenarios[*].inputCostShock.rate": rate("none"),
    "result.projection.projection.scenarios[*].inputCostShock.passThroughLagMonths": plain("months"),
    "result.projection.projection.scenarios[*].label": plain("label"), "readings.projected.scenarios[*].rows[*].ebitda": money("millions"),
    "readings.projected.scenarios[*].rows[*].effects.changeInWorkingCapital": money("millions")},
  "challenge-financial-projection": {"readings.gap.plan.ebitda": money("millions"), "readings.gap.reference.ebitda": money("millions")},
  "monetize-receivables-for-working-capital": {
    "readings.plan[*].cumulative": money("millions"), "readings.options[*].spreadOverDi": rate("annual"),
    "readings.options[*].volume": money("millions"), "readings.gross": money("millions")},
  "analyze-relative-debt-cost": {"decomposition.grossBps": plain("bps"), "result.bridge.steps[*].bps": plain("bps"), "levers[*].netOfKnownCosts": money("reais", "annual")},
  "evaluate-financing-paths": {
    "result.evaluation.paths[*].closingAvailableByPeriod[*].closingAvailable": money("millions"),
    "result.evaluation.paths[*].debtServiceByYear[*].service": money("millions"), "result.evaluation.paths[*].debtServiceByYear[*].availableForService": money("millions"),
    "readings.horizon.candidatePaths": plain("count"), "readings.horizon.lastPeriodEnd": date("year", "month_year"),
    "readings.recommendation.longInstrument.issueTarget": money("millions"), "readings.recommendation.longInstrument.issueFloorInsideGates": money("millions"),
    "readings.recommendation.longInstrument.termYears": plain("years"), "readings.recommendation.longInstrument.equivalentSpread": rate("annual"),
    "readings.recommendation.longInstrument.equivalentSpreadAtCondition": rate("annual"),
    "readings.recommendation.longInstrument.firstAmortizationYear": {kind: "calendar", scale: "native", period: "none", formats: ["year"]},
    "readings.recommendation.longInstrument.lastAmortizationYear": {kind: "calendar", scale: "native", period: "none", formats: ["year"]},
    "result.evaluation.paths[*].shortfallVsPolicyMinimum": money("millions"),
    "result.evaluation.paths[*].amortizationTests[*].years[*].scheduledAmortization": money("millions"),
    "result.evaluation.paths[*].amortizationTests[*].years[*].availableAfterInterest": money("millions"),
    "readings.alternative.issueTarget": money("millions"), "readings.recommendation.horizonFinancingCost": money("millions"),
    "readings.recommendation.netDebtAtHorizon": money("millions"), "readings.paths[*].label": plain("label"),
    "readings.paths[*].minimumCash.amount": money("millions"), "readings.paths[*].worstLeverage": plain("multiple"),
    "readings.paths[*].horizonFinancingCost": money("millions"), "readings.paths[*].netDebtAtHorizon": money("millions"),
    "readings.paths[*].eligible": plain("flag"), "readings.paths[*].consentRequired": plain("flag")},
};
/** The field a reading path names, or null when the method's registry does not list it. */
export function boardFieldOf(methodId: string, path: string): BoardFieldSpec | null {
  const pattern = path.replace(/\[[^\]]*\]/g, "[*]");
  return boardFieldRegistry[methodId as BoardSourceMethodId]?.[pattern] ?? null;
}
