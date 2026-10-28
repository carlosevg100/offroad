import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {boardFieldOf, type BoardFieldKind, type BoardFieldSpec} from "./board-capital-discussion-sources";
import {type BoardObjectForm, boardObjectGenerics, boardCanonicalInputs, boardIsUniformDeferral, boardIsUniformPlanDeferral, boardIgnoredInputKey, type BoardCanonicalInput, boardDebtorNames, boardInformedReasons, boardObjectTerm, boardVocabularies, boardMatchPath, boardMatchValue, boardNameDictionary, boardRefReadingIds, parseBoardTextRef, type BoardComparison, type BoardCondition, type BoardOperand, type BoardSeries, type BoardSlotType, type BoardTextUse} from "./board-capital-discussion-templates";

/** Board discussion of a capital decision (ficha C47). Nothing here recalculates an analysis: every
 * number on the material is read from a reviewed result, shown in the unit, scale and periodicity the
 * field registry of its method declares, written by the method's formatter, checked against the number
 * the author states and verified again on the final text. Deterministic, without model calls. */
export const boardCapitalDiscussionVersion = "2026.10.27-v1";

const Exact = Decimal.clone({precision: 60, rounding: Decimal.ROUND_HALF_UP});

/** The kinds a reading can be; they come from the field registry, never from a contribution. */
export const boardFigureUnits = ["money", "rate", "multiple", "years", "months", "bps", "count", "calendar", "date", "label", "flag"] as const satisfies readonly BoardFieldKind[];
export type BoardFigureUnit = (typeof boardFigureUnits)[number];
/** Kinds that carry an economic number: a page title or an answer is supported only by one of these. */
export const boardEconomicUnits: readonly BoardFigureUnit[] = ["money", "rate", "multiple", "years", "months", "bps", "count"];
export const boardPageRoles = ["decisions", "situation", "constraint", "topic", "alternatives", "recommendation", "risk", "what_changes", "next_steps"] as const;
export type BoardPageRole = (typeof boardPageRoles)[number];
export const boardAuthorities = ["board", "executive", "shareholders"] as const;
export const boardOmissionTargets = ["recommendation", "page", "figure", "deadline"] as const;
export type BoardOmissionTarget = (typeof boardOmissionTargets)[number];

/** A reading names a field of a reviewed result and how many decimals (or which date format) to show; the
 * kind, unit, scale and periodicity come from the registry of the source's method. */
export type BoardFigure =
  | {id: string; kind: "reading"; sourceId: string; path: string; presentation: string; stated: string | null}
  | {id: string; kind: "pending"; requiredMethodId: string; requiredPath: string; reason: string};
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
  /** Facts informed in the conversation and adopted with their author; shown only through a template that attributes them. */
  informed: BoardInformedFact[];
};
/** A fact informed in the conversation, adopted as a code of the method's closed dictionary of reasons, with its author;
 * no text of the fact is ever adopted or shown. */
export type BoardInformedFact = {id: string; origin: string; author: string; code: string};

const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const feminine = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze"];
/** Marks a number the material needs and no reviewed result supplies yet. */
export const boardPendingMark = "[pendente]";
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const fingerprintOf = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Reads one value of a reviewed result by path: dotted keys, `[n]` for a position and `[field=value]`
 * for the one element whose field equals the value. Anything else, or a selector matching zero or
 * several elements, is unresolved. */
/** The canonical identity of a path in a packet: the field it effectively resolves to, every selector replaced by the
 * index of the one element it selects (so equivalent selectors give the same identity); null when it does not resolve. */
export function boardCanonicalPath(root: unknown, path: string, form: "index" | "text" = "index"): string | null {
  const segments = path.split(/\.(?![^[]*\])/);
  let node: unknown = root;
  const out: string[] = [];
  for (const raw of segments) {
    const m = /^([A-Za-z0-9_]+)((?:\[[^\]]+\])*)$/.exec(raw);
    if (!m) return null;
    node = isRecord(node) && Object.hasOwn(node, m[1]!) ? node[m[1]!] : undefined;
    let part = m[1]!;
    for (const selector of m[2]!.match(/\[[^\]]+\]/g) ?? []) {
      const body = selector.slice(1, -1);
      if (!Array.isArray(node)) return null;
      let index: number;
      if (/^\d+$/.test(body)) index = Number(body);
      else {
        const conditions = body.split("&").map((x) => {const k = x.indexOf("="); return [x.slice(0, k), x.slice(k + 1)] as const;});
        const hits = node.flatMap((x, i) => isRecord(x) && conditions.every(([f, v]) => (typeof x[f] === "string" || typeof x[f] === "number") && String(x[f]) === v) ? [i] : []);
        if (hits.length !== 1) return null;
        index = hits[0]!;
      }
      const element = node[index];
      // The "text" form keeps the selector's text, reduced to its shortest leading conditions that still select the same
      // one element (so a redundant condition never makes a second text for the same field).
      if (form === "text") {
        const conditions = /^\d+$/.test(body) ? [] : body.split("&");
        let kept = conditions.length ? conditions.length : 0;
        for (let n = 1; n < conditions.length; n++) {
          const sub = conditions.slice(0, n).map((x) => {const k = x.indexOf("="); return [x.slice(0, k), x.slice(k + 1)] as const;});
          const hits = (node as unknown[]).flatMap((x, i) => isRecord(x) && sub.every(([f, v]) => (typeof x[f] === "string" || typeof x[f] === "number") && String(x[f]) === v) ? [i] : []);
          if (hits.length === 1 && hits[0] === index) {kept = n; break;}
        }
        part += conditions.length ? `[${conditions.slice(0, kept).join("&")}]` : selector;
      } else part += `[${index}]`;
      node = element;
    }
    if (node === undefined) return null;
    out.push(part);
  }
  return out.join(".");
}
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
      // One selector may hold several conditions joined by &: every one must hold on the element.
      const conditions = body.split("&").map((part) => {const k = part.indexOf("="); if (k < 1) throw new Error("board_capital_path_invalid"); return [part.slice(0, k), part.slice(k + 1)] as const;});
      const hits = node.filter((x) => isRecord(x) && conditions.every(([field, value]) => (typeof x[field] === "string" || typeof x[field] === "number") && String(x[field]) === value));
      if (hits.length !== 1) return undefined;
      node = hits[0];
    }
    if (node === undefined) return undefined;
  }
  return node;
}

const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${months[Number(iso.slice(5, 7)) - 1]}`;
const monthYear = (iso: string) => `${months[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const isNumeric = (raw: unknown) => (typeof raw === "number" && Number.isFinite(raw)) || (typeof raw === "string" && /^-?\d+(?:\.\d+)?$/.test(raw));

/** The method's formatter: one reading of a registered field, in the unit, scale and periodicity of the
 * registry, rounded half up to the chosen decimals (0 to 2) or written in the chosen date format, checked
 * against the number the author states. Valid conversions only: reais to millions (divided by 10^6), a
 * ratio to percent (times 100). The text it returns is the whole marker: number, sign, currency, scale
 * word, percent and periodicity. */
const monthWords = ["", "um mês", "dois meses", "três meses", "quatro meses", "cinco meses", "seis meses", "sete meses", "oito meses", "nove meses", "dez meses", "onze meses"];
export function formatBoardReading(raw: unknown, spec: BoardFieldSpec, presentation: string, stated: string | null, currency = "BRL", months: string | null = null) {
  // The only domain is reais: a money reading of a result in another currency is never shown.
  if (spec.kind === "money" && currency !== "BRL") throw new Error(`board_capital_currency_not_supported:${currency}`);
  const out = (value: string, rounded: string, display: string, number: string | null, matches: boolean) => ({value, rounded, display, number, matches});
  if (spec.kind === "flag") return typeof raw === "boolean" && presentation === "-" ? out(String(raw), String(raw), raw ? "sim" : "não", null, stated === null) : null;
  if (spec.kind === "label") {
    if (typeof raw !== "string" || !raw.trim() || presentation !== "-" || /^\s*[-−]?\d+(?:[.,]\d+)*\s*%?\s*$/.test(raw)) return null;
    return out(raw, raw, raw, null, stated === null);
  }
  if (spec.kind === "date" || spec.kind === "calendar") {
    const format = presentation as BoardFieldSpec["formats"][number];
    if (!spec.formats.includes(format)) return null;
    if (spec.kind === "calendar") {
      if (!(typeof raw === "number" && Number.isInteger(raw) && raw >= 1900 && raw <= 2099)) return null;
      return out(String(raw), String(raw), String(raw), String(raw), stated === String(raw));
    }
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const long = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][Number(raw.slice(5, 7)) - 1];
    const display = format === "day_month" ? dayMonth(raw) : format === "day_long" ? `${Number(raw.slice(8, 10))} de ${long}` : format === "month_year" ? monthYear(raw)
      : format === "month_long" ? `${long} de ${raw.slice(0, 4)}` : raw.slice(0, 4);
    return out(raw, raw, display, display, stated === raw);
  }
  if (!/^[0-2]$/.test(presentation) || !isNumeric(raw)) return null;
  const places = Number(presentation);
  const scaled = spec.scale === "reais" ? new Exact(raw as Decimal.Value).div(1e6) : spec.scale === "ratio" ? new Exact(raw as Decimal.Value).times(100) : new Exact(raw as Decimal.Value);
  const rounded = scaled.toDecimalPlaces(places, Decimal.ROUND_HALF_UP), text = rounded.toFixed(places), number = text.replace(".", ",");
  // A period the method fixes is written as such; a derived one by the horizon the source registers for the row: "por
  // ano" only for exactly twelve months, otherwise the months it covers.
  if (spec.period === "derived" && (months === null || !/^[1-9]\d*$/.test(months))) return null;
  const per = spec.period === "annual" ? (spec.kind === "rate" ? " ao ano" : " por ano")
    : spec.period === "derived" ? (months === "12" ? " por ano" : ` em ${Number(months) < 12 ? monthWords[Number(months)] : `${months} meses`}`) : "";
  const display = spec.kind === "money" ? `R$ ${number} ${rounded.abs().lt(2) ? "milhão" : "milhões"}${per}`
    : spec.kind === "rate" ? `${number}%${per}` : spec.kind === "multiple" ? `${number}x`
    : spec.kind === "years" ? `${number} ${number === "1" ? "ano" : "anos"}` : spec.kind === "months" ? `${number} ${number === "1" ? "mês" : "meses"}`
    : spec.kind === "bps" ? `${number} pontos` : number;
  return out(new Exact(raw as Decimal.Value).toFixed(), text, display, number, stated !== null && /^-?\d+(?:\.\d+)?$/.test(stated) && new Exact(stated).eq(rounded));
}

/** Free text is everything outside the markers the method writes. After NFKC normalization it may hold only
 * the letters of Portuguese, spaces, a hyphen between two letters and the punctuation , . ; : ? ! ( ) and
 * quotes. Any digit of any script, any currency or other symbol, a percent sign or an isolated x is refused. */
const freeTextChar = /[A-Za-záàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ ,.;:?!()"'“”‘’-]/u;
/** The closed lexicon that never appears in free text: these concepts exist only inside the formatter's markers.
 * Numbers in words (the articles "um" and "uma" excepted), scales, currencies and ISO codes, months, periodicity
 * and durations, percentages and points. */
export const boardForbiddenWords = [
  "zero", "dois", "duas", "três", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "catorze", "quinze",
  "dezesseis", "dezessete", "dezoito", "dezenove", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa", "cem", "cento",
  "duzentos", "duzentas", "trezentos", "trezentas", "quatrocentos", "quatrocentas", "quinhentos", "quinhentas", "seiscentos", "seiscentas", "setecentos",
  "setecentas", "oitocentos", "oitocentas", "novecentos", "novecentas", "mil", "milhão", "milhao", "milhões", "milhoes", "bilhão", "bilhao", "bilhões", "bilhoes",
  "trilhão", "trilhões", "meio", "meia", "metade", "dobro", "triplo", "dúzia", "duzia", "dúzias", "dezena", "dezenas", "centena", "centenas", "milhar", "milhares",
  "centavo", "centavos", "mi", "bi", "mm", "mn", "k",
  "real", "reais", "dólar", "dolar", "dólares", "dolares", "euro", "euros", "iene", "ienes", "libra", "libras", "peso", "pesos", "franco", "francos", "yuan",
  "renminbi", "rublo", "rublos", "rupia", "rupias", "bitcoin", "bitcoins",
  "brl", "usd", "eur", "gbp", "jpy", "cny", "chf", "cad", "aud", "nzd", "ars", "clp", "mxn", "cop", "pen", "uyu", "pyg", "bob", "inr", "krw", "rub", "zar", "sek",
  "nok", "dkk", "hkd", "sgd", "try", "btc", "eth",
  "janeiro", "fevereiro", "março", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  "ano", "anos", "mês", "mes", "meses", "dia", "dias", "semana", "semanas", "quinzena", "quinzenas", "semestre", "semestres", "trimestre", "trimestres",
  "bimestre", "bimestres", "anual", "anuais", "mensal", "mensais", "semestral", "semestrais", "trimestral", "trimestrais", "bimestral", "bimestrais",
  "quinzenal", "quinzenais", "semanal", "semanais", "diário", "diario", "diária", "diaria", "anualizado", "anualizada",
  "percentual", "percentuais", "porcentagem", "porcento", "cento", "ponto", "pontos", "bps", "bp", "pp", "x",
] as const;
const forbidden = new Set<string>(boardForbiddenWords);
/** The first reason a free text is refused, or null. Phrases (ao ano, por cento, p.p.) fall on their words. */
export function boardFreeTextIssue(text: string): string | null {
  const t = text.normalize("NFKC");
  for (const ch of t) if (!freeTextChar.test(ch)) return `character:${ch}`;
  if (/(?<![\p{L}])-|-(?![\p{L}])/u.test(t)) return "character:-";
  for (const w of t.toLowerCase().split(/[^\p{L}]+/u)) if (forbidden.has(w)) return `word:${w}`;
  if (/(?<![\p{L}])p\.\s*p\.?(?![\p{L}])|(?<![\p{L}])a\.\s*[am]\.?(?![\p{L}])/iu.test(t)) return "word:abbreviation";
  return null;
}
/** Refuses a free text by name: a number, unit, currency, period or date without origin. */
export function checkBoardFreeText(text: string): string {
  const issue = boardFreeTextIssue(text);
  if (issue) throw new Error(`board_capital_number_without_origin:${issue}:${text.slice(0, 80)}`);
  return text;
}
/** What the identity check records as the display of a source label that is not an entry of the name dictionary:
 * the name itself is never shown; the slot shows its generic words and the material records a gap of name. */
export const boardUnnamedLabel = "nome fora do dicionário";
const dictionary = new Set<string>(boardNameDictionary);
/** The reading ids a template names, with or without a date preposition; counts and deadlines excluded. */
export function boardPlaceholderIds(ref: string): string[] {
  return boardRefReadingIds(ref);
}
/** Kept for the template check: the digits a template writes outside its placeholders. */
export function boardLiteralNumbers(template: string): string[] {
  return template.replace(/\{[^}]*\}/g, " ").normalize("NFKC").match(/\p{N}+/gu) ?? [];
}

/** A text as rendered, with the span of every marker it carries: a reading (with its unit words), a source
 * label, a pending figure, a deadline, a count of deliberations or an ordinal the method writes. */
export type BoardSpan = {start: number; end: number; kind: "figure" | "text_figure" | "pending" | "deadline" | "count" | "ordinal" | "informed" | "debtor" | "object"; id: string; unit: BoardFigureUnit | null};
export type BoardRich = {display: string; spans: BoardSpan[]};
type Resolved = BoardRich & {figureIds: string[]; pendingFigureIds: string[]; deadlineIds: string[]};
/** A reading as shown, with its origin (source, method, path and source value) so a slot can check its concept. */
/** A condition that cannot be decided (an operand absent or pending): never satisfied. */
export class BoardIndefinite extends Error {}
/** The slots a condition names, wherever it names them. */
export function boardConditionSlots(c: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {if (k === "slot" && typeof x === "string") out.push(x); else walk(x);}};
  walk(c);
  return out;
}
export type BoardFigureDisplay = {display: string; unit: BoardFigureUnit; origin?: {sourceId: string; methodId: string; path: string; value: string; canonical?: string; fingerprint?: string; periodMonths?: string}; unnamed?: true} | {pending: true; methodId?: string; path?: string};
type Context = {figures: Map<string, BoardFigureDisplay>; deliberations: BoardDeliberation[]; nextMeetingDate: string | null; sources?: BoardSourceReading[]; informed?: BoardInformedFact[];
  /** The canonical names of the debtors this text names, by the reading bound to the debtor slot. */
  debtors?: Map<string, string>;
  /** The reviewed forms of the objects this text names, by the reading bound to the object slot. */
  objects?: Map<string, string>};
