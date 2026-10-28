/**
 * Lote 4, the conservative condition of a promotion (C47, C01, C09; C32 takes only its whole ficha constructions). A lote 4
 * method is chosen only when the message asks the advisor for its action: the verb in the imperative at the start of a
 * clause, its infinitive after a first person request ("quero", "preciso", "vamos") or after a modal ("pode",
 * "consegue") that opens the clause or has "você" as its subject, or its subjunctive after "quero que"; never an action
 * someone else does ("o banco vai avaliar", "a diretoria pode preparar"); or, for the received proposal, the question the
 * ficha answers asked directly ("é boa?", never "o banco disse que é boa"), and for the folder "me diz o que tem"; with
 * the method's object named in the message; and only
 * when the message holds, at no point and in no clause, a negation or a refusal ("não", "nunca", "sem", "jamais", "nem",
 * "dispense", "evite", "cancele", "recuso", "desista", "abandone", "esqueça", "deixe de", "pare de") or a request for
 * guidance ("como", "de que forma", "qual a melhor forma de", "ensine", "oriente", "explique"). Otherwise the route
 * origin/main gives stays. The only exception, decided by the caller, is the enumerated whole ficha constructions.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

export type Lote4RequestKind = "board_capital_discussion" | "received_proposal" | "document_folder";

/** Where a request addressed to the advisor starts: the start of a clause, or a joined clause ("e", "então", "depois"),
 * after an optional courtesy or vocative ("por favor", "agora", "você", "me"). */
const opening = String.raw`(?:^|[.!?;,:]\s*|\b(?:e|entao|depois)\s+)(?:(?:por favor|agora|entao|so|apenas|voce|voces|vc|me|nos)\s+)*`;
/** A request in the first person ("quero", "preciso", "vamos", "me ajude a"): the verb itself names who asks. */
const wanting = String.raw`\b(?:quero|queremos|queria|preciso|precisamos|gostaria(?:mos)?(?: de)?|vamos|bora|me ajud\w* a|seria bom)\s+(?:(?:voce|vc|me|nos|ja|agora|por favor)\s+)*`;
/** A modal ("pode", "consegue", "poderia", "conseguiria", "tem como", "dá para") is a request only when it opens the
 * clause (after a vocative or "por favor" at most) or when its subject is "você" or "vocês"; any other subject before it
 * ("o banco pode", "a diretoria consegue", "quando eles podem") makes it someone else's action. */
const modal = String.raw`(?:pode|podem|podes|poderia|poderiam|consegue|conseguem|conseguiria|conseguiriam|tem como|da para|da pra)\s+(?:(?:me|nos|ja|agora|por favor)\s+)*`;
const modalAsked = [String.raw`${opening}${modal}`, String.raw`\b(?:voce|voces|vc)\s+${modal}`];
/** A request for someone to do it, in the subjunctive ("quero que você prepare"). */
const askingThat = String.raw`\b(?:quero|queremos|queria|preciso|precisamos|gostaria(?:mos)?|peco|pedimos)\s+que\s+(?:(?:voce|voces|vc)\s+)?`;

/** The request of a method addressed to the advisor: its verb in the imperative at the start of a clause, its infinitive
 * after a first person request or an addressed modal, or its subjunctive after "quero que"; never an action someone else
 * does ("o banco vai avaliar", "a diretoria pode preparar"). Stems are first conjugation; `imperative`, `infinitive` and
 * `subjunctive` add the irregular forms. */
const addressed = (stems: string, extra: {imperative: string; infinitive: string; subjunctive: string}) => [
  String.raw`${opening}(?:(?:${stems})(?:a|e|em)|${extra.imperative})\b`,
  ...[wanting, ...modalAsked].map((before) => String.raw`${before}(?:(?:${stems})ar|${extra.infinitive})\b`),
  String.raw`${askingThat}(?:(?:${stems})(?:e|em)|${extra.subjunctive})\b`,
];

/** The action of each method, as requests addressed to the advisor, and the questions each ficha answers. */
const requests: Record<Lote4RequestKind, RegExp> = {
  board_capital_discussion: new RegExp(addressed("prepar|mont|elabor|organiz|estrutur|desenh",
    {imperative: "faz|faca|facam|escreve|escreva", infinitive: "fazer|escrever", subjunctive: "faca|facam|escreva"}).join("|"), "g"),
  received_proposal: new RegExp([
    ...addressed("avali|analis|olh|opin|revis|examin|negoci", {imperative: "le|leia|ve|veja|da uma olhada|de uma olhada|me diz se|me diga se|diz se|diga se",
      infinitive: "ler|ver|dar uma olhada|saber se|ver se", subjunctive: "leia|veja|de uma olhada"}),
  ].join("|"), "g"),
  document_folder: new RegExp([
    ...addressed("organiz|arrum|separ|inventari|classific|catalog|list|mapei|orden", {imperative: "da uma olhada|de uma olhada", infinitive: "dar uma olhada", subjunctive: "de uma olhada"}),
    String.raw`\b(?:me (?:diz|diga|fala|fale|mostra|mostre) o que (?:tem|ha|falta)|o que (?:tem|ha) (?:ai|nela|neles|nisso|n?esses|n?estes|nos|na|nesta|nessa)|o que falta)\b`,
  ].join("|"), "g"),
};

