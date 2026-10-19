import {describe, expect, it} from "vitest";
import {buildFinancingComparisonPremiseProposal, completeFinancingComparisonFacts, proposeFinancingComparisonPremisesForTurn,
  shouldProposeFinancingComparisonPremises, type FinancingComparisonExtraction} from "./financing-comparison-premises-proposal";
import {uuidV5} from "./investment-premises-proposal";

const none = {value: null, origin: null, source: null};
const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
const ends = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
const ebitda = ["13.5", "14", "14", "14", "14.3", "14.3", "14.7", "14.7", "14.7", "14.7"];
/** Turn 1 of ficha C02: three term sheets and the company's table of debt and projection. */
function c02Extraction(): FinancingComparisonExtraction {
  const proposal = (label: string, spread: number, fee: number, creditTax: boolean, first: string, installments: number, every: number, coupon: number, share: number, limit: number, leases: boolean,
    frequency: "semiannual" | "annual", waiver: boolean) => ({label, amount: doc("70", `ts-${label}.pdf`), annualSpread: doc(spread, `ts-${label}.pdf`), feeRate: doc(fee, `ts-${label}.pdf`),
    creditTax: doc(creditTax, `ts-${label}.pdf`), drawMonth: doc("2027-01", `ts-${label}.pdf`), firstAmortizationMonth: doc(first, `ts-${label}.pdf`),
    installments: doc(installments, `ts-${label}.pdf`), installmentEveryMonths: doc(every, `ts-${label}.pdf`), couponEveryMonths: doc(coupon, `ts-${label}.pdf`),
    collateralShareOfLoan: doc(share, `ts-${label}.pdf`), covenantLimit: doc(limit, `ts-${label}.pdf`), covenantLeasesInDebt: doc(leases, `ts-${label}.pdf`),
    covenantEbitdaExcludesLeases: doc(!leases, `ts-${label}.pdf`),
    covenantTestFrequency: doc(frequency, `ts-${label}.pdf`), covenantDescription: null, waiverRequired: doc(waiver, `ts-${label}.pdf`),
    waiverCreditor: waiver ? doc("Debênture 2021", `ts-${label}.pdf`) : none, waiverMonth: waiver ? doc("2026-12", `ts-${label}.pdf`) : none,
    waiverCost: waiver ? informed("0.525", "assembleia da debênture de 2021") : none, drawDate: doc("2027-01-15", `ts-${label}.pdf`), paymentDay: doc(15, `ts-${label}.pdf`)});
  return {needSituation: informed("seasonal-working-capital" as const, "alongar os vencimentos de 2027"),
    proposals: [proposal("itau", 0.023, 0.01, true, "2028-07", 8, 6, 3, 0.4, 3, true, "semiannual", true),
      proposal("santander", 0.0255, 0.008, true, "2029-07", 6, 6, 3, 0.3, 3, false, "annual", true),
      proposal("fundo", 0.031, 0.015, false, "2031-01", 2, 12, 6, 0, 2.75, false, "semiannual", false)],
    company: {quarters: doc(ends.map((quarterEnd, q) => ({quarterEnd, ebitda: ebitda[q]!, leasePayments: "0.75", depreciation: "3",
      workingCapitalCashFlow: String(-0.625 + ([1, 5, 9].includes(q) ? -25 : 0) + ([2, 6].includes(q) ? 25 : 0)), maintenanceCapex: "2", growthCapex: "0"})), "projecao-trimestral.xlsx"),
      previousQuarters: doc([{period: "1T26", ebitda: "13.5", leasePayments: "0.75"}, {period: "2T26", ebitda: "13.5", leasePayments: "0.75"}], "gerencial"),
      openingCash: doc("35", "gerencial"), cashTaxRate: informed(0.34, "lucro real"), minimumCash: informed("15", "caixa mínimo de 15"),
      receivablesPool: doc("58", "gerencial"), leaseLiability: doc("8", "demonstrações")},
    existingDebt: doc([
      {label: "Debênture 2021", openingPrincipal: "60", rateKind: "floating", annualRate: 0.024, averagePrincipalCoupon: false, couponEveryMonths: 6,
        draws: [], amortizations: ["2026-12", "2027-06", "2027-12", "2028-06"].map((month) => ({month, amount: "15"})), prepayments: [], charges: []},
      {label: "CCB Bradesco", openingPrincipal: "40", rateKind: "floating", annualRate: 0.026, averagePrincipalCoupon: false, couponEveryMonths: 3,
        draws: [], amortizations: [], prepayments: [{month: "2027-01", amount: "40"}], charges: [{label: "prêmio", kind: "premium", month: "2027-01", amount: "0.4"}]},
    ], "tabela de dívida"),
    indexCurve: doc([{year: 2026, annualRate: 0.149}, {year: 2027, annualRate: 0.14}, {year: 2028, annualRate: 0.1275}, {year: 2029, annualRate: 0.12}], "curva DI"),
  };
}
const comparisonId = uuidV5("offroad:financing-comparison:30000000-0000-4000-8000-000000000711");
const ids = {comparisonId, entityId: comparisonId, definitionVersionId: comparisonId};

