import {hasUnitScale} from "./adopted-input-scale";
import {createHash} from "node:crypto";
import {z} from "zod";
import {buildDatedDebtCashFlows, buildLiquidityCalendar, financialCoreVersion, type DatedDebtInput, type LiquidityEvent} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";

const selection = z.strictObject({decisionId: z.uuid().nullable(), definitionVersionId: z.uuid(), definitionKind: z.enum(["reported", "managerial", "contractual"]), missingReason: z.string().trim().min(1).max(2000).nullable()})
  .refine(s => (s.decisionId === null) === (s.missingReason !== null), "Select a contribution or explain its absence");
const terms = z.strictObject({
  timing: selection, indexer: selection, indexationTreatment: selection, couponTreatment: selection,
  couponBase: selection, drawdownAccount: selection, paymentAccount: selection,
  openingPrincipal: selection, periodEnds: selection, indexationRates: selection, couponRates: selection,
  drawdowns: selection, scheduledPrincipal: selection, prepayments: selection, repayAll: selection,
});
// Direct cash convention: no accrual-to-cash working-capital adjustment can be added.
// Operating payments exclude the separately declared capex and operating tax categories.
const cashCategories = {
  operating_receipts: "inflow", operating_payments_excluding_capex_and_tax: "outflow",
  capex: "outflow", operating_tax: "outflow",
} as const;
export const adoptedDebtLiquidityInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  entityId: z.uuid(), perimeter: z.string().trim().min(1).max(300), currency: z.string().regex(/^[A-Z]{3}$/),
  openingScenario: z.string().trim().min(1).max(160), scenario: z.string().trim().min(1).max(160),
  openingDate: z.iso.date(), endDate: z.iso.date(),
  openingAvailable: selection, openingRestricted: selection,
  instruments: z.array(z.strictObject({id: z.uuid(), terms})).min(1).max(16),
  operatingEvents: z.array(z.strictObject({id: z.string().trim().min(1).max(160), date: z.iso.date(), account: z.enum(["available", "restricted"]), category: z.enum(Object.keys(cashCategories) as [keyof typeof cashCategories, ...Array<keyof typeof cashCategories>]), selection})).max(256),
  coverageReason: z.string().trim().min(5).max(2000),
}).refine(i => i.endDate > i.openingDate, "Invalid horizon")
  .refine(i => new Set(i.instruments.map(d => d.id)).size === i.instruments.length, "Duplicate instrument")
  .refine(i => new Set(i.operatingEvents.map(e => e.id)).size === i.operatingEvents.length, "Duplicate cash event");
const nextDate = (value: string) => {const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);};
const money = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const unsigned = z.string().regex(/^\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^-?\d{1,4}(?:\.\d{1,16})?$/);

/** Pure integrity/context adapter. The envelope must come from the authorized SQL reader;
 * digest, context and retained contribution IDs do not grant access or prove source rights.
 * Curves are typed existing list values, not encoded JSON. All inputs must declare unit
 * scale: the basis reader preserves assertions and does not prove normalization. No math here.
 */
