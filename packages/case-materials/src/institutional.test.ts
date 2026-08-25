import {describe, expect, it} from "vitest";
import type {CaseBrief, ReadinessReport} from "@offroad/case-understanding";
import {analyzeCreditPosition, buildDeskInputs, projectLeverageTrajectory, type Fact} from "@offroad/credit-analysis";
import {rateCredit, stressTable} from "@offroad/credit-analysis";
import {instrumentVerdicts} from "@offroad/credit-playbook";
import {assessCapacity, buildTermSheet, designCollateralPackage} from "@offroad/deal-structure";

import {compileMaterials} from "./compile";
import {creditMemo, termSheetDocument} from "./institutional";

const facts: Fact[] = [
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
  {fieldPath: "debt.instruments.1.amortization", value: "Mensal"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
];

const inputs = buildDeskInputs(facts, {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105"}});
const desk = analyzeCreditPosition(inputs.desk!);
const trajectory = projectLeverageTrajectory(inputs.trajectory!);
const capacity = assessCapacity({archetypeId: "growth_expansion", requested: "42300000", cfads: "16848000", adjustedEbitda: "16848000", existingNetDebt: "36900000", annualDebtServiceFactor: "0.40"});
const termSheet = buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 48, requestedGraceMonths: 6, expectedRate: "CDI + 4,00% a.a.", blockers: []});

const brief: CaseBrief = {
  executiveSummary: "Distribuidora de materiais de construção busca alongar o ciclo de caixa.",
  sections: [
    {id: "identity", heading: "Identidade", claims: [{id: "c1", text: "Sociedade limitada de 2004.", material: false, kind: "fact", supportIds: []}]},
    {id: "business", heading: "Negócio", claims: []},
    {id: "request", heading: "Pedido", claims: []},
  ],
};
const readiness: ReadinessReport = {state: "in_progress", score: 0.8, components: [], blockers: []};
const shared = {brief, facts: [], calculations: [], exceptions: [], desk, trajectory, termSheet, companyName: "Aurora"};

describe("the credit memorandum", () => {
  const memo = creditMemo(shared);
  const text = JSON.stringify(memo.blocks);

  it("opens with the key terms a committee reads first", () => {
    const [first] = memo.blocks;
    expect(first?.type).toBe("callout");
    if (first?.type !== "callout") return;
    const labels = first.items.map((item) => item.label.pt);
    expect(labels).toEqual(expect.arrayContaining(["Tomadora", "Montante indicativo", "Prazo", "Carência", "Alavancagem pré / pós"]));
  });

  it("keeps the company out of the title, which the page already prints as the subtitle", () => {
    expect(memo.title.pt).toBe("Memorando de Crédito");
  });

  it("numbers its sections in the order a credit committee expects", () => {
    const headings = memo.blocks.filter((block) => block.type === "heading").map((block) => (block.type === "heading" ? block.text.pt : ""));
    expect(headings.slice(0, 3)).toEqual(["1. Sumário executivo", "2. A operação", "3. A companhia"]);
    expect(headings.at(-1)).toBe("Base de preparação");
  });

  it("carries the desk numbers rather than the brief's prose", () => {
    expect(text).toContain("Banco Itaú");
    expect(text).toContain("trajetoria.");
  });
});

describe("the term sheet", () => {
  it("is not produced without a structured term sheet", () => {
    const {termSheet: _omit, ...rest} = shared;
    expect(termSheetDocument(rest)).toBeNull();
  });

  it("states it is indicative and sets economic terms as key values", () => {
    const sheet = termSheetDocument(shared)!;
    const callout = sheet.blocks[0];
    expect(callout?.type).toBe("callout");
    const kv = sheet.blocks.find((block) => block.type === "kv" && block.rows.some((row) => row.label.pt === "Montante indicativo"));
    expect(kv).toBeDefined();
    const everything = JSON.stringify(sheet.blocks);
    expect(everything).toContain("Condições precedentes");
    expect(everything).toContain("Eventos de vencimento antecipado");
    expect(everything).not.toContain(String.fromCharCode(8212));
  });
});

describe("compileMaterials", () => {
  it("emits the memorandum and the term sheet ahead of the older materials when the desk ran", () => {
    const outcome = compileMaterials({brief, facts: [], calculations: [], exceptions: [], readiness, desk, trajectory, termSheet});
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.materials.map((material) => material.kind)).toEqual(["credit_memo", "term_sheet", "diligence_qa", "teaser", "credit_profile", "package"]);
  });

  it("emits neither when the desk did not run", () => {
    const outcome = compileMaterials({brief, facts: [], calculations: [], exceptions: [], readiness});
    if (!outcome.ok) throw new Error("expected materials");
    expect(outcome.materials.map((material) => material.kind)).toEqual(["teaser", "credit_profile", "package"]);
  });

  it("keeps every institutional material inside the DCM advisory boundary", () => {
    const outcome = compileMaterials({brief, facts: [], calculations: [], exceptions: [], readiness, desk, trajectory, termSheet});
    if (!outcome.ok) throw new Error("expected materials");
    for (const material of outcome.materials) {
      const serialized = JSON.stringify(material.blocks).toLowerCase();
      expect(serialized).not.toMatch(/offroad (aprova|aprovou|approved|recommends the investment)/);
      expect(serialized).not.toMatch(/(funding|captação) (garantido|garantida|confirmed|guaranteed)/);
      const disclaimer = material.blocks.find((block) => block.type === "disclaimer" && block.text.en.includes("acting as DCM adviser"));
      expect(disclaimer, `${material.kind} must state the advisory boundary`).toBeDefined();
    }
  });
});

