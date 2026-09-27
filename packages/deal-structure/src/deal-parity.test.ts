import {createHash} from "node:crypto";

import {instrumentVerdicts, type ArchetypeId} from "@offroad/credit-playbook";
import type {DebtTruthSet, FinancialTruthSet, ReconciledFact} from "@offroad/reconciliation";
import {describe, expect, it} from "vitest";

import {
  compileStructureAlternatives, fingerprintStructureAlternative, fingerprintStructureVerificationContext, type StructureAlternativeDraft,
} from "./alternatives";
import {assessCapacity, type CapacityAssessment, type CapacityInput} from "./capacity";
import {designCollateralPackage, type CollateralAsset} from "./collateral";
import {playbookBand} from "./market";
import {buildOperationTruthSet, type OperationTruthSet} from "./operation";
import {buildStructureTruthSet, type StructurePolicies} from "./structure";
import {buildTermSheet} from "./termsheet";

/**
 * Byte-identity of the deal structure across the move of its arithmetic into
 * `@offroad/financial-core` (stage 19, third polish, part 2B). The fingerprints were captured from
 * `capacity.ts`, `collateral.ts`, `termsheet.ts`, `structure.ts`, `operation.ts` and
 * `alternatives.ts` as part 2A left them, before any of their arithmetic moved:
 *
 * - the capacity of every archetype under the three walls with and without each input, an EBITDA of
 *   zero and below, net debt above the ceiling, amounts at half a cent and the venture fractions of
 *   ARR and of the last round;
 * - the security package over one asset of every class, the room's haircut over the policy's,
 *   encumbrances above the value, ties of rank and value, amounts of zero and at half a cent, and
 *   three coverages;
 * - the term sheet of every archetype over capacities constrained and not, and every optional input;
 * - the structure truth over the gold fixture of its tests and variants that reach every sizing,
 *   repayment, coverage, maturity, collateral and final-sizing branch;
 * - the operation truth over the fixtures of its tests and variants that reach every sum, difference
 *   and scenario test;
 * - the structure alternatives over verified and unverified drafts, tolerances, oversized and invalid
 *   amounts and fractional sources and uses.
 *
 * A pin moves only with a deliberate change.
 */
const digest = (items: Iterable<unknown>) => {
  const hash = createHash("sha256");
  let count = 0;
  for (const item of items) {
    hash.update(JSON.stringify(item, null, 1));
    count += 1;
  }
  return {count, sha256: hash.digest("hex")};
};

const archetypeIds: ArchetypeId[] = ["working_capital", "growth_expansion", "acquisition", "refinance", "equipment_finance", "venture_debt", "other"];

// ---- capacity -------------------------------------------------------------------------------
const full = {requested: "38000000", cfads: "20000000", adjustedEbitda: "33000000", existingNetDebt: "58700000", annualDebtServiceFactor: "0.28", collateralCapacity: "28000000"};
const without = (key: keyof typeof full): Omit<CapacityInput, "archetypeId"> => {
  const copy: Partial<typeof full> = {...full};
  delete copy[key];
  return copy as Omit<CapacityInput, "archetypeId">;
};
const capacityVariants: Array<[string, Omit<CapacityInput, "archetypeId">]> = [
  ["full", full],
  ["no-collateral", without("collateralCapacity")],
  ["no-cfads", without("cfads")],
  ["no-factor", without("annualDebtServiceFactor")],
  ["no-net-debt", without("existingNetDebt")],
  ["net-debt-zero", {...full, existingNetDebt: "0"}],
  ["above-ceiling", {...full, existingNetDebt: "500000000"}],
  ["ebitda-zero", {...full, adjustedEbitda: "0"}],
  ["ebitda-negative", {...full, adjustedEbitda: "-5000000"}],
  ["no-ebitda", without("adjustedEbitda")],
  ["fractional", {...full, adjustedEbitda: "33000000.555", existingNetDebt: "58700000.333", cfads: "20000000.125"}],
  ["half-cent", {...full, adjustedEbitda: "0.003", existingNetDebt: "0", collateralCapacity: "999999999"}],
  ["lowest-tie", {...full, collateralCapacity: "36800000", existingNetDebt: "78700000"}],
  ["venture-arr", {requested: "5000000", arr: "12000000", collateralCapacity: "4000000"}],
  ["venture-round", {requested: "5000000", lastEquityRound: "40000000"}],
  ["venture-round-binds", {requested: "5000000", arr: "12000000", lastEquityRound: "8000000"}],
  ["venture-arr-binds", {requested: "5000000", arr: "5000000", lastEquityRound: "40000000"}],
  ["venture-half-cent", {requested: "100", arr: "100.05"}],
  ["venture-not-positive", {requested: "100", arr: "0", lastEquityRound: "-1"}],
  ["nothing", {requested: "100"}],
];
function* capacities() {
  for (const archetypeId of archetypeIds) {
    for (const [label, input] of capacityVariants) yield {archetypeId, label, capacity: assessCapacity({archetypeId, ...input})};
  }
}

