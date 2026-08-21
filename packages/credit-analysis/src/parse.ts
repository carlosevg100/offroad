import Decimal from "decimal.js";

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
 */

export type ParsedRate =
  | {kind: "index_plus_spread"; index: "CDI" | "TLP" | "IPCA" | "SELIC"; spreadAnnual: string}
  | {kind: "percent_of_index"; index: "CDI"; factor: string}
  | {kind: "fixed_annual"; annual: string}
  | {kind: "fixed_monthly"; monthly: string};

const decimalFrom = (raw: string): Decimal => new Decimal(raw.replace(/\./g, "").replace(",", "."));

export function parseRate(text: string | null | undefined): ParsedRate | null {
  if (!text) return null;
  const value = text.trim().toLowerCase().replace(/\s+/g, " ");

  // "cdi + 4,10% a.a." / "tlp + 2,90% a.a." / "ipca + 7% a.a."
  const indexPlus = value.match(/^(cdi|tlp|ipca|selic)\s*\+\s*([\d.,]+)\s*%(\s*a\.?a\.?)?$/);
  if (indexPlus) {
    return {
      kind: "index_plus_spread",
      index: indexPlus[1]!.toUpperCase() as "CDI" | "TLP" | "IPCA" | "SELIC",
      spreadAnnual: decimalFrom(indexPlus[2]!).div(100).toFixed(6),
    };
  }

  // "112% do cdi" / "112% cdi" / "104% do di" / "105% da taxa di" (DI and CDI are the same axis)
  const percentOf = value.match(/^([\d.,]+)\s*%\s*(?:d[oa]\s+)?(?:taxa\s+)?(?:cdi|di)$/);
  if (percentOf) {
    return {kind: "percent_of_index", index: "CDI", factor: decimalFrom(percentOf[1]!).div(100).toFixed(6)};
  }

  // "1,42% a.m."
  const monthly = value.match(/^(?:pr[eé]\s+)?([\d.,]+)\s*%\s*a\.?m\.?$/);
  if (monthly) {
    return {kind: "fixed_monthly", monthly: decimalFrom(monthly[1]!).div(100).toFixed(6)};
  }

  // "16,5% a.a." / "pré 16,5% a.a." / "14,15% a.a. pré" / "14,15% a.a. pré-fixada"
  const annual = value.match(/^(?:pr[eé](?:-?fixad[oa])?\s+)?([\d.,]+)\s*%\s*a\.?a\.?(?:\s+pr[eé](?:-?fixad[oa])?)?$/);
  if (annual) {
    return {kind: "fixed_annual", annual: decimalFrom(annual[1]!).div(100).toFixed(6)};
  }

  return null;
}

/**
 * Effective annual cost at stated index levels.
 *
 * Monthly rates compound: 1,42% a.m. is 18,45% a.a., not 17,04%, and the difference is exactly
 * the kind of thing a schedule maintained by hand gets wrong in the company's favour.
 */
export function effectiveAnnualCost(rate: ParsedRate, indexLevels: {cdi: string; tlp?: string; ipca?: string; selic?: string}): string | null {
  const level = (name: string): Decimal | null => {
    const value = (indexLevels as Record<string, string | undefined>)[name.toLowerCase()];
    return value === undefined ? null : new Decimal(value);
  };

  if (rate.kind === "fixed_annual") return new Decimal(rate.annual).toFixed(6);
  if (rate.kind === "fixed_monthly") return new Decimal(rate.monthly).plus(1).pow(12).minus(1).toFixed(6);
  if (rate.kind === "percent_of_index") {
    const cdi = level("cdi");
    return cdi === null ? null : cdi.times(rate.factor).toFixed(6);
  }
  const base = level(rate.index);
  return base === null ? null : base.plus(rate.spreadAnnual).toFixed(6);
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
  const match = value.match(/d[ií]vida\s+l[ií]quida\s*\/\s*ebitda\s*(?:<=|≤|menor ou igual a)\s*([\d.,]+)\s*x?/);
  if (!match) return null;
  return {metric: "net_debt_ebitda", maximum: decimalFrom(match[1]!).toFixed(4), original: text.trim()};
}

/**
 * A receivables coverage requirement, as collateral clauses state it: "Duplicatas 130%".
 *
 * The percentage is how much face value of receivables the lender requires per unit of
 * exposure, and it is what turns a list of collateral strings into an encumbrance number.
 */
export function parseReceivablesCoverage(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.trim().toLowerCase().match(/(?:duplicatas|receb[ií]veis)\s+([\d.,]+)\s*%/);
  if (!match) return null;
  return decimalFrom(match[1]!).div(100).toFixed(4);
}

/** A cession clause: the receivables are assigned outright, so the exposure itself encumbers. */
export function isReceivablesCession(text: string | null | undefined): boolean {
  if (!text) return false;
  return /cedid|cess[aã]o/.test(text.trim().toLowerCase());
}
