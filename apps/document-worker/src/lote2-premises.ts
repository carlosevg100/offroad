import {createHash} from "node:crypto";
import {z} from "zod";
import type {ProposedHypothesis} from "@offroad/financial-model";
import {uuidV5} from "./investment-premises-proposal";
import {foldCue} from "./premise-cue";

/** What the extraction may say about a value: the person said it, or a document field states it. */
export const extractedOrigin = z.enum(["informed", "document"]);
export const sourced = <T extends z.ZodType>(value: T) => z.strictObject({value: value.nullable(), origin: extractedOrigin.nullable(), source: z.string().max(400).nullable()});
export type Sourced<T> = {value: T | null; origin: "informed" | "document" | null; source: string | null};
export const extractedMoney = z.string().regex(/^-?\d{1,15}(?:\.\d{1,8})?$/);
export const extractedAmount = z.string().regex(/^\d{1,15}(?:\.\d{1,8})?$/);
export const itemLabel = z.string().trim().min(1).max(300);
export const itemSource = z.string().trim().min(1).max(400);

/** Where a premise came from; `market` is a market range the house adopts (receivables funding, lote 3). */
export type Lote2Origin = "document" | "informed" | "house" | "estimate" | "market";
/** The card contract the conversation renders for every lote 2 and lote 3 proposal. */
export type Lote2SummaryItem = {
  group: "instrument" | "credit_line" | "obligation" | "view" | "limit" | "measurement" | "stream" | "action" | "case" | "premise"
    | "driver" | "scenario" | "version" | "assumption" | "item" | "option" | "line" | "cause" | "facility" | "dependent";
  label: string;
  /** A stable catalog key when the house wrote the label; null when the label is the person's or a document's. */
  labelKey: string | null;
  origin: Lote2Origin; source: string;
};
/** One card row; `labelKey` names a house-written label so the card can translate it. */
export const summaryRow = (group: Lote2SummaryItem["group"], label: string, x: {origin: Lote2Origin; source: string}, labelKey: string | null = null): Lote2SummaryItem =>
  ({group, label, labelKey, origin: x.origin, source: x.source});
/** The prior results a quarter close card was proposed over, pinned by execution and packet fingerprint. */
export type PriorResultPin = {role: "weekly_cash" | "covenant"; executionId: string; resultFingerprint: string};
export type Lote2Summary = {situationId: string; referenceDate: string | null; items: Lote2SummaryItem[]; priorResults?: PriorResultPin[];
  /** Quarter close only: the dependents the person asked by name to update, by id. */
  askedDependentIds?: string[]};

/** A stated fact keeps its origin; its source defaults to where it came from when the extraction did not cite it. */
export const stated = <T>(f: Sourced<T>) => f.value === null || f.origin === null ? null
  : {value: f.value, origin: f.origin, source: f.source?.trim() || (f.origin === "informed" ? "Informado na conversa" : "Documento")};
/** Lote 3: the top-level sourced fields that carry a value but no origin. Such a value is asked, never dropped
 * to a house default nor to absence (independent review, round 11). */
export function unsourcedFields(extraction: Record<string, unknown>): string[] {
  return Object.entries(extraction).flatMap(([k, v]) => v !== null && typeof v === "object" && !Array.isArray(v) && "value" in v && "origin" in v
    && (v as {value: unknown}).value !== null && (v as {origin: unknown}).origin === null ? [k] : []);
}
export const citedSource = (origin: "informed" | "document", source: string | null | undefined) => source?.trim() || (origin === "informed" ? "Informado na conversa" : "Documento");

