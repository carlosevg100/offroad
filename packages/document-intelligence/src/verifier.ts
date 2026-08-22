import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {resolveFieldPath, type AnchorPrecision} from "@offroad/credit-ontology";
import {lookupAnchor, type LayerIndex} from "./layer-index";
import type {DocumentLayer, DocumentProfile, RawExtractionCandidate, VerifiedCandidate, VerifierFlag} from "./schemas";
import {containsNormalized, digitSequence, normalizeText, parseBoolean, parseDate, parseList, parseNumber} from "./text";

export type VerificationContext = {
  index: LayerIndex;
  layer: Pick<DocumentLayer, "scaleDeclarations">;
  profile: Pick<DocumentProfile, "documentId" | "entityName" | "periodStart" | "periodEnd" | "scale">;
  documentVersion: number;
  localeHint?: "pt-BR" | "en-US";
};

export type RejectedCandidate = {candidate: RawExtractionCandidate; reason: "field_unknown"};

export type VerificationReport = {
  verified: VerifiedCandidate[];
  rejected: RejectedCandidate[];
};

/** Flags that make an anchor unverifiable (auto-accept impossible). */
export const fatalVerifierFlags: ReadonlySet<VerifierFlag> = new Set([
  "anchor_missing",
  "quote_not_in_anchor",
  "value_not_in_quote",
  "digits_not_in_anchor",
  "value_unparseable",
  "field_unknown",
]);

export function computeExtractorKey(input: {fieldPath: string; sourceDocumentId: string; documentVersion: number; anchorId: string; valueRaw: string}): string {
  return createHash("sha256")
    .update([input.fieldPath, input.sourceDocumentId, String(input.documentVersion), input.anchorId, normalizeText(input.valueRaw)].join("|"))
    .digest("hex");
}

/**
 * Verifies model output against the document layer (P1 plan §7.2). Never
 * mutates the candidate's meaning: it only records what could and could not be
 * confirmed and computes the normalized value deterministically.
 */
export function verifyCandidates(candidates: RawExtractionCandidate[], context: VerificationContext): VerificationReport {
  const verified: VerifiedCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  for (const candidate of candidates) {
    const outcome = verifyCandidate(candidate, context);
    if (outcome.kind === "rejected") rejected.push({candidate, reason: outcome.reason});
    else verified.push(outcome.value);
  }
  return {verified: dedupeCandidates(verified), rejected};
}

