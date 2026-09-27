/**
 * A ratio of the desk or of the trajectory that is absent (stage 19, second polish).
 *
 * A ratio over a zero denominator is not a number. The desk used to publish it as a division prints
 * it ("Infinity", "NaN"); it now publishes it as absent: the field is null, the ratio is listed in
 * `absentRatios` with what is zero, and wherever a person reads it (the desk and committee screens,
 * the materials, the findings, the verdict, the questions) the gap is named in plain words in place
 * of a number. An absent ratio is never compared with a threshold. The list is present only when a
 * ratio is absent, so a desk without one is published exactly as before.
 */

/** What is zero under an absent ratio. */
export type RatioGap = "ebitda" | "cost_of_goods_sold" | "interest_with_ask" | "burn_with_service" | "projected_ebitda" | "stressed_ebitda";

export type AbsentRatio = {
  /** The published field left absent, as a path in the output: `leverage.preTurns`, `years.2027.leverageBase`. */
  field: string;
  gap: RatioGap;
};

/** What is zero, in plain words. */
export const ratioGapReasons: Readonly<Record<RatioGap, {pt: string; en: string}>> = {
  ebitda: {pt: "EBITDA do último exercício igual a zero", en: "EBITDA for the latest financial year is zero"},
  cost_of_goods_sold: {pt: "custo das mercadorias vendidas do último exercício igual a zero", en: "cost of goods sold for the latest financial year is zero"},
  interest_with_ask: {pt: "despesa de juros somada aos juros do pedido igual a zero", en: "interest expense plus the interest on the ask is zero"},
  burn_with_service: {pt: "queima mensal somada aos juros mensais da captação igual a zero", en: "monthly burn plus the raise's monthly interest is zero"},
  projected_ebitda: {pt: "EBITDA projetado do ano igual a zero", en: "the year's projected EBITDA is zero"},
  stressed_ebitda: {pt: "EBITDA do ano no cenário cortado igual a zero", en: "the year's EBITDA in the cut case is zero"},
};

/**
 * The gap in plain words, as a screen, a material or a sentence prints it where the ratio would be:
 * "Alavancagem hoje: não calculável (EBITDA do último exercício igual a zero)".
 */
export const ratioGapLabels: Readonly<Record<RatioGap, {pt: string; en: string}>> = Object.fromEntries(
  Object.entries(ratioGapReasons).map(([gap, reason]) => [gap, {pt: `não calculável (${reason.pt})`, en: `not computable (${reason.en})`}]),
) as Record<RatioGap, {pt: string; en: string}>;

const divisionText = /^(?:-?Infinity|NaN)$/;

/** What a published field divides by, for a desk stored before absent ratios were published: its ratio then printed as the division gave it. */
function gapOfField(field: string): RatioGap {
  if (field === "leverage.interestCoveragePost") return "interest_with_ask";
  if (field === "runway.monthsPostAfterService") return "burn_with_service";
  if (/^workingCapital\./.test(field)) return "cost_of_goods_sold";
  if (/^years\.\d+\.(?:leverageBase|scheduleStrain)$/.test(field)) return "projected_ebitda";
  if (/^years\.\d+\.leverageStressed$/.test(field) || /^covenantProposal\./.test(field) || field === "peak") return "stressed_ebitda";
  return "ebitda";
}

/**
 * The gap of an absent ratio, in plain words, or null when the ratio is a number or was not computed
 * for another reason (an input the room does not carry). The gap is the one the output lists for the
 * field; a desk stored before absent ratios were published printed the ratio as the division gave it
 * ("Infinity", "NaN"), and that text is read as absent, by what the field divides by.
 */
export function absentRatioGap(
  output: {readonly absentRatios?: readonly AbsentRatio[]} | null | undefined,
  field: string,
  value: string | null | undefined,
): {pt: string; en: string} | null {
  const listed = output?.absentRatios?.find((entry) => entry.field === field);
  if (listed) return ratioGapLabels[listed.gap];
  return typeof value === "string" && divisionText.test(value) ? ratioGapLabels[gapOfField(field)] : null;
}

/** The years of absent ratios in a sentence: "2027", "2027 e 2028", "2027, 2028 and 2029". */
export function listYears(years: readonly number[], locale: "pt-BR" | "en-US"): string {
  return years.length <= 1 ? years.join("") : `${years.slice(0, -1).join(", ")} ${locale === "pt-BR" ? "e" : "and"} ${years.at(-1)}`;
}

/** A published ratio as a reader reads it: null when absent, including the text a division by zero printed before. */
export function publishedRatio(value: string | null | undefined): string | null {
  return value === null || value === undefined || divisionText.test(value) ? null : value;
}
