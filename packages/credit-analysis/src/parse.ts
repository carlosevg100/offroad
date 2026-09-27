import {
  annualRateForMonthlyRate, annualRateForPercentOfDi, composeIndexAndSpread, presentationFigure, readDocumentFigure, readDocumentPercent,
  type IndexedRateIndex,
} from "@offroad/financial-core";

/**
 * Reading the language a Brazilian debt schedule is actually written in.
 *
 * Rates arrive as prose: "CDI + 4,10% a.a.", "TLP + 2,90% a.a.", "1,42% a.m.", "112% do CDI",
 * "pré 16,5% a.a.". Comparing two contracts, or a stack against an ask, requires putting them
 * on one axis, and the axis a desk uses is effective annual cost at a stated index level. The
 * index level is an input with provenance, never a constant hidden here: the analysis says
 * "com CDI a 10,50%" out loud, because the whole comparison moves with it.
 *
 * Everything returns null rather than guessing. A rate this parser cannot read becomes an open
 * question in the analysis, not a silent zero, because a silent zero in a weighted cost is a
 * lie about every other number in the average.
 *
 * The grammar of the prose stays here; the figures it captures are read, turned into fractions and
 * compounded by `@offroad/financial-core` (stage 19, third polish): dots group thousands in threes,
 * a comma marks the decimals, a single dot that cannot group thousands marks the decimals, and any
 * other text is not a figure, so the whole reading is null. A captured figure starts and ends with a
 * digit, so the period that ends a sentence ("menor ou igual a 3,0.") is not part of it.
 */

export type ParsedRate =
  | {kind: "index_plus_spread"; index: "CDI" | "TLP" | "IPCA" | "SELIC" | "TR"; spreadAnnual: string}
  | {kind: "percent_of_index"; index: "CDI"; factor: string}
  | {kind: "fixed_annual"; annual: string}
  | {kind: "fixed_monthly"; monthly: string};

/** A percentage captured by the grammar, as a fraction at six decimals; null when it is not a figure. */
const rateFraction = (figure: string): string | null => readDocumentPercent({text: figure, decimals: 6}).value;

export function parseRate(text: string | null | undefined): ParsedRate | null {
  if (!text) return null;
  const value = text.trim().toLowerCase().replace(/\s+/g, " ");

  // "cdi + 4,10% a.a." / "tlp + 2,90% a.a." / "ipca + 7% a.a."
  const indexPlus = value.match(/^(cdi|tlp|ipca|selic|tr)\s*\+\s*(\d(?:[\d.,]*\d)?)\s*%(\s*a\.?a\.?)?$/);
  if (indexPlus) {
    const spreadAnnual = rateFraction(indexPlus[2]!);
    return spreadAnnual === null ? null : {kind: "index_plus_spread", index: indexPlus[1]!.toUpperCase() as "CDI" | "TLP" | "IPCA" | "SELIC" | "TR", spreadAnnual};
  }

  // "112% do cdi" / "112% cdi" / "104% do di" / "105% da taxa di" (DI and CDI are the same axis)
  const percentOf = value.match(/^(\d(?:[\d.,]*\d)?)\s*%\s*(?:d[oa]\s+)?(?:taxa\s+)?(?:cdi|di)$/);
  if (percentOf) {
    const factor = rateFraction(percentOf[1]!);
    return factor === null ? null : {kind: "percent_of_index", index: "CDI", factor};
  }

  // "1,42% a.m."
  const monthly = value.match(/^(?:pr[eé]\s+)?(\d(?:[\d.,]*\d)?)\s*%\s*a\.?m\.?$/);
  if (monthly) {
    const rate = rateFraction(monthly[1]!);
    return rate === null ? null : {kind: "fixed_monthly", monthly: rate};
  }

  // "16,5% a.a." / "pré 16,5% a.a." / "14,15% a.a. pré" / "14,15% a.a. pré-fixada"
  const annual = value.match(/^(?:pr[eé](?:-?fixad[oa])?\s+)?(\d(?:[\d.,]*\d)?)\s*%\s*a\.?a\.?(?:\s+pr[eé](?:-?fixad[oa])?)?$/);
  if (annual) {
    const rate = rateFraction(annual[1]!);
    return rate === null ? null : {kind: "fixed_annual", annual: rate};
  }

  return null;
}

