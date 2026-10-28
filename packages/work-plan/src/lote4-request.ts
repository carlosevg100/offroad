/**
 * Lote 4, the conservative condition of a promotion (C47, C01, C09; C32 takes only its whole ficha constructions).
 *
 * One rule for every trigger of a request (the method's verb in the imperative; a wanting verb, "quero", "gostaria",
 * "preciso", "vamos", or a modal, "pode", "consegue", governing its infinitive; "quero que" with its subjunctive; the
 * question the received proposal ficha answers; "me diz o que tem" for the folder): a trigger is a request to the advisor
 * only when, in its own clause, nothing precedes it but courtesy ("por favor"), an interjection or adverb ("ok",
 * "então", "agora"), a first person subject ("eu", "nós", "a gente") or, before a modal, "você"/"vocês"; and the
 * evaluative question also its own object ("essa proposta é boa?") and only asked ("?"). Any other noun or pronoun
 * before it makes it someone else's action ("o banco gostaria de avaliar", "a diretoria pode preparar"). A reporting
 * construction anywhere before the trigger (a third party who "disse", "acha", "pediu", "sugeriu", "informou"... "que",
 * or "segundo", "de acordo com", "conforme") makes it reported speech, never a request, even with "você" inside it.
 *
 * Then the method is chosen only when its object is named in the message and the message holds, at no point, a
 * negation or a refusal ("não", "nunca", "sem", "nem", "cancele", "recuso", "desista", "deixe de"...) or a request for
 * guidance ("como", "de que forma", "ensine", "explique"...). Otherwise the route origin/main gives stays. The only
 * exception, decided by the caller, is the enumerated whole ficha constructions.
 *
 * The text is folded (NFKD, combining marks removed, lower case) before it reaches these patterns.
 */

export type Lote4RequestKind = "board_capital_discussion" | "received_proposal" | "document_folder";

type Forms = {stems: string; imperative: string; infinitive: string; subjunctive: string};
const gap = String.raw`(?:(?:me|nos|ja|agora|por favor|entao)\s+)*`;
/** The triggers of a method's request, each starting at its first word. `modal` marks those a "você" may precede. */
function triggers(f: Forms): {pattern: RegExp; modal: boolean}[] {
  const inf = String.raw`(?:(?:${f.stems})ar|${f.infinitive})\b`;
  const helped = String.raw`(?:(?:me |nos )?ajud(?:ar|e|a) a\s+)?`;
  return [
    {pattern: new RegExp(String.raw`\b(?:(?:${f.stems})(?:a|e|em)|${f.imperative})\b`, "g"), modal: false},
    {pattern: new RegExp(String.raw`\b(?:quero|queremos|queria|queriamos|preciso|precisamos|gostaria(?:mos)?(?: de)?|vamos|bora|seria bom|me ajud(?:e|a|ar) a)\s+${gap}${helped}${inf}`, "g"), modal: false},
    {pattern: new RegExp(String.raw`\b(?:pode|podem|podes|poderia|poderiam|consegue|conseguem|conseguiria|conseguiriam|tem como|da para|da pra)\s+${gap}${helped}${inf}`, "g"), modal: true},
    {pattern: new RegExp(String.raw`\b(?:quero|queremos|queria|preciso|precisamos|gostaria(?:mos)?|peco|pedimos)\s+que\s+(?:(?:voce|voces|vc)\s+)?(?:(?:${f.stems})(?:e|em)|${f.subjunctive})\b`, "g"), modal: false},
  ];
}
/** The question the received proposal ficha answers: is it good, worth it, to be taken, what to make of it. */
const evaluative = new RegExp([
  String.raw`\b(?:e|esta|ta|parece|seria) (?:boa|bom|ruim|razoavel|competitiva|justa|cara|barata|de mercado|interessante|adequada|atrativa|vantajosa)\b`,
  String.raw`\bvale a pena\b|\b(?:vale|compensa|presta)\b|\b(?:devo|devemos|deveria|deveriamos|posso|podemos) (?:aceitar|fechar|assinar|topar|seguir com|pegar|tomar)\b`,
  String.raw`\bo que (?:voce |vc )?(?:acha|achou|me diz)\b|\bfaz sentido\b|\bo que (?:eu |a gente |nos )?(?:peco|pedimos|pedir|negocio|negociamos|negociar|contraproponho|contrapropor)\b`,
].join("|"), "g");

