import {z} from "zod";
import {receivablesFundingOptionKinds} from "@offroad/financial-core";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
/** Money carries at most eight decimals, as the adopted numeric representation reads it. */
const money = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,20})?$/);
const days = z.number().int().min(0).max(9999);
const origins = ["document", "informed", "market", "house", "estimate"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", market: "faixa de mercado", house: "premissa da casa", estimate: "estimativa"};
/** A value and where it came from; the source names the document, the message, the market range or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
type Origin = {origin: (typeof origins)[number]; source: string};

/** One bucket of the portfolio: its amount, contract, encumbrance, dates and debtor facts. */
const item = z.strictObject({
  id: key, label: text, amount: money, contract: z.enum(["assignable", "prohibited_without_consent"]), encumbrance: z.enum(["free", "assigned", "pledged"]),
  encumbranceHolder: text.nullable(), releaseEvent: text.nullable(), originDate: z.iso.date(), dueDate: z.iso.date(),
  registration: z.enum(["registered", "not_required", "missing"]), creditTier: z.enum(["selected", "standard"]), anchorProgram: z.enum(["active", "none", "unknown"]),
  debtorCount: z.number().int().min(1).max(1000000).nullable(), largestDebtorAmount: money.nullable(),
  /** Canonical key of the debtor, or of the declared debtor set; lots of one debtor share it. */
  debtorKey: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,79}$/), debtorSetDisjoint: z.boolean().nullable(),
});
/** One funding option with its eligibility (none for the bank line), rate, taxes and lead time. */
const option = z.strictObject({
  id: key, label: text, kind: z.enum(receivablesFundingOptionKinds), recourse: z.enum(["with_recourse", "without_recourse"]),
  eligibility: z.strictObject({maxDaysPastDue: days, maxRemainingTermDays: days, registrationRule: z.enum(["required", "not_required"]),
    minCreditTier: z.enum(["selected", "standard"]), sublimitPerDebtor: money.nullable(), anchorItemIds: z.array(key).max(16)}).nullable(),
  rate: z.strictObject({basis: z.enum(["monthly", "annual", "di_plus"]), rate: ratio}),
  iofDaily: ratio, iofDailyCapDays: days, iofAdditional: ratio, rolloverDays: days.nullable(), upfrontFee: ratio,
  collateral: z.enum(["none", "receivables_assignment", "unknown"]), leadDaysMin: days.nullable(), leadDaysMax: days.nullable(),
});

/** The facts of one receivables funding question, each with its origin. Nothing here is adopted
 * until a person confirms the set; every number the method reads comes from the adopted basis.
 * The period runs from the portfolio's reference date to the end of the need. */
export const receivablesFundingFactsSchema = z.strictObject({
  receivablesFundingId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  referenceDate: z.iso.date(), endDate: z.iso.date(),
  needAverage: fact(money), needPeak: fact(money), needStartDate: fact(z.iso.date()), calendarDays: fact(days), businessDays: fact(days), annualDi: fact(ratio),
  averageTermDays: fact(days), needProfile: fact(z.enum(["seasonal", "structural"])), dedicatedVehicleThreshold: fact(z.strictObject({min: money, max: money})),
  lienBasketRemaining: fact(money).nullable(),
  items: z.array(fact(item)).min(1).max(16),
  options: z.array(fact(option)).min(1).max(8),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.endDate <= f.referenceDate) fail("The end of the need must follow the reference date");
  const items = new Map(f.items.map((i) => [i.value.id, i.value]));
  if (items.size !== f.items.length) fail("Duplicate item");
  for (const {value: i} of f.items) {
    if ((i.encumbrance === "free") !== (i.encumbranceHolder === null)) fail(`Item ${i.id} must name the holder of its encumbrance, and only then`);
    if (i.releaseEvent !== null && i.encumbrance === "free") fail(`Item ${i.id} is free and has no release event`);
    if (i.dueDate < i.originDate || i.originDate > f.referenceDate) fail(`Item ${i.id} has inconsistent dates`);
    if ((i.debtorCount === 1) !== (i.debtorSetDisjoint === null)) fail(`Item ${i.id} declares the disjoint debtor set only when it has several debtors`);
  }
  if (new Set(f.options.map((o) => o.value.id)).size !== f.options.length) fail("Duplicate option");
  for (const {value: o} of f.options) {
    if ((o.kind === "bank_line") !== (o.eligibility === null)) fail(`Option ${o.id}: only the bank line has no eligibility`);
    if ((o.leadDaysMin === null) !== (o.leadDaysMax === null)) fail(`Option ${o.id} states both lead days or neither`);
    for (const id of o.eligibility?.anchorItemIds ?? []) if (!items.has(id)) fail(`Option ${o.id} names an item the analysis does not carry`);
    if (o.kind === "anchor_program" && !o.eligibility?.anchorItemIds.length) fail(`Option ${o.id} is a program without its debtor`);
  }
});
export type ReceivablesFundingFacts = z.infer<typeof receivablesFundingFactsSchema>;

export const receivablesFundingAnalysisId = (receivablesFundingId: string) => capacityUuid(`offroad:receivables-funding:${receivablesFundingId}:analysis`);
/** The size of one working basis. */
export const maxReceivablesFundingHypotheses = 256;

