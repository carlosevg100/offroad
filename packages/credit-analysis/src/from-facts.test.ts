import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, type Fact} from "./from-facts";
import {projectLeverageTrajectory} from "./trajectory";

/** Aurora as the extractor would deliver her: flat facts in ontology field paths. */
const auroraFacts = (): Fact[] => [
  {fieldPath: "historical_financials.2025.revenue", value: "191200000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "16848000"},
  {fieldPath: "historical_financials.2025.cogs", value: "143400000"},
  {fieldPath: "historical_financials.2025.cash", value: "8420000"},
  {fieldPath: "historical_financials.2025.receivables", value: "47310000"},
  {fieldPath: "historical_financials.2025.inventory", value: "39880000"},
  {fieldPath: "historical_financials.2025.payables", value: "33540000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "45320000"},
  {fieldPath: "historical_financials.2023.revenue", value: "142800000"},
  {fieldPath: "interim_financials.2026_07.revenue_7m", value: "121640000"},
  {fieldPath: "interim_financials.2026_07.receivables", value: "51940000"},
  {fieldPath: "debt.instruments.1.lender", value: "Banco Itaú"},
  {fieldPath: "debt.instruments.1.balance", value: "9840000"},
  {fieldPath: "debt.instruments.1.rate", value: "CDI + 4,10% a.a."},
  {fieldPath: "debt.instruments.1.maturity", value: "2027-11-20"},
  {fieldPath: "debt.instruments.1.amortization", value: "Mensal"},
  {fieldPath: "debt.instruments.1.collateral", value: "Duplicatas 130%"},
  {fieldPath: "debt.instruments.1.covenants", value: "Dívida líquida/EBITDA <= 3,0x"},
  {fieldPath: "debt.instruments.2.lender", value: "Banco Bradesco"},
  {fieldPath: "debt.instruments.2.balance", value: "7500000"},
  {fieldPath: "debt.instruments.2.rate", value: "CDI + 3,85% a.a."},
  {fieldPath: "debt.instruments.2.maturity", value: "2028-04-15"},
  {fieldPath: "debt.instruments.2.amortization", value: "Mensal com 6m carência"},
  {fieldPath: "debt.instruments.2.covenants", value: "Dívida líquida/EBITDA <= 3,25x"},
  {fieldPath: "transaction.requested_amount", value: "42300000"},
  {fieldPath: "transaction.desired_term_months", value: "48"},
  {fieldPath: "transaction.desired_grace_months", value: "6"},
  {fieldPath: "transaction.expected_rate", value: "CDI + 4,00% a.a."},
  {fieldPath: "transaction.use_of_proceeds.1.item", value: "Capital de giro (reforço do ciclo)"},
  {fieldPath: "transaction.use_of_proceeds.1.amount", value: "25000000"},
  {fieldPath: "projections.2026.revenue", value: "208500000"},
  {fieldPath: "projections.2026.ebitda", value: "18760000"},
  {fieldPath: "projections.2027.ebitda", value: "22270000"},
];

describe("from flat facts to desk inputs", () => {
  const options = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079"}};

  it("assembles both analyses and they run end to end", () => {
    const inputs = buildDeskInputs(auroraFacts(), options);
    expect(inputs.desk).not.toBeNull();
    expect(inputs.trajectory).not.toBeNull();

    const desk = analyzeCreditPosition(inputs.desk!);
    expect(desk.leverage.preTurns.slice(0, 4)).toBe("2.19");
    expect(desk.findings.some((finding) => finding.id === "covenant-breach-day-one")).toBe(true);

    const trajectory = projectLeverageTrajectory(inputs.trajectory!);
    expect(trajectory.liabilityManagement?.covenantedBalance).toBe("17340000.00");
  });

  it("picks the latest audited year, not the first it sees", () => {
    const inputs = buildDeskInputs(auroraFacts(), options);
    expect(inputs.desk?.audited.year).toBe(2025);
  });

  it("groups indexed paths into lines, in document order", () => {
    const inputs = buildDeskInputs(auroraFacts(), options);
    expect(inputs.desk?.debt.map((line) => line.lender)).toEqual(["Banco Itaú", "Banco Bradesco"]);
    expect(inputs.desk?.debt[0]?.covenant).toContain("3,0x");
  });

  it("reads the working-capital slice out of the use of proceeds by its label", () => {
    const inputs = buildDeskInputs(auroraFacts(), options);
    expect(inputs.desk?.request.workingCapitalAsk).toBe("25000000");
  });

  it("puts the stated request beside the documents when they disagree", () => {
    const inputs = buildDeskInputs(auroraFacts(), {...options, statedRequest: {amount: "40000000"}});
    expect(inputs.desk?.request.amounts).toHaveLength(2);
    // The trajectory sizes against the larger amount: understating the ticket understates the
    // risk the fund will price, and the divergence itself is already a finding.
    expect(inputs.trajectory?.newDebt.amount).toBe("42300000");
  });

  it("reports what it cannot build instead of building it wrong", () => {
    const inputs = buildDeskInputs(
      auroraFacts().filter((fact) => !fact.fieldPath.startsWith("debt.")),
      options,
    );
    expect(inputs.desk?.debt).toHaveLength(0);
    expect(inputs.missing).toContain("debt.instruments");
  });

  it("returns null rather than an analysis with holes", () => {
    const inputs = buildDeskInputs(
      auroraFacts().filter((fact) => !fact.fieldPath.includes("ebitda")),
      options,
    );
    expect(inputs.desk).toBeNull();
    expect(inputs.missing).toContain("historical_financials.{ano}.ebitda");
  });
});
