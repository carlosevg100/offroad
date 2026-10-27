import {createHash} from "node:crypto";
import Decimal from "decimal.js";

/** Board discussion of a capital decision (ficha C47). Nothing here recalculates an analysis: every
 * number on the material is read from a reviewed result, rounded for display and checked against the
 * number the author states; the material is assembled from deliberations, pages, questions and the
 * omission rule. Deterministic, without model calls. */
export const boardCapitalDiscussionVersion = "2026.10.27-v1";

const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

export const boardFigureUnits = ["brl_millions", "brl", "percent", "multiple", "years", "months", "bps", "number", "date_day_month", "date_month_year", "text"] as const;
export type BoardFigureUnit = (typeof boardFigureUnits)[number];
export const boardPageRoles = ["decisions", "situation", "constraint", "topic", "alternatives", "recommendation", "risk", "what_changes", "next_steps"] as const;
export type BoardPageRole = (typeof boardPageRoles)[number];
export const boardAuthorities = ["board", "executive", "shareholders"] as const;
export const boardOmissionTargets = ["recommendation", "page", "figure", "deadline"] as const;
export type BoardOmissionTarget = (typeof boardOmissionTargets)[number];

export type BoardFigure =
  | {id: string; kind: "reading"; sourceId: string; path: string; unit: BoardFigureUnit; scale: number; places: number; stated: string | null}
  | {id: string; kind: "pending"; requiredMethodId: string; reason: string};
/** A reviewed result as the material reads it: identity only; the packet itself is checked by the reader. */
export type BoardSourceReading = {id: string; methodId: string; methodVersion: string; executorVersion: string | null; packetSchemaVersion: string;
  packetFingerprint: string; status: string; gaps: {operand: string; reason: string}[]; packet: unknown};
export type BoardDeliberation = {id: string; title: string; subject: string; recommendation: string | null; topicId: string | null;
  authority: (typeof boardAuthorities)[number]; authorityBasis: string | null; deadlines: {id: string; date: string; action: string}[]};
export type BoardPage = {id: string; role: BoardPageRole; topicId: string | null; title: string; lines: string[]; recommendation: string | null; options: string[]};
export type BoardDiscussion = {
  meetingDate: string; askedOn: string; leadDays: number; agendaMinutes: number | null; minutesPerPage: number; nextMeetingDate: string | null;
  template: string | null; outlineConfirmed: boolean;
  topics: {id: string; label: string; seen: boolean | null}[];
  deliberations: BoardDeliberation[];
  figures: BoardFigure[]; materialFigureIds: string[]; indicative: {figureId: string; reason: string}[];
  pages: BoardPage[];
  summary: {opening: string; closing: string};
  appendix: {id: string; label: string; sourceIds: string[]}[];
  questions: {id: string; question: string; answer: string}[];
  omissions: {id: string; target: BoardOmissionTarget; targetId: string; requestedBy: string}[];
};

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const feminine = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
/** Marks a number the material needs and no reviewed result supplies yet. */
export const boardPendingMark = "[pendente]";
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const fingerprintOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Reads one value of a reviewed result by path: dotted keys, `[n]` for a position and `[field=value]`
 * for the one element whose field equals the value. Anything else, or a selector matching zero or
 * several elements, is unresolved. */
export function readBoardSourcePath(root: unknown, path: string): unknown {
  const segments = path.split(/\.(?![^[]*\])/);
  let node: unknown = root;
  for (const raw of segments) {
    const m = /^([A-Za-z0-9_]+)((?:\[[^\]]+\])*)$/.exec(raw);
    if (!m) throw new Error("board_capital_path_invalid");
    node = isRecord(node) && Object.hasOwn(node, m[1]!) ? node[m[1]!] : undefined;
    for (const selector of m[2]!.match(/\[[^\]]+\]/g) ?? []) {
      const body = selector.slice(1, -1);
      if (!Array.isArray(node)) return undefined;
      if (/^\d+$/.test(body)) {node = node[Number(body)]; continue;}
      const at = body.indexOf("=");
      if (at < 1) throw new Error("board_capital_path_invalid");
      const field = body.slice(0, at), value = body.slice(at + 1);
      const hits = node.filter((x) => isRecord(x) && (typeof x[field] === "string" || typeof x[field] === "number") && String(x[field]) === value);
      if (hits.length !== 1) return undefined;
      node = hits[0];
    }
    if (node === undefined) return undefined;
  }
  return node;
}

