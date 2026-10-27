import {z} from "zod";
import {capacityUuid} from "./debt-capacity-premises";
import type {ProposedHypothesis} from "./investment-premises";
import {boardAuthorities, boardOmissionTargets, boardPageRoles} from "./board-capital-discussion";
import {boardSourceMethodIds} from "./board-capital-discussion-sources";

const text = z.string().trim().min(1).max(2000);
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const origins = ["document", "informed", "house", "estimate", "analysis"] as const;
const originLabel: Record<(typeof origins)[number], string> = {document: "documento", informed: "informado", house: "premissa da casa", estimate: "estimativa", analysis: "análise revisada"};
/** A value and where it came from; the source names the document, the message, the reviewed result or the house rule. */
const fact = <T extends z.ZodType>(value: T) => z.strictObject({value, origin: z.enum(origins), source: text});
type Origin = {origin: (typeof origins)[number]; source: string};

/** [source, path, decimals or date format, stated]: the unit, scale and periodicity come from the field registry of the source's method. */
const reading = z.tuple([key, z.string().min(1).max(400), z.enum(["0", "1", "2", "-", "day_month", "month_year", "year"])])
  .rest(z.string().regex(/^(?:\d{4}-\d{2}-\d{2}|-?\d{1,24}(?:\.\d{1,8})?)$/));
const figure = z.discriminatedUnion("kind", [
  z.strictObject({id: key, kind: z.literal("reading"), reading: reading.refine((r) => r.length === (r[2] === "-" ? 3 : 4), {message: "A number or a date states its value; a label or a yes-no reading does not"})}),
  z.strictObject({id: key, kind: z.literal("pending"), reading: z.tuple([key, text])})]);
const deliberation = z.strictObject({id: key, topicId: key.nullable(), title: text, subject: text, recommendation: text.nullable(), authority: z.enum(boardAuthorities), authorityBasis: text.nullable(),
  deadlines: z.array(z.strictObject({id: key, date: z.iso.date(), action: text})).max(4)});
const page = z.strictObject({id: key, role: z.enum(boardPageRoles), topicId: key.nullable(), title: text, lines: z.array(text).max(12), recommendation: text.nullable(), options: z.array(text).max(6)});

/** The facts of one board discussion, each with its origin. The reviewed results are named by method and packet
 * fingerprint and travel beside the basis; nothing of them is restated here. Nothing is adopted until a person
 * confirms the set; every number on the material is a reading of a named result. */
