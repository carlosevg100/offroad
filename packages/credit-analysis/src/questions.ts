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
      pt: new Decimal(values.maxNewDebt!).lt(0)
        ? `A alavancagem já está acima do covenant (${values.pre ? `${new Decimal(values.pre).toFixed(2).replace(".", ",")}x` : ""} contra ${new Decimal(values.ceiling!).toFixed(2).replace(".", ",")}x). Qual é o plano até a próxima medição: geração de caixa sazonal, venda de ativos, resgate de linhas com a captação, ou waiver já negociado com os credores? A resposta define se a operação é troca de passivo ou dinheiro novo.`
        : `Do jeito pedido, a operação rompe covenant existente no primeiro dia (${brlM(values.maxNewDebt!)} caberiam; o pedido é maior). O desenho natural é quitar as linhas com covenant dentro da captação. A companhia está aberta a incluir essa quitação na operação, ou prefere renegociar os covenants com os bancos atuais?`,
      en: new Decimal(values.maxNewDebt!).lt(0)
        ? `Leverage is already above the covenant (${values.pre ? `${new Decimal(values.pre).toFixed(2)}x` : ""} against ${new Decimal(values.ceiling!).toFixed(2)}x). What is the plan to the next test: seasonal cash generation, asset sales, lines repaid with the raise, or a waiver already agreed with creditors? The answer decides whether this deal is a liability swap or new money.`
        : `As asked, the transaction breaches an existing covenant on day one (${brlM(values.maxNewDebt!)} would fit; the ask is larger). The natural structure takes out the covenanted lines inside the raise. Is the company open to including that takeout, or would it rather renegotiate the covenants with the incumbent banks?`,
    });
  }

  if (has("short-term-principal-vs-cash")) {
    const values = finding("short-term-principal-vs-cash")!.values;
    questions.push({
      findingId: "short-term-principal-vs-cash",
      severity: new Decimal(values.coverage!).lt(1) ? "critical" : "high",
      pt: `${brlM(values.maturing12!)} de principal vencem em 12 meses contra ${brlM(values.cash!)} de caixa. Qual é o fluxo de caixa mensal projetado para esse período, com a sazonalidade de compras, e quais dessas parcelas já têm renovação acertada com o credor?`,
      en: `${brlM(values.maturing12!)} of principal falls due within 12 months against ${brlM(values.cash!)} of cash. What is the projected monthly cash flow for that period, with purchasing seasonality, and which of those instalments already have a renewal agreed with the lender?`,
    });
  }

  if (has("runway-short")) {
    const values = finding("runway-short")!.values;
    questions.push({
      findingId: "runway-short",
      severity: "critical",
      pt: `O runway atual é de ${new Decimal(values.monthsPre!).toFixed(1).replace(".", ",")} meses. Qual é o plano de caixa mês a mês até a próxima rodada, e o que é cortado se ela atrasar um trimestre? Os fundos atuais já confirmaram por escrito a reserva para acompanhar?`,
      en: `Current runway is ${new Decimal(values.monthsPre!).toFixed(1)} months. What is the month-by-month cash plan to the next round, and what gets cut if it slips a quarter? Have the current funds confirmed follow-on reserves in writing?`,
    });
  }

  if (has("runway-stated-vs-computed")) {
    const values = finding("runway-stated-vs-computed")!.values;
    questions.push({
      findingId: "runway-stated-vs-computed",
      severity: "high",
      pt: `A carta fala em ${new Decimal(values.stated!).toFixed(0)} meses de runway e o extrato dá ${new Decimal(values.computed!).toFixed(1).replace(".", ",")}. Qual queima mensal a companhia usa, e o que muda nela nos próximos seis meses?`,
      en: `The letter says ${new Decimal(values.stated!).toFixed(0)} months of runway and the statement gives ${new Decimal(values.computed!).toFixed(1)}. Which monthly burn does the company use, and what changes in it over the next six months?`,
    });
  }

  if (has("debt-to-arr")) {
    const values = finding("debt-to-arr")!.values;
    questions.push({
      findingId: "debt-to-arr",
      severity: "high",
      pt: `Com a captação, a dívida chega a ${new Decimal(values.debtToArr!).times(100).toFixed(0)}% do ARR. A companhia aceita um tíquete menor em tranches liberadas contra marcos de ARR, ou prefere manter o valor e oferecer warrant maior?`,
      en: `With the raise, debt reaches ${new Decimal(values.debtToArr!).times(100).toFixed(0)}% of ARR. Would the company take a smaller ticket in tranches released against ARR milestones, or keep the amount and offer a larger warrant?`,
    });
  }

  if (has("customer-concentration")) {
    const values = finding("customer-concentration")!.values;
    questions.push({
      findingId: "customer-concentration",
      severity: "high",
      pt: `O maior cliente é ${new Decimal(values.topCustomerShare!).times(100).toFixed(0)}% do MRR. Qual é o prazo e a cláusula de rescisão do contrato, e quando foi a última renovação?`,
      en: `The largest customer is ${new Decimal(values.topCustomerShare!).times(100).toFixed(0)}% of MRR. What are the contract's term and termination clause, and when was it last renewed?`,
    });
  }

  if (has("nrr-below-par")) {
    questions.push({
      findingId: "nrr-below-par",
      severity: "high",
      pt: "A retenção líquida está abaixo de 100%. Qual é a análise de coortes dos últimos 12 meses, separando contração, churn e expansão, e o que explica cada uma?",
      en: "Net revenue retention is below 100%. What is the cohort analysis for the last 12 months, splitting contraction, churn and expansion, and what explains each?",
    });
  }

  if (has("stack-vs-balance")) {
    const values = finding("stack-vs-balance")!.values;
    questions.push({
      findingId: "stack-vs-balance",
      severity: "critical",
      pt: new Decimal(values.gap!).gte(0)
        ? `O balanço reconhece ${brlM(values.gap!)} de dívida que o mapa não lista. O que compõe essa diferença? Se for arrendamento mercantil, precisamos dos contratos ou da nota explicativa detalhada.`
        : `O mapa de dívida soma ${brlM(new Decimal(values.gap!).abs())} a mais do que o balanço reconhece na data-base. O mapa inclui juros apropriados, custo de transação ou linhas de controladas que o balanço apresenta em outra rubrica? Precisamos da conciliação mapa × balanço na mesma data.`,
      en: new Decimal(values.gap!).gte(0)
        ? `The balance sheet recognises ${brlM(values.gap!)} of debt the schedule does not list. What makes up the difference? If it is leasing, we need the contracts or the detailed note.`
        : `The debt schedule sums to ${brlM(new Decimal(values.gap!).abs())} more than the balance sheet recognises at the reference date. Does the schedule include accrued interest, transaction costs or subsidiary lines the balance sheet presents elsewhere? We need the schedule-to-balance reconciliation on the same date.`,
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