const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${months[Number(iso.slice(5, 7)) - 1]}`;
const monthYear = (iso: string) => `${months[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

/** The display of one reading and its identity check: the source value scaled by a power of ten,
 * rounded half up to the declared places, against the number the author states. */
export function checkBoardFigure(raw: unknown, unit: BoardFigureUnit, scale: number, places: number, stated: string | null) {
  if (unit === "text") {
    if (typeof raw !== "string" || !raw.trim()) return null;
    return {value: raw, rounded: raw, display: raw, matches: stated === null || stated === raw};
  }
  if (unit === "date_day_month" || unit === "date_month_year") {
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    return {value: raw, rounded: raw, display: unit === "date_day_month" ? dayMonth(raw) : monthYear(raw), matches: stated === raw};
  }
  if (!(typeof raw === "number" && Number.isFinite(raw)) && !(typeof raw === "string" && /^-?\d+(?:\.\d+)?$/.test(raw))) return null;
  const value = new Exact(raw).times(new Exact(10).pow(scale));
  const rounded = value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
  const text = rounded.toFixed(places);
  return {value: new Exact(raw).toFixed(), rounded: text, display: text.replace(".", ","), matches: stated !== null && new Exact(stated).eq(rounded)};
}

/** Literal digits are allowed only as a year or a month of a year (2027, dez/26); every other number
 * on the material comes from a placeholder bound to a reviewed result or to a deliberation. */
export function boardLiteralNumbers(template: string): string[] {
  const literal = template.replace(/\{[^}]*\}/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ").replace(new RegExp(`\\b(?:${months.join("|")})/\\d{2}\\b`, "g"), " ");
  return literal.match(/\d+/g) ?? [];
}

type Resolved = {display: string; figureIds: string[]; pendingFigureIds: string[]; deadlineIds: string[]};
/** Renders one template. Tokens: `{figure}`, `{count:deliberations}`, `{count:dated}`,
 * `{count:due-before-next-meeting}` and `{deadline:<deliberation>.<deadline>}`. A literal number or
 * an unknown token refuses the material by name. */
export function renderBoardTemplate(template: string, context: {figures: Map<string, {display: string} | {pending: true}>;
  deliberations: BoardDeliberation[]; nextMeetingDate: string | null}): Resolved {
  if (boardLiteralNumbers(template).length) throw new Error(`board_capital_number_without_origin:${template.slice(0, 80)}`);
  const figureIds: string[] = [], pendingFigureIds: string[] = [], deadlineIds: string[] = [];
  const display = template.replace(/\{([^}]*)\}/g, (_, token: string) => {
    if (token === "count:deliberations") return feminine[context.deliberations.length] ?? String(context.deliberations.length);
    if (token === "count:dated") {const n = context.deliberations.filter((d) => d.deadlines.length).length; return feminine[n] ?? String(n);}
    if (token === "count:due-before-next-meeting") {
      if (context.nextMeetingDate === null) throw new Error("board_capital_number_without_origin:next_meeting_date");
      const n = context.deliberations.filter((d) => d.deadlines.some((x) => x.date < context.nextMeetingDate!)).length;
      return feminine[n] ?? String(n);
    }
    if (token.startsWith("deadline:")) {
      const [deliberationId, deadlineId] = token.slice(9).split(".");
      const deadline = context.deliberations.find((d) => d.id === deliberationId)?.deadlines.find((x) => x.id === deadlineId);
      if (!deadline) throw new Error(`board_capital_unknown_token:${token}`);
      deadlineIds.push(`${deliberationId}.${deadlineId}`);
      return dayMonth(deadline.date);
    }
    const figure = context.figures.get(token);
    if (!figure) throw new Error(`board_capital_unknown_token:${token}`);
    if ("pending" in figure) {pendingFigureIds.push(token); return boardPendingMark;}
    figureIds.push(token);
    return figure.display;
  });
  return {display, figureIds, pendingFigureIds, deadlineIds};
}

/** Urgency order: the earliest deadline first; undated deliberations last; ties keep the adopted order. */
export function orderBoardDeliberations(deliberations: BoardDeliberation[]) {
  const earliest = (d: BoardDeliberation) => d.deadlines.reduce<string | null>((m, x) => m === null || x.date < m ? x.date : m, null);
  return deliberations.map((d, index) => ({d, index, at: earliest(d)}))
    .sort((a, b) => a.at === b.at ? a.index - b.index : a.at === null ? 1 : b.at === null ? -1 : a.at < b.at ? -1 : 1).map((x) => x.d);
}

/** The narrative a board follows: decisions, situation, constraint, the topics it has not seen, the
 * alternatives, the recommendation, the risks, what would change it and the next steps. A topic the
 * board has already seen goes to the appendix; one it has not seen, or unknown, stays before the
 * recommendation. Pages keep the adopted order inside each role. */
export function orderBoardPages(pages: BoardPage[], topics: BoardDiscussion["topics"]) {
  const seen = new Map(topics.map((t) => [t.id, t.seen]));
  const rank = new Map(boardPageRoles.map((r, i) => [r, i]));
  const main = pages.map((p, index) => ({p, index})).filter(({p}) => !(p.role === "topic" && p.topicId !== null && seen.get(p.topicId) === true))
    .sort((a, b) => rank.get(a.p.role)! - rank.get(b.p.role)! || a.index - b.index).map((x) => x.p);
  const appendix = pages.filter((p) => !main.includes(p));
  return {main, appendix};
}

const sentences = {
  recommendationRemoved: "Retirei a recomendação; a página mostra as opções com os critérios e os números, e os fatos materiais continuam.",
  materialKept: "Os fatos materiais ficam no material, porque são o que o conselho precisa para decidir; sem eles, a escolha ficaria sem base.",
  deadlineKept: "O prazo fica, porque vale para qualquer caminho que o conselho escolher.",
  figureRemoved: "Retirei o número pedido; ele não é fato material para a decisão.",
  pageRemoved: "Retirei a página; ela não traz fato material para a decisão.",
  unknownTarget: "O pedido não corresponde a nenhuma parte do material.",
} as const;
export type BoardOmissionDecision = {id: string; target: BoardOmissionTarget; targetId: string; requestedBy: string; outcome: "applied" | "refused"; reason: string; keptFigureIds: string[]};

/** One deliberation in one sentence: what is asked and, after it, every action with its deadline. */
function deliberationText(ask: string, deadlines: {action: string; display: string}[]) {
  const dated = deadlines.map((t) => `${t.action} até ${t.display}`);
  return dated.length ? `${ask}, e ${dated.length > 1 ? `${dated.slice(0, -1).join(", ")} e ${dated.at(-1)}` : dated[0]}` : ask;
}

const LIMITS = {title: 120, line: 240, lines: 7, summary: 1400};

/** One version of the material: deliberations in urgency order, pages in narrative order, the summary,
 * the appendix and the questions, with every placeholder rendered from reviewed results. */
function renderVersion(d: BoardDiscussion, figures: Map<string, {display: string} | {pending: true}>, removed: {recommendations: Set<string>; pages: Set<string>; figures: Set<string>}, version: number) {
  const context = {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate};
  const render = (t: string) => renderBoardTemplate(t, context);
  // A figure the author removed renders nowhere: a line that carries it is dropped with it.
  const drops = (t: string) => [...t.matchAll(/\{([^}:]*)\}/g)].some((m) => removed.figures.has(m[1]!));
  const neutralTopics = new Set(d.pages.filter((p) => removed.recommendations.has(p.id) && p.topicId !== null).map((p) => p.topicId!));
  const deliberations = orderBoardDeliberations(d.deliberations).map((x, i) => {
    const recommendation = x.recommendation !== null && !(x.topicId !== null && neutralTopics.has(x.topicId)) ? render(x.recommendation) : null;
    const subject = render(x.subject);
    const deadlines = x.deadlines.map((t) => ({id: t.id, date: t.date, display: dayMonth(t.date), action: render(t.action).display}));
    const text = deliberationText(recommendation?.display ?? subject.display, deadlines);
    return {id: x.id, number: i + 1, title: x.title, text, recommendationShown: recommendation !== null, authority: x.authority, authorityBasis: x.authorityBasis, deadlines,
      figureIds: [...subject.figureIds, ...recommendation?.figureIds ?? []], pendingFigureIds: [...subject.pendingFigureIds, ...recommendation?.pendingFigureIds ?? []]};
  });
  const ordered = orderBoardPages(d.pages.filter((p) => !removed.pages.has(p.id)), d.topics);
  const gaps: {item: string; reason: string}[] = [];
  const page = (p: BoardPage, placement: "main" | "appendix") => {
    const title = render(p.title);
    const lines = p.lines.filter((l) => !drops(l)).map(render);
    if (p.role === "decisions") for (const x of deliberations) lines.push({display: `${x.number}. ${x.title}: ${x.text}`, figureIds: x.figureIds, pendingFigureIds: x.pendingFigureIds,
      deadlineIds: x.deadlines.map((t) => `${x.id}.${t.id}`)});
    const withoutRecommendation = removed.recommendations.has(p.id);
    const recommendation = p.recommendation !== null && !withoutRecommendation ? render(p.recommendation) : null;
    const options = withoutRecommendation ? p.options.filter((o) => !drops(o)).map(render) : [];
    if (withoutRecommendation && !options.length) gaps.push({item: `page.${p.id}`, reason: "recommendation_removed_without_options"});
    const parts = [title, ...lines, ...recommendation ? [recommendation] : [], ...options];
    const figureIds = [...new Set(parts.flatMap((x) => x.figureIds))], pendingFigureIds = [...new Set(parts.flatMap((x) => x.pendingFigureIds))];
    const deadlineIds = [...new Set(parts.flatMap((x) => x.deadlineIds))];
    // Layout budget of one page of the template: the renderer inspects it again page by page.
    if (title.display.length > LIMITS.title || lines.length + (recommendation ? 1 : 0) + options.length > LIMITS.lines
      || [...lines, ...recommendation ? [recommendation] : [], ...options].some((x) => x.display.length > LIMITS.line)) gaps.push({item: `page.${p.id}`, reason: "layout_exceeds_page"});
    for (const f of pendingFigureIds) gaps.push({item: `page.${p.id}.figure.${f}`, reason: "figure_pending_reviewed_result"});
    return {id: p.id, placement, role: p.role, topicId: p.topicId, title: title.display, lines: lines.map((x) => x.display),
      recommendation: recommendation?.display ?? null, options: options.map((x) => x.display), figureIds, pendingFigureIds, deadlineIds};
  };
  const pages = [...ordered.main.map((p) => page(p, "main")), ...ordered.appendix.map((p) => page(p, "appendix"))].map((p, i) => ({...p, number: i + 1}));
  // The page of decisions opens the material and lists every deliberation.
  if (pages[0]?.role !== "decisions") throw new Error("board_capital_material_without_decisions");
  const opening = render(d.summary.opening), closing = render(d.summary.closing);
  const asks = deliberations.map((x) => `(${x.number}) ${x.text}`);
  const summary = `${opening.display} Pedimos ao conselho: ${asks.length > 1 ? `${asks.slice(0, -1).join("; ")}; e ${asks.at(-1)}` : asks[0]}. ${closing.display}`;
  if (summary.length > LIMITS.summary) gaps.push({item: "summary", reason: "layout_exceeds_page"});
  for (const f of [...opening.pendingFigureIds, ...closing.pendingFigureIds]) gaps.push({item: `summary.figure.${f}`, reason: "figure_pending_reviewed_result"});
  const questions = d.questions.map((q) => {const t = render(q.question), a = render(q.answer);
    return {id: q.id, question: t.display, answer: a.display, figureIds: [...t.figureIds, ...a.figureIds], pendingFigureIds: [...t.pendingFigureIds, ...a.pendingFigureIds]};});
  for (const q of questions) for (const f of q.pendingFigureIds) gaps.push({item: `question.${q.id}.figure.${f}`, reason: "figure_pending_reviewed_result"});
  for (const x of deliberations) for (const f of x.pendingFigureIds) gaps.push({item: `deliberation.${x.id}.figure.${f}`, reason: "figure_pending_reviewed_result"});
  const mainCount = pages.filter((p) => p.placement === "main").length;
  const capacity = d.agendaMinutes === null ? null : Math.floor(d.agendaMinutes / d.minutesPerPage);
  if (capacity !== null && mainCount > capacity) gaps.push({item: "pages", reason: "pages_exceed_agenda"});
  const body = {version, deliberations, pages, summary, summaryFigureIds: [...opening.figureIds, ...closing.figureIds],
    appendix: d.appendix.map((a) => ({id: a.id, label: a.label, sourceIds: a.sourceIds})), questions,
    agenda: {minutes: d.agendaMinutes, minutesPerPage: d.minutesPerPage, mainPages: mainCount, capacity, fits: capacity === null ? null : mainCount <= capacity}};
  return {material: {...body, fingerprint: fingerprintOf(body)}, gaps};
}

