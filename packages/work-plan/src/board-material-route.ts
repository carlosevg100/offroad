/**
 * Ficha C47 (lote 4, prepare-board-capital-discussion): preparing the board's capital structure discussion. The route
 * promotes a board decision message that asks to prepare (make, assemble) the discussion, material, deck, page,
 * agenda or outline for the board, and, by one ficha exception, the board material or deck on capital structure,
 * financing or debt that origin/main sends to material preparation. A memo, an answer to a board question, the debt
 * table, the updated indebtedness and the quarter's update keep their own routes; board material on another topic
 * stays material preparation.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

/** The ficha's construction: the verb governs the object directly (prepare, make or assemble the discussion, material, deck, page,
 * agenda or outline) and the board is named, or a board meeting on a stated day with a request to prepare it. */
export const boardMaterialCue = new RegExp([
  String.raw`\b(?:prepar\w*|mont\w*|faz|faca|fazer|organiz\w*)\s+(?:(?:a|o|uma|um|nossa|nosso|essa|esse)\s+)?(?:discussao|material|deck|pagina|apresentacao|pauta|roteiro)\b[^.?!]{0,60}\b(?:conselho|board)\b`,
  String.raw`\b(?:conselho|board)\b[^.?!]{0,40}\b(?:na|nesta|nessa|na proxima|dia)\s+(?:segunda|terca|quarta|quinta|sexta|\d{1,2})\b[^?!]{0,30}\bprepar\w*\s+(?:(?:a|o|uma|um)\s+)?(?:discussao|material|deck|apresentacao|pauta|roteiro)\b`,
].join("|"));
/** The capital topic the method serves: capital structure, financing, debt, maturities, leverage or the paths to fund. */
export const boardCapitalTopic = /\b(?:estrutura de capital|financiamentos?|financiar|dividas?|vencimentos|alavancagem|captacao|refinanciamento|caminhos|debentures?)\b/;
/** Requests that keep their own route: a memo, an answer to a board question, the debt table, the updated indebtedness, the quarter. */
export const boardMaterialNeighbour = /\b(?:memorando|memo|resposta|responder|pergunt\w*|serra verde|endividamento atualizado|tabela de divida|trimestre)\b/;

/** Ficha C47 exception (decision 6): "Monta o material do conselho sobre a estrutura de capital." and the board deck on capital
 * structure, financing or debt, the whole construction (origin/main: material_preparation). */
export const boardMaterialFichaException = {ficha: "C47", from: "material_preparation",
  pattern: /^(?:monta|monte|prepara|prepare|faz|faca|quero|preciso d[eo]) (?:o|a|um|uma) (?:material|deck|apresentacao) (?:do|para o|pro|ao) conselho (?:sobre|com|de) (?:a |o )?(?:estrutura de capital|plano de financiamento|financiamento|divida|caminhos de financiamento)(?: d[ae] (?:companhia|empresa|\d{4}))?[.!]*$/} as const;

/** The kinds this route may take a message from. */
export const boardMaterialPromotableKinds = ["board_decision"] as const;

/** Whether a folded message asks for ficha C47 given the kind the existing routes gave it. */
export function asksForBoardMaterial(folded: string, existing: string): boolean {
  const text = folded.replace(/\s+/g, " ").trim();
  if (boardMaterialNeighbour.test(text)) return false;
  if (existing === boardMaterialFichaException.from) return boardMaterialFichaException.pattern.test(text);
  return (boardMaterialPromotableKinds as readonly string[]).includes(existing) && boardMaterialCue.test(text) && boardCapitalTopic.test(text);
}

/** The route of a folded message given the kind the existing routes gave it. */
export function boardMaterialRoute<K extends string>(folded: string, existing: K): K | "board_capital_discussion" {
  return asksForBoardMaterial(folded, existing) ? "board_capital_discussion" : existing;
}