export function verifyCandidate(
  candidate: RawExtractionCandidate,
  context: VerificationContext,
): {kind: "verified"; value: VerifiedCandidate} | {kind: "rejected"; reason: "field_unknown"} {
  const normalizedPath = normalizePeriodTokens(candidate.field_path);
  const field = resolveFieldPath(normalizedPath);
  if (!field) return {kind: "rejected", reason: "field_unknown"};

  const flags = new Set<VerifierFlag>();
  const anchor = lookupAnchor(context.index, candidate.anchor.id);
  let precision: AnchorPrecision = anchor?.precision ?? "document";
  if (!anchor) {
    flags.add("anchor_missing");
    precision = candidate.anchor.kind === "page" ? "page" : "document";
  } else {
    // The evidence prints every line as "[id] text"; a model that copies the line verbatim has
    // quoted faithfully, and the id is not part of what the cell says. Nimbus's management
    // sheet measured it: six balance-sheet cells rejected for a bracketed prefix.
    const quote = candidate.quote.replace(/^\s*\[[^\]]+\]\s*/, "");
    if (!containsNormalized(anchor.text, quote)) {
      // A cell is one number; the row is where its meaning lives. Citing `p3.t1.r2.c3` while
      // quoting "Receita líquida | 142,6 | 164,3 | 184,7" is precise, honest behaviour, the
      // anchor names the exact cell, the quote shows the reader the whole line, and it was
      // being flagged as an invented trace. The quote may live in the enclosing row; the
      // digits check below still holds the value against the cell itself.
      const rowId = /\.r\d+\.c\d+$/.test(candidate.anchor.id) ? candidate.anchor.id.replace(/\.c\d+$/, "") : null;
      const row = rowId ? lookupAnchor(context.index, rowId) : undefined;
      if (!row || !containsNormalized(row.text, quote)) flags.add("quote_not_in_anchor");
    }
    if (!containsNormalized(candidate.quote, candidate.value_raw)) flags.add("value_not_in_quote");
    if (candidate.value_type === "number") {
      const digits = digitSequence(candidate.value_raw);
      if (digits.length > 0 && !digitSequence(anchor.text).includes(digits)) flags.add("digits_not_in_anchor");
    }
  }

  const expectedType = field.definition.valueType;
  if (expectedType !== candidate.value_type) flags.add("value_type_mismatch");

  let normalizedValue = candidate.value_raw.trim();
  if (expectedType === "text" && /\.lender$/.test(normalizedPath)) normalizedValue = canonicalIssuanceName(normalizedValue);
  let effectiveScale = candidate.scale;
  if (expectedType === "number") {
    const parsed = parseNumber(candidate.value_raw, context.localeHint ?? "pt-BR");
    if (!parsed) {
      flags.add("value_unparseable");
    } else if (field.definition.unit === "percent") {
      // A percentage is stored as the fraction the desk computes with: "12,5%" is 0.125, and so
      // is a cell that already reads 0.125. Nimbus measured the alternative: retention came back
      // as 115 beside a customer share that came back as 0.0476, two conventions for one unit.
      // The sign the document prints is the sign of the fact; only the magnitude is rescaled.
      effectiveScale = 1;
      const printedAsPercent = parsed.isPercent || /%/.test(candidate.value_raw) || parsed.value.abs().gt("1.5");
      normalizedValue = (printedAsPercent ? parsed.value.div(100) : parsed.value).toDecimalPlaces(8).toFixed();
    } else if (field.definition.unit !== "money") {
      // ratios, counts, months… are stored at displayed magnitude and never scaled
      effectiveScale = 1;
      normalizedValue = parsed.value.toDecimalPlaces(8).toFixed();
    } else {
      if (parsed.detectedScale && candidate.scale !== 1 && parsed.detectedScale !== candidate.scale) flags.add("scale_conflict");
      effectiveScale = candidate.scale !== 1 ? candidate.scale : (parsed.detectedScale ?? 1);
      // Money is stored at cent precision. Anything past two decimals in a currency amount is
      // an artifact of parsing or of the model's own arithmetic, never information, and it is
      // exactly the kind of noise that makes 53760000 fail to equal 53760000.00000001.
      normalizedValue = outflowMagnitude(field.definition.pattern, parsed.value.times(effectiveScale)).toDecimalPlaces(2).toFixed();
      // a scale other than 1 must be declared somewhere we can see (document/table header or profile)
      const declaredInText = parsed.detectedScale === effectiveScale;
      const declared = declaredInText || context.layer.scaleDeclarations.some((d) => d.scale === effectiveScale) || context.profile.scale === effectiveScale;
      if (effectiveScale !== 1 && !declared) flags.add("scale_unverified");
      if (context.profile.scale && candidate.scale !== 1 && context.profile.scale !== candidate.scale) flags.add("scale_conflict");
    }
  } else if (expectedType === "date") {
    const iso = parseDate(candidate.value_raw);
    if (!iso) flags.add("value_unparseable");
    else normalizedValue = iso;
  } else if (expectedType === "boolean") {
    const bool = parseBoolean(candidate.value_raw);
    if (bool === null) flags.add("value_unparseable");
    else normalizedValue = bool ? "true" : "false";
  } else if (expectedType === "list") {
    normalizedValue = JSON.stringify(parseList(candidate.value_raw));
  } else if (field.definition.canonical) {
    // The ontology, not the model, decides the canonical form of these values. "12.345.678/0001-95"
    // and "12345678000195" are one CNPJ; "Fontes", "FONTES" and "origens" are one side of a
    // sources & uses table; "São Paulo, SP" is the UF. A value that reduces to nothing is a
    // value the field cannot hold, and it says so instead of passing as prose.
    const canonical = canonicalizeText(candidate.value_raw, field.definition.canonical);
    if (canonical === null) flags.add("value_unparseable");
    else normalizedValue = canonical;
  }

  if (candidate.period && context.profile.periodEnd && candidate.period.end > context.profile.periodEnd && field.definition.group !== "projections") {
    flags.add("period_outside_document");
  }
  if (candidate.entity && context.profile.entityName && !entitiesCompatible(candidate.entity.name, context.profile.entityName)) {
    flags.add("entity_mismatch");
  }

  const anchorVerified = ![...flags].some((flag) => fatalVerifierFlags.has(flag));
  const fieldPath = canonicalPeriodPath(normalizedPath, plausiblePeriod(candidate.period));
  const value: VerifiedCandidate = {
    ...candidate,
    field_path: fieldPath,
    scale: effectiveScale,
    extractor_key: computeExtractorKey({
      fieldPath,
      sourceDocumentId: context.profile.documentId,
      documentVersion: context.documentVersion,
      anchorId: candidate.anchor.id,
      valueRaw: candidate.value_raw,
    }),
    source_document_id: context.profile.documentId,
    document_version: context.documentVersion,
    field_group: field.definition.group,
    materiality: field.definition.materiality,
    anchor_verified: anchorVerified,
    anchor_precision: precision,
    verifier_flags: [...flags],
    normalized_value: normalizedValue,
    additional_anchors: [],
  };
  return {kind: "verified", value};
}

