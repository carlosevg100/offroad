import {z} from "zod";
import {weeklyCashObligations} from "@offroad/financial-core";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const unsignedMoney = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);
const days = z.number().int().min(0).max(9999);
const origins = ["document", "informed", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
type Origin = {origin: (typeof origins)[number]; source: string};

/** A dated series of cash events of one kind: one amount per date, in currency units. */
const stream = z.strictObject({
  id: key, label: text, category: z.enum(["debt", "statutory", "operating", "action"]), direction: z.enum(["inflow", "outflow"]),
  /** The obligation the answer cannot leave out that this stream carries; only outflows carry one. */
  obligation: z.enum(weeklyCashObligations).nullable(),
  dates: z.array(z.iso.date()).min(1).max(2000), amounts: z.array(unsignedMoney).min(1).max(2000),
});
const weeklyCase = z.strictObject({id: key, label: text, role: z.enum(["informed", "alternative"]), streamIds: z.array(key).min(1).max(40)});
/** A costed premise: the action stream it draws, the stream it replaces if any, and its terms. */
const action = z.strictObject({
  id: key, label: text, streamId: key, replacesStreamId: key.nullable(), amount: unsignedMoney, days, rate: ratio, ratePeriod: z.enum(["annual", "monthly"]),
  iofDaily: ratio, iofDailyCapDays: days, iofAdditional: ratio, upfrontFee: ratio, repaymentDate: z.iso.date(),
});
const coverageStatus = z.enum(["included", "not_applicable", "not_examined"]);

/** The facts of one weekly cash question, each with its origin. Nothing here is adopted until a
 * person confirms the set; every number the method reads comes from the adopted basis. The weeks run
 * from the opening date (a Monday) to the end date (a Sunday); money is in the company's currency units. */
export const weeklyCashFactsSchema = z.strictObject({
  weeklyCashId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  openingDate: z.iso.date(), endDate: z.iso.date(),
  openingCash: fact(money), minimumCash: fact(money),
  /** The balance a period closing shows at the end date; absent, the closing is not compared. */
  projectionClosing: fact(money).nullable(),
  calendarEnd: fact(z.iso.date()), covenantTestDate: fact(z.iso.date()).nullable(),
  streams: z.array(fact(stream)).min(1).max(40),
  cases: z.array(fact(weeklyCase)).min(1).max(8),
  actions: z.array(fact(action)).max(4),
  coverage: z.strictObject(Object.fromEntries(weeklyCashObligations.map((o) => [o, fact(coverageStatus)])) as Record<(typeof weeklyCashObligations)[number], ReturnType<typeof fact<typeof coverageStatus>>>),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
  if (new Date(`${f.openingDate}T00:00:00Z`).getUTCDay() !== 1) fail("The opening date must be a Monday");
  if (f.endDate <= f.openingDate || (day(f.endDate) - day(f.openingDate) + 1) % 7 !== 0) fail("The horizon must be whole weeks after the opening date");
  const streams = new Map(f.streams.map((s) => [s.value.id, s.value]));
  if (streams.size !== f.streams.length) fail("Duplicate stream");
  for (const {value: s} of f.streams) {
    if (s.dates.length !== s.amounts.length) fail(`Stream ${s.id} must have one amount per date`);
    if (s.dates.some((d) => d < f.openingDate || d > f.endDate)) fail(`Stream ${s.id} has an event outside the horizon`);
    if (s.obligation !== null && s.direction !== "outflow") fail(`Stream ${s.id} carries an obligation but is not an outflow`);
  }
  if (new Set(f.cases.map((c) => c.value.id)).size !== f.cases.length || f.cases.filter((c) => c.value.role === "informed").length !== 1) fail("Exactly one informed case and unique case ids");
  for (const {value: c} of f.cases) {
    if (new Set(c.streamIds).size !== c.streamIds.length || c.streamIds.some((id) => !streams.has(id))) fail(`Case ${c.id} names a stream the analysis does not carry`);
  }
  if (new Set(f.actions.map((a) => a.value.id)).size !== f.actions.length || new Set(f.actions.map((a) => a.value.streamId)).size !== f.actions.length) fail("Duplicate action");
  for (const {value: a} of f.actions) {
    const s = streams.get(a.streamId);
    if (!s || s.category !== "action" || s.direction !== "inflow") fail(`Action ${a.id} needs an action inflow stream`);
    if (a.replacesStreamId !== null && (!streams.has(a.replacesStreamId) || a.replacesStreamId === a.streamId)) fail(`Action ${a.id} replaces a stream the analysis does not carry`);
  }
  // An action stream with no action would be cash without a cost.
  for (const s of streams.values()) if (s.category === "action" && !f.actions.some((a) => a.value.streamId === s.id)) fail(`Stream ${s.id} is an action without its terms`);
});
export type WeeklyCashFacts = z.infer<typeof weeklyCashFactsSchema>;

export const weeklyCashAnalysisId = (weeklyCashId: string) => capacityUuid(`offroad:weekly-cash:${weeklyCashId}:analysis`);
/** The size of one working basis. */
export const maxWeeklyCashHypotheses = 256;

/** The hypotheses one confirmation adopts: every date, amount, classification, threshold and
 * action term the adopted reader reads, plus the structure it receives as given (case composition,
 * labels, the stream each action draws and replaces, and the order of streams, cases and actions),
 * so the packet is composed from the basis alone. Event series stay lists, one per stream. Every
 * reason states the origin of the number. Deterministic; nothing is calculated here. */
export function proposeWeeklyCashHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = weeklyCashFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `weekly_cash.${weeklyCashAnalysisId(f.weeklyCashId)}.`;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: f.endDate, currency: f.currency, unit, scale: "1", scenario: "base", definitionVersionId: f.definitionVersionId},
    value, reason});
  const num = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "number", value}, reason);
  const txt = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "text", value}, reason);
  const list = (path: string, unit: string, value: string[], reason: string) => add(path, unit, {type: "list", value}, reason);
  const date = (path: string, value: string, reason: string) => add(path, "date", {type: "date", value}, reason);

  num("openingCash", "currency", f.openingCash.value, why(f.openingCash));
  num("minimumCash", "currency", f.minimumCash.value, why(f.minimumCash));
  if (f.projectionClosing) num("projectionClosing", "currency", f.projectionClosing.value, why(f.projectionClosing));
  date("calendarEnd", f.calendarEnd.value, why(f.calendarEnd));
  if (f.covenantTestDate) date("covenantTestDate", f.covenantTestDate.value, why(f.covenantTestDate));
  for (const o of weeklyCashObligations) txt(`coverage.${o}`, "convention", f.coverage[o].value, why(f.coverage[o]));
  for (const s of f.streams) {
    const v = s.value, p = `stream.${v.id}.`, r = why(s);
    txt(p + "label", "text", v.label, r);
    txt(p + "category", "convention", v.category, r);
    txt(p + "direction", "convention", v.direction, r);
    if (v.obligation !== null) txt(p + "obligation", "convention", v.obligation, r);
    list(p + "dates", "date", v.dates, r);
    list(p + "amounts", "currency", v.amounts, r);
  }
  // Case composition is structure the reader receives as given; adopted so it is not the composer's guess.
  for (const c of f.cases) {
    const v = c.value, p = `case.${v.id}.`, r = why(c);
    txt(p + "role", "convention", v.role, r);
    txt(p + "label", "text", v.label, r);
    list(p + "streamIds", "identity", v.streamIds, r);
  }
  for (const a of f.actions) {
    const v = a.value, p = `action.${v.id}.`, r = why(a);
    txt(p + "label", "text", v.label, r);
    txt(p + "streamId", "identity", v.streamId, r);
    if (v.replacesStreamId !== null) txt(p + "replacesStreamId", "identity", v.replacesStreamId, r);
    num(p + "amount", "currency", v.amount, r);
    num(p + "days", "days", String(v.days), r);
    num(p + "rate", "ratio", v.rate, r);
    txt(p + "ratePeriod", "convention", v.ratePeriod, r);
    num(p + "iofDaily", "ratio", v.iofDaily, r);
    num(p + "iofDailyCapDays", "days", String(v.iofDailyCapDays), r);
    num(p + "iofAdditional", "ratio", v.iofAdditional, r);
    num(p + "upfrontFee", "ratio", v.upfrontFee, r);
    date(p + "repaymentDate", v.repaymentDate, r);
  }
  list("order.streams", "identity", f.streams.map((s) => s.value.id), house("Ordem dos fluxos como informada"));
  list("order.cases", "identity", f.cases.map((c) => c.value.id), house("Ordem dos casos como informada"));
  if (f.actions.length) list("order.actions", "identity", f.actions.map((a) => a.value.id), house("Ordem das ações como informada"));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxWeeklyCashHypotheses) throw new Error("weekly_cash_premises_exceed_basis");
  return out;
}
