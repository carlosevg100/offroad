import {createHash} from "node:crypto";
import {z} from "zod";
import {buildCapitalPeriodCash, financialCoreVersion, type CapitalMovement, type CapitalPeriodCashInput} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedFinancingInputSchema, calculateAdoptedFinancingLiquidity} from "./adopted-financing-costs";
import {adoptedOperatingProjectionInputSchema, calculateAdoptedOperatingProjection} from "./adopted-operating-projection";
import {resolveAdoptedCurrencyValues} from "./adopted-numeric-representation";
import {hasUnitScale} from "./adopted-input-scale";

export const adoptedCapitalPeriodCashInputSchema = z.strictObject({
  operating: adoptedOperatingProjectionInputSchema,
  funding: z.discriminatedUnion("kind", [
    z.strictObject({kind: z.literal("debt"), input: adoptedFinancingInputSchema}),
    z.strictObject({kind: z.literal("no_debt"), inventory: selection, openingAvailable: selection, openingRestricted: selection}),
  ]),
  operatingCashAccount: selection, capitalMovementInventory: selection,
  capitalMovements: z.strictObject({ids: selection, economicIds: selection, dates: selection,
    amounts: selection, accounts: selection, kinds: selection, reasons: selection}).nullable(),
});
const next = (value: string) => {const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);};
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const positive = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);

/** Binds operating, debt and capital cash to one immutable basis. Partial budgets do not
 * certify completeness, a market quote or execution authority. No direct cash-flow overlay
 * can be mixed with the accrual-to-cash budget and counted twice. */
