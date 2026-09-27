import {compareFigures, presentationAmount, presentationFigure, testScheduleTieOut, type DecimalInput} from "@offroad/financial-core";

import type {DeskAnalysis} from "./analyze";
import type {Trajectory} from "./trajectory";

/**
 * The questions the desk asks the company, generated from what the numbers exposed.
 *
 * "Envie mais documentos" is what a portal says. A desk asks the question the analysis opened,
 * with the numbers in it, and each question here carries the finding it came from, so the
 * conversation with the company is the analysis continuing rather than a checklist beside it.
 * The order is the meeting's order: what changes the deal first.
 *
 * Every figure a question states comes from `@offroad/financial-core` and is printed in the
 * language of the question, with its own separators: amounts by the one rule every material
 * prints them with, multiples, months and percentages half-up on the decimal value. Portuguese
 * and English state the same figures (invariant 9). An input the analysis lacks is named in the
 * company's words, never by its field path.
 */

export type ClientQuestion = {
  /** The finding or gap this question exists because of. */
  findingId: string;
  severity: "critical" | "high" | "medium";
  pt: string;
  en: string;
};

type Locale = "pt-BR" | "en-US";
const local = (figure: string, locale: Locale) => (locale === "pt-BR" ? figure.replace(".", ",") : figure);
/** R$ 42,3M and R$ 42.3M; thousands below a million, never "R$ 0,0M" for an amount that is not zero. */
const brl = (value: DecimalInput, locale: Locale): string => presentationAmount({value, locale, style: "abbreviated"}).text;
const turns = (value: DecimalInput, locale: Locale): string => `${local(presentationFigure({value, decimals: 2}).value, locale)}x`;
const count = (value: DecimalInput, decimals: number, locale: Locale): string => local(presentationFigure({value, decimals}).value, locale);
const percent = (value: DecimalInput): string => presentationFigure({value, scale: "percent", decimals: 0}).value;

/**
 * What each input the desk reads is, in the company's words: every path `buildDeskInputs` reports
 * missing has a label here, so a question never prints a field path.
 */
const inputLabels: Record<string, {pt: string; en: string}> = {
  "historical_financials.{ano}.revenue": {pt: "receita líquida do último exercício", en: "net revenue for the latest financial year"},
  "historical_financials.{ano}.ebitda": {pt: "EBITDA do último exercício", en: "EBITDA for the latest financial year"},
  "historical_financials.{ano}.cash": {pt: "caixa no fim do último exercício", en: "cash at the end of the latest financial year"},
  "historical_financials.{ano}.gross_debt": {pt: "dívida bruta no balanço do último exercício", en: "gross debt on the latest year-end balance sheet"},
  "debt.instruments": {pt: "mapa de dívida, linha a linha", en: "debt schedule, line by line"},
  "transaction.requested_amount": {pt: "valor pedido para a operação", en: "amount requested for the transaction"},
  "projections.{ano}.ebitda": {pt: "projeção de EBITDA dos próximos exercícios", en: "EBITDA projection for the coming years"},
  "transaction.desired_term_months": {pt: "prazo desejado para a operação", en: "desired tenor for the transaction"},
  "transaction.desired_grace_months": {pt: "carência desejada para a operação", en: "desired grace period for the transaction"},
};
/**
 * An input the desk lacks, in the company's words: the questions and the list of missing information
 * on the desk screen name it the same way, never by its field path.
 */
