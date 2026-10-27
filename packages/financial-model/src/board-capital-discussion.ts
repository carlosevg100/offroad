import {createHash} from "node:crypto";
import Decimal from "decimal.js";

/** Board discussion of a capital decision (ficha C47). Nothing here recalculates an analysis: every
 * number on the material is read from a reviewed result, rounded for display and checked against the
 * number the author states; the material is assembled from deliberations, pages, questions and the
 * omission rule. Deterministic, without model calls. */
export const boardCapitalDiscussionVersion = "2026.10.27-v1";

const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

export const boardFigureUnits = ["brl_millions", "brl", "percent", "multiple", "years", "months", "bps", "number", "date_day_month", "date_month_year", "text", "boolean"] as const;
/** The source fields a text reading may come from: labels and names, never a figure. */
export const boardLabelKeys = ["label", "creditor", "name", "title"];
/** Units that carry an economic number: a page or an answer is supported only by one of these. */
export const boardEconomicUnits: readonly BoardFigureUnit[] = ["brl_millions", "brl", "percent", "multiple", "years", "months", "bps", "number"];
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
  if (unit === "boolean") {
    if (typeof raw !== "boolean") return null;
    return {value: String(raw), rounded: String(raw), display: raw ? "sim" : "não", matches: stated === null};
  }
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

/** No literal digit is allowed in a template: a number comes from a reading, a deadline, a count of
 * deliberations, or a calendar marker (`{year:2027}`, `{month:2026-12}`) that declares it a date. */
export function boardLiteralNumbers(template: string): string[] {
  return template.replace(/\{[^}]*\}/g, " ").match(/\d+/g) ?? [];
}

/** A text as rendered, with the span of every marker it carries: a reading, a source text, a pending
 * figure, a deadline, a count of deliberations or an ordinal the method writes. The verifier reads the
 * final text against these spans. */
export type BoardSpan = {start: number; end: number; kind: "figure" | "text_figure" | "pending" | "deadline" | "calendar" | "count" | "ordinal"; id: string; unit: BoardFigureUnit | null};
export type BoardRich = {display: string; spans: BoardSpan[]};
type Resolved = BoardRich & {figureIds: string[]; pendingFigureIds: string[]; deadlineIds: string[]};
export type BoardFigureDisplay = {display: string; unit: BoardFigureUnit} | {pending: true};
type Context = {figures: Map<string, BoardFigureDisplay>; deliberations: BoardDeliberation[]; nextMeetingDate: string | null};
/** The sign a unit must carry right after its number, so a spread is never read as a rate in points. */
const unitSuffix: Partial<Record<BoardFigureUnit, string>> = {percent: "%", multiple: "x"};
const moneyUnits: readonly BoardFigureUnit[] = ["brl_millions", "brl"];

/** Joins rendered pieces and literal glue into one text, shifting every span. */
export function joinBoardRich(parts: (string | BoardRich)[]): BoardRich {
  let display = ""; const spans: BoardSpan[] = [];
  for (const part of parts) {
    if (typeof part === "string") {display += part; continue;}
    spans.push(...part.spans.map((x) => ({...x, start: x.start + display.length, end: x.end + display.length})));
    display += part.display;
  }
  return {display, spans};
}
const ordinal = (n: number): BoardRich => ({display: String(n), spans: [{start: 0, end: String(n).length, kind: "ordinal", id: String(n), unit: null}]});
const ids = (r: BoardRich, kinds: BoardSpan["kind"][]) => [...new Set(r.spans.filter((x) => kinds.includes(x.kind)).map((x) => x.id))];
const resolved = (r: BoardRich): Resolved => ({...r, figureIds: ids(r, ["figure", "text_figure"]), pendingFigureIds: ids(r, ["pending"]), deadlineIds: ids(r, ["deadline"])});

/** Checks a text that carries no placeholder: any literal number other than a year or a month of a year is refused. */
export function checkBoardText(text: string): string {
  if (boardLiteralNumbers(text).length || /\{[^}]*\}/.test(text)) throw new Error(`board_capital_number_without_origin:${text.slice(0, 80)}`);
  return text;
}

