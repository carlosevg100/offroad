import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {financingComparisonPacketInputSchema, type FinancingComparisonPacketInput} from "./financing-comparison-packet";

const text = z.string().trim().min(1).max(2000);
export const boundFinancingComparisonInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
  /** Required only when the basis carries more than one comparison. */
  comparisonId: z.uuid().optional(),
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const roles = ["base", "stress", "sensitivity"] as const;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const path = new RegExp(`^comparison\\.(${uuid})\\.(.+)$`);

const companyMoney = ["ebitda", "cashLeasePayments", "depreciationAndAmortization", "workingCapitalCashFlow", "maintenanceCapexPaid", "growthCapexPaid"] as const;
const termTexts = ["timing", "indexer", "couponTreatment", "couponBase", "drawdownAccount", "paymentAccount"] as const;
const termLists: [string, string][] = [["couponRates", "ratio"], ["drawdowns", "currency"], ["scheduledPrincipal", "currency"], ["prepayments", "currency"], ["repayAll", "boolean"]];
const chargeLists: [string, string][] = [["chargeIds", "identity"], ["categories", "convention"], ["dates", "date"], ["amounts", "currency"], ["deductible", "boolean"]];
const lifetimeLists: [string, string][] = [["periodEnds", "date"], ["yearFractions", "ratio"], ["annualIndex", "ratio"], ["yearFractionConventions", "convention"], ["scheduledPrincipal", "currency"], ["paysAccruedInterest", "boolean"]];

/** Composes the comparison packet input from the working basis alone. A case exists only when
 * the basis adopts its role (`comparison.<id>.case.role`) for a scenario; existing debt is every
 * `debt.<id>` and each proposal every `proposal.<id>` the basis carries, with its adopted label.
 * Every operand is selected by field path and dimensions: the case's own scenario first, then the
 * declared inherited scenario. An absent operand, or one adopted twice for the same slot, is
 * declared missing with its reason. Optional parts (charges, accrued coupon schedule, company
 * policies) are composed only when the basis carries them. No number is supplied here. */
