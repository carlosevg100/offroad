import Decimal from "decimal.js";

/**
 * From many documents saying things, to one set of facts the desk stands behind.
 *
 * Three documents state revenue for 2025 and they disagree. That is not a defect — it is the
 * normal condition of a data room, and resolving it is the first thing a credit desk does. The
 * rule is precedence by **evidence rank**, which the ontology already assigns to each kind of
 * document: audited statements outrank a review, a review outranks management accounts, and a
 * deck loses to all of them. Not "the most recent", not "the highest confidence", not whichever
 * document happened to be processed first.
 *
 * What is *not* discarded: the losers. Every conflicting value stays attached to the fact, with
 * its own source and anchor, because a difference between what the auditor signed and what the
 * ERP exports is exactly the question an investor will ask — and the reconciliation rules read
 * these conflicts to raise it before he does.
 */

export type FactKey = {
  fieldPath: string;
  periodEnd?: string;
  entityName?: string;
};

export type FactCandidate = {
  fieldPath: string;
  /** Decimal string for numbers, ISO date, text, "true"/"false", JSON array for lists. */
  normalizedValue: string;
  valueType: "text" | "number" | "date" | "boolean" | "list";
  sourceDocument: string;
  /** 1 (audited) to 7 (company statement). Lower wins. */
  evidenceRank: number;
  informationClass: string;
  confidence: number;
  anchorVerified: boolean;
  periodStart?: string;
  periodEnd?: string;
  entityName?: string;
  /** Consolidated, standalone (parent-only) or segment; the consolidated number is the company's. */
  entityScope?: string;
  /** Where in the document it was found; carried through so a fact never loses its citation. */
  anchor?: unknown;
};

export type FactConflict = {
  candidate: FactCandidate;
  /** Relative difference against the accepted value; absent for non-numeric facts. */
  relativeDelta?: string;
};

export type ReconciledFact = {
  key: FactKey;
  /** The value the desk stands behind. */
  value: string;
  valueType: FactCandidate["valueType"];
  accepted: FactCandidate;
  /** Everything that said otherwise, ordered by rank then confidence. Never discarded. */
  conflicts: FactConflict[];
  /** True when at least one conflict differs beyond the tolerance the caller passed. */
  disputed: boolean;
};

// One to three digits: an {i} index, never a year such as historical_financials.2025.
const indexedPath = /^(.*)\.(\d{1,3})\.([a-z0-9_]+)$/;

export function factKeyOf(candidate: FactCandidate): string {
  // Indexed tuples (instruments, customers, windows) are rows of one document: the same index in
  // another document is another row, not the same fact read twice.
  const tupleScope = indexedPath.test(candidate.fieldPath) ? candidate.sourceDocument : "";
  return [candidate.fieldPath, candidate.periodEnd ?? "", candidate.entityName ?? "", tupleScope].join("|");
}

const isNumeric = (candidate: FactCandidate) => candidate.valueType === "number";

/**
 * Orders candidates for the same fact by how much the desk trusts them.
 *
 * Rank first, because that is a property of the document and not of the reading. Then a
 * verified anchor, because a value the verifier could confirm against the page outranks one it
 * could not, at equal rank. Then confidence, then the raw value as a tiebreak so the result is
 * deterministic — two runs over the same data room must reconcile identically, or nothing
 * downstream can be trusted.
 */
const scopeOrder = (scope: string | undefined): number => (scope === "consolidated" ? 0 : scope === undefined ? 1 : 2);

export function compareCandidates(a: FactCandidate, b: FactCandidate): number {
  if (a.evidenceRank !== b.evidenceRank) return a.evidenceRank - b.evidenceRank;
  if (a.anchorVerified !== b.anchorVerified) return a.anchorVerified ? -1 : 1;
  // Consolidated before parent-only: a filing prints both columns and the company is the group.
  if (scopeOrder(a.entityScope) !== scopeOrder(b.entityScope)) return scopeOrder(a.entityScope) - scopeOrder(b.entityScope);
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return a.normalizedValue.localeCompare(b.normalizedValue);
}

/** Relative difference between two numeric strings, as a decimal string. Null when not comparable. */
export function relativeDelta(accepted: string, other: string): string | null {
  const a = new Decimal(accepted);
  const b = new Decimal(other);
  if (!a.isFinite() || !b.isFinite()) return null;
  if (a.isZero()) return b.isZero() ? "0" : null;
  return b.minus(a).dividedBy(a).abs().toDecimalPlaces(6).toFixed();
}