const methodTriggers: Record<Lote4RequestKind, {pattern: RegExp; modal: boolean; evaluative?: boolean}[]> = {
  board_capital_discussion: triggers({stems: "prepar|mont|elabor|organiz|estrutur|desenh", imperative: "faz|faca|facam|escreve|escreva", infinitive: "fazer|escrever",
    subjunctive: "faca|facam|escreva"}),
  received_proposal: [...triggers({stems: "avali|analis|olh|opin|revis|examin|negoci", imperative: "le|leia|ve|veja|da uma olhada|de uma olhada|me diz se|me diga se|diz se|diga se",
    infinitive: "ler|ver|dar uma olhada|saber se|ver se", subjunctive: "leia|veja|de uma olhada"}), {pattern: evaluative, modal: false, evaluative: true}],
  document_folder: [...triggers({stems: "organiz|arrum|separ|inventari|classific|catalog|list|mapei|orden", imperative: "da uma olhada|de uma olhada",
    infinitive: "dar uma olhada", subjunctive: "de uma olhada"}),
    {pattern: /\b(?:me (?:diz|diga|fala|fale|mostra|mostre) o que (?:tem|ha|falta)|o que (?:tem|ha) (?:ai|nela|neles|nisso|n?esses|n?estes|nos|na|nesta|nessa)|o que falta)\b/g, modal: false}],
};

/** What may precede a trigger in its clause: courtesy, an interjection or adverb, a first person subject; "você" before a
 * modal; the proposal itself before the evaluative question. */
const courtesy = String.raw`por favor|ok|okay|bom|olha|ei|oi|ola|entao|agora|so|apenas|tambem|ai|pois|claro|certo|beleza|tudo bem|hoje|amanha|logo|ainda|ja|depois|eu|nos|a gente|me`;
const before = (modal: boolean, evaluative: boolean) => new RegExp(String.raw`^(?:(?:${courtesy}${modal ? "|voce|voces|vc" : ""}${evaluative
  ? String.raw`|(?:e |mas )?(?:a|essa|esta|nessa|essa nova|a nova)? ?(?:proposta|oferta|term ?sheet|termsheet|operacao|ccb|linha)(?: (?:d[oa]s?|de) [a-z0-9$ ]{1,40})?|ela|isso|voce|vc|voce acha que`
  : ""})\s*)*$`);
/** Clauses end at punctuation and at a coordinating conjunction. */
const clauseEnd = /[.!?;,:]|\b(?:e|mas|porem|entao|depois)\b/g;
/** A reporting construction: a third party who said, thinks or asked "que", or "segundo", "de acordo com", "conforme". */
const reporting = /\b(?!(?:eu|nos|gente|voce|voces|vc)\b)[a-z]+\s+(?:(?:me|nos|lhe|ja|tambem)\s+)?(?:disse|disseram|diz|dizem|falou|falaram|fala|falam|acha|acham|achou|acharam|afirmou|afirmaram|afirma|pediu|pediram|pede|sugeriu|sugeriram|sugere|comentou|comentaram|informou|informaram|mencionou|mencionaram|garantiu|garantiram|garante|explicou|explicaram|contou|avaliou|considera|consideram)\s+que\b|\b(?:segundo|conforme)\b|\bde acordo com\b/g;

/** Whether the trigger at `index` is a request to the advisor: allowed words only before it in its clause, and no
 * reporting construction anywhere before it. */
function addressedAt(text: string, index: number, modal: boolean, evaluativeTrigger: boolean): boolean {
  if ([...text.matchAll(reporting)].some((r) => r.index! < index)) return false;
  let start = 0;
  for (const m of text.matchAll(clauseEnd)) {const end = m.index! + m[0].length; if (end <= index) start = end;}
  return before(modal, evaluativeTrigger).test(text.slice(start, index).trim());
}
/** The evaluative question is a request only asked: its sentence ends in "?". */
const asked = (text: string, end: number) => /[.!?;]/.exec(text.slice(end))?.[0] === "?";

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
  const requested = objects[kind].test(text) && methodTriggers[kind].some((t) => [...text.matchAll(t.pattern)].some((m) =>
    addressedAt(text, m.index!, t.modal, t.evaluative === true) && (!t.evaluative || asked(text, m.index! + m[0].length))));
  return {requested, voided: negation.test(text) || guidance.test(text)};
}

/** Whether a folded message asks for the method's action: a request on its object, and no negation, refusal or request
 * for guidance anywhere in it. */
export function asksForLote4Action(folded: string, kind: Lote4RequestKind): boolean {
  const r = readLote4Request(folded, kind);
  return r.requested && !r.voided;
}