export function calculateAdoptedCapitalPeriodCash(raw: unknown) {
  const input = adoptedCapitalPeriodCashInputSchema.parse(raw); const context = input.operating;
  const operation = calculateAdoptedOperatingProjection(context);
  let funded: ReturnType<typeof calculateAdoptedFinancingLiquidity> | null = null;
  if (input.funding.kind === "debt") {
    const f = input.funding.input;
    for (const field of ["entityId", "perimeter", "currency", "scenario", "openingScenario", "openingDate", "endDate"] as const) {
      if (f[field] !== context[field]) throw new Error("capital_basis_context_mismatch");
    }
    if (f.envelope.canonical !== context.envelope.canonical || f.envelope.fingerprint !== context.envelope.fingerprint
      || f.scope.workId !== context.scope.workId || f.scope.purpose !== context.scope.purpose || f.scope.versionId !== context.scope.versionId) throw new Error("capital_basis_snapshot_mismatch");
    if (f.operatingEvents.length) throw new Error("capital_basis_duplicate_direct_operating_cash");
    funded = calculateAdoptedFinancingLiquidity(f);
  }
  const basis = readContextualBasis(context.envelope, context.scope); const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>(); const observations = new Map<string, string>();
  function retain(e: AdoptionBasisEntry) {
    const prior = e.observationId ? observations.get(e.observationId) : undefined;
    if (prior && prior !== e.decisionId) throw new Error("capital_basis_reused_observation");
    if (e.observationId) observations.set(e.observationId, e.decisionId);
    used.set(e.decisionId, e);
  }
  [...operation.contributions, ...(funded?.contributions ?? [])].forEach(retain);
  const gaps = [...operation.gaps, ...(funded?.gaps ?? [])];
  const bindings: {operand: string; decisionId: string | null; interpretationDecisionIds: string[]}[] = [];
  const numericIds = [...(input.capitalMovements ? [input.capitalMovements.amounts] : []),
    ...(input.funding.kind === "no_debt" ? [input.funding.openingAvailable, input.funding.openingRestricted] : [])].flatMap(s => s.decisionId ? [s.decisionId] : []);
  const normalization = numericIds.length ? resolveAdoptedCurrencyValues({envelope: context.envelope, scope: context.scope, decisionIds: numericIds, groups: context.numericInterpretations}) : null;
  const normalized = new Map(normalization?.values.map(v => [v.decisionId, v]) ?? []);
  function read<T>(s: z.infer<typeof selection>, path: string, unit: string, type: "number" | "text" | "list", schema: z.ZodType<T>, opening = false): T | null {
    const numeric = s.decisionId ? normalized.get(s.decisionId) : undefined;
    bindings.push({operand: path, decisionId: s.decisionId, interpretationDecisionIds: numeric?.interpretationDecisionIds ?? []});
    if (!s.decisionId) {gaps.push({operand: path, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || used.has(e.decisionId)) throw new Error("capital_basis_reused_or_missing_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== context.entityId || d!.perimeter !== context.perimeter
      || d!.currency !== context.currency || d!.unit !== unit || d!.periodStart !== (opening ? null : next(context.openingDate))
      || d!.periodEnd !== (opening ? context.openingDate : context.endDate) || d!.scenario !== (opening ? context.openingScenario : context.scenario)
      || (unit !== "currency" && !hasUnitScale(d!.scale))) throw new Error("capital_basis_context_mismatch");
    retain(e);
    if (unit === "currency") {
      if (!numeric?.trace) {gaps.push({operand: path, reason: "Numeric representation has not been adopted"}); return null;}
      numeric.interpretationDecisionIds.forEach(id => retain(entries.get(id)!));
      return schema.parse(type === "number" ? numeric.trace.values[0] : numeric.trace.values);
    }
    return schema.parse(e.value.value);
  }
  read(input.operatingCashAccount, "capital.operatingCashAccount", "convention", "text", z.literal("available"));
  const inventory = read(input.capitalMovementInventory, "capital.movementInventory", "convention", "text", z.enum(["declared_complete", "unknown"]));
  const inventoryReason = input.capitalMovementInventory.decisionId ? entries.get(input.capitalMovementInventory.decisionId)!.reason : input.capitalMovementInventory.missingReason!;
  if (inventory === "unknown") gaps.push({operand: "capital.movementInventory", reason: inventoryReason});
  let openingAvailable = funded?.liquidity?.opening.available ?? null; let openingRestricted = funded?.liquidity?.opening.restricted ?? null;
  let noDebtReason: string | null = null;
  if (input.funding.kind === "no_debt") {
    const declaration = read(input.funding.inventory, "capital.financingInventory", "convention", "text", z.literal("no_debt_or_financing"));
    noDebtReason = declaration && input.funding.inventory.decisionId ? entries.get(input.funding.inventory.decisionId)!.reason : null;
    openingAvailable = read(input.funding.openingAvailable, "liquidity.available_cash", "currency", "number", money, true);
    openingRestricted = read(input.funding.openingRestricted, "liquidity.restricted_cash", "currency", "number", positive, true);
  }
  const movements: CapitalMovement[] = [];
  if (input.capitalMovements) {
    const selections = input.capitalMovements;
    const list = <T>(name: keyof typeof selections, unit: string, schema: z.ZodType<T>) => read(selections[name], `capital.movements.${name}`, unit, "list", z.array(schema).min(1).max(2000));
    const ids = list("ids", "identity", z.string().trim().min(1).max(160)); const economicIds = list("economicIds", "identity", z.string().trim().min(1).max(160));
    const dates = list("dates", "date", z.iso.date()); const amounts = list("amounts", "currency", positive);
    const accounts = list("accounts", "convention", z.enum(["available", "restricted"]));
    const kinds = list("kinds", "convention", z.enum(["equity_contribution", "distribution", "asset_sale", "acquisition"]));
    const reasons = list("reasons", "explanation", z.string().trim().min(1).max(2000));
    if (ids && economicIds && dates && amounts && accounts && kinds && reasons) {
      if ([economicIds, dates, amounts, accounts, kinds, reasons].some(v => v.length !== ids.length)) throw new Error("capital_basis_series_length_mismatch");
      ids.forEach((id, n) => movements.push({id, economicId: economicIds[n]!, date: dates[n]!, amount: amounts[n]!, account: accounts[n]!, kind: kinds[n]!, reason: reasons[n]!}));
    }
  }
  let cash: ReturnType<typeof buildCapitalPeriodCash> | null = null;
  if (!gaps.length && operation.projection) {
    const op = operation.projection;
    const financing: CapitalPeriodCashInput["financing"] = input.funding.kind === "no_debt"
      ? {status: "no_debt_or_financing", reason: noDebtReason!} : {status: "provided", input: funded!.financing!.operands};
    cash = buildCapitalPeriodCash({operating: {currency: op.currency, openingDate: op.openingDate, endDate: op.endDate, convention: op.convention,
      openingWorkingCapital: op.rows[0]!.operands.openingWorkingCapital, periods: op.rows.map(row => row.operands)},
      financing, openingAvailable, openingRestricted, operatingCashAccount: "available", capitalMovements: movements,
      capitalMovementInventory: {status: inventory!, reason: inventoryReason}});
  }
  const payload = {schemaVersion: "adopted-capital-period-cash.v1" as const, financialCoreVersion,
    scope: context.scope, entityId: context.entityId, perimeter: context.perimeter, currency: context.currency,
    scenario: context.scenario, openingScenario: context.openingScenario, openingDate: context.openingDate, endDate: context.endDate,
    basisFingerprint: context.envelope.fingerprint, status: cash?.status === "calculated" ? "partial_composition" as const : "missing_inputs" as const,
    operation, funding: funded, cash, gaps, bindings, normalization, contributions: [...used.values()],
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    derivedDependencies: cash?.rows?.map(row => ({periodId: row.periodId, decisionIds: [...used.keys()]})) ?? [], grantsExecution: false as const};
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