/**
 * Effective annual cost at stated index levels.
 *
 * Monthly rates compound: 1,42% a.m. is 18,44% a.a., not 17,04%, and the difference is exactly
 * the kind of thing a schedule maintained by hand gets wrong in the company's favour. An index plus
 * a spread compounds too: "CDI + 4,10%" accrues (1 + CDI) × (1 + 4,10%) - 1, as the B3 formula
 * book and the indentures state, and "112% do CDI" applies 112% to each day's DI rate. The
 * composition itself comes from `@offroad/financial-core`.
 */
export function effectiveAnnualCost(rate: ParsedRate, indexLevels: {cdi: string; tlp?: string; ipca?: string; selic?: string; tr?: string}): string | null {
  const level = (name: string): string | null => (indexLevels as Record<string, string | undefined>)[name.toLowerCase()] ?? null;
  // The common axis at six decimals, half-up on the decimal value.
  const axis = (value: string) => presentationFigure({value, decimals: 6}).value;

  if (rate.kind === "fixed_annual") return axis(rate.annual);
  if (rate.kind === "fixed_monthly") return axis(annualRateForMonthlyRate({monthlyRate: rate.monthly}).value);
  if (rate.kind === "percent_of_index") {
    const cdi = level("cdi");
    return cdi === null ? null : axis(annualRateForPercentOfDi({annualDi: cdi, percentOfDi: rate.factor}).value);
  }
  const base = level(rate.index);
  const index: IndexedRateIndex = rate.index === "CDI" ? "DI" : rate.index;
  return base === null ? null : axis(composeIndexAndSpread({index, annualIndex: base, annualSpread: rate.spreadAnnual}).value);
}

/**
 * A leverage covenant, as contracts state it: "Dívida líquida/EBITDA <= 3,0x".
 *
 * Only the net-debt-to-EBITDA family is parsed for now, because it is what Brazilian
 * middle-market contracts overwhelmingly carry and it is the one this analysis can test
 * pre and post transaction from the numbers in the room.
 */
export type ParsedCovenant = {metric: "net_debt_ebitda"; maximum: string; original: string};

export function parseCovenant(text: string | null | undefined): ParsedCovenant | null {
  if (!text) return null;
  const value = text.trim().toLowerCase();
  const match = value.match(/d[ií]vida\s+l[ií]quida\s*\/\s*ebitda\s*(?:<=|≤|menor ou igual a)\s*(\d(?:[\d.,]*\d)?)\s*x?/);
  const figure = match ? readDocumentFigure({text: match[1]!}).value : null;
  if (figure === null) return null;
  return {metric: "net_debt_ebitda", maximum: presentationFigure({value: figure, decimals: 4}).value, original: text.trim()};
}

/**
 * A receivables coverage requirement, as collateral clauses state it: "Duplicatas 130%".
 *
 * The percentage is how much face value of receivables the lender requires per unit of
 * exposure, and it is what turns a list of collateral strings into an encumbrance number.
 */
export function parseReceivablesCoverage(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.trim().toLowerCase().match(/(?:duplicatas|receb[ií]veis)\s+(\d(?:[\d.,]*\d)?)\s*%/);
  if (!match) return null;
  return readDocumentPercent({text: match[1]!, decimals: 4}).value;
}

/** A cession clause: the receivables are assigned outright, so the exposure itself encumbers. */
export function isReceivablesCession(text: string | null | undefined): boolean {
  if (!text) return false;
  return /cedid|cess[aã]o/.test(text.trim().toLowerCase());
}