/** Renders one template into text and spans. Tokens: `{figure}`, `{count:deliberations}`, `{count:dated}`,
 * `{count:due-before-next-meeting}` and `{deadline:<deliberation>.<deadline>}`. A literal number, an unknown
 * token or a percentage or multiple without its sign refuses the material by name. */
export function renderBoardTemplate(template: string, context: Context): Resolved {
  if (boardLiteralNumbers(template).length) throw new Error(`board_capital_number_without_origin:${template.slice(0, 80)}`);
  const parts: (string | BoardRich)[] = [];
  let last = 0;
  const marker = (display: string, kind: BoardSpan["kind"], id: string, unit: BoardFigureUnit | null): BoardRich => ({display, spans: [{start: 0, end: display.length, kind, id, unit}]});
  for (const m of template.matchAll(/\{([^}]*)\}/g)) {
    parts.push(template.slice(last, m.index)); last = m.index! + m[0].length;
    const token = m[1]!;
    const count = (n: number) => marker(feminine[n] ?? String(n), "count", token, null);
    if (token === "count:deliberations") {parts.push(count(context.deliberations.length)); continue;}
    if (token === "count:dated") {parts.push(count(context.deliberations.filter((d) => d.deadlines.length).length)); continue;}
    if (token === "count:due-before-next-meeting") {
      if (context.nextMeetingDate === null) throw new Error("board_capital_number_without_origin:next_meeting_date");
      parts.push(count(context.deliberations.filter((d) => d.deadlines.some((x) => x.date < context.nextMeetingDate!)).length)); continue;
    }
    const year = /^year:((?:19|20)\d{2})$/.exec(token), month = /^month:((?:19|20)\d{2})-(0[1-9]|1[0-2])$/.exec(token);
    if (year) {parts.push(marker(year[1]!, "calendar", token, null)); continue;}
    if (month) {parts.push(marker(`${months[Number(month[2]) - 1]}/${month[1]!.slice(2)}`, "calendar", token, null)); continue;}
    if (token.startsWith("deadline:")) {
      const [deliberationId, deadlineId] = token.slice(9).split(".");
      const deadline = context.deliberations.find((d) => d.id === deliberationId)?.deadlines.find((x) => x.id === deadlineId);
      if (!deadline) throw new Error(`board_capital_unknown_token:${token}`);
      parts.push(marker(dayMonth(deadline.date), "deadline", `${deliberationId}.${deadlineId}`, null)); continue;
    }
    const figure = context.figures.get(token);
    if (!figure) throw new Error(`board_capital_unknown_token:${token}`);
    if ("pending" in figure) {parts.push(marker(boardPendingMark, "pending", token, null)); continue;}
    const suffix = unitSuffix[figure.unit];
    if (suffix && template.slice(last, last + suffix.length) !== suffix) throw new Error(`board_capital_unit_missing:${token}`);
    parts.push(marker(figure.display, figure.unit === "text" ? "text_figure" : "figure", token, figure.unit));
  }
  parts.push(template.slice(last));
  return resolved(joinBoardRich(parts));
}

/** The single number tokenizer of the material, applied to the final text: a day of a month (21/dez), a month
 * of a year (dez/26), or a signed number with any run of digits joined by "." or "," (-9,5; 130,3; 1.303). A
 * percent sign or an "x" right after a number is its unit, read from the next character. */
const monthNames = months.join("|");
const numberToken = new RegExp(`\\d{1,2}/(?:${monthNames})(?![\\p{L}])|(?<![\\p{L}])(?:${monthNames})/\\d{2}(?!\\d)|[-\\u2212]?\\d+(?:[.,]\\d+)*`, "gu");
export function boardNumberTokens(text: string) {
  return [...text.matchAll(numberToken)].map((m) => ({text: m[0], start: m.index!, end: m.index! + m[0].length}));
}

/** The unit words each economic unit must carry right after its number, and the currency mark before it. */
const unitAfter: Record<BoardFigureUnit, RegExp | null> = {
  brl_millions: /^\s(?:milhão|milhões|mi)(?![\p{L}])/u, brl: null, percent: /^%/u, multiple: /^x(?![\p{L}])/u,
  years: /^\s(?:ano|anos)(?![\p{L}])/u, months: /^\s(?:mês|meses)(?![\p{L}])/u, bps: /^\s(?:ponto|pontos)(?![\p{L}])/u,
  number: null, date_day_month: null, date_month_year: null, text: null, boolean: null};