/** Applies an ontology-declared canonical form to a text value. Returns null when the value cannot hold it. */
/** Balance-sheet metrics: a point in time, never a window. */
const STOCK_METRICS = new Set(["cash", "receivables", "inventory", "payables", "gross_debt", "net_debt", "equity", "total_assets", "working_capital", "arr", "mrr"]);

const monthsBetween = (start: string, end: string): number => {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return (ey! - sy!) * 12 + (em! - sm!) + 1;
};

/**
 * The period belongs in the path, the way the ontology spells it, and the model's guess at
 * the spelling is replaced by the dates it cited.
 *
 * Camil measured this: the ITR's quarter came back as `interim_financials.2026.revenue`,
 * `interim_financials.2026_05.revenue` and `interim_financials.2026.revenue_ytd`, all with the
 * right number and the right dates (2026-03-01 to 2026-05-31), none spelled
 * `interim_financials.2026_05.revenue_3m`. A fiscal year ending in February came back under
 * the calendar year the model preferred. The dates are the fact; the spelling follows them:
 * interim periods are `YYYY_MM` of the end month with a `_Nm` window on flows, and a year is
 * the year its period ends.
 */
/**
 * Quarters and semesters as a release writes them, turned into the ontology's month and window.
 *
 * Cogna's release measured it: seventy candidates rejected as unknown fields because the model
 * wrote `interim_financials.2026_2q.revenue` and `2026_1s.revenue_ytd`, which is exactly how
 * the document labels its columns (2T26, 1S26). A quarter ends in 03/06/09/12 and spans three
 * months; a semester ends in 06/12 and spans six; `_ytd` at a month is that many months. A
 * stock keeps no window either way.
 */
export function normalizePeriodTokens(fieldPath: string): string {
  const quarterMonths = ["03", "06", "09", "12"] as const;
  // 2q, q2, 2t, t2: the release's own label, written either way round.
  const quarter = fieldPath.match(/^((?:interim|historical)_financials)\.(\d{4})_(?:([1-4])[qt]|[qt]([1-4]))\.([a-z_]+?)(_\d+m|_ytd|_ltm)?$/);
  if (quarter) {
    const [, , year, qa, qb, metric, window] = quarter as unknown as [string, string, string, string | undefined, string | undefined, string, string | undefined];
    const q = qa ?? qb!;
    // Year to date at the second quarter is six months, not three.
    const suffix = STOCK_METRICS.has(metric) ? "" : window === "_ytd" ? `_${3 * Number(q)}m` : window ?? "_3m";
    return `interim_financials.${year}_${quarterMonths[Number(q) - 1]}.${metric}${suffix}`;
  }
  const semester = fieldPath.match(/^((?:interim|historical)_financials)\.(\d{4})_(?:([12])[sh]|[sh]([12]))\.([a-z_]+?)(_\d+m|_ytd|_ltm)?$/);
  if (semester) {
    const [, , year, ha, hb, metric, window] = semester as unknown as [string, string, string, string | undefined, string | undefined, string, string | undefined];
    const half = ha ?? hb!;
    const suffix = STOCK_METRICS.has(metric) ? "" : window && window !== "_ytd" ? window : "_6m";
    return `interim_financials.${year}_${half === "1" ? "06" : "12"}.${metric}${suffix}`;
  }
  // `2026_7m.revenue_7m`: the model wrote the window where the month goes. A year-to-date
  // window of N months starts in January, so it ends in month N and the path is recoverable.
  const windowAsMonth = fieldPath.match(/^interim_financials\.(\d{4})_(\d{1,2})m\.([a-z_]+?)(?:_(\d{1,2})m|_ytd)?$/);
  if (windowAsMonth) {
    const [, year, months, metric, sameWindow] = windowAsMonth as unknown as [string, string, string, string, string | undefined];
    const n = Number(months);
    if (n >= 1 && n <= 12 && (sameWindow === undefined || Number(sameWindow) === n)) {
      const month = String(n).padStart(2, "0");
      return STOCK_METRICS.has(metric) ? `interim_financials.${year}_${month}.${metric}` : `interim_financials.${year}_${month}.${metric}_${n}m`;
    }
  }
  const ytd = fieldPath.match(/^interim_financials\.(\d{4})_(\d{2})\.([a-z_]+?)_ytd$/);
  if (ytd) {
    const [, year, month, metric] = ytd as unknown as [string, string, string, string];
    return STOCK_METRICS.has(metric) ? `interim_financials.${year}_${month}.${metric}` : `interim_financials.${year}_${month}.${metric}_${Number(month)}m`;
  }
  return fieldPath;
}

