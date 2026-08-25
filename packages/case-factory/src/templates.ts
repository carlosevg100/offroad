import type {FactoryScenario} from "./schema";

export const corporateGrowthScenario: FactoryScenario = {
  schemaVersion: "2026.08.24-v1",
  id: "corporate-growth-clean",
  seed: 4201,
  locale: "pt",
  archetypeId: "growth_expansion",
  referenceDate: "2026-08-24",
  company: {legalName: "Companhia Serra Azul S.A.", legalForm: "sa", sector: "Varejo", state: "SP", currency: "BRL"},
  historical: [
    {periodEnd: "2023-12-31", revenue: "150000000", ebitda: "21000000", netIncome: "5300000", cash: "8000000", grossDebt: "38000000", receivables: "31000000", inventory: "22000000", payables: "19000000"},
    {periodEnd: "2024-12-31", revenue: "174000000", ebitda: "25500000", netIncome: "6900000", cash: "9500000", grossDebt: "42000000", receivables: "34000000", inventory: "24000000", payables: "20500000"},
    {periodEnd: "2025-12-31", revenue: "201000000", ebitda: "31000000", netIncome: "8400000", cash: "11000000", grossDebt: "45000000", receivables: "38000000", inventory: "27000000", payables: "22000000"},
  ],
  debt: [
    {lender: "Banco A", instrument: "CCB", outstanding: "28000000", maturity: "2029-06-30", collateral: "Recebíveis"},
    {lender: "Banco B", instrument: "Capital de giro", outstanding: "17000000", maturity: "2028-03-31", collateral: "Aval"},
  ],
  request: {
    amount: "40000000", purpose: "expansão de capacidade e novas unidades", termMonths: 60, graceMonths: 12, projectCost: "40000000",
    useOfProceeds: [{item: "Obras", amount: "25000000"}, {item: "Equipamentos", amount: "15000000"}],
  },
  collateral: {receivables: "36000000", inventory: "12000000", equipment: "9000000", realEstate: "0"},
  mandates: [
    {id: "fund-aligned", name: "Fundo Alinhado", minTicket: "20000000", maxTicket: "70000000", minTermMonths: 36, maxTermMonths: 72, sectors: ["Varejo"], instruments: ["debenture", "ccb"], collateral: ["recebiveis", "equipamento"], leverageCeiling: "3.5"},
    {id: "fund-misaligned", name: "Fundo Agro", minTicket: "10000000", maxTicket: "50000000", minTermMonths: 24, maxTermMonths: 60, sectors: ["Agronegócio"], instruments: ["cra"], collateral: ["recebiveis"]},
  ],
  perturbations: [],
};

export const dirtyWorkingCapitalScenario: FactoryScenario = {
  ...corporateGrowthScenario,
  id: "working-capital-dirty-room",
  seed: 7751,
  archetypeId: "working_capital",
  company: {...corporateGrowthScenario.company, legalName: "Distribuidora Vale Norte Ltda.", legalForm: "ltda"},
  request: {...corporateGrowthScenario.request, amount: "32000000", purpose: "alongamento do ciclo de capital de giro", projectCost: "32000000", useOfProceeds: [{item: "Capital de giro", amount: "32000000"}]},
  perturbations: [
    {kind: "format", document: "audited-financials.csv", mode: "semicolon_csv"},
    {kind: "format", document: "capital-request.md", mode: "scanned_image"},
    {kind: "conflict", fieldPath: "transaction.requested_amount", alternateValue: "28000000", sourceDocument: "management-deck.pdf", informationClass: "management", evidenceRank: 5},
    {kind: "evidence", fieldPath: "collateral.total_capacity", mode: "missing_anchor"},
    {kind: "security", document: "business-plan.csv", mode: "prompt_injection"},
    {kind: "security", document: "debt-schedule.csv", mode: "formula_injection"},
  ],
};

/**
 * Same economics as the clean growth case, with the three failures the procedure library must
 * surface rather than smooth over: a contradictory debt total, an unverified collateral anchor
 * and an instruction embedded in an untrusted company document.
 */
export const corporateGrowthAdversarialScenario: FactoryScenario = {
  ...corporateGrowthScenario,
  id: "corporate-growth-adversarial-room",
  seed: 4202,
  perturbations: [
    {
      kind: "conflict",
      fieldPath: "debt.total_gross",
      alternateValue: "38000000",
      sourceDocument: "management-deck.pdf",
      informationClass: "management",
      evidenceRank: 5,
      periodEnd: "2025-12-31",
    },
    {kind: "evidence", fieldPath: "collateral.total_capacity", mode: "missing_anchor"},
    {kind: "security", document: "capital-request.md", mode: "prompt_injection"},
  ],
};

/** Legal-form negative control for instrument screening inside the same economic archetype. */
export const corporateGrowthEligibilityNegativeScenario: FactoryScenario = {
  ...corporateGrowthScenario,
  id: "corporate-growth-ltda-instrument-negative",
  seed: 4203,
  company: {...corporateGrowthScenario.company, legalName: "Companhia Serra Azul Ltda.", legalForm: "ltda"},
};

export const receivablesScenario: FactoryScenario = {
  ...corporateGrowthScenario,
  id: "receivables-loan-tape",
  seed: 9917,
  archetypeId: "working_capital",
  company: {...corporateGrowthScenario.company, legalName: "Serviços Horizonte S.A.", sector: "Serviços"},
  request: {...corporateGrowthScenario.request, amount: "25000000", purpose: "antecipação estruturada de recebíveis", projectCost: "25000000", useOfProceeds: [{item: "Capital de giro", amount: "25000000"}]},
  loanTape: {receivables: 250, totalBalance: "48000000", overdueBalanceShare: 0.07, topDebtorBalanceShare: 0.12},
  mandates: [{id: "fidc-receivables", name: "FIDC Recebíveis", minTicket: "15000000", maxTicket: "60000000", minTermMonths: 12, maxTermMonths: 48, sectors: ["Serviços"], instruments: ["receivables_purchase", "ccb"], collateral: ["recebiveis"], leverageCeiling: "4.0"}],
  perturbations: [{kind: "format", document: "receivables-aging.csv", mode: "shuffled_rows"}],
};