/** Anything after a number that would give it a unit, a scale or a currency. */
const anyUnitAfter = /^(?:\s*%|\s*x(?![\p{L}])|\s*p\.p\.|\s(?:mil|milhão|milhões|mi|bilhão|bilhões|bi|reais|real|dólares|ano|anos|mês|meses|ponto|pontos)(?![\p{L}]))/u;
const currencyBefore = /(?:R\$|US\$|U\$|\$|€|BRL|USD)\s?$/u;
/** Unit and scale words that must belong to a marker wherever they appear. */
const orphanUnits = /R\$|US\$|U\$|€|(?<![\p{L}])(?:reais|real|dólares|bilhão|bilhões|bi|milhão|milhões|mi|p\.p\.|pontos?)(?![\p{L}])|%/gu;

/** Render, then verify: every number of the final text belongs to exactly one marker and is its whole display;
 * the words around it are the unit, scale and currency its reading carries (R$ and milhões for millions of
 * reais, % for a rate, x for a multiple, anos, meses, pontos), and a number without them carries none. Years
 * and months of a year appear only through calendar markers, never as an amount. Every currency mark, scale
 * word and percent sign of the text belongs to a marker of that unit. Source labels are read as they are. */
export function verifyBoardRendered(field: string, r: BoardRich, figures: Map<string, BoardFigureDisplay>) {
  const fail = (why: string, token: string) => {throw new Error(`board_capital_rendered_number_invalid:${field}:${why}:${token}`);};
  for (const x of r.spans) {
    const f = x.kind === "figure" || x.kind === "text_figure" ? figures.get(x.id) : null;
    if (f && ("pending" in f || r.display.slice(x.start, x.end) !== f.display || f.unit !== x.unit)) fail("marker_text", x.id);
  }
  const labels = r.spans.filter((x) => x.kind === "text_figure");
  const inLabel = (i: number) => labels.some((x) => x.start <= i && i < x.end);
  let verified = 0;
  for (const t of boardNumberTokens(r.display)) {
    if (inLabel(t.start) && inLabel(t.end - 1) && labels.some((x) => x.start <= t.start && t.end <= x.end)) {verified++; continue;}
    const holders = r.spans.filter((x) => x.start <= t.start && t.end <= x.end);
    const touching = r.spans.filter((x) => x.start < t.end && t.start < x.end);
    if (holders.length !== 1 || touching.length !== 1) fail(touching.length ? "crosses_markers" : "without_marker", t.text);
    const holder = holders[0]!;
    if (t.start !== holder.start || t.end !== holder.end) fail("partial_marker", t.text);
    const before = r.display.slice(0, t.start), after = r.display.slice(t.end);
    if (holder.kind === "figure" && holder.unit !== null && boardEconomicUnits.includes(holder.unit)) {
      const unit = holder.unit, money = unit === "brl_millions" || unit === "brl";
      if (money ? !/(?<![\p{L}$])R\$\s$/u.test(before) : currencyBefore.test(before)) fail("currency_mark", holder.id);
      const expected = unitAfter[unit];
      if (expected ? !expected.test(after) : anyUnitAfter.test(after)) fail("unit_or_scale", holder.id);
    } else {
      // Dates, calendar markers, ordinals: never an amount, a rate or a multiple.
      if (currencyBefore.test(before) || anyUnitAfter.test(after)) fail("date_as_amount", t.text);
      if (holder.kind === "calendar" && !/(?<![\p{L}])(?:de|em|até|desde|para|entre|a|e|no|na|do|da)\s$/u.test(before)) fail("calendar_context", t.text);
    }
    verified++;
  }
  // Every currency mark, scale word and percent sign belongs to a marker of its unit.
  for (const m of r.display.matchAll(orphanUnits)) {
    const at = m.index!, word = m[0];
    if (inLabel(at)) continue;
    const next = r.spans.find((x) => x.start === at + word.length + 1), prev = r.spans.find((x) => x.end === at || x.end === at - 1);
    const money = (x: BoardSpan | undefined) => x !== undefined && (x.kind === "pending" || (x.kind === "figure" && (x.unit === "brl_millions" || x.unit === "brl")));
    const ok = word === "R$" ? money(next) && r.display[at + 2] === " "
      : word === "%" ? prev !== undefined && prev.end === at && (prev.kind === "pending" || prev.unit === "percent")
      : /^(?:milhão|milhões|mi)$/u.test(word) ? prev !== undefined && prev.end === at - 1 && (prev.kind === "pending" || prev.unit === "brl_millions")
      : /^pontos?$/u.test(word) ? prev !== undefined && prev.end === at - 1 && (prev.kind === "pending" || prev.unit === "bps")
      : false;
    if (!ok) fail("unit_without_marker", word);
  }
  return verified;
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
  figureRemoved: "Retirei o que foi pedido; não era fato material para a decisão.",
  pageRemoved: "Retirei a página; ela não traz fato material para a decisão.",
  unknownTarget: "O pedido não corresponde a nenhuma parte do material.",
} as const;
export type BoardOmissionDecision = {id: string; target: BoardOmissionTarget; targetId: string; requestedBy: string; outcome: "applied" | "refused"; reason: string; keptFigureIds: string[]};
type Removed = {recommendations: Set<string>; pages: Set<string>; figures: Set<string>};
const noRemoval = (): Removed => ({recommendations: new Set(), pages: new Set(), figures: new Set()});

