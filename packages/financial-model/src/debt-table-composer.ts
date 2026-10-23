import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {debtTablePacketInputSchema, type DebtTablePacketInput} from "./debt-table-packet";

const text = z.string().trim().min(1).max(2000);
export const boundDebtTableInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const anchorPath = new RegExp(`^debt_table\\.(${uuid})\\.structure\\.views$`);
const itemKey = "([^.]{1,160})";
const instrumentPath = new RegExp(`^instrument\\.${itemKey}\\.`), creditLinePath = new RegExp(`^credit_line\\.${itemKey}\\.`);
const obligationPath = new RegExp(`^obligation\\.${itemKey}\\.`), indexRatePath = new RegExp(`^index_rate\\.${itemKey}$`);
const viewPath = new RegExp(`^view\\.${itemKey}\\.`), leveragePath = new RegExp(`^leverage\\.${itemKey}\\.`);
const categories = ["lease", "supplier_finance", "guarantee_given"] as const;

/** Composes the debt table packet input from the working basis alone. The analysis exists only when
 * the basis adopts its views (`debt_table.<analysis>.structure.views`); its items are the ids the
 * adopted order names plus every id a field path carries, in the adopted order and then by id. Every
 * operand is selected by field path, scenario, unit and type in the analysis' own dimensions; an absent
 * mandatory operand, or one adopted twice for the same slot, is declared missing with its reason; an
 * absent optional term is null. No number is supplied here. */