/**
 * A period the calendar admits. Camil measured the alternative: one candidate arrived with
 * 3110-05-31 and became `interim_financials.3110_05.revenue_36003m`, a path no gold and no
 * desk will ever read. Outside 1990 to 2100, or longer than ten years, the period is not
 * information; the path keeps what the model wrote in it.
 */
export function plausiblePeriod(period: {start: string; end: string} | undefined): {start: string; end: string} | undefined {
  if (!period) return undefined;
  const year = (iso: string) => Number(iso.slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period.start) || !/^\d{4}-\d{2}-\d{2}$/.test(period.end)) return undefined;
  if (year(period.start) < 1990 || year(period.end) > 2100 || period.end < period.start) return undefined;
  if (monthsBetween(period.start, period.end) > 120) return undefined;
  return period;
}

/**
 * How a desk names an issuance: "11ª emissão, 1ª série", whatever the filing prints around it.
 * The ITR writes "Emitida em 17/11/2021 – 11ª emissão - 1ª série", the proposal "11ª emissão -
 * 1ª série", the request letter "11ª emissão"; the same paper has to fold to one name or the
 * rows from three documents never merge and the gold never matches.
 */
const WRITTEN_ORDINALS: Record<string, number> = {
  primeira: 1, segunda: 2, terceira: 3, quarta: 4, quinta: 5, sexta: 6, setima: 7, oitava: 8, nona: 9,
  "decima primeira": 11, "decima segunda": 12, "decima terceira": 13, "decima quarta": 14, "decima quinta": 15,
  "decima sexta": 16, "decima setima": 17, "decima oitava": 18, "decima nona": 19, decima: 10, vigesima: 20,
};

const foldText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** "décima terceira emissão" and "13ª emissão" are the same paper; so are "segunda série" and "2ª série". */
function ordinalOf(text: string, noun: "emissao" | "serie"): number | null {
  const word = noun === "emissao" ? "emiss+ao" : "serie";
  const folded = foldText(text);
  // NFD does not decompose the ordinal indicators, so "11\u00aa" folds to "11\u00aa", not "11a".
  const digits = new RegExp(`(\\d{1,3})\\s*[a-z\u00aa\u00ba\u00b0]?\\s*${word}`).exec(folded);
  if (digits) return Number(digits[1]);
  // Longest first, or "décima terceira" matches "terceira" and the paper becomes the third issuance.
  for (const [name, value] of Object.entries(WRITTEN_ORDINALS).sort(([a], [b]) => b.length - a.length)) {
    if (new RegExp(`\\b${name}\\s+${word}`).test(folded)) return value;
  }
  return null;
}

export function canonicalIssuanceName(text: string): string {
  const issuance = ordinalOf(text, "emissao");
  if (issuance === null) return text;
  const series = ordinalOf(text, "serie");
  const single = /s[ée]rie\s+[úu]nica/i.test(text);
  const base = `${issuance}ª emissão`;
  if (series !== null) return `${base}, ${series}ª série`;
  if (single) return `${base}, série única`;
  return base;
}

