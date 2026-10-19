import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {debtCapacityPacketInputSchema, type DebtCapacityPacketInput} from "./debt-capacity-packet";

const text = z.string().trim().min(1).max(2000);
export const boundDebtCapacityInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const analysisPath = new RegExp(`^debt_capacity\\.(${uuid})\\.case\\.role$`);
const scenarioPath = new RegExp(`^scenario\\.(${uuid})\\.periodEnds$`);
const rulePath = new RegExp(`^scenario\\.(${uuid})\\.rule\\.(${uuid})\\.kind$`);
const limitPath = /^limit\.([a-z0-9][a-z0-9-]{0,39})\.ruleIds$/;

const affineNames = ["ebitda", "covenantEbitdaAdjustment", "nonCashEbitdaBridge", "cashLeasePayments", "changeInWorkingCapital", "maintenanceCapex", "growthCapex",
  "taxableBaseBeforeNewDebtInterest", "otherExistingFinancingCashAvailable", "capitalCashAvailable"] as const;
const moneyNames = ["existingCashInterest", "existingCashPrincipalPaid", "existingDebtForRatio"] as const;
const conventionNames = ["lossTaxTreatment", "newDebtTaxDeduction", "cfadsGrowthCapexTreatment"] as const;
const financingRatioNames = ["drawAtStart", "drawAtEnd", "principalPaidAtEnd", "interestFactorOnOpeningAndStartDraw",
  "interestFactorOnEndDraw", "interestFactorCreditOnEndAmortization", "withheldCostPerUnitDraw"] as const;
const financingConventionNames = ["factorConvention", "paysAccruedInterest", "unpaidInterestBase"] as const;

/** Composes the capacity packet input from the working basis alone. A case exists only when the
 * basis adopts its role (`debt_capacity.<analysis>.case.role`); its scenarios are every
 * `scenario.<id>` the basis carries for it, its rules every `rule.<id>` of each scenario and its
 * limits every `limit.<key>` naming those rules. Every operand is selected by field path, scenario
 * and the case's own dimensions; an absent operand, or one adopted twice for the same slot, is
 * declared missing with its reason. No number is supplied here. */
export function composeBoundDebtCapacity(raw: unknown): DebtCapacityPacketInput {
  const input = boundDebtCapacityInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m && e.value.type === "text" ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("debt_capacity_cases_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== roles.length) throw new Error("debt_capacity_case_role_ambiguous");
  const cases = roles.map(({analysisId, entry: roleEntry}) => {
    const prefix = `debt_capacity.${analysisId}.`, d = roleEntry.dimensions, top = d.scenario!;
    const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
      && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
    const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
    function select(p: string, scenario: string, unit: string, type: ValueType): Selection {
      const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit && e.dimensions.scenario === scenario
        && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
      if (matches.length === 1) {
        const e = matches[0]!; used.add(e.decisionId);
        const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
        definitions.push(selection); return selection;
      }
      const selection = {decisionId: null, definitionVersionId: roleEntry.dimensions.definitionVersionId!, definitionKind: roleEntry.definitionKind,
        missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${scenario}; keep one value per slot in the working basis`
          : `No contribution adopted for ${p} in scenario ${scenario}`};
      missing.push(selection); return selection;
    }
    const meta = (suffix: string, type: ValueType) => own.find((e) => e.fieldPath === prefix + suffix && e.value.type === type && e.dimensions.scenario === top)?.value.value;
    const role = z.enum(["informed", "alternative"]).parse(roleEntry.value.value);
    const scenarioIds = [...new Set(own.flatMap((e) => {const m = scenarioPath.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].sort();
    const scenarios = scenarioIds.map((sid) => {
      const label = own.find((e) => e.fieldPath === `${prefix}scenario.${sid}.periodEnds`)!.dimensions.scenario!;
      const p = `scenario.${sid}.`, at = (name: string, unit: string, type: ValueType) => select(p + name, label, unit, type);
      const ruleIds = [...new Set(own.flatMap((e) => {const m = rulePath.exec(e.fieldPath.slice(prefix.length)); return m && m[1] === sid ? [m[2]!] : [];}))].sort();
      return {id: sid, scenario: label, terms: {openingAvailableCash: at("openingAvailableCash", "currency", "number"), cashNetting: at("cashNetting", "convention", "text"),
        includeNewAccruedInterestInDebt: at("includeNewAccruedInterestInDebt", "convention", "boolean"), periodEnds: at("periodEnds", "date", "list"),
        affine: Object.fromEntries(affineNames.map((k) => [k, {fixed: at(`${k}.fixed`, "currency", "list"), perUnitNewDebt: at(`${k}.perUnitNewDebt`, "ratio", "list")}])),
        money: Object.fromEntries(moneyNames.map((k) => [k, at(k, "currency", "list")])), ratios: {cashTaxRate: at("cashTaxRate", "ratio", "list")},
        conventions: Object.fromEntries(conventionNames.map((k) => [k, at(k, "convention", "list")])), cfadsDefinitionAnchors: at("cfadsDefinitionAnchors", "reference_id", "list"),
        newFinancing: {ratios: Object.fromEntries(financingRatioNames.map((k) => [k, at(`newFinancing.${k}`, "ratio", "list")])),
          conventions: Object.fromEntries(financingConventionNames.map((k) => [k, at(`newFinancing.${k}`, "convention", "list")]))}},
        rules: ruleIds.map((rid) => {
          const kind = at(`rule.${rid}.kind`, "convention", "text");
          const value = own.find((e) => e.decisionId === kind.decisionId)?.value;
          return {id: rid, kind, threshold: at(`rule.${rid}.threshold`, value?.type === "text" && value.value === "minimum_available_cash" ? "currency" : "ratio", "number")};
        })};
    });
    const limitKeys = [...new Set(own.flatMap((e) => {const m = limitPath.exec(e.fieldPath.slice(prefix.length)); return m && e.dimensions.scenario === top ? [m[1]!] : [];}))].sort();
    const limits = limitKeys.map((k) => ({id: k, label: (meta(`limit.${k}.label`, "text") as string | undefined) ?? k, ruleIds: (meta(`limit.${k}.ruleIds`, "list") as string[] | undefined) ?? []}));
    const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate: d.periodStart!, endDate: d.periodEnd!,
      numericInterpretations: [], analysisId, scenario: top,
      maximumAmount: select("maximumAmount", top, "currency", "number"), monetaryQuantum: select("monetaryQuantum", top, "currency", "number"),
      fixedReviewAmount: own.some((e) => e.fieldPath === `${prefix}fixedReviewAmount`) ? select("fixedReviewAmount", top, "currency", "number") : null,
      horizonMode: select("horizonMode", top, "convention", "text"), newDebtFinalPaymentDate: select("newDebtFinalPaymentDate", top, "date", "date"),
      existingDebtFinalPaymentDates: select("existingDebtFinalPaymentDates", top, "date", "list"), scenarios};
    // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
    const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
    if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
    return {id: top.replace(/:base$/, ""), role, label: (meta("case.label", "text") as string | undefined) ?? top,
      changes: role === "informed" ? [] : ((meta("case.changes", "list") as string[] | undefined) ?? []), analysis, limits};
  });
  cases.sort((a, b) => (a.role === "informed" ? 0 : 1) - (b.role === "informed" ? 0 : 1) || (a.id < b.id ? -1 : 1));
  return debtCapacityPacketInputSchema.parse({schemaVersion: "debt-capacity-packet-input.v1", question: input.question, cases});
}
