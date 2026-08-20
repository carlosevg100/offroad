import Decimal from "decimal.js";

import {catalogue} from "./catalogue";
import type {Instrument, InstrumentProfile, IssuerProfile} from "./types";

/**
 * Which instruments this company can actually use, which it cannot, and why.
 *
 * This answers the question the company came here unable to answer, and the shape of the answer
 * matters as much as the answer. A list of eligible instruments is a menu. What a desk gives is a
 * recommendation with the alternatives priced: "CCB. A debênture alcançaria mais investidores mas
 * exige virar S.A.; o CRA não se aplica porque o lastro não é agro." The blocked ones carry more
 * information than the eligible ones, because each blocked instrument tells the company something
 * true about itself that it can sometimes change.
 *
 * ## Two underwritings, not one
 *
 * Everything in the classic catalogue is repaid by cash generation, and this system sizes it with
 * DSCR and leverage over EBITDA. The venture track is repaid by the next round, and both of those
 * metrics are undefined or meaningless for a company burning cash on purpose. A desk that applies
 * one to the other tells a good startup it is uninvestable, which is not analysis but a category
 * error.
 *
 * So the assessment names which track it is on, and `capacityApplies` tells the caller whether
 * our capacity engine has anything useful to say. When it is false, the honest output is the
 * venture underwriting (round size, runway, recurring revenue) rather than a DSCR of zero
 * presented as a finding.
 */

export type Track = "cash_generation" | "venture";

export type BlockedReason = {
  eligibilityId: string;
  labels: {pt: string; en: string};
  explanation: {pt: string; en: string};
};

export type InstrumentVerdict = {
  instrument: Instrument;
  labels: {pt: string; en: string};
  status: "eligible" | "blocked";
  profile: InstrumentProfile;
  /** Every condition that failed. All of them, not the first: each one is a separate fact. */
  blockedBy: BlockedReason[];
  /** Weeks to funding, so the reader can weigh reach against urgency. */
  weeksToFunding: {min: number; max: number};
};

export type InstrumentAssessment = {
  track: Track;
  /**
   * Whether the DSCR and leverage machinery has anything to say about this company.
   *
   * False on the venture track. The caller must not present a coverage ratio computed from
   * negative EBITDA as though it were a finding.
   */
  capacityApplies: boolean;
  /** The recommendation, when one can be made. */
  recommended: Instrument | null;
  /** Why that one and not the others, written for the company to read. */
  rationale: {pt: string; en: string} | null;
  eligible: InstrumentVerdict[];
  blocked: InstrumentVerdict[];
  /**
   * What the company could change to unlock an instrument, most valuable first.
   *
   * Only conditions that are actually changeable appear here. "Your credit is not agribusiness"
   * is a fact about the company; "you are a limitada" is a decision it could revisit, and saying
   * which is which is the difference between advice and a list of rejections.
   */
  unlockable: Array<{instrument: Instrument; change: {pt: string; en: string}}>;
};

/** Conditions a company can act on, as opposed to facts about what it is. */
const CHANGEABLE = new Set(["legal_form", "minimum_size", "runway", "round_proportion"]);

/**
 * Ranking among the eligible.
 *
 * Reach first, because reaching more buyers is what produces competition and competition is what
 * produces tenor and price. Then speed, because a transaction that arrives after the need has
 * passed helped nobody. Deliberately not a score: the caller sees the order and the reasons.
 */
const REACH_ORDER: readonly Instrument[] = [
  "debenture_incentivada",
  "debenture",
  "cri",
  "cra",
  "nota_comercial",
  "fidc",
  "cdca",
  "venture_debt",
  "ccb",
  "finame",
  "project_finance",
  "cpr",
  "revenue_based_financing",
  "leasing",
  "receivables_purchase",
  "mutuo_conversivel",
  "direct_loan",
  "equity_kicker_debt",
];

const reachRank = (id: Instrument) => {
  const index = REACH_ORDER.indexOf(id);
  return index === -1 ? REACH_ORDER.length : index;
};

const VENTURE: readonly Instrument[] = ["venture_debt", "mutuo_conversivel", "revenue_based_financing"];

const money = (value: string) =>
  `R$ ${Number(value).toLocaleString("pt-BR", {maximumFractionDigits: 0})}`;

