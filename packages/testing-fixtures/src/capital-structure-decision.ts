import {createHash} from "node:crypto";

/** Synthetic comparison inputs, not a production default or professional recommendation. */
export const capitalDecisionFixtureId = (n: number) => `c1500000-0000-4000-9000-${String(n).padStart(12, "0")}`;
export function capitalStructureDecisionFixture() {
  const id = capitalDecisionFixtureId;
  const purpose = "capital structure decision";
  const metrics = [
    {id: "cash", label: "Closing available cash", fieldPath: "financials.closing_cash", definitionVersionId: id(20), definitionKind: "managerial", unit: "currency", currency: "BRL", temporalKind: "stock", periodStart: null, periodEnd: "2027-12-31"},
    {id: "service", label: "Annual debt service", fieldPath: "financials.debt_service", definitionVersionId: id(21), definitionKind: "contractual", unit: "currency", currency: "BRL", temporalKind: "flow", periodStart: "2027-01-01", periodEnd: "2027-12-31"},
  ];
  const scenarios = ["house-current", "requested-refinancing"];
  const amounts = [["-10", "40"], ["20", "10"]];
  const entries = scenarios.flatMap((scenario, i) => metrics.map((metric, j) => ({
    decisionId: id(100 + i * 10 + j), slotKey: String(i * 2 + j).repeat(64), kind: "hypothesis",
    fieldPath: metric.fieldPath,
    dimensions: {entityId: id(1), perimeter: "standalone", periodStart: metric.periodStart, periodEnd: metric.periodEnd, currency: "BRL", unit: "currency", scale: "1", scenario, definitionVersionId: metric.definitionVersionId},
    value: {type: "number", value: amounts[i]![j]!}, observationId: null, referenceValue: null, referenceDimensions: null,
    definitionKind: metric.definitionKind, actorId: id(2), reason: "Synthetic explicit hypothesis for comparison contract testing",
  })));
  const snapshot = {schemaVersion: "contextual-adoption.v1", versionId: id(3), setId: id(4), workId: id(5), purpose, contextKey: "capital-comparison", revision: 1, previousVersionId: null, classification: "working_basis", entries};
  const canonical = JSON.stringify(snapshot);
  const input = {
    schemaVersion: "capital-structure-comparison-input.v1", workId: id(5), purpose,
    question: "Which structure preserves liquidity for the declared investment horizon?",
    entityId: id(1), perimeter: "standalone", horizon: {start: "2027-01-01", end: "2027-12-31"}, objectives: ["Preserve liquidity", "Expose refinancing dependencies"],
    basis: {scope: {workId: id(5), purpose, versionId: id(3)}, envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")}},
    metrics,
    alternatives: scenarios.map((scenario, i) => ({id: i ? "refinance" : "current", label: i ? "Requested refinancing hypothesis" : "Current structure", kind: i ? "change" : "maintain", scenario, selections: metrics.map((metric, j) => ({metricId: metric.id, decisionId: id(100 + i * 10 + j), missingReason: null})), tradeoffs: []})),
    maintenanceExclusion: null, constraints: [],
  };
  return {synthetic: true as const, input, snapshot};
}

/** Independent dated cash oracle: 10 - 40 = -30, then +80 = 50; restricted 100 stays separate. */
export function adoptedLiquidityCalendarFixture() {
  const {snapshot} = capitalStructureDecisionFixture();
  const descriptors = [
    {fieldPath: "liquidity.available_cash", date: "2026-12-31", value: "10", flow: false},
    {fieldPath: "liquidity.restricted_cash", date: "2026-12-31", value: "100", flow: false},
    {fieldPath: "liquidity.cash_outflow", date: "2027-01-10", value: "40", flow: true},
    {fieldPath: "liquidity.cash_inflow", date: "2027-02-10", value: "80", flow: true},
  ];
  snapshot.entries = snapshot.entries.map((entry, index) => {
    const d = descriptors[index]!;
    return {...entry, fieldPath: d.fieldPath, value: {type: "number", value: d.value}, dimensions: {...entry.dimensions, periodStart: d.flow ? d.date : null, periodEnd: d.date, scenario: d.flow ? "house" : "actual", definitionVersionId: capitalDecisionFixtureId(200 + index)}};
  });
  const canonical = JSON.stringify(snapshot);
  const select = (index: number) => ({decisionId: snapshot.entries[index]!.decisionId, definitionVersionId: snapshot.entries[index]!.dimensions.definitionVersionId, definitionKind: snapshot.entries[index]!.definitionKind, missingReason: null});
  return {synthetic: true as const, snapshot, input: {
    envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
    scope: {workId: snapshot.workId, purpose: snapshot.purpose, versionId: snapshot.versionId},
    entityId: capitalDecisionFixtureId(1), perimeter: "standalone", currency: "BRL", openingScenario: "actual", scenario: "house",
    openingDate: "2026-12-31", endDate: "2027-12-31", convention: "end_of_day_netting",
    coverage: {status: "complete", reason: "Synthetic explicitly scoped cash calendar"}, openingAvailable: select(0), openingRestricted: select(1),
    events: [{id: "debt", date: "2027-01-10", account: "available", direction: "outflow", selection: select(2)}, {id: "receipt", date: "2027-02-10", account: "available", direction: "inflow", selection: select(3)}],
  }};
}

export {adoptedDebtLiquidityFixture} from "./adopted-debt-liquidity";

export {adoptedFinancingFixture} from "./adopted-financing-costs";

export * from "./adopted-operating-projection";

export * from "./adopted-capital-period-cash";

export * from "./capital-decision-composition";

export * from "./adopted-defined-ratio";

export * from "./capital-decision-review";

/** Synthetic source-bound contract preparation; never customer data. */
export function capitalContractPreparationFixture() {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const anchor = {document: "synthetic-contract", page: 1, clause: "1.1", note: "BRL"};
  const clause = {document: anchor.document, page: 1, clause: "1.1"};
  const layer = {decimals: 8, mode: "round" as const};
  return {schemaVersion: "capital-contract-preparation-input.v1", workId: id(1), purpose: "Review capital alternatives", entityId: id(2), perimeter: "consolidated", scenario: "contract", currency: "BRL", asOf: "2026-01-01",
    interestConventions: {schemaVersion: "interest-event-conventions.v1", series: [{seriesId: "debt", order: ["anniversary", "coupon", "amortization"], anchor}]},
    sources: [{document: anchor.document, sourceVersionId: id(3), observationIds: [id(4)]}],
    interest: {referenceDate: "2026-01-01", unit: "BRL", unitAnchor: anchor,
      periods: [{id: "year", start: "2026-01-01", end: "2027-01-01", businessDays: 252, anchor}], curves: [],
      series: [{id: "debt", label: "Synthetic debt", openingPrincipal: {value: "100", basis: "trustee_report_nominal", anchor}, openingAccrued: {value: "0", anchor},
        indexer: "fixed", remuneration: {type: "fixed", ratePerYear: "0.1"}, couponDates: [{date: "2027-01-01", businessDaysFromPeriodStart: 252}],
        amortization: [{date: "2027-01-01", amount: "100", businessDaysFromPeriodStart: 252}], indexationTreatment: null, indexation: null,
        rounding: {indexFactor: layer, spreadFactor: layer, interestFactor: layer, dailyAccumulation: layer, amount: layer, anchor}, curveId: null,
        anchors: {balance: anchor, terms: anchor, payments: anchor, amortization: anchor}}], ledgerControl: null, accountingInterestLastPeriod: null},
    covenants: {asOfDate: "2026-01-01", unit: "BRL", unitAnchor: anchor,
      instruments: [{source: "indenture", id: "debt", indexName: "Net debt / EBITDA", direction: "maximum", perimeter: "consolidated",
        netDebtDefinition: "Loans less cash", netDebtComponents: ["loans_and_financings", "cash_and_equivalents"], ebitdaDefinition: "LTM EBITDA", ebitdaAdjustments: [],
        measurement: {frequency: "annual", basis: "LTM", fiscalYearEnd: "12-31"}, tiers: [{limit: "2", condition: {type: "unconditional"}, anchor: clause}], definitionAnchors: {netDebt: clause, ebitda: clause}}],
      referenceSettlements: [], componentValues: [{component: "loans_and_financings", covers: ["loans_and_financings"], value: "200", unit: "BRL", perimeter: "consolidated", asOf: "2026-01-01", anchor},
        {component: "cash_and_equivalents", covers: ["cash_and_equivalents"], value: "50", unit: "BRL", perimeter: "consolidated", asOf: "2026-01-01", anchor}], candidateObligations: [],
      ltmEbitda: {value: "100", unit: "BRL", perimeter: "consolidated", asOf: "2026-01-01", months: 12, incorporatesAdjustments: [], anchor}, reported: null}};
}
