import {instruments} from "@offroad/credit-playbook";
import {composeCdiPlusBasisPoints, compareFigures, presentationFigure, presentationNumber, presentationSpread, shiftSpreadBand} from "@offroad/financial-core";

export const marketReferenceVersion = "2026.09.24-v1";

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
/**
 * The legacy instrument keys of `@offroad/credit-playbook`. `debenture_476` names the debenture for
 * professional investors under the CVM 160 automatic rite; the key stays because stored observations
 * carry it. The desk grid has no nota comercial row: no band is stated for it, so the grid returns
 * none, and the governed registry holds no nota comercial observation yet.
 */
export type PricedInstrument = "ccb" | "nce" | "debenture_476" | "debenture_160" | "nota_comercial" | "cra" | "cri" | "fidc" | "venture_debt" | "finame" | "leasing";

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

/**
 * The band of the indicative analytical profile in the words each language prints, never its key:
 * the price sentence, the committee screen and the memorandum name the band the same way.
 */
export const ratingBandLabels: Readonly<Record<RatingBand, {pt: string; en: string}>> = {
  strong: {pt: "forte", en: "strong"},
  adequate: {pt: "adequado", en: "adequate"},
  watch: {pt: "atenção", en: "watch"},
  weak: {pt: "fraco", en: "weak"},
  distressed: {pt: "crítico", en: "distressed"},
};

/**
 * An instrument of the grid by its name in the playbook catalog (`@offroad/credit-playbook`), never
 * by its key: "Cédula de Crédito Bancário (CCB)", not "ccb". Every instrument of the grid is in the
 * catalog (tested); an identifier outside it is named generically, never printed.
 */
export function pricedInstrumentLabel(instrument: string): {pt: string; en: string} {
  return instruments.find((entry) => entry.id === instrument)?.labels ?? {pt: "instrumento indicado", en: "instrument indicated"};
}

export type PriceAdjustment = {id: "tenor" | "security" | "coverage" | "size" | "leverage"; bps: number; rationale: {pt: string; en: string}};

/**
 * What each adjustment of a price is, in the words a memorandum prints: never the internal id of
 * `PriceAdjustment`. The grid applies the tenor, security, size and leverage adjustments; interest
 * coverage is named as the house names that factor, for a governed adjustment that carries it.
 */
