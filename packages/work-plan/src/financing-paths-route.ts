/**
 * Ficha C32 (lote 4, evaluate-financing-paths): the five ficha phrasings, each the whole construction (folded,
 * anchored at both ends, only the final punctuation free). origin/main routes all five to capital_strategy; only
 * these leave it. Any other capital strategy request keeps the capital structure procedure.
 *
 * The text is folded (NFKD, combining marks removed, lower case) and its whitespace collapsed before it reaches these patterns.
 */

/** The kinds this route may take a message from. */
export const financingPathsPromotableKinds = ["capital_strategy", "ambiguous", "documents_to_case"] as const;

export const financingPathsCues: readonly RegExp[] = [
  // "Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?"
  /^(?:precisamos|preciso|queremos|quero|temos que|tenho que) financiar (?:a|o|uma|um) (?:linha nova|nova linha|expansao|investimento|projeto|capex|fabrica nova|nova fabrica)(?: de [a-z ]{1,40})? e (?:reduzir|aliviar|resolver) (?:a pressao d[oa]s |os )?vencimentos(?: d[oa]s [a-z0-9 ]{1,40})?(?:[.,;]? (?:que|quais) caminhos (?:fazem sentido|existem|temos))?[?.!]*$/,
  // "Vence muita coisa ano que vem e ainda quero fazer o investimento. O que eu faço?"
  /^vencem? muita coisa (?:no )?ano que vem e (?:ainda )?(?:quero|queremos|preciso|precisamos) fazer o (?:investimento|capex|projeto)[.,;]? (?:o que (?:eu |a gente )?(?:faco|fazemos)|por onde (?:comeco|comecamos))[?.!]*$/,
  // "Como financio a expansão sem apertar o caixa?"
  /^como (?:financio|financiamos|financiar) (?:a expansao|o investimento|o capex|o projeto|a linha nova|a nova linha) sem apertar o caixa[?.!]*$/,
  // "Quero alongar a dívida e fazer o capex. Por onde começo?"
  /^(?:quero|queremos|preciso|precisamos) alongar a divida e fazer o (?:capex|investimento|projeto)[.,;]? (?:por onde (?:comeco|comecamos)|o que (?:eu )?faco)[?.!]*$/,
  // "Não quero recomendação ainda, só me mostre os caminhos para a dívida de 2027."
  /^nao quero recomendacao ainda[,;.]? (?:so )?me mostre os caminhos para a divida de \d{4}[.!]*$/,
];

/** Whether a folded message is one of the ficha C32 constructions. */
export function asksForFinancingPaths(folded: string): boolean {
  const text = folded.replace(/\s+/g, " ").trim();
  return financingPathsCues.some((p) => p.test(text));
}

/** The route of a folded message given the kind the existing routes gave it: C32 only from a promotable kind. */
export function financingPathsRoute<K extends string>(folded: string, existing: K): K | "financing_paths" {
  return (financingPathsPromotableKinds as readonly string[]).includes(existing) && asksForFinancingPaths(folded) ? "financing_paths" : existing;
}