/** The omission rule: the form may change and a recommendation may be withdrawn; a material fact
 * (a figure the basis marks material, a page that carries one, a deadline) is never omitted on request. */
export function decideBoardOmissions(d: BoardDiscussion) {
  const material = new Set(d.materialFigureIds);
  const figuresOf = (t: string) => [...t.matchAll(/\{([^}:]*)\}/g)].map((m) => m[1]!).filter((id) => material.has(id));
  const pageFacts = (p: BoardPage) => [...new Set([p.title, ...p.lines, ...p.recommendation ? [p.recommendation] : [], ...p.options].flatMap(figuresOf))];
  const removed = {recommendations: new Set<string>(), pages: new Set<string>(), figures: new Set<string>()};
  const decisions: BoardOmissionDecision[] = d.omissions.map((o) => {
    const done = (outcome: "applied" | "refused", reason: string, keptFigureIds: string[] = []) => ({...o, outcome, reason, keptFigureIds});
    if (o.target === "recommendation") {
      const p = d.pages.find((x) => x.id === o.targetId);
      if (!p || p.recommendation === null) return done("refused", sentences.unknownTarget);
      removed.recommendations.add(p.id);
      return done("applied", sentences.recommendationRemoved, pageFacts(p));
    }
    if (o.target === "page") {
      const p = d.pages.find((x) => x.id === o.targetId);
      if (!p) return done("refused", sentences.unknownTarget);
      const facts = pageFacts(p);
      if (facts.length || p.role === "decisions") return done("refused", sentences.materialKept, facts);
      removed.pages.add(p.id);
      return done("applied", sentences.pageRemoved);
    }
    if (o.target === "figure") {
      if (!d.figures.some((f) => f.id === o.targetId)) return done("refused", sentences.unknownTarget);
      if (material.has(o.targetId)) return done("refused", sentences.materialKept, [o.targetId]);
      removed.figures.add(o.targetId);
      return done("applied", sentences.figureRemoved);
    }
    const [deliberationId, deadlineId] = o.targetId.split(".");
    const known = d.deliberations.some((x) => x.id === deliberationId && x.deadlines.some((t) => t.id === deadlineId));
    return done("refused", known ? sentences.deadlineKept : sentences.unknownTarget);
  });
  return {decisions, removed};
}

