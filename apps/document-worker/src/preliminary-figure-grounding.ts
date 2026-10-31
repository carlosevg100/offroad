import {resolveFieldPath} from "@offroad/credit-ontology";
import {normalizeOriginatorNumber} from "@offroad/financial-core";
import type {ValidationIssueDiagnostic} from "@offroad/model-gateway";

type Kind = "currency" | "ratio" | "multiple" | "days" | "months";
type Figure = {kind: Kind; currency: string | null; value: string};
type TextFigures = {figures: Figure[]; invalid: boolean};
type Narrative = {understandingSummary: string; companySummary: string; operationSummary: string; capitalObjective: string | null;
  sectorSummary: string | null; positioningSummary: string | null; openPoints: readonly {question: string; whyItMatters: string}[];
  researchSignals: readonly {claim: string; sourceUrls: readonly string[]}[]};
type Evidence = {locale: "pt" | "en"; candidates: readonly Record<string, unknown>[]; userTexts: readonly string[];
  declaredAmount: unknown; declaredCurrency: unknown; declaredTermMonths?: unknown; publicSources: readonly {url: string; snippet: string}[]};
const scales: Record<string, string> = {mil: "1000", thousand: "1000", milhão: "1000000", milhões: "1000000", million: "1000000", millions: "1000000", mi: "1000000", mm: "1000000", m: "1000000", bilhão: "1000000000", bilhões: "1000000000", billion: "1000000000", billions: "1000000000", bi: "1000000000"};
const currencies: Record<string, string> = {"R$": "BRL", BRL: "BRL", REAIS: "BRL", "US$": "USD", USD: "USD", DOLLARS: "USD", "€": "EUR", EUR: "EUR", EUROS: "EUR", "£": "GBP", GBP: "GBP"};
const figureKey = (f: Figure) => JSON.stringify([f.kind, f.currency, f.value]);

/** Parse presentation through the deterministic financial kernel. This never derives a
 * difference, sum, margin, currency conversion or duration conversion from two facts. */
function readFigure(raw: string, kind: Kind, currency: string | null, scale: string, locale: Evidence["locale"], normalized = false): Figure {
  let literal = raw;
  if (locale === "en" && !normalized) {
    if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw)) throw new Error("invalid_figure_notation");
    literal = raw.replace(/,/g, "");
  }
  const result = normalizeOriginatorNumber({literal, notation: normalized || locale === "en" ? "decimal_notation" : "brazilian_document",
    unit: kind === "days" || kind === "months" ? "count" : kind, currency: kind === "currency" ? currency : null,
    declaredScale: kind === "currency" ? scale : null, representation: kind === "currency" ? normalized ? "already_in_currency_units" : "reported_in_declared_scale" : null,
    ratioConvention: kind === "ratio" ? normalized ? "fraction" : "percent" : null});
  return {kind, currency: kind === "currency" ? currency : null, value: result.value};
}

