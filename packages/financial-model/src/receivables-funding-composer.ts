import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {receivablesFundingPacketInputSchema, type ReceivablesFundingPacketInput} from "./receivables-funding-packet";

const text = z.string().trim().min(1).max(2000);
export const boundReceivablesFundingInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const analysisPath = new RegExp(`^receivables_funding\\.(${uuid})\\.`);
const itemPath = new RegExp(`^item\\.(${k})\\.[A-Za-z]+$`);
const optionPath = new RegExp(`^option\\.(${k})\\.[A-Za-z]+$`);
const eligibilityFields = ["maxDaysPastDue", "maxRemainingTermDays", "registrationRule", "minCreditTier", "sublimitPerDebtor", "sublimitGroup", "anchorItemIds"];

/** Composes the receivables funding packet input from the working basis alone. The basis carries
 * one analysis (`receivables_funding.<analysis>.`); its buckets and options are every id the
 * adopted order lists (`order.items`, `order.options`) and every `item.<key>` or `option.<key>` a
 * field path names, listed ones first. An option has eligibility when any eligibility term of it is
 * adopted, and then every required term is selected. Every operand is selected by field path,
 * scenario, unit and type in the analysis's own dimensions; an absent operand, or one adopted twice
 * for the same slot, is declared missing with its reason. Optional operands absent stay null. */
export function composeBoundReceivablesFunding(raw: unknown): ReceivablesFundingPacketInput {
  const input = boundReceivablesFundingInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("receivables_funding_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("receivables_funding_analysis_ambiguous");
  // The adopted item order anchors the dimensions when present.
  const analysisId = roles[0]!.analysisId, anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".order.items")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!;
  const prefix = `receivables_funding.${analysisId}.`;
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
  const optional = (p: string, unit: string, type: ValueType) => has(p) ? select(p, unit, type) : null;
  const order = (p: string) => {
    const found = own.filter((e) => e.fieldPath === prefix + p && e.value.type === "list");
    if (found.length > 1) throw new Error("receivables_funding_order_ambiguous");
    const list = z.array(z.string().regex(new RegExp(`^${k}$`))).parse(found[0]?.value.value ?? []);
    if (new Set(list).size !== list.length) throw new Error("receivables_funding_order_ambiguous");
    return list;
  };
  // Every id the adopted order lists or any field path names is composed; none disappears silently.
  const keys = (pattern: RegExp, orderPath: string) => {
    const listed = order(orderPath);
    const seen = [...new Set(own.flatMap((e) => {const m = pattern.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !listed.includes(x)).sort();
    return [...listed, ...seen];
  };
  const items = keys(itemPath, "order.items").map((id) => {
    const p = `item.${id}.`;
    return {id, label: select(p + "label", "text", "text"), amount: select(p + "amount", "currency", "number"), contract: select(p + "contract", "convention", "text"),
      encumbrance: select(p + "encumbrance", "convention", "text"), encumbranceHolder: optional(p + "encumbranceHolder", "text", "text"), releaseEvent: optional(p + "releaseEvent", "text", "text"),
      originDate: select(p + "originDate", "date", "date"), dueDate: select(p + "dueDate", "date", "date"), registration: select(p + "registration", "convention", "text"),
      creditTier: select(p + "creditTier", "convention", "text"), anchorProgram: select(p + "anchorProgram", "convention", "text"),
      debtorCount: optional(p + "debtorCount", "count", "number"), largestDebtorAmount: optional(p + "largestDebtorAmount", "currency", "number"),
      debtorKey: select(p + "debtorKey", "identity", "text"), debtorSetDisjoint: optional(p + "debtorSetDisjoint", "convention", "text")};
  });
  const options = keys(optionPath, "order.options").map((id) => {
    const p = `option.${id}.`;
    const eligible = eligibilityFields.some((x) => has(p + x));
    return {id, label: select(p + "label", "text", "text"), kind: select(p + "kind", "convention", "text"), recourse: select(p + "recourse", "convention", "text"),
      rateBasis: select(p + "rateBasis", "convention", "text"), rate: select(p + "rate", "ratio", "number"), iofDaily: select(p + "iofDaily", "ratio", "number"),
      iofDailyCapDays: select(p + "iofDailyCapDays", "days", "number"), iofAdditional: select(p + "iofAdditional", "ratio", "number"),
      rolloverDays: optional(p + "rolloverDays", "days", "number"), upfrontFee: select(p + "upfrontFee", "ratio", "number"), collateral: select(p + "collateral", "convention", "text"),
      leadDaysMin: optional(p + "leadDaysMin", "days", "number"), leadDaysMax: optional(p + "leadDaysMax", "days", "number"),
      eligibility: eligible ? {maxDaysPastDue: select(p + "maxDaysPastDue", "days", "number"), maxRemainingTermDays: select(p + "maxRemainingTermDays", "days", "number"),
        registrationRule: select(p + "registrationRule", "convention", "text"), minCreditTier: select(p + "minCreditTier", "convention", "text"),
        sublimitPerDebtor: optional(p + "sublimitPerDebtor", "currency", "number"),
        sublimitGroup: optional(p + "sublimitGroup", "identity", "text"), anchorItemIds: optional(p + "anchorItemIds", "identity", "list")} : null};
  });
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate: d.periodStart!, endDate: d.periodEnd!,
    numericInterpretations: [], analysisId, scenario: sc,
    needAverage: select("needAverage", "currency", "number"), needPeak: select("needPeak", "currency", "number"), needStartDate: select("needStartDate", "date", "date"),
    calendarDays: select("calendarDays", "days", "number"), businessDays: select("businessDays", "days", "number"), annualDi: select("annualDi", "ratio", "number"),
    averageTermDays: select("averageTermDays", "days", "number"), needProfile: select("needProfile", "convention", "text"),
    vehicleThresholdMin: select("vehicleThresholdMin", "currency", "number"), vehicleThresholdMax: select("vehicleThresholdMax", "currency", "number"),
    lienBasketRemaining: optional("lienBasketRemaining", "currency", "number"), items, options};
  // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  return receivablesFundingPacketInputSchema.parse({schemaVersion: "receivables-funding-packet-input.v1", question: input.question, analysis});
}
