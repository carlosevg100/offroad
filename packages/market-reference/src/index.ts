import Decimal from "decimal.js";

/**
 * What this kind of paper costs for this kind of credit, as the desk's reference and nothing
 * more.
 *
 * A pricing sentence in a term sheet has to say where the number came from. This package is
 * the desk's practice bands: spread over CDI (or real rate over IPCA) by instrument and by
 * internal rating band, with the adjustments a lender actually applies for tenor and
 * security. Every band carries its provenance, and the provenance is "desk practice, stated
 * on 21/08/2026", not an observation of closed deals, because the product has not yet seen
 * enough closed deals to say otherwise. When it has, the bands become observed, with a sample
 * size, and the sentence changes. Inventing transactions to make the bands look observed
 * would be the one thing this package must never do.
 */

export type RatingBand = "strong" | "adequate" | "watch" | "weak" | "distressed";
export type PricedInstrument = "ccb" | "nce" | "debenture_476" | "debenture_160" | "cra" | "cri" | "fidc" | "venture_debt" | "finame" | "leasing";

export type SpreadBand = {
  instrument: PricedInstrument;
  rating: RatingBand;
  /** Basis points over CDI, the band a desk quotes before tenor and security. */
  bps: {min: number; max: number};
};

export type BandProvenance = {kind: "desk_practice"; statedOn: string} | {kind: "observed"; sample: number; windowMonths: number};

export const provenance: BandProvenance = {kind: "desk_practice", statedOn: "2026-08-21"};

const band = (instrument: PricedInstrument, rating: RatingBand, min: number, max: number): SpreadBand => ({instrument, rating, bps: {min, max}});

/**
 * The grid. Columns are the rating band; rows the instrument. Distressed is priced only where
 * a lender would still look (CCB with security, FIDC on the portfolio); elsewhere it is closed
 * and the term sheet says so instead of quoting a number nobody would pay.
 */
export const spreadBands: readonly SpreadBand[] = [
  band("ccb", "strong", 180, 280), band("ccb", "adequate", 280, 400), band("ccb", "watch", 400, 550), band("ccb", "weak", 550, 800), band("ccb", "distressed", 800, 1200),
  band("nce", "strong", 120, 200), band("nce", "adequate", 200, 300), band("nce", "watch", 300, 420), band("nce", "weak", 420, 600),
  band("debenture_476", "strong", 100, 180), band("debenture_476", "adequate", 180, 280), band("debenture_476", "watch", 280, 400), band("debenture_476", "weak", 400, 600),
  band("debenture_160", "strong", 90, 160), band("debenture_160", "adequate", 160, 250), band("debenture_160", "watch", 250, 350),
  band("cra", "strong", 40, 110), band("cra", "adequate", 110, 190), band("cra", "watch", 190, 300), band("cra", "weak", 300, 450),
  band("cri", "strong", 60, 130), band("cri", "adequate", 130, 210), band("cri", "watch", 210, 330), band("cri", "weak", 330, 480),
  band("fidc", "strong", 180, 260), band("fidc", "adequate", 260, 380), band("fidc", "watch", 380, 520), band("fidc", "weak", 520, 700), band("fidc", "distressed", 700, 900),
  band("venture_debt", "strong", 450, 650), band("venture_debt", "adequate", 650, 850), band("venture_debt", "watch", 850, 1100), band("venture_debt", "weak", 1100, 1400),
  band("finame", "strong", -250, -100), band("finame", "adequate", -200, -50), band("finame", "watch", -100, 100),
  band("leasing", "strong", 180, 280), band("leasing", "adequate", 280, 400), band("leasing", "watch", 400, 550), band("leasing", "weak", 550, 750),
];

export type PriceAdjustment = {id: "tenor" | "security" | "coverage" | "size" | "leverage"; bps: number; rationale: {pt: string; en: string}};

export type IndicativePrice = {
  instrument: PricedInstrument;
  rating: RatingBand;
  /** Basis points over CDI after adjustments, as a range. */
  bps: {min: number; max: number};
  /** The same as an annual rate at the stated CDI, as decimal strings. */
  allIn: {min: string; max: string; cdi: string};
  base: SpreadBand;
  adjustments: PriceAdjustment[];
  provenance: BandProvenance;
  sentence: {pt: string; en: string};
};

export type PriceInput = {
  instrument: PricedInstrument;
  rating: RatingBand;
  /** CDI as a decimal, for the all-in. */
  cdi: string;
  tenorMonths?: number;
  /** Collateral coverage achieved, as a multiple of the ticket; absent means unsecured. */
  collateralCoverage?: string;
  /** Ticket in reais; very small tickets price wider. */
  amount?: string;
  /**
   * Net debt over EBITDA after the operation, as a decimal string.
   *
   * The band is a rating band, and the rating is of the company as it stands. Two structures on
   * the same company differ in what they leave behind, and leverage is the driver a desk prices
   * that difference with: a bigger ticket that clears a later maturity is not the same paper as
   * a smaller one, and quoting both at the same spread makes the comparison useless.
   */
  leveragePost?: string;
};

