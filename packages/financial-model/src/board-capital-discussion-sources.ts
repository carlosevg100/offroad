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

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
/** Reads one value of a reviewed result by path: dotted keys, `[n]` for a position and `[field=value]`
 * for the one element whose field equals the value. Anything else, or a selector matching zero or
 * several elements, is unresolved. */
/** The canonical identity of a path in a packet: the field it effectively resolves to, every selector replaced by the
 * index of the one element it selects (so equivalent selectors give the same identity); null when it does not resolve. */
export function boardCanonicalPath(root: unknown, path: string, form: "index" | "text" = "index"): string | null {
  const segments = path.split(/\.(?![^[]*\])/);
  let node: unknown = root;
  const out: string[] = [];
  for (const raw of segments) {
    const m = /^([A-Za-z0-9_]+)((?:\[[^[\]]+\])*)$/.exec(raw);
    if (!m) return null;
    node = isRecord(node) && Object.hasOwn(node, m[1]!) ? node[m[1]!] : undefined;
    let part = m[1]!;
    for (const selector of m[2]!.match(/\[[^[\]]+\]/g) ?? []) {
      const body = selector.slice(1, -1);
      if (!Array.isArray(node)) return null;
      let index: number;
      if (/^\d+$/.test(body)) index = Number(body);
      else {
        const conditions = body.split("&").map((x) => {const k = x.indexOf("="); return [x.slice(0, k), x.slice(k + 1)] as const;});
        const hits = node.flatMap((x, i) => isRecord(x) && conditions.every(([f, v]) => (typeof x[f] === "string" || typeof x[f] === "number") && String(x[f]) === v) ? [i] : []);
        if (hits.length !== 1) return null;
        index = hits[0]!;
      }
      const element = node[index];
      // The "text" form keeps the selector's text, reduced to its shortest leading conditions that still select the same
      // one element (so a redundant condition never makes a second text for the same field).
      if (form === "text") {
        const conditions = /^\d+$/.test(body) ? [] : body.split("&");
        let kept = conditions.length ? conditions.length : 0;
        for (let n = 1; n < conditions.length; n++) {
          const sub = conditions.slice(0, n).map((x) => {const k = x.indexOf("="); return [x.slice(0, k), x.slice(k + 1)] as const;});
          const hits = (node as unknown[]).flatMap((x, i) => isRecord(x) && sub.every(([f, v]) => (typeof x[f] === "string" || typeof x[f] === "number") && String(x[f]) === v) ? [i] : []);
          if (hits.length === 1 && hits[0] === index) {kept = n; break;}
        }
        part += conditions.length ? `[${conditions.slice(0, kept).join("&")}]` : selector;
      } else part += `[${index}]`;
      node = element;
    }
    if (node === undefined) return null;
    out.push(part);
  }
  return out.join(".");
}
/** A library-declared path instantiated with the variables bound so far ($name); a missing variable is refused by the
 * caller's error, or written as an impossible character when the caller asks for none. It decides nothing by itself. */
export function boardFillVariables(declared: string, vars: Record<string, string>, missing: (k: string) => Error | null): string {
  return declared.replace(/\$([a-z]+)/g, (_m: string, k: string) => {if (Object.hasOwn(vars, k)) return vars[k]!; const e = missing(k); if (e) throw e; return "\u0000";});
}
/** The texts of the adopted contributions of a result whose key ends in the declared key pattern (a contribution key is
 * the source's own canonical key: dotted names and ids, never a selector), optionally only those whose sibling field
 * holds a given value. */
export function boardContributionTexts(packet: {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}}, keyPattern: string, where: readonly [string, string] | null) {
  const pattern = new RegExp(`\\.${keyPattern.split("*").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+")}$`);
  const all = packet.result?.contributions ?? [];
  const kept = (key: string) => !where || all.some((e) => e.fieldPath === key.replace(/\.[a-zA-Z]+$/, `.${where[0]}`) && e.value?.value === where[1]);
  return all.flatMap((e) => typeof e.fieldPath === "string" && pattern.test(e.fieldPath) && typeof e.value?.value === "string" && kept(e.fieldPath) ? [e.value.value] : []);
}
/** The record of a list that a path reads, by canonical identity: the path and the list are both resolved (every selector
 * replaced by the index of the one element it selects), and the record is the element at that index of the list, with
 * the field read after it. Equivalent selectors give the same record; nothing is decided on the selector's text. */