export type ReconcileOptions = {
  /** A conflict beyond this relative difference marks the fact disputed. Default 1%. */
  disputeTolerance?: string;
};

export function reconcileFacts(candidates: readonly FactCandidate[], options: ReconcileOptions = {}): ReconciledFact[] {
  const tolerance = new Decimal(options.disputeTolerance ?? "0.01");
  const grouped = new Map<string, FactCandidate[]>();
  for (const candidate of candidates) {
    const key = factKeyOf(candidate);
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }

  const facts: ReconciledFact[] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort(compareCandidates);
    const accepted = ordered[0];
    if (!accepted) continue;

    const conflicts: FactConflict[] = [];
    let disputed = false;
    for (const other of ordered.slice(1)) {
      if (other.normalizedValue === accepted.normalizedValue) continue;
      const delta = isNumeric(accepted) && isNumeric(other) ? relativeDelta(accepted.normalizedValue, other.normalizedValue) : null;
      if (delta === null || new Decimal(delta).gt(tolerance)) disputed = true;
      conflicts.push(delta === null ? {candidate: other} : {candidate: other, relativeDelta: delta});
    }

    facts.push({
      key: {
        fieldPath: accepted.fieldPath,
        ...(accepted.periodEnd ? {periodEnd: accepted.periodEnd} : {}),
        ...(accepted.entityName ? {entityName: accepted.entityName} : {}),
      },
      value: accepted.normalizedValue,
      valueType: accepted.valueType,
      accepted,
      conflicts,
      disputed,
    });
  }
  return facts;
}

/**
 * One number per row of one document, across the whole case.
 *
 * Every table numbers its rows from one, and so does every document: the ITR's note 15 has a
 * `debt.instruments.1`, the letter's table has a `debt.instruments.1`, and without this step
 * the two are one fact with a conflict, the reconciliation reports a contradiction the room
 * never stated, and the desk reads one instrument where there were two. Tuples are grouped by
 * document and original index, ordered by the document's evidence rank, and renumbered 1..N.
 */
export function renumberIndexedGroups(facts: readonly ReconciledFact[]): ReconciledFact[] {
  type TupleKey = string;
  const groups = new Map<string, Map<TupleKey, {rank: number; document: string; index: number}>>();
  for (const fact of facts) {
    const match = indexedPath.exec(fact.key.fieldPath);
    if (!match) continue;
    const [, group, index] = match as unknown as [string, string, string];
    const document = fact.accepted.sourceDocument;
    const tupleKey = `${document}#${index}`;
    const tuples = groups.get(group) ?? new Map();
    if (!tuples.has(tupleKey)) tuples.set(tupleKey, {rank: fact.accepted.evidenceRank, document, index: Number(index)});
    groups.set(group, tuples);
  }
  const renumbered = new Map<string, Map<TupleKey, number>>();
  for (const [group, tuples] of groups) {
    const ordered = [...tuples.entries()].sort(([, a], [, b]) => a.rank - b.rank || a.document.localeCompare(b.document) || a.index - b.index);
    renumbered.set(group, new Map(ordered.map(([key], position) => [key, position + 1])));
  }
  return facts.map((fact) => {
    const match = indexedPath.exec(fact.key.fieldPath);
    if (!match) return fact;
    const [, group, index, key] = match as unknown as [string, string, string, string];
    const next = renumbered.get(group)?.get(`${fact.accepted.sourceDocument}#${index}`);
    if (next === undefined || String(next) === index) return fact;
    return {...fact, key: {...fact.key, fieldPath: `${group}.${next}.${key}`}};
  });
}

/** Index for the rules and the calculations: field path (+ period) → fact. */
export function indexFacts(facts: readonly ReconciledFact[]): Map<string, ReconciledFact> {
  const index = new Map<string, ReconciledFact>();
  for (const fact of facts) {
    index.set([fact.key.fieldPath, fact.key.periodEnd ?? ""].join("|"), fact);
    // Also reachable without a period, for facts stated once (the request, the company).
    if (!index.has(fact.key.fieldPath)) index.set(fact.key.fieldPath, fact);
  }
  return index;
}

export function factValue(index: Map<string, ReconciledFact>, fieldPath: string, periodEnd?: string): Decimal | null {
  const fact = index.get(periodEnd ? [fieldPath, periodEnd].join("|") : fieldPath);
  if (!fact || fact.valueType !== "number") return null;
  const value = new Decimal(fact.value);
  return value.isFinite() ? value : null;
}
