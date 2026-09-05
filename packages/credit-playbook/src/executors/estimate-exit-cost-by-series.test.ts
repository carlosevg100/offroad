import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {estimateExitCostBySeries, weekdaysBetween, type ExitCostInput} from "./estimate-exit-cost-by-series";

const exitDate = "2026-09-04";
const esc = (document: string, clause: string, page?: number) => (page ? {document, clause, page} : {document, clause});
const itr = (page: number, note: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, note});
const calendar = {document: "calendario_anbima_2026.csv", note: "dias úteis entre a data de saída e o vencimento, contados no calendário nacional"};
/** Camil at 04/09/2026. The nominal is the balance of 31/05/2026 updated to the exit date only where the base holds that figure; here the base holds the note's balances at 31/05, so the accrued remuneration at the exit date is absent and the price base is insufficient evidence, by design. */
const balance = (value: string) => ({value, asOf: exitDate, anchor: itr(39, "15: saldo de 31/05/2026 usado como nominal à data de saída, hipótese declarada")});
const camil = (withAccrued = false): ExitCostInput => ({
  exitDate,
  unit: "BRL thousand",
  series: [
    {id: "deb-13-1", label: "13ª 1ª série, Taxa DI", nominalAtExit: balance("306038"), accruedAtExit: withAccrued ? {value: "0", asOf: exitDate, anchor: {document: "hipotetico_pu.pdf", note: "hipótese: remuneração paga na data de saída"}} : null, chargesAtExit: null, anchor: esc("escritura_13a_emissao.pdf", "7.18"), mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", businessDays: {count: 504, maturity: "2028-11-16", anchor: calendar}, anchor: esc("escritura_13a_emissao.pdf", "7.18.1")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", businessDays: {count: 504, maturity: "2028-11-16", anchor: calendar}, anchor: esc("escritura_13a_emissao.pdf", "7.16.1")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-16", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.14")},
    ]},
    {id: "deb-15-1", label: "15ª 1ª série, Taxa DI", nominalAtExit: balance("770123"), accruedAtExit: withAccrued ? {value: "0", asOf: exitDate, anchor: {document: "hipotetico_pu.pdf"}} : null, chargesAtExit: null, anchor: esc("escritura_15a_emissao.pdf", "7.18"), mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2027-11-15", businessDays: {count: 1000, maturity: "2030-11-18", anchor: calendar}, anchor: esc("escritura_15a_emissao.pdf", "7.16.1.1")},
      {mechanism: "negotiated_offer", availableFrom: "2025-11-18", premium: null, requiresFullAdherence: false, anchor: esc("escritura_15a_emissao.pdf", "7.14")},
    ]},
    {id: "deb-13-2", label: "13ª 2ª série, IPCA", nominalAtExit: balance("282357"), accruedAtExit: withAccrued ? {value: "0", asOf: exitDate, anchor: {document: "hipotetico_pu.pdf"}} : null, chargesAtExit: null, anchor: esc("escritura_13a_emissao.pdf", "7.18.2"), mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2027-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", quote: null, presentValueAtQuote: null, anchor: esc("escritura_13a_emissao.pdf", "7.18.2.1")},
      {mechanism: "total_redemption_ipca", availableFrom: "2027-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", quote: null, presentValueAtQuote: null, anchor: esc("escritura_13a_emissao.pdf", "7.16.2")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-16", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.14")},
    ]},
    {id: "deb-11", label: "11ª emissão, CDI + 1,55%", nominalAtExit: balance("657779"), accruedAtExit: withAccrued ? {value: "0", asOf: exitDate, anchor: {document: "hipotetico_pu.pdf"}} : null, chargesAtExit: null, anchor: esc("escritura_11a_emissao.pdf", "4.14"), mechanisms: [
      {mechanism: "negotiated_offer", availableFrom: "2021-10-30", premium: null, requiresFullAdherence: true, anchor: esc("escritura_11a_emissao.pdf", "4.14.1")},
      {mechanism: "acquisition", availableFrom: null, anchor: esc("escritura_11a_emissao.pdf", "4.13")},
    ]},
  ],
});
const by = (result: ReturnType<typeof estimateExitCostBySeries>, id: string) => result.exit_costs.find((entry) => entry.series_id === id)!;
const route = (result: ReturnType<typeof estimateExitCostBySeries>, id: string, mechanism: string) => by(result, id).routes.find((entry) => entry.mechanism === mechanism)!;

