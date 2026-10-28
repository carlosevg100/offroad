import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {adoptedValueSelectionSchema as selection} from "./adopted-debt-inputs";
import {adoptedAnalysisContextSchema, createAnalysisBinding} from "./adopted-analysis-binding";
import {boardAuthorities, boardOmissionTargets, boardPageRoles, prepareBoardCapitalDiscussion,
  type BoardDiscussion, type BoardFigure, type BoardSourceReading, boardCanonicalJson} from "./board-capital-discussion";
import {boardTextRefPattern, boardThemeOfRefs} from "./board-capital-discussion-templates";
import {boardSourceMethodIds, boardSourcePacketSchema, parseBoardSourceText, verifyBoardSource} from "./board-capital-discussion-sources";
import {boardCapitalDiscussionExclusions} from "./board-capital-discussion-results";

const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), words = z.string().trim().min(1).max(2000), hash = z.string().regex(/^[a-f0-9]{64}$/);
/** Every shown text is a reference to the method's closed library; the basis never holds prose. */
const textRef = z.string().regex(boardTextRefPattern);

/** One board discussion as adopted: the meeting, the deliberations, the reviewed results it reads (named by
 * method and packet fingerprint), each figure as a reading of one of them, the pages, the summary, the appendix,
 * the questions and any omission request. Structure (which id is a reading or a pending figure, the topic of a
 * page or a deliberation) is given by the composer from the basis; every text, date and reading is adopted. */
export const adoptedBoardCapitalDiscussionInputSchema = adoptedAnalysisContextSchema.safeExtend({
  analysisId: z.uuid(), scenario: z.string().trim().min(1).max(160),
  meeting: z.strictObject({date: selection, askedOn: selection, leadDays: selection, minutesPerPage: selection, agendaMinutes: selection.nullable(),
    nextMeetingDate: selection.nullable(), template: selection.nullable(), outlineConfirmed: selection}),
  /** Each reviewed result by [method, packet fingerprint, money scale its basis was adopted in]. */
  sources: z.array(z.strictObject({id: key, reading: selection})).min(1).max(16),
  topics: z.array(z.strictObject({id: key, label: selection, seen: selection.nullable()})).max(12),
  deliberations: z.array(z.strictObject({id: key, title: selection, subject: selection, recommendation: selection.nullable(),
    /** [authority, basis?] */
    authority: selection, deadlines: z.array(z.strictObject({id: key, reading: selection})).max(4)})).min(1).max(12),
  /** A reading is [source, path, unit, scale, places, stated?]; a pending figure is [required method, required field path, reason]. */
  figures: z.array(z.strictObject({id: key, kind: z.enum(["reading", "pending"]), reading: selection})).max(160),
  materialFigureIds: selection,
  indicative: z.array(z.strictObject({figureId: key, reason: selection})).max(24),
  pages: z.array(z.strictObject({id: key, role: selection, title: selection, lines: selection, recommendation: selection.nullable(), options: selection.nullable()})).min(1).max(40),
  summary: z.strictObject({opening: selection, closing: selection}),
  /** [label, source...] */
  appendix: z.array(z.strictObject({id: key, reading: selection})).max(16),
  questions: z.array(z.strictObject({id: key, question: selection, answer: selection})).max(24),
  /** [target, target id, requested by] */
  omissions: z.array(z.strictObject({id: key, reading: selection})).max(12),
  /** [origin, author, code]: a fact informed in the conversation, adopted as a code of the method's dictionary with who stated it. */
  informed: z.array(z.strictObject({id: key, reading: selection})).max(12).default([]),
}).refine((i) => i.endDate >= i.openingDate, "Invalid period");
export type AdoptedBoardCapitalDiscussionInput = z.infer<typeof adoptedBoardCapitalDiscussionInputSchema>;

/** The discussion basis and the reviewed results it reads, verbatim as their executions returned them. */
export const boardCapitalDiscussionAnalysesSchema = z.strictObject({
  sources: z.array(boardSourcePacketSchema).min(1).max(16),
  discussion: adoptedBoardCapitalDiscussionInputSchema,
});
export type BoardCapitalDiscussionAnalyses = z.infer<typeof boardCapitalDiscussionAnalysesSchema>;

/** [source, path, decimals or date format, stated]: never a unit, a scale or a periodicity. */
const readingTuple = z.tuple([key, z.string().min(1).max(400), z.enum(["0", "1", "2", "-", "day_month", "day_long", "month_year", "month_long", "year"])]).rest(z.string().max(2000));
const reference = /^(?:\d{4}-\d{2}-\d{2}|-?\d{1,24}(?:\.\d{1,8})?)$/;

/** The board discussion read from its adopted basis, with the reviewed results checked by identity: each
 * named by method and fingerprint, parsed by its released schema, its fingerprint recomputed, the same company.
 * Every number on the material is then read from one of them and checked against the stated number. */
