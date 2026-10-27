import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {deterministicRunEvidenceFingerprint, type DeterministicMethodRun, type DeterministicMethodRunCase} from "@offroad/credit-playbook";
import {prepareReceivedProposalPacket, receivedProposalPacketOutputSchema, type ReceivedProposalPacketInput} from "./evaluate-received-proposal-packet";
import {auroraReceivedProposal, auroraReceivedProposalBasis, receivedProposalQuestion as question} from "./evaluate-received-proposal.test-support";

// Evaluation-only module; not exported to application consumers. All cases are synthetic calibrations
// of ficha 1 with the corrections of C32, A05 and C09 (oracle modelo_aurora_c32.py), never production parameters.
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const D = Decimal.clone({precision: 60});
const r = (v: string | null | undefined, p = 1) => v == null ? null : new D(v).toDecimalPlaces(p).toNumber();
const near = (v: string | null | undefined, oracle: number, tolerance: number) => v != null && new D(v).minus(oracle).abs().lte(tolerance);
type Case = DeterministicMethodRunCase;
type Evidence = Omit<DeterministicMethodRun, "schemaVersion" | "humanApproval" | "run">;
type Packet = ReturnType<typeof prepareReceivedProposalPacket>;
type Basis = ReturnType<typeof auroraReceivedProposalBasis>;
type Fixture = ReturnType<typeof auroraReceivedProposal>;
export const receivedProposalMethodVersion = "2026.10.27-v1";
export const receivedProposalRunIds = {
  gold: "evaluate-received-proposal-2026-10-27-v1-gold",
  adversarial: "evaluate-received-proposal-2026-10-27-v1-adversarial",
  consistency: "evaluate-received-proposal-2026-10-27-v1-consistency",
} as const;
const packetInput = (edit: (f: Basis) => void = () => undefined, after: (i: ReceivedProposalPacketInput) => void = () => undefined, fixture: () => Fixture = auroraReceivedProposal): ReceivedProposalPacketInput => {
  const f = auroraReceivedProposalBasis(fixture()); edit(f);
  const i = {schemaVersion: "received-proposal-packet-input.v1", question, analysis: f.seal()} as ReceivedProposalPacketInput; after(i); return i;
};
const variant = (change: (k: Fixture) => void) => () => {const k = auroraReceivedProposal(); change(k); return k;};
const entry = (f: Basis, suffix: string) => f.entries.find((x) => x.fieldPath.endsWith(suffix))!;
function observe(id: string, input: ReceivedProposalPacketInput, expected: unknown, select: (p: Packet) => unknown): Case {
  const result = prepareReceivedProposalPacket(input), observed = JSON.stringify(select(result)), expectation = JSON.stringify(expected);
  return {id, expectation, observed, inputFingerprint: fingerprint(input), outputFingerprint: fingerprint(result), passed: expectation === observed};
}