describe("financing comparison premises proposed from a turn", () => {
  it("recognizes a choice between offers for the same need", () => {
    expect(shouldProposeFinancingComparisonPremises("Recebemos propostas do Itaú, do Santander e de um fundo para os R$ 70 milhões. Qual eu fico?", true)).toBe(true);
    expect(shouldProposeFinancingComparisonPremises("Quanto vence em 2027?", false)).toBe(false);
  });
  it("maps months to the quarter grid and the installments to quarters after the draw", () => {
    const c = completeFinancingComparisonFacts({extraction: c02Extraction(), ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error(c.missing.join(","));
    const [itau, santander, fundo] = c.facts.proposals.map((p) => p.value);
    expect([itau!.drawQuarter, itau!.amortizationQuarters, santander!.amortizationQuarters, fundo!.amortizationQuarters, fundo!.couponEveryQuarters])
      .toEqual([2, [6, 8, 10, 12, 14, 16, 18, 20], [10, 12, 14, 16, 18, 20], [16, 20], 2]);
    expect(c.facts.existingDebt.value[0]!.amortization.map((a) => a.quarter)).toEqual([1, 3, 5, 7]);
    expect(c.facts.existingDebt.value[0]!.accruedPaymentQuarters).toEqual([1, 3, 5, 7, 9]);
    expect(c.facts.openingDate).toBe("2026-06-30");
    expect(itau!.contractDates).toEqual({drawDate: "2027-01-15", paymentDay: 15});
    expect(c.housePremiseKeys.sort()).toEqual(["creditTax", "stress", "waiverDeductibility"]);
  });
  it("asks for what nobody stated instead of inventing it", () => {
    const e = c02Extraction(); e.proposals[2]!.feeRate = none; e.company.cashTaxRate = none;
    expect(completeFinancingComparisonFacts({extraction: e, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["company.cashTaxRate", "proposals.3.feeRate"]});
  });
  it("builds a proposal whose hypotheses carry origin and no identity until the person confirms", () => {
    const c = completeFinancingComparisonFacts({extraction: c02Extraction(), ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error("expected complete");
    const p = buildFinancingComparisonPremiseProposal(c.facts, c.situationId);
    expect(p.methodId).toBe("compare-financing-proposals"); expect(p.hypotheses.length).toBeLessThanOrEqual(256);
    expect(p.hypotheses.every((h) => h.dimensions.entityId === null && h.fieldPath.startsWith(`comparison.${comparisonId}.`) && /^Origem: /.test(h.reason))).toBe(true);
    expect(p.fingerprint).toBe(buildFinancingComparisonPremiseProposal(c.facts, c.situationId).fingerprint);
    expect(p.summary.situationId).toBe("seasonal-working-capital");
  });
  it("never infers a contract clause: EBITDA definition, the consenting creditor and a half pair of dates are gaps", () => {
    const e = c02Extraction(); e.proposals[0]!.covenantEbitdaExcludesLeases = none;
    expect(completeFinancingComparisonFacts({extraction: e, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["proposals.1.covenantEbitdaExcludesLeases"]});
    const g = c02Extraction(); g.proposals[0]!.waiverCreditor = doc("Credor inexistente", "ts-itau.pdf");
    expect(completeFinancingComparisonFacts({extraction: g, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["proposals.1.waiverCreditor"]});
    const h = c02Extraction(); h.proposals[1]!.paymentDay = none;
    expect(completeFinancingComparisonFacts({extraction: h, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["proposals.2.paymentDay"]});
    const m = c02Extraction(); m.proposals[0]!.firstAmortizationMonth = doc("2028-08", "ts-itau.pdf");
    expect(completeFinancingComparisonFacts({extraction: m, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["proposals.1.firstAmortizationMonth"]});
    const d = c02Extraction(); d.proposals[1]!.drawDate = doc("2027-02-15", "ts-santander.pdf");
    expect(completeFinancingComparisonFacts({extraction: d, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["proposals.2.drawDate"]});
    const z = c02Extraction(); z.proposals[2]!.feeRate = doc(0, "ts-fundo.pdf");
    const zc = completeFinancingComparisonFacts({extraction: z, ids, currency: "BRL"});
    if (zc.status !== "complete") throw new Error(zc.missing.join(","));
    expect(buildFinancingComparisonPremiseProposal(zc.facts, zc.situationId).hypotheses.some((x) => x.fieldPath.endsWith("charges.chargeIds") && (x.value.value as string[]).includes("fundo-fee"))).toBe(false);
  });
  it("keeps each clause's own origin and refuses a coupon period off whole quarters", () => {
    const c = completeFinancingComparisonFacts({extraction: c02Extraction(), ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error("expected complete");
    const p = buildFinancingComparisonPremiseProposal(c.facts, c.situationId);
    const charges = p.hypotheses.find((h) => h.fieldPath.endsWith(`proposal.${c.facts.proposals[0]!.value.id}.charges.chargeIds`))!;
    expect(charges.reason).toContain("waiver, informado (assembleia da debênture de 2021)");
    expect(charges.reason).toContain("comissão, documento (ts-itau.pdf)");
    expect(charges.reason.startsWith("Origem: ")).toBe(true);
    const e = c02Extraction(); e.existingDebt.value![0]!.couponEveryMonths = 5;
    expect(completeFinancingComparisonFacts({extraction: e, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["existingDebt.1.couponEveryMonths"]});
  });
  it("never fails the turn", async () => {
    const events: string[] = [];
    const base = {message: "Chegaram três term sheets. Qual é a melhor?", hasAttachments: true, recentUserMessages: [], projectId: "30000000-0000-4000-8000-000000000711",
      loadEvidence: async () => [], log: (event: string) => {events.push(event);}};
    expect(await proposeFinancingComparisonPremisesForTurn({...base, extract: async () => {throw new Error("down");}})).toBeNull();
    expect((await proposeFinancingComparisonPremisesForTurn({...base, extract: async () => c02Extraction()}))?.forAdvisor.status).toBe("proposed");
    expect(events).toEqual(["comparison_premises.failed", "comparison_premises.proposed"]);
  });
});
