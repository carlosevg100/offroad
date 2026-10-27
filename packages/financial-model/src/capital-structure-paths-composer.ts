import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {capitalPathsPacketInputSchema, type CapitalPathsPacketInput} from "./capital-structure-paths-packet";

const text = z.string().trim().min(1).max(2000);
export const boundCapitalPathsInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const analysisPath = new RegExp(`^capital_paths\\.(${uuid})\\.`);
const groupPath = (group: string) => new RegExp(`^${group}\\.(${k})\\.[A-Za-z]+$`);

/** Composes the capital paths packet input from the working basis alone. The basis carries one analysis
 * (`capital_paths.<analysis>.`); its variants, instruments, paths and sensitivities are every id the adopted
 * order lists and every `variant.<key>`, `instrument.<key>`, `path.<key>` or `sensitivity.<key>` a field path
 * names, listed ones first. The board policy and the indenture basket are composed when any of their terms is
 * adopted, and then every term is selected. Every operand is selected by field path, scenario, unit and type
 * in the analysis's own dimensions; an absent operand, or one adopted twice for the same slot, is declared
 * missing with its reason. Optional operands absent stay null. */
export function composeBoundCapitalPaths(raw: unknown): CapitalPathsPacketInput {
  const input = boundCapitalPathsInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("capital_paths_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("capital_paths_analysis_ambiguous");
  // The adopted opening cash anchors the dimensions when present.
  const analysisId = roles[0]!.analysisId, anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".company.openingAvailable")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!;
  const prefix = `capital_paths.${analysisId}.`;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.scenario === sc && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, unit: string, type: ValueType): Selection {
    const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit
      && (unit === "currency" || hasUnitScale(e.dimensions.scale)) && !used.has(e.decisionId));
    if (matches.length === 1) {
      const e = matches[0]!; used.add(e.decisionId);
      const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(selection); return selection;
    }
    const selection = {decisionId: null, definitionVersionId: anchor.dimensions.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${sc}; keep one value per slot in the working basis`
        : `No contribution adopted for ${p} in scenario ${sc}`};
    missing.push(selection); return selection;
  }
  const has = (p: string) => own.some((e) => e.fieldPath === prefix + p);
  const anyOf = (paths: string[]) => paths.some(has);
  const optional = (p: string, unit: string, type: ValueType) => has(p) ? select(p, unit, type) : null;
  const order = (p: string) => {
    const found = own.filter((e) => e.fieldPath === prefix + p && e.value.type === "list");
    if (found.length > 1) throw new Error("capital_paths_order_ambiguous");
    const list = z.array(z.string().regex(new RegExp(`^${k}$`))).parse(found[0]?.value.value ?? []);
    if (new Set(list).size !== list.length) throw new Error("capital_paths_order_ambiguous");
    return list;
  };
  // Every id the adopted order lists or any field path names is composed; none disappears silently.
  const keys = (group: string, orderPath: string) => {
    const listed = order(orderPath), pattern = groupPath(group);
    const seen = [...new Set(own.flatMap((e) => {const m = pattern.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !listed.includes(x)).sort();
    return [...listed, ...seen];
  };
  const n = (p: string, unit: string) => select(p, unit, "number"), t = (p: string, unit: string) => select(p, unit, "text");
  const dt = (p: string) => select(p, "date", "date"), l = (p: string, unit: string) => select(p, unit, "list");
  const policyFields = ["policyLimit", "policyComparator", "policyDates", "policySource", "policyDefinition"].map((x) => `covenant.${x}`);
  const basketFields = ["holderId", "limit", "basis", "occupied", "source"].map((x) => `basket.${x}`);
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate: d.periodStart!, endDate: d.periodEnd!,
    numericInterpretations: [], analysisId, scenario: sc,
    company: {openingAvailable: n("company.openingAvailable", "currency"), minimumCash: n("company.minimumCash", "currency"), periodEnds: l("company.periodEnds", "date"),
      availableForService: t("company.availableForService", "convention")},
    index: {byPeriod: l("index.byPeriod", "ratio"), afterYears: l("index.afterYears", "identity"), afterRates: l("index.afterRates", "ratio")},
    tax: {rate: n("tax.rate", "ratio"), lossTreatment: t("tax.lossTreatment", "convention")},
    operating: {ebitda: l("operating.ebitda", "currency"), depreciation: l("operating.depreciation", "currency"), leasePayments: l("operating.leasePayments", "currency"),
      workingCapitalCashFlow: l("operating.workingCapitalCashFlow", "currency"), maintenanceCapex: l("operating.maintenanceCapex", "currency")},
    variants: keys("variant", "order.variants").map((id) => {const q = `variant.${id}.`; return {id, label: t(q + "label", "text"), kind: t(q + "kind", "convention"),
      ebitda: optional(q + "ebitda", "currency", "list"), depreciation: optional(q + "depreciation", "currency", "list"), maintenanceCapex: optional(q + "maintenanceCapex", "currency", "list"),
      growthCapex: optional(q + "growthCapex", "currency", "list"), startupWorkingCapitalCashFlow: optional(q + "startupWorkingCapitalCashFlow", "currency", "list")};}),
    stress: {label: t("stress.label", "text"), ebitdaFactor: n("stress.ebitdaFactor", "ratio"), fromPeriodEnd: dt("stress.fromPeriodEnd")},
    covenant: {ebitdaExcludesLeases: select("covenant.ebitdaExcludesLeases", "convention", "boolean"), historyIds: l("covenant.historyIds", "identity"),
      historyMonths: l("covenant.historyMonths", "months"), historyEbitda: l("covenant.historyEbitda", "currency"), historyLeasePayments: l("covenant.historyLeasePayments", "currency"),
      indentureLimit: n("covenant.indentureLimit", "ratio"), indentureComparator: t("covenant.indentureComparator", "convention"), indentureDates: l("covenant.indentureDates", "date"),
      indentureSource: t("covenant.indentureSource", "text"),
      ...(anyOf(policyFields) ? {policyLimit: n("covenant.policyLimit", "ratio"), policyComparator: t("covenant.policyComparator", "convention"), policyDates: l("covenant.policyDates", "date"),
        policySource: t("covenant.policySource", "text"), policyDefinition: t("covenant.policyDefinition", "convention")}
        : {policyLimit: null, policyComparator: null, policyDates: null, policySource: null, policyDefinition: null})},
    basket: anyOf(basketFields) ? {holderId: t("basket.holderId", "identity"), limit: n("basket.limit", "currency"), basis: t("basket.basis", "convention"),
      occupied: n("basket.occupied", "currency"), source: t("basket.source", "text")} : null,
    instruments: keys("instrument", "order.instruments").map((id) => {const q = `instrument.${id}.`; return {id, label: t(q + "label", "text"), terms: l(q + "terms", "convention"),
      principal: l(q + "principal", "currency"), rates: l(q + "rates", "ratio"), draws: l(q + "draws", "currency"), amortization: l(q + "amortization", "currency"),
      replaces: optional(q + "replaces", "identity", "text"), finalPaymentDate: optional(q + "finalPaymentDate", "date", "date"),
      chargeSlots: optional(q + "chargeSlots", "identity", "list"), chargeAmounts: optional(q + "chargeAmounts", "currency", "list"),
      prepaymentBasis: optional(q + "prepaymentBasis", "convention", "text"), prepaymentRate: optional(q + "prepaymentRate", "ratio", "number"),
      afterYears: optional(q + "afterYears", "identity", "list"), afterShares: optional(q + "afterShares", "ratio", "list"), afterReason: optional(q + "afterReason", "text", "text"),
      alternativeSlots: optional(q + "alternativeSlots", "identity", "list"), alternativeShares: optional(q + "alternativeShares", "ratio", "list"),
      alternativeLabels: optional(q + "alternativeLabels", "text", "list")};}),
    paths: keys("path", "order.paths").map((id) => {const q = `path.${id}.`; return {id, label: t(q + "label", "text"), terms: l(q + "terms", "convention"),
      instruments: l(q + "instruments", "identity"), prepayments: optional(q + "prepayments", "identity", "list"), chargeSlots: optional(q + "chargeSlots", "identity", "list"),
      chargeAmounts: optional(q + "chargeAmounts", "currency", "list")};}),
    postHorizon: {years: l("postHorizon.years", "identity"), ebitda: l("postHorizon.ebitda", "currency"), leasePayments: l("postHorizon.leasePayments", "currency"),
      maintenanceCapex: l("postHorizon.maintenanceCapex", "currency"), workingCapitalInvestment: l("postHorizon.workingCapitalInvestment", "currency"),
      depreciation: l("postHorizon.depreciation", "currency"), otherInterest: l("postHorizon.otherInterest", "currency")},
    plan: {maximumSpread: n("plan.maximumSpread", "ratio"), soundingBy: dt("plan.soundingBy"), routeDecisionBy: dt("plan.routeDecisionBy")},
    sensitivities: keys("sensitivity", "order.sensitivities").map((id) => {const q = `sensitivity.${id}.`; return {id, label: t(q + "label", "text"),
      ebitdaDelta: l(q + "ebitdaDelta", "currency"), workingCapitalDelta: l(q + "workingCapitalDelta", "currency"), minimumCash: optional(q + "minimumCash", "currency", "number")};}),
    demandQuantum: n("demandQuantum", "currency"),
  };
  // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  return capitalPathsPacketInputSchema.parse({schemaVersion: "capital-structure-paths-packet-input.v1", question: input.question, analysis});
}