describe("estimate-exit-cost-by-series executor (v3)", () => {
  it("gold: without the accrued remuneration at the exit date, every price base is insufficient evidence and no premium is invented", () => {
    const result = estimateExitCostBySeries(camil());
    expect(result.state).toBe("partial");
    for (const entry of result.exit_costs) {
      expect(entry.base.state).toBe("insufficient_evidence");
      expect(entry.base.payable).toBeNull();
      expect(entry.cheapest_unilateral).toBeNull();
    }
    expect(route(result, "deb-13-1", "extraordinary_amortization_di").state).toBe("insufficient_evidence");
    expect(route(result, "deb-15-1", "extraordinary_amortization_di").state).toBe("not_permitted");
    expect(route(result, "deb-15-1", "negotiated_offer").permitted_on_date).toBe(true);
    expect(route(result, "deb-11", "acquisition").state).toBe("price_at_counterparty");
    expect(result.uncovered_terms.map((term) => term.id)).toEqual(["base:deb-11", "base:deb-13-1", "base:deb-13-2", "base:deb-15-1"]);
    expect(result.totals.series_estimated).toBe(0);
  });

  it("hypothetical: with the base priced, the DI premium is [(1 + p)^(DU/252) - 1] times the base, truncated at eight decimals, and both DI mechanisms are shown apart", () => {
    const result = estimateExitCostBySeries(camil(true));
    const amortization = route(result, "deb-13-1", "extraordinary_amortization_di");
    const factor = new Decimal("1.004").pow(new Decimal(504).div(252)).minus(1);
    expect(amortization.premium).toBe(new Decimal("306038").times(factor).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(amortization.premium).toBe("2453.200608");
    expect(route(result, "deb-13-1", "total_redemption_di").premium).toBe(amortization.premium);
    expect(by(result, "deb-13-1").cheapest_unilateral).toEqual({mechanism: "extraordinary_amortization_di", total_payable: amortization.total_payable});
    expect(route(result, "deb-13-1", "negotiated_offer").state).toBe("base_priced_premium_open");
    expect(route(result, "deb-11", "negotiated_offer").reason).toMatch(/adherence of every holder/);
    expect(result.totals.series_estimated).toBe(1);
    expect(result.trace.calculations.find((calculation) => calculation.id === "structure.exit_premium:deb-13-1:extraordinary_amortization_di")?.operands.businessDays).toBe("504");
  });

  it("hypothetical: an IPCA extraordinary amortization pays the higher of the base and the present value at the second prior business day; a total redemption pays the present value at the prior day", () => {
    const base = camil(true);
    const priced: ExitCostInput = {...base, exitDate: "2027-06-01", series: base.series.filter((series) => series.id === "deb-13-2").map((series) => ({
      ...series,
      nominalAtExit: {...series.nominalAtExit!, asOf: "2027-06-01"}, accruedAtExit: {...series.accruedAtExit!, asOf: "2027-06-01"},
      mechanisms: [
        {mechanism: "extraordinary_amortization_ipca", availableFrom: "2027-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", quote: {rate: "0.0695", quoteDate: "2027-05-28", security: "NTN-B 2030", anchor: {document: "anbima_indicativa_hipotetica.csv"}}, presentValueAtQuote: {value: "290000", asOf: "2027-06-01", anchor: {document: "hipotetico_vp.pdf"}}, anchor: esc("escritura_13a_emissao.pdf", "7.18.2.1")},
        {mechanism: "total_redemption_ipca", availableFrom: "2027-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", quote: {rate: "0.0695", quoteDate: "2027-05-31", security: "NTN-B 2030", anchor: {document: "anbima_indicativa_hipotetica.csv"}}, presentValueAtQuote: {value: "280000", asOf: "2027-06-01", anchor: {document: "hipotetico_vp.pdf"}}, anchor: esc("escritura_13a_emissao.pdf", "7.16.2")},
      ],
    }))};
    const result = estimateExitCostBySeries(priced);
    expect(route(result, "deb-13-2", "extraordinary_amortization_ipca").total_payable).toBe("290000");
    expect(route(result, "deb-13-2", "extraordinary_amortization_ipca").premium).toBe("7643");
    expect(route(result, "deb-13-2", "total_redemption_ipca").total_payable).toBe("280000");
    expect(route(result, "deb-13-2", "total_redemption_ipca").premium).toBe("-2357");
    expect(by(result, "deb-13-2").cheapest_unilateral?.mechanism).toBe("total_redemption_ipca");
    expect(route(result, "deb-13-2", "extraordinary_amortization_ipca").quote?.quoteDate).toBe("2027-05-28");
  });

  it("refuses business days that do not fit the calendar, a quote on or after the exit date, an amount dated elsewhere, a negative premium, a duplicate mechanism and duplicate ids", () => {
    const base = camil(true);
    expect(weekdaysBetween("2026-09-04", "2029-06-14")).toBeLessThanOrEqual(724);
    expect(() => estimateExitCostBySeries({...base, series: [{...base.series[0]!, mechanisms: [{mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-06-15", businessDays: {count: 756, maturity: "2029-06-14", anchor: calendar}, anchor: esc("escritura_14a_emissao.pdf", "7.20")}]}]})).toThrow(/cannot fit/);
    expect(() => estimateExitCostBySeries({...base, series: [{...base.series[2]!, mechanisms: [{mechanism: "total_redemption_ipca", availableFrom: "2026-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", quote: {rate: "0.07", quoteDate: exitDate, security: "x", anchor: {document: "x"}}, presentValueAtQuote: {value: "1", asOf: exitDate, anchor: {document: "x"}}, anchor: esc("e", "1")}]}]})).toThrow(/must precede the exit date/);
    expect(() => estimateExitCostBySeries({...base, series: [{...base.series[0]!, nominalAtExit: {...base.series[0]!.nominalAtExit!, asOf: "2026-05-31"}}]})).toThrow(/not the base at the exit date/);
    expect(() => estimateExitCostBySeries({...base, series: [{...base.series[3]!, mechanisms: [{mechanism: "negotiated_offer", availableFrom: "2021-10-30", premium: {rate: "-0.01", anchor: {document: "x"}}, requiresFullAdherence: true, anchor: esc("e", "4.14")}]}]})).toThrow();
    expect(() => estimateExitCostBySeries({...base, series: [{...base.series[0]!, mechanisms: [base.series[0]!.mechanisms[0]!, base.series[0]!.mechanisms[0]!]}]})).toThrow(/listed twice/);
    expect(() => estimateExitCostBySeries({...base, series: [base.series[0]!, base.series[0]!]})).toThrow(/duplicate series/);
    expect(() => estimateExitCostBySeries({...base, unit: "R$ mil" as unknown as "BRL"})).toThrow();
  });

  it("returns zero with a reason when there is no series to retire", () => {
    const result = estimateExitCostBySeries({exitDate, unit: "BRL thousand", series: []});
    expect(result.state).toBe("empty");
    expect(result.totals.estimated_payable).toBe("0");
    expect(result.trace.calculations[0]?.id).toBe("structure.exit_cost:none");
  });

  it("is consistent under twenty permutations of series, mechanisms and object keys, with the trace in the fingerprint", () => {
    const first = estimateExitCostBySeries(camil(true));
    const permute = <T>(items: readonly T[], seed: number): T[] => { const copy = [...items]; let state = seed; for (let index = copy.length - 1; index > 0; index -= 1) { state = (state * 1103515245 + 12345) % 2147483648; const swap = state % (index + 1); [copy[index], copy[swap]] = [copy[swap]!, copy[index]!]; } return copy; };
    const reorderKeys = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil(true);
      const shuffled: ExitCostInput = {...base, series: permute(base.series, seed).map((series) => reorderKeys({...series, mechanisms: permute(series.mechanisms, seed + 1).map(reorderKeys)}))};
      const again = estimateExitCostBySeries(seed % 2 ? reorderKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
