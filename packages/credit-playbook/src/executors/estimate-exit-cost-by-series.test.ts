import {presentValueByBusinessDays} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {estimateExitCostBySeries, weekdaysBetween, type ExitCostInput} from "./estimate-exit-cost-by-series";

const d = (value: Decimal.Value) => new Decimal(value);
const exitDate = "2026-09-04";
const documents: ExitCostInput["documents"] = [
  {name: "escritura_11a_emissao.pdf", kind: "indenture"}, {name: "escritura_13a_emissao.pdf", kind: "indenture"}, {name: "escritura_14a_emissao.pdf", kind: "indenture"}, {name: "escritura_15a_emissao.pdf", kind: "indenture"},
  {name: "01_ITR_1T26_31mai2026.pdf", kind: "itr"}, {name: "calendario_anbima_2026.csv", kind: "calendar"}, {name: "anbima_ntnb_2026-09-02.csv", kind: "quote"}, {name: "b3_pre_di_2026-09-03.csv", kind: "quote"}, {name: "fixture_hipotetico.md", kind: "other"},
];
const calendar = (maturity: string) => ({document: "calendario_anbima_2026.csv", note: `weekday count to ${maturity}; the ANBIMA holidays reduce it, so the count is an upper bound until the calendar file enters the corpus`});
const esc = (document: string, clause: string) => ({document, clause});
/**
 * Camil at 04/09/2026: the ITR holds the 31/05/2026 balances, not the nominal, accrued remuneration
 * and charges at the exit date, so every base is insufficient evidence. The mechanisms are the ones
 * the indentures write: the 13th's DI series may be amortized or redeemed at 0,40% a year pro rata
 * since 14/05/2026 and its holders may receive an offer since the issue date, 15/11/2023; the 14th's
 * first series matures 14/06/2029; the 15th's since 15/11/2025 and matures 14/11/2030.
 */
