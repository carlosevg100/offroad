import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {investmentDecisionPacketInputSchema, type InvestmentDecisionPacketInput} from "./investment-decision-packet";

const text = z.string().trim().min(1).max(2000);
export const boundInvestmentPacketInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
  /** Required only when the basis carries more than one investment analysis. */
  analysisId: z.uuid().optional(),
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const roles = ["base", "sensitivity", "deferral", "staged", "alternative"] as const;
const path = /^investment\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(.+)$/;

const projectMoney = ["annualNetRevenue", "annualAvoidedOperatingCost", "annualVariableOperatingCost", "annualFixedOperatingCost", "annualMaintenanceCapex", "growthCapexPaid", "annualDepreciation"] as const;
const stockNames = ["receivables", "inventory", "newPayables", "lostSupplierCredit"] as const;
const companyMoney = ["ebitda", "nonCashEbitdaBridge", "cashLeasePayments", "netWorkingCapitalChange", "maintenanceCapex", "growthCapex",
  "taxableBaseBeforeProject", "netFinancingCashAvailable", "netCapitalCashAvailable", "netRestrictedCashMovement", "closingDebtStock"] as const;

/** Composes the investment packet input from the working basis alone. A case exists only when
 * the basis adopts its role (`investment.<id>.case.role`) for a scenario; its label, what it
 * changes and the scenario it inherits from are adopted the same way. Every operand is selected by
 * field path and dimensions: the case's own scenario first, then the declared inherited scenario.
 * An operand that is absent, or adopted more than once for the same slot, is declared missing with
 * its reason. Modes follow what the basis carries (monthly ramp or period exposures, startup
 * drivers or provided stocks, company baseline or none). No number is supplied here. */
