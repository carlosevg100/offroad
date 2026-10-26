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
export const normalizedName = (name: string) => foldCue(name).replace(/[^a-z0-9]+/g, " ").trim();
/** A key that identifies a whole name, not a truncated slug: a readable prefix of the full normalized name and
 * a hash of all of it, so two names that share a long prefix never meet in one key. Used where a key is an
 * identity the method groups by (a debtor, a sublimit group), not a position in one list. */
export function stableKey(name: string, max = 40): string {
  const full = normalizedName(name) || "item", hash = createHash("sha256").update(full).digest("hex").slice(0, 12);
  const prefix = full.replace(/ /g, "-").slice(0, max - hash.length - 1).replace(/-+$/, "") || "k";
  return `${prefix}-${hash}`;
}
/** Matches a label the extraction repeats to the item it names, ignoring case and accents. */
export const sameLabel = (a: string, b: string) => foldCue(a).replace(/\s+/g, " ").trim() === foldCue(b).replace(/\s+/g, " ").trim();

type UnboundHypothesis = Omit<ProposedHypothesis, "dimensions"> & {dimensions: Omit<ProposedHypothesis["dimensions"], "entityId" | "definitionVersionId"> & {entityId: null; definitionVersionId: null}};
export type Lote2Completion<F> = {status: "complete"; facts: F; situationId: string; housePremiseKeys: string[]} | {status: "missing"; missing: string[]};

/** The facts a method accepts, or what it refuses named by path (a rule of the set as a whole as "facts"):
 * a refusal becomes a gap the card asks about, never a dropped card. */
/** The entries of a collection referenced by label whose label repeats an earlier one: a reference by that label
 * would silently pick the first, so each repeat is asked. One-based positions. */
export function repeatedLabels(labels: readonly string[]): number[] {
  return labels.flatMap((label, k) => labels.slice(0, k).some((x) => sameLabel(x, label)) ? [k + 1] : []);
}
/** The keys stated more than once with different values: never resolved by order, always asked. */
export function conflictingKeys<T>(items: readonly T[], key: (t: T) => string, value: (t: T) => unknown): Set<string> {
  const seen = new Map<string, string>(), out = new Set<string>();
  for (const t of items) { const k = key(t), v = JSON.stringify(value(t)); if (seen.has(k) && seen.get(k) !== v) out.add(k); else seen.set(k, v); }
  return out;
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
