import Decimal from "decimal.js";

/** Annual straight-line vintage schedule, with zero residual value explicitly selected.
 * A half-year vintage depreciates half in its first and last year; never beyond cost.
 */
export function calculateAnnualCapexDepreciation(input: {
  amountsByYear: readonly string[];
  usefulLifeYears: number;
  convention: "next_period" | "half_year";
  yearIndex: number;
}): {value: string; vintages: readonly {yearIndex:number;amount:string;factor:string;depreciation:string}[]} {
  if (!Number.isSafeInteger(input.usefulLifeYears) || input.usefulLifeYears <= 0) throw new RangeError("useful life must be positive whole years");
  if (!Number.isSafeInteger(input.yearIndex) || input.yearIndex < 0 || input.yearIndex >= input.amountsByYear.length) throw new RangeError("year index outside capex schedule");
  if (!["next_period", "half_year"].includes(input.convention)) throw new RangeError("unsupported depreciation convention");
  const vintages = input.amountsByYear.map((value, yearIndex) => {
    const amount = new Decimal(value);
    if (!amount.isFinite() || amount.lt(0)) throw new RangeError("capex must be finite and nonnegative");
    const age = input.yearIndex - yearIndex;
    const factor = input.convention === "next_period"
      ? age >= 1 && age <= input.usefulLifeYears ? "1" : "0"
      : age < 0 || age > input.usefulLifeYears ? "0" : age === 0 || age === input.usefulLifeYears ? "0.5" : "1";
    return {yearIndex, amount:amount.toFixed(), factor, depreciation:amount.div(input.usefulLifeYears).mul(factor).toFixed()};
  });
  return {value:vintages.reduce((total,row)=>total.plus(row.depreciation),new Decimal(0)).toFixed(),vintages};
}
