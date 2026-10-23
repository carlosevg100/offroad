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

/** The speaker promises to answer later, in the first person ("vou confirmar", "mando a ata em 2
 * dias", "te passo"). A due date of the fact itself ("a folha vence amanhã") is not a deferral. */
const deferrals = [
  /\b(vou|vamos|irei|iremos)\s+(confirmar|mandar|enviar|verificar|checar|levantar|passar|ver)\b/,
  /\b(mando|envio|confirmo|passo|levanto|verifico)\s+(\S+\s+){0,6}?(depois|amanha|mais tarde|em seguida|na semana que vem|em \d+ (dias?|horas?|semanas?))\b/,
  /\b(te|lhe)\s+(mando|envio|passo|confirmo)\b/,
  /\bainda nao tenho\b/, /\bnao sei ainda\b/,
];
const defers = (text: string) => deferrals.some((d) => d.test(text));
/** A short answer: a qualitative gap ("É para refinanciamento.") is answered in a sentence or two. */
const shortAnswer = 280;

/** A message that answers the pending gaps of its kind: data with a quantity, even with a
 * confirmation tag, or a short declarative answer with data or a qualitative fact of its kind and no
 * number at all ("É para refinanciamento."). A question, a request for explanation, a deferral or a
 * remark without such data does not. */
export function answersWithData(message: string, data: RegExp, qualitative?: RegExp): boolean {
  const text = foldCue(message).trim();
  const asks = interrogative.test(text) || explanation.test(text) || (text.endsWith("?") && !confirmationTag.test(text));
  if (asks || defers(text)) return false;
  if (data.test(text) && quantity.test(text)) return true;
  return text.length <= shortAnswer && (data.test(text) || !!qualitative?.test(text));
}

/** The objectives of another premise method: an answer that compiles to one of them is that method's. */
const specificKinds = new Set(["proposal_comparison", "relative_debt_cost", "debt_capacity", "debt_table", "covenant_headroom", "weekly_cash"]);
/** A request for other work opens with an imperative from this list, whole words only, so nouns
 * ("Montante", "Projeto", "Projeção", "Análise") never match. */
const imperatives = ["monte", "monta", "montar", "revise", "revisa", "revisar", "prepare", "prepara", "preparar", "projete", "projeta", "projetar",
  "calcule", "calcula", "calcular", "analise", "analisa", "analisar", "atualize", "atualiza", "atualizar", "verifique", "verifica", "verificar",
  "compare", "compara", "comparar", "elabore", "elabora", "gere", "gera", "crie", "cria", "liste", "lista", "mostre", "mostra", "faca", "faz", "fazer",
  "refaca", "simule", "simula", "avalie", "avalia", "levante", "levanta", "organize", "organiza", "extraia", "extrai"];
const command = new RegExp(`^((e|mas|entao|ok|agora)[\\s,]+)?((pode|poderia|por favor|quero que|preciso que|voce pode)[\\s,]+)*(${imperatives.join("|")})(?![a-z0-9])`);
/** Whether a message may continue a premise question of `kind`: the same compiled kind continues (a
 * request of that kind is the same request); another premise method's kind refuses; a request for
 * other work refuses; otherwise a declarative answer continues, also when the router misreads it as
 * other work (a bare "covenant" compiles to a risk matrix). */
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
  // A promise to answer later is not an answer, even when it names the work.
  if (defers(foldCue(message).trim())) return false;
  const own = premiseCueKind(message, hasAttachments);
  if (own) return own === kind;
  if (!answersWithData(message, data, qualitative) || !mayContinue(kind, message, hasAttachments)) return false;
  for (let n = earlierUserMessages.length - 1; n >= 0; n--) {
    const earlier = premiseCueKind(earlierUserMessages[n]!, false);
    if (earlier) return earlier === kind;
  }
  return false;
}