export function composeBoundFinancingComparison(raw: unknown): FinancingComparisonPacketInput {
  const input = boundFinancingComparisonInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const ids = [...new Set(entries.flatMap((e) => {const m = path.exec(e.fieldPath); return m ? [m[1]!] : [];}))].sort();
  const comparisonId = input.comparisonId ?? (ids.length === 1 ? ids[0]! : null);
  if (!comparisonId || !ids.includes(comparisonId)) throw new Error("financing_comparison_ambiguous");
  const prefix = `comparison.${comparisonId}.`;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix));
  const members = (kind: "debt" | "proposal") => [...new Set(own.flatMap((e) => {
    const m = new RegExp(`^${prefix.replace(/\./g, "\\.")}${kind}\\.(${uuid})\\.`).exec(e.fieldPath); return m ? [m[1]!] : [];}))].sort();
  const debtIds = members("debt"), proposalIds = members("proposal");
  const roleEntries = own.filter((e) => e.fieldPath === prefix + "case.role" && e.value.type === "text");
  if (!roleEntries.length) throw new Error("financing_comparison_cases_missing");
  if (!proposalIds.length) throw new Error("financing_comparison_proposals_missing");
  const cases = roleEntries.map((roleEntry) => {
    const d = roleEntry.dimensions, scenario = d.scenario!, openingDate = d.periodStart!, endDate = d.periodEnd!;
    const role = z.enum(roles).parse(roleEntry.value.value);
    const sameCase = (e: AdoptionBasisEntry, s: string) => e.dimensions.scenario === s && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
      && e.dimensions.currency === d.currency && e.dimensions.periodStart === openingDate && e.dimensions.periodEnd === endDate;
    const meta = (suffix: string, type: ValueType) => own.find((e) => e.fieldPath === prefix + suffix && e.value.type === type && sameCase(e, scenario))?.value.value;
    const inherits = meta("case.inherits", "text") as string | undefined;
    const scenarios = inherits ? [scenario, inherits] : [scenario];
    const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
    const has = (p: string) => own.some((e) => e.fieldPath === prefix + p && scenarios.some((s) => sameCase(e, s)));
    function select(p: string, unit: string, type: ValueType): Selection {
      for (const s of scenarios) {
        const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit && sameCase(e, s)
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
    const terms = (root: string) => ({
      ...Object.fromEntries(termTexts.map((k) => [k, select(`${root}.${k}`, "convention", "text")])),
      openingPrincipal: select(`${root}.openingPrincipal`, "currency", "number"),
      ...Object.fromEntries(termLists.map(([k, unit]) => [k, select(`${root}.${k}`, unit, "list")])),
      ...(has(`${root}.indexationTreatment`) ? {indexationTreatment: select(`${root}.indexationTreatment`, "convention", "text")} : {}),
      ...(has(`${root}.indexationRates`) ? {indexationRates: select(`${root}.indexationRates`, "ratio", "list")} : {}),
      ...(has(`${root}.paysAccruedCoupon`) ? {paysAccruedCoupon: select(`${root}.paysAccruedCoupon`, "boolean", "list")} : {})});
    const charges = (root: string) => has(`${root}.chargeIds`) ? {...Object.fromEntries(chargeLists.map(([k, unit]) => [k, select(`${root}.${k}`, unit, "list")])),
      ...(has(`${root}.instrumentIds`) ? {instrumentIds: select(`${root}.instrumentIds`, "identity", "list")} : {})} : null;
    const laterCharges = (root: string) => has(`${root}.chargeIds`) ? Object.fromEntries(chargeLists.filter(([k]) => k !== "deductible").map(([k, unit]) => [k, select(`${root}.${k}`, unit, "list")])) : null;
    const company = {openingAvailableCash: select("company.openingAvailableCash", "currency", "number"),
      money: Object.fromEntries(companyMoney.map((k) => [k, select(`company.${k}`, "currency", "list")])),
      cashTaxRate: select("company.cashTaxRate", "ratio", "number"), lossTaxTreatment: select("company.lossTaxTreatment", "convention", "text"),
      freeReceivablesPool: select("company.freeReceivablesPool", "currency", "number"), minimumCashFrom: select("company.minimumCashFrom", "date", "date"),
      covenantHistoryPeriods: select("company.covenantHistory.periods", "identity", "list"), covenantHistoryEbitda: select("company.covenantHistory.ebitda", "currency", "list"),
      covenantHistoryLeasePayments: select("company.covenantHistory.leasePayments", "currency", "list"),
      ...(has("company.minimumCashPolicy") ? {minimumCashPolicy: select("company.minimumCashPolicy", "currency", "number")} : {}),
      ...(has("company.maximumCollateralShare") ? {maximumCollateralShare: select("company.maximumCollateralShare", "ratio", "number")} : {})};
    const instruments = debtIds.map((id) => ({id, terms: terms(`debt.${id}`), charges: charges(`debt.${id}.charges`)}));
    const proposals = proposalIds.map((id) => {
      const root = `proposal.${id}`;
      return {id, label: (own.find((e) => e.fieldPath === `${prefix}${root}.label` && e.value.type === "text" && scenarios.some((s) => sameCase(e, s)))?.value.value as string | undefined) ?? id,
        terms: terms(`${root}.terms`), charges: charges(`${root}.charges`), collateralConsumed: select(`${root}.collateralConsumed`, "currency", "number"),
        covenant: {name: select(`${root}.covenant.name`, "identity", "text"), leaseLiabilityInDebt: select(`${root}.covenant.leaseLiabilityInDebt`, "boolean", "text"),
          leaseLiability: select(`${root}.covenant.leaseLiability`, "currency", "number"), ebitdaExcludesLeases: select(`${root}.covenant.ebitdaExcludesLeases`, "boolean", "text"),
          trailingPeriods: select(`${root}.covenant.trailingPeriods`, "count", "number"), measurementPeriods: select(`${root}.covenant.measurementPeriods`, "date", "list"),
          limit: select(`${root}.covenant.limit`, "ratio", "number"), comparator: select(`${root}.covenant.comparator`, "convention", "text")},
        lifetime: {grossAdvance: select(`${root}.lifetime.grossAdvance`, "currency", "number"), upfrontWithheldCosts: select(`${root}.lifetime.upfrontWithheldCosts`, "currency", "number"),
          annualSpread: select(`${root}.lifetime.annualSpread`, "ratio", "number"), unpaidInterestBase: select(`${root}.lifetime.unpaidInterestBase`, "convention", "text"),
          lowerSpread: select(`${root}.lifetime.lowerSpread`, "ratio", "number"), upperSpread: select(`${root}.lifetime.upperSpread`, "ratio", "number"),
          ...Object.fromEntries(lifetimeLists.map(([k, unit]) => [k, select(`${root}.lifetime.${k}`, unit, "list")])),
          ...(has(`${root}.lifetime.businessDays`) ? {businessDays: select(`${root}.lifetime.businessDays`, "count", "list")} : {}),
          ...(has(`${root}.lifetime.drawDate`) ? {drawDate: select(`${root}.lifetime.drawDate`, "date", "date")} : {}),
          ...(has(`${root}.lifetime.chargesAfterHorizon.chargeIds`) ? {chargesAfterHorizon: laterCharges(`${root}.lifetime.chargesAfterHorizon`)!} : {})}};
    });
    const periodEnds = select("periodEnds", "date", "list");
    // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
    const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
    if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
    return {id: scenario, role, label: (meta("case.label", "text") as string | undefined) ?? scenario,
      changes: role === "base" ? [] : ((meta("case.changes", "list") as string[] | undefined) ?? []),
      analysis: {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate, endDate,
        numericInterpretations: [], comparisonId, scenario, ...(inherits ? {inheritedScenario: inherits} : {}), periodEnds, company, instruments, proposals}};
  });
  cases.sort((a, b) => (a.role === "base" ? 0 : 1) - (b.role === "base" ? 0 : 1) || (a.id < b.id ? -1 : 1));
  return financingComparisonPacketInputSchema.parse({schemaVersion: "financing-comparison-packet-input.v1", question: input.question, cases});
}
