import {z} from "zod";

/**
 * What a fund's mandate is made of: dated evidence, not a form somebody filled in.
 *
 * The naive model is a row per fund with a ticket range and a sector list. It fails on contact
 * with the market for a reason worth stating plainly: **the same criterion arrives from several
 * places that disagree, and the disagreement is the most valuable thing in the record.** A fund
 * that tells us it writes R$ 20–80m cheques, whose last twelve transactions were R$ 8–15m, is
 * not a data-quality problem to clean up. It is a fund whose stated box is aspirational, and a
 * desk that notices that places deals better than one that does not.
 *
 * So a mandate criterion is modelled exactly like a financial fact elsewhere in this system:
 * several sourced observations, ordered by how much the desk trusts the source, with the losers
 * kept rather than overwritten.
 *
 * The order is not arbitrary:
 *
 * - `declared` — the fund typed it into this platform. It wins because it is the only source
 *   the fund is accountable for, and because a fund that bothers to state its box is telling
 *   us it wants matching deals.
 * - `conversation` — the fund told a person here, on a date. Real, attributable, and one step
 *   removed because nobody signed it.
 * - `observed` — reconstructed from transactions the fund actually did. Weaker than a statement
 *   about *intent* but stronger than any statement about *behaviour*, which is why it is the
 *   one that gets to contradict the others out loud.
 * - `published` — the fund's own public material: regulation, fact sheet, website. Accurate
 *   when written and rarely revised.
 * - `inferred` — our own reading, from the bucket we put them in. Always the last resort, and
 *   always visible as ours so nobody mistakes our guess for the fund's position.
 *
 * Every observation carries `observedAt`, which is the date the fact was *true*, not the date we
 * wrote it down. A deal announced in March is evidence about March however long we take to read
 * it, and a mandate declared eighteen months ago is old however recently we synced the row.
 */

export const mandateProvenanceSchema = z.enum([
  "declared",
  "conversation",
  "observed",
  "published",
  "inferred",
]);

export type MandateProvenance = z.infer<typeof mandateProvenanceSchema>;

export const provenanceRank: Readonly<Record<MandateProvenance, number>> = {
  declared: 1,
  conversation: 2,
  observed: 3,
  published: 4,
  inferred: 5,
};

export const provenanceLabels: Readonly<Record<MandateProvenance, {pt: string; en: string}>> = {
  declared: {pt: "declarado pelo fundo", en: "declared by the fund"},
  conversation: {pt: "dito em conversa", en: "told in conversation"},
  observed: {pt: "observado nas operações que fez", en: "observed in transactions done"},
  published: {pt: "material público do fundo", en: "the fund's public material"},
  inferred: {pt: "inferência da Offroad", en: "Offroad's inference"},
};

/** One observation of one criterion, from one source, true as at one date. */
export type Sourced<T> = {
  value: T;
  provenance: MandateProvenance;
  /** ISO date the value was true. Not the date the row was written. */
  observedAt: string;
  /** Where it came from, in words a person can check: "escritura da 3ª emissão", "call 12/08". */
  note?: string;
};

export type ResolveOptions = {
  /** The date the question is being asked. Everything ages relative to this. */
  asOf: string;
  /**
   * Months after which a *stated* observation loses a rank.
   *
   * Only statements decay. What a fund said it wanted last year may no longer be true, and the
   * fund has had a year to correct it here and has not. What a fund *did* last year is a
   * permanent fact about last year — it does not become less true, it becomes less relevant,
   * which the caller handles by weighting recency rather than by demoting the source.
   */
  statementDecayMonths?: number;
  /**
   * Relative difference at which a lower-ranked observation is called a divergence rather than
   * noise. Applies to numeric criteria only.
   */
  divergenceTolerance?: number;
};

export type Resolved<T> = {
  /** The value the desk acts on. */
  value: T;
  accepted: Sourced<T>;
  /** Everything that said otherwise, ordered as they were considered. Never discarded. */
  others: Sourced<T>[];
  /**
   * True when what the fund *does* materially contradicts what it *says*.
   *
   * The flag exists to be shown, not to be resolved automatically. Which side to believe is a
   * judgement about that fund, and a platform that silently picked one would be hiding the most
   * useful thing it knows.
   */
  divergent: boolean;
  /** Months between `observedAt` of the accepted observation and `asOf`. */
  ageMonths: number;
};

const MONTH_MS = 1000 * 60 * 60 * 24 * 30.4375;

export function monthsBetween(from: string, to: string): number {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / MONTH_MS);
}

/** Statements age; behaviour does not. See `statementDecayMonths`. */
const isStatement = (provenance: MandateProvenance) => provenance !== "observed";

/**
 * Picks the observation the desk acts on, and keeps the rest.
 *
 * Provenance sets the order; age can demote a stale statement by one rank, never more.
 *
 * One rank is a deliberate bound with a consequence worth stating, because it is the sort of
 * rule someone will later assume is a bug: **behaviour never silently overrides a declaration.**
 * A fund that declared its box eighteen months ago and has since written smaller cheques keeps
 * its declared box as the accepted value, and the contradiction surfaces through `divergent`
 * instead. The alternative — letting our reading of their deals replace their own stated
 * position — is a platform telling a manager what their mandate really is, which is both
 * presumptuous and the kind of thing that ends a relationship on the first call.
 *
 * What one rank does buy: a conversation from last month overtakes a declaration from two years
 * ago, and observed behaviour overtakes stale public material or our own inference. Both are
 * cases where nobody is being overruled — only where the fresher source is also the better one.
 *
 * Ties break on recency, then on the provenance's natural order, so the result is deterministic
 * — two runs over the same fund must place a deal identically or nothing downstream can be
 * trusted.
 */
export function resolveCriterion<T>(
  observations: readonly Sourced<T>[],
  options: ResolveOptions,
  /** Compares two values for divergence. Absent means any difference is a divergence. */
  differsMaterially?: (accepted: T, other: T, tolerance: number) => boolean,
): Resolved<T> | null {
  if (observations.length === 0) return null;
  const decayMonths = options.statementDecayMonths ?? 12;
  const tolerance = options.divergenceTolerance ?? 0.25;

  const scored = observations.map((observation) => {
    const ageMonths = monthsBetween(observation.observedAt, options.asOf);
    const stale = isStatement(observation.provenance) && ageMonths > decayMonths;
    return {observation, ageMonths, effectiveRank: provenanceRank[observation.provenance] + (stale ? 1 : 0)};
  });

  scored.sort(
    (a, b) =>
      a.effectiveRank - b.effectiveRank ||
      a.ageMonths - b.ageMonths ||
      provenanceRank[a.observation.provenance] - provenanceRank[b.observation.provenance],
  );

  const [winner, ...rest] = scored;
  if (!winner) return null;

  // Divergence is specifically "what they do" against "what they say". Two statements that
  // disagree are a stale record; behaviour that disagrees is a finding.
  const behaviour = observations.filter((observation) => observation.provenance === "observed");
  const accepted = winner.observation;
  const divergent =
    accepted.provenance !== "observed" &&
    behaviour.some((observation) =>
      differsMaterially
        ? differsMaterially(accepted.value, observation.value, tolerance)
        : JSON.stringify(accepted.value) !== JSON.stringify(observation.value),
    );

  return {
    value: accepted.value,
    accepted,
    others: rest.map((entry) => entry.observation),
    divergent,
    ageMonths: winner.ageMonths,
  };
}