export function canonicalPeriodPath(fieldPath: string, period: {start: string; end: string} | undefined): string {
  // A stock has no window: receivables at 31/07 are receivables, not "receivables over seven
  // months", whether or not the model said which period it read.
  const stock = fieldPath.match(/^(interim_financials\.\d{4}_\d{2})\.([a-z_]+?)(?:_\d+m|_ytd|_ltm)$/);
  if (stock && STOCK_METRICS.has(stock[2]!)) fieldPath = `${stock[1]}.${stock[2]}`;
  if (!period) return fieldPath;
  // Nimbus measured this: ARR at 31/07/2026 came back as `historical_financials.2026.arr`. A
  // period that is not a full year belongs to the interim group, whatever the model wrote, and
  // so does a balance at a month that is not a year-end.
  const spanMonths = period.start === period.end ? null : monthsBetween(period.start, period.end);
  const endMonth = period.end.slice(5, 7);
  const looksInterim = spanMonths !== null ? spanMonths < 12 : endMonth !== "12";
  const historicalMatch = fieldPath.match(/^historical_financials\.(\d{4})(?:_\d{2})?\.([a-z_]+?)(?:_\d+m|_ytd|_ltm)?$/);
  if (historicalMatch && looksInterim) {
    fieldPath = `interim_financials.${period.end.slice(0, 4)}.${historicalMatch[2]}`;
  }
  const interim = fieldPath.match(/^interim_financials\.(\d{4})(?:_(\d{2}))?\.([a-z_]+?)(?:_\d+m|_ytd|_ltm)?$/);
  if (interim) {
    const metric = interim[3]!;
    const [endYear, endMonth] = period.end.split("-");
    const window = STOCK_METRICS.has(metric) ? "" : `_${monthsBetween(period.start, period.end)}m`;
    return `interim_financials.${endYear}_${endMonth}.${metric}${window}`;
  }
  const annual = fieldPath.match(/^(historical_financials|projections)\.(\d{4})(?:_\d{2})?\.(.+)$/);
  if (annual) {
    const endYear = period.end.slice(0, 4);
    return `${annual[1]}.${endYear}.${annual[3]}`;
  }
  return fieldPath;
}

/**
 * Costs, capex, taxes, depreciation and burn are magnitudes in the ontology. Statements print
 * them with a minus sign because the column is a subtraction; a model that copies the sign has
 * read the page faithfully and produced a number the desk cannot use. The sign is the table's,
 * the magnitude is the fact's.
 */
const OUTFLOW_METRICS = /\.(cogs|financial_expenses|capex|taxes|d_and_a|monthly_burn)(\{ytd\})?$/;
export function outflowMagnitude(fieldPattern: string, value: Decimal): Decimal {
  return OUTFLOW_METRICS.test(fieldPattern) ? value.abs() : value;
}

export function canonicalizeText(raw: string, canonical: NonNullable<ReturnType<typeof resolveFieldPath>>["definition"]["canonical"]): string | null {
  if (!canonical) return raw.trim();
  if (canonical.kind === "digits") {
    const digits = raw.replace(/\D+/g, "");
    return digits.length > 0 ? digits : null;
  }
  const normalized = normalizeText(raw);
  for (const value of canonical.values) {
    if (normalized === normalizeText(value)) return value;
  }
  // Longest synonym first, so "mato grosso do sul" wins over "mato grosso" inside prose.
  const synonyms = Object.entries(canonical.synonyms).sort((a, b) => b[0].length - a[0].length);
  for (const [synonym, value] of synonyms) {
    if (normalized === synonym || normalized.includes(synonym)) return value;
  }
  // A bare canonical value embedded in prose ("São Paulo, SP") still resolves.
  for (const value of canonical.values) {
    const token = normalizeText(value);
    if (new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(normalized)) return value;
  }
  return null;
}

function entitiesCompatible(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.includes(b) || b.includes(a)) return true;
  const stop = new Set(["ltda", "ltda.", "s.a.", "sa", "s/a", "s.a", "me", "epp", "eireli", "holding", "participacoes", "de", "do", "da", "e", "-"]);
  const tokens = (value: string) => new Set(value.split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !stop.has(t)));
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  const jaccard = shared / (ta.size + tb.size - shared);
  return jaccard >= 0.5;
}

/**
 * Merges candidates that state the same fact (field, period, entity, value):
 * the highest-confidence one survives and carries the others' anchors.
 */
export function dedupeCandidates(candidates: VerifiedCandidate[]): VerifiedCandidate[] {
  const groups = new Map<string, VerifiedCandidate[]>();
  for (const candidate of candidates) {
    const key = [
      candidate.field_path,
      candidate.period?.start ?? "",
      candidate.period?.end ?? "",
      candidate.entity ? normalizeText(candidate.entity.name) : "",
      candidate.entity?.scope ?? "",
      candidate.normalized_value,
    ].join("|");
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  const result: VerifiedCandidate[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => Number(b.anchor_verified) - Number(a.anchor_verified) || b.confidence - a.confidence);
    const [primary, ...rest] = sorted;
    if (!primary) continue;
    result.push({...primary, additional_anchors: [...primary.additional_anchors, ...rest.map((c) => c.anchor)]});
  }
  return result;
}

/** Sum helper kept here so the verifier tests can assert Decimal identity behaviour without financial-core. */
export function sumDecimalStrings(values: string[]): string {
  return values.reduce<Decimal>((total, value) => total.plus(new Decimal(value)), new Decimal(0)).toDecimalPlaces(8).toFixed();
}