/** Which slot of which template a displayed field binds to which reading, deadline or informed fact. */
export type BoardBinding = {templateId: string; slot: string; figureId: string | null; deadlineId: string | null; informedId: string | null};

/** The prepositions a date marker carries, written by the method. */
const datePrepositions = {em: "em", ate: "até", desde: "desde", para: "para", fim: "no fim de", de: "de", a: "a"} as const;
/** Free text may not end with a preposition before a date marker (the marker carries its own), nor with a
 * date preposition before a value marker (a value is never a date). */
const prepositionBeforeDate = /(?<![\p{L}])(?:em|até|ate|de|desde|para|a|à|ao|no|na|nos|nas|do|da|dos|das|entre|fim|partir)\s*$/iu;

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

/** Checks a text that carries no placeholder: any literal number is refused. */
export function checkBoardText(text: string): string {
  if (/\{[^}]*\}/.test(text)) throw new Error(`board_capital_number_without_origin:placeholder:${text.slice(0, 80)}`);
  return checkBoardFreeText(text);
}

/** Renders one template into text and spans. Tokens: `{figure}`, `{count:deliberations}`, `{count:dated}`,
 * `{count:due-before-next-meeting}` and `{deadline:<deliberation>.<deadline>}`. A literal number or an unknown
 * token refuses the material by name. The figure's text comes whole from the formatter. */
export function renderBoardTemplate(template: string, context: Context): Resolved {
  checkBoardFreeText(template.replace(/\{[^}]*\}/g, " "));
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
    if (token.startsWith("object:")) {
      const form = context.objects?.get(token.slice(7));
      if (!form) throw new Error(`board_capital_unknown_token:${token}`);
      parts.push(marker(form, "object", token.slice(7), null)); continue;
    }
    if (token.startsWith("debtor:")) {
      const name = context.debtors?.get(token.slice(7));
      if (!name) throw new Error(`board_capital_unknown_token:${token}`);
      parts.push(marker(name, "debtor", token.slice(7), null)); continue;
    }
    if (token.startsWith("informed:")) {
      const fact = context.informed?.find((x) => x.id === token.slice(9));
      if (!fact) throw new Error(`board_capital_unknown_token:${token}`);
      const phrase = boardInformedReasons[fact.code as keyof typeof boardInformedReasons];
      if (!phrase) throw new Error(`board_capital_unknown_token:${token}`);
      parts.push(marker(checkBoardFreeText(phrase), "informed", fact.id, null)); continue;
    }
    if (token.startsWith("deadline:")) {
      const [deliberationId, deadlineId] = token.slice(9).split(".");
      const deadline = context.deliberations.find((d) => d.id === deliberationId)?.deadlines.find((x) => x.id === deadlineId);
      if (!deadline) throw new Error(`board_capital_unknown_token:${token}`);
      parts.push(marker(dayMonth(deadline.date), "deadline", `${deliberationId}.${deadlineId}`, null)); continue;
    }
    // A date or a year is written with its preposition by the method: {em:id}, {ate:id}, {desde:id}, {para:id}, {fim:id}.
    const dated = /^(em|ate|desde|para|fim|de|a):(.+)$/.exec(token), id = dated ? dated[2]! : token;
    const figure = context.figures.get(id);
    if (!figure) throw new Error(`board_capital_unknown_token:${token}`);
    if ("pending" in figure) {parts.push(marker(boardPendingMark, "pending", id, null)); continue;}
    const isDate = figure.unit === "date" || figure.unit === "calendar";
    if (isDate !== (dated !== null)) throw new Error(isDate ? `board_capital_date_without_preposition:${id}` : `board_capital_preposition_on_value:${id}`);
    const display = dated ? `${datePrepositions[dated[1] as keyof typeof datePrepositions]} ${figure.display}` : figure.display;
    parts.push(marker(display, figure.unit === "label" ? "text_figure" : "figure", id, figure.unit));
  }
  parts.push(template.slice(last));
  return resolved(joinBoardRich(parts));
}

/** The kinds of reading each slot type of the template library accepts. */
const slotAccepts: Record<Exclude<BoardSlotType, "deadline" | "informed">, BoardFigureUnit[]> = {debtor: ["label"], object: ["label"], money: ["money"], rate: ["rate"], multiple: ["multiple"], years: ["years"], months: ["months"],
  bps: ["bps"], count: ["count"], date: ["date", "calendar"], label: ["label"], flag: ["flag"]};
/** Compares two values: as decimals when both are numbers, as text otherwise (dates, flags, ids). */
function compareBoard(a: string, how: BoardComparison, b: string) {
  const numeric = /^-?\d+(?:\.\d+)?$/;
  if (how === "prefix") return a.startsWith(b);
  const c = numeric.test(a) && numeric.test(b) ? new Exact(a).cmp(b) : a < b ? -1 : a > b ? 1 : 0;
  return how === "lt" ? c < 0 : how === "le" ? c <= 0 : how === "gt" ? c > 0 : how === "ge" ? c >= 0 : how === "ne" ? c !== 0 : c === 0;
}
/** Renders one text of the closed library. Each slot is checked against its concept before anything is written:
 * the reading's method and path match the admissible origin (shared variables equal across slots), a year matches
 * the year the slot admits, a deadline is the deadline of the action the template announces; then every condition
 * the fixed text asserts is checked against the bound readings and their sources. A pending reading fits a slot of
 * its method and leaves the conditions on it unchecked (it is a named gap). Anything else is refused by name. */
