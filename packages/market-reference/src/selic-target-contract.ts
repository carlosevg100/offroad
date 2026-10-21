import {createHash} from "node:crypto";
import {nextCivilDate} from "./market-availability";
import {seriesContractSha256} from "./market-canonical-v2";

/** The closed contract of the first public series of M2 (ADR 0023): the Selic target set by the
 * Copom, SGS 432, and the Copom communiqués that evidence each value. The database builds the URL
 * from this contract; nothing here accepts a free URL. Every redirect and the final URL are checked
 * against it, so a redirect to another series on the same host (12 or 4389, the CDI) is refused. */
export const selicTargetContractVersion = "2026.10.21-v1";

/** The Copom rule this contract homologates starts with Resolução BCB 61, published and in force on
 * 14/01/2021. Earlier periods are outside M2. */
export const selicTargetHomologatedFrom = "2021-01-14";

export const selicTargetSeries = {
  id: "bcb-sgs-432", source: "bcb", sgs: 432,
  host: "api.bcb.gov.br", path: "/dados/serie/bcdata.sgs.432/dados",
  unit: "percent_per_year", scale: "1", convention: "meta_copom",
  parser: "bcb-sgs-daily-json.v1", licenseEvidence: "bcb-catalog-meta-selic-432",
  identity: {source: "bcb", family: "sgs", kind: "series", category: "observed", keys: {code: "432"}},
  /** The API refuses a daily-series window longer than ten years (note in the catalogue since 26/03/2025). */
  maxWindowYears: 10,
} as const;

export const copomCommuniques = {
  id: "bcb-copom-comunicados", source: "bcb", host: "www.bcb.gov.br",
  listPath: "/api/servico/sitebcb/copom/comunicados", detailPath: "/api/servico/sitebcb/copom/comunicados_detalhes",
  parser: "bcb-copom-communique-json.v1", licenseEvidence: "bcb-catalog-atas-comunicados-copom",
  reproductionEvidence: "bcb-site-termos-de-uso", maxListSize: 100,
} as const;

export class MarketContractError extends Error {
  constructor(readonly code: string) {super(code);}
}
const fail = (code: string): never => {throw new MarketContractError(code);};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d: string) => isoDate.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
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

function exactQuery(url: URL, expected: Record<string, string>) {
  const keys = [...url.searchParams.keys()];
  if (keys.length !== Object.keys(expected).length || new Set(keys).size !== keys.length) return false;
  return Object.entries(expected).every(([k, v]) => url.searchParams.get(k) === v);
}

function parsed(raw: string): URL {
  let url: URL;
  try {url = new URL(raw);} catch {return fail("market_url_invalid");}
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) fail("market_url_not_allowed");
  return url;
}

/** Whether a URL (the first, a redirect or the final one) is exactly the series URL for the window. */
export function checkSelicTargetUrl(raw: string, window: {start: string; end: string}): true {
  checkSelicWindow(window);
  const url = parsed(raw);
  if (url.hostname !== selicTargetSeries.host) fail("market_url_host");
  if (url.pathname !== selicTargetSeries.path) fail("market_url_series");
  if (!exactQuery(url, {formato: "json", dataInicial: brDate(window.start), dataFinal: brDate(window.end)})) fail("market_url_parameters");
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
  checkCommuniqueRequest(request);
  const url = parsed(raw);
  if (url.hostname !== copomCommuniques.host) fail("market_url_host");
  if (url.pathname !== (request.kind === "list" ? copomCommuniques.listPath : copomCommuniques.detailPath)) fail("market_url_endpoint");
  const ok = request.kind === "list" ? exactQuery(url, {quantidade: String(request.size)}) : exactQuery(url, {nro_reuniao: String(request.meeting)});
  if (!ok) fail("market_url_parameters");
  return true;
}

/** One daily observation of SGS 432: the calendar day and the target in percent per year. */
export type SelicTargetObservation = {period: string; value: string};

const sgsValue = /^\d{1,3}\.\d{2}$/;

/** Parses the SGS JSON exactly. A structural failure is a failure of the attempt (`parse_failed`),
 * never a version: anything but an array of {data, valor}, an empty answer, a malformed date or
 * value, a repeated or unordered day, or a day outside the requested window. A missing calendar day
 * is not structural; quality reports it. */
export function parseSelicTarget(bytes: Uint8Array, window: {start: string; end: string}): SelicTargetObservation[] {
  checkSelicWindow(window);
  let body: unknown;
  try {body = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));} catch {return fail("market_parse_not_json");}
  if (!Array.isArray(body)) fail("market_parse_not_array");
  const rows = body as unknown[];
  if (rows.length === 0) fail("market_parse_empty");
  const out: SelicTargetObservation[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) fail("market_parse_row");
    const r = row as Record<string, unknown>;
    if (Object.keys(r).length !== 2 || typeof r.data !== "string" || typeof r.valor !== "string") fail("market_parse_row");
    const period = fromBrDate(r.data as string);
    if (period === null || !realDate(period)) fail("market_parse_date");
    if (!sgsValue.test(r.valor as string)) fail("market_parse_value");
    if (period! < window.start || period! > window.end) fail("market_parse_outside_window");
    const prior = out.at(-1);
    if (prior && period! <= prior.period) fail(period === prior.period ? "market_parse_duplicate_period" : "market_parse_unordered");
    out.push({period: period!, value: r.valor as string});
  }
  return out;
}

export type CopomDecision = "raise" | "cut" | "hold";

