import {compileObjectiveToPlan} from "@offroad/work-plan";

export const foldCue = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const capacityCue = /\b(quanto (de )?(divida )?((a gente|a empresa|a companhia|nos|eu) )?(cabe|aguent\w*|suport\w*|consig\w* (tomar|captar)|pode\w* (tomar|captar)|posso (tomar|captar)|da para (tomar|captar))|capacidade de (endividamento|divida|alavancagem)|alavancagem maxima)/;

/** A question asks; it does not answer. Only a confirmation tag ("34%, certo?") keeps an answer an answer. */
const interrogative = /^((e|mas|entao|ok|ah)[\s,]+)?(qual|quais|quanto|quanta|quantos|quantas|quando|como|onde|quem|por que|porque|o que)\b/;
/** A request for explanation is the imperative that opens the message ("explica", "pode detalhar"), not the
 * same verb inside a statement ("conforme detalha a projeção"). */
const explanation = /^((e|mas|entao|ok|ah)[\s,]+)?((pode|poderia|consegue|voce pode|me|por favor)\s+)*(explica|explique|explicar|detalha|detalhe|detalhar|esclarece|esclareca|esclarecer|resuma|resumir)\b|\bo que significa\b/;
const confirmationTag = /,?\s*(certo|correto|ne|ok|confere|isso|nao e)\s*\?$/;

/** A question or a request for explanation never continues a premise question. Whether anything else
 * answers it, defers it or asks for other work is the extraction's `turnIntent` to decide. */
export function asksOrExplains(message: string): boolean {
  const text = foldCue(message).trim();
  return interrogative.test(text) || explanation.test(text) || (text.endsWith("?") && !confirmationTag.test(text));
}

/** The objectives of the premise methods: an answer that compiles to another one is that method's. */
const premiseKinds = new Set(["proposal_comparison", "relative_debt_cost", "debt_capacity", "debt_table", "covenant_headroom", "weekly_cash"]);

export type PremiseCueKind = "debt_capacity" | "debt_table" | "covenant_headroom" | "weekly_cash";
/** The premise step a message asks for on its own: the capacity cue first, then the router's lote 2
 * objectives. A conceptual question routes elsewhere and asks for none. */
export function premiseCueKind(message: string, hasAttachments: boolean): PremiseCueKind | null {
  const kind = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  if (capacityCue.test(foldCue(message))) return kind === "factual_question" ? null : "debt_capacity";
  return kind === "debt_table" || kind === "covenant_headroom" || kind === "weekly_cash" ? kind : null;
}

/** How a turn enters a premise step of one kind: by its own cue, or as a continuation candidate when
 * the latest earlier premise question among the recent messages is of this kind, the message is not a
 * question nor a request for explanation, and it does not compile to another premise method. A
 * continuation proposes only when the extraction reads the turn as answering what is pending. */
export function premiseEntry(kind: PremiseCueKind, message: string, hasAttachments: boolean, earlierUserMessages: readonly string[]): "cue" | "continuation" | null {
  const own = premiseCueKind(message, hasAttachments);
  if (own) return own === kind ? "cue" : null;
  if (asksOrExplains(message)) return null;
  const compiled = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  if (compiled !== kind && premiseKinds.has(compiled)) return null;
  for (let n = earlierUserMessages.length - 1; n >= 0; n--) {
    const earlier = premiseCueKind(earlierUserMessages[n]!, false);
    if (earlier) return earlier === kind ? "continuation" : null;
  }
  return null;
}

/** How the extraction reads the latest message against the pending premise question. */
export const turnIntents = ["answers_pending", "defers", "other_request", "unrelated"] as const;
export const turnIntentInstruction = [
  "turnIntent classifica a última mensagem da pessoa em relação à pergunta de premissas pendente desta análise:",
  "answers_pending quando ela informa fatos que a análise pediu, inclusive qualitativos e confirmações de fatos, mesmo com vencimento futuro (\"a CCB vence amanhã\" responde);",
  "defers quando ela promete enviar ou confirmar depois, ou diz que ainda não tem a informação;",
  "other_request quando ela pede outra entrega ou outra análise; unrelated nos demais casos.",
  "Se a própria mensagem pede esta análise, devolva answers_pending.",
].join(" ");