export function composeBoundInvestmentPacket(raw: unknown): InvestmentDecisionPacketInput {
  const input = boundInvestmentPacketInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const ids = [...new Set(entries.flatMap(e => {const m = path.exec(e.fieldPath); return m ? [m[1]!] : [];}))].sort();
  const analysisId = input.analysisId ?? (ids.length === 1 ? ids[0]! : null);
  if (!analysisId || !ids.includes(analysisId)) throw new Error("investment_packet_analysis_ambiguous");
  const prefix = `investment.${analysisId}.`;
  const own = entries.filter(e => e.fieldPath.startsWith(prefix));
  const roleEntries = own.filter(e => e.fieldPath === prefix + "case.role" && e.value.type === "text");
  if (!roleEntries.length) throw new Error("investment_packet_cases_missing");
  const cases = roleEntries.map(roleEntry => {
    const d = roleEntry.dimensions, scenario = d.scenario!, openingDate = d.periodStart!, endDate = d.periodEnd!;
    const role = z.enum(roles).parse(roleEntry.value.value);
    const sameCase = (e: AdoptionBasisEntry, s: string) => e.dimensions.scenario === s && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
      && e.dimensions.currency === d.currency && e.dimensions.periodStart === openingDate && e.dimensions.periodEnd === endDate;
    const meta = (suffix: string, type: ValueType) => own.find(e => e.fieldPath === prefix + suffix && e.value.type === type && sameCase(e, scenario))?.value.value;
    const inherits = meta("case.inherits", "text") as string | undefined;
    const used = new Set<string>(), definitions: Selection[] = [];
    const missing: Selection[] = [];
    function select(p: string, unit: string, type: ValueType): Selection {
      for (const s of inherits ? [scenario, inherits] : [scenario]) {
        const matches = own.filter(e => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit && sameCase(e, s)
          && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
        if (matches.length === 1) {
          const e = matches[0]!; used.add(e.decisionId);
          const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
          definitions.push(selection); return selection;
        }
        if (matches.length > 1) {
          const selection = {decisionId: null, definitionVersionId: roleEntry.dimensions.definitionVersionId!, definitionKind: roleEntry.definitionKind,
            missingReason: `${matches.length} contributions match ${p} for scenario ${s}; keep one value per slot in the working basis`};
          missing.push(selection); return selection;
        }
      }
      const selection = {decisionId: null, definitionVersionId: roleEntry.dimensions.definitionVersionId!, definitionKind: roleEntry.definitionKind,
        missingReason: `No contribution adopted for ${p} in scenario ${scenario}${inherits ? ` or inherited ${inherits}` : ""}`};
      missing.push(selection); return selection;
    }
    const has = (p: string) => own.some(e => e.fieldPath === prefix + p && (sameCase(e, scenario) || (inherits !== undefined && sameCase(e, inherits))));
    const money = (keys: readonly string[], root: string) => Object.fromEntries(keys.map(k => [k, select(root + k, "currency", "list")]));
    const number = (p: string, unit: string) => select(p, unit, "number");
    const startup = has("project.startup.lostSupplierDays");
    const project = {
      money: money(projectMoney, "project."),
      openingWorkingCapital: Object.fromEntries(stockNames.map(k => [k, number("project.openingWorkingCapital." + k, "currency")])),
      cashTaxRate: select("project.cashTaxRate", "ratio", "list"), lossTaxTreatment: select("project.lossTaxTreatment", "convention", "list"),
      fixedCostScaling: select("project.fixedCostScaling", "convention", "list"),
      exposure: has("project.ramp.operationStartMonth")
        ? {mode: "monthly_ramp", operationStartMonth: select("project.ramp.operationStartMonth", "date", "date"), stageMonths: select("project.ramp.stageMonths", "months", "list"),
          stageLoads: select("project.ramp.stageLoads", "ratio", "list"), terminalLoad: number("project.ramp.terminalLoad", "ratio")}
        : {mode: "provided_period_exposures", loadYearFractions: select("project.exposure.loadYearFractions", "ratio", "list"), activeYearFractions: select("project.exposure.activeYearFractions", "ratio", "list")},
      closingWorkingCapital: startup
        ? {mode: "startup_drivers", startup: {money: Object.fromEntries(["annualIncrementalRevenue", "annualNewVariableCost", "annualDisplacedPurchases"].map(k => [k, number("project.startup." + k, "currency")])),
          days: Object.fromEntries(["receivableDays", "inventoryDays", "newSupplierDays", "lostSupplierDays"].map(k => [k, number("project.startup." + k, "days")])),
          adoptedYearDays: select("project.startup.adoptedYearDays", "convention", "text")}, retainedCapitalMultipliers: select("project.startup.retainedCapitalMultipliers", "ratio", "list")}
        : {mode: "provided_stocks", stocks: Object.fromEntries(stockNames.map(k => [k, select("project.closingWorkingCapital." + k, "currency", "list")]))},
    };
    const company = has("company.ebitda") ? {openingAvailableCash: number("company.openingAvailableCash", "currency"), openingRestrictedCash: number("company.openingRestrictedCash", "currency"),
      money: money(companyMoney, "company."), cashTaxRate: select("company.cashTaxRate", "ratio", "list"), lossTaxTreatment: select("company.lossTaxTreatment", "convention", "list"),
      debtInventoryStatus: select("company.debtInventoryStatus", "convention", "text"), debtIds: select("company.debtIds", "identity", "list"), finalPaymentDates: select("company.finalPaymentDates", "date", "list")} : null;
    const valuation = {perspective: select("valuation.perspective", "convention", "text"), baseDate: select("valuation.baseDate", "date", "date"),
      timing: select("valuation.timing", "convention", "text"), adoptedTimes: select("valuation.adoptedTimes", "years", "list"),
      discountRate: number("valuation.discountRate", "ratio"), irrLower: number("valuation.irrLower", "ratio"), irrUpper: number("valuation.irrUpper", "ratio"),
      precisionMode: select("valuation.precisionMode", "convention", "text"), precisionDecimals: number("valuation.precisionDecimals", "count"),
      precisionQuantum: number("valuation.precisionQuantum", "currency")};
    const periodEnds = select("periodEnds", "date", "list");
    // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
    const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
    if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
    return {id: scenario, role, label: (meta("case.label", "text") as string | undefined) ?? scenario,
      changes: role === "base" ? [] : ((meta("case.changes", "list") as string[] | undefined) ?? []),
      analysis: {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate, endDate,
        numericInterpretations: [], analysisId, scenario, ...(inherits ? {inheritedScenario: inherits} : {}), periodEnds, project, company, valuation}};
  });
  cases.sort((a, b) => (a.role === "base" ? 0 : 1) - (b.role === "base" ? 0 : 1) || (a.id < b.id ? -1 : 1));
  return investmentDecisionPacketInputSchema.parse({schemaVersion: "investment-decision-packet-input.v1", question: input.question, cases});
}
