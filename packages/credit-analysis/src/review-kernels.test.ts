import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {deskCases} from "./desk-cases.test-support";
import {buildDeskInputs, type Fact} from "./from-facts";
import {parseCovenant, parseRate, parseReceivablesCoverage} from "./parse";
import {questionsForCompany} from "./questions";
import {rateCredit} from "./rating";

/**
 * The deliberate differences of the third polish of stage 19, none of which a fixture reaches: each
 * assertion below failed on the code before the move of the rating, the reading of rates and the
 * desk inputs into `@offroad/financial-core`, and on the working-capital finding before a negative
 * need was read as working capital released.
 */
describe("the deliberate differences of the credit review's move to financial-core", () => {
  const aurora = deskCases()["unit:aurora"]!;

  it("rounds the rating's score half-up on the exact decimal: 23 points of 40 score 58, never 57", () => {
    const desk = analyzeCreditPosition(aurora.desk!);
    // Leverage 2.0x (3 points x 3), coverage 3x (2 x 2), liquidity 1.2x (2 x 2), a flat trend, 25% in the largest customer and a rank of 4 (2 x 1 each).
    const varied = {...desk, leverage: {...desk.leverage, scenarios: [], preTurns: "2.0000"}, stack: {...desk.stack, liquidityCoverage12: "1.2000", maturingWithin12Months: "5000000.00"}};
    const rating = rateCredit({desk: varied, trajectory: null, financialExpenses: "5616000", priorEbitda: desk.leverage.ebitda, topCustomerShare: "0.25", evidenceRank: "4"});
    expect(rating.factors.map((factor) => factor.points)).toEqual([3, 2, 2, 2, 2, 2]);
    expect(rating.score).toBe(58);
    expect(rating.grade).toBe(5);
    expect(rating.summary.pt).toBe("Rating interno 5 de 10 (atenção), 58 pontos em 100 sobre 6 de 6 fatores avaliáveis.");
  });

  it("reads a single dot that cannot group thousands as the decimal point, and refuses what is not a figure instead of failing", () => {
    // "4.10" was read as 410% of spread and "3.5x" as a ceiling of 35 times EBITDA.
    expect(parseRate("CDI + 4.10% a.a.")).toEqual({kind: "index_plus_spread", index: "CDI", spreadAnnual: "0.041000"});
    expect(parseCovenant("Dívida líquida/EBITDA <= 3.5x")?.maximum).toBe("3.5000");
    // Two commas made the reading throw; a separator at the start was read as a figure; groups that are not three digits were joined.
    expect(parseRate("CDI + 1,2,3% a.a.")).toBeNull();
    expect(parseRate(",5% a.m.")).toBeNull();
    expect(parseReceivablesCoverage("Duplicatas 1.2.3%")).toBeNull();
    // What the fixtures write is read as before, the period that ends a sentence included.
    expect(parseRate("CDI + 1.234,5% a.a.")?.kind).toBe("index_plus_spread");
    expect(parseCovenant("Dívida líquida/EBITDA menor ou igual a 3,0.")?.maximum).toBe("3.0000");
  });

  it("reads month counts, the larger amount and a covenant multiple from facts as figures, never as zero or as binary numbers", () => {
    const facts: Fact[] = [
      {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
      {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
      {fieldPath: "historical_financials.2025.cash", value: "8420000"},
      {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
      {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
      {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
      {fieldPath: "debt.instruments.1.balance", value: "9840000"},
      {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 1.234,5x"},
      {fieldPath: "transaction.requested_amount", value: "12345678901234567.01"},
      {fieldPath: "transaction.desired_term_months", value: "48"},
      {fieldPath: "transaction.desired_grace_months", value: "6"},
      {fieldPath: "projections.2026.ebitda", value: "18760000"},
    ];
    const options = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}, statedRequest: {amount: "12345678901234567.02"}};
    const inputs = buildDeskInputs(facts, options);
    // Binary numbers saw the two amounts as one and kept the documents' amount.
    expect(inputs.trajectory?.newDebt.amount).toBe("12345678901234567.02");
    // The multiple was handed on as "1.234.5".
    expect(inputs.trajectory?.existingCovenants).toEqual([{lender: "Banco Itaú", maximum: "1234.5"}]);
    // An empty count was zero months and "0x3C" sixty; neither is a count, so the term is asked for.
    for (const term of ["", "0x3C"]) {
      const unread = buildDeskInputs(facts.map((fact) => (fact.fieldPath === "transaction.desired_term_months" ? {...fact, value: term} : fact)), options);
      expect(unread.trajectory, term).toBeNull();
      expect(unread.missing, term).toContain("transaction.desired_term_months");
    }
  });

  it("reads a negative working-capital need as working capital released, never as a negative multiple of the ask", () => {
    // Suppliers of R$ 150M on R$ 143,4M of cost of goods sold: a cash cycle of about -190 days.
    const input = {...aurora.desk!, balance: {...aurora.desk!.balance, suppliers: "150000000"}};
    const desk = analyzeCreditPosition(input);
    expect(desk.workingCapital.cycleDays!.startsWith("-")).toBe(true);
    const finding = desk.findings.find((entry) => entry.id === "wc-ask-vs-need")!;
    expect(finding.pt).toContain("libera R$ 9,0M de capital de giro ao ciclo atual de -190 dias, porque o ciclo de caixa é negativo");
    expect(finding.en).toContain("releases R$ 9.0M of working capital at the current -190-day cycle, because the cash cycle is negative");
    expect(finding.pt).not.toMatch(/vezes a necessidade|R\$ -/);
    expect(finding.values).toMatchObject({need: "-9004384.59", released: "9004384.59", cycleDays: "-190.0"});
    const question = questionsForCompany(desk, null, []).find((entry) => entry.findingId === "wc-ask-vs-need")!;
    expect(question.pt).toBe("O crescimento projetado libera R$ 9,0M de capital de giro, porque o ciclo de caixa é negativo, mas o pedido rotula R$ 25,0M como giro. O que esse valor financia: alongamento do ciclo, recomposição de caixa, substituição de linhas? O fundo vai perguntar, e a resposta muda a estrutura.");
    expect(question.en).toBe("Projected growth releases R$ 9.0M of working capital, because the cash cycle is negative, yet the ask labels R$ 25.0M as working capital. What does that amount fund: a longer cycle, cash rebuild, line replacement? The fund will ask, and the answer changes the structure.");
  });
});