// ---- collateral -----------------------------------------------------------------------------
const assetSets: Record<string, CollateralAsset[]> = {
  aurora: [{description: "Recebíveis", type: "receivables", value: "51940000", encumbered: "24400000"}],
  mixed: [
    {description: "Recebíveis de clientes", type: "receivables", value: "51940000", encumbered: "24400000"},
    {description: "Estoques", type: "inventory", value: "42180000"},
    {description: "CD de São José dos Campos", type: "property", value: "28000000", appraised: true},
    {description: "Frota (11 veículos)", type: "vehicles", value: "3200000", encumbered: "1820000"},
    {description: "Aval dos sócios", type: "guarantee", value: "0"},
  ],
  everyClass: [
    {description: "Aplicações", type: "financial", value: "5000000"},
    {description: "Duplicatas", type: "receivables", value: "12000000"},
    {description: "Galpão", type: "property", value: "20000000"},
    {description: "Caminhões", type: "vehicles", value: "3000000"},
    {description: "Linha de produção", type: "equipment", value: "8000000"},
    {description: "Estoque", type: "inventory", value: "6000000"},
    {description: "Quotas da operadora", type: "shares", value: "15000000"},
    {description: "Fiança dos sócios", type: "guarantee", value: "10000000"},
    {description: "Direito creditório diverso", type: "other", value: "1000000"},
  ],
  room: [
    {description: "Recebíveis", type: "receivables", value: "10000000", haircut: "0.2"},
    {description: "Imóvel com laudo", type: "property", value: "30000000", appraised: true, haircut: "0.25"},
  ],
  encumberedAbove: [{description: "Imóvel alienado", type: "property", value: "10000000", encumbered: "12000000"}, {description: "Máquinas", type: "equipment", value: "4000000"}],
  ties: [
    {description: "Carteira A", type: "receivables", value: "10000000"},
    {description: "Carteira B", type: "receivables", value: "10000000"},
    {description: "Estoque A", type: "inventory", value: "2000000"},
    {description: "Estoque B", type: "inventory", value: "2000000"},
  ],
  fractional: [{description: "Recebíveis", type: "receivables", value: "1234567.891", encumbered: "0.005", haircut: "0.3333"}, {description: "Aplicação", type: "financial", value: "0.105"}],
  guaranteeOnly: [{description: "Aval", type: "guarantee", value: "0"}],
};
function* packages() {
  for (const [label, assets] of Object.entries(assetSets)) {
    for (const amount of ["0", "1000000", "25000000", "42300000", "60000000", "12345.675"]) {
      for (const coverage of [undefined, "1.5", "0"]) {
        yield {label, amount, coverage: coverage ?? null, pkg: designCollateralPackage({assets, amount, ...(coverage === undefined ? {} : {coverage})})};
      }
    }
  }
}

// ---- term sheet -----------------------------------------------------------------------------
function* termSheets() {
  for (const archetypeId of archetypeIds) {
    const capacitiesOf = ["full", "no-net-debt", "no-collateral", "venture-round-binds", "lowest-tie"].map((label) => assessCapacity({archetypeId, ...capacityVariants.find(([name]) => name === label)![1]}));
    const unconstrained: CapacityAssessment = {...capacitiesOf[0]!, requested: "1000000"};
    for (const capacity of [...capacitiesOf, unconstrained]) {
      const options = [
        {},
        {requestedTermMonths: 12, requestedGraceMonths: 0},
        {requestedTermMonths: 60, requestedGraceMonths: 6, expectedRate: "CDI + 4,00% a.a."},
        {requestedTermMonths: 200, requestedGraceMonths: 48, currency: "US$", blockers: ["missing_audit"]},
        {market: {...playbookBand(archetypeId), provenance: "observed" as const, sample: {count: 14, windowMonths: 12, asOf: "2026-08-01"}}},
      ];
      for (const option of options) yield {archetypeId, sheet: buildTermSheet({archetypeId, capacity, ...option})};
    }
  }
}