/** One deliberation in one sentence: what is asked and, after it, every action with its deadline. */
function deliberationText(ask: BoardRich, deadlines: {action: BoardRich; display: BoardRich}[]): BoardRich {
  const dated = deadlines.map((t) => joinBoardRich([t.action, " até ", t.display]));
  if (!dated.length) return ask;
  const glue: (string | BoardRich)[] = [];
  dated.forEach((x, i) => {glue.push(i === 0 ? "" : i === dated.length - 1 ? " e " : ", ", x);});
  return joinBoardRich([ask, ", e ", ...glue]);
}

const LIMITS = {title: 120, line: 240, lines: 7, summary: 1400};

/** One version of the material: deliberations in urgency order, pages in narrative order, the summary,
 * the appendix and the questions. Every displayed field is rendered first and then verified number by number
 * on its final text; what a field shows (its markers) is what counts as shown, nothing else. */
function renderVersion(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>, removed: Removed, version: number) {
  const context = {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate};
  let verifiedNumbers = 0;
  const shown = (field: string, r: BoardRich) => {verifiedNumbers += verifyBoardRendered(field, r, figures); return r;};
  const render = (t: string) => renderBoardTemplate(t, context);
  // A figure the author removed renders nowhere: a line that carries it is dropped with it.
  const drops = (t: string) => [...t.matchAll(/\{([^}:]*)\}/g)].some((m) => removed.figures.has(m[1]!));
  const neutralTopics = new Set(d.pages.filter((p) => removed.recommendations.has(p.id) && p.topicId !== null).map((p) => p.topicId!));
  const deliberations = orderBoardDeliberations(d.deliberations).map((x, i) => {
    const ask = x.recommendation !== null && !(x.topicId !== null && neutralTopics.has(x.topicId)) ? render(x.recommendation) : render(x.subject);
    const title = shown(`deliberation.${x.id}.title`, render(x.title));
    const deadlines = x.deadlines.map((t) => {
      const action = shown(`deliberation.${x.id}.deadline.${t.id}`, render(t.action));
      return {id: t.id, date: t.date, rich: {display: dayMonth(t.date), spans: [{start: 0, end: dayMonth(t.date).length, kind: "deadline" as const, id: `${x.id}.${t.id}`, unit: null}]}, action};
    });
    const text = shown(`deliberation.${x.id}.text`, deliberationText(ask, deadlines.map((t) => ({action: t.action, display: t.rich}))));
    const line = joinBoardRich([ordinal(i + 1), ". ", title, ": ", text]);
    return {id: x.id, number: i + 1, title, text, line, recommendationShown: x.recommendation !== null && ask.display !== render(x.subject).display, authority: x.authority,
      authorityBasis: x.authorityBasis === null ? null : checkBoardText(x.authorityBasis), deadlines};
  });
  const ordered = orderBoardPages(d.pages.filter((p) => !removed.pages.has(p.id)), d.topics);
  const gaps: {item: string; reason: string}[] = [];
  const page = (p: BoardPage, placement: "main" | "appendix") => {
    const title = shown(`page.${p.id}.title`, render(p.title));
    const lines: BoardRich[] = p.lines.filter((l) => !drops(l)).map((l, j) => shown(`page.${p.id}.line.${j}`, render(l)));
    if (p.role === "decisions") for (const x of deliberations) lines.push(shown(`page.${p.id}.decision.${x.id}`, x.line));
    const withoutRecommendation = removed.recommendations.has(p.id);
    const recommendation = p.recommendation !== null && !withoutRecommendation ? shown(`page.${p.id}.recommendation`, render(p.recommendation)) : null;
    const options = withoutRecommendation ? p.options.filter((o) => !drops(o)).map((o, j) => shown(`page.${p.id}.option.${j}`, render(o))) : [];
    if (withoutRecommendation && !options.length) gaps.push({item: `page.${p.id}`, reason: "recommendation_removed_without_options"});
    const parts = [title, ...lines, ...recommendation ? [recommendation] : [], ...options];
    const figureIds = [...new Set(parts.flatMap((x) => ids(x, ["figure", "text_figure"])))], pendingFigureIds = [...new Set(parts.flatMap((x) => ids(x, ["pending"])))];
    const deadlineIds = [...new Set(parts.flatMap((x) => ids(x, ["deadline"])))];
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
  const asks: (string | BoardRich)[] = [];
  deliberations.forEach((x, i) => asks.push(i === 0 ? "" : i === deliberations.length - 1 ? "; e " : "; ", "(", ordinal(x.number), ") ", x.text));
  const summary = shown("summary", joinBoardRich([render(d.summary.opening), " Pedimos ao conselho: ", ...asks, ". ", render(d.summary.closing)]));
  if (summary.display.length > LIMITS.summary) gaps.push({item: "summary", reason: "layout_exceeds_page"});
  for (const f of ids(summary, ["pending"])) gaps.push({item: `summary.figure.${f}`, reason: "figure_pending_reviewed_result"});
  const questions = d.questions.map((q) => {
    const t = shown(`question.${q.id}.question`, render(q.question)), a = shown(`question.${q.id}.answer`, render(q.answer));
    return {id: q.id, question: t.display, answer: a.display, figureIds: [...new Set([...ids(t, ["figure", "text_figure"]), ...ids(a, ["figure", "text_figure"])])],
      pendingFigureIds: [...new Set([...ids(t, ["pending"]), ...ids(a, ["pending"])])]};
  });
  for (const q of questions) for (const f of q.pendingFigureIds) gaps.push({item: `question.${q.id}.figure.${f}`, reason: "figure_pending_reviewed_result"});
  const deliberationOut = deliberations.map((x) => {
    const both = [x.title, x.text];
    return {id: x.id, number: x.number, title: x.title.display, text: x.text.display, recommendationShown: x.recommendationShown, authority: x.authority, authorityBasis: x.authorityBasis,
      deadlines: x.deadlines.map((t) => ({id: t.id, date: t.date, display: t.rich.display, action: t.action.display})),
      figureIds: [...new Set(both.flatMap((r) => ids(r, ["figure", "text_figure"])))], pendingFigureIds: [...new Set(both.flatMap((r) => ids(r, ["pending"])))]};
  });
  for (const x of deliberationOut) for (const f of x.pendingFigureIds) gaps.push({item: `deliberation.${x.id}.figure.${f}`, reason: "figure_pending_reviewed_result"});
  const appendix = d.appendix.map((a) => {const label = shown(`appendix.${a.id}`, render(a.label)); return {id: a.id, label: label.display, sourceIds: a.sourceIds, figureIds: ids(label, ["figure", "text_figure"])};});
  const mainCount = pages.filter((p) => p.placement === "main").length;
  const capacity = d.agendaMinutes === null ? null : Math.floor(d.agendaMinutes / d.minutesPerPage);
  if (capacity !== null && mainCount > capacity) gaps.push({item: "pages", reason: "pages_exceed_agenda"});
  const body = {version, deliberations: deliberationOut, pages, summary: summary.display, summaryFigureIds: ids(summary, ["figure", "text_figure"]),
    appendix, questions, verifiedNumbers,
    agenda: {minutes: d.agendaMinutes, minutesPerPage: d.minutesPerPage, mainPages: mainCount, capacity, fits: capacity === null ? null : mainCount <= capacity}};
  return {material: {...body, fingerprint: fingerprintOf(body)}, gaps};
}
type Version = ReturnType<typeof renderVersion>;