const camil = (): ExitCostInput => ({
  exitDate, unit: "BRL thousand", documents,
  series: [
    {id: "deb-11-1", label: "11ª emissão, 1ª série", indenture: esc("escritura_11a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [
      {mechanism: "negotiated_offer", availableFrom: "2021-11-15", premium: null, requiresFullAdherence: true, anchor: esc("escritura_11a_emissao.pdf", "4.14")},
      {mechanism: "acquisition", availableFrom: null, anchor: esc("escritura_11a_emissao.pdf", "4.15")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-13-1", label: "13ª emissão, 1ª série (DI + 0,65%)", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", maxFraction: "0.98", fraction: "0.98", businessDays: {count: weekdaysBetween(exitDate, "2028-11-14"), maturity: "2028-11-14", anchor: calendar("2028-11-14")}, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", businessDays: {count: weekdaysBetween(exitDate, "2028-11-14"), maturity: "2028-11-14", anchor: calendar("2028-11-14")}, anchor: esc("escritura_13a_emissao.pdf", "7.19")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.21")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-13-2", label: "13ª emissão, 2ª série (IPCA + 6,3416%)", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2027-05-14", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2027-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: null, anchor: esc("escritura_13a_emissao.pdf", "7.19")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.21")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-15-1", label: "15ª emissão, 1ª série (DI)", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, mechanisms: [
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2027-11-15", businessDays: {count: weekdaysBetween(exitDate, "2030-11-14"), maturity: "2030-11-14", anchor: calendar("2030-11-14")}, anchor: esc("escritura_15a_emissao.pdf", "7.14")},
      {mechanism: "negotiated_offer", availableFrom: "2025-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_15a_emissao.pdf", "7.14.1")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
  ],
});
/** Hypothetical priced series (not Camil): every base component dated at the exit and anchored to the fixture note. */
const hypo = (document = "fixture_hipotetico.md") => ({document, note: "fixture hipotético, não é evidência gold"});
const dated = (value: string) => ({value, asOf: exitDate, anchor: hypo()});
const flows = [
  {id: "coupon-2027", date: "2027-03-04", amount: "6", businessDaysFromExit: 125, anchor: hypo()},
  {id: "principal-2027", date: "2027-09-06", amount: "106", businessDaysFromExit: 252, anchor: hypo()},
];
const priced = (): ExitCostInput => ({
  exitDate, unit: "BRL thousand", documents,
  series: [
    {id: "h-di", label: "hipotética DI", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "unit_value_x_quantity", anchor: hypo()}, accruedAtExit: dated("1.5"), chargesAtExit: dated("0"), remainingFlows: null, mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-01-01", maxFraction: "0.98", fraction: "0.98", businessDays: {count: 504, maturity: "2028-09-04", anchor: calendar("2028-09-04")}, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2026-01-01", businessDays: {count: 504, maturity: "2028-09-04", anchor: calendar("2028-09-04")}, anchor: esc("escritura_13a_emissao.pdf", "7.19")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: {rate: "0.01", anchor: hypo()}, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.21")},
    ], anchor: hypo()},
    {id: "h-ipca-13", label: "hipotética IPCA, regra da 13ª", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "unit_value_x_quantity_updated", anchor: hypo()}, accruedAtExit: dated("1"), chargesAtExit: dated("0"), remainingFlows: flows, mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2026-01-01", maxFraction: "0.98", fraction: "0.50", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: {rate: "0.07", quoteDate: "2026-09-02", businessDaysBeforeExit: 2, security: "NTN-B 2027-08-15", anchor: hypo("anbima_ntnb_2026-09-02.csv")}, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2026-01-01", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: {rate: "0.07", quoteDate: "2026-09-03", businessDaysBeforeExit: 1, security: "NTN-B 2027-08-15", anchor: hypo("anbima_ntnb_2026-09-02.csv")}, anchor: esc("escritura_13a_emissao.pdf", "7.19")},
    ], anchor: hypo()},
    {id: "h-ipca-14", label: "hipotética IPCA, regra da 14ª e da 15ª", indenture: esc("escritura_14a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "trustee_report_at_exit_date", anchor: hypo()}, accruedAtExit: dated("1"), chargesAtExit: dated("0"), remainingFlows: flows, mechanisms: [
      {mechanism: "total_redemption_ipca", availableFrom: "2026-01-01", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: {rate: "0.07", quoteDate: "2026-09-02", businessDaysBeforeExit: 2, security: "NTN-B 2027-08-15", anchor: hypo("anbima_ntnb_2026-09-02.csv")}, anchor: esc("escritura_14a_emissao.pdf", "7.19")},
    ], anchor: hypo()},
    {id: "h-pre", label: "hipotética prefixada, regra da 15ª", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "unit_value_x_quantity", anchor: hypo()}, accruedAtExit: dated("2"), chargesAtExit: dated("0.1"), remainingFlows: flows, mechanisms: [
      {mechanism: "total_redemption_pre", availableFrom: "2026-01-01", referenceRate: "B3 Pre x DI curve (nearest vertex to remaining duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: {rate: "0.02", quoteDate: "2026-09-02", businessDaysBeforeExit: 2, security: "Pre x DI, vértice 252", anchor: hypo("b3_pre_di_2026-09-03.csv")}, anchor: esc("escritura_15a_emissao.pdf", "7.14")},
    ], anchor: hypo()},
  ],
});
const series = (result: ReturnType<typeof estimateExitCostBySeries>, id: string) => result.exit_costs.find((entry) => entry.series_id === id)!;
const route = (result: ReturnType<typeof estimateExitCostBySeries>, id: string, mechanism: string) => series(result, id).routes.find((entry) => entry.mechanism === mechanism)!;

