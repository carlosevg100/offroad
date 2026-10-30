import {asksForLote4Action, directedLote4RequestTails, directedOriginatorKitCheckTails} from "./lote4-request";

const promotable = new Set(["ambiguous", "documents_to_case", "information_organization", "material_preparation", "factual_question"]);
const borrower = /\bcedentes?\b/;
const sourceSet = /\b(?:kit(?:s)?(?: banco| bancario)?|documentos|arquivos|pasta|pacote)\b/;
const transmission = /\b(?:enviar|mandar|entregar|distribuir|compartilhar|apresentar)\b/;
const namedFolder = /^(?:(?:a|o|as|os|esse|essa|esses|essas|este|esta|estes|estas|meu|minha|meus|minhas|seu|sua|seus|suas|no|na|nos|nas|nesse|nessa|nesses|nessas|do|da)\s+)*(?:kits?|documentos|arquivos|pasta|material|pacote)\b/;
const ellipsis = /^(?:$|(?:e|me|nos|por favor)\b)/;

/** Receiving a borrower's kit and preparing a package for a third party are different jobs.
 * Organization uses the already released folder reader only on a directed request. */
export function originatorIntakeRoute<K extends string>(folded: string, existing: K): K | "document_folder" {
  if (!promotable.has(existing) || !borrower.test(folded) || !sourceSet.test(folded) || transmission.test(folded)) return existing;
  const tails = [...(asksForLote4Action(folded, "document_folder") ? directedLote4RequestTails(folded, "document_folder") : []), ...directedOriginatorKitCheckTails(folded)];
  const ownsObject = tails.some(tail => namedFolder.test(tail) || ellipsis.test(tail));
  return ownsObject ? "document_folder" : existing;
}
