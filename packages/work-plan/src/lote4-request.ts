/**
 * Lote 4, the conservative condition of a promotion (C47, C01, C09; C32 takes only its whole ficha constructions). A lote 4
 * method is chosen only when the message asks for its action: a request verb in the imperative, the infinitive or the
 * subjunctive (which an explicit request such as "quero", "preciso", "pode" or "vamos" governs), or, for the received
 * proposal and the folder, the question the ficha answers ("é boa?", "me diz o que tem"), with the method's object named
 * in the message; and only when the message holds, at no point and in no clause, a negation or a refusal ("não",
 * "nunca", "sem", "jamais", "nem", "dispense", "evite", "cancelar", "deixe de") or a request for guidance ("como",
 * "de que forma", "qual a melhor forma de", "ensine", "oriente", "explique"). Otherwise the route origin/main gives
 * stays. The only exception, decided by the caller, is the enumerated whole ficha constructions.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

export type Lote4RequestKind = "board_capital_discussion" | "received_proposal" | "document_folder";

/** A request verb form of a stem: imperative, infinitive or subjunctive, never a past or a gerund. */
const verb = (stems: string, ir = "") => String.raw`\b(?:${stems})(?:a|e|ar|em|amos|emos${ir})\b`;

/** The action of each method, as request forms. */
const requests: Record<Lote4RequestKind, RegExp> = {
  board_capital_discussion: new RegExp([
    verb("prepar|mont|elabor|organiz|estrutur|desenh|redig"),
    String.raw`\b(?:faz|faca|facam|fazer|facamos|escreve|escreva|escrever)\b`,
  ].join("|"), "g"),
  received_proposal: new RegExp([
    verb("avali|analis|olh|opin|revis|examin|aceit|negoci"),
    String.raw`\b(?:le|leia|ler|ve|veja|ver|da uma olhada|de uma olhada|dar uma olhada|me diz se|me diga se|diz se|diga se|saber se|ver se)\b`,
    // The question the ficha answers about the proposal: is it good, worth it, to be taken, what to make of it.
    String.raw`\b(?:e|esta|ta|parece|seria) (?:boa|bom|ruim|razoavel|competitiva|justa|cara|barata|de mercado|interessante|adequada|atrativa|vantajosa)\b`,
    String.raw`\bvale a pena\b|\b(?:vale|compensa|presta)\s*\?|\b(?:devo|devemos|deveria|deveriamos|posso|podemos) (?:aceitar|fechar|assinar|topar|seguir com|pegar|tomar)\b`,
    String.raw`\bo que (?:voce |vc )?(?:acha|achou|me diz)\b|\bfaz sentido\b|\bo que (?:eu |a gente |nos )?(?:peco|pedimos|pedir|negocio|negociamos|negociar|contraproponho|contrapropor)\b`,
  ].join("|"), "g"),
  document_folder: new RegExp([
    verb("organiz|arrum|separ|inventari|classific|catalog|list|mapei|orden"),
    String.raw`\b(?:me (?:diz|diga|fala|fale|mostra|mostre) o que (?:tem|ha|falta)|o que (?:tem|ha) (?:ai|nela|neles|nisso|n?esses|n?estes|nos|na|nesta|nessa)|o que falta|da uma olhada|de uma olhada)\b`,
  ].join("|"), "g"),
};

/** The method's object, named in the message (the route of each method then reads which object it is). */
const objects: Record<Lote4RequestKind, RegExp> = {
  board_capital_discussion: /\b(?:discussao|material|deck|pagina|apresentacao|pauta|roteiro|conselho|board)\b/,
  received_proposal: /\b(?:proposta|oferta|term\s*sheet|termsheet|ccb|cce|nce|credito|financiamento|emprestimo|operacao|linha)\b|\b(?:e|esta|ta|parece|seria) (?:boa|bom)\b|\bvale a pena\b/,
  document_folder: /\b(?:pastas?|arquivos|documentos|materia(?:l|is)|tudo|ai|nela|neles|nisso)\b/,
};

/** What keeps the route of origin/main wherever it appears: a negation or refusal, or a request for guidance. */
const negation = /\b(?:nao|nunca|jamais|nem|sem|ninguem)\b|\b(?:dispens\w*|evit\w*|cancel\w*|pul(?:e|a|ar)|deix(?:e|a|ar) de|par(?:e|a|ar) de|chega de|esquec(?:e|a|er))\b/;
const guidance = /\bcomo\b|\bde que (?:forma|maneira|jeito|modo)\b|\bqual (?:e )?(?:a|o) (?:melhor )?(?:forma|maneira|jeito|caminho|modo)\b|\b(?:ensin\w*|orient\w*|explic\w*|passo a passo|tutorial)\b/;

export type Lote4RequestReading = {requested: boolean; voided: boolean};

/** The requests of one method in a folded message: whether one stands on its object, and whether the message holds a
 * negation, a refusal or a request for guidance anywhere. */
export function readLote4Request(folded: string, kind: Lote4RequestKind): Lote4RequestReading {
  const text = folded.replace(/\s+/g, " ").trim();
  const requested = objects[kind].test(text) && [...text.matchAll(requests[kind])].length > 0;
  return {requested, voided: negation.test(text) || guidance.test(text)};
}

/** Whether a folded message asks for the method's action: a request on its object, and no negation, refusal or request
 * for guidance anywhere in it. */
export function asksForLote4Action(folded: string, kind: Lote4RequestKind): boolean {
  const r = readLote4Request(folded, kind);
  return r.requested && !r.voided;
}
