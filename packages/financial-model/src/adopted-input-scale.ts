/** Unit scale must be declared. The basis reader does not distinguish raw from previously
 * normalized assertions, so a non-unit scale cannot safely be applied or silently ignored. */
export const hasUnitScale = (scale: string | null) => typeof scale === "string" && /^1(?:\.0+)?$/.test(scale);
