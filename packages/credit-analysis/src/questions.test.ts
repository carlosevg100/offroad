import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
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

  it("degrades to document requests when no analysis could be built", () => {
    const none = questionsForCompany(null, null, ["historical_financials.{ano}.ebitda"]);
    expect(none).toHaveLength(1);
    expect(none[0]!.pt).toContain("historical_financials.{ano}.ebitda");
  });
});
