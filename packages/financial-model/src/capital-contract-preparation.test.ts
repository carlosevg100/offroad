import {describe, expect, it} from "vitest";
import {prepareCapitalContractEvidence} from "./capital-contract-preparation";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const anchor = {document: "synthetic-contract", page: 1, clause: "1.1", note: "BRL"};
const clause = {document: anchor.document, page: 1, clause: "1.1"};
const layer = {decimals: 8, mode: "round" as const};
function fixture() {
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
describe("capital contract preparation", () => {
  it("composes anchored interest amortization and covenant components as proposals", () => {
    const r = prepareCapitalContractEvidence(fixture());
    expect(r.interest?.schedule_by_series[0]?.totals).toMatchObject({cash_interest: "10", principal_paid: "100"});
    expect(r.interest?.schedule_by_series[0]?.rows?.[0]?.closing_principal).toBe("0");
    expect(r.covenants?.covenants[0]?.netDebtByDefinition?.value).toBe(String(200 - 50));
    expect(r.covenants?.covenants[0]?.index?.value).toBe("1.5");
    expect(r.state).toBe("candidate_contributions"); expect(r.mutatesWorkingBasis).toBe(false);
    expect(r.requiredReviews).toContain("contextual_adoption"); expect(r.certifiesContractualCompliance).toBe(false);
  });
  it("requires an exact source version for every calculation anchor", () => {
    const i = fixture(); i.interest.series[0]!.anchors.terms = {...anchor, document: "unbound"};
    expect(() => prepareCapitalContractEvidence(i)).toThrow("source_version_missing");
  });
  it("rejects unused duplicate and ambiguous source declarations", () => {
    const i = fixture(); i.sources.push({...i.sources[0]!, document: "unused", sourceVersionId: id(8), observationIds: [id(11)]});
    expect(() => prepareCapitalContractEvidence(i)).toThrow("unused_source");
    i.sources[1]!.document = anchor.document; expect(() => prepareCapitalContractEvidence(i)).toThrow();
  });
  it("does not let legacy defaults invent direction or perimeter", () => {
    const i = fixture(); const raw = JSON.parse(JSON.stringify(i)); delete raw.covenants.instruments[0].direction;
    expect(() => prepareCapitalContractEvidence(raw)).toThrow("explicit_terms_required");
    const second = JSON.parse(JSON.stringify(i)); delete second.covenants.ltmEbitda.perimeter;
    expect(() => prepareCapitalContractEvidence(second)).toThrow("explicit_terms_required");
  });
  it("rejects another perimeter currency or measurement date", () => {
    const i = fixture(); i.covenants.componentValues[0]!.perimeter = "parent";
    expect(() => prepareCapitalContractEvidence(i)).toThrow("perimeter_mismatch");
    const j = fixture(); j.currency = "USD"; expect(() => prepareCapitalContractEvidence(j)).toThrow("normalized_currency_required");
    const k = fixture(); k.asOf = "2026-01-02"; expect(() => prepareCapitalContractEvidence(k)).toThrow("measurement_mismatch");
  });
  it("keeps unknown amortization unknown instead of zero or unchanged debt", () => {
    const i = fixture(); const raw = JSON.parse(JSON.stringify(i)); raw.interest.series[0].amortization = null; raw.interest.series[0].anchors.amortization = null;
    const r = prepareCapitalContractEvidence(raw); expect(r.interest?.schedule_by_series[0]?.rows?.[0]?.principal_paid).toBeNull();
    expect(r.interest?.schedule_by_series[0]?.rows?.[0]?.closing_principal).toBeNull();
  });
  it("preserves missing covenant opening instead of inferring contractual capacity", () => {
    const raw = JSON.parse(JSON.stringify(fixture())); raw.covenants.ltmEbitda = null;
    const r = prepareCapitalContractEvidence(raw); expect(r.covenants?.covenants[0]?.index).toBeNull();
  });
  it("pins raw operands source versions and current calculation versions for reproduction", () => {
    const i = fixture(); const before = JSON.stringify(i); const r = prepareCapitalContractEvidence(i);
    expect(JSON.stringify(i)).toBe(before); expect(prepareCapitalContractEvidence(i)).toEqual(r);
    expect(r.inputs.interest?.series[0]?.remuneration).toEqual(i.interest.series[0]!.remuneration);
    i.sources[0]!.sourceVersionId = id(9); expect(prepareCapitalContractEvidence(i).fingerprint).not.toBe(r.fingerprint);
    expect(r.interest?.schema_version).toBe("method.build-interest-and-indexation-schedule.v8");
    expect(r.covenants?.schema_version).toBe("method.reconcile-covenant-definitions.v14");
  });
  it("preserves indexation treatment and independently checked principal identity", () => {
    const raw = JSON.parse(JSON.stringify(fixture()));
    raw.interest.periods = [{id: "month", start: "2026-01-01", end: "2026-02-02", businessDays: 22, anchor}];
    raw.interest.curves = [{id: "ipca", kind: "IPCA", annualRateByPeriod: {month: "0"}, dailyRateByPeriod: null,
      monthlyRateByMonth: {"2026-01": "0.01"}, indexNumberByMonth: null,
      source: {title: "Synthetic curve", asOf: "2026-01-01", anchor}}];
    const series = raw.interest.series[0]; series.indexer = "IPCA"; series.curveId = "ipca";
    series.remuneration = {type: "spread_over_index", spreadPerYear: "0"};
    series.couponDates = [{date: "2026-02-02", businessDaysFromPeriodStart: 22}];
    series.amortization = [{date: "2026-02-02", amount: "100", businessDaysFromPeriodStart: 22}];
    series.indexationTreatment = "capitalized_principal";
    series.indexation = {anniversaryDay: 1, lagMonths: 1, anniversaryDates: [{date: "2026-02-01", businessDaysFromPeriodStart: 21}],
      proRataByPeriod: {month: {dup: 0, dut: 21}}, anchor};
    const capitalized = prepareCapitalContractEvidence(raw).interest!.schedule_by_series[0]!;
    expect(capitalized.rows![0]!.indexation_capitalized).toBe("1");
    expect(capitalized.rows![0]!.closing_principal).toBe(String(100 + 1 - 100));
    series.indexationTreatment = "cash_paid";
    const paid = prepareCapitalContractEvidence(raw).interest!.schedule_by_series[0]!;
    expect(paid.rows![0]!.indexation_paid).toBe("1"); expect(paid.rows![0]!.closing_principal).toBe("0");
    series.indexationTreatment = null;
    const unknown = prepareCapitalContractEvidence(raw).interest!;
    expect(unknown.schedule_by_series[0]!.rows).toBeNull();
    expect(unknown.schedule_by_series[0]!.treatment_scenarios).toHaveLength(2);
    expect(unknown.schedule_aggregate!.treatment_scenarios_pending).toEqual(["debt"]);
    series.amortization[0].date = "2026-02-01"; series.amortization[0].businessDaysFromPeriodStart = 21;
    series.indexationTreatment = "capitalized_principal";
    expect(prepareCapitalContractEvidence(raw).interest!.schedule_by_series[0]!.rows![0]!.closing_principal).toBe("1");
    raw.interestConventions.series[0].order = ["amortization", "anniversary", "coupon"];
    expect(prepareCapitalContractEvidence(raw).interest!.schedule_by_series[0]!.rows![0]!.closing_principal).toBe("0");
    raw.interestConventions.series = [];
    expect(() => prepareCapitalContractEvidence(raw)).toThrow("simultaneous_event_convention_required");
    raw.interestConventions.series = [{seriesId: "debt", order: ["anniversary", "coupon", "amortization"], anchor}];
    series.amortization[0].date = "2026-02-02"; series.amortization[0].businessDaysFromPeriodStart = 22;
    raw.interest.curves[0].monthlyRateByMonth = null; raw.interest.curves[0].indexNumberByMonth = {"2025-12": "100", "2026-01": "101"};
    expect(prepareCapitalContractEvidence(raw).interest!.schedule_by_series[0]!.rows![0]!.indexation_capitalized).toBe("1");
  });
  it("refuses one observation attributed to two source versions", () => {
    const i = fixture(); i.sources.push({document: "another", sourceVersionId: id(10), observationIds: [id(4)]});
    expect(() => prepareCapitalContractEvidence(i)).toThrow("Duplicate observation identity");
  });
  it("rejects incomplete duplicate and foreign event conventions", () => {
    const raw = JSON.parse(JSON.stringify(fixture())); raw.interestConventions.series[0].order = ["coupon", "coupon", "amortization"];
    expect(() => prepareCapitalContractEvidence(raw)).toThrow();
    const raw2 = JSON.parse(JSON.stringify(fixture())); raw2.interestConventions.series.push(raw2.interestConventions.series[0]);
    expect(() => prepareCapitalContractEvidence(raw2)).toThrow();
    const raw3 = JSON.parse(JSON.stringify(fixture())); raw3.interestConventions.series[0].seriesId = "foreign";
    expect(() => prepareCapitalContractEvidence(raw3)).toThrow("unknown_series");
  });
  it("binds the event convention source and exact order to the calculation fingerprint", () => {
    const i = fixture(); const before = prepareCapitalContractEvidence(i);
    i.interestConventions.series[0]!.order = ["amortization", "anniversary", "coupon"];
    const after = prepareCapitalContractEvidence(i);
    expect(after.interest!.trace.inputFingerprint).not.toBe(before.interest!.trace.inputFingerprint);
    expect(after.sourceBindings.some(b => b.path.startsWith("interestConventions"))).toBe(true);
    i.interestConventions.series[0]!.anchor = {...anchor, document: "unbound-order"};
    expect(() => prepareCapitalContractEvidence(i)).toThrow("source_version_missing");
  });
  it("cannot accept approval or execution authority as an input", () => {
    expect(() => prepareCapitalContractEvidence({...fixture(), grantsExecution: true})).toThrow();
    const r = prepareCapitalContractEvidence(fixture()); expect(r.grantsAccess).toBe(false); expect(r.grantsExecution).toBe(false);
  });
  it("rejects impossible dates and oversized preparation before calculation", () => {
    const i = fixture(); i.covenants.componentValues[0]!.asOf = "2026-02-30";
    expect(() => prepareCapitalContractEvidence(i)).toThrow();
    expect(() => prepareCapitalContractEvidence({...fixture(), purpose: "x".repeat(1048577)})).toThrow("too_large");
  });
});
