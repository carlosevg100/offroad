/**
 * Ficha C01 (lote 4): a financing proposal the company received, and the question whether it is good for
 * the company, whether to accept it, what to make of it or what to ask. The route only promotes a message the
 * existing routes leave ambiguous, as documents to a case, or as a factual question (the ficha's own
 * phrasing, "O Itaú mandou proposta de CCB ... É boa?", routes there on origin/main). Every other kind
 * keeps its route: several proposals are compared by the comparison procedure, a need without a proposal is
 * capital strategy, a request only to read or organize the term sheet keeps that limit.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

/** The kinds this route may take a message from. */
export const receivedProposalPromotableKinds = ["ambiguous", "documents_to_case", "factual_question"] as const;

/** One proposal, term sheet, offer or proposal letter, in the singular. */
const proposalObject = /\b(?:proposta|term\s*sheet|termsheet|oferta|carta proposta|carta de proposta)\b|\b(?:ofereceu|ofereceram|mandou|mandaram|enviou|enviaram) (?:uma?|a|o) (?:linha|ccb|cce|nce|credito|financiamento|emprestimo|operacao)\b/;
/** Several proposals or a comparison: the comparison procedure. */
const severalOrCompared = /\b(?:propostas|term\s*sheets|termsheets|ofertas|compar\w*|versus|contra a (?:do|da|de)|ou a (?:do|da|de)|qual (?:das|dos|e a melhor|a melhor)|outra proposta (?:do|da|de))\b/;
/** A proposal that arrived: received, sent, offered, or named with a demonstrative or by its lender. */
const arrived = /\b(?:recebi|recebemos|recebeu|receberam|chegou|chegaram|mandou|mandaram|enviou|enviaram|ofereceu|ofereceram|apresentou|apresentaram|veio|vieram|fez|fizeram|trouxe|trouxeram|passou|passaram)\b|\b(?:essa|esta|nessa|nesta|dessa|desta|a|na|da) (?:proposta|oferta|term\s*sheet|termsheet) (?:do|da|de|que)\b|\b(?:essa|esta|nessa|nesta|dessa|desta) (?:proposta|oferta|term\s*sheet|termsheet)\b/;
/** The question the ficha answers: is it good, is it worth it, should we take it, what to think, what to ask. */
const evaluation = /\b(?:e|esta|ta|parece|seria|achou|acha) (?:boa|bom|ruim|razoavel|competitiva|justa|cara|barata|de mercado|interessante|adequada|atrativa|vantajosa)\b|\bvale a pena\b|\b(?:vale|compensa|presta)\s*\?|\b(?:devo|devemos|deveria|deveriamos|posso|podemos|vale) (?:aceitar|fechar|assinar|topar|seguir com|pegar|tomar)\b|\bo que (?:voce |vc )?(?:acha|achou|me diz)\b|\bfaz sentido\b|\bo que (?:eu |a gente |nos )?(?:peco|pedimos|pedir|negocio|negociamos|negociar|contraproponho|contrapropor)\b|\b(?:analis(?:a|e|ar)|avali(?:a|e|ar))\b/;
/** A financing context: an instrument, a rate, a term, a guarantee, a bank by name or the word itself. */
const financing = /\b(?:ccb|cce|nce|credito|financiamento|emprestimo|debentures?|linha|giro|capital de giro|cdi|ipca|spread|taxa|juros|carencia|amortiz\w*|garantia|cessao|fiduciaria|term\s*sheet|termsheet|bancos?|captacao|captar|nota comercial|cri|cra|fidc|finame|bndes)\b|\b(?:do|da|pelo|pela|o|a) (?:itau|bradesco|santander|btg|bb|banco do brasil|xp|sicredi|sicoob|daycoval|citi|citibank|abc|bocom|pine|bv|votorantim|banrisul|bnb|bnp|safra|caixa economica)\b/;
/** A request to understand a concept, not to have the proposal read for the company. */
const conceptual = /^(?:o que (?:e|sao|significa)|explique|explica|como funciona|qual (?:e )?a diferenca)\b|\b(?:o conceito de|como funciona|o que significa)\b/;
/** A proposal that is not a financing offer to the company. */
const otherProposal = /\bproposta (?:de |para (?:a |o )?)?(?:compra|venda|aquisicao|emprego|trabalho|parceria|fornecimento|servicos?|prestacao|aluguel|locacao|seguro|consultoria|fusao|investimento na|aporte|valor|comercial|orcamento)\b|\bproposta comercial\b/;
/** Only reading, organizing, extracting or summarizing the term sheet: the request keeps that limit. */
const readingOnly = /\b(?:so|apenas|somente)\b.{0,20}\b(?:organiz\w*|resum\w*|extra(?:i|ia|ir)|ler|leia|le|transcrev\w*|list\w*|registr\w*|anot\w*)\b|^(?:organiz\w*|resum\w*|extra(?:i|ia|ir)|transcrev\w*|registr\w*|anot\w*|arquiv\w*|salv\w*|guard\w*)\b/;
/** An explicit refusal of the analysis. */
const refused = /\b(?:nao|nunca|sem)\b.{0,25}\b(?:analis\w*|avali\w*|opin\w*|olh\w*)\b|\bnao (?:quero|preciso|precisamos|queremos)\b.{0,25}\b(?:analise|avaliacao|opiniao|leitura)\b/;

/** Whether a folded message asks for ficha C01 on a received proposal. */
export function asksAboutReceivedProposal(folded: string): boolean {
  const text = folded.trim();
  if (!proposalObject.test(text) || !arrived.test(text) || !evaluation.test(text)) return false;
  if (severalOrCompared.test(text) || conceptual.test(text) || otherProposal.test(text) || readingOnly.test(text) || refused.test(text)) return false;
  return financing.test(text);
}

/** The route of a folded message given the kind the existing routes gave it: C01 only from a promotable kind. */
export function receivedProposalRoute<K extends string>(folded: string, existing: K): K | "received_proposal" {
  return (receivedProposalPromotableKinds as readonly string[]).includes(existing) && asksAboutReceivedProposal(folded) ? "received_proposal" : existing;
}