/** The question the received proposal ficha answers (is it good, worth it, to be taken, what to make of it). It is a
 * request only as a direct question to the advisor: its sentence ends in "?" and the message reports no one else's
 * view ("o banco disse que", "segundo o gerente", "de acordo com eles"). */
const evaluative = new RegExp([
  String.raw`\b(?:e|esta|ta|parece|seria) (?:boa|bom|ruim|razoavel|competitiva|justa|cara|barata|de mercado|interessante|adequada|atrativa|vantajosa)\b`,
  String.raw`\bvale a pena\b|\b(?:vale|compensa|presta)\b|\b(?:devo|devemos|deveria|deveriamos|posso|podemos) (?:aceitar|fechar|assinar|topar|seguir com|pegar|tomar)\b`,
  String.raw`\bo que (?:voce |vc )?(?:acha|achou|me diz)\b|\bfaz sentido\b|\bo que (?:eu |a gente |nos )?(?:peco|pedimos|pedir|negocio|negociamos|negociar|contraproponho|contrapropor)\b`,
].join("|"), "g");
const reported = /\b(?!(?:voce|voces|vc|eu|nos)\s)\w+\s+(?:disse|disseram|diz|dizem|falou|falaram|fala|falam|afirmou|afirmaram|afirma|acha|acham|achou|acharam|garantiu|garante|comentou|contou|avaliou|considera|consideram)\s+que\b|\bsegundo (?:o|a|os|as|ele|ela|eles|elas)\b|\bde acordo com\b/;
const directQuestion = (text: string) => !reported.test(text) && [...text.matchAll(evaluative)].some((m) => {
  const rest = text.slice(m.index! + m[0].length), end = /[.!?;]/.exec(rest);
  return end?.[0] === "?";
});

/** The method's object, named in the message (the route of each method then reads which object it is). */
const objects: Record<Lote4RequestKind, RegExp> = {
  board_capital_discussion: /\b(?:discussao|material|deck|pagina|apresentacao|pauta|roteiro|conselho|board)\b/,
  received_proposal: /\b(?:proposta|oferta|term\s*sheet|termsheet|ccb|cce|nce|credito|financiamento|emprestimo|operacao|linha)\b|\b(?:e|esta|ta|parece|seria) (?:boa|bom)\b|\bvale a pena\b/,
  document_folder: /\b(?:pastas?|arquivos|documentos|materia(?:l|is)|tudo|ai|nela|neles|nisso)\b/,
};

/** What keeps the route of origin/main wherever it appears: a negation or refusal, or a request for guidance. */
const negation = new RegExp([
  String.raw`\b(?:nao|nunca|jamais|nem|sem|ninguem)\b`,
  // Refusing, giving up, dropping or setting aside the action.
  String.raw`\b(?:dispens\w*|evit\w*|cancel\w*|recus\w*|rejeit\w*|desist\w*|abandon\w*|descart\w*|ignor\w*|suspend\w*|interromp\w*|esquec\w*|larg(?:a|ue|ar)|pul(?:e|a|ar)|adi(?:e|a|ar)|abr(?:a|e|ir) mao)\b`,
  String.raw`\b(?:deix(?:e|a|ar|o|amos)|par(?:e|a|ar|o|amos)|chega|basta) de\b`,
].join("|"));
const guidance = /\bcomo\b|\bde que (?:forma|maneira|jeito|modo)\b|\bqual (?:e )?(?:a|o) (?:melhor )?(?:forma|maneira|jeito|caminho|modo)\b|\b(?:ensin\w*|orient\w*|explic\w*|passo a passo|tutorial)\b/;

export type Lote4RequestReading = {requested: boolean; voided: boolean};

/** The requests of one method in a folded message: whether one stands on its object, and whether the message holds a
 * negation, a refusal or a request for guidance anywhere. */
export function readLote4Request(folded: string, kind: Lote4RequestKind): Lote4RequestReading {
  const text = folded.replace(/\s+/g, " ").trim();
  const requested = objects[kind].test(text) && ([...text.matchAll(requests[kind])].length > 0 || (kind === "received_proposal" && directQuestion(text)));
  return {requested, voided: negation.test(text) || guidance.test(text)};
}

/** Whether a folded message asks for the method's action: a request on its object, and no negation, refusal or request
 * for guidance anywhere in it. */
export function asksForLote4Action(folded: string, kind: Lote4RequestKind): boolean {
  const r = readLote4Request(folded, kind);
  return r.requested && !r.voided;
}

/** Whether a folded message refuses, cancels or gives up anything (the conservative veto's vocabulary): a lote 4 wait
 * the person withdraws after it opened is read with the same words (document-folder-premises-proposal.ts). */
export function holdsLote4Refusal(folded: string): boolean {
  return negation.test(folded.replace(/\s+/g, " ").trim());
}