/** A stable item key from its label, unique within its list. Keys travel inside field paths, so they carry no dot. */
export function itemKeys(labels: readonly string[], max = 30): string[] {
  const used = new Set<string>();
  return labels.map((label) => {
    const base = foldCue(label).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, max).replace(/-$/, "") || "item";
    let k = base, n = 2;
    while (used.has(k)) k = `${base}-${n++}`;
    used.add(k);
    return k;
  });
}
/** The normalized identity of a name: case, accents, punctuation and spacing folded, nothing truncated. */
export const normalizedName = (name: string) => foldCue(name).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** A key for a document tuple (source, anchor, role): the sha256 of the exact stated strings, only outer whitespace
 * trimmed, serialized as a JSON array; the readable prefix is cosmetic only (round 22). */
export function documentKey(prefix: string, parts: readonly (string | null)[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts.map((x) => x === null ? null : x.trim()))).digest("hex").slice(0, 24);
  return `${prefix}-${hash}`;
}
/** A key that identifies a whole name, not a truncated slug: a readable prefix of the full normalized name and
 * a hash of all of it, so two names that share a long prefix never meet in one key. Used where a key is an
 * identity the method groups by (a debtor, a sublimit group), not a position in one list. */
export function stableKey(name: string, max = 40): string {
  // The hash is over the whole normalized name, every Unicode letter and digit kept (北京食品 and 上海化工 are two
  // names); only the readable prefix keeps the characters a key may carry (independent review, round 15).
  const full = normalizedName(name) || "item", hash = createHash("sha256").update(full).digest("hex").slice(0, 12);
  const prefix = full.replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, max - hash.length - 1).replace(/-+$/, "") || "k";
  return `${prefix}-${hash}`;
}
/** Matches a label the extraction repeats to the item it names, ignoring case and accents. */
export const sameLabel = (a: string, b: string) => foldCue(a).replace(/\s+/g, " ").trim() === foldCue(b).replace(/\s+/g, " ").trim();

type UnboundHypothesis = Omit<ProposedHypothesis, "dimensions"> & {dimensions: Omit<ProposedHypothesis["dimensions"], "entityId" | "definitionVersionId"> & {entityId: null; definitionVersionId: null}};
export type Lote2Completion<F> = {status: "complete"; facts: F; situationId: string; housePremiseKeys: string[]} | {status: "missing"; missing: string[]};

/** The facts a method accepts, or what it refuses named by path (a rule of the set as a whole as "facts"):
 * a refusal becomes a gap the card asks about, never a dropped card. */
/** Record identity in the lote 3 bridges (independent review, rounds 13 to 18).
 * - A label is compared exactly as stated after trimming and case and accent folding only; a numeric-looking label is
 *   never normalized as a number ("001" and "1" are two labels).
 * - Numbers are compared by exact decimal value (107.5 and 107.5000 are one value).
 * - A keyed collection (a driver's column, a stream's transform, a labelled line, cause, facility, dependent, scenario,
 *   option or assumption, a version's figure) holds one fact per key: the same key with equal values is one fact,
 *   wherever it was read, and the same key with different values is a conflict the method asks.
 * - A countable collection (its members add up: lots of a portfolio, causes of a deviation, new cash streams) is
 *   identified by where it was read, never by how it reached us: origin (document or conversation) is provenance only.
 *   When an anchor (row, page or cell) is stated, the identity is (source, anchor): the same key with the same value
 *   is the same record told or read twice (merged, both origins kept in the provenance); the same key with a different
 *   value is the same record read inconsistently, asked as `<collection>.N.anchor`, never summed; different keys are
 *   different records. Without an anchor, equal values are asked as `<collection>.N.duplicateOf`, never merged and
 *   never silently doubled, unless the collection's source is the record's own document (an invoice is the expense)
 *   and the sources differ: then they are two records. A borderô lists lots and the same lot may be listed twice, so
 *   for lots a different source does not tell equal lots apart. A collection may name the role a record plays (a C54
 *   cause's bridge line): the identity is then (role, source, anchor), and the same evidence explaining two lines is
 *   two records, one per line; readings within one role reconcile as above (round 20). The role is the resolved
 *   identity of the referenced record (the line as the method resolves the label), never the raw label: "EBITDA" and
 *   "ebitda" are one line (round 23). */
