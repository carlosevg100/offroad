import {compileObjectiveToPlan} from "@offroad/work-plan";

export const foldCue = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const capacityCue = /\b(quanto (de )?(divida )?((a gente|a empresa|a companhia|nos|eu) )?(cabe|aguent\w*|suport\w*|consig\w* (tomar|captar)|pode\w* (tomar|captar)|posso (tomar|captar)|da para (tomar|captar))|capacidade de (endividamento|divida|alavancagem)|alavancagem maxima)/;

/** A financial quantity: a number next to its unit (34%, 3x, três vezes, 60 milhões, três parcelas,
 * R$ 15), or a year. A number by itself ("em 2 dias", "uma frase") is not one. */
const numberWord = "um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzent\\w+|trezent\\w+|quatrocent\\w+|quinhent\\w+|seiscent\\w+|setecent\\w+|oitocent\\w+|novecent\\w+|mil";
const unit = "%|x\\b|vez\\b|vezes|por cento|pontos?( percentuais| base)?|bps\\b|pb\\b|basis points|milh\\w*|mil\\b|bi\\b|bilh\\w*|mm\\b|mi\\b|parcela\\w*|anos?\\b";
const quantity = new RegExp(`\\d+(?:[.,]\\d+)?\\s*(?:${unit})|\\b(?:${numberWord})\\s+(?:${unit})|r\\$\\s*\\d|\\b(?:19|20)\\d{2}\\b`);
/** A question asks; it does not answer. Only a confirmation tag ("34%, certo?") keeps an answer an answer. */
const interrogative = /^((e|mas|entao|ok|ah)[\s,]+)?(qual|quais|quanto|quanta|quantos|quantas|quando|como|onde|quem|por que|porque|o que)\b/;
/** A request for explanation is the imperative that opens the message ("explica", "pode detalhar"), not the
 * same verb inside a statement ("conforme detalha a projeção"). */
const explanation = /^((e|mas|entao|ok|ah)[\s,]+)?((pode|poderia|consegue|voce pode|me|por favor)\s+)*(explica|explique|explicar|detalha|detalhe|detalhar|esclarece|esclareca|esclarecer|resuma|resumir)\b|\bo que significa\b/;
const confirmationTag = /,?\s*(certo|correto|ne|ok|confere|isso|nao e)\s*\?$/;

/** A remark that closes or defers rather than answers ("obrigado", "mando em 2 dias"). */
const deferral = /^(obrigad\w*|valeu|ok,? obrigad\w*)\b|\b(vou|vamos|irei|iremos) (enviar|mandar|pensar|ver|verificar|checar|confirmar|levantar)\b|\b(mando|mandamos|envio|enviamos)\b|\b(depois|amanha|semana que vem)\b|\bem \d+ (dias?|horas?|semanas?)\b|\b(chega|chegam) em\b/;
/** A short answer: a qualitative gap ("É para refinanciamento.") is answered in a sentence or two. */
const shortAnswer = 280;

/** A message that answers the pending gaps of its kind: data with a quantity, even with a
 * confirmation tag, or a short declarative answer with data or a qualitative fact of its kind and no
 * number at all ("É para refinanciamento."). A question, a request for explanation, a deferral or a
 * remark without such data does not. */
export function answersWithData(message: string, data: RegExp, qualitative?: RegExp): boolean {
  const text = foldCue(message).trim();
  const asks = interrogative.test(text) || explanation.test(text) || (text.endsWith("?") && !confirmationTag.test(text));
  if (asks || deferral.test(text)) return false;
  if (data.test(text) && quantity.test(text)) return true;
  return text.length <= shortAnswer && (data.test(text) || !!qualitative?.test(text));
}

/** The objectives of another premise method: an answer that compiles to one of them is that method's. */
const specificKinds = new Set(["proposal_comparison", "relative_debt_cost", "debt_capacity", "debt_table", "covenant_headroom", "weekly_cash"]);
/** A request for new work opens with its verb ("Monte", "Revise", "Prepare a"). The router reads some
 * plain answers as other work ("O covenant é 3x" compiles to a risk matrix), so a non-neutral kind
 * blocks a continuation only when the message asks for work; a request never answers. */
const command = /^((e|mas|entao|ok|agora|tambem)[\s,]+)?((pode|poderia|consegue|voce pode|por favor|me)\s+)*(mont\w*|fa(ca|z|zer)|prepar\w*|revis\w*|cri(e|a|ar)|elabor\w*|ger(e|a|ar)|analis\w*|compar\w*|projet\w*|calcul\w*|mape\w*|monitor\w*|acompanh\w*|organiz\w*|list(e|a|ar)|levant\w*|escrev\w*|redij\w*|redigir|constru\w*|simul\w*|test(e|a|ar)|avali\w*|estrutur\w*|desenh\w*|(quero|preciso|gostaria) que)\b/;
/** Whether a message may continue a premise question of `kind`: it compiles to the same kind, or it
 * is not a request for work and does not compile to another premise method. Declarative answers compile
 * to neutral kinds (ambiguous, factual question, capital strategy, company analysis, documents to case);
 * another kind passes only when the router misread an answer, as with a bare "covenant". */
function mayContinue(kind: PremiseCueKind, message: string, hasAttachments: boolean): boolean {
  const compiled = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  if (compiled === kind) return true;
  if (specificKinds.has(compiled) || command.test(foldCue(message).trim())) return false;
  return true;
}

export type PremiseCueKind = "debt_capacity" | "debt_table" | "covenant_headroom" | "weekly_cash";
/** The premise step a message asks for on its own: the capacity cue first, then the router's lote 2
 * objectives. A conceptual question routes elsewhere and asks for none. */
export function premiseCueKind(message: string, hasAttachments: boolean): PremiseCueKind | null {
  const kind = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  if (capacityCue.test(foldCue(message))) return kind === "factual_question" ? null : "debt_capacity";
  return kind === "debt_table" || kind === "covenant_headroom" || kind === "weekly_cash" ? kind : null;
}

/** Whether the turn proposes the premises of one kind: the message asks for it, or it answers with
 * data while the latest earlier premise question among the recent messages is of this kind. */
export function proposesPremisesOfKind(kind: PremiseCueKind, data: RegExp, message: string, hasAttachments: boolean, earlierUserMessages: readonly string[], qualitative?: RegExp): boolean {
  const own = premiseCueKind(message, hasAttachments);
  if (own) return own === kind;
  if (!answersWithData(message, data, qualitative) || !mayContinue(kind, message, hasAttachments)) return false;
  for (let n = earlierUserMessages.length - 1; n >= 0; n--) {
    const earlier = premiseCueKind(earlierUserMessages[n]!, false);
    if (earlier) return earlier === kind;
  }
  return false;
}
