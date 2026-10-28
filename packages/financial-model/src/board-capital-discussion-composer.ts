import {z} from "zod";
import {readContextualBasis, type AdoptionBasisEntry} from "@offroad/reconciliation";
import {adoptedValueSelectionSchema} from "./adopted-debt-inputs";
import {hasUnitScale} from "./adopted-input-scale";
import {boardCapitalDiscussionPacketInputSchema, type BoardCapitalDiscussionPacketInput} from "./board-capital-discussion-packet";

const text = z.string().trim().min(1).max(2000);
const bound = z.strictObject({
  envelope: z.strictObject({canonical: z.string().min(2).max(1048576), fingerprint: z.string().regex(/^[a-f0-9]{64}$/)}),
  scope: z.strictObject({workId: z.uuid(), purpose: z.string().min(3).max(300), versionId: z.uuid()}),
});
/** A stored result of a completed execution, as its JSON text or already parsed; it travels as text. */
const stored = z.union([z.string().min(2).max(8388608), z.record(z.string(), z.unknown()).transform((v) => JSON.stringify(v))]);
export const boundBoardCapitalDiscussionInputSchema = z.strictObject({
  discussion: bound,
  question: text,
  /** The stored results of the completed executions the basis names, by the id the basis gives them. */
  sources: z.array(z.strictObject({id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), result: stored})).min(1).max(16),
});
type Selection = z.infer<typeof adoptedValueSelectionSchema>;
type ValueType = AdoptionBasisEntry["value"]["type"];
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const k = "[a-z0-9][a-z0-9-]{0,39}";
const keyOf = z.string().regex(new RegExp(`^${k}$`));
const analysisPath = new RegExp(`^board_capital\\.(${uuid})\\.`);

/** Composes the board discussion packet input from its basis and the stored results it names. Every operand is
 * selected by field path, scenario, unit and type in the analysis' own dimensions; an absent operand, or one adopted
 * twice for the same slot, is declared missing with its reason. Structure (a figure is a reading or pending, the
 * topic of a page or a deliberation, the order of everything) is one adopted value or the composition refuses by
 * name. Each stored result is passed verbatim, never recomposed, so the database can check it byte for byte. */
