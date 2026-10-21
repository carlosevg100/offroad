import {createHash} from "node:crypto";
import {brazilianNationalHolidays, businessDayCalendarVersion} from "@offroad/financial-core";
import {nextCivilDate} from "./market-availability";
import {seriesContractSha256} from "./market-canonical-v2";
import {isJsonObject, strictJsonParse, StrictJsonError, type JsonValue} from "./strict-json";

/** The closed contract of the first public series of M2 (ADR 0023): the Selic target set by the
 * Copom, SGS 432, and the Copom communiqués that evidence each value. The database builds the URL
 * from this contract; nothing here accepts a free URL. The first URL, every redirect and the final
 * URL must be byte-equal to the URL the contract builds: no equivalent spelling (default port, empty
 * fragment, percent-encoding, dot segments, letter case) is accepted, so a redirect to another series
 * on the same host (12 or 4389, the CDI) or a disguised path never passes. */
export const selicTargetContractVersion = "2026.10.21-v2";

/** The Copom rule this contract homologates starts with Resolução BCB 61, published and in force on
 * 14/01/2021. Earlier periods are outside M2. */
export const selicTargetHomologatedFrom = "2021-01-14";

/** The business-day calendar the contract names: national banking holidays of financial-core. It
 * dates the regulatory start of each target (informative) and the freshness deadline; quality never
 * uses it, because the series changes on the calendar day after the meeting. */
export const selicTargetCalendar = {id: "financial-core.brazilian-national-holidays", version: businessDayCalendarVersion} as const;

export const selicTargetSeries = {
  id: "bcb-sgs-432", source: "bcb", sgs: 432,
  host: "api.bcb.gov.br", path: "/dados/serie/bcdata.sgs.432/dados",
  unit: "percent_per_year", scale: "1", convention: "meta_copom",
  parser: "bcb-sgs-daily-json.v2", licenseEvidence: "bcb-catalog-meta-selic-432",
  identity: {source: "bcb", family: "sgs", kind: "series", category: "observed", keys: {code: "432"}},
  /** The API refuses a daily-series window longer than ten years (note in the catalogue since 26/03/2025). */
  maxWindowYears: 10,
} as const;

export const copomCommuniques = {
  id: "bcb-copom-comunicados", source: "bcb", host: "www.bcb.gov.br",
  listPath: "/api/servico/sitebcb/copom/comunicados", detailPath: "/api/servico/sitebcb/copom/comunicados_detalhes",
  parser: "bcb-copom-communique-json.v2", licenseEvidence: "bcb-catalog-atas-comunicados-copom",
  reproductionEvidence: "bcb-site-termos-de-uso", maxListSize: 100,
} as const;

