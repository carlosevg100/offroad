/**
 * What a candidate is, said in one line a person can defend.
 *
 * A screening result is only useful if the reader can tell three things apart at a glance: a fund
 * whose current mandate says yes, a fund we merely believe might say yes, and a fund that cannot
 * take this transaction at all. Presenting them as one ranked list with a score collapses exactly
 * the distinction that decides whether a desk makes a call or does more work first.
 *
 * So classification here is a three-way statement about evidence, not a number:
 *
 * - `eligible` — a confirmed mandate, inside its validity window, with no incompatibility and no
 *   hard criterion we cannot read from that mandate.
 * - `hypothesis` — a plausible fund on evidence nobody confirmed: a public filing, our own
 *   reading, past transactions, or a mandate record still in draft, expired or withdrawn. It is
 *   research, and calling it anything else is how a platform invents interest that never existed.
 * - `excluded` — a hard criterion the mandate rules out. In Brazil the first of those is usually
 *   the instrument, and it is usually a legal wall rather than a preference, so an excluded
 *   instrument never appears as eligible no matter how well everything else lines up.
 *
 * Every candidate carries the adherence rationale item by item, the incompatibilities, the
 * mandate version it was read from and the date it was confirmed. The function is pure and
 * deterministic: the same inputs order and classify identically on every run, because a list that
 * reshuffles between two runs cannot be reviewed, quoted in a memo, or defended to either side.
 *
 * Nothing here authorizes disclosure or contact. A candidate is a reading, and the endpoint of
 * the product is a qualified introduction that somebody explicitly authorizes later.
 */

export const candidateFitVersion = "2026.09.11-v1";

export type MandateEvidenceProvenance = "declared" | "conversation" | "observed" | "published" | "inferred";

const provenanceRank: Readonly<Record<MandateEvidenceProvenance, number>> = {
  declared: 1,
  conversation: 2,
  observed: 3,
  published: 4,
  inferred: 5,
};

export type CriterionOutcome = "fits" | "excluded" | "unknown" | "not_assessed";

export type CandidateCriterion = {
  id: string;
  /** Whether failing this criterion excludes the fund outright. */
  hard: boolean;
  outcome: CriterionOutcome;
  /** The mandate's constraint, in words. */
  mandate: string | null;
  /** What the transaction says, in words. */
  request: string | null;
  /** Provenance of the observation the criterion was decided on. */
  origin: MandateEvidenceProvenance | null;
  /** ISO date the observation was true. */
  observedAt: string | null;
};

export type MandateRecordStatus = "draft" | "confirmed" | "expired" | "withdrawn";

export type CandidateMandateRecord = {
  versionNumber: number;
  /** The status with the validity window applied at the date the question was asked. */
  effectiveStatus: MandateRecordStatus;
  confirmedAt: string | null;
  channel: string | null;
};

export type CandidateEvidenceSource = "confirmed_mandate" | "historical_activity" | "public_record";
export type CandidateClassification = "eligible" | "hypothesis" | "excluded";

/** The seven things a credit committee actually argues about, in a fixed order. */
export type AdherenceSubject =
  | "instrument"
  | "ticket"
  | "sector"
  | "geography"
  | "credit_profile"
  | "tenor"
  | "collateral";

export const adherenceSubjects: readonly AdherenceSubject[] = [
  "instrument",
  "ticket",
  "sector",
  "geography",
  "credit_profile",
  "tenor",
  "collateral",
];

/**
 * Which criteria answer for each subject.
 *
 * Leverage and DSCR are one subject because they are one question: what credit does this fund
 * underwrite. Splitting them on the screen makes a fund look twice as restrictive as it is, and
 * a reader comparing candidates counts rows rather than reading them.
 */
const criteriaBySubject: Readonly<Record<AdherenceSubject, readonly string[]>> = {
  instrument: ["instrument"],
  ticket: ["ticket"],
  sector: ["sector"],
  geography: ["geography"],
  credit_profile: ["leverage", "dscr"],
  tenor: ["term"],
  collateral: ["collateral"],
};

export type AdherenceItem = {
  subject: AdherenceSubject;
  outcome: CriterionOutcome;
  mandate: string | null;
  request: string | null;
  origin: MandateEvidenceProvenance | null;
  observedAt: string | null;
};

