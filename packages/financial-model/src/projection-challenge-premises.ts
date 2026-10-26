import Decimal from "decimal.js";
import {z} from "zod";
import {projectionCaseDrivers, projectionPeriodDrivers, type ProjectionDriver} from "@offroad/financial-core";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";

const text = z.string().trim().min(1).max(2000);
/** Ids travel inside field paths, so they never carry a dot. */
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const scenarioKey = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/);
const periodId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/);
/** Adopted values carry at most eight decimals, as the adopted numeric representation reads them. */
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/);
const origins = ["document", "informed", "house", "estimate"] as const;
type Origin = {origin: (typeof origins)[number]; source: string};
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa"};
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
const drivers = [...projectionPeriodDrivers, ...projectionCaseDrivers] as [ProjectionDriver, ...ProjectionDriver[]];

/** One case by drivers: period drivers as series in period order, case drivers as one value. */
const driverCase = z.strictObject({
  quantity: z.array(unsigned).min(2).max(20), netUnitPrice: z.array(unsigned).min(2).max(20), variableUnitCost: z.array(unsigned).min(2).max(20),
  fixedCosts: z.array(unsigned).min(2).max(20), interestExpense: z.array(unsigned).min(2).max(20),
  receivableDays: unsigned, inventoryDays: unsigned, payableDays: unsigned, maintenanceCapex: unsigned, leasePayments: unsigned, depreciation: unsigned, taxRate: ratio,
});

/** The facts of one projection challenge, each with its origin. Nothing is adopted until a person
 * confirms the set; every number the method reads comes from the adopted basis. */
export const projectionChallengeFactsSchema = z.strictObject({
  challengeId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  /** The basis period runs from the start of the first period to the end of the target period. */
  openingDate: z.iso.date(), endDate: z.iso.date(),
  scenario: scenarioKey, referenceScenario: scenarioKey, planScenario: scenarioKey,
  periodIds: fact(z.array(periodId).min(2).max(20)), targetPeriodId: fact(periodId),
  dayBasis: fact(z.enum(["360", "365"])), unitConvention: fact(text),
  /** The reference is usually the house's projection by historical drivers; the plan is the company's model. */
  reference: fact(driverCase), plan: fact(driverCase),
  assumptions: z.array(z.strictObject({term: fact(z.strictObject({id: key, label: text, drivers: z.array(z.enum(drivers)).min(1).max(12)})),
    ruler: fact(text), evidence: fact(z.array(text).min(1).max(8)), evidenceStatus: fact(z.enum(["documented", "not_presented"]))})).min(1).max(12),
  capacity: z.strictObject({maximumQuantity: fact(unsigned), investmentInPlan: fact(z.boolean()), source: fact(text)}).nullable(),
  marginCause: fact(text).nullable(), requestedReceivableDays: fact(unsigned).nullable(), premiumOverAverage: fact(ratio).nullable(),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.endDate <= f.openingDate) fail("The end date must follow the opening date");
  if (new Set([f.referenceScenario, f.planScenario]).size !== 2) fail("Reference and plan need their own scenarios");
  const periods = f.periodIds.value;
  if (new Set(periods).size !== periods.length) fail("Duplicate period");
  if (periods.indexOf(f.targetPeriodId.value) < 1) fail("The target must be a period after the first");
  for (const c of [f.reference.value, f.plan.value]) {
    if (projectionPeriodDrivers.some((d) => c[d].length !== periods.length)) fail("Every series needs one value per period");
    if (new Decimal(c.taxRate).gt(1)) fail("The tax rate cannot exceed one");
  }
  const ids = f.assumptions.map((a) => a.term.value.id);
  if (new Set(ids).size !== ids.length) fail("Duplicate assumption");
  const owned = f.assumptions.flatMap((a) => a.term.value.drivers);
  if (new Set(owned).size !== owned.length) fail("A driver belongs to two assumptions");
  if (f.capacity && !new Decimal(f.capacity.maximumQuantity.value).gt(0)) fail("Capacity must be positive");
  if (f.premiumOverAverage && !new Decimal(f.premiumOverAverage.value).gt(0)) fail("The premium must be positive");
});
export type ProjectionChallengeFacts = z.infer<typeof projectionChallengeFactsSchema>;