/** A Copom communiqué as evidence of one value of the target. `referenceDate` is the date the API
 * gives (the last day of the meeting, date precision, no time). `seriesChangeDate` is the day SGS
 * 432 records the new value: the calendar day after the meeting, checked against every change since
 * 14/01/2021 (31 of 31, including meetings on the eve of Corpus Christi 2022 and 2025 and of
 * Finados 2023). `regulatoryEffectiveFrom` is the start of the target's period of validity under
 * Resolução BCB 61 (business day after the meeting); it is informative and quality never tests it. */
export type CopomCommunique = {
  meeting: number; referenceDate: string; decision: CopomDecision; targetPct: string;
  recordSha256: string; seriesChangeDate: string;
};

const titleValue = /(\d{1,2},\d{2})\s*%\s*a\.a\./g;
const titleVerb: Record<string, CopomDecision> = {eleva: "raise", reduz: "cut", "mantém": "hold"};

/** Text of the communiqué for the value check: tags removed, numeric and basic named entities
 * decoded, whitespace collapsed. */
export function communiquePlainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ")
    .replace(/&#(\d{1,7});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

/** The fingerprint of a communiqué record, over the four fields exactly as received, each free text
 * prefixed by its length in UTF-8 bytes so no field can bleed into another. */
export function communiqueRecordSha256(record: {nro_reuniao: number; dataReferencia: string; titulo: string; textoComunicado: string}): string {
  const text = ["copom-communique-record.v1", `meeting:${record.nro_reuniao}`, `reference:${record.dataReferencia}`,
    `title:${Buffer.byteLength(record.titulo, "utf8")}:${record.titulo}`, `text:${Buffer.byteLength(record.textoComunicado, "utf8")}:${record.textoComunicado}`].join("\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Parses a detail response exactly: one record, the four documented fields and nothing else, the
 * requested meeting, a real reference date, a title with one decision verb and one rate, and a text
 * that states the same rate. The title is the value; the text only confirms it. */
export function parseCommuniqueDetail(bytes: Uint8Array, meeting: number): CopomCommunique {
  checkCommuniqueRequest({kind: "detail", meeting});
  let body: unknown;
  try {body = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));} catch {return fail("market_parse_not_json");}
  const b = body as {conteudo?: unknown};
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 1 || !Array.isArray(b.conteudo) || b.conteudo.length !== 1) fail("market_parse_communique_shape");
  const r = (b.conteudo as Record<string, unknown>[])[0]!;
  const keys = Object.keys(r).sort().join(",");
  if (keys !== "dataReferencia,nro_reuniao,textoComunicado,titulo") fail("market_parse_communique_fields");
  if (r.nro_reuniao !== meeting) fail("market_parse_communique_meeting");
  if (typeof r.dataReferencia !== "string" || !realDate(r.dataReferencia)) fail("market_parse_communique_date");
  if (typeof r.titulo !== "string" || typeof r.textoComunicado !== "string") fail("market_parse_communique_fields");
  const title = r.titulo as string, values = [...title.matchAll(titleValue)].map((m) => m[1]!);
  const verbs = [...title.matchAll(/Copom (eleva|reduz|mantém)/g)].map((m) => m[1]!);
  if (values.length !== 1 || verbs.length !== 1) fail("market_parse_communique_title");
  const pct = values[0]!;
  const stated = [...communiquePlainText(r.textoComunicado as string).matchAll(titleValue)].map((m) => m[1]);
  if (!stated.includes(pct)) fail("market_parse_communique_text");
  const record = r as {nro_reuniao: number; dataReferencia: string; titulo: string; textoComunicado: string};
  return {
    meeting, referenceDate: record.dataReferencia, decision: titleVerb[verbs[0]!]!, targetPct: pct.replace(",", "."),
    recordSha256: communiqueRecordSha256(record), seriesChangeDate: nextCivilDate(record.dataReferencia),
  };
}

/** Parses a list response: up to the requested size, each with meeting, reference date and title,
 * meetings strictly decreasing. The list only discovers meetings; the value comes from the detail. */
export function parseCommuniqueList(bytes: Uint8Array, size: number): {meeting: number; referenceDate: string; title: string}[] {
  checkCommuniqueRequest({kind: "list", size});
  let body: unknown;
  try {body = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));} catch {return fail("market_parse_not_json");}
  const b = body as {conteudo?: unknown};
  if (typeof body !== "object" || body === null || Object.keys(body).length !== 1 || !Array.isArray(b.conteudo)) fail("market_parse_communique_shape");
  const rows = b.conteudo as Record<string, unknown>[];
  if (rows.length === 0 || rows.length > size) fail("market_parse_communique_list_size");
  const out: {meeting: number; referenceDate: string; title: string}[] = [];
  for (const r of rows) {
    if (typeof r !== "object" || r === null || Object.keys(r).sort().join(",") !== "dataReferencia,nro_reuniao,titulo") fail("market_parse_communique_fields");
    if (!Number.isInteger(r.nro_reuniao) || typeof r.dataReferencia !== "string" || !realDate(r.dataReferencia) || typeof r.titulo !== "string") fail("market_parse_communique_fields");
    const prior = out.at(-1);
    if (prior && (r.nro_reuniao as number) >= prior.meeting) fail("market_parse_communique_order");
    out.push({meeting: r.nro_reuniao as number, referenceDate: r.dataReferencia as string, title: r.titulo as string});
  }
  return out;
}

/** The fingerprint of the SGS 432 contract that every M2 version names in its canonical text. */
export function selicTargetContractSha256(): string {
  return seriesContractSha256({...selicTargetSeries, homologatedFrom: selicTargetHomologatedFrom});
}
