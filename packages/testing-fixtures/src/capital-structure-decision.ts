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
