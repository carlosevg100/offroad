/**
 * Ficha C09 (lote 4): a folder of files the company dropped, and the request to organize it and say what it holds,
 * what is missing, or to organize it for the debt discussion. The route only promotes a message the existing
 * routes leave ambiguous, as documents to a case, or as information to organize (a source index); two ficha
 * phrasings that origin/main sends elsewhere are taken only as whole constructions ("O que tem nesses arquivos?",
 * a factual question; "Organiza o material para discutirmos a dívida.", capital strategy). Every other kind keeps
 * its route: a debt table is the debt table, a data room or a kit for a bank is material for third parties, one
 * contract read for its clauses is not a folder, a concept is a concept.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

/** The kinds this route may take any message from. */
export const documentFolderPromotableKinds = ["ambiguous", "documents_to_case"] as const;

/** The ficha phrasings other routes take, each the whole construction (only the final punctuation free). */
export const documentFolderFichaExceptions = [
  // Ficha C09: "O que tem nesses arquivos?" (origin/main: factual_question).
  {from: "factual_question", pattern: /^o que (?:tem|ha) (?:n?esses|n?estes|nos|nesta|nessa|na) (?:arquivos|documentos|pasta)[?.!]*$/},
  // Ficha C09: "Organiza o material para discutirmos a dívida." (origin/main: capital_strategy).
  {from: "capital_strategy", pattern: /^organiz[ae] (?:o material|os documentos|os arquivos|a pasta) (?:para|pra) (?:discutirmos a|discutir a|a discussao da) divida[.!]*$/},
] as const;

/** Organize, sort, inventory: the action on the folder. */
const organize = /\b(?:organiz\w*|arrum\w*|separ(?:a|e|ar)\b|inventari\w*|catalog\w*|classific\w*)\b/;
/** The folder as a whole: a folder, the files, the documents, the material, everything. One document is not a folder. */
const folder = /\b(?:pastas?|arquivos|documentos|materia(?:l|is)|tudo)\b/;
/** The folder dropped or uploaded, then a request to say what it holds or what is missing. */
const dropped = /\b(?:joguei|jogamos|subi|subimos|coloquei|colocamos|mandei|mandamos|anexei|anexamos|carreguei|carregamos)\b.{0,40}\b(?:a pasta|as pastas|os arquivos|os documentos|o material|tudo)\b/;
const tellMe = /\b(?:me (?:diz|diga|fala|fale|mostra|mostre) o que (?:tem|ha|falta)|o que (?:tem|ha) (?:ai|nela|neles|nisso)|o que falta|da uma olhada|de uma olhada)\b/;
/** Organize only, without analysis yet: the ficha's variation, a whole construction. */
const organizeOnly = /^(?:so|apenas|somente) organiz[ae][,;]? (?:e )?(?:nao|sem) analis\w*(?: (?:ainda|por enquanto|nada))?[.!]*$/;
/** Material for a third party (a data room, a kit, a diligence, an auditor, a bank, investors): another method. */
const thirdParty = /\b(?:data ?room|kit|pacote|diligencia|due diligence|auditor\w*|investidor\w*|para (?:o|os) bancos?|pro banco|enviar|mandar para|apresentacao|deck|teaser|memorando)\b/;
/** A folder that is not the company's documents. */
const otherFolder = /\b(?:agenda|calendario|e-?mails?|caixa de entrada|fotos? (?:da|de) (?:viagem|familia|festa)|musicas?|codigo|repositorio)\b/;
/** A request to understand a concept, not to have the folder read. */
const conceptual = /^(?:o que (?:e|sao|significa)|explique|explica|como funciona|qual (?:e )?a diferenca)\b|\b(?:o conceito de|como funciona|o que significa)\b/;
/** An explicit refusal of the organization. */
const refused = /\b(?:nao|nunca|sem)\b.{0,20}\b(?:organiz\w*|arrum\w*|mex\w*)\b|\bnao (?:quero|preciso|precisamos|queremos)\b.{0,25}\b(?:organiz\w*|inventario|arrumacao)\b/;

/** Whether a folded message asks for ficha C09 on the folder it dropped. */
export function asksToOrganizeDocumentFolder(folded: string): boolean {
  const text = folded.trim();
  if (organizeOnly.test(text) || documentFolderFichaExceptions[0].pattern.test(text)) return true;
  if (conceptual.test(text) || thirdParty.test(text) || otherFolder.test(text) || refused.test(text)) return false;
  return (organize.test(text) && folder.test(text)) || (dropped.test(text) && (organize.test(text) || tellMe.test(text)));
}

/** The route of a folded message given the kind the existing routes gave it: C09 only from a promotable kind,
 * or from the kind origin/main gives one of the ficha's whole phrasings. */
export function documentFolderRoute<K extends string>(folded: string, existing: K): K | "document_folder" {
  const text = folded.trim();
  if (documentFolderFichaExceptions.some((e) => e.from === existing && e.pattern.test(text))) return "document_folder";
  return (documentFolderPromotableKinds as readonly string[]).includes(existing) && asksToOrganizeDocumentFolder(text) ? "document_folder" : existing;
}
