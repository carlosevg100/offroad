import {macaulayDurationBusinessDays, presentValueByBusinessDays} from "@offroad/financial-core";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {estimateExitCostBySeries, weekdaysBetween, type ExitCostInput} from "./estimate-exit-cost-by-series";
import {d, exitDate, documents, calendar, holidays, days, esc, camil, hypo, flows, ntnb, priced, series, route} from "../cases/gc01/estimate-exit-cost-by-series";

describe("estimate-exit-cost-by-series executor (v8)", () => {
  it("gold: without the nominal, accrued and charges at the exit date every base is insufficient evidence, and the routes keep their availability on the date", () => {
    const result = estimateExitCostBySeries(camil());
    expect(result.schema_version).toBe("method.estimate-exit-cost-by-series.v8");
    expect(result.state).toBe("partial");
    expect(result.exit_costs).toHaveLength(12);
    expect(result.exit_costs.every((entry) => entry.base.state === "insufficient_evidence" && entry.cheapest_full_exit === null)).toBe(true);
    expect(result.uncovered_terms.map((term) => term.id)).toEqual(["base:deb-11-1", "base:deb-11-2", "base:deb-13-1", "base:deb-13-2", "base:deb-13-3", "base:deb-14-1", "base:deb-14-2", "base:deb-14-3", "base:deb-15-1", "base:deb-15-2", "base:deb-15-3", "base:deb-15-4"]);
    expect(route(result, "deb-13-3", "total_redemption_ipca").available_from).toBe("2028-05-15");
    expect(route(result, "deb-14-2", "extraordinary_amortization_ipca").available_from).toBe("2027-06-15");
    expect(route(result, "deb-14-3", "total_redemption_ipca").available_from).toBe("2028-06-15");
    expect(route(result, "deb-15-1", "extraordinary_amortization_di").scope).toBe("partial");
    expect(route(result, "deb-15-2", "extraordinary_amortization_pre").available_from).toBe("2028-11-15");
    // A mechanism the indenture offers and the input omits is a named gap.
    const missingRoute = camil();
    missingRoute.series[2]!.mechanisms = missingRoute.series[2]!.mechanisms.filter((mechanism) => mechanism.mechanism !== "total_redemption_di");
    expect(estimateExitCostBySeries(missingRoute).uncovered_terms.some((term) => term.id === "mechanism:deb-13-1:total_redemption_di")).toBe(true);
    expect(route(result, "deb-15-2", "total_redemption_pre").available_from).toBe("2028-11-15");
    expect(route(result, "deb-15-4", "total_redemption_ipca").available_from).toBe("2029-11-15");
    expect(route(result, "deb-13-1", "negotiated_offer").anchor.clause).toBe("7.14");
    expect(route(result, "deb-14-2", "total_redemption_ipca").anchor.clause).toBe("7.16");
    expect(route(result, "deb-13-1", "negotiated_offer").scope).toBe("partial_or_full");
    expect(route(result, "deb-11-1", "negotiated_offer").available_from).toBe("2021-10-30");
    expect(route(result, "deb-11-1", "acquisition").scope).toBe("partial_or_full");
    expect(route(result, "deb-14-1", "extraordinary_amortization_di").permitted_on_date).toBe(true);
    expect(route(result, "deb-15-2", "total_redemption_pre").state).toBe("not_permitted");
    expect(route(result, "deb-15-3", "total_redemption_ipca").state).toBe("not_permitted");
    expect(route(result, "deb-14-2", "negotiated_offer").permitted_on_date).toBe(true);
    expect(route(result, "deb-13-1", "total_redemption_di").permitted_on_date).toBe(true);
    expect(route(result, "deb-13-1", "total_redemption_di").state).toBe("insufficient_evidence");
    expect(route(result, "deb-13-2", "total_redemption_ipca").state).toBe("not_permitted");
    expect(route(result, "deb-13-2", "negotiated_offer").permitted_on_date).toBe(true);
    expect(route(result, "deb-15-1", "total_redemption_di").state).toBe("not_permitted");
    expect(route(result, "deb-15-1", "negotiated_offer").available_from).toBe("2025-11-15");
    expect(route(result, "deb-11-1", "acquisition").state).toBe("price_at_counterparty");
    expect(result.totals).toEqual({estimated_premium: "0", estimated_payable: "0", series_estimated: 0, series_open: 12});
  });

  it("hypothetical DI: the premium is [(1 + p)^(DU/252) - 1] over the amount retired, truncated at eight decimals; the 98% amortization never competes as a full exit", () => {
    const result = estimateExitCostBySeries(priced());
    const base = d("101.5");
    const factor = d("1.004").pow(d(504).div(252)).minus(1);
    const total = route(result, "h-di", "total_redemption_di");
    // Per debenture: unit price 1.015, P truncated at eight decimals, times the 100 debentures.
    const unitPremium = base.div(100).times(factor).toDecimalPlaces(8, Decimal.ROUND_DOWN);
    expect(total.premium).toBe(unitPremium.times(100).toDecimalPlaces(8).toFixed());
    expect(total.premium_basis).toBe("per_unit");
    expect(total.scope).toBe("full");
    // Without a quantity the premium is truncated once on the aggregate and declared as an approximation.
    const noQuantity = priced();
    noQuantity.series[0]!.quantity = null;
    const aggregate = route(estimateExitCostBySeries(noQuantity), "h-di", "total_redemption_di");
    expect(aggregate.premium).toBe("0.813624");
    expect(aggregate.premium_basis).toBe("aggregate_approximation");
    const partial = route(result, "h-di", "extraordinary_amortization_di");
    expect(partial.scope).toBe("partial");
    expect(partial.amount_retired).toBe(base.times("0.98").toFixed());
    expect(partial.premium).toBe(base.times("0.98").div(100).times(factor).toDecimalPlaces(8, Decimal.ROUND_DOWN).times(100).toDecimalPlaces(8).toFixed());
    expect(d(partial.total_payable!).lt(total.total_payable!)).toBe(true);
    expect(series(result, "h-di").cheapest_full_exit).toEqual({mechanism: "total_redemption_di", total_payable: total.total_payable});
    // The offer retires what adhered: 60% of the base at the notice's premium.
    expect(route(result, "h-di", "negotiated_offer").amount_retired).toBe(base.times("0.6").toFixed());
    expect(route(result, "h-di", "negotiated_offer").premium).toBe(base.times("0.01").times("0.6").toFixed());
    expect(route(result, "h-di", "negotiated_offer").fraction).toBe("0.6");
    // With the premium known and no adhesion result, nothing is retired yet; a premium per debenture needs the quantity; an adhesion above one is impossible.
    const noAdhesion = priced();
    (noAdhesion.series[0]!.mechanisms[2] as {adhesion: unknown}).adhesion = null;
    expect(route(estimateExitCostBySeries(noAdhesion), "h-di", "negotiated_offer").state).toBe("premium_known_adhesion_open");
    expect(route(estimateExitCostBySeries(noAdhesion), "h-di", "negotiated_offer").amount_retired).toBeNull();
    const perUnit = priced();
    (perUnit.series[0]!.mechanisms[2] as {premium: unknown}).premium = {kind: "amount_per_unit", value: "0.02", anchor: hypo()};
    expect(route(estimateExitCostBySeries(perUnit), "h-di", "negotiated_offer").premium).toBe(d("0.02").times(100).times("0.6").toFixed());
    const perUnitNoQuantity = priced();
    perUnitNoQuantity.series[0]!.quantity = null;
    (perUnitNoQuantity.series[0]!.mechanisms[2] as {premium: unknown}).premium = {kind: "amount_per_unit", value: "0.02", anchor: hypo()};
    expect(route(estimateExitCostBySeries(perUnitNoQuantity), "h-di", "negotiated_offer").state).toBe("insufficient_evidence");
    const overAdhesion = priced();
    (overAdhesion.series[0]!.mechanisms[2] as {adhesion: {fraction: string}}).adhesion.fraction = "1.2";
    expect(() => estimateExitCostBySeries(overAdhesion)).toThrow(/adhesion above 100% is impossible/);
  });

  it("hypothetical IPCA: the 13th's amortization pays max(updated value, present value) at the second prior day's quote and its redemption pays the present value only at the prior day's quote; the 14th's redemption keeps the floor and adds the charges; the duration is discounted at the series' remuneration", () => {
    const result = estimateExitCostBySeries(priced());
    const present = presentValueByBusinessDays(flows.map((flow) => ({id: flow.id, amount: flow.amount, businessDays: flow.businessDaysFromExit})), "0.07", {factorDecimals: 9});
    const amortization = route(result, "h-ipca-13", "extraordinary_amortization_ipca");
    expect(amortization.present_value?.value).toBe(d(present.value).times("0.50").toDecimalPlaces(8).toFixed());
    expect(amortization.total_payable).toBe(Decimal.max(d("101").times("0.50"), d(present.value).times("0.50")).toDecimalPlaces(8).toFixed());
    const redemption13 = route(result, "h-ipca-13", "total_redemption_ipca");
    expect(redemption13.total_payable).toBe(present.value);
    expect(redemption13.quote?.businessDaysBeforeExit).toBe(1);
    const redemption14 = route(result, "h-ipca-14", "total_redemption_ipca");
    // max(101, PV) plus the charges of 0.5 the indenture adds after the comparison.
    expect(redemption14.total_payable).toBe(Decimal.max(d("101"), d(present.value)).plus("0.5").toDecimalPlaces(8).toFixed());
    expect(redemption14.present_value?.charges_added).toBe("0.5");
    expect(redemption14.present_value?.remuneration_rate).toBe("0.06");
    expect(series(result, "h-ipca-14").cheapest_full_exit?.mechanism).toBe("total_redemption_ipca");
    const duration = result.trace.calculations.find((calculation) => calculation.id === "financial.macaulay_duration_business_days:h-ipca-14:total_redemption_ipca")!;
    expect(duration.unit).toBe("business days");
    expect(duration.operands.annualRate).toBe("0.06");
    expect(duration.formula).toMatch(/discounted at the series' remuneration/);
    const pre = route(result, "h-pre", "total_redemption_pre");
    expect(pre.state).toBe("estimated");
    // The Pre x DI vertex is chosen by calendar days: the series' duration in calendar days sits nearest to 360.
    expect(pre.quote?.security).toBe("Pre x DI, vértice 360");
    expect(pre.quote?.nearestCandidate).toBe("Pre x DI, vértice 360");
    expect(d(pre.present_value!.duration_calendar_days_at_remuneration).gt(180) && d(pre.present_value!.duration_calendar_days_at_remuneration).lt(540)).toBe(true);
    // A quote at a vertex that is not the nearest prices nothing.
    const farVertex = priced();
    (farVertex.series[3]!.mechanisms[0] as {quote: {security: string; securityCalendarDays: number}}).quote.security = "Pre x DI, vértice 720";
    (farVertex.series[3]!.mechanisms[0] as {quote: {security: string; securityCalendarDays: number}}).quote.securityCalendarDays = 720;
    expect(route(estimateExitCostBySeries(farVertex), "h-pre", "total_redemption_pre").reason).toMatch(/is not the nearest to the series' duration/);
    // A tie between two candidates is recorded, and either of them is accepted.
    const tie = priced();
    (tie.series[2]!.mechanisms[0] as {quote: {candidates: unknown[]}}).quote.candidates = [{security: "NTN-B A", durationBusinessDays: 200}, {security: "NTN-B B", durationBusinessDays: 200}];
    (tie.series[2]!.mechanisms[0] as {quote: {security: string; securityDurationBusinessDays: number}}).quote.security = "NTN-B B";
    (tie.series[2]!.mechanisms[0] as {quote: {security: string; securityDurationBusinessDays: number}}).quote.securityDurationBusinessDays = 200;
    const tied = route(estimateExitCostBySeries(tie), "h-ipca-14", "total_redemption_ipca");
    expect(tied.state).toBe("estimated");
    expect(tied.quote?.nearestTies).toEqual(["NTN-B B"]);
    expect(tied.reason).toMatch(/ties with NTN-B B on duration, recorded/);
    // Discount factors are rounded at nine decimals, as the indentures write.
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.present_value_by_business_days:h-ipca-14:total_redemption_ipca")?.operands.factorDecimals).toBe("9");
    const wrongCurve = priced();
    (wrongCurve.series[3]!.mechanisms[0] as {referenceRate: string}).referenceRate = "NTN-B (ANBIMA indicative, nearest duration)";
    expect(() => estimateExitCostBySeries(wrongCurve)).toThrow(/a pre-fixed mechanism discounts at the Pre x DI curve/);
  });

  it("refuses a quote of the wrong contractual day, a make-whole without flows or remuneration, a base without explicit charges, and a series without an indenture", () => {
    const wrongDay = priced();
    (wrongDay.series[2]!.mechanisms[0] as {quote: {quoteDate: string; businessDaysBeforeExit: number}}).quote = {...(wrongDay.series[2]!.mechanisms[0] as {quote: object}).quote, quoteDate: "2026-09-03", businessDaysBeforeExit: 1} as never;
    expect(route(estimateExitCostBySeries(wrongDay), "h-ipca-14", "total_redemption_ipca").reason).toMatch(/1 business days before the exit; the series requires the second business day/);
    const noRemuneration = priced();
    noRemuneration.series[2]!.remunerationRate = null;
    expect(route(estimateExitCostBySeries(noRemuneration), "h-ipca-14", "total_redemption_ipca").reason).toMatch(/needs the remuneration rate/);
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

  it("refuses an anchor outside the base, a mechanism not cited from the series' own indenture or without its clause, a quote whose distance disagrees with the calendar, zero business days, a cap of 100%, a fraction above the cap, a negative premium, a stale balance, business days beyond the weekdays and duplicate ids", () => {
    const outside = priced();
    outside.series[0]!.anchor = {document: "documento_inventado.pdf"};
    expect(() => estimateExitCostBySeries(outside)).toThrow(/not a document of the base/);
    const notIndenture = priced();
    notIndenture.series[0]!.mechanisms[1]!.anchor = hypo();
    expect(() => estimateExitCostBySeries(notIndenture)).toThrow(/must cite an indenture/);
    const otherIndenture = priced();
    otherIndenture.series[0]!.mechanisms[1]!.anchor = esc("escritura_14a_emissao.pdf", "7.19");
    expect(() => estimateExitCostBySeries(otherIndenture)).toThrow(/not the series' indenture escritura_13a_emissao.pdf/);
    const noClause = priced();
    noClause.series[0]!.mechanisms[1]!.anchor = {document: "escritura_13a_emissao.pdf"};
    expect(() => estimateExitCostBySeries(noClause)).toThrow(/must cite the clause/);
    const farQuote = priced();
    (farQuote.series[2]!.mechanisms[0] as {quote: {quoteDate: string}}).quote.quoteDate = "2026-09-01";
    expect(() => estimateExitCostBySeries(farQuote)).toThrow(/is 3 business days before 2026-09-04 by the calendar .* not 2/);
    const zeroDays = priced();
    (zeroDays.series[0]!.mechanisms[1] as {businessDays: {count: number; holidays: {count: number}}}).businessDays.count = 0;
    (zeroDays.series[0]!.mechanisms[1] as {businessDays: {count: number; holidays: {count: number}}}).businessDays.holidays.count = weekdaysBetween(exitDate, "2028-09-04");
    expect(() => estimateExitCostBySeries(zeroDays)).toThrow(/a count of zero prices a premium of zero/);
    const wrongHolidays = priced();
    (wrongHolidays.series[0]!.mechanisms[1] as {businessDays: {holidays: {count: number}}}).businessDays.holidays.count = 3;
    expect(() => estimateExitCostBySeries(wrongHolidays)).toThrow(/weekdays less 3 holidays give/);
    const duplicateMechanism = priced();
    duplicateMechanism.series[0]!.mechanisms.push({...duplicateMechanism.series[0]!.mechanisms[1]!});
    expect(() => estimateExitCostBySeries(duplicateMechanism)).toThrow(/listed twice/);
    const duplicateFlow = priced();
    duplicateFlow.series[1]!.remainingFlows = [...flows, {...flows[0]!}];
    expect(() => estimateExitCostBySeries(duplicateFlow)).toThrow(/duplicate flow/);
    const duplicateDocument = priced();
    duplicateDocument.documents = [...documents, {...documents[0]!}];
    expect(() => estimateExitCostBySeries(duplicateDocument)).toThrow(/duplicate document/);
    const fullCap = priced();
    (fullCap.series[0]!.mechanisms[0] as {maxFraction: string; fraction: string}).maxFraction = "1";
    (fullCap.series[0]!.mechanisms[0] as {maxFraction: string; fraction: string}).fraction = "1";
    expect(() => estimateExitCostBySeries(fullCap)).toThrow(/caps below 100%/);
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
    expect(() => estimateExitCostBySeries(impossible)).toThrow(/give 504 business days .* not 600/);
    const duplicate = priced();
    duplicate.series = [...duplicate.series, {...duplicate.series[0]!}];
    expect(() => estimateExitCostBySeries(duplicate)).toThrow(/duplicate series/);
  });

  it("picks the cheapest full exit numerically, prices nothing for an empty list, and stays consistent under permutations of series, mechanisms, flows and key order", () => {
    const two = priced();
    two.series = [two.series[0]!];
    (two.series[0]!.mechanisms[1] as {premiumPerYear: string}).premiumPerYear = "0.10";
    two.series[0]!.mechanisms.push({mechanism: "total_redemption_ipca", availableFrom: "2026-01-01", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: ntnb("2026-09-03", 1), anchor: esc("escritura_13a_emissao.pdf", "7.16")});
    two.series[0]!.remainingFlows = [{id: "big", date: "2027-09-06", amount: "1000", businessDaysFromExit: 252, calendarDaysFromExit: 367, anchor: hypo()}];
    two.series[0]!.remunerationRate = {value: "0.06", anchor: hypo()};
    const result = estimateExitCostBySeries(two);
    // total_redemption_di pays 101.5 + premium at 10%/year (about 21); the IPCA route pays 1000/1.07 = 934.58. Numeric, not lexicographic.
    expect(series(result, "h-di").cheapest_full_exit?.mechanism).toBe("total_redemption_di");
    expect(estimateExitCostBySeries({exitDate, unit: "BRL thousand", documents, series: []}).state).toBe("empty");
    expect(() => estimateExitCostBySeries({exitDate: "2026-99-99", unit: "BRL thousand", documents, series: []})).toThrow(/not a calendar date/);
    const first = estimateExitCostBySeries(priced());
    const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = priced();
      shuffled.series = seed % 2 ? [...shuffled.series].reverse() : [shuffled.series[2]!, shuffled.series[0]!, shuffled.series[3]!, shuffled.series[1]!];
      shuffled.series = shuffled.series.map((entry) => ({...entry, mechanisms: [...entry.mechanisms].reverse().map((mechanism) => ("quote" in mechanism && mechanism.quote ? {...mechanism, quote: {...mechanism.quote, candidates: [...mechanism.quote.candidates].reverse()}} : mechanism)), remainingFlows: entry.remainingFlows ? [...entry.remainingFlows].reverse() : null, indentureMechanisms: [...(entry.indentureMechanisms ?? [])].reverse()}));
      shuffled.documents = [...shuffled.documents].reverse();
      const again = estimateExitCostBySeries(seed % 3 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(estimateExitCostBySeries(camil()) as unknown as Record<string, unknown>, "refinance/estimate-exit-cost-by-series.md")).toEqual([]);
  });

  it("counts business days from the exit inclusive to the maturity exclusive, and selects the security with nine-decimal factors at the boundary", () => {
    // Friday 04/09/2026 to Monday 07/09/2026: the exit Friday counts, the maturity Monday does not.
    expect(weekdaysBetween("2026-09-04", "2026-09-07")).toBe(1);
    expect(weekdaysBetween("2026-09-04", "2026-09-11")).toBe(5);
    expect(weekdaysBetween("2026-09-05", "2026-09-07")).toBe(0);
    const duration = macaulayDurationBusinessDays([{id: "a", amount: "1", businessDays: 125}, {id: "b", amount: "1.509708412493", businessDays: 252}], "0.06", {factorDecimals: 9});
    expect(duration.trace.operands.factorDecimals).toBe("9");
    const result = estimateExitCostBySeries(priced());
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.macaulay_duration_business_days:h-ipca-14:total_redemption_ipca")?.operands.factorDecimals).toBe("9");
  });
});