// ---- structure truth ------------------------------------------------------------------------
const f = (fieldPath: string, value: string, valueType: ReconciledFact["valueType"] = "number"): ReconciledFact => ({
  key: {fieldPath}, value, valueType,
  accepted: {fieldPath, normalizedValue: value, valueType, sourceDocument: "gold.xlsx", evidenceRank: 2, informationClass: "company_document", confidence: 1, anchorVerified: true, anchor: {sheet: "Inputs", cell: "A1"}},
  conflicts: [], disputed: false,
});
const structureCapacity: CapacityAssessment = {
  requested: "100000000", recommended: "100000000", bindingConstraint: "cash_flow",
  walls: [
    {id: "cash_flow", labels: {pt: "Caixa", en: "Cash"}, amount: "120000000", explanation: {pt: "Calculado", en: "Calculated"}, inputs: ["cfads"]},
    {id: "collateral", labels: {pt: "Garantias", en: "Collateral"}, amount: "160000000", explanation: {pt: "Calculado", en: "Calculated"}, inputs: ["collateral"]},
    {id: "market", labels: {pt: "Mercado", en: "Market"}, amount: "140000000", explanation: {pt: "Calculado", en: "Calculated"}, inputs: ["ebitda"]},
  ],
  calculations: [], gaps: [],
};
const structurePolicies: StructurePolicies = {
  version: "2026.08.25-gold", annualSizingRate: "0.18", rateConvention: "effective_annual", amortizationFormat: "sac", graceInterest: "paid",
  minimumDscr: "1.20", minimumCovenantHeadroom: "0.10", maturityConcentrationLimit: "0.60", constructionDelayMonths: 3, reserveMonths: "3",
  collateralPolicyVersion: "2026.08.25-gold", minimumCollateralCoverage: "1.30", matchedTicketMin: "20000000", matchedTicketMax: "200000000",
};
const structureFinancialTruth = {statements: [{period: "2025", adjustedEbitda: "50000000"}]} as unknown as FinancialTruthSet;
const structureDebtTruth = {
  views: {grossFinancialDebt: "70000000", unrestrictedCash: "10000000"},
  maturity: {"2027-01-01": "30000000", "2027-12-01": "10000000", "2028-06-01": "30000000", "2025-06-01": "5000000"},
  covenants: [],
} as unknown as DebtTruthSet;
const structureOperation = (overrides: {status?: "pass" | "fail"; calculated?: string; leverage?: string} = {}): OperationTruthSet => ({
  request: {amount: "100000000", purpose: "growth_expansion", termMonths: 60, evidence: []},
  calculatedNeed: {value: overrides.calculated ?? "100000000", trace: [], divergence: "0", status: "completed"},
  sourcesAndUses: {lines: [], totalSources: "100000000", totalUses: overrides.status === "fail" ? "120000000" : "100000000", difference: overrides.status === "fail" ? "-20000000" : "0", status: overrides.status ?? "pass"},
  proForma: {grossDebt: "170000000", unrestrictedCash: "10000000", netDebt: "160000000", leverage: overrides.leverage ?? "3.2", dayOneCovenantConflict: false},
  bridgeAndTakeout: {bridgeAmount: null, takeout: null, failureRisk: null, planB: null, status: "not_applicable"},
} as unknown as OperationTruthSet);
const structureCollateral = designCollateralPackage({
  amount: "100000000", coverage: "1.30",
  assets: [{description: "Centro de distribuição", type: "property", value: "300000000", appraised: true, encumbered: "0", haircut: "0.20"}],
});
const structureInstruments = instrumentVerdicts({legalForm: "ltda", archetypeId: "growth_expansion", amount: "100000000"});

