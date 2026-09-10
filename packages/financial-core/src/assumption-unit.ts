import Decimal from "decimal.js";

/** Converts a declared presentation unit; never guesses a unit or parses prose. */
export function normalizeDeclaredAssumptionValue(value:string,unit:"percent"|"currency"|"days"|"multiple"|"quantity"|"index"):{value:string;input:string;conversion:"percent_to_ratio"|"identity"} {
  if(!/^-?\d+(?:\.\d+)?$/.test(value)||value.length>80)throw new RangeError("a bounded decimal value is required");
  if(!["percent","currency","days","multiple","quantity","index"].includes(unit))throw new RangeError("declared unit required");
  const ExactDecimal=Decimal.clone({precision:120});
  const numeric=new ExactDecimal(value);
  if(!numeric.isFinite())throw new RangeError("finite value required");
  return {value:unit==="percent"?numeric.div(100).toFixed():numeric.toFixed(),input:value,conversion:unit==="percent"?"percent_to_ratio":"identity"};
}