export function calculateAdoptedDebtLiquidity(raw: unknown) {
  const input = adoptedDebtLiquidityInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = new Map(basis.entries.map(e => [e.decisionId, e]));
  const used = new Map<string, AdoptionBasisEntry>();
  const observationUses = new Map<string, string>();
  const bindings: {operand: string; decisionId: string | null; missingReason: string | null}[] = [];
  const gaps: {operand: string; reason: string}[] = [];
  function read<T>(s: z.infer<typeof selection>, operand: string, path: string, unit: string, periodStart: string | null, periodEnd: string, scenario: string, type: "number" | "text" | "list", schema: z.ZodType<T>): T | null {
    bindings.push({operand, decisionId: s.decisionId, missingReason: s.missingReason});
    if (!s.decisionId) {gaps.push({operand, reason: s.missingReason!}); return null;}
    const e = entries.get(s.decisionId); const d = e?.dimensions;
    if (!e || used.has(e.decisionId)) throw new Error("debt_basis_missing_or_reused_contribution");
    if (e.fieldPath !== path || e.value.type !== type || e.definitionKind !== s.definitionKind
      || d!.definitionVersionId !== s.definitionVersionId || d!.entityId !== input.entityId || d!.perimeter !== input.perimeter
      || d!.currency !== input.currency || d!.unit !== unit || d!.periodStart !== periodStart || d!.periodEnd !== periodEnd
      || d!.scenario !== scenario || !hasUnitScale(d!.scale)) throw new Error("debt_basis_context_mismatch");
    // One original observation cannot be counted again through a second hypothesis/slot.
    // A series is adopted once and can generate any number of intermediate events.
    if (e.observationId) {
      if (observationUses.has(e.observationId)) throw new Error("debt_basis_reused_observation");
      observationUses.set(e.observationId, operand);
    }
    used.set(e.decisionId, e);
    return schema.parse(e.value.value);
  }
  const openingAvailable = read(input.openingAvailable, "opening.available", "liquidity.available_cash", "currency", null, input.openingDate, input.openingScenario, "number", money);
  const openingRestricted = read(input.openingRestricted, "opening.restricted", "liquidity.restricted_cash", "currency", null, input.openingDate, input.openingScenario, "number", unsigned);
  const firstDate = nextDate(input.openingDate);
  const instruments: DatedDebtInput["instruments"][number][] = [];
  const instrumentBindings = new Map<string, string[]>();
  for (const instrument of input.instruments) {
    const start = bindings.length;
    const term = <T>(key: keyof typeof instrument.terms, unit: string, type: "text" | "list", schema: z.ZodType<T>) => read(instrument.terms[key], `debt.${instrument.id}.${key}`, `debt.${instrument.id}.${key}`, unit, firstDate, input.endDate, input.scenario, type, schema);
    const principal = read(instrument.terms.openingPrincipal, `debt.${instrument.id}.openingPrincipal`, `debt.${instrument.id}.openingPrincipal`, "currency", null, input.openingDate, input.openingScenario, "number", unsigned);
    const timing = term("timing", "convention", "text", z.literal("draw_at_period_start_pay_at_period_end"));
    const indexer = term("indexer", "convention", "text", z.enum(["none", "IPCA", "CDI", "SOFR", "fixed", "other"]));
    const indexationTreatment = term("indexationTreatment", "convention", "text", z.enum(["not_applicable", "cash_paid", "capitalized_principal"]));
    const couponTreatment = term("couponTreatment", "convention", "text", z.enum(["cash_paid", "capitalized_principal"]));
    const couponBase = term("couponBase", "convention", "text", z.enum(["opening_principal", "indexed_principal", "average_principal"]));
    const drawdownAccount = term("drawdownAccount", "convention", "text", z.enum(["available", "restricted"]));
    const paymentAccount = term("paymentAccount", "convention", "text", z.enum(["available", "restricted"]));
    const periodEnds = term("periodEnds", "date", "list", z.array(z.iso.date()).min(1).max(2000));
    const indexationRates = term("indexationRates", "ratio", "list", z.array(ratio).min(1).max(2000));
    const couponRates = term("couponRates", "ratio", "list", z.array(ratio).min(1).max(2000));
    const drawdowns = term("drawdowns", "currency", "list", z.array(unsigned).min(1).max(2000));
    const scheduledPrincipal = term("scheduledPrincipal", "currency", "list", z.array(unsigned).min(1).max(2000));
    const prepayments = term("prepayments", "currency", "list", z.array(unsigned).min(1).max(2000));
    const repayAll = term("repayAll", "boolean", "list", z.array(z.enum(["true", "false"])).min(1).max(2000));
    instrumentBindings.set(instrument.id, bindings.slice(start).flatMap(b => b.decisionId ? [b.decisionId] : []));
    if (principal === null || timing === null || indexer === null || indexationTreatment === null || couponTreatment === null || couponBase === null || drawdownAccount === null || paymentAccount === null || periodEnds === null || indexationRates === null || couponRates === null || drawdowns === null || scheduledPrincipal === null || prepayments === null || repayAll === null) continue;
    if ([indexationRates, couponRates, drawdowns, scheduledPrincipal, prepayments, repayAll].some(v => v.length !== periodEnds.length)) throw new Error("debt_basis_series_length_mismatch");
    instruments.push({instrumentId: instrument.id, currency: input.currency, openingPrincipal: principal, indexer, indexationTreatment, couponTreatment, couponBase, drawdownAccount, paymentAccount,
      periods: periodEnds.map((endDate, i) => ({period: endDate, startDate: i ? nextDate(periodEnds[i - 1]!) : firstDate, endDate,
        indexationRate: indexationRates[i]!, couponRate: couponRates[i]!, drawdown: drawdowns[i]!, scheduledPrincipal: scheduledPrincipal[i]!, prepayment: prepayments[i]!, repayAll: repayAll[i] === "true"})),
    });
  }
  const operatingEvents: LiquidityEvent[] = input.operatingEvents.map(event => {
    if (event.date <= input.openingDate || event.date > input.endDate) throw new Error("debt_basis_cash_date_outside_horizon");
    const amount = read(event.selection, `operating.${event.id}`, `cash.${event.account}.${event.category}`, "currency", event.date, event.date, input.scenario, "number", unsigned);
    return {id: JSON.stringify(["operating", event.id]), date: event.date, account: event.account, direction: cashCategories[event.category], amount, missingReason: event.selection.missingReason};
  });
  const debt = gaps.length ? null : buildDatedDebtCashFlows({openingDate: input.openingDate, endDate: input.endDate, currency: input.currency, convention: "draw_at_period_start_pay_at_period_end", instruments});
  const liquidity = debt ? buildLiquidityCalendar({openingDate: input.openingDate, endDate: input.endDate, currency: input.currency,
    convention: "end_of_day_netting", coverage: {status: "partial", reason: `Financing fees and taxes not included. Declared operating coverage: ${input.coverageReason}`},
    openingAvailable, openingRestricted, events: [...operatingEvents, ...debt.events],
  }) : null;
  const payload = {
    schemaVersion: "adopted-debt-liquidity.v1" as const, financialCoreVersion,
    calculationIds: ["financial.dated_debt_cash_flows", "financial.dated_liquidity"] as const,
    scope: input.scope, entityId: input.entityId, perimeter: input.perimeter, currency: input.currency,
    openingDate: input.openingDate, endDate: input.endDate, openingScenario: input.openingScenario, scenario: input.scenario,
    basisFingerprint: input.envelope.fingerprint, status: gaps.length ? "missing_inputs" as const : "partial_composition" as const,
    exclusions: ["financing_fees", "financing_taxes", "all_in_cost"] as const, coverageReason: input.coverageReason,
    classification: [...used.values()].some(e => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    debt, liquidity, gaps, bindings, contributions: [...used.values()],
    derivedDependencies: debt?.events.map(event => ({eventId: event.id, decisionIds: instrumentBindings.get(event.instrumentId)!})) ?? [],
    grantsExecution: false as const,
  };
  return {...payload, fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