describe("estimate-exit-cost-by-series executor (v4)", () => {
  it("gold: without the nominal, accrued and charges at the exit date every base is insufficient evidence, and the routes keep their availability on the date", () => {
    const result = estimateExitCostBySeries(camil());
    expect(result.schema_version).toBe("method.estimate-exit-cost-by-series.v4");
    expect(result.state).toBe("partial");
    expect(result.exit_costs.every((entry) => entry.base.state === "insufficient_evidence" && entry.cheapest_full_exit === null)).toBe(true);
    expect(result.uncovered_terms.map((term) => term.id)).toEqual(["base:deb-11-1", "base:deb-13-1", "base:deb-13-2", "base:deb-15-1"]);
    expect(route(result, "deb-13-1", "total_redemption_di").permitted_on_date).toBe(true);
    expect(route(result, "deb-13-1", "total_redemption_di").state).toBe("insufficient_evidence");
    expect(route(result, "deb-13-2", "total_redemption_ipca").state).toBe("not_permitted");
    expect(route(result, "deb-13-2", "negotiated_offer").permitted_on_date).toBe(true);
    expect(route(result, "deb-15-1", "total_redemption_di").state).toBe("not_permitted");
    expect(route(result, "deb-15-1", "negotiated_offer").available_from).toBe("2025-11-15");
    expect(route(result, "deb-11-1", "acquisition").state).toBe("price_at_counterparty");
    expect(result.totals).toEqual({estimated_premium: "0", estimated_payable: "0", series_estimated: 0, series_open: 4});
  });

  it("hypothetical DI: the premium is [(1 + p)^(DU/252) - 1] over the amount retired, truncated at eight decimals; the 98% amortization never competes as a full exit", () => {
    const result = estimateExitCostBySeries(priced());
    const base = d("101.5");
    const factor = d("1.004").pow(d(504).div(252)).minus(1);
    const total = route(result, "h-di", "total_redemption_di");
    expect(total.premium).toBe(base.times(factor).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(total.premium).toBe("0.813624");
    expect(total.scope).toBe("full");
    const partial = route(result, "h-di", "extraordinary_amortization_di");
    expect(partial.scope).toBe("partial");
    expect(partial.amount_retired).toBe(base.times("0.98").toFixed());
    expect(partial.premium).toBe(base.times("0.98").times(factor).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed());
    expect(d(partial.total_payable!).lt(total.total_payable!)).toBe(true);
    expect(series(result, "h-di").cheapest_full_exit).toEqual({mechanism: "total_redemption_di", total_payable: total.total_payable});
    expect(route(result, "h-di", "negotiated_offer").premium).toBe("1.015");
  });

  it("hypothetical IPCA: the 13th's amortization pays max(updated value, present value) at the second prior day's quote and its redemption pays the present value only at the prior day's quote; the 14th's redemption keeps the floor", () => {
    const result = estimateExitCostBySeries(priced());
    const present = presentValueByBusinessDays(flows.map((flow) => ({id: flow.id, amount: flow.amount, businessDays: flow.businessDaysFromExit})), "0.07");
    const amortization = route(result, "h-ipca-13", "extraordinary_amortization_ipca");
    expect(amortization.present_value?.value).toBe(d(present.value).times("0.50").toDecimalPlaces(8).toFixed());
    expect(amortization.total_payable).toBe(Decimal.max(d("101").times("0.50"), d(present.value).times("0.50")).toDecimalPlaces(8).toFixed());
    const redemption13 = route(result, "h-ipca-13", "total_redemption_ipca");
    expect(redemption13.total_payable).toBe(present.value);
    expect(redemption13.quote?.businessDaysBeforeExit).toBe(1);
    const redemption14 = route(result, "h-ipca-14", "total_redemption_ipca");
    expect(redemption14.total_payable).toBe(Decimal.max(d("101"), d(present.value)).toDecimalPlaces(8).toFixed());
    expect(series(result, "h-ipca-14").cheapest_full_exit?.mechanism).toBe("total_redemption_ipca");
    expect(result.trace.calculations.some((calculation) => calculation.id === "financial.macaulay_duration_business_days:h-ipca-14:total_redemption_ipca" && calculation.unit === "business days")).toBe(true);
    const pre = route(result, "h-pre", "total_redemption_pre");
    expect(pre.state).toBe("estimated");
    expect(pre.quote?.security).toBe("Pre x DI, vértice 252");
  });

  it("refuses a quote of the wrong contractual day, a make-whole without flows, a base without explicit charges, and a series without an indenture", () => {
    const wrongDay = priced();
    (wrongDay.series[2]!.mechanisms[0] as {quote: {businessDaysBeforeExit: number}}).quote.businessDaysBeforeExit = 1;
    expect(route(estimateExitCostBySeries(wrongDay), "h-ipca-14", "total_redemption_ipca").reason).toMatch(/1 business days before the exit; the series requires the second business day/);
    const noFlows = priced();
    noFlows.series[2]!.remainingFlows = null;
    expect(route(estimateExitCostBySeries(noFlows), "h-ipca-14", "total_redemption_ipca").reason).toMatch(/remaining flows/);
    const noCharges = priced();
    noCharges.series[0]!.chargesAtExit = null;
    const result = estimateExitCostBySeries(noCharges);
    expect(series(result, "h-di").base.state).toBe("insufficient_evidence");
    expect(series(result, "h-di").base.reason).toMatch(/does not hold the charges/);
    const noIndenture = priced();
    noIndenture.series[0]!.indenture = null;
    expect(series(estimateExitCostBySeries(noIndenture), "h-di").routes.every((entry) => entry.state === "insufficient_evidence")).toBe(true);
    expect(estimateExitCostBySeries(noIndenture).uncovered_terms[0]?.id).toBe("indenture:h-di");
  });

  it("refuses an anchor outside the base, a mechanism not cited from an indenture, a fraction above the cap, a negative premium, a stale balance, business days beyond the weekdays and duplicate ids", () => {
    const outside = priced();
    outside.series[0]!.anchor = {document: "documento_inventado.pdf"};
    expect(() => estimateExitCostBySeries(outside)).toThrow(/not a document of the base/);
    const notIndenture = priced();
    notIndenture.series[0]!.mechanisms[1]!.anchor = hypo();
    expect(() => estimateExitCostBySeries(notIndenture)).toThrow(/must cite an indenture/);
    const overCap = priced();
    (overCap.series[0]!.mechanisms[0] as {fraction: string}).fraction = "0.99";
    expect(() => estimateExitCostBySeries(overCap)).toThrow(/exceeds the 0.98/);
    const negative = priced();
    (negative.series[0]!.mechanisms[2] as {premium: {rate: string}}).premium.rate = "-0.01";
    expect(() => estimateExitCostBySeries(negative)).toThrow();
    const stale = priced();
    stale.series[0]!.accruedAtExit = {value: "1", asOf: "2026-05-31", anchor: hypo()};
    expect(() => estimateExitCostBySeries(stale)).toThrow(/not the base at the exit date/);
    const impossible = priced();
    (impossible.series[0]!.mechanisms[1] as {businessDays: {count: number}}).businessDays.count = 600;
    expect(() => estimateExitCostBySeries(impossible)).toThrow(/cannot fit/);
    const duplicate = priced();
    duplicate.series = [...duplicate.series, {...duplicate.series[0]!}];
    expect(() => estimateExitCostBySeries(duplicate)).toThrow(/duplicate series/);
  });

  it("picks the cheapest full exit numerically, prices nothing for an empty list, and stays consistent under permutations of series, mechanisms, flows and key order", () => {
    const two = priced();
    two.series = [two.series[0]!];
    (two.series[0]!.mechanisms[1] as {premiumPerYear: string}).premiumPerYear = "0.10";
    two.series[0]!.mechanisms.push({mechanism: "total_redemption_ipca", availableFrom: "2026-01-01", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: {rate: "0.07", quoteDate: "2026-09-03", businessDaysBeforeExit: 1, security: "NTN-B", anchor: hypo("anbima_ntnb_2026-09-02.csv")}, anchor: esc("escritura_13a_emissao.pdf", "7.19")});
    two.series[0]!.remainingFlows = [{id: "big", date: "2027-09-06", amount: "1000", businessDaysFromExit: 252, anchor: hypo()}];
    const result = estimateExitCostBySeries(two);
    // total_redemption_di pays 101.5 + premium at 10%/year (about 21); the IPCA route pays 1000/1.07 = 934.58. Numeric, not lexicographic.
    expect(series(result, "h-di").cheapest_full_exit?.mechanism).toBe("total_redemption_di");
    expect(estimateExitCostBySeries({exitDate, unit: "BRL thousand", documents, series: []}).state).toBe("empty");
    const first = estimateExitCostBySeries(priced());
    const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = priced();
      shuffled.series = seed % 2 ? [...shuffled.series].reverse() : [shuffled.series[2]!, shuffled.series[0]!, shuffled.series[3]!, shuffled.series[1]!];
      shuffled.series = shuffled.series.map((entry) => ({...entry, mechanisms: [...entry.mechanisms].reverse(), remainingFlows: entry.remainingFlows ? [...entry.remainingFlows].reverse() : null}));
      shuffled.documents = [...shuffled.documents].reverse();
      const again = estimateExitCostBySeries(seed % 3 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