function structureFacts(options: {format?: string; incompleteDownside?: boolean; negativePledge?: boolean; extra?: ReconciledFact[]; replace?: Record<string, string>} = {}) {
  const facts: ReconciledFact[] = [
    f("transaction.requested_amount", "100000000"),
    f("structure.term_months", "60"),
    f("structure.grace_months", "6"),
    f("structure.amortization_format", options.format ?? "sac", "text"),
    f("structure.sizing_annual_rate", "0.18"),
    f("structure.rate_convention", "effective_annual", "text"),
    f("structure.grace_interest", "paid", "text"),
    f("structure.day_one.negative_pledge_compliant", String(options.negativePledge ?? true), "boolean"),
    f("structure.day_one.corporate_authority_complete", "true", "boolean"),
    f("structure.mandate.ticket_min", "20000000"),
    f("structure.mandate.ticket_max", "200000000"),
    f("structure.issuer.entity", "Operating Company Ltda", "text"),
    f("structure.issuer.justification", "The operating company owns the cash flow and the assets.", "text"),
  ];
  for (const [scenarioIndex, scenario, cfads] of [["1", "base", "6000000"], ["2", "downside", "4500000"]] as const) {
    facts.push(f(`structure.cfads_scenarios.${scenarioIndex}.name`, scenario, "text"));
    const periods = options.incompleteDownside && scenario === "downside" ? 59 : 60;
    for (let period = 1; period <= periods; period += 1) {
      facts.push(f(`structure.cfads_scenarios.${scenarioIndex}.periods.${period}.period`, String(period)));
      facts.push(f(`structure.cfads_scenarios.${scenarioIndex}.periods.${period}.cfads`, cfads));
    }
  }
  const replaced = facts.map((fact) => (options.replace && fact.key.fieldPath in options.replace ? f(fact.key.fieldPath, options.replace[fact.key.fieldPath]!, fact.valueType) : fact));
  return [...replaced, ...(options.extra ?? [])];
}

function* structures() {
  const run = (label: string, overrides: Partial<Parameters<typeof buildStructureTruthSet>[0]> = {}, withoutPolicies = false) => {
    const capacity = overrides.capacity === undefined ? structureCapacity : overrides.capacity;
    const termSheet = capacity ? buildTermSheet({archetypeId: "growth_expansion", capacity, requestedTermMonths: 60, requestedGraceMonths: 6}) : null;
    const input: Parameters<typeof buildStructureTruthSet>[0] = {
      archetypeId: "growth_expansion", facts: structureFacts(), financialTruth: structureFinancialTruth, debtTruth: structureDebtTruth,
      operationTruth: structureOperation(), capacity, termSheet, collateral: structureCollateral, instruments: structureInstruments,
      referenceDate: "2026-08-25", policies: structurePolicies, ...overrides,
    };
    if (withoutPolicies) delete input.policies;
    return {label, truth: buildStructureTruthSet(input)};
  };
  yield run("base");
  const adverse = {...structureCapacity, recommended: "50000000", walls: structureCapacity.walls.map((wall) => (wall.id === "cash_flow" ? {...wall, amount: "50000000"} : wall))};
  yield run("adverse", {
    facts: structureFacts({format: "bullet", incompleteDownside: true, negativePledge: false}), operationTruth: structureOperation({status: "fail"}),
    capacity: adverse, policies: {...structurePolicies, amortizationFormat: "bullet"},
  });
  yield run("no-policies", {}, true);
  yield run("no-capacity", {capacity: null});
  yield run("balloon", {facts: structureFacts({format: "balloon", extra: [f("structure.balloon_percent", "0.3")]})});
  yield run("balloon-invalid", {facts: structureFacts({format: "balloon", extra: [f("structure.balloon_percent", "1.2")]})});
  yield run("price", {facts: structureFacts({format: "price"})});
  yield run("capitalized-grace", {facts: structureFacts({replace: {"structure.grace_interest": "capitalized"}})});
  yield run("ticket-clamped", {facts: structureFacts({replace: {"structure.mandate.ticket_max": "80000000"}})});
  yield run("ticket-below-min", {facts: structureFacts({replace: {"structure.mandate.ticket_min": "150000000"}})});
  yield run("need-differs", {operationTruth: structureOperation({calculated: "90000000"})});
  yield run("envelope-caps", {capacity: {...structureCapacity, walls: structureCapacity.walls.map((wall) => (wall.id === "collateral" ? {...wall, amount: "70000000.50"} : wall))}});
  yield run("equal-walls", {capacity: {...structureCapacity, walls: structureCapacity.walls.map((wall) => ({...wall, amount: "120000000.00"}))}});
  yield run("maturity-wall", {policies: {...structurePolicies, maturityConcentrationLimit: "0.10"}});
  yield run("collateral-short", {policies: {...structurePolicies, minimumCollateralCoverage: "5"}});
  yield run("leverage-above", {operationTruth: structureOperation({leverage: "4.5"})});
  yield run("downside-breach", {policies: {...structurePolicies, minimumDscr: "5"}});
  yield run("headroom-short", {policies: {...structurePolicies, minimumCovenantHeadroom: "0.9"}});
  yield run("negative-rate", {facts: structureFacts({replace: {"structure.sizing_annual_rate": "-0.01"}})});
  yield run("grace-too-long", {facts: structureFacts({replace: {"structure.grace_months": "60"}})});
  yield run("covenant-limit", {facts: structureFacts({extra: [
    f("structure.capacity.covenant_limit", "90000000"),
    f("structure.covenants.1.name", "Alavancagem", "text"), f("structure.covenants.1.limit", "3.5"),
    f("structure.covenants.2.name", "DSCR", "text"), f("structure.covenants.2.limit", "1.2"),
    f("structure.guarantors.1.entity", "Holding", "text"), f("structure.guarantors.1.limit", "50000000"), f("structure.guarantors.1.authority_confirmed", "true", "boolean"),
    f("project.ramp_up_months", "12"),
  ]})});
  yield run("terms-from-sheet", {facts: structureFacts().filter((fact) => fact.key.fieldPath !== "structure.term_months" && fact.key.fieldPath !== "structure.grace_months")});
}