export function assessInstruments(issuer: IssuerProfile): InstrumentAssessment {
  // Venture-backed is the signal, not sector or size: a profitable software company raises like
  // any other company, and a capital-intensive startup with a round behind it does not.
  const track: Track = issuer.venturebacked === true ? "venture" : "cash_generation";

  const verdicts: InstrumentVerdict[] = catalogue.map((profile) => {
    const blockedBy = profile.eligibility
      .filter((condition) => !condition.test(issuer))
      .map((condition) => ({
        eligibilityId: condition.id,
        labels: condition.labels,
        explanation: condition.whenUnmet,
      }));

    return {
      instrument: profile.id,
      labels: profile.labels,
      status: blockedBy.length === 0 ? ("eligible" as const) : ("blocked" as const),
      profile,
      blockedBy,
      weeksToFunding: profile.weeksToFunding,
    };
  });

  // On the venture track the classic instruments are not wrong, they are simply not the
  // conversation: a startup can technically sign a CCB, and the lender who would sign it is
  // looking at the round, which is what venture debt already is.
  const relevant = verdicts.filter((verdict) =>
    track === "venture" ? true : !VENTURE.includes(verdict.instrument),
  );

  const eligible = relevant
    .filter((verdict) => verdict.status === "eligible")
    .sort(
      (a, b) =>
        reachRank(a.instrument) - reachRank(b.instrument) ||
        a.weeksToFunding.max - b.weeksToFunding.max,
    );

  const blocked = relevant
    .filter((verdict) => verdict.status === "blocked")
    // Nearly-eligible first: one failed condition is a conversation, four is a different company.
    .sort((a, b) => a.blockedBy.length - b.blockedBy.length || reachRank(a.instrument) - reachRank(b.instrument));

  const recommended = eligible[0]?.instrument ?? null;

  const unlockable = blocked
    .filter((verdict) => verdict.blockedBy.length === 1 && CHANGEABLE.has(verdict.blockedBy[0]!.eligibilityId))
    .map((verdict) => ({instrument: verdict.instrument, change: verdict.blockedBy[0]!.explanation}));

  return {
    track,
    capacityApplies: track === "cash_generation",
    recommended,
    rationale: recommended ? buildRationale(eligible, blocked, issuer, track) : null,
    eligible,
    blocked,
    unlockable,
  };
}

/**
 * The sentence a banker would say, assembled from what is actually true.
 *
 * It names the recommendation, the runner-up and why it lost, and the nearest blocked instrument
 * with what would unlock it. Three clauses, because that is what somebody can hold in their head
 * walking into a meeting.
 */
function buildRationale(
  eligible: InstrumentVerdict[],
  blocked: InstrumentVerdict[],
  issuer: IssuerProfile,
  track: Track,
): {pt: string; en: string} {
  const first = eligible[0]!;
  const second = eligible[1];
  const nearest = blocked.find((verdict) => verdict.blockedBy.length === 1);

  const opening = {
    pt: `Recomendamos ${first.labels.pt.toLowerCase()}${issuer.amount ? ` para os ${money(issuer.amount)} pretendidos` : ""}: entre o que a companhia pode usar hoje, é o que alcança o conjunto mais amplo de compradores, com montagem em ${first.weeksToFunding.min} a ${first.weeksToFunding.max} semanas.`,
    en: `We recommend ${first.labels.en.toLowerCase()}${issuer.amount ? ` for the ${money(issuer.amount)} sought` : ""}: among what the company can use today, it reaches the widest set of buyers, assembled in ${first.weeksToFunding.min} to ${first.weeksToFunding.max} weeks.`,
  };

  const runnerUp = second
    ? {
        pt: ` A alternativa seria ${second.labels.pt.toLowerCase()}, mais rápida em alguns casos e com alcance menor.`,
        en: ` The alternative would be ${second.labels.en.toLowerCase()}, faster in some cases and with narrower reach.`,
      }
    : {pt: "", en: ""};

  const unlock = nearest
    ? {
        pt: ` ${nearest.labels.pt} não está disponível: ${nearest.blockedBy[0]!.explanation.pt}`,
        en: ` ${nearest.labels.en} is not available: ${nearest.blockedBy[0]!.explanation.en}`,
      }
    : {pt: "", en: ""};

  const trackNote =
    track === "venture"
      ? {
          pt: " Como a companhia tem rodada institucional, a análise segue a régua de venture: tamanho da última rodada, receita recorrente e meses de caixa, e não cobertura por EBITDA.",
          en: " Because the company has an institutional round, the analysis follows the venture yardstick: last round size, recurring revenue and months of cash, rather than EBITDA coverage.",
        }
      : {pt: "", en: ""};

  return {
    pt: opening.pt + runnerUp.pt + unlock.pt + trackNote.pt,
    en: opening.en + runnerUp.en + unlock.en + trackNote.en,
  };
}

/**
 * How much venture debt the market would size against the last round.
 *
 * Separate from the eligibility test because a company under the ceiling still benefits from
 * being told where the ceiling is: the number is the negotiation, and arriving at it already
 * knowing the convention is worth more than being told no afterwards.
 */
export function ventureDebtCeiling(lastRoundAmount: string, proportion = "0.30"): string {
  return new Decimal(lastRoundAmount).times(proportion).toDecimalPlaces(2).toFixed();
}