export class MarketContractError extends Error {
  constructor(readonly code: string) {super(code);}
}
const fail = (code: string): never => {throw new MarketContractError(code);};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d: string) => isoDate.test(d) && d >= "1900-01-01" && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const brDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const fromBrDate = (d: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : null;

/** A requested window: inclusive, inside the homologated period and at most ten years long. */
export function checkSelicWindow(window: {start: string; end: string}) {
  if (!realDate(window.start) || !realDate(window.end)) fail("market_window_date_invalid");
  if (window.end < window.start) fail("market_window_reversed");
  if (window.start < selicTargetHomologatedFrom) fail("market_window_before_homologation");
  const limit = `${Number(window.start.slice(0, 4)) + selicTargetSeries.maxWindowYears}${window.start.slice(4)}`;
  if (window.end >= limit) fail("market_window_too_long");
  return window;
}

/** The only URL the series may be fetched from for a window. */
export function selicTargetUrl(window: {start: string; end: string}): string {
  checkSelicWindow(window);
  return `https://${selicTargetSeries.host}${selicTargetSeries.path}?formato=json&dataInicial=${brDate(window.start)}&dataFinal=${brDate(window.end)}`;
}

/** Explains why a URL differs from the expected one; any difference is a refusal. */
function refuse(raw: string, expected: string, endpointPath: string): never {
  try {new URL(raw);} catch {return fail("market_url_invalid");}
  const host = new URL(expected).host;
  if (!/^https:\/\/[a-z0-9.-]+\//.test(raw) || raw.includes("#")) fail("market_url_not_allowed");
  if (!raw.startsWith(`https://${host}/`)) fail("market_url_host");
  if (!raw.startsWith(`https://${host}${endpointPath}?`)) fail("market_url_endpoint");
  return fail("market_url_parameters");
}

/** Whether a URL (the first, a redirect or the final one) is exactly the series URL for the window. */
export function checkSelicTargetUrl(raw: string, window: {start: string; end: string}): true {
  const expected = selicTargetUrl(window);
  if (raw !== expected) refuse(raw, expected, selicTargetSeries.path);
  return true;
}

export type CommuniqueRequest = {kind: "list"; size: number} | {kind: "detail"; meeting: number};

function checkCommuniqueRequest(request: CommuniqueRequest) {
  if (request.kind === "list" && !(Number.isInteger(request.size) && request.size >= 1 && request.size <= copomCommuniques.maxListSize)) fail("market_communique_list_size");
  if (request.kind === "detail" && !(Number.isInteger(request.meeting) && request.meeting >= 1 && request.meeting <= 9999)) fail("market_communique_meeting");
  return request;
}

export function communiqueUrl(request: CommuniqueRequest): string {
  checkCommuniqueRequest(request);
  return request.kind === "list"
    ? `https://${copomCommuniques.host}${copomCommuniques.listPath}?quantidade=${request.size}`
    : `https://${copomCommuniques.host}${copomCommuniques.detailPath}?nro_reuniao=${request.meeting}`;
}

export function checkCommuniqueUrl(raw: string, request: CommuniqueRequest): true {
  const expected = communiqueUrl(request);
  if (raw !== expected) refuse(raw, expected, request.kind === "list" ? copomCommuniques.listPath : copomCommuniques.detailPath);
  return true;
}

function readJson(bytes: Uint8Array): JsonValue {
  try {return strictJsonParse(bytes);} catch (e) {
    return fail(e instanceof StrictJsonError ? `market_parse_${e.code}` : "market_parse_json_syntax");
  }
}

/** One daily observation of SGS 432: the calendar day and the target in percent per year, in the
 * form the source wrote (two decimals, no leading zero). */
export type SelicTargetObservation = {period: string; value: string};

const sgsValue = /^(?:0|[1-9]\d{0,2})\.\d{2}$/;

/** Parses the SGS JSON exactly. A structural failure is a failure of the attempt (`parse_failed`),
 * never a version: anything but an array of {data, valor} with text values, an empty answer, a
 * malformed date or value, a repeated or unordered day, or a day outside the requested window. A
 * missing calendar day is not structural; quality reports it. */
export function parseSelicTarget(bytes: Uint8Array, window: {start: string; end: string}): SelicTargetObservation[] {
  checkSelicWindow(window);
  const body = readJson(bytes);
  if (!Array.isArray(body)) return fail("market_parse_not_array");
  if (body.length === 0) fail("market_parse_empty");
  const out: SelicTargetObservation[] = [];
  for (const r of body) {
    if (!isJsonObject(r) || Object.keys(r).length !== 2 || typeof r.data !== "string" || typeof r.valor !== "string") return fail("market_parse_row");
    const period = fromBrDate(r.data);
    if (period === null || !realDate(period)) return fail("market_parse_date");
    if (!sgsValue.test(r.valor)) fail("market_parse_value");
    if (period < window.start || period > window.end) fail("market_parse_outside_window");
    const prior = out.at(-1);
    if (prior && period <= prior.period) fail(period === prior.period ? "market_parse_duplicate_period" : "market_parse_unordered");
    out.push({period, value: r.valor});
  }
  return out;
}

export type CopomDecision = "raise" | "cut" | "hold";

/** A Copom communiqué as evidence of one value of the target. `referenceDate` is the date the API
 * gives (the last day of the meeting, date precision, no time). `seriesChangeDate` is the day SGS
 * 432 records the new value: the calendar day after the meeting, checked against every change since
 * 14/01/2021 (31 of 31, including meetings on the eve of Corpus Christi 2022 and 2025 and of
 * Finados 2023). `regulatoryEffectiveFrom` is the start of the target's validity under Resolução BCB
 * 61 (business day after the meeting, on the contract's calendar); it is informative and quality
 * never tests it. */
export type CopomCommunique = {
  meeting: number; referenceDate: string; decision: CopomDecision; targetPct: string;
  recordSha256: string; seriesChangeDate: string; regulatoryEffectiveFrom: string;
};

/** A rate token: one or two integer digits not preceded by a digit, comma, point or sign, and the
 * percent-per-year suffix. `112,25% a.a.` and `-13,75% a.a.` have no token. */
const rateToken = /(?<![\d,.+\-\u2212])(\d{1,2},\d{2})\s*%\s*a\.a\./g;
const titleVerb: Record<string, CopomDecision> = {eleva: "raise", reduz: "cut", "mantém": "hold"};
/** The confirming clause of the communiqué text: a closed grammar built from the wordings used since
 * 2021, matched exactly on the plain text. "decidiu[, por unanimidade,] (elevar|reduzir|manter) a taxa
 * (Selic|básica de juros)[ em N,NN ponto(s) percentual(is),] (para|em) X% a.a.", or the same after a
 * gerund that follows a comma (", elevando" / ", reduzindo"). A hold says "em" with no step; a raise
 * or cut says "para". Each of the 47 communiqués from meeting 235 to 281 has at least one. */
const confirmingClause = /(?:(?<![\p{L}\p{N}])(?<!não )decidiu(?:, por unanimidade,)? (elevar|reduzir|manter)|, (elevando|reduzindo)) a taxa (?:Selic|básica de juros)( em \d,\d{2} pontos? percentua(?:l|is),)? (para|em) (\d{1,2},\d{2})% a\.a\./gu;
const clauseVerb: Record<string, CopomDecision> = {elevar: "raise", elevando: "raise", reduzir: "cut", reduzindo: "cut", manter: "hold"};

/** Replaces every `<...>` with a space in one linear pass; an unclosed `<` stays as text. */
function stripTags(html: string): string {
  let out = "", i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    if (open < 0) {out += html.slice(i); break;}
    const close = html.indexOf(">", open + 1);
    if (close < 0) {out += html.slice(i); break;}
    out += `${html.slice(i, open)} `;
    i = close + 1;
  }
  return out;
}

/** Text of the communiqué for the value check: tags removed, numeric and basic named entities
 * decoded, whitespace collapsed. */
export function communiquePlainText(html: string): string {
  return stripTags(html)
    .replace(/&#(\d{1,7});/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&")
    .replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

/** The fingerprint of a communiqué record, over the four fields exactly as received, each free text
 * prefixed by its length in UTF-8 bytes so no field can bleed into another. The strict reader has
 * already refused NUL and lone surrogates, so every accepted string has one UTF-8 form. */
export function communiqueRecordSha256(record: {nro_reuniao: number; dataReferencia: string; titulo: string; textoComunicado: string}): string {
  const text = ["copom-communique-record.v1", `meeting:${record.nro_reuniao}`, `reference:${record.dataReferencia}`,
    `title:${Buffer.byteLength(record.titulo, "utf8")}:${record.titulo}`, `text:${Buffer.byteLength(record.textoComunicado, "utf8")}:${record.textoComunicado}`].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The business day after a date on the contract's calendar. */
export function nextBusinessDay(date: string): string {
  let d = nextCivilDate(date);
  for (;;) {
    const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !brazilianNationalHolidays(Number(d.slice(0, 4))).includes(d)) return d;
    d = nextCivilDate(d);
  }
}

/** Parses a detail response exactly: one record, the four documented fields and nothing else, the
 * requested meeting, a real reference date, a title with one decision verb and one rate token, and a
 * text with at least one confirming clause that states the title's direction and rate.
 *
 * Trust model: the value is the SGS series; the title is an independent structured corroboration
 * that quality compares with the series; the text is archived evidence, fingerprinted, that must
 * confirm the title in one exact clause. The rest of the text is free prose (scenarios, earlier
 * decisions, risks) and is not interpreted: no regular expression reads natural language safely, and
 * a text that disagrees with a title and a series that agree does not make the series wrong. */
export function parseCommuniqueDetail(bytes: Uint8Array, meeting: number): CopomCommunique {
  checkCommuniqueRequest({kind: "detail", meeting});
  const body = readJson(bytes);
  if (!isJsonObject(body) || Object.keys(body).length !== 1 || !Array.isArray(body.conteudo) || body.conteudo.length !== 1) return fail("market_parse_communique_shape");
  const r = body.conteudo[0];
  if (!isJsonObject(r) || Object.keys(r).sort().join(",") !== "dataReferencia,nro_reuniao,textoComunicado,titulo") return fail("market_parse_communique_fields");
  if (r.nro_reuniao !== meeting) fail("market_parse_communique_meeting");
  if (typeof r.dataReferencia !== "string" || !realDate(r.dataReferencia)) return fail("market_parse_communique_date");
  if (typeof r.titulo !== "string" || typeof r.textoComunicado !== "string") return fail("market_parse_communique_fields");
  const record = {nro_reuniao: meeting, dataReferencia: r.dataReferencia, titulo: r.titulo, textoComunicado: r.textoComunicado};
  const values = [...record.titulo.matchAll(rateToken)].map((m) => m[1]!);
  const verbs = [...record.titulo.matchAll(/Copom (eleva|reduz|mantém)(?![\p{L}])/gu)].map((m) => m[1]!);
  if (values.length !== 1 || verbs.length !== 1) fail("market_parse_communique_title");
  const pct = values[0]!, decision = titleVerb[verbs[0]!]!, plain = communiquePlainText(record.textoComunicado);
  const confirmed = [...plain.matchAll(confirmingClause)].some((c) =>
    clauseVerb[c[1] ?? c[2]!] === decision && c[5] === pct && (decision === "hold") === (c[4] === "em") && (decision !== "hold" || c[3] === undefined));
  if (!confirmed) fail("market_parse_communique_text");
  return {
    meeting, referenceDate: record.dataReferencia, decision, targetPct: pct.replace(",", "."),
    recordSha256: communiqueRecordSha256(record), seriesChangeDate: nextCivilDate(record.dataReferencia),
    regulatoryEffectiveFrom: nextBusinessDay(record.dataReferencia),
  };
}

/** Parses a list response: up to the requested size, each with meeting, reference date and title,
 * meetings strictly decreasing. The list only discovers meetings; the value comes from the detail. */
export function parseCommuniqueList(bytes: Uint8Array, size: number): {meeting: number; referenceDate: string; title: string}[] {
  checkCommuniqueRequest({kind: "list", size});
  const body = readJson(bytes);
  if (!isJsonObject(body) || Object.keys(body).length !== 1 || !Array.isArray(body.conteudo)) return fail("market_parse_communique_shape");
  const rows = body.conteudo;
  if (rows.length === 0 || rows.length > size) fail("market_parse_communique_list_size");
  const out: {meeting: number; referenceDate: string; title: string}[] = [];
  for (const r of rows) {
    if (!isJsonObject(r) || Object.keys(r).sort().join(",") !== "dataReferencia,nro_reuniao,titulo") return fail("market_parse_communique_fields");
    if (typeof r.nro_reuniao !== "number" || !Number.isInteger(r.nro_reuniao) || typeof r.dataReferencia !== "string" || !realDate(r.dataReferencia) || typeof r.titulo !== "string") return fail("market_parse_communique_fields");
    const prior = out.at(-1);
    if (prior && r.nro_reuniao >= prior.meeting) fail("market_parse_communique_order");
    out.push({meeting: r.nro_reuniao, referenceDate: r.dataReferencia, title: r.titulo});
  }
  return out;
}

/** The fingerprint of the SGS 432 contract that every M2 version names in its canonical text. */
export function selicTargetContractSha256(): string {
  return seriesContractSha256({...selicTargetSeries, homologatedFrom: selicTargetHomologatedFrom, calendar: `${selicTargetCalendar.id}@${selicTargetCalendar.version}`});
}