// ---- operation truth ------------------------------------------------------------------------
const operationFinancialTruth = {statements: [{period: "2025", adjustedEbitda: "35"}]} as unknown as FinancialTruthSet;
const operationDebtTruth = {
  status: "partial", instruments: [{id: "loan", principal: "60", principalBasis: "reported_principal"}], exceptions: [], missingInputs: [],
  views: {balanceBasis: "reported_instruments", grossFinancialDebt: "60", unrestrictedCash: "10", cashBasis: "reported"}, covenants: [], liquidityCoverage: [{period: "downside", coverage: "1.35", deficit: "0"}],
} as unknown as DebtTruthSet;
const operationPolicies = {version: "2026.08.25-v1", sizingMateriality: "5", residualTolerance: "0", authorizedBuffer: "10", annualDebtCost: "0.16", annualCashYield: "0.10", minimumDscr: "1.2", generalPurposeCap: "5"};
const cleanOperationFacts = () => [
  f("transaction.requested_amount", "100"), f("transaction.purpose", "expansion", "text"), f("transaction.desired_term_months", "60"),
  f("project.total_cost", "100"), f("transaction.incremental_working_capital", "20"), f("transaction.transaction_costs", "3"), f("transaction.execution_buffer", "7"), f("project.company_cash", "30"),
  f("transaction.sources_and_uses.1.side", "source", "text"), f("transaction.sources_and_uses.1.item", "New debt", "text"), f("transaction.sources_and_uses.1.amount", "100"),
  f("transaction.sources_and_uses.2.side", "source", "text"), f("transaction.sources_and_uses.2.item", "Company cash", "text"), f("transaction.sources_and_uses.2.amount", "30"),
  f("transaction.sources_and_uses.3.side", "use", "text"), f("transaction.sources_and_uses.3.item", "Capex", "text"), f("transaction.sources_and_uses.3.amount", "100"),
  f("transaction.sources_and_uses.4.side", "use", "text"), f("transaction.sources_and_uses.4.item", "Capital de giro", "text"), f("transaction.sources_and_uses.4.amount", "20"),
  f("transaction.sources_and_uses.5.side", "use", "text"), f("transaction.sources_and_uses.5.item", "Custos", "text"), f("transaction.sources_and_uses.5.amount", "3"),
  f("transaction.sources_and_uses.6.side", "use", "text"), f("transaction.sources_and_uses.6.item", "Buffer", "text"), f("transaction.sources_and_uses.6.amount", "7"),
  f("transaction.declared_version", "v1", "text"), f("transaction.declared_version_confirmed_at", "2026-08-25", "date"),
  f("transaction.capacity_scenarios.1.name", "downside", "text"), f("transaction.capacity_scenarios.1.dscr", "1.35"), f("transaction.capacity_scenarios.1.liquidity_deficit", "0"),
];
const replaceFact = (facts: ReconciledFact[], path: string, value: string) => facts.map((fact) => (fact.key.fieldPath === path ? f(path, value, fact.valueType) : fact));
const dropFacts = (facts: ReconciledFact[], ...paths: string[]) => facts.filter((fact) => !paths.includes(fact.key.fieldPath));