export const statedLabel = (label: string) => foldCue(label.trim());
const textKey = /(?:label|Label|Labels|Id|Ids|TaxId|source|origin|owner|definition|scenario|question|approval|releaseEvent|encumbranceHolder|sublimitGroup|recomputedBy|quantities|kind|metric|status|unit|scale|mode|role|classification|nature|basis|driver|drivers|contract|encumbrance|registration|creditTier|anchorProgram|recourse|rateBasis|collateral|registrationRule|minCreditTier|evidenceStatus|ruler|evidence|cause|purpose)$/;
function canonical(value: unknown, key: string): unknown {
  if (typeof value === "string") return textKey.test(key) ? statedLabel(value) : canonicalDecimal(value);
  if (Array.isArray(value)) return value.map((v) => canonical(v, key));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => [k, canonical(v, k)]));
  return value;
}
/** The entries of a collection referenced by label whose label repeats an earlier one: a reference by that label
 * would silently pick the first, so each repeat is asked. One-based positions. */
export function repeatedLabels(labels: readonly string[]): number[] {
  return labels.flatMap((label, k) => labels.slice(0, k).some((x) => statedLabel(x) === statedLabel(label)) ? [k + 1] : []);
}
/** A numeric string by its exact decimal value (107.5 and 107.5000 are one value); anything else unchanged. */
export function canonicalDecimal(v: string): string {
  if (!/^-?\d+(?:\.\d+)?$/.test(v)) return v;
  const negative = v.startsWith("-"), [whole, fraction = ""] = v.replace(/^-/, "").split(".");
  const integer = whole!.replace(/^0+(?=\d)/, ""), decimals = fraction.replace(/0+$/, ""), out = decimals ? `${integer}.${decimals}` : integer;
  return negative && /[1-9]/.test(out) ? `-${out}` : out;
}
/** A value as canonical text: numbers by exact decimal value, labels and other text as stated (trimmed and folded). */
export function canonicalJson(value: unknown, key = ""): string {
  return JSON.stringify(canonical(value, key));
}
/** The keys stated more than once with different values: never resolved by order, always asked. */
export function conflictingKeys<T>(items: readonly T[], key: (t: T) => string, value: (t: T) => unknown): Set<string> {
  const seen = new Map<string, string>(), out = new Set<string>();
  for (const t of items) { const k = key(t), v = canonicalJson(value(t), "value"); if (seen.has(k) && seen.get(k) !== v) out.add(k); else seen.set(k, v); }
  return out;
}
/** Applies record identity to each named collection of an extraction: the same fact read twice from the same source is
 * merged; equal values from another source are kept and asked as `<collection>.N.duplicateOf` (positions after merging).
 * Returns the extraction with merged collections and the asked positions per collection. */