export const priceAdjustmentLabels: Readonly<Record<PriceAdjustment["id"], {pt: string; en: string}>> = {
  tenor: {pt: "Ajuste pelo prazo", en: "Tenor adjustment"},
  security: {pt: "Ajuste pelas garantias", en: "Security adjustment"},
  coverage: {pt: "Ajuste pela cobertura de juros", en: "Interest coverage adjustment"},
  size: {pt: "Ajuste pelo tamanho do tíquete", en: "Ticket size adjustment"},
  leverage: {pt: "Ajuste pela alavancagem pós-operação", en: "Post-transaction leverage adjustment"},
};

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
  // Every threshold is an exact comparison on the decimal value (financial-core), never on a binary number.
  if (input.tenorMonths !== undefined) {
    if (compareFigures(input.tenorMonths, 60) > 0) adjustments.push({id: "tenor", bps: 40, rationale: {pt: "Prazo acima de 60 meses: o comprador cobra pela duração.", en: "Tenor above 60 months: the buyer charges for duration."}});
    else if (compareFigures(input.tenorMonths, 24) <= 0) adjustments.push({id: "tenor", bps: -20, rationale: {pt: "Prazo até 24 meses: risco de crédito menor no tempo.", en: "Tenor up to 24 months: less credit risk over time."}});
  }
  if (input.collateralCoverage !== undefined) {
    const coverage = input.collateralCoverage;
    if (compareFigures(coverage, "1.5") >= 0) adjustments.push({id: "security", bps: -60, rationale: {pt: "Cobertura de garantias de 1,5x ou mais: o papel é sênior garantido.", en: "Collateral coverage of 1.5x or more: senior secured paper."}});
    else if (compareFigures(coverage, "1.2") >= 0) adjustments.push({id: "security", bps: -30, rationale: {pt: "Cobertura de garantias entre 1,2x e 1,5x.", en: "Collateral coverage between 1.2x and 1.5x."}});
    else if (compareFigures(coverage, 1) < 0) adjustments.push({id: "security", bps: 50, rationale: {pt: "Garantias abaixo do tíquete: parte do papel é quirografária.", en: "Collateral below the ticket: part of the paper is unsecured."}});
  } else if (input.instrument === "ccb" || input.instrument === "debenture_476") {
    adjustments.push({id: "security", bps: 40, rationale: {pt: "Sem garantia real declarada: quirografário.", en: "No security stated: unsecured."}});
  }
  if (input.leveragePost !== undefined) {
    const leverage = input.leveragePost;
    if (compareFigures(leverage, "4.5") >= 0) adjustments.push({id: "leverage", bps: 75, rationale: {pt: "Alavancagem pós-operação em 4,5x ou mais: o papel entra na faixa onde o comprador exige prêmio.", en: "Post-transaction leverage at 4.5x or above: the paper enters the band where buyers demand a premium."}});
    else if (compareFigures(leverage, "3.5") >= 0) adjustments.push({id: "leverage", bps: 35, rationale: {pt: "Alavancagem pós-operação entre 3,5x e 4,5x.", en: "Post-transaction leverage between 3.5x and 4.5x."}});
    else if (compareFigures(leverage, "2.5") < 0) adjustments.push({id: "leverage", bps: -25, rationale: {pt: "Alavancagem pós-operação abaixo de 2,5x: o papel compete com emissor melhor classificado.", en: "Post-transaction leverage below 2.5x: the paper competes with better-rated issuers."}});
  }
  if (input.amount !== undefined && compareFigures(input.amount, "10000000") < 0) {
    adjustments.push({id: "size", bps: 50, rationale: {pt: "Tíquete abaixo de R$ 10 milhões: custo fixo de estruturação pesa no spread.", en: "Ticket under R$ 10 million: fixed set-up cost weighs on the spread."}});
  }
  // The band moves by the exact sum of its adjustments, and DI plus spread compounds:
  // (1 + CDI) × (1 + spread) - 1, the B3 convention, never the sum. Both are financial-core kernels.
  const band = shiftSpreadBand({minBps: base.bps.min, maxBps: base.bps.max, adjustmentsBps: adjustments.map((adjustment) => adjustment.bps)});
  const bps = {min: presentationNumber(band.min).value, max: presentationNumber(band.max).value};
  const composed = (spreadBps: string) => composeCdiPlusBasisPoints({annualCdi: input.cdi, spreadBps}).value;
  const fourDecimals = (value: string) => presentationFigure({value, decimals: 4}).value;
  const allIn = {min: fourDecimals(composed(band.min)), max: fourDecimals(composed(band.max)), cdi: fourDecimals(input.cdi)};
  // The sentence's conversions are financial-core kernels on the decimal value: the spread in basis
  // points as a signed percentage, and the all-in rates as percentages at two decimals.
  const spreadText = (value: number, locale: "pt" | "en") => {
    const spread = presentationSpread({bps: value});
    return `${spread.sign} ${locale === "pt" ? spread.magnitude.replace(".", ",") : spread.magnitude}`;
  };
  const fmtBps = (value: number) => spreadText(value, "pt");
  const fmtBpsEn = (value: number) => spreadText(value, "en");
  const percent = (rate: string, locale: "pt" | "en") => {
    const figure = presentationFigure({value: rate, scale: "percent", decimals: 2}).value;
    return locale === "pt" ? figure.replace(".", ",") : figure;
  };
  // The basis names the instrument by its catalog name and the analytical profile by its band, in
  // words, as the memorandum prints it: never the internal key of either.
  const instrumentName = pricedInstrumentLabel(input.instrument);
  const bandName = ratingBandLabels[input.rating];
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
      pt: `CDI ${fmtBps(bps.min)}% a CDI ${fmtBps(bps.max)}% a.a. (${percent(allIn.min, "pt")}% a ${percent(allIn.max, "pt")}% a.a. com CDI a ${percent(allIn.cdi, "pt")}%). Base: ${instrumentName.pt}; perfil analítico: ${bandName.pt}; faixa de ${base.bps.min} a ${base.bps.max} bps${adjustments.length ? `; ajustes: ${adjustments.map((a) => `${compareFigures(a.bps, 0) >= 0 ? "+" : ""}${a.bps} bps (${a.rationale.pt})`).join(", ")}` : ""}. ${prov.pt}`,
      en: `CDI ${fmtBpsEn(bps.min)}% to CDI ${fmtBpsEn(bps.max)}% p.a. (${percent(allIn.min, "en")}% to ${percent(allIn.max, "en")}% p.a. at CDI ${percent(allIn.cdi, "en")}%). Base: ${instrumentName.en}; analytical profile: ${bandName.en}; range of ${base.bps.min} to ${base.bps.max} bps${adjustments.length ? `; adjustments: ${adjustments.map((a) => `${compareFigures(a.bps, 0) >= 0 ? "+" : ""}${a.bps} bps (${a.rationale.en})`).join(", ")}` : ""}. ${prov.en}`,
    },
  };
}

export * from "./pricing-truth";

export * from "./decision-reference";
