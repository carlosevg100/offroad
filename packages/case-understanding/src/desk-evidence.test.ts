import {describe, expect, it} from "vitest";
import {analyzeCreditPosition, projectLeverageTrajectory, buildDeskInputs, type Fact} from "@offroad/credit-analysis";

import {auditClaims} from "./audit";
import {deskEvidence} from "./desk-evidence";

const facts: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
];

const build = () => {
  const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
  const desk = analyzeCreditPosition(inputs.desk!);
  const trajectory = inputs.trajectory ? projectLeverageTrajectory(inputs.trajectory) : null;
  return deskEvidence(desk, trajectory);
};

describe("the desk's findings are evidence, under the same gate as everything else", () => {
  it("turns every finding value into a citable calculation", () => {
    const evidence = build();
    const ids = evidence.calculations.map((calculation) => calculation.id);
    expect(ids).toContain("desk.covenant-breach-day-one.maxNewDebt");
    expect(ids).toContain("desk.divida_nova_que_cabe");
    expect(ids).toContain("desk.alavancagem_pre");
  });

  it("accepts a brief sentence that quotes the desk correctly", () => {
    const evidence = build();
    const audit = auditClaims({
      claims: [{
        id: "s:1",
        text: "Nos números atuais cabem R$ 13,6 milhões de dívida nova antes do covenant.",
        material: true,
        kind: "calculation",
        supportIds: ["desk.divida_nova_que_cabe"],
        approved: false,
      }],
      facts: [],
      calculations: evidence.calculations,
    });
    expect(audit.status).toBe("pass");
  });

  it("rejects a brief sentence that renumbers the desk", () => {
    // The whole architecture in one assertion: the model may rephrase, it may not renumber, and
    // the auditor that enforces it for documents enforces it for the battery too.
    const evidence = build();
    const audit = auditClaims({
      claims: [{
        id: "s:1",
        text: "Nos números atuais cabem R$ 25 milhões de dívida nova antes do covenant.",
        material: true,
        kind: "calculation",
        supportIds: ["desk.divida_nova_que_cabe"],
        approved: false,
      }],
      facts: [],
      calculations: evidence.calculations,
    });
    expect(audit.status).toBe("blocked");
    expect(audit.findings[0]?.reason).toBe("number_not_in_support");
  });

  it("gives the prompt the findings in desk language with their ids attached", () => {
    const evidence = build();
    const text = evidence.promptLines.join("\n");
    expect(text).toContain("[CRITICAL]");
    expect(text).toContain("desk.covenant-breach-day-one");
    expect(text).toContain("nunca recalcula");
  });

  it("is empty when there is no analysis, rather than inventing a section", () => {
    const evidence = deskEvidence(null, null);
    expect(evidence.calculations).toHaveLength(0);
    expect(evidence.promptLines).toHaveLength(0);
  });
});