/** The material facts, by rule: every economic reading the discussion adopts, every figure the basis marks
 * material on top of that, and every deadline of a deliberation. */
export function boardMaterialFacts(d: BoardDiscussion) {
  const figures = [...new Set([...d.figures.filter((f) => f.kind === "reading" && boardEconomicUnits.includes(f.unit)).map((f) => f.id), ...d.materialFigureIds])];
  const deadlines = d.deliberations.flatMap((x) => x.deadlines.map((t) => `${x.id}.${t.id}`));
  return {figures, deadlines};
}
const verifyField = (field: string, r: BoardRich, figures: Map<string, BoardFigureDisplay>) => {verifyBoardRendered(field, r, figures); return r;};

/** Every fact of the rule that a version of the material does not show, wherever it would be shown. */
export function boardMissingFacts(d: BoardDiscussion, material: Version["material"]) {
  const facts = boardMaterialFacts(d);
  const shown = new Set([...material.pages.flatMap((p) => [...p.figureIds, ...p.pendingFigureIds]), ...material.questions.flatMap((q) => [...q.figureIds, ...q.pendingFigureIds]),
    ...material.deliberations.flatMap((x) => [...x.figureIds, ...x.pendingFigureIds]), ...material.summaryFigureIds, ...material.appendix.flatMap((a) => a.figureIds)]);
  const dated = new Set([...material.deliberations.flatMap((x) => x.deadlines.map((t) => `${x.id}.${t.id}`)), ...material.pages.flatMap((p) => p.deadlineIds)]);
  return {figures: facts.figures.filter((id) => !shown.has(id)), deadlines: facts.deadlines.filter((id) => !dated.has(id))};
}

