import {describe, expect, it} from "vitest";
import {prepareReceivedProposalPacket, receivedProposalPacketOutputSchema} from "./evaluate-received-proposal-packet";
import {calculateAdoptedReceivedProposal} from "./adopted-evaluate-received-proposal";
import {adoptedReceivedProposalOutputSchema} from "./evaluate-received-proposal-results";
import {receivedProposalPacketExecutorContracts} from "./evaluate-received-proposal-contracts";
import {auroraReceivedProposal, auroraReceivedProposalBasis, receivedProposalQuestion as question} from "./evaluate-received-proposal.test-support";

const packet = (k = auroraReceivedProposal()) => prepareReceivedProposalPacket({schemaVersion: "received-proposal-packet-input.v1", question, analysis: auroraReceivedProposalBasis(k).seal()});
const n = (v: string | null | undefined, p = 1) => Number(v).toFixed(p);
describe("received proposal packet", {timeout: 180_000}, () => {
  const p = packet(), r = p.readings!;
  it("leads with firmness and the year the calendar already concentrates", () => {
    expect(r.firmness).toEqual({firmness: "indicative", validUntil: "2026-09-13", bankSawIndenture: false, diligenceMayReopenStructure: true});
    expect([r.liquidity.peakYear, n(r.liquidity.existingService), n(r.liquidity.proposalService), n(r.liquidity.availableForService), r.liquidity.peakQuarter, r.liquidity.firstBelowPolicyWith])
      .toEqual([2027, "89.7", "12.2", "35.7", "2027-09-30", "2027-09-30"]);
    expect(p.status).toBe("prepared_for_human_review");
  });
  it("reads collateral against the assignable portfolio and the aggregate basket", () => {
    expect([r.collateral.required, r.collateral.nominallyFree, r.collateral.assignable, r.collateral.shortfallToAssignable]).toEqual(["39", "46", "25.41", "13.59"]);
    expect(r.collateral.excluded.map((x) => x.id)).toEqual(["rede-a", "redes-c-d", "vencidos"]);
    expect([r.negativePledge.remaining, r.negativePledge.excess, r.negativePledge.consentRequired, r.negativePledge.consentBy]).toEqual(["3", "36", true, "2026-09-13"]);
  });
  it("keeps facts, readings and recommendations apart, with what would change them and no verdict", () => {
    expect(r.assessment).toEqual({
      facts: ["proposal_indicative", "collateral_exceeds_assignable_portfolio", "assignment_prohibited_receivables_excluded", "indenture_consent_required",
        "peak_year_service_exceeds_available_cash", "cash_below_minimum_with_proposal", "board_policy_breached_in_a_case", "lender_tests_more_often_than_indenture",
        "restricted_account_requested", "coverage_at_top_of_reference"],
      readings: ["term_longer_than_seasonal_use", "term_shorter_than_capex_use", "all_in_cost_well_above_nominal", "nominal_spread_above_median_within_range",
        "improvement_partly_paid_in_collateral", "diligence_may_reopen_structure"],
      recommendations: ["address_indenture_consent_before_signing", "ask_longer_grace_and_tenor", "ask_lower_coverage_and_no_restricted_account", "separate_uses_by_term", "keep_price_discussion_secondary"],
      wouldChange: ["debtor_consent_for_restricted_receivables", "indenture_clause_wording", "other_free_asset_for_collateral", "seasonal_need_above_adopted", "committed_terms_after_diligence"]});
    expect(r.questions).toEqual(["lender_covenant_definition", "reciprocity_expected_by_lender", "restricted_debtor_consent", "indenture_clause_wording", "other_free_asset"]);
    expect(Object.keys(r)).not.toContain("verdict");
  });
  it("prices the asks and puts the nominal spread and the cost over the life side by side", () => {
    expect([n(r.price.nominalSpread, 4), n(r.price.equivalentSpread, 4), n(r.price.equivalentSpreadNet, 4), r.price.marketPosition]).toEqual(["0.0210", "0.0490", "0.0324", "above_median_within_range"]);
    expect(r.asks.map((a) => [a.id, n(a.peakYearServiceDelta), a.consentStillRequired])).toEqual([["carencia-12-prazo-48", "-6.0", true], ["carencia-12-prazo-60", "-6.4", true], ["cobertura-120-sem-conta", "0.0", true]]);
  });
  it("does not conclude compliance with a required covenant test missing", () => {
    expect([r.covenant.anyBreachWith, r.covenant.missingTests]).toEqual([true, []]);
    const k = auroraReceivedProposal(); k.covenant.measurements = k.covenant.measurements.filter((m) => !(m.scenario === "bank" && ["2026-12-31", "2027-12-31"].includes(m.date)));
    const q = packet(k);
    expect([q.status, q.readings!.covenant.anyBreachWith, q.readings!.assessment.readings.includes("covenant_tests_missing"), q.gaps.filter((g) => g.operand.includes(".covenant.bank.")).length]).toEqual(["partial", null, true, 2]);
  });
  it("conditions the net cost on taxable profit in every period", () => {
    expect(r.price.netConvention).toBe("full_deductibility_simplified");
    const k = auroraReceivedProposal(); k.calendar.taxable = k.calendar.taxable.map(() => false);
    const q = packet(k);
    expect([q.status, q.readings!.price.equivalentSpreadNet, q.readings!.price.netConvention, q.gaps.some((g) => g.operand.endsWith(".calendar.taxable"))]).toEqual(["partial", null, "not_all_periods_taxable", true]);
  });
  it("refuses a changed value under the old fingerprint, in the packet and in the adopted result", () => {
    expect(() => receivedProposalPacketOutputSchema.parse({...p, readings: {...r, price: {...r.price, equivalentSpread: r.price.nominalSpread}}})).toThrow("received_proposal_fingerprint_mismatch");
    const ev = p.result.evaluation!;
    expect(() => receivedProposalPacketOutputSchema.parse({...p, result: {...p.result, evaluation: {...ev, cost: {...ev.cost, equivalentSpread: ev.proposal.annualSpread}}}})).toThrow("received_proposal_fingerprint_mismatch");
    expect(receivedProposalPacketOutputSchema.parse(JSON.parse(JSON.stringify(p))).fingerprint).toBe(p.fingerprint);
  });
  it("turns a limit with no test at all into gaps, for each limit and for all of them", () => {
    // Without the December tests the indenture and the policy are untested; without any, the lender too.
    for (const [drop, untested] of [[["2026-12-31", "2027-12-31", "2028-12-31"], ["indenture", "board-policy"]],
      [["2026-12-31", "2027-06-30", "2027-12-31", "2028-06-30", "2028-12-31"], ["indenture", "proposal", "board-policy"]]] as const) {
      const k = auroraReceivedProposal(); k.variants = [];
      k.covenant.measurements = k.covenant.measurements.filter((m) => !(drop as readonly string[]).includes(m.date));
      const q = packet(k);
      expect([q.status, q.readings!.covenant.anyBreachWith, q.readings!.covenant.untestedLimits]).toEqual(["partial", null, untested]);
      expect(untested.every((l) => q.gaps.some((g) => g.operand.endsWith(`.covenant.limit.${l}`)))).toBe(true);
    }
  });
  it("does not state the net cost for a life past the fiscal calendar without an adopted hypothesis", () => {
    const k = auroraReceivedProposal(); k.tax.taxableAfterCalendar = null;
    const q = packet(k);
    expect([q.status, q.readings!.price.netConvention, q.readings!.price.equivalentSpreadNet, q.readings!.asks.map((a) => a.netConvention)])
      .toEqual(["partial", "life_beyond_fiscal_calendar", null, ["life_beyond_fiscal_calendar", "life_beyond_fiscal_calendar", "life_beyond_fiscal_calendar"]]);
    expect(q.gaps.filter((g) => g.operand.endsWith(".tax.taxableAfterCalendar") || g.operand.endsWith(".net")).length).toBe(4);
  });
  it("refuses a tax rate above one in the adopted reader, by decimal comparison", () => {
    for (const rate of ["1.5", "1.00000000000000000001"]) {const k = auroraReceivedProposal(); k.tax.rate = rate; expect(() => packet(k)).toThrow("received_proposal_tax_rate_out_of_domain");}
    // The reader refuses it on its own, even when another operand is missing and the kernel never runs.
    const f = auroraReceivedProposalBasis({...auroraReceivedProposal(), tax: {regime: "lucro_real", rate: "1.00000000000000000001", taxableAfterCalendar: true}});
    const i = f.seal(); i.basket = {...i.basket, occupied: {...i.basket.occupied, decisionId: null, missingReason: "Ausente"}};
    expect(() => calculateAdoptedReceivedProposal(i)).toThrow("received_proposal_tax_rate_out_of_domain");
  });
  it("is partial without a comparable market and deterministic, validated and published", () => {
    const k = auroraReceivedProposal(); k.market = {...k.market!, comparable: false};
    const q = packet(k);
    expect([q.status, q.readings!.price.marketPosition, q.readings!.assessment.recommendations.includes("keep_price_discussion_secondary")]).toEqual(["partial", null, false]);
    expect(packet().fingerprint).toBe(p.fingerprint);
    expect(adoptedReceivedProposalOutputSchema.parse(calculateAdoptedReceivedProposal(auroraReceivedProposalBasis().seal())).status).toBe("partial_composition");
    expect(receivedProposalPacketExecutorContracts().executor).toEqual({module: "@offroad/financial-model", exportName: "prepareReceivedProposalPacket", version: "2026.10.27-v1"});
  });
});