export function deskInputLabel(path: string): {pt: string; en: string} {
  return inputLabels[path] ?? {pt: "informação exigida pela análise", en: "information the analysis requires"};
}
const inputLabel = deskInputLabel;

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
      pt: `A análise de crédito não pôde ser montada sem este dado: ${inputLabel(path).pt}. Consegue enviar o documento que traz essa informação?`,
      en: `The credit analysis could not be assembled without this information: ${inputLabel(path).en}. Can you send the document that carries it?`,
    }));
  }

  const has = (id: string) => desk.findings.some((finding) => finding.id === id);
  const finding = (id: string) => desk.findings.find((entry) => entry.id === id);

  if (has("amount-divergence")) {
    const values = Object.values(finding("amount-divergence")!.values);
    const amounts = (locale: Locale) => values.map((value) => brl(value, locale)).join(locale === "pt-BR" ? " e " : " and ");
    questions.push({
      findingId: "amount-divergence",
      severity: "critical",
      pt: `A documentação pede dois valores diferentes: ${amounts("pt-BR")}. Qual é o valor da operação? Nenhum material vai a mercado antes dessa resposta.`,
      en: `The documentation asks for two different amounts: ${amounts("en-US")}. Which is the transaction size? No material goes to market before this answer.`,
    });
  }

  if (has("covenant-breach-day-one")) {
    const values = finding("covenant-breach-day-one")!.values;
    const alreadyAbove = compareFigures(values.maxNewDebt!, 0) < 0;
    questions.push({
      findingId: "covenant-breach-day-one",
      severity: "critical",
      pt: alreadyAbove
        ? `A alavancagem já está acima do covenant (${values.pre ? turns(values.pre, "pt-BR") : ""} contra ${turns(values.ceiling!, "pt-BR")}). Qual é o plano até a próxima medição: geração de caixa sazonal, venda de ativos, resgate de linhas com a captação, ou waiver já negociado com os credores? A resposta define se a operação é troca de passivo ou dinheiro novo.`
        : `Do jeito pedido, a operação rompe covenant existente no primeiro dia (${brl(values.maxNewDebt!, "pt-BR")} caberiam; o pedido é maior). O desenho natural é quitar as linhas com covenant dentro da captação. A companhia está aberta a incluir essa quitação na operação, ou prefere renegociar os covenants com os bancos atuais?`,
      en: alreadyAbove
        ? `Leverage is already above the covenant (${values.pre ? turns(values.pre, "en-US") : ""} against ${turns(values.ceiling!, "en-US")}). What is the plan to the next test: seasonal cash generation, asset sales, lines repaid with the raise, or a waiver already agreed with creditors? The answer decides whether this deal is a liability swap or new money.`
        : `As asked, the transaction breaches an existing covenant on day one (${brl(values.maxNewDebt!, "en-US")} would fit; the ask is larger). The natural structure takes out the covenanted lines inside the raise. Is the company open to including that takeout, or would it rather renegotiate the covenants with the incumbent banks?`,
    });
  }

  if (has("short-term-principal-vs-cash")) {
    const values = finding("short-term-principal-vs-cash")!.values;
    questions.push({
      findingId: "short-term-principal-vs-cash",
      severity: compareFigures(values.coverage!, 1) < 0 ? "critical" : "high",
      pt: `${brl(values.maturing12!, "pt-BR")} de principal vencem em 12 meses contra ${brl(values.cash!, "pt-BR")} de caixa. Qual é o fluxo de caixa mensal projetado para esse período, com a sazonalidade de compras, e quais dessas parcelas já têm renovação acertada com o credor?`,
      en: `${brl(values.maturing12!, "en-US")} of principal falls due within 12 months against ${brl(values.cash!, "en-US")} of cash. What is the projected monthly cash flow for that period, with purchasing seasonality, and which of those instalments already have a renewal agreed with the lender?`,
    });
  }

  if (has("runway-short")) {
    const values = finding("runway-short")!.values;
    questions.push({
      findingId: "runway-short",
      severity: "critical",
      pt: `O runway atual é de ${count(values.monthsPre!, 1, "pt-BR")} meses. Qual é o plano de caixa mês a mês até a próxima rodada, e o que é cortado se ela atrasar um trimestre? Os fundos atuais já confirmaram por escrito a reserva para acompanhar?`,
      en: `Current runway is ${count(values.monthsPre!, 1, "en-US")} months. What is the month-by-month cash plan to the next round, and what gets cut if it slips a quarter? Have the current funds confirmed follow-on reserves in writing?`,
    });
  }

  if (has("runway-stated-vs-computed")) {
    const values = finding("runway-stated-vs-computed")!.values;
    questions.push({
      findingId: "runway-stated-vs-computed",
      severity: "high",
      pt: `A carta fala em ${count(values.stated!, 0, "pt-BR")} meses de runway e o extrato dá ${count(values.computed!, 1, "pt-BR")}. Qual queima mensal a companhia usa, e o que muda nela nos próximos seis meses?`,
      en: `The letter says ${count(values.stated!, 0, "en-US")} months of runway and the statement gives ${count(values.computed!, 1, "en-US")}. Which monthly burn does the company use, and what changes in it over the next six months?`,
    });
  }

  if (has("debt-to-arr")) {
    const values = finding("debt-to-arr")!.values;
    questions.push({
      findingId: "debt-to-arr",
      severity: "high",
      pt: `Com a captação, a dívida chega a ${percent(values.debtToArr!)}% do ARR. A companhia aceita um tíquete menor em tranches liberadas contra marcos de ARR, ou prefere manter o valor e oferecer warrant maior?`,
      en: `With the raise, debt reaches ${percent(values.debtToArr!)}% of ARR. Would the company take a smaller ticket in tranches released against ARR milestones, or keep the amount and offer a larger warrant?`,
    });
  }

  if (has("customer-concentration")) {
    const values = finding("customer-concentration")!.values;
    questions.push({
      findingId: "customer-concentration",
      severity: "high",
      pt: `O maior cliente é ${percent(values.topCustomerShare!)}% do MRR. Qual é o prazo e a cláusula de rescisão do contrato, e quando foi a última renovação?`,
      en: `The largest customer is ${percent(values.topCustomerShare!)}% of MRR. What are the contract's term and termination clause, and when was it last renewed?`,
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
    // The tie-out the finding stated, read again: how far apart the schedule and the balance sheet are.
    const gap = testScheduleTieOut({scheduleGap: values.gap!, totalOnBalance: values.onBalance!, tolerance: "0.02"}).magnitude;
    const balanceAbove = compareFigures(values.gap!, 0) >= 0;
    questions.push({
      findingId: "stack-vs-balance",
      severity: "critical",
      pt: balanceAbove
        ? `O balanço reconhece ${brl(gap, "pt-BR")} de dívida que o mapa não lista. O que compõe essa diferença? Se for arrendamento mercantil, precisamos dos contratos ou da nota explicativa detalhada.`
        : `O mapa de dívida soma ${brl(gap, "pt-BR")} a mais do que o balanço reconhece na data-base. O mapa inclui juros apropriados, custo de transação ou linhas de controladas que o balanço apresenta em outra rubrica? Precisamos da conciliação mapa × balanço na mesma data.`,
      en: balanceAbove
        ? `The balance sheet recognises ${brl(gap, "en-US")} of debt the schedule does not list. What makes up the difference? If it is leasing, we need the contracts or the detailed note.`
        : `The debt schedule sums to ${brl(gap, "en-US")} more than the balance sheet recognises at the reference date. Does the schedule include accrued interest, transaction costs or subsidiary lines the balance sheet presents elsewhere? We need the schedule-to-balance reconciliation on the same date.`,
    });
  }

  if (has("wc-ask-vs-need")) {
    const values = finding("wc-ask-vs-need")!.values;
    // A negative cash cycle releases working capital as revenue grows: the question names what is released, never a negative absorption.
    questions.push(values.released !== undefined
      ? {
          findingId: "wc-ask-vs-need",
          severity: "high",
          pt: `O crescimento projetado libera ${brl(values.released, "pt-BR")} de capital de giro, porque o ciclo de caixa é negativo, mas o pedido rotula ${brl(values.ask!, "pt-BR")} como giro. O que esse valor financia: alongamento do ciclo, recomposição de caixa, substituição de linhas? O fundo vai perguntar, e a resposta muda a estrutura.`,
          en: `Projected growth releases ${brl(values.released, "en-US")} of working capital, because the cash cycle is negative, yet the ask labels ${brl(values.ask!, "en-US")} as working capital. What does that amount fund: a longer cycle, cash rebuild, line replacement? The fund will ask, and the answer changes the structure.`,
        }
      : {
          findingId: "wc-ask-vs-need",
          severity: "high",
          pt: `O crescimento projetado absorve ${brl(values.need!, "pt-BR")} de capital de giro, mas o pedido rotula ${brl(values.ask!, "pt-BR")} como giro. O que a diferença financia: alongamento do ciclo, recomposição de caixa, substituição de linhas? O fundo vai perguntar, e a resposta muda a estrutura.`,
          en: `Projected growth absorbs ${brl(values.need!, "en-US")} of working capital, yet the ask labels ${brl(values.ask!, "en-US")} as working capital. What does the difference fund: a longer cycle, cash rebuild, line replacement? The fund will ask, and the answer changes the structure.`,
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
      pt: `Dos recebíveis, ${brl(values.free!, "pt-BR")} estão livres e o pedido consome quase tudo. Existe outra base de garantia disponível (imóveis, frota livre, estoque), ou a operação deve liberar as duplicatas hoje caucionadas quitando as linhas correspondentes?`,
      en: `Of the receivables, ${brl(values.free!, "en-US")} is free and the ask consumes nearly all of it. Is another collateral base available (property, unencumbered fleet, inventory), or should the transaction free today's pledged receivables by taking out the corresponding lines?`,
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
      pt: `Para completar a análise, falta este dado: ${inputLabel(path).pt}. Consegue enviar o documento que traz essa informação?`,
      en: `To complete the analysis, this information is missing: ${inputLabel(path).en}. Can you send the document that carries it?`,
    });
  }

  void trajectory;
  const order = {critical: 0, high: 1, medium: 2};
  return questions.sort((a, b) => order[a.severity] - order[b.severity]);
}
