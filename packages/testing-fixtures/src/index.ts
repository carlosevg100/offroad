export const supermarketFixture = {
  id: "supermarket-v1",
  synthetic: true,
  company: {
    name: "Rede Horizonte",
    sector: "food_retail",
    geography: "BR",
    reportingCurrency: "BRL",
  },
  opportunity: {
    purpose: "Expansão regional e reforço de capital de giro",
    requestedAmount: "80",
    capacity: {cashFlow: "68", collateral: "54", market: "62"},
    recommendedAmount: "54",
  },
  metrics: {
    revenueLtm: "184.7",
    reportedEbitda: "30.4",
    approvedAdjustments: ["0.8"],
    adjustedEbitda: "31.2",
    netDebt: "56.4",
    cfads: "18.6",
    downsideDebtService: "10.69",
  },
  sources: [
    {id: "dre-2025", label: "DRE gerencial 2025", status: "reconciled"},
    {id: "cash-2025", label: "Fluxo de caixa 2025", status: "reconciled"},
    {id: "debt-jul-2026", label: "Mapa de dívida jul/2026", status: "verified"},
  ],
} as const;

export * from "./document-intake";
export * from "./m0-governance";
export * from "./m0-closeout";

// The Aurora case: one declared truth, from which both the data room and its answer key are
// generated. Exported so the evals package can build the key without testing-fixtures needing
// to depend on the ontology, which would close a cycle with credit-ontology.
export * as fakeco from "./fakeco/truth";
export * as nimbus from "./nimbus/truth";