/** The omission rule, applied request by request on the rendered material: a request is applied only when
 * the version it produces still shows every material fact; otherwise it is refused with one sentence and
 * the facts it would have removed are named. A recommendation may be withdrawn; a deadline never is. */
export function decideBoardOmissions(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>) {
  const removed = noRemoval();
  const economic = new Set(boardMaterialFacts(d).figures);
  const decisions: BoardOmissionDecision[] = d.omissions.map((o) => {
    const done = (outcome: "applied" | "refused", reason: string, keptFigureIds: string[] = []) => ({...o, outcome, reason, keptFigureIds});
    const attempt = (apply: (r: Removed) => void, applied: string): BoardOmissionDecision => {
      const next = {recommendations: new Set(removed.recommendations), pages: new Set(removed.pages), figures: new Set(removed.figures)};
      apply(next);
      const lost = boardMissingFacts(d, renderVersion(d, figures, next, 2).material);
      if (lost.figures.length || lost.deadlines.length) return done("refused", sentences.materialKept, lost.figures);
      apply(removed);
      return done("applied", applied);
    };
    if (o.target === "recommendation") {
      const p = d.pages.find((x) => x.id === o.targetId);
      if (!p || p.recommendation === null) return done("refused", sentences.unknownTarget);
      const kept = [...new Set([p.title, ...p.lines, p.recommendation, ...p.options].flatMap((t) => [...t.matchAll(/\{([^}:]*)\}/g)].map((m) => m[1]!)))].filter((id) => economic.has(id));
      const decision = attempt((r) => r.recommendations.add(p.id), sentences.recommendationRemoved);
      return decision.outcome === "applied" ? {...decision, keptFigureIds: kept} : decision;
    }
    if (o.target === "page") {
      const p = d.pages.find((x) => x.id === o.targetId);
      if (!p) return done("refused", sentences.unknownTarget);
      if (p.role === "decisions") return done("refused", sentences.materialKept);
      return attempt((r) => r.pages.add(p.id), sentences.pageRemoved);
    }
    if (o.target === "figure") {
      if (!d.figures.some((f) => f.id === o.targetId)) return done("refused", sentences.unknownTarget);
      if (economic.has(o.targetId)) return done("refused", sentences.materialKept, [o.targetId]);
      return attempt((r) => r.figures.add(o.targetId), sentences.figureRemoved);
    }
    const [deliberationId, deadlineId] = o.targetId.split(".");
    const known = d.deliberations.some((x) => x.id === deliberationId && x.deadlines.some((t) => t.id === deadlineId));
    return done("refused", known ? sentences.deadlineKept : sentences.unknownTarget);
  });
  return {decisions, removed};
}

