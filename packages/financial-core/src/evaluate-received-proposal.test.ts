import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {buildReceivedProposalSchedule, evaluateReceivedProposal, type ReceivedProposalInput} from "./evaluate-received-proposal";
import {auroraReceivedProposal} from "./evaluate-received-proposal.fixture";

// Expectations come from ficha 1 with the corrections of C32, A05 and C09 and from the C32 oracle
// (modelo_aurora_c32.py, route "CCB de 3 anos para safra e capex"), never from this code.
const n = (v: string | null | undefined, p = 2) => v == null ? null : Number(new Decimal(v).toDecimalPlaces(p).toFixed());
const near = (v: string, oracle: number, tolerance: number) => new Decimal(v).minus(oracle).abs().lte(tolerance);
const r = evaluateReceivedProposal(auroraReceivedProposal());
const edit = (f: (i: ReceivedProposalInput) => void) => {const i = auroraReceivedProposal(); f(i); return i;};

describe("received proposal kernel", {timeout: 120_000}, () => {
  it("costs the proposal over its life on the contract dates, apart from the nominal spread", () => {
    expect([r.cost.fee, n(r.cost.creditTax, 4), n(r.cost.creditTaxRate, 4), n(r.cost.weightedAverageLifeYears, 2)]).toEqual(["0.24", 0.9743, 0.0325, 1.77]);
    // The published engine on the dated curve: CDI + 4.90 gross and 3.24 after tax, against 2.10 nominal.
    expect([n(r.cost.equivalentSpread, 4), n(r.cost.equivalentSpreadNet, 4), Number(r.cost.nominalToEquivalentBps) > 250]).toEqual([0.049, 0.0324, true]);
    expect([r.proposal.finalPaymentDate, r.proposal.months, r.proposal.validUntil, r.proposal.prepaymentFreeFrom]).toEqual(["2029-10-01", 36, "2026-09-13", "2027-10-01"]);
  });
  it("adds about R$ 13 mi to 2027 against R$ 90 mi of service and R$ 36 mi available, peak in the third quarter", () => {
    const y = r.calendar.years.find((x) => x.year === 2027)!;
    expect([n(y.existingService, 1), n(y.availableForService, 1), n(y.proposalService, 1), n(y.totalService, 1)]).toEqual([89.7, 35.7, 12.2, 101.9]);
    // C32 oracle with the CCB on its quarterly grid: 102.97; the dated monthly schedule starts principal in May.
    expect(near(y.totalService, 102.97, 1.2)).toBe(true);
    expect([r.calendar.peakYear, r.calendar.peakQuarter.periodEnd]).toEqual([2027, "2027-09-30"]);
  });
  it("solves December 2026 and leaves cash below the minimum from the third quarter of 2027", () => {
    const q = Object.fromEntries(r.calendar.quarters.map((x) => [x.periodEnd, n(x.closingCashWith, 1)]));
    expect([q["2026-12-31"], q["2027-09-30"], q["2027-12-31"]]).toEqual([18, -21.4, -60.6]);
    expect([near(r.calendar.quarters[4]!.closingCashWith, -22.83, 2), near(r.calendar.quarters[5]!.closingCashWith, -62.09, 2)]).toEqual([true, true]);
    expect(r.calendar.minimumCash.belowPolicyWith[0]).toBe("2027-09-30");
  });
  it("reads the term against each use: two thirds seasonal, the capex longer than three years", () => {
    expect([n(r.fit.seasonalShare, 4), r.fit.uses.map((u) => [u.id, u.reading]), r.fit.amountMinusUses]).toEqual([0.6667, [["safra", "longer_than_use"], ["embalagem", "shorter_than_use"]], "0"]);
  });
  it("tests the covenant on the indenture, the lender and the board policy, base and bank case", () => {
    const at = (date: string, scenario: string) => r.covenant.rows.find((x) => x.date === date && x.scenario === scenario)!;
    const head = (row: ReturnType<typeof at>, id: string) => n(row.limits.find((l) => l.limitId === id)!.headroomWith, 2);
    expect([n(at("2026-12-31", "base").ratioWith), head(at("2026-12-31", "base"), "indenture"), head(at("2026-12-31", "base"), "board-policy")]).toEqual([2.4, 0.6, 0.1]);
    expect([n(at("2026-12-31", "bank").ratioWith), head(at("2026-12-31", "bank"), "indenture"), at("2026-12-31", "bank").limits.find((l) => l.limitId === "board-policy")!.breachedWith]).toEqual([2.53, 0.47, true]);
    expect([near(at("2026-12-31", "base").ratioWith!, 2.41, 0.02), near(at("2027-12-31", "bank").ratioWith!, 2.62, 0.02)]).toEqual([true, true]);
    expect([r.covenant.testsPerYear, r.proposal.covenantDefinition]).toEqual([{indenture: 1, lender: 2}, "not_stated"]);
  });
  it("asks R$ 39 mi of receivables against R$ 25.4 mi that can be assigned and R$ 3 mi left in the indenture basket", () => {
    const c = r.collateral;
    expect([c.required, c.portfolio.gross, c.portfolio.nominallyFree, c.portfolio.assignable, c.shortfallToAssignable, c.assignableLeftAfter]).toEqual(["39", "58", "46", "25.41", "13.59", "0"]);
    expect(c.portfolio.buckets.filter((b) => !b.assignable).map((b) => [b.id, b.reasons])).toEqual([["rede-a", ["assignment_prohibited_without_debtor_consent"]],
      ["redes-c-d", ["assigned_to_other_creditor"]], ["vencidos", ["past_due"]]]);
    expect([r.negativePledge.remaining, r.negativePledge.excess, r.negativePledge.consentRequired, r.negativePledge.maxCoverageWithoutConsent]).toEqual(["3", "36", true, "0.1"]);
    expect(r.negativePledge.consentWindow).toEqual({from: "2026-09-03", by: "2026-09-13", needDate: "2026-10-01", slackDays: 18});
    expect([c.coverageReference.atOrAboveTop, c.restrictedAccount]).toEqual([true, true]);
  });
  it("prices against the market range and against the company's last operation", () => {
    expect([r.price.market!.position, r.price.market!.toMedianBps, r.price.market!.sample]).toEqual(["above_median_within_range", "20", 12]);
    expect([r.price.history!.observedBps, r.price.history!.expectedBps, r.price.history!.residualBps]).toEqual(["-50", "-70", "20"]);
  });
  it("prices what the company can ask for and puts its alternatives on the same basis", () => {
    const v = Object.fromEntries(r.variants.map((x) => [x.id, x]));
    expect([n(v["carencia-12-prazo-48"]!.peakYearService, 1), n(v["carencia-12-prazo-48"]!.equivalentSpread, 4), n(v["carencia-12-prazo-60"]!.equivalentSpread, 4)]).toEqual([6.2, 0.0423, 0.0395]);
    expect([v["cobertura-120-sem-conta"]!.collateral.required, v["cobertura-120-sem-conta"]!.collateral.consentRequired]).toEqual(["36", true]);
    expect(r.alternatives.map((a) => [a.id, a.consentRequired])).toEqual([["giro-seis-meses", false], ["finame-linha", false]]);
  });
  it("requires every test date in every declared scenario before concluding there is no breach", () => {
    expect([r.covenant.missingTests, r.covenant.required.length, r.covenant.anyBreachWith]).toEqual([[], 10, true]);
    const gone = evaluateReceivedProposal(edit((i) => {i.covenant.measurements = i.covenant.measurements.filter((m) => !(m.scenario === "bank" && ["2026-12-31", "2027-12-31"].includes(m.date)));}));
    expect([gone.covenant.anyBreachWith, gone.covenant.missingTests]).toEqual([null, [{date: "2026-12-31", scenario: "bank"}, {date: "2027-12-31", scenario: "bank"}]]);
    const no2028 = evaluateReceivedProposal(edit((i) => {i.covenant.measurements = i.covenant.measurements.filter((m) => !m.date.startsWith("2028"));}));
    expect(no2028.covenant.missingTests.map((m) => m.date)).toEqual(["2028-06-30", "2028-06-30", "2028-12-31", "2028-12-31"]);
    expect(() => evaluateReceivedProposal(edit((i) => {i.covenant.measurements[0]!.scenario = "stress";}))).toThrow("received_proposal_covenant_scenario_undeclared");
  });
  it("states the net cost only under lucro real with every period of the life taxable", () => {
    expect(r.cost.netConvention).toBe("full_deductibility_simplified");
    const none = evaluateReceivedProposal(edit((i) => {i.calendar.taxable = i.calendar.taxable.map(() => false);}));
    expect([none.cost.netConvention, none.cost.equivalentSpreadNet, none.variants[0]!.equivalentSpreadNet]).toEqual(["not_all_periods_taxable", null, null]);
    const presumido = evaluateReceivedProposal(edit((i) => {i.tax.regime = "lucro_presumido";}));
    expect([presumido.cost.netConvention, presumido.cost.equivalentSpreadNet]).toEqual(["no_deduction_presumido", presumido.cost.equivalentSpread]);
  });
  it("reads the indenture basket per operation only when adopted that way", () => {
    const per = evaluateReceivedProposal(edit((i) => {i.basket.basis = "per_operation";}));
    expect([per.negativePledge.remaining, per.negativePledge.consentRequired]).toEqual(["15", true]);
    expect(evaluateReceivedProposal(edit((i) => {i.proposal.coverage = "0.1";})).negativePledge.consentRequired).toBe(false);
  });
  it("refuses an empty basket under an assignment the portfolio shows, a free bucket in the basket and other boundaries", () => {
    expect(() => evaluateReceivedProposal(edit((i) => {i.basket.occupied = "0";}))).toThrow("received_proposal_basket_usage_understated");
    expect(() => evaluateReceivedProposal(edit((i) => {i.portfolio[0]!.countsAgainstBasket = true;}))).toThrow("received_proposal_basket_flag_on_free_bucket");
    expect(() => evaluateReceivedProposal(edit((i) => {i.portfolio[1]!.holder = null;}))).toThrow("received_proposal_encumbrance_holder");
    expect(() => evaluateReceivedProposal(edit((i) => {i.proposal.indexer = "ipca" as never;}))).toThrow("received_proposal_indexer_unsupported");
    expect(() => evaluateReceivedProposal(edit((i) => {i.proposal.amortization = "bullet";}))).toThrow("received_proposal_bullet_single_installment");
    expect(() => evaluateReceivedProposal(edit((i) => {i.covenant.measurements[0]!.date = "2026-11-30";}))).toThrow("received_proposal_covenant_date_off_calendar");
    expect(() => evaluateReceivedProposal(edit((i) => {i.proposal.drawDate = "2029-03-01";}))).toThrow("received_proposal_draw_outside_calendar");
    expect(() => evaluateReceivedProposal(edit((i) => {i.indexCurve = [{year: 2027, annualRate: "0.14"}];}))).toThrow("received_proposal_index_curve_not_covering");
  });
  it("builds a bullet with interest every month and splits the year where the curve changes", () => {
    const i = auroraReceivedProposal();
    const s = buildReceivedProposalSchedule({...i.proposal, amortization: "bullet"}, {...i.proposal, graceMonths: 11, installments: 1}, i);
    expect([s.finalPaymentDate, s.scheduleInput.periods.filter((p) => p.endDate === "2027-01-01").length, n(s.weightedAverageLifeYears.toFixed(), 2)]).toEqual(["2027-10-01", 1, 0.99]);
  });
});
