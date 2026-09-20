import {createHash} from "node:crypto";
import {z} from "zod";
import {buildOperatingCashProjection, financialCoreVersion, type OperatingProjectionPeriod, type OperatingWorkingCapital} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedDebtLiquidityInputSchema, adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

const stock = z.strictObject({receivables: selection, inventory: selection, otherOperatingAssets: selection, payables: selection, otherOperatingLiabilities: selection});
const shape = adoptedDebtLiquidityInputSchema.shape;
export const adoptedOperatingProjectionInputSchema = z.strictObject({
  envelope: shape.envelope, scope: shape.scope, entityId: shape.entityId, perimeter: shape.perimeter,
  currency: shape.currency, openingScenario: shape.openingScenario, scenario: shape.scenario,
  openingDate: shape.openingDate, endDate: shape.endDate, numericInterpretations: shape.numericInterpretations,
  convention: selection, openingWorkingCapital: stock, periodEnds: selection,
  revenue: z.discriminatedUnion("mode", [
    z.strictObject({mode: z.literal("amount"), convention: selection, amounts: selection}),
    z.strictObject({mode: z.literal("drivers"), convention: selection, quantities: selection, netUnitPrices: selection}),
  ]),
  closingWorkingCapital: stock,
  expenses: z.strictObject({variableOperatingExpense: selection, fixedOperatingExpense: selection,
    nonCashEbitdaAdjustment: selection, cashTaxesPaid: selection, cashTaxRefunds: selection,
    maintenanceCapexPaid: selection, growthCapexPaid: selection}),
}).refine(i => i.endDate > i.openingDate, "Invalid operating horizon");
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const signed = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const next = (value: string) => {const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);};

/** Resolves a period budget without inventing daily cash dates. Authorized SQL reading is
 * a caller precondition; a fingerprint and adopted context never grant execution rights. */