export type CandidateFit = {
  version: string;
  evidenceSource: CandidateEvidenceSource;
  classification: CandidateClassification;
  /** Hard criteria the mandate rules out. The reason a candidate is excluded, by name. */
  incompatibilities: string[];
  /** Hard criteria we cannot read from this mandate. Our gap, and what blocks eligibility. */
  unverified: string[];
  /** Criteria the company itself could still answer. These never block eligibility. */
  openQuestions: string[];
  adherence: AdherenceItem[];
  mandateVersion: number | null;
  mandateStatus: MandateRecordStatus | null;
  confirmedAt: string | null;
};

/** `excluded` beats `unknown` beats `not_assessed` beats `fits`: the worst news decides. */
const outcomePriority: Readonly<Record<CriterionOutcome, number>> = {
  excluded: 0,
  unknown: 1,
  not_assessed: 2,
  fits: 3,
};

function combine(criteria: readonly CandidateCriterion[]): AdherenceItem | null {
  if (criteria.length === 0) return null;
  const worst = criteria.reduce((left, right) =>
    outcomePriority[right.outcome] < outcomePriority[left.outcome] ? right : left,
  );
  return {
    subject: "instrument",
    outcome: worst.outcome,
    mandate: worst.mandate,
    request: worst.request,
    origin: worst.origin,
    observedAt: worst.observedAt,
  };
}

/**
 * Whether this candidate rests on a confirmed mandate, on what the fund did, or on a record.
 *
 * An unconfirmed declaration lands in `public_record` on purpose. A box typed into a legacy row
 * that nobody ever confirmed is a record we hold, not a statement the fund is accountable for,
 * and the per-criterion `origin` keeps the exact provenance so nothing is lost by saying so.
 */
export function candidateEvidenceSource(
  criteria: readonly CandidateCriterion[],
  record: CandidateMandateRecord | null,
  sourceClass: "directory" | "registered",
): CandidateEvidenceSource {
  if (sourceClass === "registered" && record && record.effectiveStatus === "confirmed" && record.confirmedAt) {
    return "confirmed_mandate";
  }
  const ranks = criteria
    .map((criterion) => criterion.origin)
    .filter((origin): origin is MandateEvidenceProvenance => origin !== null)
    .map((origin) => provenanceRank[origin]);
  if (ranks.length === 0) return "public_record";
  return Math.min(...ranks) === provenanceRank.observed ? "historical_activity" : "public_record";
}

export function classifyCandidate(input: {
  criteria: readonly CandidateCriterion[];
  record: CandidateMandateRecord | null;
  sourceClass: "directory" | "registered";
}): CandidateFit {
  const {criteria, record, sourceClass} = input;
  const evidenceSource = candidateEvidenceSource(criteria, record, sourceClass);

  const incompatibilities = criteria
    .filter((criterion) => criterion.hard && criterion.outcome === "excluded")
    .map((criterion) => criterion.id)
    .sort();
  const unverified = criteria
    .filter((criterion) => criterion.hard && criterion.outcome === "not_assessed")
    .map((criterion) => criterion.id)
    .sort();
  const openQuestions = criteria
    .filter((criterion) => criterion.outcome === "unknown")
    .map((criterion) => criterion.id)
    .sort();

  const adherence = adherenceSubjects.map((subject) => {
    const combined = combine(criteria.filter((criterion) => criteriaBySubject[subject].includes(criterion.id)));
    return combined
      ? {...combined, subject}
      : {subject, outcome: "not_assessed" as const, mandate: null, request: null, origin: null, observedAt: null};
  });

  const classification: CandidateClassification =
    incompatibilities.length > 0
      ? "excluded"
      : evidenceSource === "confirmed_mandate" && unverified.length === 0
        ? "eligible"
        : "hypothesis";

  return {
    version: candidateFitVersion,
    evidenceSource,
    classification,
    incompatibilities,
    unverified,
    openQuestions,
    adherence,
    mandateVersion: record?.versionNumber ?? null,
    mandateStatus: record?.effectiveStatus ?? null,
    confirmedAt: record?.confirmedAt ?? null,
  };
}