function* operations() {
  const run = (label: string, facts: ReconciledFact[], overrides: Partial<Parameters<typeof buildOperationTruthSet>[0]> = {}) => ({label, truth: buildOperationTruthSet({
    facts, financialTruth: operationFinancialTruth, debtTruth: operationDebtTruth, capacity: null, referenceDate: "2026-08-25", policies: operationPolicies, ...overrides,
  })});
  yield run("clean", cleanOperationFacts(), {requestedAmount: "100", requestedTermMonths: 60});
  yield run("clean-from-facts", cleanOperationFacts());
  yield run("divergent", replaceFact(cleanOperationFacts(), "transaction.requested_amount", "150"));
  yield run("divergent-within", replaceFact(cleanOperationFacts(), "transaction.requested_amount", "104.5"));
  yield run("fractional", replaceFact(replaceFact(cleanOperationFacts(), "transaction.sources_and_uses.1.amount", "100.005"), "transaction.sources_and_uses.3.amount", "99.995"));
  yield run("need-from-uses", dropFacts(cleanOperationFacts(), "project.total_cost", "transaction.incremental_working_capital", "transaction.transaction_costs"));
  yield run("self-funding", [...cleanOperationFacts(), f("project.shareholder_equity", "12.5"), f("transaction.self_funding", "0.25")]);
  yield run("scenario-fail", [...replaceFact(cleanOperationFacts(), "transaction.capacity_scenarios.1.dscr", "1.1"),
    f("transaction.capacity_scenarios.2.name", "stress", "text"), f("transaction.capacity_scenarios.2.dscr", "1.5"), f("transaction.capacity_scenarios.2.liquidity_deficit", "5"),
    f("transaction.capacity_scenarios.3.name", "base", "text"), f("transaction.capacity_scenarios.3.liquidity_deficit", "0")]);
  const {minimumDscr: _minimumDscr, ...withoutDscr} = operationPolicies;
  yield run("no-dscr-policy", cleanOperationFacts(), {policies: withoutDscr});
  yield run("mismatch", [
    f("transaction.requested_amount", "100"), f("project.total_cost", "100"), f("transaction.incremental_working_capital", "1"), f("transaction.transaction_costs", "1"), f("transaction.execution_buffer", "1"),
    f("transaction.sources_and_uses.1.side", "source", "text"), f("transaction.sources_and_uses.1.item", "Debt", "text"), f("transaction.sources_and_uses.1.amount", "100"),
    f("transaction.sources_and_uses.2.side", "use", "text"), f("transaction.sources_and_uses.2.item", "Capex", "text"), f("transaction.sources_and_uses.2.amount", "120"),
    f("transaction.bridge.amount", "100"),
    f("transaction.disbursement_schedule.1.period", "M1", "text"), f("transaction.disbursement_schedule.1.sources", "10"), f("transaction.disbursement_schedule.1.uses", "20"),
  ]);
  yield run("one-side", [
    f("transaction.requested_amount", "100"), f("transaction.sources_and_uses.1.side", "source", "text"), f("transaction.sources_and_uses.1.item", "Debt", "text"), f("transaction.sources_and_uses.1.amount", "100"),
  ]);
  yield run("extras", [...cleanOperationFacts(),
    f("transaction.tranches.1.amount", "60"), f("transaction.tranches.1.milestone", "Licença", "text"), f("transaction.tranches.1.evidence", "Alvará", "text"), f("transaction.tranches.1.attestor", "Engenheiro", "text"), f("transaction.tranches.1.release_days", "30"),
    f("transaction.tranches.2.amount", "40"), f("transaction.tranches.2.release_days", "12.5"),
    f("transaction.bridge.amount", "50"), f("transaction.bridge.takeout", "Debênture", "text"), f("transaction.bridge.plan_b", "Aporte", "text"),
    f("transaction.wait.cost", "2.5"), f("transaction.wait.estimated_gain", "4"), f("transaction.wait.decision", "proceed", "text"),
    f("transaction.use_blocks.1.category", "productive", "text"), f("transaction.use_blocks.1.amount", "80"), f("transaction.use_blocks.1.description", "Linha nova", "text"),
    f("transaction.use_blocks.2.category", "remediation", "text"), f("transaction.use_blocks.2.amount", "20"), f("transaction.use_blocks.2.description", "Reforço", "text"),
    f("transaction.refinanced_debt", "10"), f("transaction.fees_paid_from_cash", "1.5"),
  ]);
  yield run("no-requested", dropFacts(cleanOperationFacts(), "transaction.requested_amount"));
}