export function calculateAdoptedBoardCapitalDiscussion(raw: unknown) {
  const {sources: packets, discussion: input} = boardCapitalDiscussionAnalysesSchema.parse(raw);
  const prefix = `board_capital.${input.analysisId}.`, sc = input.scenario;
  // The only domain is reais: a discussion in another currency is not prepared.
  if (input.currency !== "BRL") throw new Error(`board_capital_currency_not_supported:${input.currency}`);
  const b = createAnalysisBinding(input, []);
  let complete = true;
  const need = <T>(v: T | null): T => {if (v === null) complete = false; return v as T;};
  type Sel = z.infer<typeof selection>;
  const read = <T>(s: Sel, path: string, unit: string, type: "number" | "text" | "date" | "boolean" | "list", schema: z.ZodType<T>) => b.read(s, prefix + path, sc, unit, type, schema);
  const list = (s: Sel, path: string, schema: z.ZodType<string[]> = z.array(words).max(16)) => need(read(s, path, "identity", "list", schema));
  const m = input.meeting;
  const meetingDate = need(read(m.date, "meeting.date", "date", "date", z.iso.date()));
  const askedOn = need(read(m.askedOn, "meeting.askedOn", "date", "date", z.iso.date()));
  const leadDays = need(read(m.leadDays, "meeting.leadDays", "days", "number", z.string().regex(/^\d{1,3}$/)));
  const minutesPerPage = need(read(m.minutesPerPage, "meeting.minutesPerPage", "minutes", "number", z.string().regex(/^[1-9]\d?$/)));
  const agendaMinutes = m.agendaMinutes === null ? null : need(read(m.agendaMinutes, "meeting.agendaMinutes", "minutes", "number", z.string().regex(/^[1-9]\d{0,2}$/)));
  const nextMeetingDate = m.nextMeetingDate === null ? null : need(read(m.nextMeetingDate, "meeting.nextMeetingDate", "date", "date", z.iso.date()));
  const template = m.template === null ? null : need(read(m.template, "meeting.template", "text", "text", words));
  const outlineConfirmed = need(read(m.outlineConfirmed, "meeting.outlineConfirmed", "convention", "boolean", z.boolean()));
  const named = input.sources.map((s) => {
    const r = list(s.reading, `source.${s.id}`, z.tuple([z.enum(boardSourceMethodIds), hash, z.enum(["reais", "millions"])]));
    return r === null ? null : {id: s.id, methodId: r[0]!, packetFingerprint: r[1]!, moneyScale: r[2] as "reais" | "millions"};
  });
  const topics = input.topics.map((t) => ({id: t.id, label: need(read(t.label, `topic.${t.id}.label`, "text", "text", textRef)),
    seen: t.seen === null ? null : need(read(t.seen, `topic.${t.id}.seen`, "convention", "boolean", z.boolean()))}));
  const themeOf = (refs: (string | null | undefined)[]) => {const xs = refs.filter((r): r is string => typeof r === "string"); return xs.length ? boardThemeOfRefs(xs) : null;};
  const deliberations = input.deliberations.map((d) => {
    const p = `deliberation.${d.id}.`, authority = list(d.authority, p + "authority", z.tuple([z.enum(boardAuthorities)]).rest(textRef));
    const x = {id: d.id, title: need(read(d.title, p + "title", "text", "text", textRef)), subject: need(read(d.subject, p + "subject", "text", "text", textRef)),
      recommendation: d.recommendation === null ? null : need(read(d.recommendation, p + "recommendation", "text", "text", textRef)),
      authority: authority?.[0] as (typeof boardAuthorities)[number], authorityBasis: authority?.[1] ?? null,
      deadlines: d.deadlines.map((x) => {const r = list(x.reading, `${p}deadline.${x.id}`, z.tuple([z.iso.date(), textRef])); return {id: x.id, date: r?.[0] as string, action: r?.[1] as string};})};
    // The theme is derived from the templates, never adopted.
    return {...x, topicId: themeOf([x.title, x.subject, x.recommendation, ...x.deadlines.map((t) => t.action)])};
  });
  const figures: BoardFigure[] = input.figures.map((f) => {
    if (f.kind === "pending") {
      // A pending figure names the method and the exact field it stands for, and why it is pending.
      const r = list(f.reading, `figure.${f.id}.pending`, z.tuple([key, z.string().min(1).max(400), textRef]));
      return {id: f.id, kind: "pending", requiredMethodId: r?.[0] as string, requiredPath: r?.[1] as string, reason: r?.[2] as string};
    }
    const r = list(f.reading, `figure.${f.id}.reading`, readingTuple);
    if (r && (r.length > 4 || (r[3] !== undefined && !reference.test(r[3])))) throw new Error(`board_capital_figure_reading_invalid:${f.id}`);
    return {id: f.id, kind: "reading", sourceId: r?.[0] as string, path: r?.[1] as string, presentation: r?.[2] as string, stated: r?.[3] ?? null} as BoardFigure;
  });
  const materialFigureIds = list(input.materialFigureIds, "figures.material", z.array(key).max(160));
  const indicative = input.indicative.map((x) => ({figureId: x.figureId, reason: need(read(x.reason, `figure.${x.figureId}.indicative`, "text", "text", textRef))}));
  const pages = input.pages.map((pg) => {
    const p = `page.${pg.id}.`;
    const x = {id: pg.id, role: need(read(pg.role, p + "role", "convention", "text", z.enum(boardPageRoles))), title: need(read(pg.title, p + "title", "text", "text", textRef)),
      lines: need(read(pg.lines, p + "lines", "text", "list", z.array(textRef).max(12))),
      recommendation: pg.recommendation === null ? null : need(read(pg.recommendation, p + "recommendation", "text", "text", textRef)),
      options: pg.options === null ? [] : need(read(pg.options, p + "options", "text", "list", z.array(textRef).max(6)))};
    return {...x, topicId: themeOf([x.title, ...(x.lines ?? []), x.recommendation, ...(x.options ?? [])])};
  });
  const summary = {opening: need(read(input.summary.opening, "summary.opening", "text", "text", textRef)), closing: need(read(input.summary.closing, "summary.closing", "text", "text", textRef))};
  const appendix = input.appendix.map((a) => {const r = list(a.reading, `appendix.${a.id}`, z.tuple([textRef]).rest(key)); return {id: a.id, label: r?.[0] as string, sourceIds: r?.slice(1) ?? []};});
  const questions = input.questions.map((q) => ({id: q.id, question: need(read(q.question, `question.${q.id}.question`, "text", "text", textRef)),
    answer: need(read(q.answer, `question.${q.id}.answer`, "text", "text", textRef))}));
  const omissions = input.omissions.map((o) => {const r = list(o.reading, `omission.${o.id}`, z.tuple([z.enum(boardOmissionTargets), z.string().regex(/^[a-z0-9][a-z0-9.-]{0,80}$/), textRef]));
    return {id: o.id, target: r?.[0] as (typeof boardOmissionTargets)[number], targetId: r?.[1] as string, requestedBy: r?.[2] as string};});
  const informed = input.informed.map((x) => {const r = list(x.reading, `informed.${x.id}`, z.tuple([z.string().max(40), z.string().max(40), z.string().regex(/^[a-z][a-z_]{0,59}$/)]));
    return {id: x.id, origin: r?.[0] as string, author: r?.[1] as string, code: r?.[2] as string};});
  // The results it reads are those the basis names, by fingerprint, and no other.
  const byId = new Map(packets.map((p) => [p.id, p.packet]));
  if (byId.size !== packets.length || packets.some((p) => !input.sources.some((s) => s.id === p.id))) throw new Error("board_capital_source_not_named");
  const sources: BoardSourceReading[] = named.flatMap((n) => {
    if (n === null) return [];
    const packet = byId.get(n.id);
    if (!packet) throw new Error(`board_capital_source_missing:${n.id}`);
    return [verifyBoardSource(n, parseBoardSourceText(n.id, packet), {entityId: input.entityId, currency: input.currency})];
  });
  const discussion: BoardDiscussion | null = complete ? {meetingDate, askedOn, leadDays: Number(leadDays), agendaMinutes: agendaMinutes === null ? null : Number(agendaMinutes),
    minutesPerPage: Number(minutesPerPage), nextMeetingDate, template, outlineConfirmed, topics, deliberations, figures, materialFigureIds, indicative, pages, summary, appendix, questions, omissions, informed} : null;
  const result = discussion ? prepareBoardCapitalDiscussion(discussion, sources) : null;
  const payload = {schemaVersion: "adopted-board-capital-discussion.v1" as const, financialCoreVersion, scope: input.scope, analysisId: input.analysisId,
    entityId: input.entityId, perimeter: input.perimeter, currency: input.currency, basisFingerprint: input.envelope.fingerprint,
    sources: sources.map(({packet: _p, gaps: _g, ...s}) => s), discussion: result,
    gaps: b.gaps, bindings: b.bindings, normalization: b.normalization, contributions: [...b.used.values()],
    status: result ? "partial_composition" as const : "missing_inputs" as const,
    derivedDependencies: [{result: "board_capital_discussion", decisionIds: [...b.used.keys()]}],
    classification: [...b.used.values()].some((e) => e.kind === "hypothesis") ? "working_hypothesis" as const : "working_selection" as const,
    exclusions: boardCapitalDiscussionExclusions, grantsExecution: false as const, grantsPublication: false as const};
  // Internal fingerprint: canonical serialization (keys sorted), so it is recomputed from the published object.
  return {...payload, fingerprint: createHash("sha256").update(boardCanonicalJson(payload)).digest("hex")};
}
