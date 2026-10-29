import {compileObjectiveToPlan} from "@offroad/work-plan";

export const foldCue = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const capacityCue = /\b(quanto (de )?(divida )?((a gente|a empresa|a companhia|nos|eu) )?(cabe|aguent\w*|suport\w*|consig\w* (tomar|captar)|pode\w* (tomar|captar)|posso (tomar|captar)|da para (tomar|captar))|capacidade de (endividamento|divida|alavancagem)|alavancagem maxima)/;

/** A request for explanation is the imperative that opens the message ("explica", "pode detalhar"), not the
 * same verb inside a statement ("conforme detalha a projeção"). */
const explanation = /^((e|mas|entao|ok|ah)[\s,]+)?((pode|poderia|consegue|voce pode|me|por favor)[\s,]+)*(explica|explique|explicar|detalha|detalhe|detalhar|esclarece|esclareca|esclarecer|resuma|resumir)\b|\bo que significa\b/;
const confirmationTag = /,?\s*(certo|correto|ne|ok|confere|isso|nao e)\s*\?$/;

/** A question (a message ending in "?" that is not a confirmation tag) or a request for explanation
 * never continues a premise question; an answer may open with "Como" or "Quanto ao". Whether anything else
 * answers it, defers it or asks for other work is the extraction's `turnIntent` to decide. */
export function asksOrExplains(message: string): boolean {
  const text = foldCue(message).trim();
  return explanation.test(text) || (text.endsWith("?") && !confirmationTag.test(text));
}

/** The objectives of the premise methods: an answer that compiles to another one is that method's. */
const premiseKinds = new Set(["proposal_comparison", "relative_debt_cost", "debt_capacity", "debt_table", "covenant_headroom", "weekly_cash",
  "operating_projection", "projection_challenge", "receivables_funding", "quarter_update",
  "document_folder", "received_proposal", "financing_paths", "board_capital_discussion"]);

export type PremiseCueKind = "debt_capacity" | "debt_table" | "covenant_headroom" | "weekly_cash" | "operating_projection" | "projection_challenge" | "receivables_funding"
  | "quarter_update" | "document_folder" | "received_proposal" | "financing_paths" | "board_capital_discussion";
const cueKinds = new Set<string>(["debt_table", "covenant_headroom", "weekly_cash", "operating_projection", "projection_challenge", "receivables_funding", "quarter_update",
  "document_folder", "received_proposal", "financing_paths", "board_capital_discussion"]);
/** Asking only how to start a projection is answered with orientation; the first version is offered, not produced. */
const orientationOnly = /\bcomo (?:comec\w*|inicio|iniciar)\b/;
/** The premise step a message asks for on its own: the capacity cue first, then the router's lote 2, lote 3
 * and lote 4 objectives. A conceptual question routes elsewhere and asks for none. The quarter close's step
 * proposes only when the work has its prior completed weekly cash and covenant results. */
export function premiseCueKind(message: string, hasAttachments: boolean): PremiseCueKind | null {
  const kind = compileObjectiveToPlan({message, hasAttachments}).objectiveKind;
  if (capacityCue.test(foldCue(message))) return kind === "factual_question" ? null : "debt_capacity";
  if (kind === "operating_projection" && orientationOnly.test(foldCue(message))) return null;
  return cueKinds.has(kind) ? kind as PremiseCueKind : null;
}

/** How a turn enters a premise step of one kind: by its own cue, or as a continuation candidate when
 * the latest earlier premise question among the recent messages is of this kind, the message is not a
 * question nor a request for explanation, and it does not compile to another premise method. A
 * step, cue or continuation, proposes only when the extraction reads the turn as answering what is
 * pending or as requesting this analysis. */
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