function goldCases(): Case[] {
  const base = () => packetInput(), packet = prepareReceivedProposalPacket(base());
  const reuse = (id: string, expected: unknown, select: (p: Packet) => unknown): Case => {
    const observed = JSON.stringify(select(packet)), expectation = JSON.stringify(expected);
    return {id, expectation, observed, inputFingerprint: fingerprint(base()), outputFingerprint: fingerprint(packet), passed: expectation === observed};
  };
  const row = (p: Packet, date: string, scenario: string) => p.readings!.covenant.rows.find((x) => x.date === date && x.scenario === scenario)!;
  const head = (p: Packet, date: string, scenario: string, limit: string) => row(p, date, scenario).headroom.find((h) => h.limitId === limit)!;
  const quarter = (p: Packet, end: string) => p.result.evaluation!.calendar.quarters.find((q) => q.periodEnd === end)!;
  return [
    // Expectations come from ficha 1 with the corrections of C32, A05 and C09 and from the C32 oracle (resultados.json), never from this code.
    reuse("indicative-proposal-is-a-starting-point", {firmness: "indicative", validUntil: "2026-09-13", fact: true}, (p) => ({firmness: p.readings!.firmness.firmness,
      validUntil: p.readings!.firmness.validUntil, fact: p.readings!.assessment.facts.includes("proposal_indicative")})),
    reuse("lender-has-not-seen-the-indenture", {bankSawIndenture: false, diligenceMayReopenStructure: true}, (p) => ({bankSawIndenture: p.readings!.firmness.bankSawIndenture,
      diligenceMayReopenStructure: p.readings!.firmness.diligenceMayReopenStructure})),
    // C32 correction: service of about R$ 90 mi against about R$ 36 mi available; the CCB adds about R$ 13 mi (oracle 102.97 with it).
    reuse("2027-service-against-available-cash", {existing: 89.7, near90: true, available: 35.7, near36: true, proposal: 12.2, near13: true, total: 101.9, nearOracle: true},
      (p) => {const l = p.readings!.liquidity; return {existing: r(l.existingService), near90: near(l.existingService, 90, 1), available: r(l.availableForService), near36: near(l.availableForService, 36, 5),
        proposal: r(l.proposalService), near13: near(l.proposalService, 13, 1.2), total: r(l.totalService), nearOracle: near(l.totalService, 102.97, 1.2)};}),
    reuse("peak-pressure-in-the-third-quarter-of-2027", {peakYear: 2027, peakQuarter: "2027-09-30"}, (p) => ({peakYear: p.readings!.liquidity.peakYear, peakQuarter: p.readings!.liquidity.peakQuarter})),
    reuse("december-solved-cash-below-minimum-from-third-quarter-2027", {dec26: 18, sep27: -21.4, dec27: -60.6, oracleSep27: true, oracleDec27: true, firstBelow: "2027-09-30"},
      (p) => ({dec26: r(quarter(p, "2026-12-31").closingCashWith), sep27: r(quarter(p, "2027-09-30").closingCashWith), dec27: r(quarter(p, "2027-12-31").closingCashWith),
        oracleSep27: near(quarter(p, "2027-09-30").closingCashWith, -22.83, 2), oracleDec27: near(quarter(p, "2027-12-31").closingCashWith, -62.09, 2), firstBelow: p.readings!.liquidity.firstBelowPolicyWith})),
    reuse("two-thirds-seasonal-on-a-three-year-amortizing-loan", {seasonalShare: 0.67, uses: [["safra", "longer_than_use"], ["embalagem", "shorter_than_use"]], life: 1.77, final: "2029-10-01"},
      (p) => ({seasonalShare: r(p.readings!.fit.seasonalShare, 2), uses: p.readings!.fit.uses.map((u) => [u.id, u.reading]), life: r(p.readings!.fit.weightedAverageLifeYears, 2), final: p.readings!.fit.finalPaymentDate})),
    reuse("covenant-on-the-indenture-definition", {ratio: 2.4, oracle: true, headroom: 0.6, policyHeadroom: 0.1, dec27: 2.07},
      (p) => ({ratio: r(row(p, "2026-12-31", "base").ratioWith, 2), oracle: near(row(p, "2026-12-31", "base").ratioWith, 2.41, 0.02), headroom: r(head(p, "2026-12-31", "base", "indenture").headroomWith, 2),
        policyHeadroom: r(head(p, "2026-12-31", "base", "board-policy").headroomWith, 2), dec27: r(row(p, "2027-12-31", "base").ratioWith, 2)})),
    reuse("bank-case-and-board-policy", {dec26: 2.53, headroom: 0.47, dec27: 2.61, oracle: true, headroomDec27: 0.39, policyBreached: true},
      (p) => ({dec26: r(row(p, "2026-12-31", "bank").ratioWith, 2), headroom: r(head(p, "2026-12-31", "bank", "indenture").headroomWith, 2), dec27: r(row(p, "2027-12-31", "bank").ratioWith, 2),
        oracle: near(row(p, "2027-12-31", "bank").ratioWith, 2.62, 0.02), headroomDec27: r(head(p, "2027-12-31", "bank", "indenture").headroomWith, 2),
        policyBreached: head(p, "2026-12-31", "bank", "board-policy").breachedWith})),
    reuse("semiannual-test-doubles-the-dates", {indenture: 1, lender: 2, june: true}, (p) => ({...p.readings!.covenant.testsPerYear,
      june: head(p, "2027-06-30", "base", "proposal").testedOnDate && !head(p, "2027-06-30", "base", "indenture").testedOnDate})),
    reuse("collateral-against-the-assignable-portfolio", {required: 39, nominallyFree: 46, assignable: 25.41, shortfall: 13.59, leftAfter: 0, seasonalPeak: 25},
      (p) => {const c = p.readings!.collateral; return {required: r(c.required), nominallyFree: r(c.nominallyFree), assignable: r(c.assignable, 2), shortfall: r(c.shortfallToAssignable, 2),
        leftAfter: r(c.assignableLeftAfter), seasonalPeak: r(c.seasonalPeak)};}),
    // C09 correction: retailer A (32%) forbids assignment and is never counted as available.
    reuse("retailer-a-is-not-assignable", [["rede-a", 18.56, ["assignment_prohibited_without_debtor_consent"]], ["redes-c-d", 12, ["assigned_to_other_creditor"]], ["vencidos", 2.03, ["past_due"]]],
      (p) => p.readings!.collateral.excluded.map((x) => [x.id, r(x.amount, 2), x.reasons])),
    // C32 and A05 corrections: the R$ 15 mi exception is aggregate and R$ 12 mi of it is the Bradesco assignment.
    reuse("aggregate-basket-occupied-by-bradesco", {basis: "aggregate", remaining: 3, excess: 36, consentRequired: true}, (p) => ({basis: p.readings!.negativePledge.basis,
      remaining: r(p.readings!.negativePledge.remaining), excess: r(p.readings!.negativePledge.excess), consentRequired: p.readings!.negativePledge.consentRequired})),
    observe("per-operation-reading-changes-only-the-basket", packetInput(undefined, undefined, variant((k) => {k.basket.basis = "per_operation";})),
      {remaining: 15, consentRequired: true, seasonalLineWithinBasket: false}, (p) => ({remaining: r(p.readings!.negativePledge.remaining), consentRequired: p.readings!.negativePledge.consentRequired,
        seasonalLineWithinBasket: p.readings!.alternatives.find((a) => a.id === "giro-seis-meses")!.consentRequired})),
    reuse("consent-window-against-the-draw", {consentBy: "2026-09-13", needDate: "2026-10-01", slackDays: 18, recommendation: true},
      (p) => ({consentBy: p.readings!.negativePledge.consentBy, needDate: p.readings!.negativePledge.needDate, slackDays: p.readings!.negativePledge.slackDays,
        recommendation: p.readings!.assessment.recommendations.includes("address_indenture_consent_before_signing")})),
    reuse("nominal-spread-against-the-market-range", {position: "above_median_within_range", toMedianBps: 20, sample: 12, confidence: "high"},
      (p) => ({position: p.readings!.price.marketPosition, toMedianBps: r(p.result.evaluation!.price.market!.toMedianBps), sample: p.result.evaluation!.price.market!.sample,
        confidence: p.result.evaluation!.price.market!.confidence})),
    // The published equivalent-spread engine on the dated curve, IOF per installment: the ficha's 4.4 and 2.9 used 3.38% of IOF and an additive spread over 1.8 years.
    reuse("cost-over-the-life-apart-from-the-nominal-spread", {nominal: 2.1, gross: 4.9, net: 3.24, iof: 3.25, life: 1.77, readingCostAboveNominal: true},
      (p) => ({nominal: r(new D(p.readings!.price.nominalSpread).mul(100).toFixed(), 2), gross: r(new D(p.readings!.price.equivalentSpread).mul(100).toFixed(), 2),
        net: r(new D(p.readings!.price.equivalentSpreadNet!).mul(100).toFixed(), 2), iof: r(new D(p.readings!.price.creditTaxRate).mul(100).toFixed(), 2),
        life: r(p.readings!.price.weightedAverageLifeYears, 2), readingCostAboveNominal: p.readings!.assessment.readings.includes("all_in_cost_well_above_nominal")})),
    reuse("bridge-to-the-bradesco-operation", {observed: -50, expected: -70, residual: 20, partlyPaidInCollateral: true},
      (p) => ({observed: r(p.readings!.price.history!.observedBps), expected: r(p.readings!.price.history!.expectedBps), residual: r(p.readings!.price.history!.residualBps),
        partlyPaidInCollateral: p.readings!.assessment.readings.includes("improvement_partly_paid_in_collateral")})),
    reuse("longer-tenor-lightens-the-upfront-costs", {received: 280, sixtyMonths: 185, ratio: 0.66},
      (p) => {const ev = p.result.evaluation!, v = ev.variants.find((x) => x.id === "carencia-12-prazo-60")!;
        const a = new D(ev.cost.equivalentSpread).minus(ev.proposal.annualSpread).mul(10000), b = new D(v.equivalentSpread).minus(ev.proposal.annualSpread).mul(10000);
        return {received: r(a.toFixed(), 0), sixtyMonths: r(b.toFixed(), 0), ratio: r(b.div(a).toFixed(), 2)};}),
    reuse("asks-and-what-each-buys", [["carencia-12-prazo-48", -6, -67, 0, true], ["carencia-12-prazo-60", -6.4, -95, 0, true], ["cobertura-120-sem-conta", 0, 0, -3, true]],
      (p) => p.readings!.asks.map((a) => [a.id, r(a.peakYearServiceDelta), r(a.equivalentSpreadDeltaBps, 0), r(a.collateralDelta), a.consentStillRequired])),
    reuse("company-alternatives-on-the-same-basis", [["giro-seis-meses", ["safra"], 190, false], ["finame-linha", ["embalagem"], null, false]],
      (p) => p.readings!.alternatives.map((a) => [a.id, a.usesCovered, r(a.allInSpreadDifferenceBps, 0), a.consentRequired])),
    reuse("facts-readings-recommendations-apart-without-verdict", {recommendations: ["address_indenture_consent_before_signing", "ask_longer_grace_and_tenor",
      "ask_lower_coverage_and_no_restricted_account", "separate_uses_by_term", "keep_price_discussion_secondary"], wouldChange: 5, verdict: false, process: {acceptsProposal: false, contactsLender: false, counterproposalSent: false}},
      (p) => ({recommendations: p.readings!.assessment.recommendations, wouldChange: p.readings!.assessment.wouldChange.length, verdict: Object.keys(p.readings!).includes("verdict"), process: p.readings!.process})),
    reuse("questions-for-the-lender-and-the-company", ["lender_covenant_definition", "reciprocity_expected_by_lender", "restricted_debtor_consent", "indenture_clause_wording", "other_free_asset"],
      (p) => p.readings!.questions),
    observe("market-below-threshold-is-a-gap-not-a-reading", packetInput(undefined, undefined, variant((k) => {k.market = {...k.market!, comparable: false};})),
      {status: "partial", position: null, gap: true}, (p) => ({status: p.status, position: p.readings!.price.marketPosition, gap: p.gaps.some((g) => g.operand.endsWith(".market"))})),
    // Review r1: a required covenant test missing leaves no conclusion of compliance.
    observe("missing-covenant-test-is-a-gap-not-compliance", packetInput(undefined, undefined, variant((k) => {
      k.covenant.measurements = k.covenant.measurements.filter((m) => !(m.scenario === "bank" && ["2026-12-31", "2027-12-31"].includes(m.date)));})),
      {status: "partial", anyBreachWith: null, missing: [["2026-12-31", "bank"], ["2027-12-31", "bank"]], reading: true},
      (p) => ({status: p.status, anyBreachWith: p.readings!.covenant.anyBreachWith, missing: p.readings!.covenant.missingTests.map((m) => [m.date, m.scenario]),
        reading: p.readings!.assessment.readings.includes("covenant_tests_missing")})),
    reuse("every-required-test-through-2028-is-present", {required: 10, missing: 0, anyBreachWith: true}, (p) => ({required: p.result.evaluation!.covenant.required.length,
      missing: p.readings!.covenant.missingTests.length, anyBreachWith: p.readings!.covenant.anyBreachWith})),
    // Review r1: the net figure is the simplified full-deduction convention, stated only with taxable profit in every period.
    reuse("net-cost-under-full-deduction-convention", {convention: "full_deductibility_simplified", net: 3.24}, (p) => ({convention: p.readings!.price.netConvention,
      net: r(new D(p.readings!.price.equivalentSpreadNet!).mul(100).toFixed(), 2)})),
    observe("net-cost-withheld-without-taxable-profit", packetInput(undefined, undefined, variant((k) => {k.calendar.taxable = k.calendar.taxable.map(() => false);})),
      {status: "partial", net: null, convention: "not_all_periods_taxable", gap: true}, (p) => ({status: p.status, net: p.readings!.price.equivalentSpreadNet,
        convention: p.readings!.price.netConvention, gap: p.gaps.some((g) => g.operand.endsWith(".calendar.taxable"))})),
    // Review r2: a limit with no test at all is a gap, never an error and never compliance.
    observe("limits-with-no-test-are-gaps", packetInput(undefined, undefined, variant((k) => {k.variants = []; k.covenant.measurements = [];})),
      {status: "partial", anyBreachWith: null, untested: ["indenture", "proposal", "board-policy"], missing: 10},
      (p) => ({status: p.status, anyBreachWith: p.readings!.covenant.anyBreachWith, untested: p.readings!.covenant.untestedLimits, missing: p.readings!.covenant.missingTests.length})),
    // Review r3: a lender test dated before the draw is contrast only, never a breach.
    observe("lender-date-before-the-draw-is-contrast-only", packetInput(undefined, undefined, variant((k) => {k.variants = []; k.covenant.policy = null;
      k.proposal.covenant = {...k.proposal.covenant!, testDates: ["2026-09-30", ...k.proposal.covenant!.testDates]};
      k.covenant.measurements = [...k.covenant.measurements, {date: "2026-09-30", scenario: "base", debt: "130", cash: "35", reportedEbitda: "30", definitionAdjustment: "-3"}];})),
      {anyBreachWith: false, beforeDraw: ["2026-09-30"], testedOnDate: false}, (p) => ({anyBreachWith: p.readings!.covenant.anyBreachWith, beforeDraw: p.readings!.covenant.lenderDatesBeforeDraw,
        testedOnDate: p.readings!.covenant.rows.find((x) => x.date === "2026-09-30")!.headroom.find((h) => h.limitId === "proposal")!.testedOnDate})),
    // Review r2: each structure on its own life; past the calendar only with an adopted hypothesis, never past the payoff.
    observe("life-past-the-fiscal-calendar-needs-an-adopted-hypothesis", packetInput(undefined, undefined, variant((k) => {k.tax.taxableAfterCalendar = null;})),
      {status: "partial", received: "life_beyond_fiscal_calendar", net: null, asks: ["life_beyond_fiscal_calendar", "life_beyond_fiscal_calendar", "life_beyond_fiscal_calendar"]},
      (p) => ({status: p.status, received: p.readings!.price.netConvention, net: p.readings!.price.equivalentSpreadNet, asks: p.readings!.asks.map((a) => a.netConvention)})),
    observe("period-after-payoff-never-counts", packetInput(undefined, undefined, variant((k) => {k.proposal.graceMonths = 0; k.proposal.installments = 3;
      k.calendar.taxable = k.calendar.taxable.map((_, i) => i < 9); k.variants = [{id: "curta", label: "Quitação em setembro de 2028", graceMonths: 0, installments: 23, coverage: "1.3", restrictedAccount: true}];})),
      {final: "2027-01-01", received: "full_deductibility_simplified", variantFinal: "2028-09-01", variant: "full_deductibility_simplified"},
      (p) => ({final: p.readings!.fit.finalPaymentDate, received: p.readings!.price.netConvention, variantFinal: p.result.evaluation!.variants[0]!.finalPaymentDate, variant: p.readings!.asks[0]!.netConvention})),
    // Review r1: an indexer nobody confirmed is asked, never assumed.
    (() => {
      const i = packetInput() as ReceivedProposalPacketInput & {analysis: {proposal: {indexer: {decisionId: string | null; missingReason: string | null}}}};
      i.analysis.proposal.indexer = {...i.analysis.proposal.indexer, decisionId: null, missingReason: "Indexador não confirmado no term sheet"};
      return observe("unconfirmed-indexer-is-asked", i, {status: "framed", openQuestions: ["indexer_confirmation"]}, (p) => ({status: p.status, openQuestions: p.openQuestions}));
    })(),
    (() => {
      const i = packetInput() as ReceivedProposalPacketInput & {analysis: {basket: {occupied: {decisionId: string | null; missingReason: string | null}}}};
      i.analysis.basket.occupied = {...i.analysis.basket.occupied, decisionId: null, missingReason: "Uso da exceção da escritura não informado"};
      return observe("absent-basket-usage-is-a-gap-not-zero", i, {status: "framed", gap: true}, (p) => ({status: p.status, gap: p.gaps.some((g) => g.reason === "Uso da exceção da escritura não informado")}));
    })(),
  ];
}