export function renderBoardRef(ref: string, context: Context): Resolved & {bindings: BoardBinding[]; unnamed: string[]; unconfirmed: string[]; unmatched: string[]; unknownSpecies: string[]} {
  const {templateId, bindings, template} = parseBoardTextRef(ref);
  const concept = (slot: string, why: string) => new Error(`board_capital_slot_concept_mismatch:${templateId}:${slot}:${why}`);
  const vars: Record<string, string> = {};
  const share = (slot: string, got: Record<string, string>) => {
    for (const [k, v] of Object.entries(got)) {if (Object.hasOwn(vars, k) && vars[k] !== v) throw concept(slot, `variable_${k}`); vars[k] = v;}
  };
  const values: Record<string, {value: string; methodId: string; sourceId: string} | null> = {};
  const out: BoardBinding[] = [];
  for (const [slot, spec] of Object.entries(template.slots)) {
    const bound = bindings[slot]!;
    if (spec.type === "deadline") {
      if (!bound.startsWith("deadline:")) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}`);
      const [deliberationId, deadlineId] = bound.slice(9).split(".");
      const deadline = context.deliberations.find((d) => d.id === deliberationId)?.deadlines.find((x) => x.id === deadlineId);
      if (!deadline) throw new Error(`board_capital_unknown_token:${bound}`);
      // The deadline shown is the deadline of the action the template announces, never another one.
      if (parseBoardTextRef(deadline.action).templateId !== spec.action) throw new Error(`board_capital_deadline_action_mismatch:${templateId}:${slot}:${bound.slice(9)}`);
      values[slot] = {value: deadline.date, methodId: "", sourceId: ""};
      out.push({templateId, slot, figureId: null, deadlineId: bound.slice(9), informedId: null});
      continue;
    }
    if (spec.type === "informed") {
      // An informed fact enters only as itself: adopted as informed, by the author the template names.
      if (!bound.startsWith("informed:")) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}`);
      const fact = context.informed?.find((x) => x.id === bound.slice(9));
      if (!fact) throw new Error(`board_capital_unknown_token:${bound}`);
      if (fact.origin !== "informed" || fact.author !== spec.author) throw new Error(`board_capital_informed_fact_mismatch:${templateId}:${slot}:${fact.origin}:${fact.author}`);
      out.push({templateId, slot, figureId: null, deadlineId: null, informedId: fact.id});
      continue;
    }
    if (bound.startsWith("informed:")) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}`);
    if (bound.startsWith("deadline:")) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}`);
    const figure = context.figures.get(bound);
    if (!figure) throw new Error(`board_capital_unknown_token:${bound}`);
    out.push({templateId, slot, figureId: bound, deadlineId: null, informedId: null});
    if ("pending" in figure) {
      // A pending figure stands for one field: it occupies only a slot whose specification admits that exact field (method,
      // path pattern with its selectors, and the registered kind, concept and nature where the registry knows it).
      if (!figure.methodId || !figure.path) throw concept(slot, "pending_without_field");
      if (spec.year !== undefined) throw concept(slot, "pending_year");
      const got = (spec.from ?? []).filter(([m]) => m === figure.methodId).map(([, path]) => boardMatchPath(path, figure.path!)).find((x) => x !== null);
      if (!got) throw concept(slot, "pending_origin");
      const field = boardFieldOf(figure.methodId, figure.path);
      if (field && !slotAccepts[spec.type as Exclude<BoardSlotType, "deadline" | "informed">]?.includes(field.kind as BoardFigureUnit)) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}:${field.kind}`);
      if (spec.concept !== undefined && field?.concept !== spec.concept) throw concept(slot, "pending_concept");
      if (spec.nature !== undefined && field?.nature !== spec.nature) throw concept(slot, "pending_nature");
      share(slot, got);
      values[slot] = null; continue;
    }
    if (!slotAccepts[spec.type].includes(figure.unit)) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}:${figure.unit}`);
    if (!figure.origin) throw concept(slot, "origin_unknown");
    if (spec.year !== undefined) {
      const got = figure.unit === "calendar" ? boardMatchValue(spec.year, figure.origin.value) : null;
      if (!got) throw concept(slot, "year");
      share(slot, got);
    } else {
      const got = (spec.from ?? []).filter(([m]) => m === figure.origin!.methodId).map(([, path]) => boardMatchPath(path, figure.origin!.path)).find((x) => x !== null);
      if (!got) throw concept(slot, "origin");
      // Where a method holds several fields of one kind, the registry's concept must be the one the slot names.
      if (spec.concept !== undefined && boardFieldOf(figure.origin.methodId, figure.origin.path)?.concept !== spec.concept) throw concept(slot, "registered_concept");
      // A balance, a flow and a value are not interchangeable: the sentence's reading must be the field's registered nature.
      if (spec.nature !== undefined && boardFieldOf(figure.origin.methodId, figure.origin.path)?.nature !== spec.nature) throw concept(slot, "nature");
      share(slot, got);
    }
    values[slot] = {value: figure.origin.value, methodId: figure.origin.methodId, sourceId: figure.origin.sourceId};
  }
  // One package per method: every reading of a method in one text comes from the same reviewed result.
  for (const a of Object.values(values)) for (const b of Object.values(values))
    if (a && b && a.methodId && a.methodId === b.methodId && a.sourceId !== b.sourceId) throw new Error(`board_capital_source_mixed:${templateId}:${a.methodId}`);
  // The conditions the fixed text asserts, against the bound readings and their sources.
  // Three-valued conditions: a condition whose operand is absent or pending is undefined, and undefined never holds.
  const unverified = (why: string) => new BoardIndefinite(`board_capital_template_condition_unverified:${templateId}:${why}`);
  const indefinite = (why: string) => new BoardIndefinite(`board_capital_template_condition_pending:${templateId}:${why}`);
  // The source a condition reads is the one package of its method in the material, the same one the slots bind.
  const sourceOf = (method: string) => {
    const all = (context.sources ?? []).filter((x) => x.methodId === method);
    if (all.length !== 1) throw unverified(`source_${method}`);
    if (Object.values(values).some((v) => v !== null && v.methodId === method && v.sourceId !== all[0]!.id)) throw new Error(`board_capital_source_mixed:${templateId}:${method}`);
    return all[0]!;
  };
  const read = (method: string, path: string) => {
    const filled = path.replace(/\$([a-z]+)/g, (_, k: string) => {if (!Object.hasOwn(vars, k)) throw unverified(`variable_${k}`); return vars[k]!;});
    return readBoardSourcePath(sourceOf(method).packet, filled);
  };
  const scalar = (raw: unknown, why: string) => {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return String(raw);
    throw unverified(why);
  };
  const operand = (o: BoardOperand): string => {
    if ("value" in o) return o.value.replace(/\$([a-z]+)/g, (_, k: string) => {if (!Object.hasOwn(vars, k)) throw unverified(`variable_${k}`); return vars[k]!;});
    if ("var" in o) {if (!Object.hasOwn(vars, o.var)) throw unverified(`variable_${o.var}`); return vars[o.var]!;}
    if ("slot" in o) {const v = values[o.slot]; if (v === undefined) throw unverified(`slot_${o.slot}`); if (v === null) throw indefinite(`slot_${o.slot}`); return o.year ? v.value.slice(0, 4) : v.value;}
    if ("firstPaid" in o || "lastPaid" in o || "lastListed" in o) {
      const [method, path, key, field] = "firstPaid" in o ? o.firstPaid : "lastPaid" in o ? o.lastPaid : [...o.lastListed, ""];
      const rows = read(method, path);
      if (!Array.isArray(rows) || !rows.length) throw indefinite(`schedule_${path}_absent`);
      const keyed = rows.map((r) => ({k: scalar((r as Record<string, unknown>)[key], key), v: field ? (r as Record<string, unknown>)[field] : null}));
      if ("lastListed" in o) return keyed.at(-1)!.k;
      const paid = keyed.filter((r) => !new Exact(scalar(r.v, field)).eq(0));
      if (!paid.length) throw indefinite(`schedule_${path}_without_payment`);
      return "firstPaid" in o ? paid[0]!.k : paid.at(-1)!.k;
    }
    if ("contributed" in o) {
      // An adopted term the result records: exactly one contribution whose field path ends with the given suffix.
      const [method, rawSuffix] = o.contributed, packet = sourceOf(method).packet as {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}};
      const suffix = rawSuffix.replace(/\$([a-z]+)/g, (_, k: string) => {if (!Object.hasOwn(vars, k)) throw unverified(`variable_${k}`); return vars[k]!;});
      const hits = (packet.result?.contributions ?? []).filter((x) => typeof x.fieldPath === "string" && x.fieldPath.endsWith(`.${suffix}`));
      if (hits.length !== 1) throw unverified(`contribution_${suffix}`);
      return scalar(hits[0]!.value?.value, suffix);
    }
    const v = scalar(read(o.at[0], o.at[1]), o.at[1]);
    return o.year ? v.slice(0, 4) : v;
  };
  const ordering = (op: string) => ["lt", "le", "gt", "ge"].includes(op);
  // The value of an operand as the text shows it: a bound figure's display, read back in the field's own scale; any
  // operand the text does not show (a constant, a source field) is its exact value.
  // A source field the sentence does not show, but another field of the material does: its one presentation.
  const canonicalOf = (f: BoardFigureDisplay) => "pending" in f || !f.origin ? null : f.origin.canonical ?? boardCanonicalPath(sourceOf(f.origin.methodId).packet, f.origin.path);
  const atFigure = (o: {at: readonly [string, string]}, f: BoardFigureDisplay) => !("pending" in f) && !!f.origin && f.origin.methodId === o.at[0]
    && canonicalOf(f) === boardCanonicalPath(sourceOf(o.at[0]).packet, o.at[1].replace(/\$([a-z]+)/g, (_m: string, k: string) => vars[k] ?? "\u0000"));
  const shownFigure = (f: BoardFigureDisplay): string => {
    if ("pending" in f || !f.origin) throw indefinite("figure_pending");
    if (["calendar", "date", "label", "flag"].includes(f.unit)) return f.origin.value;
    const m = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/.exec(f.display.replace(/\u2212/g, "-"));
    if (!m) return f.origin.value;
    const n = new Exact(m[0].replace(/\./g, "").replace(",", "."));
    const scale = boardFieldOf(f.origin.methodId, f.origin.path)?.scale;
    return (scale === "reais" ? n.times(1000000) : scale === "ratio" ? n.div(100) : n).toFixed();
  };
  const shownOperand = (o: BoardOperand, exact: string): string => {
    if (typeof o === "object" && "at" in o && !o.year) {const hit = [...context.figures.values()].find((f) => atFigure(o, f)); return hit ? shownFigure(hit) : exact;}
    if (typeof o !== "object" || !("slot" in o)) return exact;
    const f = context.figures.get(bindings[o.slot]!);
    if (!f || "pending" in f || !f.origin || ["calendar", "date", "label", "flag"].includes(f.unit) || o.year) return exact;
    const m = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?/.exec(f.display.replace(/\u2212/g, "-"));
    if (!m) return exact;
    const n = new Exact(m[0].replace(/\./g, "").replace(",", "."));
    const scale = boardFieldOf(f.origin.methodId, f.origin.path)?.scale;
    return (scale === "reais" ? n.times(1000000) : scale === "ratio" ? n.div(100) : n).toFixed();
  };
  const list = (method: string, path: string) => {const xs = read(method, path); if (!Array.isArray(xs) || !xs.length) throw unverified(path); return xs as Record<string, unknown>[];};
  /** A per-period series of a source, by key; null when it does not resolve. */
  const boardSeriesOf = (x: BoardSeries): Map<string, string> | null => {
    const sub = (v: string) => v.replace(/\$([a-z]+)/g, (_, k: string) => vars[k] ?? "");
    if ("projectionRows" in x) {
      const id = sub(x.projectionRows[1]);
      return boardSeriesOf({list: [x.projectionRows[0], id === "base" ? "result.projection.projection.base" : `result.projection.projection.scenarios[id=${id}].rows`], key: "periodId", field: x.field});
    }
    if ("projectionDriver" in x) {
      // The driver a scenario uses: its own override, else the scenario it is based on, down to the base.
      const [method, start, driver] = x.projectionDriver, packet = sourceOf(method).packet;
      let id = sub(start);
      for (let depth = 0; depth < 8; depth++) {
        const periods = readBoardSourcePath(packet, "result.projection.projection.base");
        const byPeriod = (m: Map<string, string> | null) => {
          if (!m || !Array.isArray(periods)) return m;
          const out = new Map<string, string>();
          for (const [i, v] of m) {const row = periods[Number(i)] as {periodId?: unknown} | undefined; if (typeof row?.periodId !== "string") return null; out.set(row.periodId, v);}
          return out;
        };
        if (id === "base") return byPeriod(boardSeriesOf({contributed: [method, `base.${driver}`]}));
        const own = byPeriod(boardSeriesOf({contributed: [method, `scenario.${id}.override.${driver}`]}));
        if (own) return own;
        const parent = readBoardSourcePath(packet, `result.projection.projection.scenarios[id=${id}].basedOn`);
        if (typeof parent !== "string") return null;
        id = parent;
      }
      return null;
    }
    if ("contributed" in x) {
      const packet = sourceOf(x.contributed[0]).packet as {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}};
      const suffix = x.contributed[1].replace(/\$([a-z]+)/g, (_, k: string) => vars[k] ?? "");
      const hits = (packet.result?.contributions ?? []).filter((e) => typeof e.fieldPath === "string" && e.fieldPath.endsWith(`.${suffix}`));
      const v = hits.length === 1 ? hits[0]!.value?.value : undefined;
      return Array.isArray(v) && v.every((y) => typeof y === "string") ? new Map(v.map((y, i) => [String(i), y as string])) : null;
    }
    const xs = read(x.list[0], x.list[1]);
    if (!Array.isArray(xs)) return null;
    const out = new Map<string, string>();
    for (const e of xs) {
      const k = readBoardSourcePath(e, x.key), v = readBoardSourcePath(e, x.field);
      if ((typeof k !== "string" && typeof k !== "number") || (typeof v !== "string" && typeof v !== "number")) return null;
      out.set(String(k), String(v));
    }
    return out;
  };
  let shownLost: {figures: string[]; betweenTwoShown: boolean} | null = null;
  const holds = (c: BoardCondition): boolean => {
    if ("compare" in c) {
      const a = operand(c.compare[0]), b = operand(c.compare[2]);
      if (!compareBoard(a, c.compare[1], b)) return false;
      if (ordering(c.compare[1])) {
        const sa = shownOperand(c.compare[0], a), sb = shownOperand(c.compare[2], b);
        if (!compareBoard(sa, c.compare[1], sb)) {
          const slots = [c.compare[0], c.compare[2]].flatMap((o) => typeof o === "object" && "slot" in o ? [o.slot] : []);
          const shownElsewhere = [c.compare[0], c.compare[2]].flatMap((o) => typeof o === "object" && "at" in o ? [...context.figures].filter(([, f]) => atFigure(o, f)).map(([id]) => id) : []);
          shownLost = {figures: [...slots.map((x) => bindings[x]!), ...shownElsewhere], betweenTwoShown: slots.length === 2 && ["gt", "lt"].includes(c.compare[1])};
        }
      }
      return true;
    }
    if ("every" in c) {
      const than = operand(c.than), items = list(c.every[0], c.every[1]);
      if (!items.every((x) => compareBoard(scalar(x[c.every[2]], c.every[2]), c.op, than))) return false;
      if (ordering(c.op)) {
        const sThan = shownOperand(c.than, than), listPath = c.every[1].replace(/\$([a-z]+)/g, (_m: string, k: string) => vars[k] ?? "");
        // Every member, shown or not, against the reference as shown: a member shown anywhere in the material enters by its
        // one presentation, a member not shown by its exact value (each reading has one presentation in the material).
        // Each member by its canonical identity (the list's resolved path, the element's index, the field): every reading
        // of that field anywhere in the material is compared, whatever selector text it used.
        const listCanonical = boardCanonicalPath(sourceOf(c.every[0]).packet, listPath);
        if (listCanonical === null) throw indefinite("list_absent");
        const lost: string[] = [];
        items.forEach((item, index) => {
          const identity = `${listCanonical}[${index}].${c.every[2]}`;
          const shown = [...context.figures].filter(([, f]) => !("pending" in f) && f.origin?.methodId === c.every[0] && canonicalOf(f) === identity);
          const members = shown.length ? shown.map(([id, f]) => [shownFigure(f), id] as const) : [[scalar(item[c.every[2]], c.every[2]), null] as const];
          for (const [member, id] of members) if (!compareBoard(member, c.op, sThan)) lost.push(id ?? identity);
        });
        if (lost.length) shownLost = {figures: [...lost, ...typeof c.than === "object" && "slot" in c.than ? [bindings[c.than.slot]!] : []], betweenTwoShown: false};
      }
      return true;
    }
    if ("bind" in c) {const v = operand(c.to); if (Object.hasOwn(vars, c.bind) && vars[c.bind] !== v) return false; vars[c.bind] = v; return true;}
    if ("includes" in c) {
      const [m, path, field] = c.includes, want = operand(c.value);
      const xs = read(m, path);
      if (!Array.isArray(xs)) throw unverified(path);
      const items = xs.map((x) => scalar(field === null ? x : readBoardSourcePath(x, field), path));
      return c.none ? !items.includes(want) : items.includes(want) && (!c.only || items.length === 1);
    }
    if ("dominates" in c) {
      // Period by period, matched by key; a series that does not resolve, or keys that do not match, fail the condition.
      const series = boardSeriesOf;
      const a = series(c.dominates[0]), b = series(c.dominates[1]);
      // Over the horizon of the second series (the base): every one of its periods must exist in the first.
      if (!a || !b || b.size === 0 || [...b.keys()].some((k) => !a.has(k))) throw indefinite("series_absent");
      const pairs = [...b].map(([k, v]) => [a.get(k)!, v] as const);
      if (c.op === "eq") return pairs.every(([x, y]) => compareBoard(x, "eq", y));
      const weak = c.op === "gt" ? "ge" : "le";
      return pairs.every(([x, y]) => compareBoard(x, weak, y)) && pairs.some(([x, y]) => compareBoard(x, c.op, y));
    }
    if ("pathMoves" in c || "extendsDebt" in c) {
      // A plan path's moves read from the terms the plan records, never from identifiers: each new instrument by its role,
      // lender kind and schedule; each prepayment and charge by the instrument it touches; the project variant against the
      // status quo's. The creditor named in a sentence is joined to its debt-table row through the shared instrument id.
      const method = "pathMoves" in c ? c.pathMoves[0] : c.extendsDebt[0];
      const packet = sourceOf(method).packet as {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}};
      const contributions = packet.result?.contributions ?? [];
      const term = (suffix: string): unknown => {
        const hits = contributions.filter((e) => typeof e.fieldPath === "string" && e.fieldPath.endsWith(`.${suffix}`));
        return hits.length === 1 ? hits[0]!.value?.value : undefined;
      };
      const list = (suffix: string) => {const v = term(suffix); return Array.isArray(v) ? v.map(String) : [];};
      const terms = (id: string) => list(`instrument.${id}.terms`);
      const fill = (x: string) => x.replace(/\$([a-z]+)/g, (_, k: string) => vars[k] ?? "\u0000");
      if ("extendsDebt" in c) {
        // An extension: an amended instrument replacing the named one, paying finally later and repaying less principal in every period.
        const original = fill(c.extendsDebt[1]);
        const amended = contributions.flatMap((e) => {
          const m = typeof e.fieldPath === "string" ? /\.instrument\.([a-z0-9-]+)\.replaces$/.exec(e.fieldPath) : null;
          return m && e.value?.value === original ? [m[1]!] : [];
        });
        if (amended.length !== 1 || terms(amended[0]!)[0] !== "amended") return false;
        const later = term(`instrument.${amended[0]}.finalPaymentDate`), before = term(`instrument.${original}.finalPaymentDate`);
        const a = list(`instrument.${amended[0]}.amortization`), o = list(`instrument.${original}.amortization`);
        return typeof later === "string" && typeof before === "string" && later > before && a.length === o.length && a.length > 0
          && a.every((x, i) => new Exact(x).lte(o[i]!)) && a.some((x, i) => new Exact(x).lt(o[i]!));
      }
      const path = fill(c.pathMoves[1]);
      const quo = contributions.flatMap((e) => {
        const m = typeof e.fieldPath === "string" ? /\.path\.([a-z0-9-]+)\.terms$/.exec(e.fieldPath) : null, v = e.value?.value;
        return m && Array.isArray(v) && v[0] === "status_quo" ? [m[1]!] : [];
      });
      if (quo.length !== 1) throw unverified("status_quo_path");
      const existing = contributions.flatMap((e) => {
        const m = typeof e.fieldPath === "string" ? /\.instrument\.([a-z0-9-]+)\.terms$/.exec(e.fieldPath) : null, v = e.value?.value;
        return m && Array.isArray(v) && v[0] === "existing" ? [m[1]!] : [];
      });
      if (!existing.length) throw unverified("existing_debt");
      const mine = list(`path.${path}.instruments`);
      if (!mine.length) throw indefinite(`path_${path}_absent`);
      // The whole path object: every field the plan records for the path is read here; the label is its name.
      const pathFields = contributions.flatMap((e) => {const m = typeof e.fieldPath === "string" ? new RegExp(`\\.path\\.${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(.+)$`).exec(e.fieldPath) : null; return m ? [m[1]!] : [];});
      if (pathFields.some((f) => !["terms", "label", "instruments", "prepayments", "chargeSlots", "chargeAmounts"].includes(f))) return false;
      if (list(`path.${path}.terms`).length !== 2 || list(`path.${path}.chargeAmounts`).length !== list(`path.${path}.chargeSlots`).length) return false;
      // The kind of a new or amended instrument, from its terms: amendment, debenture, development bank, bank credit repaid
      // within the horizon or seasonally (short), bank credit with a scheduled amortization after the horizon.
      const kind = (id: string) => {
        const [role, lender, , , , , , , after] = terms(id);
        if (role === "amended") return "aditamento";
        if (lender === "capital_markets") return "debenture_nova";
        if (lender === "development_bank") return "fomento";
        if (lender === "bank") return after === "none" || after === "seasonal_release" ? "bancario_curto" : after === "scheduled" ? "bancario_programado" : `bancario:${after}`;
        return `outro:${lender}`;
      };
      // An existing instrument touched by a prepayment or a charge: the named row by the shared id, an existing debenture by its kind.
      const touched = (id: string) => vars.i !== undefined && id === vars.i ? "$i" : terms(id)[0] === "existing" && terms(id)[1] === "capital_markets" ? "debenture_atual" : `outro:${id}`;
      const set = (xs: string[]) => [...new Set(xs)].sort().join(",");
      const want = (xs: readonly string[]) => set(xs.map((x) => x === "$i" ? "$i" : x));
      const added = set(mine.filter((x) => !existing.includes(x)).map(kind));
      const removed = set(existing.filter((x) => !mine.includes(x)).map(touched));
      const prepaid = set(list(`path.${path}.prepayments`).map((x) => touched(x.split("|")[0]!)));
      const charges = set(list(`path.${path}.chargeSlots`).map((x) => {const [k, id] = x.split("|"); return `${k}|${touched(id!)}`;}));
      const variantOf = (id: string) => list(`path.${id}.terms`)[1];
      return added === want(c.added) && removed === want(c.removed) && prepaid === want(c.prepaid) && charges === want(c.charges)
        && (c.variant === "same" ? variantOf(path) === variantOf(quo[0]!) : variantOf(path) !== variantOf(quo[0]!));
    }
    if ("atMost" in c) {const xs = read(c.atMost[0], c.atMost[1]); if (!Array.isArray(xs)) throw unverified(c.atMost[1]); return xs.length <= c.count;}
    if ("changedOnly" in c) {
      // The case's whole input object (every adopted contribution) against its reference's, in canonical form; only source
      // anchors and link ids are ignored. Every named field must differ; every other field must be equal.
      const [method, pathA, pathB] = c.changedOnly;
      const a = boardCanonicalInputs(read(method, pathA)), b = boardCanonicalInputs(read(method, pathB));
      if (!a || !b) throw unverified(pathA);
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        const x = a.get(key), y = b.get(key);
        if (c.fields.includes(key)) {if (!x || !y || JSON.stringify(x) === JSON.stringify(y)) return false; continue;}
        if (!x || !y || JSON.stringify(x) !== JSON.stringify(y)) return false;
      }
      return true;
    }
    if ("samePeriod" in c) {
      const period = (slot: string) => {const f = context.figures.get(bindings[slot]!); if (!f || "pending" in f || !f.origin) throw indefinite(`slot_${slot}`); return f.origin.periodMonths ?? "fixed";};
      return period(c.samePeriod[0]) === period(c.samePeriod[1]);
    }
    if ("testsLimit" in c) {
      const fill = (x: string) => x.replace(/\$([a-z]+)/g, (_m: string, k: string) => {if (!Object.hasOwn(vars, k)) throw unverified(`variable_${k}`); return vars[k]!;});
      const [method, rawMeasurement, rawLimit] = c.testsLimit, limit = fill(rawLimit);
      const all = read(method, "result.headroom.measurements");
      if (!Array.isArray(all) || !all.length) throw indefinite("measurements_absent");
      type M = {id?: unknown; role?: unknown; date?: unknown; scenario?: unknown; tests?: {limitId?: unknown; breached?: unknown}[]};
      const test = (m: M) => (Array.isArray(m.tests) ? m.tests : []).find((x) => x.limitId === limit);
      const breached = (m: M) => m.role === "test" && test(m)?.breached === true;
      if (rawMeasurement === null) return !(all as M[]).some(breached);
      const m = (all as M[]).find((x) => x.id === fill(rawMeasurement));
      if (!m) throw indefinite("measurement_absent");
      const own = test(m);
      if (m.role !== "test" || !own || own.breached !== false) return false;
      return !(all as M[]).some((x) => x.date === m.date && x.scenario === m.scenario && breached(x));
    }
    if ("planDeferred" in c) {
      // The plan's variants: every contribution recorded under each variant, keyed by field without the variant id.
      const [method, rawA, rawB] = c.planDeferred;
      const idOf = (x: string) => x.replace(/\$([a-z]+)/g, (_m: string, k: string) => {if (!Object.hasOwn(vars, k)) throw unverified(`variable_${k}`); return vars[k]!;});
      const packet = sourceOf(method).packet as {result?: {contributions?: {fieldPath?: unknown}[]}};
      const of = (id: string) => {
        const mine = (packet.result?.contributions ?? []).filter((e) => typeof e.fieldPath === "string" && e.fieldPath.includes(`.variant.${id}.`));
        if (!mine.length) throw indefinite(`variant_${id}_absent`);
        const m = boardCanonicalInputs(mine.map((e) => ({...e, fieldPath: (e.fieldPath as string).replace(`.variant.${id}.`, ".variant.")})));
        if (!m) throw unverified(`variant_${id}`);
        return m;
      };
      return boardIsUniformPlanDeferral(of(idOf(rawA)), of(idOf(rawB))) !== null;
    }
    if ("deferredBy" in c) {
      const [method, pathA, pathB] = c.deferredBy;
      const a = boardCanonicalInputs(read(method, pathA)), b = boardCanonicalInputs(read(method, pathB));
      if (!a || !b) throw unverified(pathA);
      return boardIsUniformDeferral(a, b) !== null;
    }
    if ("scenarioDefines" in c) {
      // The scenario's whole input object: every contribution recorded under the scenario, provenance tags (origin) aside,
      // must belong to the named drivers, and every named driver must be there.
      const packet = sourceOf(c.scenarioDefines[0]).packet as {result?: {contributions?: {fieldPath?: unknown}[]}};
      const id = c.scenarioDefines[1];
      const fields = (packet.result?.contributions ?? []).flatMap((e) => {
        const m = typeof e.fieldPath === "string" ? new RegExp(`\\.scenario\\.${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(.+)$`).exec(e.fieldPath) : null;
        return m && !boardIgnoredInputKey(m[1]!.split(".").at(-1)!) ? [m[1]!] : [];
      });
      const driverOf = (f: string) => f.startsWith("shock.") ? "inputCostShock" : f.startsWith("override.") ? f.split(".")[1]! : f;
      const defined = new Set(fields.map(driverOf));
      if (c.drivers.includes("inputCostShock") && !["shock.rate", "shock.fromPeriodEnd", "shock.passThroughLagMonths"].every((f) => fields.includes(f))) return false;
      if (!fields.length) throw indefinite(`scenario_${id}_absent`);
      return defined.size === c.drivers.length && c.drivers.every((d) => defined.has(d));
    }
    if ("atKey" in c) {
      const a = boardSeriesOf(c.atKey[0]), b = boardSeriesOf(c.atKey[1]), k = operand(c.key);
      if (!a || !b || !a.has(k) || !b.has(k)) throw indefinite("series_absent");
      return compareBoard(a.get(k)!, c.op, b.get(k)!);
    }
    if ("startsLater" in c) {
      const first = (m: Map<string, string> | null) => {
        if (!m) return null;
        const keys = [...m.keys()].sort((x, y) => /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x < y ? -1 : x > y ? 1 : 0);
        return keys.find((key) => !new Exact(m.get(key)!).eq(0)) ?? null;
      };
      const a = first(boardSeriesOf(c.startsLater[0])), b = first(boardSeriesOf(c.startsLater[1]));
      if (a === null || b === null) throw indefinite("series_absent");
      return /^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) > Number(b) : a > b;
    }
    if ("sameObject" in c || "registeredTerm" in c) {
      // The registered texts: a field of the packet by path, or (path starting with ~) contributions whose field path ends so.
      const [method, rawPath] = "sameObject" in c ? c.sameObject : c.registeredTerm;
      const path = rawPath.replace(/\$([a-z]+)/g, (_, k: string) => vars[k] ?? "\u0000");
      const packet = sourceOf(method).packet as {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}};
      let texts: string[];
      if (path.startsWith("~")) {
        const pattern = new RegExp(`\\.${path.slice(1).split("*").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9-]+")}$`);
        const all = packet.result?.contributions ?? [];
        // Only the entries whose sibling field holds the given value (the plan's variants that carry the project).
        const kept = (path: string) => !("sameObject" in c && c.where) || all.some((e) => e.fieldPath === path.replace(/\.[a-zA-Z]+$/, `.${c.where![0]}`) && e.value?.value === c.where![1]);
        texts = all.flatMap((e) => typeof e.fieldPath === "string" && pattern.test(e.fieldPath) && typeof e.value?.value === "string" && kept(e.fieldPath) ? [e.value.value] : []);
      } else {
        const v = readBoardSourcePath(packet, path);
        texts = typeof v === "string" ? [v] : [];
      }
      if (texts.length === 0) throw indefinite("registered_text_absent");
      const terms = texts.map((x) => boardObjectTerm(c.vocabulary, x));
      if ("registeredTerm" in c) return terms.every((t) => t === c.term);
      // Identity across sources: the bound reading names a term, and every registered text of the other source names that term.
      const bound = values[c.slot];
      const mine = bound ? boardObjectTerm(c.vocabulary, String(bound.value)) : null;
      return mine !== null && terms.every((t) => t === mine);
    }
    if ("contributedHas" in c) {
      const packet = sourceOf(c.contributedHas[0]).packet as {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}};
      const suffix = c.contributedHas[1].replace(/\$([a-z]+)/g, (_, k: string) => vars[k] ?? "");
      const hits = (packet.result?.contributions ?? []).filter((e) => typeof e.fieldPath === "string" && e.fieldPath.endsWith(`.${suffix}`));
      const list = hits.length === 1 ? hits[0]!.value?.value : undefined, want = operand(c.value);
      if (!Array.isArray(list)) throw indefinite(`contribution_${suffix}_absent`);
      return c.none ? !list.includes(want) : c.only ? list.length === 1 && list[0] === want : list.includes(want);
    }
    if ("atLeast" in c) {const xs = read(c.atLeast[0], c.atLeast[1]); if (!Array.isArray(xs)) throw unverified(c.atLeast[1]); return xs.length >= c.count;}
    if ("onlyFlagged" in c) {
      const [m, path, flag, key] = c.onlyFlagged, equals = operand(c.equals);
      const flagged = list(m, path).filter((x) => x[flag] === true);
      return flagged.length === 1 && scalar(flagged[0]![key], key) === equals;
    }
    const [m, path, field, key] = c.largest, equals = operand(c.equals);
    const xs = list(m, path).map((x) => ({value: new Exact(scalar(x[field], field)), key: scalar(x[key], key)}));
    const top = xs.reduce((best, x) => x.value.gt(best.value) ? x : best, xs[0]!);
    return xs.filter((x) => x.value.eq(top.value)).length === 1 && compareBoard(top.key, "eq", equals);
  };
  // Every order or sign the text asserts is evaluated twice, in one place: on the exact values and on the values as
  // shown (the figure's display, back in the field's scale). Both must hold. When only the shown one fails, the
  // sentence is refused naming the figures whose shown precision does not distinguish them (the reading may state
  // them with more decimals, up to the formats the registry allows, two), or, for an order between two shown figures,
  // the template's declared "praticamente igual" wording is used.
  let shownText = template.text;
  template.when.forEach((c, i) => {
    let value: boolean | "undefined";
    shownLost = null;
    // A condition that names a pending slot is undefined before anything is read.
    try {value = boardConditionSlots(c).some((x) => values[x] === null) ? "undefined" : holds(c);}
    catch (e) {if (e instanceof BoardIndefinite) value = "undefined"; else throw e;}
    if (value === "undefined") throw new Error(`board_capital_template_condition_undefined:${templateId}:${i}`);
    if (!value) throw new Error(`board_capital_template_condition_failed:${templateId}:${i}`);
    if (shownLost) {
      const lost = shownLost as {figures: string[]; betweenTwoShown: boolean};
      if (lost.betweenTwoShown && template.nearlyEqual) {shownText = template.nearlyEqual; return;}
      throw new Error(`board_capital_display_order_lost:${templateId}:${i}:${[...new Set(lost.figures)].join(",")}`);
    }
  });
  const unnamed: string[] = [], unconfirmed: string[] = [], debtors = new Map<string, string>(), objects = new Map<string, string>(), unmatched: string[] = [], unknownSpecies: string[] = [];
  // An instrument's species is named only by its registered label, equal to a species or a declared label of one;
  // otherwise the generic words of a capital-markets instrument and a gap of species. The instrument is the
  // recommended long one, the existing capital-markets one, or the new capital-markets one of a path.
  // A compliance sentence against a limit without a registered definition names the definition the source applied in
  // its registered test of that limit, read from the measurement's record (a test of the contractual limit in force
  // with a registered definition: the indenture's; no adjustment to reported EBITDA and no contractual test: managerial).
  // With a registered definition the sentence may omit it. A limit without definition and no definition named: refused.
  const cvPacket = () => sourceOf("measure-covenant-headroom").packet as {result?: {headroom?: {limits?: {id: string; kind: string; status: string}[];
    measurements?: {id: string; role: string; adjustments?: unknown[]; tests?: {limitId: string; kind: string}[]}[]}; definitions?: {limitId: string; definition: string | null}[]}};
  const limitDefinition = (limit: string) => cvPacket().result?.definitions?.find((x) => x.limitId === limit)?.definition ?? null;
  for (const c of template.when) if ("testsLimit" in c) {
    const limit = c.testsLimit[2].replace(/\$([a-z]+)/g, (_m: string, k: string) => vars[k] ?? "");
    if (limitDefinition(limit) === null && !new RegExp(`\\{definition:${limit}:`).test(shownText)) throw new Error(`board_capital_limit_definition_not_named:${templateId}:${limit}`);
  }
  shownText = shownText.replace(/\{definition:([a-z0-9-]+):([$a-z0-9-]+)\}/g, (_m: string, limit: string, scope: string) => {
    if (limitDefinition(limit) !== null) return "";
    const head = cvPacket().result?.headroom, measurements = head?.measurements ?? [];
    const definitionOf = (m: (typeof measurements)[number]) => {
      const contractual = (m.tests ?? []).some((t) => t.kind === "contractual" && head?.limits?.find((l) => l.id === t.limitId)?.status === "in_force" && limitDefinition(t.limitId) !== null);
      if (contractual) return "escritura";
      if (!(m.tests ?? []).some((t) => t.kind === "contractual") && Array.isArray(m.adjustments) && m.adjustments.length === 0) return "gerencial";
      return null;
    };
    const chosen = scope === "all" ? measurements.filter((m) => m.role === "test" && (m.tests ?? []).some((t) => t.limitId === limit))
      : measurements.filter((m) => m.id === scope.replace(/^\$([a-z]+)$/, (_x: string, k: string) => vars[k] ?? ""));
    const kinds = [...new Set(chosen.map(definitionOf))];
    if (!chosen.length || kinds.includes(null)) throw new Error(`board_capital_limit_definition_unregistered:${templateId}:${limit}`);
    return ` ${kinds.sort().map((k) => k === "escritura" ? "pela definição da escritura" : "pelo EBITDA gerencial").join(" e ")}`;
  });
  const speciesText = shownText.replace(/\{species:([a-z_]+):([^}]+)\}/g, (_m: string, form: string, selector: string) => {
    const plan = sourceOf("evaluate-financing-paths").packet as {readings?: {recommendation?: {longInstrument?: {id?: unknown}}}; result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}};
    const contributions = plan.result?.contributions ?? [];
    const term = (suffix: string) => {const hits = contributions.filter((e) => typeof e.fieldPath === "string" && e.fieldPath.endsWith(`.${suffix}`)); return hits.length === 1 ? hits[0]!.value?.value : undefined;};
    const capitalMarkets = (role: string) => contributions.flatMap((e) => {const m = typeof e.fieldPath === "string" ? /\.instrument\.([a-z0-9-]+)\.terms$/.exec(e.fieldPath) : null, v = e.value?.value;
      return m && Array.isArray(v) && v[0] === role && v[1] === "capital_markets" ? [m[1]!] : [];});
    let ids: string[] = [];
    if (selector === "long") {const id = plan.readings?.recommendation?.longInstrument?.id; ids = typeof id === "string" ? [id] : [];}
    else if (selector === "existing") ids = capitalMarkets("existing");
    else {
      const path = selector.slice(4).replace(/\$([a-z]+)/g, (_x: string, k: string) => vars[k] ?? "\u0000"), mine = term(`path.${path}.instruments`);
      ids = Array.isArray(mine) ? capitalMarkets("new").filter((x) => (mine as unknown[]).includes(x)) : [];
    }
    const label = ids.length === 1 ? term(`instrument.${ids[0]}.label`) : undefined;
    const species = typeof label === "string" ? boardObjectTerm("species", label) : null;
    const key = `species-${selector.replace(/[^a-z0-9-]/g, "")}`;
    if (!species) {unknownSpecies.push(key); return boardObjectGenerics.species[form as BoardObjectForm]!;}
    objects.set(key, boardVocabularies.species[species]![form as BoardObjectForm]!);
    return `{object:${key}}`;
  });
  const text = speciesText.replace(/\{(?:(em|ate|desde|para|fim|de|a):)?([a-z_]+)\}/g, (match: string, prep: string | undefined, slot: string) => {
    if (match.startsWith("{count:")) return match;
    const spec = template.slots[slot], bound = bindings[slot];
    if (!spec || bound === undefined) throw new Error(`board_capital_slot_invalid:${templateId}:${slot}`);
    if (spec.type === "deadline" || spec.type === "informed") {
      if (prep) throw new Error(`board_capital_slot_type_mismatch:${templateId}:${slot}`);
      // A reason outside the dictionary is never written: the template's generic words stand in its place, with a gap.
      if (spec.type === "informed") {
        const fact = context.informed?.find((x) => x.id === bound.slice(9));
        if (fact && !Object.hasOwn(boardInformedReasons, fact.code)) {unconfirmed.push(fact.id); return spec.generic!;}
      }
      return `{${bound}}`;
    }
    if ((spec.type === "date") !== (prep !== undefined)) throw new Error(`board_capital_template_invalid:${templateId}:${slot}`);
    // A debtor is named by the debtor key its item registers in the receivables result, through the closed dictionary;
    // the item's identifier and its free label never name it.
    const figure = context.figures.get(bound);
    // An object is named only by a vocabulary term the bound registered text contains; otherwise generic words and a gap.
    if (spec.type === "object") {
      const raw = figure && !("pending" in figure) ? figure.origin?.value : undefined;
      const term = typeof raw === "string" ? boardObjectTerm(spec.vocabulary!, raw) : null;
      if (!term) {unmatched.push(bound); return spec.generic!;}
      objects.set(bound, boardVocabularies[spec.vocabulary!][term]![spec.form!]!);
      return `{object:${bound}}`;
    }
    if (spec.type === "debtor") {
      const item = figure && !("pending" in figure) && figure.origin ? boardMatchPath(spec.from![0]![1], figure.origin.path) : null;
      const itemId = item ? Object.values(item)[0] : undefined;
      const packet = (context.sources ?? []).find((x) => figure && !("pending" in figure) && x.id === figure.origin?.sourceId)?.packet as
        {result?: {contributions?: {fieldPath?: unknown; value?: {value?: unknown}}[]}} | undefined;
      const keys = (packet?.result?.contributions ?? []).filter((e) => typeof e.fieldPath === "string" && e.fieldPath.endsWith(`.item.${itemId}.debtorKey`));
      const key = keys.length === 1 ? keys[0]!.value?.value : undefined;
      const name = typeof key === "string" && Object.hasOwn(boardDebtorNames, key) ? boardDebtorNames[key] : undefined;
      if (!name) {unnamed.push(bound); return spec.generic!;}
      debtors.set(bound, name);
      return `{debtor:${bound}}`;
    }
    if (spec.type === "label" && figure && !("pending" in figure) && figure.unnamed) {unnamed.push(bound); return spec.generic!;}
    return prep ? `{${prep}:${bound}}` : `{${bound}}`;
  });
  return {...renderBoardTemplate(text, {...context, debtors, objects}), bindings: out, unnamed, unconfirmed, unmatched, unknownSpecies};
}

