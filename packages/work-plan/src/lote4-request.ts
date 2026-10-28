/**
 * Lote 4, the structural condition of a promotion (C47, C01, C09; C32 takes only its whole ficha constructions). A lote 4
 * method is chosen only when the message asks for its action: a request verb in the imperative, the infinitive or the
 * subjunctive (which an explicit request such as "quero", "preciso", "pode" or "vamos" governs), or, for the received
 * proposal and the folder, the question the ficha answers ("é boa?", "me diz o que tem"), with the method's object named
 * in the message. A request is void when a negation or a refusal ("não", "nem", "sem", "não estou pedindo que",
 * "dispense", "evite", "deixe de") or a request for guidance ("como", "de que forma", "qual a melhor forma de",
 * "ensine", "oriente", "explique") precedes it in its own clause; any void request of the method's action keeps the
 * route origin/main gives, so does a message with no valid request.
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

/** What voids a request when it precedes it in its clause: a negation or refusal, or a request for guidance. */
const negation = /\b(?:nao|nunca|jamais|nem|sem|ninguem)\b|\b(?:dispens\w*|evit\w*|cancel\w*|pul(?:e|a|ar)|deix(?:e|a|ar) de|par(?:e|a|ar) de|chega de|esquec(?:e|a|er))\b/;
const guidance = /\bcomo\b|\bde que (?:forma|maneira|jeito|modo)\b|\bqual (?:e )?(?:a|o) (?:melhor )?(?:forma|maneira|jeito|caminho|modo)\b|\b(?:ensin\w*|orient\w*|explic\w*|passo a passo|tutorial)\b/;

export type Lote4RequestReading = {requested: boolean; voided: boolean};

/** The requests of one method in a folded message: whether one stands on its object, and whether one is voided. */
export function readLote4Request(folded: string, kind: Lote4RequestKind): Lote4RequestReading {
  const text = folded.replace(/\s+/g, " ").trim();
  let requested = false, voided = false;
  // Sentences end at . ! ? ; and a clause also at a comma, a colon or a "mas".
  for (const sentence of text.split(/(?<=[.!?;])\s+|[.!;]+$/).filter(Boolean)) {
    // The object may be named in an earlier sentence ("Joguei a pasta aqui. Organiza.").
    const onObject = objects[kind].test(text);
    for (const clause of sentence.split(/,|:|\bmas\b/)) {
      for (const m of clause.matchAll(requests[kind])) {
        const before = clause.slice(0, m.index);
        if (negation.test(before) || guidance.test(before)) voided = true;
        else if (onObject) requested = true;
      }
    }
  }
  return {requested, voided};
}

/** Whether a folded message asks for the method's action: a valid request on its object and no voided one. */
export function asksForLote4Action(folded: string, kind: Lote4RequestKind): boolean {
  const r = readLote4Request(folded, kind);
  return r.requested && !r.voided;
}