export function composeBoundBoardCapitalDiscussion(raw: unknown): BoardCapitalDiscussionPacketInput {
  const input = boundBoardCapitalDiscussionInputSchema.parse(raw);
  const basis = readContextualBasis(input.discussion.envelope, input.discussion.scope);
  const entries = [...basis.entries].sort((a, b) => a.decisionId < b.decisionId ? -1 : 1);
  const roles = entries.flatMap((e) => {const m = analysisPath.exec(e.fieldPath); return m ? [{analysisId: m[1]!, entry: e}] : [];});
  if (!roles.length) throw new Error("board_capital_analysis_missing");
  if (new Set(roles.map((r) => r.analysisId)).size !== 1) throw new Error("board_capital_analysis_ambiguous");
  const analysisId = roles[0]!.analysisId, anchor = (roles.find((r) => r.entry.fieldPath.endsWith(".meeting.date")) ?? roles[0]!).entry, d = anchor.dimensions, sc = d.scenario!;
  const prefix = `board_capital.${analysisId}.`;
  const own = entries.filter((e) => e.fieldPath.startsWith(prefix) && e.dimensions.scenario === sc && e.dimensions.entityId === d.entityId && e.dimensions.perimeter === d.perimeter
    && e.dimensions.currency === d.currency && e.dimensions.periodStart === d.periodStart && e.dimensions.periodEnd === d.periodEnd);
  const used = new Set<string>(), definitions: Selection[] = [], missing: Selection[] = [];
  function select(p: string, unit: string, type: ValueType): Selection {
    const matches = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type && e.dimensions.unit === unit && hasUnitScale(e.dimensions.scale) && !used.has(e.decisionId));
    if (matches.length === 1) {
      const e = matches[0]!; used.add(e.decisionId);
      const selection = {decisionId: e.decisionId, definitionVersionId: e.dimensions.definitionVersionId!, definitionKind: e.definitionKind, missingReason: null};
      definitions.push(selection); return selection;
    }
    const selection = {decisionId: null, definitionVersionId: anchor.dimensions.definitionVersionId!, definitionKind: anchor.definitionKind,
      missingReason: matches.length > 1 ? `${matches.length} contributions match ${p} for scenario ${sc}; keep one value per slot in the working basis` : `No contribution adopted for ${p} in scenario ${sc}`};
    missing.push(selection); return selection;
  }
  const has = (p: string) => own.some((e) => e.fieldPath === prefix + p);
  const optional = (p: string, unit: string, type: ValueType) => has(p) ? select(p, unit, type) : null;
  function meta(p: string, type: ValueType, code: string) {
    const found = own.filter((e) => e.fieldPath === prefix + p && e.value.type === type);
    if (found.length > 1) throw new Error(`${code}_ambiguous`);
    return found.length ? found[0]!.value.value as string | string[] : null;
  }
  // Every id the adopted order lists or a field path names is composed; none disappears silently.
  const keys = (pattern: RegExp, orderPath: string) => {
    const order = z.array(keyOf).parse(meta(orderPath, "list", "board_capital_order") ?? []);
    if (new Set(order).size !== order.length) throw new Error("board_capital_order_ambiguous");
    const seen = [...new Set(own.flatMap((e) => {const m = pattern.exec(e.fieldPath.slice(prefix.length)); return m ? [m[1]!] : [];}))].filter((x) => !order.includes(x)).sort();
    return [...order, ...seen];
  };
  const sources = keys(new RegExp(`^source\\.(${k})$`), "order.sources").map((id) => ({id, reading: select(`source.${id}`, "identity", "list")}));
  const topics = keys(new RegExp(`^topic\\.(${k})\\.`), "order.topics").map((id) => ({id, label: select(`topic.${id}.label`, "text", "text"), seen: optional(`topic.${id}.seen`, "convention", "boolean")}));
  const deliberations = keys(new RegExp(`^deliberation\\.(${k})\\.`), "order.deliberations").map((id) => {
    const p = `deliberation.${id}.`;
    const deadlineIds = keys(new RegExp(`^deliberation\\.${id}\\.deadline\\.(${k})$`), p + "order.deadlines");
    return {id, title: select(p + "title", "text", "text"), subject: select(p + "subject", "text", "text"),
      recommendation: optional(p + "recommendation", "text", "text"), authority: select(p + "authority", "identity", "list"),
      deadlines: deadlineIds.map((x) => ({id: x, reading: select(`${p}deadline.${x}`, "identity", "list")}))};
  });
  const figures = keys(new RegExp(`^figure\\.(${k})\\.(?:reading|pending)$`), "order.figures").map((id) => {
    const reading = has(`figure.${id}.reading`), pending = has(`figure.${id}.pending`);
    if (reading && pending) throw new Error("board_capital_figure_kind_ambiguous");
    // A figure the order lists without any reading is composed as a missing reading, never as pending.
    return {id, kind: pending ? "pending" as const : "reading" as const, reading: select(`figure.${id}.${pending ? "pending" : "reading"}`, "identity", "list")};
  });
  const indicative = keys(new RegExp(`^figure\\.(${k})\\.indicative$`), "order.indicative").map((figureId) => ({figureId, reason: select(`figure.${figureId}.indicative`, "text", "text")}));
  const pages = keys(new RegExp(`^page\\.(${k})\\.`), "order.pages").map((id) => {
    const p = `page.${id}.`;
    return {id, role: select(p + "role", "convention", "text"), title: select(p + "title", "text", "text"), lines: select(p + "lines", "text", "list"),
      recommendation: optional(p + "recommendation", "text", "text"), options: optional(p + "options", "text", "list")};
  });
  const appendix = keys(new RegExp(`^appendix\\.(${k})$`), "order.appendix").map((id) => ({id, reading: select(`appendix.${id}`, "identity", "list")}));
  const questions = keys(new RegExp(`^question\\.(${k})\\.`), "order.questions").map((id) => ({id, question: select(`question.${id}.question`, "text", "text"), answer: select(`question.${id}.answer`, "text", "text")}));
  const omissions = keys(new RegExp(`^omission\\.(${k})$`), "order.omissions").map((id) => ({id, reading: select(`omission.${id}`, "identity", "list")}));
  const informed = keys(new RegExp(`^informed\\.(${k})$`), "order.informed").map((id) => ({id, reading: select(`informed.${id}`, "identity", "list")}));
  const discussion = {envelope: input.discussion.envelope, scope: input.discussion.scope, entityId: d.entityId!, perimeter: d.perimeter!, currency: d.currency!,
    openingDate: d.periodStart!, endDate: d.periodEnd!, numericInterpretations: [], analysisId, scenario: sc,
    meeting: {date: select("meeting.date", "date", "date"), askedOn: select("meeting.askedOn", "date", "date"), leadDays: select("meeting.leadDays", "days", "number"),
      minutesPerPage: select("meeting.minutesPerPage", "minutes", "number"), agendaMinutes: optional("meeting.agendaMinutes", "minutes", "number"),
      nextMeetingDate: optional("meeting.nextMeetingDate", "date", "date"), template: optional("meeting.template", "text", "text"), outlineConfirmed: select("meeting.outlineConfirmed", "convention", "boolean")},
    sources, topics, deliberations, figures, materialFigureIds: select("figures.material", "identity", "list"), indicative, pages,
    summary: {opening: select("summary.opening", "text", "text"), closing: select("summary.closing", "text", "text")}, appendix, questions, omissions, informed};
  // A missing operand carries the lowest resolved definition so the reference is stable; the executor ignores it.
  const borrowed = [...definitions].sort((a, b) => a.definitionVersionId < b.definitionVersionId ? -1 : 1)[0];
  if (borrowed) for (const m of missing) {m.definitionVersionId = borrowed.definitionVersionId; m.definitionKind = borrowed.definitionKind;}
  // The stored results, verbatim and in the order the basis names them.
  const byId = new Map(input.sources.map((s) => [s.id, s.result]));
  if (byId.size !== input.sources.length || input.sources.some((s) => !sources.some((x) => x.id === s.id))) throw new Error("board_capital_source_not_named");
  const packets = sources.map((s) => {const packet = byId.get(s.id); if (!packet) throw new Error(`board_capital_source_missing:${s.id}`); return {id: s.id, packet};});
  return boardCapitalDiscussionPacketInputSchema.parse({schemaVersion: "board-capital-discussion-packet-input.v1", question: input.question, analysis: {sources: packets, discussion}});
}