function adversarialCases(): Case[] {
  const attempts: [string, () => unknown, string][] = [
    ["tampered-envelope", () => {const i = packetInput(); i.analysis.envelope = {...i.analysis.envelope, canonical: i.analysis.envelope.canonical.replace('"18.56"', '"8.56"')}; return i;}, "adoption_basis_integrity_mismatch"],
    ["free-result-in-request", () => ({...packetInput(), evaluation: {collateral: {}}}), "Unrecognized key"],
    ["fabricated-grant-in-result", () => ({forge: "grantsExecution"}), "grantsExecution"],
    ["fabricated-verdict-in-readings", () => ({forge: "verdict"}), "Unrecognized key"],
    ["fabricated-acceptance-of-the-proposal", () => ({forge: "acceptsProposal"}), "acceptsProposal"],
    ["nominal-spread-offered-as-the-cost", () => ({forge: "costBasis"}), "Unrecognized key"],
    ["equivalent-spread-replaced-by-nominal-under-old-fingerprint", () => ({forge: "tamperReading"}), "received_proposal_fingerprint_mismatch"],
    ["adopted-cost-replaced-by-nominal-under-old-fingerprint", () => ({forge: "tamperResult"}), "received_proposal_fingerprint_mismatch"],
    ["tax-rate-above-one", () => packetInput((f) => {entry(f, "tax.rate").value = {type: "number", value: "1.5"};}), "received_proposal_tax_rate_out_of_domain"],
    ["tax-rate-just-above-one", () => packetInput((f) => {entry(f, "tax.rate").value = {type: "number", value: "1.00000000000000000001"};}), "received_proposal_tax_rate_out_of_domain"],
    ["covenant-test-in-an-undeclared-scenario", () => packetInput((f) => {entry(f, "covenant.scenarios").value = {type: "list", value: ["base", "base", "base", "base", "base", "stress", "bank", "bank", "bank", "bank"]};}), "received_proposal_covenant_scenario_undeclared"],
    // The exception read as empty while the Bradesco assignment sits in it.
    ["basket-read-as-empty-under-the-bradesco-assignment", () => packetInput((f) => {entry(f, "basket.occupied").value = {type: "number", value: "0"};}), "received_proposal_basket_usage_understated"],
    ["restricted-receivables-counted-as-free", () => {const i = packetInput(); (i.analysis.portfolio[0] as Record<string, unknown>).countRestricted = i.analysis.portfolio[0]!.pastDue; return i;}, "Unrecognized key"],
    ["free-bucket-placed-in-the-basket", () => packetInput((f) => {entry(f, "bucket.demais.countsAgainstBasket").value = {type: "boolean", value: true};}), "received_proposal_basket_flag_on_free_bucket"],
    ["assignment-without-holder", () => {const i = packetInput(); i.analysis.portfolio[1] = {...i.analysis.portfolio[1]!, holder: null}; return i;}, "received_proposal_encumbrance_holder"],
    ["indexer-other-than-cdi", () => packetInput((f) => {entry(f, "proposal.indexer").value = {type: "text", value: "ipca_plus"};}), "received_proposal_indexer_unsupported"],
    ["covenant-test-off-the-calendar", () => packetInput((f) => {entry(f, "covenant.dates").value = {type: "list", value: ["2026-11-30", "2027-06-30", "2027-12-31", "2028-06-30", "2028-12-31", "2026-12-31", "2027-06-30", "2027-12-31", "2028-06-30", "2028-12-31"]};}), "received_proposal_covenant_date_off_calendar"],
    ["reading-after-the-draw", () => packetInput((f) => {entry(f, "readingDate").value = {type: "date", value: "2026-10-15"};}), "received_proposal_reading_after_draw"],
    ["parallel-lists-of-different-length", () => packetInput((f) => {entry(f, "covenant.scenarios").value = {type: "list", value: ["base", "base", "base", "base", "base", "bank", "bank", "bank", "bank"]};}), "received_proposal_list_length_mismatch"],
    ["bullet-with-many-installments", () => packetInput((f) => {entry(f, "proposal.amortization").value = {type: "text", value: "bullet"};}), "received_proposal_bullet_single_installment"],
    ["market-range-out-of-order", () => packetInput((f) => {entry(f, "market.median").value = {type: "number", value: "0.025"};}), "received_proposal_market_range"],
    ["alternative-for-a-use-not-in-the-analysis", () => packetInput((f) => {entry(f, "alternative.finame-linha.usesCovered").value = {type: "list", value: ["fabrica"]};}), "received_proposal_alternative_uses"],
    ["figure-read-in-another-scenario", () => packetInput((f) => {entry(f, "bucket.rede-a.amount").dimensions.scenario = "adverse";}), "analysis_basis_context_mismatch"],
  ];
  return attempts.map(([id, build, message]) => {
    let observed: string, passed: boolean, input: unknown;
    try {
      input = build();
      const forge = (input as {forge?: string}).forge;
      if (forge) {
        const p = prepareReceivedProposalPacket(packetInput());
        const forged = forge === "grantsExecution" ? {...p, grantsExecution: true}
          : forge === "verdict" ? {...p, readings: {...p.readings!, verdict: "boa"}}
          : forge === "acceptsProposal" ? {...p, readings: {...p.readings!, process: {...p.readings!.process, acceptsProposal: true}}}
          : forge === "tamperReading" ? {...p, readings: {...p.readings!, price: {...p.readings!.price, equivalentSpread: p.readings!.price.nominalSpread}}}
          : forge === "tamperResult" ? {...p, result: {...p.result, evaluation: {...p.result.evaluation!, cost: {...p.result.evaluation!.cost, equivalentSpread: p.result.evaluation!.proposal.annualSpread}}}}
          : {...p, readings: {...p.readings!, price: {...p.readings!.price, costBasis: "nominal"}}};
        receivedProposalPacketOutputSchema.parse(forged);
      } else prepareReceivedProposalPacket(input);
      observed = "accepted"; passed = false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(message); observed = passed ? "rejected by expected boundary" : `unexpected error: ${detail.slice(0, 250)}`;
    }
    return {id, expectation: "rejected by expected boundary", observed, inputFingerprint: fingerprint(input ?? null), outputFingerprint: fingerprint({observed}), passed};
  });
}