export function calculateAdoptedOperatingProjection(raw: unknown) {
  const input = adoptedOperatingProjectionInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>(); const selected = new Set<string>(); const observations = new Set<string>();
  const gaps: {operand: string; reason: string}[] = [];
  const bindings: {operand: string; decisionId: string | null; interpretationDecisionIds: string[]}[] = [];
  const monetary = [...Object.values(input.openingWorkingCapital), ...Object.values(input.closingWorkingCapital),
    ...Object.values(input.expenses), ...(input.revenue.mode === "amount" ? [input.revenue.amounts] : [input.revenue.netUnitPrices])];
  const numericIds = monetary.flatMap(s => s.decisionId ? [s.decisionId] : []);
  if (new Set(numericIds).size !== numericIds.length) throw new Error("operating_basis_reused_contribution");
  const normalization = numericIds.length ? resolveAdoptedCurrencyValues({envelope: input.envelope, scope: input.scope, decisionIds: numericIds, groups: input.numericInterpretations}) : null;
  const normalized = new Map(normalization?.values.map(v => [v.decisionId, v]) ?? []);
  function read<T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "list", schema: z.ZodType<T>, opening = false): T | null {
    const n = s.decisionId ? normalized.get(s.decisionId) : undefined;
    bindings.push({operand: path, decisionId: s.decisionId, interpretationDecisionIds: n?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || selected.has(e.decisionId) || (e.observationId && observations.has(e.observationId))) throw new Error("operating_basis_reused_or_missing_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== input.entityId || d!.perimeter !== input.perimeter
      || d!.currency !== input.currency || d!.unit !== unit || d!.periodStart !== (opening ? null : next(input.openingDate))
      || d!.periodEnd !== (opening ? input.openingDate : input.endDate) || d!.scenario !== (opening ? input.openingScenario : input.scenario)
      || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("operating_basis_context_mismatch");
    selected.add(e.decisionId); used.set(e.decisionId, e); if (e.observationId) observations.add(e.observationId);
    if (unit === "currency") {
      if (!n?.trace) {gaps.push({operand: path, reason: "Numeric representation has not been adopted"}); return null;}
      n.interpretationDecisionIds.forEach(id => used.set(id, entries.get(id)!));
      return schema.parse(type === "number" ? n.trace.values[0] : n.trace.values);
    }
    return schema.parse(e.value.value);
  }
  read(input.convention, "operating_projection.convention", "convention", "text", z.literal("accrual_ebitda_to_cash_before_financing"));
  const ends = read(input.periodEnds, "operating_projection.periodEnds", "date", "list", z.array(z.iso.date()).min(1).max(240));
  read(input.revenue.convention, "operating_projection.revenue.convention", "convention", "text", z.literal(input.revenue.mode));
  const list = (s: z.infer<typeof selection>, path: string, sign = false, unit = "currency") => read(s, path, unit, "list", z.array(sign ? signed : unsigned).min(1).max(240));
  const revenue = input.revenue.mode === "amount"
    ? {mode: "amount" as const, values: list(input.revenue.amounts, "operating_projection.revenue.amounts")}
    : {mode: "drivers" as const, quantities: list(input.revenue.quantities, "operating_projection.revenue.quantities", false, "quantity"), prices: list(input.revenue.netUnitPrices, "operating_projection.revenue.netUnitPrices")};
  const opening: Record<string, string | null> = {}; const closing: Record<string, string[] | null> = {};
  for (const key of Object.keys(input.openingWorkingCapital) as (keyof OperatingWorkingCapital)[]) {
    opening[key] = read(input.openingWorkingCapital[key], `operating_projection.workingCapital.${key}`, "currency", "number", unsigned, true);
    closing[key] = list(input.closingWorkingCapital[key], `operating_projection.workingCapital.${key}`);
  }
  const expenses: Record<string, string[] | null> = {};
  for (const key of Object.keys(input.expenses) as (keyof typeof input.expenses)[]) expenses[key] = list(input.expenses[key], `operating_projection.${key}`, key === "nonCashEbitdaAdjustment");
  let projection: ReturnType<typeof buildOperatingCashProjection> | null = null;
  if (!gaps.length && ends) {
    const all = [...Object.values(closing), ...Object.values(expenses), ...(revenue.mode === "amount" ? [revenue.values] : [revenue.quantities, revenue.prices])];
    if (all.some(v => !v || v.length !== ends.length)) throw new Error("operating_basis_series_length_mismatch");
    const periods = ends.map((endDate, n) => ({id: endDate, startDate: n ? next(ends[n - 1]!) : next(input.openingDate), endDate,
      revenue: revenue.mode === "amount" ? {mode: "amount" as const, amount: revenue.values![n]!} : {mode: "drivers" as const, quantity: revenue.quantities![n]!, netUnitPrice: revenue.prices![n]!},
      closingWorkingCapital: Object.fromEntries(Object.entries(closing).map(([k, v]) => [k, v![n]!])),
      ...Object.fromEntries(Object.entries(expenses).map(([k, v]) => [k, v![n]!])),
    })) as OperatingProjectionPeriod[];
    projection = buildOperatingCashProjection({currency: input.currency, openingDate: input.openingDate, endDate: input.endDate,
      convention: "accrual_ebitda_to_cash_before_financing", openingWorkingCapital: opening as OperatingWorkingCapital, periods});
  }
  const payload = {schemaVersion: "adopted-operating-projection.v1" as const, financialCoreVersion,
    scope: input.scope, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    scenario: input.scenario, openingScenario: input.openingScenario, openingDate: input.openingDate, endDate: input.endDate,
    basisFingerprint: input.envelope.fingerprint, status: projection ? "partial_composition" as const : "missing_inputs" as const,
    projection, gaps, bindings, normalization, contributions: [...used.values()],
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    derivedDependencies: projection?.rows.map(row => ({periodId: row.periodId, decisionIds: [...used.keys()]})) ?? [],
    grantsExecution: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