/** The single number tokenizer of the material, applied to the final text: a day of a month (21/dez), a month
 * of a year (dez/26), or a signed number with any run of digits joined by "." or "," (-9,5; 130,3; 1.303). */
const monthNames = months.join("|");
const numberToken = new RegExp(`\\p{N}{1,2}/(?:${monthNames})(?![\\p{L}])|(?<![\\p{L}])(?:${monthNames})/\\p{N}{2}(?!\\p{N})|[-+\\u2212]?\\p{N}+(?:[.,]\\p{N}+)*`, "giu");
export function boardNumberTokens(text: string) {
  return [...text.matchAll(numberToken)].map((m) => ({text: m[0], start: m.index!, end: m.index! + m[0].length}));
}
/** Render, then verify, on the final text. Every number lies inside exactly one marker the method wrote, and
 * a reading's marker is the formatter's text for it. Everything outside markers is free text and passes the
 * whitelist and the closed lexicon above; source labels are read as they are. No preposition stands before a
 * date marker and no date preposition before a value marker. */
export function verifyBoardRendered(field: string, r: BoardRich, figures: Map<string, BoardFigureDisplay>) {
  const fail = (why: string, token: string) => {throw new Error(`board_capital_rendered_number_invalid:${field}:${why}:${token}`);};
  for (const x of r.spans) {
    const f = x.kind === "figure" || x.kind === "text_figure" ? figures.get(x.id) : null;
    const text = r.display.slice(x.start, x.end);
    if (f && ("pending" in f || f.unit !== x.unit || (text !== f.display && !Object.values(datePrepositions).some((p) => text === `${p} ${f.display}`)))) fail("marker_text", x.id);
    // A source label is shown only as an entry of the closed name dictionary, never as a string of the source.
    if (x.kind === "text_figure" && (!dictionary.has(text) || (f && !("pending" in f) && f.unnamed))) fail("label_not_in_dictionary", x.id);
    if (x.kind === "debtor" && !Object.values(boardDebtorNames).includes(text)) fail("debtor_not_in_dictionary", x.id);
    if (x.kind === "object" && !Object.values(boardVocabularies).some((v) => Object.values(v).some((forms) => Object.values(forms).includes(text)))) fail("object_not_in_vocabulary", x.id);
    // An informed fact is words only: the whitelist and the closed lexicon apply inside it as well.
    if (x.kind === "informed") {const issue = boardFreeTextIssue(text); if (issue) fail(`informed_${issue}`, x.id);}
  }
  let verified = 0;
  for (const t of boardNumberTokens(r.display)) {
    const holders = r.spans.filter((x) => x.start <= t.start && t.end <= x.end);
    const touching = r.spans.filter((x) => x.start < t.end && t.start < x.end);
    if (holders.length !== 1 || touching.length !== 1) fail(touching.length ? "crosses_markers" : "without_marker", t.text);
    verified++;
  }
  // Free text: the runs between markers.
  const sorted = [...r.spans].sort((a, b) => a.start - b.start);
  let at = 0;
  for (const x of [...sorted, {start: r.display.length, end: r.display.length} as BoardSpan]) {
    if (x.start > at) {const issue = boardFreeTextIssue(r.display.slice(at, x.start)); if (issue) fail("free_text", issue);}
    at = Math.max(at, x.end);
  }
  for (const x of r.spans) {
    if (x.kind !== "figure" && x.kind !== "text_figure") continue;
    const before = r.display.slice(0, x.start), after = r.display.slice(x.end);
    if (/[\p{L}\p{N}]$/u.test(before) || /^[\p{L}\p{N}]/u.test(after)) fail("glued_to_marker", x.id);
    if ((x.unit === "date" || x.unit === "calendar") && prepositionBeforeDate.test(before)) fail("preposition_before_marker", x.id);
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
  onlyRecommendation: "Só a recomendação pode sair a pedido; páginas, linhas e fatos ficam no material como foram compostos.",
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
function renderVersion(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>, removed: Removed, version: number, sources: BoardSourceReading[]) {
  const context = {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate, sources, informed: d.informed};
  const bindings: (BoardBinding & {field: string})[] = [];
  let verifiedNumbers = 0;
  const shown = (field: string, r: BoardRich) => {verifiedNumbers += verifyBoardRendered(field, r, figures); return r;};
  // Every displayed field records which slot of which template binds which reading or deadline.
  const nameGaps: {item: string; reason: "label_not_in_dictionary" | "informed_reason_not_in_dictionary" | "object_not_in_vocabulary" | "species_not_registered"}[] = [];
  const render = (t: string, field?: string) => {
    const r = renderBoardRef(t, context);
    if (field) {
      bindings.push(...r.bindings.map((b) => ({field, ...b})));
      nameGaps.push(...r.unnamed.map((id) => ({item: `${field}.label.${id}`, reason: "label_not_in_dictionary" as const})),
        ...r.unconfirmed.map((id) => ({item: `${field}.informed.${id}`, reason: "informed_reason_not_in_dictionary" as const})),
        ...r.unmatched.map((id) => ({item: `${field}.object.${id}`, reason: "object_not_in_vocabulary" as const})),
        ...r.unknownSpecies.map((id) => ({item: `${field}.species.${id}`, reason: "species_not_registered" as const})));
    }
    return r;
  };
  // A figure the author removed renders nowhere: a line that carries it is dropped with it.
  const drops = (t: string) => boardPlaceholderIds(t).some((id) => removed.figures.has(id));
  const neutralTopics = new Set(d.pages.filter((p) => removed.recommendations.has(p.id) && p.topicId !== null).map((p) => p.topicId!));
  const deliberations = orderBoardDeliberations(d.deliberations).map((x, i) => {
    const ask = x.recommendation !== null && !(x.topicId !== null && neutralTopics.has(x.topicId)) ? render(x.recommendation, `deliberation.${x.id}.text`) : render(x.subject, `deliberation.${x.id}.text`);
    const title = shown(`deliberation.${x.id}.title`, render(x.title, `deliberation.${x.id}.title`));
    const deadlines = x.deadlines.map((t) => {
      const action = shown(`deliberation.${x.id}.deadline.${t.id}`, render(t.action, `deliberation.${x.id}.deadline.${t.id}`));
      return {id: t.id, date: t.date, rich: {display: dayMonth(t.date), spans: [{start: 0, end: dayMonth(t.date).length, kind: "deadline" as const, id: `${x.id}.${t.id}`, unit: null}]}, action};
    });
    const text = shown(`deliberation.${x.id}.text`, deliberationText(ask, deadlines.map((t) => ({action: t.action, display: t.rich}))));
    const line = joinBoardRich([ordinal(i + 1), ". ", title, ": ", text]);
    return {id: x.id, number: i + 1, title, text, line, recommendationShown: x.recommendation !== null && ask.display !== render(x.subject).display, authority: x.authority,
      authorityBasis: x.authorityBasis === null ? null : render(x.authorityBasis).display, deadlines};
  });
  const ordered = orderBoardPages(d.pages.filter((p) => !removed.pages.has(p.id)), d.topics);
  const gaps: {item: string; reason: "figure_pending_reviewed_result" | "layout_exceeds_page" | "pages_exceed_agenda" | "recommendation_removed_without_options" | "label_not_in_dictionary" | "informed_reason_not_in_dictionary" | "object_not_in_vocabulary" | "species_not_registered"}[] = [];
  const page = (p: BoardPage, placement: "main" | "appendix") => {
    const title = shown(`page.${p.id}.title`, render(p.title, `page.${p.id}.title`));
    const lines: BoardRich[] = p.lines.filter((l) => !drops(l)).map((l, j) => shown(`page.${p.id}.line.${j}`, render(l, `page.${p.id}.line.${j}`)));
    if (p.role === "decisions") for (const x of deliberations) lines.push(shown(`page.${p.id}.decision.${x.id}`, x.line));
    const withoutRecommendation = removed.recommendations.has(p.id);
    const recommendation = p.recommendation !== null && !withoutRecommendation ? shown(`page.${p.id}.recommendation`, render(p.recommendation, `page.${p.id}.recommendation`)) : null;
    const options = withoutRecommendation ? p.options.filter((o) => !drops(o)).map((o, j) => shown(`page.${p.id}.option.${j}`, render(o, `page.${p.id}.option.${j}`))) : [];
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
  const summary = shown("summary", joinBoardRich([render(d.summary.opening, "summary.opening"), " Pedimos ao conselho: ", ...asks, ". ", render(d.summary.closing, "summary.closing")]));
  if (summary.display.length > LIMITS.summary) gaps.push({item: "summary", reason: "layout_exceeds_page"});
  for (const f of ids(summary, ["pending"])) gaps.push({item: `summary.figure.${f}`, reason: "figure_pending_reviewed_result"});
  const questions = d.questions.map((q) => {
    const t = shown(`question.${q.id}.question`, render(q.question, `question.${q.id}.question`)), a = shown(`question.${q.id}.answer`, render(q.answer, `question.${q.id}.answer`));
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
  const appendix = d.appendix.map((a) => {const label = shown(`appendix.${a.id}`, render(a.label, `appendix.${a.id}`)); return {id: a.id, label: label.display, sourceIds: a.sourceIds, figureIds: ids(label, ["figure", "text_figure"])};});
  const mainCount = pages.filter((p) => p.placement === "main").length;
  const capacity = d.agendaMinutes === null ? null : Math.floor(d.agendaMinutes / d.minutesPerPage);
  if (capacity !== null && mainCount > capacity) gaps.push({item: "pages", reason: "pages_exceed_agenda"});
  const body = {version, deliberations: deliberationOut, pages, summary: summary.display, summaryFigureIds: ids(summary, ["figure", "text_figure"]),
    appendix, questions, verifiedNumbers, bindings,
    agenda: {minutes: d.agendaMinutes, minutesPerPage: d.minutesPerPage, mainPages: mainCount, capacity, fits: capacity === null ? null : mainCount <= capacity}};
  return {material: {...body, fingerprint: fingerprintOf(body)}, gaps: [...gaps, ...nameGaps]};
}
type Version = ReturnType<typeof renderVersion>;

/** The material facts, by rule: every economic reading the discussion adopts, every figure the basis marks
 * material on top of that, and every deadline of a deliberation. */
export function boardMaterialFacts(d: BoardDiscussion, shown: Map<string, BoardFigureDisplay>) {
  const economic = (id: string) => {const f = shown.get(id); return f !== undefined && !("pending" in f) && boardEconomicUnits.includes(f.unit);};
  const figures = [...new Set([...d.figures.filter((f) => f.kind === "reading" && economic(f.id)).map((f) => f.id), ...d.materialFigureIds])];
  const deadlines = d.deliberations.flatMap((x) => x.deadlines.map((t) => `${x.id}.${t.id}`));
  return {figures, deadlines};
}
const verifyField = (field: string, r: BoardRich, figures: Map<string, BoardFigureDisplay>) => {verifyBoardRendered(field, r, figures); return r;};

/** Every fact of the rule that a version of the material does not show, wherever it would be shown. */
export function boardMissingFacts(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>, material: Version["material"]) {
  const facts = boardMaterialFacts(d, figures);
  const shown = new Set([...material.pages.flatMap((p) => [...p.figureIds, ...p.pendingFigureIds]), ...material.questions.flatMap((q) => [...q.figureIds, ...q.pendingFigureIds]),
    ...material.deliberations.flatMap((x) => [...x.figureIds, ...x.pendingFigureIds]), ...material.summaryFigureIds, ...material.appendix.flatMap((a) => a.figureIds)]);
  const dated = new Set([...material.deliberations.flatMap((x) => x.deadlines.map((t) => `${x.id}.${t.id}`)), ...material.pages.flatMap((p) => p.deadlineIds)]);
  return {figures: facts.figures.filter((id) => !shown.has(id)), deadlines: facts.deadlines.filter((id) => !dated.has(id))};
}

/** The omission rule, applied request by request on the rendered material: a request is applied only when
 * the version it produces still shows every material fact; otherwise it is refused with one sentence and
 * the facts it would have removed are named. A recommendation may be withdrawn; a deadline never is. */
export function decideBoardOmissions(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>, sources: BoardSourceReading[] = []) {
  const removed = noRemoval();
  const economic = new Set(boardMaterialFacts(d, figures).figures);
  const decisions: BoardOmissionDecision[] = d.omissions.map((o) => {
    const done = (outcome: "applied" | "refused", reason: string, keptFigureIds: string[] = []) => ({...o, outcome, reason, keptFigureIds});
    const attempt = (apply: (r: Removed) => void, applied: string): BoardOmissionDecision => {
      const next = {recommendations: new Set(removed.recommendations), pages: new Set(removed.pages), figures: new Set(removed.figures)};
      apply(next);
      const lost = boardMissingFacts(d, figures, renderVersion(d, figures, next, 2, sources).material);
      if (lost.figures.length || lost.deadlines.length) return done("refused", sentences.materialKept, lost.figures);
      apply(removed);
      return done("applied", applied);
    };
    if (o.target === "recommendation") {
      const p = d.pages.find((x) => x.id === o.targetId);
      if (!p || p.recommendation === null) return done("refused", sentences.unknownTarget);
      const kept = [...new Set([p.title, ...p.lines, p.recommendation, ...p.options].flatMap(boardPlaceholderIds))].filter((id) => economic.has(id));
      const decision = attempt((r) => r.recommendations.add(p.id), sentences.recommendationRemoved);
      return decision.outcome === "applied" ? {...decision, keptFigureIds: kept} : decision;
    }
    // A request removes only a sentence of recommendation; no page, line, fact or deadline is ever taken out.
    if (o.target === "page" || o.target === "figure") {
      const known = o.target === "page" ? d.pages.some((x) => x.id === o.targetId) : d.figures.some((f) => f.id === o.targetId);
      return done("refused", known ? sentences.onlyRecommendation : sentences.unknownTarget);
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
export function validateBoardDiscussion(d: BoardDiscussion, shown?: Map<string, BoardFigureDisplay>) {
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
  // Every text is a reference to the closed library, checked up front even when it renders only later (options).
  for (const t of [...d.pages.flatMap((p) => [p.title, ...p.lines, ...p.recommendation ? [p.recommendation] : [], ...p.options]),
    ...d.deliberations.flatMap((x) => [x.title, x.subject, ...x.recommendation ? [x.recommendation] : [], ...x.deadlines.map((t) => t.action)]),
    d.summary.opening, d.summary.closing, ...d.appendix.map((a) => a.label), ...d.questions.flatMap((q) => [q.question, q.answer])]) parseBoardTextRef(t);
  // Each template is used only in the field it is written for; a deliberation's texts belong to it; an answer answers its question.
  const use = (t: string, u: BoardTextUse, field: string) => {const r = parseBoardTextRef(t); if (!r.template.use.includes(u)) throw new Error(`board_capital_template_use_invalid:${field}:${r.templateId}`); return r;};
  for (const p of d.pages) {
    use(p.title, "page.title", `page.${p.id}.title`); p.lines.forEach((l, j) => use(l, "page.line", `page.${p.id}.line.${j}`));
    if (p.recommendation) use(p.recommendation, "page.recommendation", `page.${p.id}.recommendation`); p.options.forEach((o, j) => use(o, "page.option", `page.${p.id}.option.${j}`));
  }
  for (const x of d.deliberations) {
    const title = use(x.title, "delib.title", `deliberation.${x.id}.title`).templateId;
    const own = (t: string, u: BoardTextUse, field: string) => {const r = use(t, u, field); if (r.template.of !== title) throw new Error(`board_capital_deliberation_text_mismatch:${field}:${r.templateId}`);};
    own(x.subject, "delib.subject", `deliberation.${x.id}.subject`);
    if (x.recommendation) own(x.recommendation, "delib.recommendation", `deliberation.${x.id}.recommendation`);
    x.deadlines.forEach((t) => own(t.action, "delib.action", `deliberation.${x.id}.deadline.${t.id}`));
    if (x.authorityBasis !== null) use(x.authorityBasis, "authority", `deliberation.${x.id}.authorityBasis`);
  }
  use(d.summary.opening, "summary.opening", "summary.opening"); use(d.summary.closing, "summary.closing", "summary.closing");
  for (const a of d.appendix) use(a.label, "appendix", `appendix.${a.id}`);
  for (const q of d.questions) {
    const question = use(q.question, "question", `question.${q.id}.question`).templateId, answer = use(q.answer, "answer", `question.${q.id}.answer`);
    if (answer.template.answers !== question) throw new Error(`board_capital_answer_mismatch:${q.id}:${answer.templateId}`);
    // A slot the question and its answer share (the creditor named in both) binds the same reading.
    const asked = parseBoardTextRef(q.question).bindings;
    for (const [slot, bound] of Object.entries(answer.bindings)) if (Object.hasOwn(asked, slot) && asked[slot] !== bound) throw new Error(`board_capital_answer_mismatch:${q.id}:${slot}`);
  }
  for (const t of d.topics) use(t.label, "topic", `topic.${t.id}`);
  for (const x of d.indicative) use(x.reason, "note", `indicative.${x.figureId}`);
  for (const f of d.figures) if (f.kind === "pending") use(f.reason, "note", `figure.${f.id}`);
  for (const o of d.omissions) use(o.requestedBy, "requester", `omission.${o.id}`);
  // Informed facts: adopted as informed, by a named author, as a code; the text shown is the dictionary's, never the fact's.
  unique(d.informed.map((x) => x.id), "board_capital_duplicate_informed_fact");
  for (const x of d.informed) {
    if (x.origin !== "informed" || !["chair", "cfo", "ceo"].includes(x.author)) throw new Error(`board_capital_informed_fact_invalid:${x.id}`);
    if (!/^[a-z][a-z_]{0,59}$/.test(x.code)) throw new Error(`board_capital_informed_fact_invalid:${x.id}`);
  }
  // Texts shown without any reading: topics, notes, requesters and authority bases have no slot.
  for (const t of [...d.topics.map((x) => x.label), ...d.indicative.map((x) => x.reason), ...d.omissions.map((x) => x.requestedBy),
    ...d.deliberations.flatMap((x) => x.authorityBasis === null ? [] : [x.authorityBasis]),
    ...d.figures.flatMap((f) => f.kind === "pending" ? [f.reason] : [])]) if (Object.keys(parseBoardTextRef(t).template.slots).length) throw new Error(`board_capital_template_invalid:${t}`);
  if (!shown) return;
  const economic = new Set([...shown].filter(([, f]) => "pending" in f || boardEconomicUnits.includes(f.unit)).map(([id]) => id));
  const hasEconomic = (t: string[]) => t.flatMap(boardRefReadingIds).some((x) => economic.has(x));
  const hasDeadline = (t: string) => {const r = parseBoardTextRef(t); return Object.entries(r.template.slots).some(([, spec]) => spec.type === "deadline");};
  for (const p of d.pages) {
    if (p.role === "decisions") continue;
    if (p.role === "next_steps") {if (![p.title, ...p.lines].some(hasDeadline)) throw new Error(`board_capital_page_without_number:${p.id}`); continue;}
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
    scale: BoardFieldSpec["scale"]; period: "annual" | "none" | `months_${string}`; presentation: string; value: string; rounded: string; stated: string | null; display: string; matches: true}[] = [];
  const figures = new Map<string, BoardFigureDisplay>();
  for (const f of d.figures) {
    if (f.kind === "pending") {figures.set(f.id, {pending: true, methodId: f.requiredMethodId, path: f.requiredPath}); continue;}
    const s = byId.get(f.sourceId);
    if (!s) throw new Error(`board_capital_figure_without_origin:${f.id}`);
    const spec = boardFieldOf(s.methodId, f.path);
    // The registry of the source's method says what the field is; a field it does not list is not read.
    if (!spec) throw new Error(`board_capital_field_not_registered:${f.id}`);
    if (boardEconomicUnits.includes(spec.kind) && f.stated === null) throw new Error(`board_capital_figure_without_statement:${f.id}`);
    const raw = readBoardSourcePath(s.packet, f.path);
    if (spec.kind === "label" && (typeof raw !== "string" || /^\s*[-\u2212]?\d+(?:[.,]\d+)*\s*%?\s*$/.test(raw))) throw new Error(`board_capital_text_reading_not_a_label:${f.id}`);
    // A label from the source, even produced by the method itself, is shown only when it is an entry of the closed
    // name dictionary; any other string is never shown (the slot's generic words and a gap of name instead).
    const unnamed = spec.kind === "label" && !dictionary.has(raw as string);
    const currency = (s.packet as {currency?: unknown}).currency;
    const months = spec.period === "derived" ? spec.horizonMonths?.(s.packet, f.path) ?? null : null;
    if (spec.period === "derived" && months === null) throw new Error(`board_capital_period_unregistered:${f.id}`);
    const check = formatBoardReading(raw, spec, f.presentation, f.stated, typeof currency === "string" ? currency : "", months);
    if (!check) throw new Error(`board_capital_figure_without_origin:${f.id}`);
    if (!check.matches) throw new Error(`board_capital_figure_diverges:${f.id}:${check.rounded}:${f.stated}`);
    const display = unnamed ? boardUnnamedLabel : check.display;
    // The reading's identity is the field it resolves to in that package (selectors canonicalized to indices), never its text.
    figures.set(f.id, {display, unit: spec.kind, origin: {sourceId: s.id, methodId: s.methodId, path: boardCanonicalPath(s.packet, f.path, "text") ?? f.path, value: check.value,
      canonical: boardCanonicalPath(s.packet, f.path) ?? f.path, fingerprint: s.packetFingerprint, ...months ? {periodMonths: months} : {}}, ...unnamed ? {unnamed: true as const} : {}});
    checks.push({figureId: f.id, sourceId: s.id, methodId: s.methodId, methodVersion: s.methodVersion, packetFingerprint: s.packetFingerprint, path: f.path, unit: spec.kind,
      scale: spec.scale, period: spec.period === "derived" ? `months_${months}` : spec.period, presentation: f.presentation, value: check.value, rounded: check.rounded, stated: f.stated, display, matches: true as const});
  }
  // One presentation per reading in the whole material: the same field of the same result is never shown at two precisions.
  const presentations = new Map<string, {ids: string[]; presentation: string}>();
  for (const f of d.figures) if (f.kind === "reading") {
    const o = (figures.get(f.id) as {origin?: {canonical?: string; fingerprint?: string}} | undefined)?.origin;
    const k = `${f.sourceId}|${o?.fingerprint ?? ""}|${o?.canonical ?? f.path}`, seen = presentations.get(k);
    if (seen && seen.presentation !== f.presentation) throw new Error(`board_capital_reading_presentation_not_unique:${[...seen.ids, f.id].join(",")}`);
    presentations.set(k, {ids: [...seen?.ids ?? [], f.id], presentation: f.presentation});
  }
  return {figures, checks};
}

/** The outline proposed before any material: the deliberations in urgency order, the narrative and
 * only the questions that change the material (template, time on the agenda, what the board has seen). */
export function proposeBoardOutline(d: BoardDiscussion, figures: Map<string, BoardFigureDisplay>, sources: BoardSourceReading[] = []) {
  const context = {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate, sources, informed: d.informed};
  const deliberations = orderBoardDeliberations(d.deliberations).map((x, i) => {
    const r = renderBoardRef(x.recommendation ?? x.subject, context);
    const deadlines = x.deadlines.map((t) => ({id: t.id, date: t.date, rich: {display: dayMonth(t.date), spans: [{start: 0, end: dayMonth(t.date).length, kind: "deadline" as const, id: `${x.id}.${t.id}`, unit: null}]},
      action: verifyField(`outline.${x.id}.deadline.${t.id}`, renderBoardRef(t.action, context), figures)}));
    const text = verifyField(`outline.${x.id}.text`, deliberationText(r, deadlines.map((t) => ({action: t.action, display: t.rich}))), figures);
    return {id: x.id, number: i + 1, title: verifyField(`outline.${x.id}.title`, renderBoardRef(x.title, context), figures).display, text: text.display, authority: x.authority,
      deadlines: deadlines.map((t) => ({id: t.id, date: t.date, action: t.action.display}))};
  });
  const roles = [...new Set(orderBoardPages(d.pages, d.topics).main.map((p) => p.role))];
  const questions = [...d.template === null ? [{code: "template" as const, topicId: null}] : [], ...d.agendaMinutes === null ? [{code: "agenda_minutes" as const, topicId: null}] : [],
    ...d.topics.filter((t) => t.seen === null).map((t) => ({code: "board_has_seen" as const, topicId: t.id}))];
  return {deliberations, narrative: roles, questions: questions.map((q) => ({...q, label: q.topicId === null ? null : renderBoardRef(d.topics.find((t) => t.id === q.topicId)!.label, context).display}))};
}

/** The whole discussion: the outline always; the material only once the outline is confirmed or when
 * there is no time before the meeting to confirm it. Every version shows every material fact; each is kept. */
export function prepareBoardCapitalDiscussion(d: BoardDiscussion, sources: BoardSourceReading[]) {
  // One reviewed result per method in a material: every reading and every condition of a method refers to that package.
  for (const [i, x] of sources.entries()) if (sources.findIndex((y) => y.methodId === x.methodId) !== i) throw new Error(`board_capital_source_method_repeated:${x.methodId}`);
  validateBoardDiscussion(d);
  const {figures, checks} = resolveBoardFigures(d, sources);
  validateBoardDiscussion(d, figures);
  const outline = proposeBoardOutline(d, figures, sources);
  const daysBefore = Math.round((Date.parse(`${d.meetingDate}T00:00:00Z`) - Date.parse(`${d.askedOn}T00:00:00Z`)) / 86400000);
  if (daysBefore < 0) throw new Error("board_capital_meeting_before_request");
  const timeToAlign = daysBefore >= d.leadDays;
  const produce = d.outlineConfirmed || !timeToAlign;
  const first = produce ? renderVersion(d, figures, noRemoval(), 1, sources) : null;
  // The composed material shows every material fact of the basis, or it is refused by name.
  if (first) {const lost = boardMissingFacts(d, figures, first.material); const id = [...lost.figures, ...lost.deadlines][0]; if (id) throw new Error(`board_capital_material_fact_not_shown:${id}`);}
  const {decisions, removed} = produce ? decideBoardOmissions(d, figures, sources) : {decisions: [], removed: noRemoval()};
  const changed = removed.recommendations.size + removed.pages.size + removed.figures.size > 0;
  const second = produce && changed ? renderVersion(d, figures, removed, 2, sources) : null;
  // Checked again on the version that will be read: no transformation may leave a material fact out.
  if (second) {const lost = boardMissingFacts(d, figures, second.material); if (lost.figures.length || lost.deadlines.length) throw new Error("board_capital_material_fact_omitted");}
  const current = second ?? first;
  const used = new Set(current ? [...current.material.pages.flatMap((p) => p.figureIds), ...current.material.questions.flatMap((q) => q.figureIds),
    ...current.material.deliberations.flatMap((x) => x.figureIds), ...current.material.summaryFigureIds] : []);
  const shownText = (ref: string) => renderBoardRef(ref, {figures, deliberations: d.deliberations, nextMeetingDate: d.nextMeetingDate, sources, informed: d.informed}).display;
  const pending = {
    indicative: d.indicative.filter((x) => used.has(x.figureId)).map((x) => ({figureId: x.figureId, reason: shownText(x.reason)})),
    sources: sources.filter((s) => s.status !== "prepared_for_human_review").map((s) => ({sourceId: s.id, methodId: s.methodId, status: s.status, reasons: [...new Set(s.gaps.map((g) => g.reason))]})),
    authority: d.deliberations.filter((x) => x.authorityBasis === null).map((x) => x.id),
    template: d.template === null ? "not_supplied" as const : "supplied_not_applied" as const,
  };
  return {version: boardCapitalDiscussionVersion, stage: produce ? "material" as const : "outline" as const, timeToAlign, daysBefore, outline,
    identity: checks, omissions: decisions.map((o) => ({...o, requestedBy: shownText(o.requestedBy)})), versions: [first, second].flatMap((v) => v ? [v.material] : []), gaps: current?.gaps ?? [], pending,
    pendingFigures: d.figures.flatMap((f) => f.kind === "pending" ? [{figureId: f.id, methodId: f.requiredMethodId, path: f.requiredPath, reason: shownText(f.reason)}] : []),
    materialFacts: boardMaterialFacts(d, figures), informed: d.informed.map((x) => ({...x})), priorVersionsKept: true as const, sentToThirdParties: false as const, presented: false as const};
}