export function boardResolvedRecord(root: unknown, path: string, listPath: string): {index: number; record: Record<string, unknown>; field: string} | null {
  const canonical = boardCanonicalPath(root, path), list = boardCanonicalPath(root, listPath);
  if (canonical === null || list === null) return null;
  const head = `${list}[`;
  if (canonical.slice(0, head.length) !== head) return null;
  const close = canonical.indexOf("]", head.length), index = Number(canonical.slice(head.length, close));
  const items = readBoardSourcePath(root, list), record = Array.isArray(items) ? items[index] : undefined;
  if (!Number.isInteger(index) || !isRecord(record)) return null;
  const rest = canonical.slice(close + 1);
  return {index, record, field: rest.slice(0, 1) === "." ? rest.slice(1) : rest};
}
export function readBoardSourcePath(root: unknown, path: string): unknown {
  const segments = path.split(/\.(?![^[]*\])/);
  let node: unknown = root;
  for (const raw of segments) {
    const m = /^([A-Za-z0-9_]+)((?:\[[^[\]]+\])*)$/.exec(raw);
    if (!m) throw new Error("board_capital_path_invalid");
    node = isRecord(node) && Object.hasOwn(node, m[1]!) ? node[m[1]!] : undefined;
    for (const selector of m[2]!.match(/\[[^[\]]+\]/g) ?? []) {
      const body = selector.slice(1, -1);
      if (!Array.isArray(node)) return undefined;
      if (/^\d+$/.test(body)) {node = node[Number(body)]; continue;}
      const at = body.indexOf("=");
      if (at < 1) throw new Error("board_capital_path_invalid");
      // One selector may hold several conditions joined by &: every one must hold on the element.
      const conditions = body.split("&").map((part) => {const k = part.indexOf("="); if (k < 1) throw new Error("board_capital_path_invalid"); return [part.slice(0, k), part.slice(k + 1)] as const;});
      const hits = node.filter((x) => isRecord(x) && conditions.every(([field, value]) => (typeof x[field] === "string" || typeof x[field] === "number") && String(x[field]) === value));
      if (hits.length !== 1) return undefined;
      node = hits[0];
    }
    if (node === undefined) return undefined;
  }
  return node;
}


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

/** What a field of a released result is (a label only where the source defines a name or a title): its kind, the scale it is stored in and, for rates and flows, its
 * periodicity. The material shows a reading only through this registry: the contribution chooses which
 * reading and how many decimals, never the unit, the scale, the periodicity or the date format. */
export type BoardFieldKind = "money" | "rate" | "multiple" | "years" | "months" | "bps" | "count" | "calendar" | "date" | "label" | "flag";
export type BoardDateFormat = "day_month" | "day_long" | "month_year" | "month_long" | "year";
export type BoardFieldSpec = {kind: BoardFieldKind; scale: "reais" | "millions" | "ratio" | "native"; period: "annual" | "none" | "derived"; formats: readonly BoardDateFormat[];
  /** For a period that the method does not fix: the horizon of the same row in months, read from registered fields of
   * the source (never recalculated); null when it cannot be read. */
  horizonMonths?: (packet: unknown, path: string) => string | null;
  /** For a flow selected by period: the interval its row registers (start and end dates), read from the source; a
   * sentence that announces a period for the flow must announce exactly this interval. */
  interval?: (packet: unknown, path: string) => {start: string; end: string} | null;
  /** The economic concept of the field where a method holds several of the same kind that must never stand for one another. */
  concept?: string;
  /** For money: a balance (a position at a date), a flow (a change or an amount over a period) or a value (a present value or an amount to issue). */
  nature?: "balance" | "flow" | "value";
  /** For a field that is a limit: which side it bounds and whether the limit value itself is admitted, as the source
   * method defines it (a sentence that states a relation to the limit must state this inclusion). */
  boundary?: {side: "minimum" | "maximum"; inclusive: boolean; rule: string}};
