import {describe, expect, it} from "vitest";

import {analyzeCreditPosition} from "./analyze";
import {buildDeskInputs, type Fact} from "./from-facts";
import {parseRate} from "./parse";
import {questionsForCompany} from "./questions";
import {projectLeverageTrajectory} from "./trajectory";

/**
 * What Camil taught the desk: a listed company's filings do not look like a middle-market
 * data room, and the battery has to read them without inventing anything.
 */
const camil: Fact[] = [
  {fieldPath: "historical_financials.2025.revenue", value: "11115000000"},
  {fieldPath: "historical_financials.2025.ebitda", value: "915300000"},
  {fieldPath: "historical_financials.2025.cogs", value: "8622700000"},
  {fieldPath: "historical_financials.2025.cash", value: "1997608000"},
  {fieldPath: "historical_financials.2025.receivables", value: "1019433000"},
  {fieldPath: "historical_financials.2025.gross_debt", value: "4988383000"},
  {fieldPath: "interim_financials.2026_05.revenue_3m", value: "2667975000"},
  {fieldPath: "interim_financials.2026_05.cash", value: "1430714000"},
  {fieldPath: "interim_financials.2026_05.receivables", value: "1881602000"},
  {fieldPath: "interim_financials.2026_05.gross_debt", value: "5670186000"},
  {fieldPath: "debt.instruments.1.lender", value: "Bancos (capital de giro)"},
  {fieldPath: "debt.instruments.1.balance", value: "2417000000"},
  {fieldPath: "debt.instruments.2.lender", value: "14ª emissão, 1ª série"},
  {fieldPath: "debt.instruments.2.balance", value: "438918000"},
  {fieldPath: "debt.instruments.2.rate", value: "104% do DI"},
  {fieldPath: "debt.instruments.2.maturity", value: "2029-06-15"},
  {fieldPath: "debt.instruments.3.lender", value: "15ª emissão, 2ª série"},
  {fieldPath: "debt.instruments.3.balance", value: "408703000"},
  {fieldPath: "debt.instruments.3.rate", value: "14,15% a.a. pré"},
  {fieldPath: "debt.instruments.3.maturity", value: "2032-11-12"},
  {fieldPath: "debt.instruments.4.lender", value: "13ª emissão, 2ª série"},
  {fieldPath: "debt.instruments.4.balance", value: "282357000"},
  {fieldPath: "debt.instruments.4.rate", value: "IPCA + 6,3416% a.a."},
  {fieldPath: "debt.instruments.4.maturity", value: "2030-11-14"},
  {fieldPath: "debt.covenants.1.metric", value: "Dívida líquida / EBITDA"},
  {fieldPath: "debt.covenants.1.threshold", value: "4.0"},
  {fieldPath: "transaction.requested_amount", value: "1500000000"},
  {fieldPath: "transaction.desired_term_months", value: "84"},
  {fieldPath: "transaction.desired_grace_months", value: "24"},
  {fieldPath: "transaction.refinancing", value: "1229828000"},
];

const options = {referenceDate: "2026-08-21", indexLevels: {cdi: "0.105", tlp: "0.079", ipca: "0.045"}};

describe("rates the way an indenture writes them", () => {
  it("reads a percentage of DI as a percentage of CDI", () => {
    expect(parseRate("104% do DI")).toEqual({kind: "percent_of_index", index: "CDI", factor: "1.040000"});
    expect(parseRate("105% da taxa DI")).toEqual({kind: "percent_of_index", index: "CDI", factor: "1.050000"});
  });

  it("reads a fixed rate whether 'pré' comes before or after", () => {
    expect(parseRate("14,15% a.a. pré")).toEqual({kind: "fixed_annual", annual: "0.141500"});
    expect(parseRate("pré-fixada 14,15% a.a.")).toEqual({kind: "fixed_annual", annual: "0.141500"});
  });
});

describe("the desk on a listed company", () => {
  const inputs = buildDeskInputs(camil, options);
  const desk = analyzeCreditPosition(inputs.desk!);
  const trajectory = projectLeverageTrajectory(inputs.trajectory!);

  it("anchors the stack on the latest balance sheet, not the fiscal year-end", () => {
    expect(inputs.desk!.balance.periodEnd).toBe("2026-05-28");
    expect(inputs.desk!.balance.grossDebt).toBe("5670186000");
    // The schedule (3,55bn) against the May balance (5,67bn): the gap is real and is reported,
    // but it is not the 750M phantom that the February balance would have produced.
    expect(desk.findings.find((finding) => finding.id === "stack-vs-balance")).toBeDefined();
  });

  it("prices every series once the index levels are stated", () => {
    expect(desk.stack.unpriceableLines).toBe(0);
    expect(desk.findings.some((finding) => finding.id === "unparsed-rates")).toBe(false);
  });

  it("binds a company-level covenant to the stack without inventing a lender", () => {
    expect(desk.leverage.tightestCovenant?.lender).toBe("escrituras e contratos da companhia");
    expect(Number(desk.leverage.tightestCovenant?.maximum)).toBe(4);
    const breach = desk.findings.find((finding) => finding.id === "covenant-breach-day-one")!;
    expect(breach.pt).toContain("já está acima do covenant");
    expect(breach.pt).not.toContain("do contrato escrituras");
  });

  it("nets the refinancing off the stack instead of stacking the ticket on top", () => {
    expect(trajectory.assumptions.refinancing).toBe("1229828000.00");
    expect(trajectory.liabilityManagement?.netNewMoney).toBe("270172000.00");
    expect(trajectory.liabilityManagement?.lendersTakenOut).toEqual([]);
    expect(trajectory.findings.some((finding) => finding.id === "refinancing-inside-ticket")).toBe(true);
  });

  it("runs the trajectory on EBITDA held flat when the company sent no projection, and still asks for one", () => {
    expect(trajectory.assumptions.ebitdaHeldFlat).toBe(true);
    expect(trajectory.years.every((year) => year.ebitdaBase === "915300000.00")).toBe(true);
    expect(trajectory.findings.find((finding) => finding.id === "leverage-trajectory")!.pt).toContain("sem projeção da companhia");
    expect(inputs.missing).toContain("projections.{ano}.ebitda");
  });

  it("asks the already-above-covenant question, not the day-one one", () => {
    const questions = questionsForCompany(desk, trajectory, inputs.missing);
    const covenant = questions.find((question) => question.findingId === "covenant-breach-day-one")!;
    expect(covenant.pt).toContain("já está acima do covenant");
    expect(covenant.pt).not.toContain("R$ -");
  });
});