// ---- structure alternatives -----------------------------------------------------------------
const alternativeOperation = {version: "operation-v1", status: "complete", sourcesAndUses: {status: "pass", totalSources: "100000000", totalUses: "100000000"}} as OperationTruthSet;
const alternativeStructure = {
  version: "structure-v1", status: "partial",
  proposal: {instrument: "ccb", amount: "100000000", termMonths: 48, graceMonths: 6, amortizationFormat: "sac"},
  capacityEnvelope: {amount: "100000000"}, dayOne: {passes: true},
} as StructureTruthSetLike;
type StructureTruthSetLike = Parameters<typeof compileStructureAlternatives>[0]["structureTruth"];
const verificationFor = (draft: StructureAlternativeDraft, truth = alternativeStructure, operation = alternativeOperation) => ({
  alternativeFingerprint: fingerprintStructureAlternative(draft),
  contextFingerprint: fingerprintStructureVerificationContext(alternativeOperation, alternativeStructure),
  verifierVersion: "deterministic-v1", verifiedAt: "2026-08-29T12:00:00Z", operationTruth: operation, structureTruth: truth,
});
const basisLine = (id: string, label: string, amount: string, origin: "calculation" | "proposal") => ({
  id, label, amount, origin, basisIds: [`basis.${id}`], condition: origin === "proposal" ? "proposed" as const : "available" as const,
});
const draftOf = (id: string, amount = "100000000", sources: string[] = [amount], uses: string[] = [amount]): StructureAlternativeDraft => ({
  id, label: id, instrument: id, route: id, amount, currency: "BRL", termMonths: 48, graceMonths: 6, amortization: "sac", indexer: "CDI",
  targetBuyer: "private_credit_funds", rationale: "The repayment profile follows downside cash generation.", pros: ["Shorter execution"], cons: ["Higher fixed costs"],
  assumptions: ["Security is available"],
  sources: sources.map((value, index) => basisLine(`source-${index + 1}`, "New debt", value, "proposal")),
  uses: uses.map((value, index) => basisLine(`use-${index + 1}`, "Capex", value, "calculation")),
  security: [{description: "Receivables fiduciary assignment", basisIds: ["ES-11"]}],
  covenants: [{description: "Minimum DSCR", basisIds: ["ES-24"]}],
  conditionsPrecedent: [{description: "Corporate approvals", owner: "company", basisIds: ["ES-42"]}],
  implementationDays: {min: 30, max: 45, basisIds: ["ES-44"]},
  basisIds: ["C10", "ES-45"],
});
const recommendation = (alternativeId: string) => ({alternativeId, rationale: "Candidate", basisIds: ["ES-45"], proposedBy: "desk", proposedAt: "2026-08-29T12:00:00Z"});
const eligible = (...ids: string[]) => ids.map((id) => ({instrument: {id}, eligible: true}) as never);

function* alternativeSets() {
  const ccb = draftOf("ccb");
  const debenture = draftOf("debenture");
  yield {label: "verified-and-not", result: compileStructureAlternatives({
    proposal: {alternatives: [ccb, debenture], recommendation: recommendation("ccb")},
    operationTruth: alternativeOperation, structureTruth: alternativeStructure, instruments: eligible("ccb", "debenture"),
    verificationByAlternative: {ccb: verificationFor(ccb)},
    pricingByAlternative: {ccb: {decision: "reference_available", policyVersion: "pricing-v1", spreadBps: {min: 300, max: 400}, totalRate: {min: "0.14", max: "0.15"}, annualizedCostBps: 40, componentIds: ["legal"], missingInputs: []}},
  })};
  const fractional = draftOf("ccb", "100000000", ["33333333.333", "33333333.333", "33333333.334"], ["60000000.5", "39999999.5"]);
  yield {label: "fractional", result: compileStructureAlternatives({
    proposal: {alternatives: [fractional], recommendation: recommendation("ccb")}, operationTruth: alternativeOperation, structureTruth: alternativeStructure,
    instruments: eligible("ccb"), verificationByAlternative: {ccb: verificationFor(fractional)},
  })};
  for (const [tolerance, uses] of [["0.5", "99999999.6"], ["0.5", "99999999.4"], ["-0.5", "99999999.5"], [undefined, "100000000.00"]] as const) {
    const draft = draftOf("ccb", "100000000", ["100000000"], [uses]);
    yield {label: `tolerance-${tolerance}-${uses}`, result: compileStructureAlternatives({
      proposal: {alternatives: [draft], recommendation: recommendation("ccb")}, operationTruth: alternativeOperation, structureTruth: alternativeStructure,
      instruments: eligible("ccb"), verificationByAlternative: {ccb: verificationFor(draft)}, ...(tolerance === undefined ? {} : {sourcesAndUsesTolerance: tolerance}),
    })};
  }
  const oversized = draftOf("ccb", "120000000", ["120000000"], ["100000000"]);
  const zero = draftOf("ccb", "0");
  const mismatched = draftOf("ccb", "100000000.00");
  yield {label: "oversized-zero-mismatched", result: compileStructureAlternatives({
    proposal: {alternatives: [oversized, {...zero, id: "zero"}, {...mismatched, id: "mismatched"}], recommendation: recommendation("ccb")},
    operationTruth: alternativeOperation, structureTruth: alternativeStructure, instruments: eligible("ccb"),
    verificationByAlternative: {
      ccb: verificationFor(oversized),
      zero: verificationFor({...zero, id: "zero"}),
      mismatched: verificationFor({...mismatched, id: "mismatched"}, {...alternativeStructure, proposal: {...alternativeStructure.proposal, amount: "100000000.01"}}),
    },
  })};
  const verifiedTotals = draftOf("ccb");
  yield {label: "verified-totals-differ", result: compileStructureAlternatives({
    proposal: {alternatives: [verifiedTotals], recommendation: recommendation("ccb")}, operationTruth: alternativeOperation, structureTruth: alternativeStructure,
    instruments: eligible("ccb"),
    verificationByAlternative: {ccb: verificationFor(verifiedTotals, alternativeStructure, {...alternativeOperation, sourcesAndUses: {status: "pass", totalSources: "100000000.0", totalUses: "99999999"}} as OperationTruthSet)},
  })};
  yield {label: "no-envelope", result: compileStructureAlternatives({
    proposal: {alternatives: [ccb], recommendation: recommendation("ccb")}, operationTruth: alternativeOperation,
    structureTruth: {...alternativeStructure, capacityEnvelope: {amount: null}} as StructureTruthSetLike, instruments: eligible("ccb"),
  })};
}

