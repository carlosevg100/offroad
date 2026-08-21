import Decimal from "decimal.js";

import type {DeskAnalysis} from "./analyze";
import type {Trajectory} from "./trajectory";

/**
 * The questions the desk asks the company, generated from what the numbers exposed.
 *
 * "Envie mais documentos" is what a portal says. A desk asks the question the analysis opened,
 * with the numbers in it, and each question here carries the finding it came from, so the
 * conversation with the company is the analysis continuing rather than a checklist beside it.
 * The order is the meeting's order: what changes the deal first.
 */

export type ClientQuestion = {
  /** The finding or gap this question exists because of. */
  findingId: string;
  severity: "critical" | "high" | "medium";
  pt: string;
  en: string;
};

const brlM = (value: Decimal.Value): string => `R$ ${new Decimal(value).div(1_000_000).toFixed(1).replace(".", ",")}M`;

export function questionsForCompany(
  desk: DeskAnalysis | null,
  trajectory: Trajectory | null,
  missing: readonly string[] = [],
): ClientQuestion[] {
  const questions: ClientQuestion[] = [];
  if (!desk) {
    return missing.map((path) => ({
      findingId: `missing:${path}`,
      severity: "high" as const,
      pt: `A análise de crédito não pôde ser montada sem ${path}. Consegue enviar o documento que traz essa informação?`,
      en: `The credit analysis could not be assembled without ${path}. Can you send the document that carries it?`,
    }));
  }

  const has = (id: string) => desk.findings.some((finding) => finding.id === id);
  const finding = (id: string) => desk.findings.find((entry) => entry.id === id);

  if (has("amount-divergence")) {
    const values = finding("amount-divergence")!.values;
    const amounts = Object.values(values).map((value) => brlM(value)).join(" e ");
    questions.push({
      findingId: "amount-divergence",
      severity: "critical",
      pt: `A documentação pede dois valores diferentes: ${amounts}. Qual é o valor da operação? Nenhum material vai a mercado antes dessa resposta.`,
      en: `The documentation asks for two different amounts: ${amounts}. Which is the transaction size? No material goes to market before this answer.`,
    });
  }

  if (has("covenant-breach-day-one")) {
    const values = finding("covenant-breach-day-one")!.values;
    questions.push({
      findingId: "covenant-breach-day-one",
      severity: "critical",
      pt: `Do jeito pedido, a operação rompe covenant existente no primeiro dia (${brlM(values.maxNewDebt!)} caberiam; o pedido é maior). O desenho natural é quitar as linhas com covenant dentro da captação. A companhia está aberta a incluir essa quitação na operação, ou prefere renegociar os covenants com os bancos atuais?`,
      en: `As asked, the transaction breaches an existing covenant on day one (${brlM(values.maxNewDebt!)} would fit; the ask is larger). The natural structure takes out the covenanted lines inside the raise. Is the company open to including that takeout, or would it rather renegotiate the covenants with the incumbent banks?`,
    });
  }

  if (has("stack-vs-balance")) {
    const values = finding("stack-vs-balance")!.values;
    questions.push({
      findingId: "stack-vs-balance",
      severity: "critical",
      pt: `O balanço reconhece ${brlM(values.gap!)} de dívida que o mapa não lista. O que compõe essa diferença? Se for arrendamento mercantil, precisamos dos contratos ou da nota explicativa detalhada.`,
      en: `The balance sheet recognises ${brlM(values.gap!)} of debt the schedule does not list. What makes up the difference? If it is leasing, we need the contracts or the detailed note.`,
    });
  }

  if (has("wc-ask-vs-need")) {
    const values = finding("wc-ask-vs-need")!.values;
    questions.push({
      findingId: "wc-ask-vs-need",
      severity: "high",
      pt: `O crescimento projetado absorve ${brlM(values.need!)} de capital de giro, mas o pedido rotula ${brlM(values.ask!)} como giro. O que a diferença financia: alongamento do ciclo, recomposição de caixa, substituição de linhas? O fundo vai perguntar, e a resposta muda a estrutura.`,
      en: `Projected growth absorbs ${brlM(values.need!)} of working capital, yet the ask labels ${brlM(values.ask!)} as working capital. What does the difference fund: a longer cycle, cash rebuild, line replacement? The fund will ask, and the answer changes the structure.`,
    });
  }

  if (has("rate-ask-vs-stack")) {
    questions.push({
      findingId: "rate-ask-vs-stack",
      severity: "high",
      pt: `A taxa esperada está abaixo do custo médio do estoque atual, para dinheiro mais alavancado e mais junior. Antes da conversa com fundos: a expectativa comporta revisão, ou existe âncora (garantia adicional, aval, recebível específico) que justifique o nível pedido?`,
      en: `The expected rate sits below the current stack's average cost, for more levered, more junior money. Before any fund conversation: is the expectation open to revision, or is there an anchor (extra collateral, guarantees, a specific receivable) that supports the level asked?`,
    });
  }

  if (has("receivables-encumbrance")) {
    const values = finding("receivables-encumbrance")!.values;
    questions.push({
      findingId: "receivables-encumbrance",
      severity: "high",
      pt: `Dos recebíveis, ${brlM(values.free!)} estão livres e o pedido consome quase tudo. Existe outra base de garantia disponível (imóveis, frota livre, estoque), ou a operação deve liberar as duplicatas hoje caucionadas quitando as linhas correspondentes?`,
      en: `Of the receivables, ${brlM(values.free!)} is free and the ask consumes nearly all of it. Is another collateral base available (property, unencumbered fleet, inventory), or should the transaction free today's pledged receivables by taking out the corresponding lines?`,
    });
  }

  if (has("grace-vs-project")) {
    const values = finding("grace-vs-project")!.values;
    questions.push({
      findingId: "grace-vs-project",
      severity: "medium",
      pt: `A carência pedida termina ${values.gapMonths} meses antes de o projeto operar, e esse intervalo é servido pelo caixa atual. A companhia prefere carência maior (com custo), ou demonstra a folga de caixa do intervalo nas projeções?`,
      en: `The requested grace ends ${values.gapMonths} months before the project operates, and that interval is served by current cash. Does the company prefer longer grace (at a cost), or will it evidence the interval's cash headroom in the projections?`,
    });
  }

  for (const path of missing) {
    questions.push({
      findingId: `missing:${path}`,
      severity: "medium",
      pt: `Falta ${path} para completar a análise. Consegue enviar o documento que traz essa informação?`,
      en: `${path} is missing from the analysis. Can you send the document that carries it?`,
    });
  }

  void trajectory;
  const order = {critical: 0, high: 1, medium: 2};
  return questions.sort((a, b) => order[a.severity] - order[b.severity]);
}