function figuresIn(text: string, locale: Evidence["locale"]): TextFigures {
  const figures: Figure[] = [], currencyRanges: Array<{start: number; end: number}> = [];
  let invalid = false;
  const pattern = /(?<![\p{L}\d.,])(?:(R\$|US\$|BRL|USD|EUR|GBP|€|£)\s*)?(-?(?:\d{1,3}(?:[., ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?))\s*(bilhões|bilhão|milhões|milhão|billions|billion|millions|million|thousand|mil|mi|mm|bi|m|%|x|dias?|days?|meses|mês|months?)?(?!\p{L})(?:\s*(?:de\s+)?(BRL|USD|EUR|GBP|reais|dollars|euros)\b)?/giu;
  for (const m of text.matchAll(pattern)) {
    const prefix = m[1]?.toUpperCase(), unit = m[3]?.toLowerCase(), suffix = m[4]?.toUpperCase();
    if (!prefix && !suffix && !unit) continue; // years, identifiers and bare counts are not financial figures
    if (unit === "m" && !prefix && !suffix) continue; // a company name such as 3M is not a money claim
    try {
      const currency = currencies[prefix ?? suffix ?? ""] ?? null;
      if (prefix && suffix && currencies[prefix] !== currencies[suffix]) throw new Error("currency_conflict");
      const kind: Kind = unit === "%" ? "ratio" : unit === "x" ? "multiple" : /^(dia|day)/.test(unit ?? "") ? "days" : /^(mês|meses|month)/.test(unit ?? "") ? "months" : "currency";
      if (kind !== "currency" && (prefix || suffix)) throw new Error("unit_conflict");
      if (kind === "currency" && !currency) throw new Error("currency_missing");
      // A business-day convention is material. Generic source days cannot silently certify it.
      if (kind === "days" && /^\s*(?:úteis|uteis|business|working)\b/iu.test(text.slice(m.index + m[0].length))) throw new Error("day_convention_unrepresented");
      const raw = /-\s*$/.test(text.slice(0, m.index)) && prefix ? "-" + m[2]! : m[2]!;
      figures.push(readFigure(raw, kind, currency, scales[unit ?? ""] ?? "1", locale));
      if (prefix || suffix) currencyRanges.push({start: m.index, end: m.index + m[0].length});
    } catch {invalid = true;}
  }
  // Do not let a malformed or word-only currency amount evade the numeric parser.
  for (const token of text.matchAll(/(?:R\$|US\$|\b(?:BRL|USD|EUR|GBP)\b|€|£)(?=\s*(?:[-\d]|um\b|uma\b|one\b))/giu)) {
    if (!currencyRanges.some(r => token.index >= r.start && token.index < r.end)) invalid = true;
  }
  return {figures, invalid};
}

/** Only the authorized loader's currently supplied readings enter this support set. This
 * checks numerical grounding; it does not adopt a fact or certify its semantic association. */
function supports(input: Evidence) {
  const values = new Set<string>();
  const addText = (text: string) => {for (const f of figuresIn(text, input.locale).figures) values.add(figureKey(f));};
  for (const c of input.candidates) {
    if (c.anchor_verified !== true || ["rejected", "not_applicable", "superseded"].includes(String(c.review_state))) continue;
    if (Array.isArray(c.verifier_flags) && c.verifier_flags.some(f => ["scale_conflict", "scale_unverified", "entity_mismatch", "period_outside_document"].includes(String(f)))) continue;
    const normalized = typeof c.normalized_value === "string" || typeof c.normalized_value === "number" ? String(c.normalized_value) : null;
    const unit = typeof c.unit === "string" && c.unit ? c.unit : resolveFieldPath(String(c.field_path))?.definition.unit;
    const currency = typeof c.currency === "string" && /^[A-Z]{3}$/.test(c.currency) ? c.currency : null;
    const kind: Kind | null = unit === "money" || unit === "currency" ? "currency" : unit === "percent" ? "ratio" : unit === "ratio" || unit === "multiple" ? "multiple" : unit === "days" ? "days" : unit === "months" ? "months" : null;
    if (normalized !== null && c.value_type === "number" && kind) {
      try {values.add(figureKey(readFigure(normalized, kind, currency, "1", input.locale, true)));} catch { /* unresolved units are not support */ }
    }
    if (typeof c.raw_value === "string") addText(c.raw_value);
    const anchor = c.source_anchor && typeof c.source_anchor === "object" ? c.source_anchor as Record<string, unknown> : null;
    if (typeof anchor?.quote === "string") addText(anchor.quote);
  }
  for (const text of input.userTexts) addText(text);
  if ((typeof input.declaredAmount === "string" || typeof input.declaredAmount === "number") && typeof input.declaredCurrency === "string") {
    try {values.add(figureKey(readFigure(String(input.declaredAmount), "currency", input.declaredCurrency, "1", input.locale, true)));} catch { /* no declared monetary value */ }
  }
  if (typeof input.declaredTermMonths === "string" || typeof input.declaredTermMonths === "number") {
    try {values.add(figureKey(readFigure(String(input.declaredTermMonths), "months", null, "1", input.locale, true)));} catch { /* no declared duration */ }
  }
  return values;
}

export function preliminaryFigureValidator(input: Evidence) {
  const local = supports(input), publicByUrl = new Map(input.publicSources.map(s => [s.url, figuresIn(s.snippet, input.locale).figures.map(figureKey)]));
  return (n: Narrative): {accepted: true} | {accepted: false; issues: ValidationIssueDiagnostic[]} => {
    const issues: ValidationIssueDiagnostic[] = [];
    const check = (text: string | null, path: string, allowed = local) => {
      if (text === null) return;
      const read = figuresIn(text, input.locale);
      if (read.invalid || read.figures.some(f => !allowed.has(figureKey(f)))) issues.push({path, code: "preliminary_figure_not_supported", message: "Use only a figure with the same unit and currency in the supplied verified evidence or declaration; do not calculate a new figure."});
    };
    for (const key of ["understandingSummary", "companySummary", "operationSummary", "capitalObjective", "sectorSummary", "positioningSummary"] as const) check(n[key], key);
    n.openPoints.forEach((q, i) => {check(q.question, `openPoints.${i}.question`); check(q.whyItMatters, `openPoints.${i}.whyItMatters`);});
    n.researchSignals.forEach((s, i) => {const allowed = new Set(s.sourceUrls.flatMap(url => publicByUrl.get(url) ?? [])); check(s.claim, `researchSignals.${i}.claim`, allowed);});
    return issues.length ? {accepted: false, issues} : {accepted: true};
  };
}