describe("the deal structure across the move to financial-core", () => {
  it("reaches every wall, a package short and sufficient, constrained amounts and every sizing branch", () => {
    const allCapacities = [...capacities()].map(({capacity}) => capacity);
    expect(new Set(allCapacities.map((capacity) => capacity.bindingConstraint))).toEqual(new Set(["cash_flow", "collateral", "market", "arr_and_round", null]));
    const allPackages = [...packages()].map(({pkg}) => pkg);
    expect(allPackages.some((pkg) => pkg.sufficient) && allPackages.some((pkg) => !pkg.sufficient)).toBe(true);
    expect(allPackages.some((pkg) => pkg.notes.some((note) => note.pt.includes("faltam")))).toBe(true);
    const exceptionIds = new Set([...structures()].flatMap(({truth}) => truth.exceptions.map((exception) => exception.id)));
    for (const id of ["ticket-incompatible", "leverage-above-band", "invalid-balloon", "invalid-sizing-rate", "invalid-grace-period", "downside-coverage-breach", "covenant-insufficient-headroom", "new-maturity-wall", "collateral-policy-shortfall"]) {
      expect(exceptionIds.has(id), id).toBe(true);
    }
    const operationExceptions = new Set([...operations()].flatMap(({truth}) => truth.exceptions.map((exception) => exception.id)));
    expect(operationExceptions.has("request-need-divergence") && operationExceptions.has("sources-uses-mismatch")).toBe(true);
    const blockers = new Set([...alternativeSets()].flatMap(({result}) => result.alternatives.flatMap((alternative) => alternative.blockers)));
    for (const id of ["alternative_sources_and_uses_not_closed", "alternative_exceeds_capacity_envelope", "invalid_alternative_amount", "alternative_terms_not_verified", "alternative_sources_and_uses_not_verified"]) {
      expect(blockers.has(id), id).toBe(true);
    }
  });

  it("reproduces every pinned output byte for byte", () => {
    expect({
      capacity: digest(capacities()), collateral: digest(packages()), termSheet: digest(termSheets()),
      structure: digest(structures()), operation: digest(operations()), alternatives: digest(alternativeSets()),
    }).toEqual({
      capacity: {count: 140, sha256: "1375f2f038ef705d6f2b545184692e7c1d711fa91c426e05e81c0c633f06b812"},
      collateral: {count: 144, sha256: "91f482dc8080a0703b89a5d9b0e97c098c26c5c9990ecc19041f5ab6f7b945d1"},
      termSheet: {count: 210, sha256: "74f6833fb29237535c3969add315b5c4551f08ff09fe13db85142bab30090e43"},
      structure: {count: 22, sha256: "82612052b9d31edda4a952496279726c3de992372af305bb2ba9d017a1d25aec"},
      operation: {count: 13, sha256: "ec564f204ed537cdb0b9c57ea290be3a780b5946a756f0cf3d00a5989907af9e"},
      alternatives: {count: 9, sha256: "4cadbb63e5de94204822523cda0b6ed41850646596b6a405567e34c559251c5d"},
    });
  });
});