export function indicativePrice(input: PriceInput): IndicativePrice | null {
  const base = spreadBands.find((entry) => entry.instrument === input.instrument && entry.rating === input.rating);
  if (!base) return null;
  const adjustments: PriceAdjustment[] = [];
  if (input.tenorMonths !== undefined) {
    if (input.tenorMonths > 60) adjustments.push({id: "tenor", bps: 40, rationale: {pt: "Prazo acima de 60 meses: o comprador cobra pela duração.", en: "Tenor above 60 months: the buyer charges for duration."}});
    else if (input.tenorMonths <= 24) adjustments.push({id: "tenor", bps: -20, rationale: {pt: "Prazo até 24 meses: risco de crédito menor no tempo.", en: "Tenor up to 24 months: less credit risk over time."}});
  }
  if (input.collateralCoverage !== undefined) {
    const coverage = new Decimal(input.collateralCoverage);
    if (coverage.gte("1.5")) adjustments.push({id: "security", bps: -60, rationale: {pt: "Cobertura de garantias de 1,5x ou mais: o papel é sênior garantido.", en: "Collateral coverage of 1.5x or more: senior secured paper."}});
    else if (coverage.gte("1.2")) adjustments.push({id: "security", bps: -30, rationale: {pt: "Cobertura de garantias entre 1,2x e 1,5x.", en: "Collateral coverage between 1.2x and 1.5x."}});
    else if (coverage.lt("1")) adjustments.push({id: "security", bps: 50, rationale: {pt: "Garantias abaixo do tíquete: parte do papel é quirografária.", en: "Collateral below the ticket: part of the paper is unsecured."}});
  } else if (input.instrument === "ccb" || input.instrument === "debenture_476") {
    adjustments.push({id: "security", bps: 40, rationale: {pt: "Sem garantia real declarada: quirografário.", en: "No security stated: unsecured."}});
  }
  if (input.leveragePost !== undefined) {
    const leverage = new Decimal(input.leveragePost);
    if (leverage.gte("4.5")) adjustments.push({id: "leverage", bps: 75, rationale: {pt: "Alavancagem pós-operação em 4,5x ou mais: o papel entra na faixa onde o comprador exige prêmio.", en: "Post-transaction leverage at 4.5x or above: the paper enters the band where buyers demand a premium."}});
    else if (leverage.gte("3.5")) adjustments.push({id: "leverage", bps: 35, rationale: {pt: "Alavancagem pós-operação entre 3,5x e 4,5x.", en: "Post-transaction leverage between 3.5x and 4.5x."}});
    else if (leverage.lt("2.5")) adjustments.push({id: "leverage", bps: -25, rationale: {pt: "Alavancagem pós-operação abaixo de 2,5x: o papel compete com emissor melhor classificado.", en: "Post-transaction leverage below 2.5x: the paper competes with better-rated issuers."}});
  }
  if (input.amount !== undefined && new Decimal(input.amount).lt("10000000")) {
    adjustments.push({id: "size", bps: 50, rationale: {pt: "Tíquete abaixo de R$ 10 milhões: custo fixo de estruturação pesa no spread.", en: "Ticket under R$ 10 million: fixed set-up cost weighs on the spread."}});
  }
  const shift = adjustments.reduce((sum, adjustment) => sum + adjustment.bps, 0);
  const bps = {min: base.bps.min + shift, max: base.bps.max + shift};
  const cdi = new Decimal(input.cdi);
  const allIn = {min: cdi.plus(new Decimal(bps.min).div(10_000)).toFixed(4), max: cdi.plus(new Decimal(bps.max).div(10_000)).toFixed(4), cdi: cdi.toFixed(4)};
  const fmtBps = (value: number) => `${value >= 0 ? "+" : "-"} ${Math.abs(value) / 100}`.replace(".", ",");
  const fmtBpsEn = (value: number) => `${value >= 0 ? "+" : "-"} ${Math.abs(value) / 100}`;
  const prov = provenance.kind === "desk_practice"
    ? {pt: `Faixa de prática da mesa, declarada em ${provenance.statedOn}; não é observação de operações fechadas.`, en: `The desk's practice band, stated on ${provenance.statedOn}; not an observation of closed transactions.`}
    : {pt: `Faixa observada em ${provenance.sample} operações nos últimos ${provenance.windowMonths} meses.`, en: `Band observed across ${provenance.sample} transactions in the last ${provenance.windowMonths} months.`};
  return {
    instrument: input.instrument,
    rating: input.rating,
    bps,
    allIn,
    base,
    adjustments,
    provenance,
    sentence: {
      pt: `CDI ${fmtBps(bps.min)}% a CDI ${fmtBps(bps.max)}% a.a. (${(Number(allIn.min) * 100).toFixed(2).replace(".", ",")}% a ${(Number(allIn.max) * 100).toFixed(2).replace(".", ",")}% a.a. com CDI a ${(Number(allIn.cdi) * 100).toFixed(2).replace(".", ",")}%). Base: banda ${input.rating} para ${input.instrument}, ${base.bps.min} a ${base.bps.max} bps${adjustments.length ? `; ajustes: ${adjustments.map((a) => `${a.bps >= 0 ? "+" : ""}${a.bps} bps (${a.rationale.pt})`).join(", ")}` : ""}. ${prov.pt}`,
      en: `CDI ${fmtBpsEn(bps.min)}% to CDI ${fmtBpsEn(bps.max)}% p.a. (${(Number(allIn.min) * 100).toFixed(2)}% to ${(Number(allIn.max) * 100).toFixed(2)}% p.a. at CDI ${(Number(allIn.cdi) * 100).toFixed(2)}%). Base: ${input.rating} band for ${input.instrument}, ${base.bps.min} to ${base.bps.max} bps${adjustments.length ? `; adjustments: ${adjustments.map((a) => `${a.bps >= 0 ? "+" : ""}${a.bps} bps (${a.rationale.en})`).join(", ")}` : ""}. ${prov.en}`,
    },
  };
}