function consistencyCases(): Case[] {
  const bare = () => packetInput(undefined, (i) => {i.analysis.variants = []; i.analysis.alternatives = [];});
  return [packetInput(), bare()].flatMap((input, fixtureIndex) => {
    const before = fingerprint(input), first = prepareReceivedProposalPacket(input);
    return Array.from({length: 3}, (_, repeat) => {
      const result = prepareReceivedProposalPacket(JSON.parse(JSON.stringify(input)));
      const passed = fingerprint(result) === fingerprint(first) && fingerprint(input) === before;
      return {id: `fixture-${fixtureIndex + 1}-repeat-${repeat + 1}`, expectation: "same inputs and versions reproduce all output bytes without mutation",
        observed: passed ? "same inputs and versions reproduce all output bytes without mutation" : "output or input changed", inputFingerprint: before, outputFingerprint: fingerprint(result), passed};
    });
  });
}

export function buildReceivedProposalRuns(): Evidence[] {
  return ([{kind: "gold", cases: goldCases()}, {kind: "adversarial", cases: adversarialCases()}, {kind: "consistency", cases: consistencyCases()}] as const).map(({kind, cases}) => {
    const evidence = {runId: receivedProposalRunIds[kind], kind, method: {id: "evaluate-received-proposal", version: receivedProposalMethodVersion},
      executor: {module: "@offroad/financial-model", exportName: "prepareReceivedProposalPacket"},
      harness: {module: "@offroad/financial-model/src/evaluate-received-proposal-runs.test-support.ts", exportName: "buildReceivedProposalRuns"},
      modelCalls: 0 as const, cases, result: cases.every((c) => c.passed) ? "pass" as const : "fail" as const};
    return {...evidence, evidenceFingerprint: deterministicRunEvidenceFingerprint(evidence),
      notes: "Synthetic deterministic execution calibrated on ficha 1 with the corrections of C32, A05 and C09; review r1, r2 and r3 findings on covenant coverage by limit, indexer origin, net cost convention per structure life, tax rate domain and fingerprint integrity. Numerical expectations do not constitute independent review, content approval, live access verification or publication."};
  });
}
