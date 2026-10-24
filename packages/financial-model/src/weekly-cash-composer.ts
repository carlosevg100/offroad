import {z} from "zod";
import {weeklyCashObligations} from "@offroad/financial-core";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {weeklyCashPacketInputSchema, type WeeklyCashPacketInput} from "./weekly-cash-packet";

const text = z.string().trim().min(1).max(2000);
export const boundWeeklyCashInputSchema = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
  question: text,
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const analysisPath = new RegExp(`^weekly_cash\\.(${uuid})\\.`);
const streamPath = new RegExp(`^stream\\.(${k})\\.[A-Za-z]+$`);
const casePath = new RegExp(`^case\\.(${k})\\.[A-Za-z]+$`);
const actionPath = new RegExp(`^action\\.(${k})\\.[A-Za-z]+$`);

/** Composes the weekly cash packet input from the working basis alone. The basis carries one
 * analysis (`weekly_cash.<analysis>.`); its streams, cases and actions are every id the adopted
 * order lists (`order.streams`, `order.cases`, `order.actions`) and every `stream.<key>`,
 * `case.<key>` or `action.<key>` a field path names, listed ones first. A case without one adopted
 * role and stream list, or an action without one adopted stream, refuses composition by name. Every operand is selected by field path, scenario, unit and
 * type in the analysis's own dimensions; an absent operand, or one adopted twice for the same slot,
 * is declared missing with its reason. Optional operands absent stay null. No number is supplied here. */
export function composeBoundWeeklyCash(raw: unknown): WeeklyCashPacketInput {
  const input = boundWeeklyCashInputSchema.parse(raw);
  const basis = readContextualBasis(input.envelope, input.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("weekly_cash_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("weekly_cash_analysis_ambiguous");
  // The adopted case order anchors the dimensions when present.
  const analysisId = roles[0]!.analysisId, anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".order.cases")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!, prefix = `weekly_cash.${analysisId}.`;
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
  const optional = (p: string, unit: string, type: ValueType) => own.some((e) => e.fieldPath === prefix + p) ? select(p, unit, type) : null;
  // Structure the reader receives as given: one adopted value or the composition refuses.
  function meta(p: string, type: ValueType, code: string, required: true): string | string[];
  function meta(p: string, type: ValueType, code: string, required: false): string | string[] | null;
  function meta(p: string, type: ValueType, code: string, required: boolean) {
    const found = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type);
    if (found.length > 1) throw new Error(`${code}_ambiguous`);
    if (!found.length) {if (required) throw new Error(`${code}_missing`); return null;}
    return found[0]!.value.value as string | string[];
  }
  // Every id the adopted order lists or any field path names is composed; none disappears silently.
  const keys = (pattern: RegExp, orderPath: string) => {
    const order = z.array(z.string().regex(new RegExp(`^${k}$`))).parse(meta(orderPath, "list", "weekly_cash_order", false) ?? []);
    if (new Set(order).size !== order.length) throw new Error("weekly_cash_order_ambiguous");
    const seen = [...new Set(own.flatMap((e) => {const m = pattern.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !order.includes(x)).sort();
    return [...order, ...seen];
  };
  const streams = keys(streamPath, "order.streams").map((id) => {
    const p = `stream.${id}.`;
    return {id, label: select(p + "label", "text", "text"), category: select(p + "category", "convention", "text"), direction: select(p + "direction", "convention", "text"),
      obligation: optional(p + "obligation", "convention", "text"), dates: select(p + "dates", "date", "list"), amounts: select(p + "amounts", "currency", "list")};
  });
  const cases = keys(casePath, "order.cases").map((id) => {
    const p = `case.${id}.`;
    return {id, label: (meta(p + "label", "text", "weekly_cash_case_label", false) as string | null) ?? id,
      role: z.enum(["informed", "alternative"]).parse(meta(p + "role", "text", "weekly_cash_case_role", true)),
      streamIds: z.array(z.string()).parse(meta(p + "streamIds", "list", "weekly_cash_case_streams", true))};
  });
  const actions = keys(actionPath, "order.actions").map((id) => {
    const p = `action.${id}.`;
    return {id, label: select(p + "label", "text", "text"),
      streamId: z.string().parse(meta(p + "streamId", "text", "weekly_cash_action_stream", true)),
      replacesStreamId: meta(p + "replacesStreamId", "text", "weekly_cash_action_replacement", false) as string | null,
      amount: select(p + "amount", "currency", "number"), days: select(p + "days", "days", "number"), rate: select(p + "rate", "ratio", "number"),
      ratePeriod: select(p + "ratePeriod", "convention", "text"), iofDaily: select(p + "iofDaily", "ratio", "number"),
      iofDailyCapDays: select(p + "iofDailyCapDays", "days", "number"), iofAdditional: select(p + "iofAdditional", "ratio", "number"),
      upfrontFee: select(p + "upfrontFee", "ratio", "number"), repaymentDate: select(p + "repaymentDate", "date", "date")};
  });
  const analysis = {envelope: input.envelope, scope: input.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!, openingDate: d.periodStart!, endDate: d.periodEnd!,
    numericInterpretations: [], analysisId, scenario: sc,
    openingCash: select("openingCash", "currency", "number"), minimumCash: select("minimumCash", "currency", "number"),
    projectionClosing: optional("projectionClosing", "currency", "number"), calendarEnd: select("calendarEnd", "date", "date"),
    covenantTestDate: optional("covenantTestDate", "date", "date"), streams, cases, actions,
    coverage: Object.fromEntries(weeklyCashObligations.map((o) => [o, select(`coverage.${o}`, "convention", "text")]))};
  // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  return weeklyCashPacketInputSchema.parse({schemaVersion: "weekly-cash-packet-input.v1", question: input.question, analysis});
}