/** The hypotheses one confirmation adopts: every amount, date, contract and encumbrance state,
 * eligibility term, rate, tax and lead time the adopted reader reads, plus the order of buckets
 * and options, so the packet is composed from the basis alone. Every reason states the origin of
 * the number. Deterministic; nothing is calculated here. */
export function proposeReceivablesFundingHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = receivablesFundingFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `receivables_funding.${receivablesFundingAnalysisId(f.receivablesFundingId)}.`;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.referenceDate, periodEnd: f.endDate, currency: f.currency, unit, scale: "1", scenario: "base", definitionVersionId: f.definitionVersionId},
    value, reason});
  const num = (path: string, unit: string, value: string | number, reason: string) => add(path, unit, {type: "number", value: String(value)}, reason);
  const txt = (path: string, unit: string, value: string, reason: string) => add(path, unit, {type: "text", value}, reason);
  const date = (path: string, value: string, reason: string) => add(path, "date", {type: "date", value}, reason);

  num("needAverage", "currency", f.needAverage.value, why(f.needAverage));
  num("needPeak", "currency", f.needPeak.value, why(f.needPeak));
  date("needStartDate", f.needStartDate.value, why(f.needStartDate));
  num("calendarDays", "days", f.calendarDays.value, why(f.calendarDays));
  num("businessDays", "days", f.businessDays.value, why(f.businessDays));
  num("annualDi", "ratio", f.annualDi.value, why(f.annualDi));
  num("averageTermDays", "days", f.averageTermDays.value, why(f.averageTermDays));
  txt("needProfile", "convention", f.needProfile.value, why(f.needProfile));
  num("vehicleThresholdMin", "currency", f.dedicatedVehicleThreshold.value.min, why(f.dedicatedVehicleThreshold));
  num("vehicleThresholdMax", "currency", f.dedicatedVehicleThreshold.value.max, why(f.dedicatedVehicleThreshold));
  if (f.lienBasketRemaining) num("lienBasketRemaining", "currency", f.lienBasketRemaining.value, why(f.lienBasketRemaining));
  for (const i of f.items) {
    const v = i.value, p = `item.${v.id}.`, r = why(i);
    txt(p + "label", "text", v.label, r);
    num(p + "amount", "currency", v.amount, r);
    txt(p + "contract", "convention", v.contract, r);
    txt(p + "encumbrance", "convention", v.encumbrance, r);
    if (v.encumbranceHolder !== null) txt(p + "encumbranceHolder", "text", v.encumbranceHolder, r);
    if (v.releaseEvent !== null) txt(p + "releaseEvent", "text", v.releaseEvent, r);
    date(p + "originDate", v.originDate, r);
    date(p + "dueDate", v.dueDate, r);
    txt(p + "registration", "convention", v.registration, r);
    txt(p + "creditTier", "convention", v.creditTier, r);
    txt(p + "anchorProgram", "convention", v.anchorProgram, r);
    if (v.debtorCount !== null) num(p + "debtorCount", "count", v.debtorCount, r);
    if (v.largestDebtorAmount !== null) num(p + "largestDebtorAmount", "currency", v.largestDebtorAmount, r);
    txt(p + "debtorKey", "identity", v.debtorKey, r);
    if (v.debtorSetDisjoint !== null) txt(p + "debtorSetDisjoint", "convention", v.debtorSetDisjoint ? "declared" : "not_declared", r);
  }
  for (const o of f.options) {
    const v = o.value, p = `option.${v.id}.`, r = why(o);
    txt(p + "label", "text", v.label, r);
    txt(p + "kind", "convention", v.kind, r);
    txt(p + "recourse", "convention", v.recourse, r);
    txt(p + "rateBasis", "convention", v.rate.basis, r);
    num(p + "rate", "ratio", v.rate.rate, r);
    num(p + "iofDaily", "ratio", v.iofDaily, r);
    num(p + "iofDailyCapDays", "days", v.iofDailyCapDays, r);
    num(p + "iofAdditional", "ratio", v.iofAdditional, r);
    if (v.rolloverDays !== null) num(p + "rolloverDays", "days", v.rolloverDays, r);
    num(p + "upfrontFee", "ratio", v.upfrontFee, r);
    txt(p + "collateral", "convention", v.collateral, r);
    if (v.leadDaysMin !== null) num(p + "leadDaysMin", "days", v.leadDaysMin, r);
    if (v.leadDaysMax !== null) num(p + "leadDaysMax", "days", v.leadDaysMax, r);
    const e = v.eligibility;
    if (e) {
      num(p + "maxDaysPastDue", "days", e.maxDaysPastDue, r);
      num(p + "maxRemainingTermDays", "days", e.maxRemainingTermDays, r);
      txt(p + "registrationRule", "convention", e.registrationRule, r);
      txt(p + "minCreditTier", "convention", e.minCreditTier, r);
      if (e.sublimitPerDebtor !== null) num(p + "sublimitPerDebtor", "currency", e.sublimitPerDebtor, r);
      if (e.anchorItemIds.length) add(p + "anchorItemIds", "identity", {type: "list", value: e.anchorItemIds}, r);
    }
  }
  add("order.items", "identity", {type: "list", value: f.items.map((i) => i.value.id)}, house("Ordem dos grupos da carteira como informada"));
  add("order.options", "identity", {type: "list", value: f.options.map((o) => o.value.id)}, house("Ordem das portas como informada"));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxReceivablesFundingHypotheses) throw new Error("receivables_funding_premises_exceed_basis");
  return out;
}