/** Structural refusals that do not depend on the reviewed results. */
export function validateBoardDiscussion(d: BoardDiscussion) {
  if (!d.deliberations.length) throw new Error("board_capital_material_without_decisions");
  if (d.pages.filter((p) => p.role === "decisions").length !== 1) throw new Error("board_capital_material_without_decisions");
  const unique = (xs: string[], code: string) => {if (new Set(xs).size !== xs.length) throw new Error(code);};
  unique(d.deliberations.map((x) => x.id), "board_capital_duplicate_deliberation");
  unique(d.pages.map((x) => x.id), "board_capital_duplicate_page");
  unique(d.figures.map((x) => x.id), "board_capital_duplicate_figure");
  unique(d.questions.map((x) => x.id), "board_capital_duplicate_question");
  const topics = new Set(d.topics.map((t) => t.id));
  for (const x of [...d.pages, ...d.deliberations]) if (x.topicId !== null && !topics.has(x.topicId)) throw new Error("board_capital_unknown_topic");
  for (const id of [...d.materialFigureIds, ...d.indicative.map((x) => x.figureId)]) if (!d.figures.some((f) => f.id === id)) throw new Error("board_capital_unknown_figure");
  const tokens = (t: string) => [...t.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!);
  const supported = (ts: string[]) => ts.some((t) => !t.startsWith("count:"));
  // Every page carries a number from a reviewed result or a dated deliberation; every answer carries a number.
  for (const p of d.pages) if (p.role !== "decisions" && !supported([p.title, ...p.lines, ...p.recommendation ? [p.recommendation] : []].flatMap(tokens))) throw new Error(`board_capital_page_without_number:${p.id}`);
  for (const q of d.questions) if (!supported(tokens(q.answer))) throw new Error(`board_capital_answer_without_number:${q.id}`);
  for (const a of d.appendix) if (!a.sourceIds.length) throw new Error(`board_capital_appendix_without_source:${a.id}`);
}