describe("the term sheet's covenant definitions", () => {
  it("writes each usual covenant as an indenture does: definition, test, breach", () => {
    const sheet = termSheetDocument(shared)!;
    const definitions = sheet.blocks.find((block) => block.type === "kv" && block.rows.some((row) => row.label.pt === "Dívida líquida / EBITDA" && row.value.pt.includes("Dívida líquida:")));
    expect(definitions).toBeDefined();
    if (definitions?.type !== "kv") return;
    expect(definitions.rows.map((row) => row.label.pt)).toEqual(expect.arrayContaining(["Dívida líquida / EBITDA", "Limitação de nova dívida", "Mudança de controle"]));
    expect(definitions.rows[0]!.note?.pt).toContain("Aferição:");
  });
});
describe("the credit considerations section of the memorandum", () => {
  it("carries the grade, the shocks, the papers and the security, with the rating in the key terms", () => {
    const rating = rateCredit({desk, trajectory, financialExpenses: "6140000", priorEbitda: "14924000", topCustomerShare: "0.181", evidenceRank: "1.8"});
    const stress = stressTable({desk, revenue: "191200000", topCustomerShare: "0.181"});
    const instruments = instrumentVerdicts({legalForm: "ltda", archetypeId: "growth_expansion", amount: "42300000"});
    const collateral = designCollateralPackage({assets: [{description: "Recebíveis", type: "receivables", value: "51940000", encumbered: "24400000"}], amount: "42300000"});
    const memo = creditMemo({...shared, rating, stress, instruments, collateral});
    const headings = memo.blocks.filter((block) => block.type === "heading").map((block) => (block.type === "heading" ? block.text.pt : ""));
    expect(headings).toContain("9. Principais considerações de crédito");
    expect(headings).toEqual(expect.arrayContaining(["Perfil analítico indicativo", "Sensibilidade", "Instrumentos", "Pacote de garantias"]));
    const keyTerms = memo.blocks[0];
    expect(keyTerms?.type === "callout" && keyTerms.items.some((item) => item.label.pt === "Perfil analítico indicativo")).toBe(true);
    expect(JSON.stringify(memo.blocks)).toContain("EBITDA -30%");
  });
});
