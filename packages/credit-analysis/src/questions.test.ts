import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {deskCases} from "./desk-cases.test-support";
import {buildDeskInputs, type Fact} from "./from-facts";
import {questionsForCompany} from "./questions";
import {projectLeverageTrajectory} from "./trajectory";

const auroraFacts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "transaction.use_of_proceeds.1.item", value: "Capital de giro"},
  {fieldPath: "transaction.use_of_proceeds.1.amount", value: "25000000"},
  {fieldPath: "projections.2026.revenue", value: "208500000"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
];

describe("the questions are the analysis continuing, not a checklist beside it", () => {
  const inputs = buildDeskInputs(auroraFacts, {
    referenceDate: "2026-08-21",
    indexLevels: {cdi: "0.105"},
    statedRequest: {amount: "40000000"},
  });
  const desk = analyzeCreditPosition(inputs.desk!);
  const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
  const questions = questionsForCompany(desk, trajectory, inputs.missing);

  it("asks the amount question first, with both numbers in it", () => {
    const first = questions[0]!;
    expect(first.findingId).toBe("amount-divergence");
    expect(first.pt).toContain("R$ 42,3M");
    expect(first.pt).toContain("R$ 40,0M");
    expect(first.pt).toContain("Nenhum material vai a mercado");
  });

  it("offers the covenant structure as a choice, not a verdict", () => {
    const covenant = questions.find((question) => question.findingId === "covenant-breach-day-one")!;
    expect(covenant.pt).toContain("quitar as linhas com covenant");
    expect(covenant.pt).toContain("renegociar");
  });

  it("asks what the working-capital difference funds, with the two numbers", () => {
    const wc = questions.find((question) => question.findingId === "wc-ask-vs-need")!;
    expect(wc.pt).toContain("R$ 25,0M");
    expect(wc.pt).toMatch(/R\$ \d+,\dM de capital de giro/);
  });

  it("orders the meeting: deal-changers first", () => {
    const severities = questions.map((question) => question.severity);
    expect(severities[0]).toBe("critical");
    const firstMedium = severities.indexOf("medium");
    if (firstMedium !== -1) {
      expect(severities.slice(firstMedium)).not.toContain("critical");
    }
  });

  it("degrades to document requests when no analysis could be built, naming the input in words", () => {
    const none = questionsForCompany(null, null, ["historical_financials.{ano}.ebitda"]);
    expect(none).toHaveLength(1);
    expect(none[0]!.findingId).toBe("missing:historical_financials.{ano}.ebitda");
    expect(none[0]!.pt).toBe("A análise de crédito não pôde ser montada sem este dado: EBITDA do último exercício. Consegue enviar o documento que traz essa informação?");
    expect(none[0]!.en).toBe("The credit analysis could not be assembled without this information: EBITDA for the latest financial year. Can you send the document that carries it?");
  });

  it("prints each amount in the language of the question by the one rule of the materials", () => {
    // A schedule 450 thousand above the balance sheet: before, "R$ 0,5M" in both languages.
    const small = analyzeCreditPosition({...inputs.desk!, balance: {...inputs.desk!.balance, grossDebt: "9390000"}});
    const gap = questionsForCompany(small, null).find((question) => question.findingId === "stack-vs-balance")!;
    expect(gap.pt).toContain("O mapa de dívida soma R$ 450 mil a mais");
    expect(gap.en).toContain("The debt schedule sums to R$ 450 thousand more");
    const amounts = questions.find((question) => question.findingId === "amount-divergence")!;
    expect(amounts.pt).toContain("R$ 42,3M e R$ 40,0M");
    expect(amounts.en).toContain("R$ 42.3M and R$ 40.0M");
  });
});

describe("no question shows an internal identifier", () => {
  it("names every input the desk can miss in words, in both languages, and never prints a field path", () => {
    for (const [key, entry] of Object.entries(deskCases())) {
      if (!entry.desk && entry.missing.length === 0) continue;
      const desk = entry.desk ? analyzeCreditPosition(entry.desk) : null;
      const trajectory = entry.trajectory ? projectLeverageTrajectory(entry.trajectory) : null;
      for (const question of questionsForCompany(desk, trajectory, entry.missing)) {
        for (const text of [question.pt, question.en]) {
          expect(text, `${key} ${question.findingId}`).not.toMatch(/\{ano\}|\b[a-z0-9]+_[a-z0-9_]+\b|\b[a-z_]+\.[a-z_{][a-z0-9_{}]*\b/);
          expect(text).not.toMatch(/[–—]/);
          expect(text).not.toContain("informação exigida pela análise");
        }
      }
    }
  });
});