/** Resolves every figure against the reviewed results: a reading that does not resolve is refused as a
 * number without origin; one that resolves to a different number than the author states is refused as
 * divergent. A pending figure renders as pending and becomes a named gap wherever it is used. */
export function resolveBoardFigures(d: BoardDiscussion, sources: BoardSourceReading[]) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const checks: {figureId: string; sourceId: string; methodId: string; methodVersion: string; packetFingerprint: string; path: string; unit: BoardFigureUnit;
    value: string; rounded: string; stated: string | null; display: string; matches: true}[] = [];
  const figures = new Map<string, {display: string} | {pending: true}>();
  for (const f of d.figures) {
    if (f.kind === "pending") {figures.set(f.id, {pending: true}); continue;}
    const s = byId.get(f.sourceId);
    if (!s) throw new Error(`board_capital_figure_without_origin:${f.id}`);
    if (f.unit !== "text" && f.stated === null) throw new Error(`board_capital_figure_without_statement:${f.id}`);
    const check = checkBoardFigure(readBoardSourcePath(s.packet, f.path), f.unit, f.scale, f.places, f.stated);
    if (!check) throw new Error(`board_capital_figure_without_origin:${f.id}`);
    if (!check.matches) throw new Error(`board_capital_figure_diverges:${f.id}:${check.rounded}:${f.stated}`);
    figures.set(f.id, {display: check.display});
    checks.push({figureId: f.id, sourceId: s.id, methodId: s.methodId, methodVersion: s.methodVersion, packetFingerprint: s.packetFingerprint, path: f.path, unit: f.unit,
      value: check.value, rounded: check.rounded, stated: f.stated, display: check.display, matches: true});
  }
  return {figures, checks};
}