/** Structural refusals that do not depend on the reviewed results. Every text the material shows passes the
 * literal-number check; a page title (other than the decisions and the next steps) and every answer carry an
 * economic reading; the next steps carry a deadline. */
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
  // Every template, rendered now or only after a transformation (options), is checked for literal numbers up front.
  for (const t of [...d.pages.flatMap((p) => [p.title, ...p.lines, ...p.recommendation ? [p.recommendation] : [], ...p.options]),
    ...d.deliberations.flatMap((x) => [x.title, x.subject, ...x.recommendation ? [x.recommendation] : [], ...x.deadlines.map((t) => t.action)]),
    d.summary.opening, d.summary.closing, ...d.appendix.map((a) => a.label), ...d.questions.flatMap((q) => [q.question, q.answer])])
    if (boardLiteralNumbers(t).length) throw new Error(`board_capital_number_without_origin:${t.slice(0, 80)}`);
  // Texts without placeholders that the material or the readings show.
  for (const t of [...d.topics.map((x) => x.label), ...d.indicative.map((x) => x.reason), ...d.omissions.map((x) => x.requestedBy),
    ...d.deliberations.flatMap((x) => x.authorityBasis === null ? [] : [x.authorityBasis]),
    ...d.figures.flatMap((f) => f.kind === "pending" ? [f.reason] : [])]) checkBoardText(t);
  const economic = new Set(d.figures.filter((f) => f.kind === "pending" || boardEconomicUnits.includes(f.unit)).map((f) => f.id));
  const tokens = (t: string) => [...t.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!);
  const hasEconomic = (t: string[]) => t.flatMap(tokens).some((x) => economic.has(x));
  for (const p of d.pages) {
    if (p.role === "decisions") continue;
    if (p.role === "next_steps") {if (![p.title, ...p.lines].flatMap(tokens).some((x) => x.startsWith("deadline:"))) throw new Error(`board_capital_page_without_number:${p.id}`); continue;}
    if (!hasEconomic([p.title])) throw new Error(`board_capital_title_without_number:${p.id}`);
  }
  for (const q of d.questions) if (!hasEconomic([q.answer])) throw new Error(`board_capital_answer_without_number:${q.id}`);
  for (const a of d.appendix) if (!a.sourceIds.length) throw new Error(`board_capital_appendix_without_source:${a.id}`);
}

/** Resolves every figure against the reviewed results: a reading that does not resolve is refused as a
 * number without origin; one that resolves to a different number than the author states is refused as
 * divergent. A pending figure renders as pending and becomes a named gap wherever it is used. */
export function resolveBoardFigures(d: BoardDiscussion, sources: BoardSourceReading[]) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const checks: {figureId: string; sourceId: string; methodId: string; methodVersion: string; packetFingerprint: string; path: string; unit: BoardFigureUnit;
    value: string; rounded: string; stated: string | null; display: string; matches: true}[] = [];
  const figures = new Map<string, BoardFigureDisplay>();
  for (const f of d.figures) {
    if (f.kind === "pending") {figures.set(f.id, {pending: true}); continue;}
    const s = byId.get(f.sourceId);
    if (!s) throw new Error(`board_capital_figure_without_origin:${f.id}`);
    if (boardEconomicUnits.includes(f.unit) && f.stated === null) throw new Error(`board_capital_figure_without_statement:${f.id}`);
    const raw = readBoardSourcePath(s.packet, f.path);
    // A source text is read verbatim only from a label field of the source; a number is never read as text.
    if (f.unit === "text" && (!boardLabelKeys.includes(f.path.split(/\.(?![^[]*\])/).at(-1)!.replace(/\[.*$/, "")) || typeof raw !== "string" || /^\s*[-\u2212]?\d+(?:[.,]\d+)*\s*%?\s*$/.test(raw)))
      throw new Error(`board_capital_text_reading_not_a_label:${f.id}`);
    const check = checkBoardFigure(raw, f.unit, f.scale, f.places, f.stated);
    if (!check) throw new Error(`board_capital_figure_without_origin:${f.id}`);
    if (!check.matches) throw new Error(`board_capital_figure_diverges:${f.id}:${check.rounded}:${f.stated}`);
    figures.set(f.id, {display: check.display, unit: f.unit});
    checks.push({figureId: f.id, sourceId: s.id, methodId: s.methodId, methodVersion: s.methodVersion, packetFingerprint: s.packetFingerprint, path: f.path, unit: f.unit,
      value: check.value, rounded: check.rounded, stated: f.stated, display: check.display, matches: true});
  }
  return {figures, checks};
}