export const boardCapitalDiscussionFactsSchema = z.strictObject({
  discussionId: z.uuid(), entityId: z.uuid(), perimeter: text, currency: z.string().regex(/^[A-Z]{3}$/), definitionVersionId: z.uuid(),
  askedOn: fact(z.iso.date()), meetingDate: fact(z.iso.date()), leadDays: fact(z.string().regex(/^\d{1,3}$/)), minutesPerPage: fact(z.string().regex(/^[1-9]\d?$/)),
  agendaMinutes: fact(z.string().regex(/^[1-9]\d{0,2}$/)).nullable(), nextMeetingDate: fact(z.iso.date()).nullable(), template: fact(text).nullable(), outlineConfirmed: fact(z.boolean()),
  sources: z.array(fact(z.strictObject({id: key, methodId: z.enum(boardSourceMethodIds), packetFingerprint: hash}))).min(1).max(16),
  topics: z.array(fact(z.strictObject({id: key, label: text, seen: z.boolean().nullable()}))).max(12),
  deliberations: z.array(fact(deliberation)).min(1).max(12),
  figures: z.array(fact(figure)).max(160),
  materialFigureIds: fact(z.array(key).max(160)),
  indicative: z.array(fact(z.strictObject({figureId: key, reason: text}))).max(24),
  pages: z.array(fact(page)).min(1).max(40),
  summary: fact(z.strictObject({opening: text, closing: text})),
  appendix: z.array(fact(z.strictObject({id: key, label: text, sourceIds: z.array(key).min(1).max(16)}))).max(16),
  questions: z.array(fact(z.strictObject({id: key, question: text, answer: text}))).max(24),
  omissions: z.array(fact(z.strictObject({id: key, target: z.enum(boardOmissionTargets), targetId: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,80}$/), requestedBy: text}))).max(12),
}).superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (f.meetingDate.value < f.askedOn.value) fail("The meeting must not precede the request");
  const unique = (xs: string[], what: string) => {if (new Set(xs).size !== xs.length) fail(`Duplicate ${what}`);};
  unique(f.sources.map((s) => s.value.id), "source"); unique(f.topics.map((t) => t.value.id), "topic"); unique(f.deliberations.map((d) => d.value.id), "deliberation");
  unique(f.figures.map((x) => x.value.id), "figure"); unique(f.pages.map((p) => p.value.id), "page"); unique(f.questions.map((q) => q.value.id), "question");
  unique(f.appendix.map((a) => a.value.id), "appendix item"); unique(f.omissions.map((o) => o.value.id), "omission");
  const sources = new Set(f.sources.map((s) => s.value.id)), figures = new Set(f.figures.map((x) => x.value.id)), topics = new Set(f.topics.map((t) => t.value.id));
  for (const {value: x} of f.figures) if (x.kind === "reading" && !sources.has(x.reading[0])) fail(`Figure ${x.id} reads a result the discussion does not name`);
  for (const id of [...f.materialFigureIds.value, ...f.indicative.map((x) => x.value.figureId)]) if (!figures.has(id)) fail(`Unknown figure ${id}`);
  for (const {value: a} of f.appendix) if (!a.sourceIds.every((s) => sources.has(s))) fail(`Appendix item ${a.id} cites a result the discussion does not name`);
  for (const {value: x} of [...f.pages, ...f.deliberations]) if (x.topicId !== null && !topics.has(x.topicId)) fail(`Unknown topic ${x.topicId}`);
});
export type BoardCapitalDiscussionFacts = z.infer<typeof boardCapitalDiscussionFactsSchema>;

export const boardCapitalDiscussionAnalysisId = (discussionId: string) => capacityUuid(`offroad:board-capital-discussion:${discussionId}:analysis`);
/** The size of one working basis. */
export const maxBoardCapitalDiscussionHypotheses = 256;

/** The hypotheses one confirmation adopts for the discussion: the meeting, the named results, each deliberation,
 * figure, page, question and request, plus the structure the reader receives as given (the topic of a page or a
 * deliberation and the order of everything), so the packet is composed from the basis alone. Nothing is calculated. */