/** The outline proposed before any material: the deliberations in urgency order, the narrative and
 * only the questions that change the material (template, time on the agenda, what the board has seen). */
export function proposeBoardOutline(d: BoardDiscussion, figures: Map<string, {display: string} | {pending: true}>) {
  const context = {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate};
  const deliberations = orderBoardDeliberations(d.deliberations).map((x, i) => {
    const r = renderBoardTemplate(x.recommendation ?? x.subject, context);
    const deadlines = x.deadlines.map((t) => ({id: t.id, date: t.date, display: dayMonth(t.date), action: renderBoardTemplate(t.action, context).display}));
    return {id: x.id, number: i + 1, title: x.title, text: deliberationText(r.display, deadlines), authority: x.authority, deadlines: deadlines.map(({display: _d, ...t}) => t)};
  });
  const roles = [...new Set(orderBoardPages(d.pages, d.topics).main.map((p) => p.role))];
  const questions = [...d.template === null ? [{code: "template" as const, topicId: null}] : [], ...d.agendaMinutes === null ? [{code: "agenda_minutes" as const, topicId: null}] : [],
    ...d.topics.filter((t) => t.seen === null).map((t) => ({code: "board_has_seen" as const, topicId: t.id}))];
  return {deliberations, narrative: roles, questions: questions.map((q) => ({...q, label: q.topicId === null ? null : d.topics.find((t) => t.id === q.topicId)!.label}))};
}

