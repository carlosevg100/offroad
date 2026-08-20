import {archetype, type ArchetypeId} from "@offroad/credit-playbook";

/**
 * What the market actually does for this kind of operation — and how we know.
 *
 * There are two entirely different constraints on a transaction, and this desk was conflating
 * them. The first is arithmetic: what the company's cash flow, collateral and leverage support.
 * The second is behavioural: what funds are willing to buy. A 160-month facility can pass every
 * coverage test and still be unplaceable, because a credit fund has its own investors to repay
 * on its own horizon, and no amount of DSCR fixes a tenor nobody holds.
 *
 * Telling a company "your cash flow carries 160 months" and stopping there is the failure mode:
 * beautiful on paper, and then silence from the market. The useful sentence is "your cash flow
 * carries 160 months; funds in this profile buy 48 to 72; we recommend 72, and the binding
 * constraint is the market, not you."
 *
 * **Provenance is the point of this module.** The playbook's bands are the desk's own view —
 * defensible, validated by a banker, and still an opinion. Presenting an opinion in the voice of
 * an observation is the thing that would embarrass us in a room with a fund manager, so a band
 * always says which it is:
 *
 * - `observed` — reconstructed from transactions that actually cleared, with the sample attached.
 *   "Fourteen operations of this profile in the last twelve months, 48 to 72 months" is a fact
 *   somebody can check and argue with.
 * - `playbook` — our own practice band, used when nothing has been observed yet. Honest, and
 *   labelled, so nobody mistakes it for evidence.
 *
 * The upgrade path is deliberately a data change and not a code change: when the fund directory
 * carries observed transactions, `observedBand` is built from them and everything downstream
 * starts citing a sample instead of citing us.
 */

export type BandProvenance = "observed" | "playbook";

export type MarketSample = {
  /** How many transactions the band was built from. */
  count: number;
  /** How far back they reach. A band from five years ago is not this market. */
  windowMonths: number;
  /** ISO date the observation window closed. */
  asOf: string;
};

export type MarketBand = {
  archetypeId: ArchetypeId;
  tenorMonths: {min: number; max: number};
  /** Net debt / EBITDA the market has been carrying, as a decimal string. */
  leverageCeiling: string;
  provenance: BandProvenance;
  /** Present only when `provenance` is `observed`. */
  sample?: MarketSample;
};

/**
 * The desk's own practice band, labelled as such.
 *
 * Used until the directory has enough observed transactions of a profile to speak for it. The
 * numbers are the playbook's, which is the right default — they were validated by somebody who
 * ran a desk for twenty years — but the label is what keeps the product honest.
 */
export function playbookBand(archetypeId: ArchetypeId): MarketBand {
  const definition = archetype(archetypeId);
  return {
    archetypeId,
    tenorMonths: {min: definition.structure.tenorMonths.typical[0], max: definition.structure.tenorMonths.typical[1]},
    leverageCeiling: definition.structure.leverageCeiling,
    provenance: "playbook",
  };
}

/**
 * How a band should describe itself when a company asks where the number came from.
 *
 * Two sentences that a reader can act on differently: one invites "says who?", and answers it;
 * the other admits it is a judgement and lets the reader weigh it as one.
 */
export function bandProvenanceNote(band: MarketBand): {pt: string; en: string} {
  if (band.provenance === "observed" && band.sample) {
    const {count, windowMonths} = band.sample;
    return {
      pt: `Faixa observada em ${count} ${count === 1 ? "operação" : "operações"} deste perfil nos últimos ${windowMonths} meses.`,
      en: `Range observed across ${count} ${count === 1 ? "transaction" : "transactions"} of this profile in the last ${windowMonths} months.`,
    };
  }
  return {
    pt: "Faixa de prática do desk, não observação de mercado. Ainda não temos operações comparáveis suficientes deste perfil.",
    en: "The desk's practice range, not a market observation. We do not yet have enough comparable transactions of this profile.",
  };
}

export type TenorVerdict = {
  /** The tenor to take to market. */
  recommended: number;
  /** What the company asked for, when it asked. */
  requested?: number;
  /**
   * Which constraint decided it.
   *
   * `market` is the one that matters most and the one this module exists to surface: the
   * company's numbers were fine and the market simply does not buy that shape.
   */
  binding: "market" | "request" | "default";
  band: MarketBand;
};

/**
 * Reconciles what the company asked for against what the market buys.
 *
 * A request inside the band is honoured — the market has room for it and there is nothing to
 * argue about. Outside it, the band wins, and `binding: "market"` is how the caller knows to
 * write "funds do not buy this shape" rather than "adjusted into the typical band", which reads
 * as a technicality and teaches nobody anything.
 */
export function reconcileTenor(band: MarketBand, requested: number | undefined): TenorVerdict {
  if (requested === undefined) {
    // With nothing asked for, the top of the band is the right proposal: longer tenor is easier
    // on coverage, and the ceiling is where the market stops rather than where it prefers.
    return {recommended: band.tenorMonths.max, binding: "default", band};
  }
  if (requested < band.tenorMonths.min) {
    return {recommended: band.tenorMonths.min, requested, binding: "market", band};
  }
  if (requested > band.tenorMonths.max) {
    return {recommended: band.tenorMonths.max, requested, binding: "market", band};
  }
  return {recommended: requested, requested, binding: "request", band};
}