export function withRecordIdentity<E extends Record<string, unknown>>(extraction: E,
  collections: {keyed: readonly (keyof E & string)[]; countable: readonly ((keyof E & string) | {name: keyof E & string; sourceIdentifies: true;
    /** The resolved identity of the record this one plays a role for (for a cause, the id of the line it explains, as the
     * method resolves the reference), never its raw label; null when it does not resolve (asked by the method). */
    role?: (record: Record<string, unknown>, reconciled: Record<string, unknown>) => string | null})[]},
  missing: string[]): {e: E; ambiguous: Map<string, Set<number>>} {
  const e = {...extraction} as Record<string, unknown>, ambiguous = new Map<string, Set<number>>();
  for (const name of collections.keyed) {
    const seen = new Set<string>();
    e[name] = (extraction[name] as unknown[]).filter((t) => {
      const {origin: _o, source: _s, ...content} = t as Record<string, unknown>, c = canonicalJson(content);
      if (seen.has(c)) return false; seen.add(c); return true;
    });
    ambiguous.set(name, new Set());
  }
  for (const entry of collections.countable) {
    const name = typeof entry === "string" ? entry : entry.name, sourceIdentifies = typeof entry !== "string";
    // The role a record plays (a cause's line): one piece of evidence used in two roles is two records.
    const role = typeof entry === "string" ? undefined : entry.role;
    // The identity key of each kept record is computed once, from the record as first read, and never changes:
    // provenance accumulated by later readings (their origins) is kept apart and only rendered into the record.
    const kept: Record<string, unknown>[] = [], keys: ReturnType<typeof parts>[] = [], origins: Set<unknown>[] = [], firsts: Record<string, unknown>[] = [];
    const asked = new Set<number>();
    function parts(t: Record<string, unknown>) {
      const {origin: _origin, source, anchor, ...content} = t;
      // A document tuple is compared by its exact stated strings, only outer whitespace trimmed: 'Clientes-A'!A2 and
      // 'Clientes A'!A2 are two anchors (round 22).
      const exact = (v: unknown) => typeof v === "string" ? v.trim() : null;
      return {value: canonicalJson(content), where: JSON.stringify(role === undefined ? [exact(source)] : [role(t, e), exact(source)]),
        anchor: typeof anchor === "string" && anchor.trim() ? anchor.trim() : null};
    }
    const keep = (t: Record<string, unknown>, p: ReturnType<typeof parts>) => {kept.push(t); keys.push(p); origins.push(new Set([t.origin])); firsts.push(t);};
    for (const t of extraction[name] as Record<string, unknown>[]) {
      const p = parts(t), prior = [...keys];
      if (p.anchor !== null) {
        // A stated anchor is the identity: (source, anchor). Origin is provenance only.
        const sameKey = (x: ReturnType<typeof parts>) => x.where === p.where && x.anchor === p.anchor;
        // Reconciled against the immutable keys: a reading equal to any earlier reading of this key joins it.
        const k = prior.findIndex((x) => sameKey(x) && x.value === p.value);
        if (k >= 0) {
          // Told in the conversation and read in the document: one fact, every origin kept in its provenance.
          origins[k]!.add(t.origin);
          const first = firsts[k]!;
          kept[k] = origins[k]!.size > 1 ? {...first, origin: "document", source: `${String(first.source ?? "").trim()} (também informado na conversa)`} : first;
          continue;
        }
        keep(t, p);
        if (prior.some(sameKey)) {asked.add(kept.length); missing.push(`${name}.${kept.length}.anchor`);}
        else if (prior.some((x) => x.value === p.value && x.anchor === null && !(sourceIdentifies && x.where !== p.where))) {asked.add(kept.length); missing.push(`${name}.${kept.length}.duplicateOf`);}
        continue;
      }
      keep(t, p);
      // Without an anchor, an equal value that nothing tells apart is asked; where the source is the record's own
      // document, another source is another record.
      if (prior.some((x) => x.value === p.value && !(sourceIdentifies && x.where !== p.where))) {asked.add(kept.length); missing.push(`${name}.${kept.length}.duplicateOf`);}
    }
    e[name] = kept; ambiguous.set(name, asked);
  }
  return {e: e as E, ambiguous};
}

export function factsOrGaps<T>(schema: z.ZodType<T>, raw: unknown): {ok: true; facts: T} | {ok: false; missing: string[]} {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return {ok: true, facts: parsed.data};
  return {ok: false, missing: [...new Set(parsed.error.issues.map((i) =>
    i.path.filter((x) => x !== "value").map((x) => typeof x === "number" ? String(x + 1) : String(x)).join(".") || "facts"))]};
}

/** The proposal body and the fingerprint the confirmation checks. Hypotheses carry no entity or
 * definition identity: the confirmation binds them to the work. */