/** The whole discussion: the outline always; the material only once the outline is confirmed or when
 * there is no time before the meeting to confirm it. Each version of the material is kept. */
export function prepareBoardCapitalDiscussion(d: BoardDiscussion, sources: BoardSourceReading[]) {
  validateBoardDiscussion(d);
  const {figures, checks} = resolveBoardFigures(d, sources);
  const outline = proposeBoardOutline(d, figures);
  const daysBefore = Math.round((Date.parse(`${d.meetingDate}T00:00:00Z`) - Date.parse(`${d.askedOn}T00:00:00Z`)) / 86400000);
  if (daysBefore < 0) throw new Error("board_capital_meeting_before_request");
  const timeToAlign = daysBefore >= d.leadDays;
  const produce = d.outlineConfirmed || !timeToAlign;
  const {decisions, removed} = decideBoardOmissions(d);
  const none = {recommendations: new Set<string>(), pages: new Set<string>(), figures: new Set<string>()};
  const first = produce ? renderVersion(d, figures, none, 1) : null;
  const changed = removed.recommendations.size + removed.pages.size + removed.figures.size > 0;
  const second = produce && changed ? renderVersion(d, figures, removed, 2) : null;
  const current = second ?? first;
  const used = new Set(current ? [...current.material.pages.flatMap((p) => p.figureIds), ...current.material.questions.flatMap((q) => q.figureIds),
    ...current.material.deliberations.flatMap((x) => x.figureIds), ...current.material.summaryFigureIds] : []);
  const pending = {
    indicative: d.indicative.filter((x) => used.has(x.figureId)),
    sources: sources.filter((s) => s.status !== "prepared_for_human_review").map((s) => ({sourceId: s.id, methodId: s.methodId, status: s.status, reasons: [...new Set(s.gaps.map((g) => g.reason))]})),
    authority: d.deliberations.filter((x) => x.authorityBasis === null).map((x) => x.id),
    template: d.template === null ? "not_supplied" as const : "supplied_not_applied" as const,
  };
  return {version: boardCapitalDiscussionVersion, stage: produce ? "material" as const : "outline" as const, timeToAlign, daysBefore, outline,
    identity: checks, omissions: decisions, versions: [first, second].flatMap((v) => v ? [v.material] : []), gaps: current?.gaps ?? [], pending,
    priorVersionsKept: true as const, sentToThirdParties: false as const, presented: false as const};
}