export function composeBoundDebtTable(raw: unknown): DebtTablePacketInput {
  const input = boundDebtTableInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const anchors = entries.flatMap((e) => {const m = anchorPath.exec(e.fieldPath); return m && e.value.type === "list" ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!anchors.length) throw new Error("debt_table_analysis_missing");
  if (anchors.length > 1) throw new Error("debt_table_analysis_ambiguous");
  const {analysisId, entry: anchor} = anchors[0]!, d = anchor.dimensions, sc = d.scenario!;
  const prefix = `debt_table.${analysisId}.`;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const rel = own.map((e) => ({e, path: e.fieldPath.slice(prefix.length)}));
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, unit: string, type: ValueType): Selection {
    const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit && e.dimensions.scenario === sc
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
  const present = (p: string) => own.some((e) => e.fieldPath === prefix + p);
  const optional = (p: string, unit: string, type: ValueType) => present(p) ? select(p, unit, type) : null;
  // Structure and labels are never chosen among: two contributions for one of them refuse the composition.
  const meta = (suffix: string, type: ValueType) => {
    const all = own.filter((e) => e.fieldPath === prefix + suffix);
    if (all.length > 1) throw new Error(`debt_table_structure_ambiguous: ${suffix}`);
    const e = all[0];
    return e && e.value.type === type && e.dimensions.scenario === sc ? e.value.value : undefined;
  };
  // Ids in the adopted order first, then any other id a field path carries, so nothing adopted is dropped.
  const idsOf = (order: string, pattern: RegExp) => {
    const listed = (meta(`structure.${order}`, "list") as string[] | undefined) ?? [];
    const found = [...new Set(rel.flatMap(({path}) => {const m = pattern.exec(path); return m ? [m[1]!] : [];}))].filter((k) => !listed.includes(k)).sort();
    return [...new Set(listed), ...found];
  };

  const instruments = idsOf("instruments", instrumentPath).map((id) => {
    const p = `instrument.${id}.`, at = (name: string, unit: string, type: ValueType) => select(p + name, unit, type);
    const opt = (name: string, unit: string, type: ValueType) => optional(p + name, unit, type);
    const acceleration = at("crossDefaultAcceleration", "convention", "text");
    const accelerationValue = own.find((e) => e.decisionId === acceleration.decisionId)?.value.value;
    // A clause that exists needs its scope, scope kind and threshold basis; without the clause they stay absent.
    const clause = accelerationValue === "automatic" || accelerationValue === "non_automatic";
    const need = clause ? at : opt;
    const scopeKind = need("crossDefaultScopeKind", "convention", "text");
    // Named creditors are part of a clause scoped to them; otherwise they stay absent.
    const named = clause && own.find((e) => e.decisionId === scopeKind?.decisionId)?.value.value === "named_creditors";
    return {id, terms: {label: at("label", "text", "text"), creditor: at("creditor", "text", "text"), borrower: at("borrower", "text", "text"),
      principal: at("principal", "currency", "number"), accruedInterest: at("accruedInterest", "currency", "number"), unamortizedCost: at("unamortizedCost", "currency", "number"),
      indexer: at("indexer", "convention", "text"), spread: at("spread", "ratio", "number"),
      paymentDates: at("paymentDates", "date", "list"), paymentAmounts: at("paymentAmounts", "currency", "list"),
      guarantee: at("guarantee", "text", "text"), encumbranceAmount: opt("encumbranceAmount", "currency", "number"), usesBasketOf: opt("usesBasketOf", "reference_id", "list"),
      covenant: at("covenant", "text", "text"), crossDefaultAcceleration: acceleration,
      crossDefaultThreshold: opt("crossDefaultThreshold", "currency", "number"), crossDefaultScope: need("crossDefaultScope", "text", "text"),
      crossDefaultScopeKind: scopeKind, crossDefaultCreditors: (named ? at : opt)("crossDefaultCreditors", "text", "list"),
      crossDefaultThresholdBasis: need("crossDefaultThresholdBasis", "convention", "text"),
      prepayment: at("prepayment", "text", "text"), negativePledgeBasket: opt("negativePledgeBasket", "currency", "number")}};
  });
  const creditLines = idsOf("creditLines", creditLinePath).map((id) => {
    const p = `credit_line.${id}.`;
    return {id, label: select(p + "label", "text", "text"), creditor: select(p + "creditor", "text", "text"),
      limit: select(p + "limit", "currency", "number"), drawn: select(p + "drawn", "currency", "number")};
  });
  const otherObligations = idsOf("otherObligations", obligationPath).map((id) => {
    const p = `obligation.${id}.`;
    return {id, kind: select(p + "kind", "convention", "text"), label: select(p + "label", "text", "text"),
      creditor: optional(p + "creditor", "text", "text"), amount: select(p + "amount", "currency", "number")};
  });
  const reportedAccountingBalance = select("reportedAccountingBalance", "currency", "number"), availableCash = select("availableCash", "currency", "number");
  const indexRates = idsOf("indexRates", indexRatePath).map((indexer) => ({indexer, annualRate: select(`index_rate.${indexer}`, "ratio", "number")}));
  const views = idsOf("views", viewPath).map((id) => ({id, label: (meta(`view.${id}.label`, "text") as string | undefined) ?? id,
    components: select(`view.${id}.components`, "convention", "list")}));
  const leverage = idsOf("leverage", leveragePath).map((viewId) => ({viewId, label: (meta(`leverage.${viewId}.label`, "text") as string | undefined) ?? viewId,
    ebitda: select(`leverage.${viewId}.ebitda`, "currency", "number"), ebitdaDeduction: select(`leverage.${viewId}.ebitdaDeduction`, "currency", "number")}));
  const completenessStatus = select("completenessStatus", "convention", "text"), completenessEvidence = select("completenessEvidence", "text", "text");
  const categoryCoverage = Object.fromEntries(categories.map((k) => [k, select(`categoryCoverage.${k}`, "convention", "text")])) as Record<(typeof categories)[number], Selection>;
  // A missing operand carries the lowest resolved definition so the reference is stable; the reader ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate: d.periodStart!, endDate: d.periodEnd!,
    numericInterpretations: [], analysisId, scenario: sc, instruments, creditLines, otherObligations, reportedAccountingBalance, availableCash, indexRates, views, leverage,
    completenessStatus, completenessEvidence, categoryCoverage};
  return debtTablePacketInputSchema.parse({schemaVersion: "debt-table-packet-input.v1", question: input.question, analysis});
}