/** A lever's benefit is the nominal benefit over its action's exposure: the horizon is the sum of the registered year
 * fractions of that action's exposure, in months (an integer number of months, or nothing). */
function leverHorizonMonths(packet: unknown, path: string): string | null {
  // The lever is the record the path resolves to, by canonical identity.
  const resolved = boardResolvedRecord(packet, path, "levers");
  const lever = resolved && resolved.field === "netOfKnownCosts" ? resolved.record as {actionId?: unknown} : undefined;
  const actions = ((packet as {result?: {actions?: {actionId?: unknown; result?: {operands?: {exposure?: {yearFraction?: unknown}[]}}}[]}})?.result?.actions ?? []);
  const action = actions.find((a) => a.actionId === lever?.actionId);
  const fractions = action?.result?.operands?.exposure?.map((x) => x.yearFraction);
  if (!fractions?.length || fractions.some((x) => typeof x !== "string")) return null;
  const months = (fractions as string[]).reduce((sum: number, x) => sum + Number(x) * 12, 0), whole = Math.round(months);
  return Math.abs(months - whole) < 1e-9 && whole > 0 ? String(whole) : null;
}
/** A projected row's interval: the scenario's row of the same period in the projection result, with its registered dates. */
function projectionInterval(packet: unknown, path: string): {start: string; end: string} | null {
  // The scenario and the row the path reads, by canonical identity; then the same scenario and period in the result.
  const scenario = boardResolvedRecord(packet, path, "readings.projected.scenarios");
  const read = scenario ? boardResolvedRecord(packet, path, `readings.projected.scenarios[${scenario.index}].rows`) : null;
  if (!scenario || !read) return null;
  const projection = (packet as {result?: {projection?: {projection?: {base?: unknown[]; scenarios?: {id: string; rows?: unknown[]}[]}}}})?.result?.projection?.projection;
  const rows = scenario.record.id === "base" ? projection?.base : projection?.scenarios?.find((x) => x.id === scenario.record.id)?.rows;
  const row = (rows ?? []).find((r) => (r as {periodId?: unknown}).periodId === read.record.periodId) as {startDate?: unknown; endDate?: unknown} | undefined;
  return row && typeof row.startDate === "string" && typeof row.endDate === "string" ? {start: row.startDate, end: row.endDate} : null;
}
const money = (scale: "reais" | "millions", period: "annual" | "none" = "none"): BoardFieldSpec => ({kind: "money", scale, period, formats: []});
const rate = (period: "annual" | "none"): BoardFieldSpec => ({kind: "rate", scale: "ratio", period, formats: []});
const plain = (kind: BoardFieldKind): BoardFieldSpec => ({kind, scale: "native", period: "none", formats: []});
const date = (...formats: BoardDateFormat[]): BoardFieldSpec => ({kind: "date", scale: "native", period: "none", formats});
/** Field paths with every selector written as [*]. */
export const boardFieldRegistry: Partial<Record<BoardSourceMethodId, Record<string, BoardFieldSpec>>> = {
  "build-company-debt-table": {
    "result.table.reconciliation.principal": {...money("millions"), nature: "balance"}, "result.table.profile.scheduleByYear[*].principal": {...money("millions"), nature: "flow"},
    "result.table.profile.scheduleByYear[*].year": {kind: "calendar", scale: "native", period: "none", formats: ["year"]},
    "result.table.profile.dueWithinTwelveMonthsShare": rate("none"), "result.table.profile.weightedAverageLifeYears": plain("years"),
    "result.table.profile.largestCreditor.creditor": plain("label"), "result.table.creditLines[*].creditor": plain("label"), "result.table.creditLines[*].unused": {...money("millions"), nature: "balance"}, "result.table.rows[*].creditor": plain("label"), "result.table.profile.largestCreditor.share": rate("none"),
    "result.table.negativePledgeBaskets[*].basket": {...money("millions"), nature: "balance"}, "result.table.negativePledgeBaskets[*].occupied": {...money("millions"), nature: "balance"},
    "result.table.negativePledgeBaskets[*].remaining": {...money("millions"), nature: "balance"}, "result.table.rows[*].finalPayment": date("month_year", "month_long", "year"),
    "result.table.profile.twelveMonthHorizon": {...date("month_year", "month_long"), boundary: {side: "maximum", inclusive: true, rule: "vencimentos com data até o horizonte, inclusive (data menor ou igual)"}}},
  "measure-covenant-headroom": {
    "result.headroom.limits[*].maximumRatio": {...plain("multiple"), boundary: {side: "maximum", inclusive: true, rule: "teste violado só com índice acima do máximo; o próprio máximo cumpre"}}, "result.headroom.measurements[*].ratio": plain("multiple"),
    "result.headroom.measurements[*].reportedEbitda": {...money("millions"), nature: "flow"}, "result.headroom.measurements[*].date": date("month_year", "month_long", "year")},
  "project-weekly-cash": {
    "result.weekly.minimumCash": {...money("millions"), nature: "balance", boundary: {side: "minimum", inclusive: true, rule: "semana abaixo do mínimo só com saldo menor que o mínimo; o próprio mínimo cumpre"}}, "readings.sensitivities[*].minimum": {...money("millions"), nature: "balance"},
    "readings.sensitivities[*].weekStart": date("day_month", "day_long"), "readings.tightestWeek.weekStart": date("day_month", "day_long")},
  "analyze-investment-project": {
    "cases[*].label": plain("label"), "question": plain("label"),
    "comparison.metrics[*].annualIrr": rate("annual"), "comparison.metrics[*].discountRate": rate("annual"),
    "comparison.metrics[*].netPresentValue": {...money("reais"), nature: "value"}, "comparison.metrics[*].paybackYears": plain("years"),
    "comparison.metrics[*].peakCumulativeCashNeed.amount": {...money("reais"), nature: "balance"}, "comparison.metrics[*].peakCumulativeCashNeed.periodEndDate": date("month_year", "month_long", "year"),
},
  "build-operating-projection": {
    "result.projection.projection.scenarios[*].label": plain("label"),
    "result.projection.projection.scenarios[*].inputCostShock.rate": rate("none"),
    "result.projection.projection.scenarios[*].inputCostShock.passThroughLagMonths": plain("months"),
    "readings.projected.scenarios[*].rows[*].ebitda": {...money("millions"), nature: "flow", interval: projectionInterval},
    "readings.projected.scenarios[*].rows[*].effects.changeInWorkingCapital": {...money("millions"), nature: "flow", interval: projectionInterval}},
  "challenge-financial-projection": {"readings.gap.plan.ebitda": {...money("millions"), nature: "flow"}, "readings.gap.reference.ebitda": {...money("millions"), nature: "flow"}},
  // Receivables (C35): balance owed by each debtor, eligible capacity, program volume and sublimit are distinct concepts.
  "monetize-receivables-for-working-capital": {
    "question": plain("label"),
    "readings.gross": {...money("millions"), concept: "carteira_bruta", nature: "balance"},
    "result.funding.portfolio.items[*].label": plain("label"),
    "result.funding.portfolio.items[*].amount": {...money("millions"), concept: "saldo_da_carteira_por_devedor", nature: "balance"},
    "result.funding.portfolio.items[*].assignable": {...money("millions"), concept: "capacidade_elegivel_por_devedor", nature: "balance"},
    "readings.options[*].volume": {...money("millions"), concept: "volume_antecipavel_do_programa", nature: "balance"},
    "result.funding.options[*].byItem[*].retained": {...money("millions"), concept: "volume_do_programa_por_devedor", nature: "balance"},
    "result.funding.options[*].byItem[*].sublimitExcess": {...money("millions"), concept: "excesso_sobre_sublimite_por_devedor", nature: "balance"},
    "readings.plan[*].cumulative": {...money("millions"), concept: "volume_antecipavel_acumulado_no_plano", nature: "balance"},
    "result.funding.need.peak": {...money("millions"), concept: "pico_da_necessidade_de_caixa", nature: "balance"},
    "readings.options[*].spreadOverDi": {...rate("annual"), concept: "spread_sobre_cdi_do_programa"}},
  "analyze-relative-debt-cost": {"decomposition.grossBps": plain("bps"), "result.bridge.steps[*].bps": plain("bps"), "result.bridge.knownAdjustmentsBps": plain("bps"),
    "result.bridge.unexplainedAfterKnownAdjustmentsBps": plain("bps"), "levers[*].netOfKnownCosts": {...money("reais"), period: "derived", nature: "flow", horizonMonths: leverHorizonMonths}},
  "evaluate-financing-paths": {
    "result.evaluation.paths[*].closingAvailableByPeriod[*].closingAvailable": {...money("millions"), nature: "balance"},
    "result.evaluation.paths[*].debtServiceByYear[*].service": {...money("millions"), nature: "flow"}, "result.evaluation.paths[*].debtServiceByYear[*].availableForService": {...money("millions"), nature: "flow"},
    "readings.horizon.candidatePaths": plain("count"), "readings.horizon.lastPeriodEnd": date("year", "month_year"),
    "readings.recommendation.longInstrument.issueTarget": {...money("millions"), nature: "value", boundary: {side: "maximum", inclusive: true, rule: "montante inteiro avaliado do instrumento; a sondagem vai até ele, inclusive"}},
    "readings.recommendation.longInstrument.issueFloorInsideGates": {...money("millions"), nature: "value", boundary: {side: "minimum", inclusive: true, rule: "menor montante, no quantum adotado, que mantém o caminho dentro de todos os critérios: o próprio piso passa, um quantum abaixo não"}},
    "readings.recommendation.longInstrument.termYears": plain("years"), "readings.recommendation.longInstrument.equivalentSpread": rate("annual"),
    "readings.recommendation.longInstrument.equivalentSpreadAtCondition": rate("annual"),
    "readings.recommendation.longInstrument.firstAmortizationYear": {kind: "calendar", scale: "native", period: "none", formats: ["year"]},
    "readings.recommendation.longInstrument.lastAmortizationYear": {kind: "calendar", scale: "native", period: "none", formats: ["year"]},
    "result.evaluation.paths[*].shortfallVsPolicyMinimum": {...money("millions"), nature: "balance"},
    "result.evaluation.paths[*].amortizationTests[*].years[*].scheduledAmortization": {...money("millions"), nature: "flow"},
    "result.evaluation.paths[*].amortizationTests[*].years[*].availableAfterInterest": {...money("millions"), nature: "flow"},
    "readings.alternative.issueTarget": {...money("millions"), nature: "value"}, "readings.recommendation.horizonFinancingCost": {...money("millions"), nature: "flow"},
    "readings.recommendation.netDebtAtHorizon": {...money("millions"), nature: "balance"},
    "readings.paths[*].minimumCash.amount": {...money("millions"), nature: "balance"}, "readings.paths[*].worstLeverage": plain("multiple"),
    "readings.paths[*].horizonFinancingCost": {...money("millions"), nature: "flow"}, "readings.paths[*].netDebtAtHorizon": {...money("millions"), nature: "balance"},
    "readings.paths[*].eligible": plain("flag"), "readings.paths[*].consentRequired": plain("flag")},
};
/** The field a reading path names, or null when the method's registry does not list it. */
export function boardFieldOf(methodId: string, path: string): BoardFieldSpec | null {
  const pattern = path.replace(/\[[^[\]]*\]/g, "[*]");
  return boardFieldRegistry[methodId as BoardSourceMethodId]?.[pattern] ?? null;
}

// The registry and the released sources are frozen: no running code changes what a field means or which method and version
// is released. The released entries are frozen one level deep (their schemas are library objects, left as they are).
{
  const freeze = (v: unknown): void => {if (v && typeof v === "object" && !Object.isFrozen(v)) {Object.freeze(v); for (const y of Object.values(v as Record<string, unknown>)) freeze(y);}};
  freeze(boardFieldRegistry); freeze(boardSourceMethodIds);
  Object.freeze(boardReleasedSources); for (const x of Object.values(boardReleasedSources)) Object.freeze(x);
}
