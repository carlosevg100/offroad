/**
 * Extracts financially material numeric expressions in a canonical form for evidence checks.
 *
 * Currency spacing is presentation, not meaning: `R$ 1,0` and `R$1,0` must resolve to the same
 * token. Keeping the canonicalization here shared prevents the origination and company-debt
 * graders from disagreeing about an otherwise identical public-source number.
 */
export function materialNumericTokens(value: string): string[] {
  const matches = value.match(/(?:R\$|US\$|BRL|USD)\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*(?:%|x|milh(?:ões|oes)|bilh(?:ões|oes)|months?|meses|anos)\b/gi) ?? [];
  return [...new Set(matches.map((match) => canonicalMaterialNumericToken(match)))];
}

function canonicalMaterialNumericToken(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/\s+/g, "");
}
