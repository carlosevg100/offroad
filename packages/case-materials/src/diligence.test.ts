import {describe, expect, it} from "vitest";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, type Fact} from "@offroad/credit-analysis";
import type {ReconciledFact} from "@offroad/reconciliation";

import {answerDiligence, diligenceQa, diligenceQuestionCount} from "./diligence";

const facts: Fact[] = [
  {fieldPath: "company.legal_name", value: "Aurora Distribuidora de Materiais de Construção Ltda"},
  {fieldPath: "company.sector", value: "Distribuição de materiais de construção"},
  {fieldPath: "company.founded_year", value: "2004"},
  {fieldPath: "company.employees", value: "214"},
  {fieldPath: "company.controllers.1.name", value: "Helena Bastos Corrêa"},
  {fieldPath: "company.controllers.1.ownership_pct", value: "0.52"},
  {fieldPath: "customers.top_customers.1.share_pct", value: "0.181"},
  {fieldPath: "customers.top_customers.2.share_pct", value: "0.12"},
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
  {fieldPath: "debt.instruments.1.rate", value: "CDI + 4,10% a.a."},
  {fieldPath: "debt.instruments.1.maturity", value: "2027-11-20"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
];
const reconciled: ReconciledFact[] = facts.map((fact) => ({
  key: {fieldPath: fact.fieldPath},
  value: fact.value,
  valueType: "text",
  accepted: {fieldPath: fact.fieldPath, normalizedValue: fact.value, valueType: "text", sourceDocument: "doc", evidenceRank: 1, informationClass: "audited", confidence: 1, anchorVerified: true},
  conflicts: [],
  disputed: false,
}));

describe("the diligence Q&A", () => {
  const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
  const desk = analyzeCreditPosition(inputs.desk!);
  const trajectory = projectLeverageTrajectory(inputs.trajectory!);
  const answers = answerDiligence({facts: reconciled, calculations: [], desk, trajectory});

  it("asks forty questions and drops the startup block for a cash-generative company", () => {
    expect(diligenceQuestionCount).toBe(40);
    expect(answers).toHaveLength(35);
  });

  it("answers what the room and the desk know, and cites it", () => {
    const byId = (id: string) => answers.find((entry) => entry.id === id)!;
    expect(byId("q01").answer?.pt).toContain("2004");
    expect(byId("q02").answer?.pt).toContain("52,0%");
    expect(byId("q11").answer?.pt).toContain("Banco Itaú");
    expect(byId("q13").answer?.pt).toContain("3,00x");
    expect(byId("q17").answer?.pt).toContain("R$ 42,3M");
    expect(byId("q18").answer?.pt).toContain("dinheiro novo");
    expect(byId("q25").answer?.pt).toContain("2026 ≤");
    expect(byId("q26").answer?.pt).toContain("Limitada");
    expect(byId("q11").supportIds).toContain("desk.custo_medio_do_stack");
  });

  it("leaves what it cannot know open, addressed to the company", () => {
    const open = answers.filter((entry) => entry.answer === null).map((entry) => entry.id);
    expect(open).toEqual(expect.arrayContaining(["q28", "q29", "q30", "q32", "q35"]));
  });

  it("compiles into a material with one table per section", () => {
    const material = diligenceQa({facts: reconciled, calculations: [], desk, trajectory});
    expect(material.kind).toBe("diligence_qa");
    expect(material.blocks.filter((block) => block.type === "kv")).toHaveLength(7);
    expect(material.blocks[0]!.type === "paragraph" && material.blocks[0]!.text.pt).toContain("35 perguntas");
    const rows = material.blocks.filter((block) => block.type === "kv").flatMap((block) => block.type === "kv" ? block.rows : []);
    const openRow = rows.find((row) => row.value.pt.startsWith("Em aberto:"));
    const answeredRow = rows.find((row) => row.value.pt.includes("Banco Itaú"));
    expect(openRow?.material).toBe(false);
    expect(answeredRow).toMatchObject({material: true, claimKind: "fact"});
    expect(answeredRow?.supportIds?.length).toBeGreaterThan(0);
  });
});