export const projectionChallengeAnalysisId = (challengeId: string) => capacityUuid(`offroad:projection-challenge:${challengeId}:analysis`);
/** The size of one working basis. */
export const maxProjectionChallengeHypotheses = 256;
const units: Record<ProjectionDriver, string> = {quantity: "quantity", netUnitPrice: "unit_price", variableUnitCost: "unit_price", fixedCosts: "currency",
  interestExpense: "currency", receivableDays: "days", inventoryDays: "days", payableDays: "days", maintenanceCapex: "currency", leasePayments: "currency",
  depreciation: "currency", taxRate: "ratio"};
export const projectionChallengeDriverUnits = units;

/** The hypotheses one confirmation adopts, at the paths, units and scenarios the adopted reader reads
 * (`projection_challenge.<analysis>.`). The periods anchor the analysis; each case is adopted in its own
 * scenario; structure the reader takes as plain fields (the two scenarios and the assumption order) is
 * adopted as extra hypotheses it ignores. Optional facts that are absent adopt nothing. Every reason
 * states the origin. Deterministic. */
export function proposeProjectionChallengeHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = projectionChallengeFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `projection_challenge.${projectionChallengeAnalysisId(f.challengeId)}.`, top = f.scenario;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string, scenario = top) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.openingDate, periodEnd: f.endDate, currency: f.currency, unit, scale: "1", scenario, definitionVersionId: f.definitionVersionId},
    value, reason});
  const txt = (path: string, unit: string, value: string, reason: string, scenario = top) => add(path, unit, {type: "text", value}, reason, scenario);
  const list = (path: string, unit: string, value: string[], reason: string, scenario = top) => add(path, unit, {type: "list", value}, reason, scenario);
  const num = (path: string, unit: string, value: string, reason: string, scenario = top) => add(path, unit, {type: "number", value}, reason, scenario);
  list("periodIds", "identity", f.periodIds.value, why(f.periodIds));
  txt("targetPeriodId", "identity", f.targetPeriodId.value, why(f.targetPeriodId));
  txt("dayBasis", "convention", f.dayBasis.value, why(f.dayBasis));
  txt("unitConvention", "text", f.unitConvention.value, why(f.unitConvention));
  txt("structure.referenceScenario", "identity", f.referenceScenario, house("Cenário da referência"));
  txt("structure.planScenario", "identity", f.planScenario, house("Cenário do plano"));
  list("order.assumptions", "identity", f.assumptions.map((a) => a.term.value.id), house("Ordem de leitura das premissas"));
  for (const [k, c, sc] of [["reference", f.reference, f.referenceScenario], ["plan", f.plan, f.planScenario]] as const) {
    for (const d of projectionPeriodDrivers) list(`case.${k}.${d}`, units[d], [...c.value[d]], why(c), sc);
    for (const d of projectionCaseDrivers) num(`case.${k}.${d}`, units[d], c.value[d], why(c), sc);
  }
  for (const a of f.assumptions) {
    const v = a.term.value, p = `assumption.${v.id}.`;
    txt(p + "label", "text", v.label, why(a.term));
    list(p + "drivers", "identity", [...v.drivers], why(a.term));
    txt(p + "ruler", "text", a.ruler.value, why(a.ruler));
    list(p + "evidence", "text", [...a.evidence.value], why(a.evidence));
    txt(p + "evidenceStatus", "convention", a.evidenceStatus.value, why(a.evidenceStatus));
  }
  if (f.capacity) {
    num("capacity.maximumQuantity", "quantity", f.capacity.maximumQuantity.value, why(f.capacity.maximumQuantity));
    add("capacity.investmentInPlan", "convention", {type: "boolean", value: f.capacity.investmentInPlan.value}, why(f.capacity.investmentInPlan));
    txt("capacity.source", "text", f.capacity.source.value, why(f.capacity.source));
  }
  if (f.marginCause) txt("marginCause", "text", f.marginCause.value, why(f.marginCause));
  if (f.requestedReceivableDays) num("requestedReceivableDays", "days", f.requestedReceivableDays.value, why(f.requestedReceivableDays));
  if (f.premiumOverAverage) num("premiumOverAverage", "ratio", f.premiumOverAverage.value, why(f.premiumOverAverage));
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxProjectionChallengeHypotheses) throw new Error("projection_challenge_premises_exceed_basis");
  return out;
}