export function proposeBoardCapitalDiscussionHypotheses(raw: unknown): ProposedHypothesis[] {
  const f = boardCapitalDiscussionFactsSchema.parse(raw);
  const out: ProposedHypothesis[] = [], prefix = `board_capital.${boardCapitalDiscussionAnalysisId(f.discussionId)}.`;
  const why = (x: Origin) => `Origem: ${originLabel[x.origin]}. ${x.source}`;
  const house = (source: string) => `Origem: premissa da casa. ${source}`;
  const add = (path: string, unit: string, value: ProposedHypothesis["value"], reason: string) => out.push({fieldPath: prefix + path,
    dimensions: {entityId: f.entityId, perimeter: f.perimeter, periodStart: f.askedOn.value, periodEnd: f.meetingDate.value, currency: f.currency, unit, scale: "1", scenario: "base", definitionVersionId: f.definitionVersionId},
    value, reason});
  const txt = (path: string, value: string, reason: string, unit = "text") => add(path, unit, {type: "text", value}, reason);
  const list = (path: string, value: string[], reason: string, unit = "identity") => add(path, unit, {type: "list", value}, reason);
  const date = (path: string, value: string, reason: string) => add(path, "date", {type: "date", value}, reason);
  const flag = (path: string, value: boolean, reason: string) => add(path, "convention", {type: "boolean", value}, reason);

  date("meeting.date", f.meetingDate.value, why(f.meetingDate)); date("meeting.askedOn", f.askedOn.value, why(f.askedOn));
  add("meeting.leadDays", "days", {type: "number", value: f.leadDays.value}, why(f.leadDays));
  add("meeting.minutesPerPage", "minutes", {type: "number", value: f.minutesPerPage.value}, why(f.minutesPerPage));
  if (f.agendaMinutes) add("meeting.agendaMinutes", "minutes", {type: "number", value: f.agendaMinutes.value}, why(f.agendaMinutes));
  if (f.nextMeetingDate) date("meeting.nextMeetingDate", f.nextMeetingDate.value, why(f.nextMeetingDate));
  if (f.template) txt("meeting.template", f.template.value, why(f.template));
  flag("meeting.outlineConfirmed", f.outlineConfirmed.value, why(f.outlineConfirmed));
  for (const s of f.sources) list(`source.${s.value.id}`, [s.value.methodId, s.value.packetFingerprint], why(s));
  for (const t of f.topics) {txt(`topic.${t.value.id}.label`, t.value.label, why(t)); if (t.value.seen !== null) flag(`topic.${t.value.id}.seen`, t.value.seen, why(t));}
  for (const d of f.deliberations) {
    const v = d.value, p = `deliberation.${v.id}.`, r = why(d);
    txt(p + "title", v.title, r); txt(p + "subject", v.subject, r); if (v.recommendation !== null) txt(p + "recommendation", v.recommendation, r);
    list(p + "authority", v.authorityBasis === null ? [v.authority] : [v.authority, v.authorityBasis], r);
    if (v.topicId !== null) txt(p + "topic", v.topicId, r, "identity");
    for (const x of v.deadlines) list(`${p}deadline.${x.id}`, [x.date, x.action], r);
    if (v.deadlines.length) list(p + "order.deadlines", v.deadlines.map((x) => x.id), house("Ordem dos prazos como informada"));
  }
  for (const x of f.figures) list(`figure.${x.value.id}.${x.value.kind}`, [...x.value.reading], why(x));
  list("figures.material", f.materialFigureIds.value, why(f.materialFigureIds));
  for (const x of f.indicative) txt(`figure.${x.value.figureId}.indicative`, x.value.reason, why(x));
  for (const pg of f.pages) {
    const v = pg.value, p = `page.${v.id}.`, r = why(pg);
    txt(p + "role", v.role, r, "convention"); txt(p + "title", v.title, r); list(p + "lines", v.lines, r, "text");
    if (v.recommendation !== null) txt(p + "recommendation", v.recommendation, r);
    if (v.options.length) list(p + "options", v.options, r, "text");
    if (v.topicId !== null) txt(p + "topic", v.topicId, r, "identity");
  }
  txt("summary.opening", f.summary.value.opening, why(f.summary)); txt("summary.closing", f.summary.value.closing, why(f.summary));
  for (const a of f.appendix) list(`appendix.${a.value.id}`, [a.value.label, ...a.value.sourceIds], why(a));
  for (const q of f.questions) {txt(`question.${q.value.id}.question`, q.value.question, why(q)); txt(`question.${q.value.id}.answer`, q.value.answer, why(q));}
  for (const o of f.omissions) list(`omission.${o.value.id}`, [o.value.target, o.value.targetId, o.value.requestedBy], why(o));
  const order = (name: string, ids: string[], what: string) => {if (ids.length) list(`order.${name}`, ids, house(`Ordem ${what} como informada`));};
  order("sources", f.sources.map((s) => s.value.id), "dos resultados"); order("topics", f.topics.map((t) => t.value.id), "dos temas");
  order("deliberations", f.deliberations.map((d) => d.value.id), "das deliberações"); order("figures", f.figures.map((x) => x.value.id), "dos números");
  order("indicative", f.indicative.map((x) => x.value.figureId), "das condições indicativas");
  order("pages", f.pages.map((p) => p.value.id), "das páginas"); order("appendix", f.appendix.map((a) => a.value.id), "do apêndice");
  order("questions", f.questions.map((q) => q.value.id), "das perguntas"); order("omissions", f.omissions.map((o) => o.value.id), "dos pedidos");
  // A working basis holds at most 256 premises; a set larger than that is refused here, not at confirmation.
  if (out.length > maxBoardCapitalDiscussionHypotheses) throw new Error("board_capital_premises_exceed_basis");
  return out;
}