/** The outline proposed before any material: the deliberations in urgency order, the narrative and
 * only the questions that change the material (template, time on the agenda, what the board has seen). */
export function proposeBoardOutline(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>) {
  const context = {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate};
  const deliberations = orderBoardDeliberations(d.deliberations).map((x, i) => {
    const r = renderBoardTemplate(x.recommendation ?? x.subject, context);
    const deadlines = x.deadlines.map((t) => ({id: t.id, date: t.date, rich: {display: dayMonth(t.date), spans: [{start: 0, end: dayMonth(t.date).length, kind: "deadline" as const, id: `${x.id}.${t.id}`, unit: null}]},
      action: verifyField(`outline.${x.id}.deadline.${t.id}`, renderBoardTemplate(t.action, context), figures)}));
    const text = verifyField(`outline.${x.id}.text`, deliberationText(r, deadlines.map((t) => ({action: t.action, display: t.rich}))), figures);
    return {id: x.id, number: i + 1, title: verifyField(`outline.${x.id}.title`, renderBoardTemplate(x.title, context), figures).display, text: text.display, authority: x.authority,
      deadlines: deadlines.map((t) => ({id: t.id, date: t.date, action: t.action.display}))};
  });
  const roles = [...new Set(orderBoardPages(d.pages, d.topics).main.map((p) => p.role))];
  const questions = [...d.template === null ? [{code: "template" as const, topicId: null}] : [], ...d.agendaMinutes === null ? [{code: "agenda_minutes" as const, topicId: null}] : [],
    ...d.topics.filter((t) => t.seen === null).map((t) => ({code: "board_has_seen" as const, topicId: t.id}))];
  return {deliberations, narrative: roles, questions: questions.map((q) => ({...q, label: q.topicId === null ? null : d.topics.find((t) => t.id === q.topicId)!.label}))};
}

/** The whole discussion: the outline always; the material only once the outline is confirmed or when
 * there is no time before the meeting to confirm it. Every version shows every material fact; each is kept. */
export function prepareBoardCapitalDiscussion(d: BoardDiscussion, sources: BoardSourceReading[]) {
  validateBoardDiscussion(d);
  const {figures, checks} = resolveBoardFigures(d, sources);
  const outline = proposeBoardOutline(d, figures);
  const daysBefore = Math.round((Date.parse(`${d.meetingDate}T00:00:00Z`) - Date.parse(`${d.askedOn}T00:00:00Z`)) / 86400000);
  if (daysBefore < 0) throw new Error("board_capital_meeting_before_request");
  const timeToAlign = daysBefore >= d.leadDays;
  const produce = d.outlineConfirmed || !timeToAlign;
  const first = produce ? renderVersion(d, figures, noRemoval(), 1) : null;
  // The composed material shows every material fact of the basis, or it is refused by name.
  if (first) {const lost = boardMissingFacts(d, first.material); const id = [...lost.figures, ...lost.deadlines][0]; if (id) throw new Error(`board_capital_material_fact_not_shown:${id}`);}
  const {decisions, removed} = produce ? decideBoardOmissions(d, figures) : {decisions: [], removed: noRemoval()};
  const changed = removed.recommendations.size + removed.pages.size + removed.figures.size > 0;
  const second = produce && changed ? renderVersion(d, figures, removed, 2) : null;
  // Checked again on the version that will be read: no transformation may leave a material fact out.
  if (second) {const lost = boardMissingFacts(d, second.material); if (lost.figures.length || lost.deadlines.length) throw new Error("board_capital_material_fact_omitted");}
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
    materialFacts: boardMaterialFacts(d), priorVersionsKept: true as const, sentToThirdParties: false as const, presented: false as const};
}