export function fingerprintedProposal<F>(method: {methodId: string; methodVersion: string}, facts: F, hypotheses: ProposedHypothesis[], summary: Lote2Summary) {
  const body = {methodId: method.methodId, methodVersion: method.methodVersion, facts,
    hypotheses: hypotheses.map((h): UnboundHypothesis => ({...h, dimensions: {...h.dimensions, entityId: null, definitionVersionId: null}})), summary};
  return {...body, fingerprint: createHash("sha256").update(JSON.stringify(body)).digest("hex")};
}
export type Lote2Proposal = ReturnType<typeof fingerprintedProposal<unknown>>;
export type Lote2TurnPremises = {
  forAdvisor: {status: "proposed"; summary: Lote2Summary; housePremises: string[]} | {status: "missing"; missing: string[]};
  proposal: Lote2Proposal | null;
};

/** One turn's premise step for a lote 2 method. It never fails the turn: any error is logged and the
 * turn continues as a plain reply. The analysis identity is stable per work. */
export async function proposeLote2PremisesForTurn<E extends {turnIntent: string}, F>(spec: {
  logPrefix: string; idName: string; schema: z.ZodType<E>;
  complete: (extraction: E, id: string) => Lote2Completion<F>;
  build: (facts: F, situationId: string) => Lote2Proposal;
  /** Lote 3: a refusal to expand the facts into hypotheses (the basis limit or any other) is a gap the turn
   * names, "tooManyItems" for the basis limit (split the analysis or narrow it) and "premisesRefused" otherwise,
   * never a dropped card. Lote 2 keeps its behaviour. */
  expansionRefusalAsGap?: boolean;
  /** Lote 3: what the method's own reader and packet would refuse after confirmation, named now as gaps. */
  readerCheck?: (facts: F) => string[];
}, input: {
  entry: "cue" | "continuation"; projectId: string; message: string; recentUserMessages: string[];
  loadEvidence: () => Promise<unknown>; extract: (text: string) => Promise<unknown>;
  log: (event: string, detail: Record<string, unknown>) => void;
}): Promise<Lote2TurnPremises | null> {
  try {
    const documentFields = await input.loadEvidence();
    const extraction = spec.schema.parse(await input.extract(JSON.stringify({
      latestUserMessage: input.message, earlierUserMessages: input.recentUserMessages.slice(-6), documentFields})));
    // Only a turn that answers what is pending (or itself requests this analysis) proposes.
    const intent = (extraction as {turnIntent: string}).turnIntent;
    if (intent !== "answers_pending") {
      input.log(`${spec.logPrefix}.not_answering`, {turnIntent: intent, entry: input.entry});
      return null;
    }
    const completed = spec.complete(extraction, uuidV5(`offroad:${spec.idName}:${input.projectId}`));
    if (completed.status === "missing") {
      input.log(`${spec.logPrefix}.missing`, {missing: completed.missing});
      return {forAdvisor: {status: "missing", missing: completed.missing}, proposal: null};
    }
    let proposal: Lote2Proposal;
    try { proposal = spec.build(completed.facts, completed.situationId); }
    catch (error) {
      if (!spec.expansionRefusalAsGap) throw error;
      const message = error instanceof Error ? error.message : "unknown";
      const missing = [/_exceed_basis$/.test(message) ? "tooManyItems" : "premisesRefused"];
      input.log(`${spec.logPrefix}.expansion_refused`, {message: message.slice(0, 200), missing});
      return {forAdvisor: {status: "missing", missing}, proposal: null};
    }
    const refused = spec.readerCheck?.(completed.facts) ?? [];
    if (refused.length) {
      input.log(`${spec.logPrefix}.reader_refused`, {missing: refused});
      return {forAdvisor: {status: "missing", missing: refused}, proposal: null};
    }
    input.log(`${spec.logPrefix}.proposed`, {hypotheses: proposal.hypotheses.length, housePremises: completed.housePremiseKeys});
    return {forAdvisor: {status: "proposed", summary: proposal.summary, housePremises: completed.housePremiseKeys}, proposal};
  } catch (error) {
    input.log(`${spec.logPrefix}.failed`, {message: error instanceof Error ? error.message.slice(0, 200) : "unknown"});
    return null;
  }
}
