/**
 * Extracts financially material numeric expressions in a canonical form for evidence checks.
 *
 * Currency spacing is presentation, not meaning: `R$ 1,0` and `R$1,0` must resolve to the same
 * token. Keeping the canonicalization here shared prevents the origination and company-debt
 * graders from disagreeing about an otherwise identical public-source number.
 */
export function materialNumericTokens(value: string): string[] {
  const amount = "-?(?:\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)";
  const matches = value.match(new RegExp(`(?:R\\$|US\\$|BRL|USD)\\s*${amount}|\\b${amount}\\s*(?:%|x|milh(?:ões|oes)|bilh(?:ões|oes)|million|billion|thousand|months?|meses|anos)\\b`, "gi")) ?? [];
  return [...new Set(matches.map((match) => canonicalMaterialNumericToken(match)))];
}

function canonicalMaterialNumericToken(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/\s+/g, "");
}
