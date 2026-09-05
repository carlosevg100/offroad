/**
 * Case 01 (Camil, banker preparing a meeting): the frozen inputs of `estimate-exit-cost-by-series` as the
 * executor consumes them, curated from the review corpus of the case with an anchor on every
 * value, plus the helpers that build them. The product's integration_preview reads these
 * inputs instead of extracting them live; that is declared wherever they appear. Hypothetical
 * fixtures in this file are labelled as such in their own notes.
 */
import Decimal from "decimal.js";
import {estimateExitCostBySeries, weekdaysBetween, type ExitCostInput} from "../../executors/estimate-exit-cost-by-series";

export const d = (value: Decimal.Value) => new Decimal(value);
export const exitDate = "2026-09-04";
export const documents: ExitCostInput["documents"] = [
  {name: "escritura_11a_emissao.pdf", kind: "indenture"}, {name: "escritura_13a_emissao.pdf", kind: "indenture"}, {name: "escritura_14a_emissao.pdf", kind: "indenture"}, {name: "escritura_15a_emissao.pdf", kind: "indenture"},
  {name: "01_ITR_1T26_31mai2026.pdf", kind: "itr"}, {name: "calendario_anbima_2026.csv", kind: "calendar"}, {name: "anbima_ntnb_2026-09-02.csv", kind: "quote"}, {name: "b3_pre_di_2026-09-03.csv", kind: "quote"}, {name: "fixture_hipotetico.md", kind: "other"},
];
export const calendar = (maturity: string) => ({document: "calendario_anbima_2026.csv", note: `weekday count to ${maturity}; the ANBIMA holidays reduce it, so the count is an upper bound until the calendar file enters the corpus`});
export const holidays = (count: number) => ({count, anchor: {document: "calendario_anbima_2026.csv", note: "feriados entre a cotação e a saída"}});
/** Business days to a maturity by the calendar: weekdays less the holidays the calendar lists (zero declared until the calendar file enters the corpus). */
export const days = (maturity: string) => ({count: weekdaysBetween(exitDate, maturity), maturity, holidays: {count: 0, anchor: {document: "calendario_anbima_2026.csv", note: "feriados não listados: zero declarado até o arquivo entrar no corpus, contagem é teto"}}, anchor: calendar(maturity)});
export const r710 = (document: string, rate: string) => ({value: rate, anchor: {document, clause: "7.10", note: "remuneração da série"}});
export const esc = (document: string, clause: string) => ({document, clause});
/**
 * Camil at 04/09/2026: the ITR holds the 31/05/2026 balances, not the nominal, accrued remuneration
 * and charges at the exit date, so every base is insufficient evidence. The mechanisms are the ones
 * the indentures write: the 13th's DI series may be amortized or redeemed at 0,40% a year pro rata
 * since 14/05/2026 and its holders may receive an offer since the issue date, 15/11/2023; the 14th's
 * first series matures 14/06/2029; the 15th's since 15/11/2025 and matures 14/11/2030.
 */
export const camil = (): ExitCostInput => ({
  exitDate, unit: "BRL thousand", documents,
  series: [
    {id: "deb-11-1", label: "11ª emissão, 1ª série", indenture: esc("escritura_11a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: null, quantity: null, indentureMechanisms: ["negotiated_offer", "acquisition"], mechanisms: [
      {mechanism: "negotiated_offer", availableFrom: "2021-10-30", premium: null, requiresFullAdherence: true, anchor: esc("escritura_11a_emissao.pdf", "4.14")},
      {mechanism: "acquisition", availableFrom: null, anchor: esc("escritura_11a_emissao.pdf", "4.13")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-11-2", label: "11ª emissão, 2ª série", indenture: esc("escritura_11a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: null, quantity: null, indentureMechanisms: ["negotiated_offer", "acquisition"], mechanisms: [
      {mechanism: "negotiated_offer", availableFrom: "2021-10-30", premium: null, requiresFullAdherence: true, anchor: esc("escritura_11a_emissao.pdf", "4.14")},
      {mechanism: "acquisition", availableFrom: null, anchor: esc("escritura_11a_emissao.pdf", "4.13")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-13-1", label: "13ª emissão, 1ª série (DI + 0,65%)", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: null, quantity: 304160, indentureMechanisms: ["extraordinary_amortization_di", "total_redemption_di", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", maxFraction: "0.98", fraction: "0.98", businessDays: days("2028-11-14"), anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2026-05-14", businessDays: days("2028-11-14"), anchor: esc("escritura_13a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.14")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-13-2", label: "13ª emissão, 2ª série (IPCA + 6,3416%)", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_13a_emissao.pdf", "0.063416"), quantity: null, indentureMechanisms: ["extraordinary_amortization_ipca", "total_redemption_ipca", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2027-05-14", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2027-05-14", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: null, anchor: esc("escritura_13a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.14")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-13-3", label: "13ª emissão, 3ª série (IPCA + 6,5264%)", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_13a_emissao.pdf", "0.065264"), quantity: null, indentureMechanisms: ["extraordinary_amortization_ipca", "total_redemption_ipca", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2028-05-15", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2028-05-15", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: null, anchor: esc("escritura_13a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_13a_emissao.pdf", "7.14")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-14-1", label: "14ª emissão, 1ª série (104% do DI)", indenture: esc("escritura_14a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: null, quantity: 411643, indentureMechanisms: ["extraordinary_amortization_di", "total_redemption_di", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-06-15", maxFraction: "0.98", fraction: "0.98", businessDays: days("2029-06-14"), anchor: esc("escritura_14a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2026-06-15", businessDays: days("2029-06-14"), anchor: esc("escritura_14a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2024-06-14", premium: null, requiresFullAdherence: false, anchor: esc("escritura_14a_emissao.pdf", "7.14")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-14-2", label: "14ª emissão, 2ª série (IPCA + 6,8286%)", indenture: esc("escritura_14a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_14a_emissao.pdf", "0.068286"), quantity: null, indentureMechanisms: ["extraordinary_amortization_ipca", "total_redemption_ipca", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2027-06-15", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_14a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2027-06-15", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_14a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2024-06-14", premium: null, requiresFullAdherence: false, anchor: esc("escritura_14a_emissao.pdf", "7.14")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-14-3", label: "14ª emissão, 3ª série (IPCA + 6,9982%)", indenture: esc("escritura_14a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_14a_emissao.pdf", "0.069982"), quantity: null, indentureMechanisms: ["extraordinary_amortization_ipca", "total_redemption_ipca", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2028-06-15", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_14a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2028-06-15", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_14a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2024-06-14", premium: null, requiresFullAdherence: false, anchor: esc("escritura_14a_emissao.pdf", "7.14")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-15-1", label: "15ª emissão, 1ª série (DI)", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: null, quantity: null, indentureMechanisms: ["extraordinary_amortization_di", "total_redemption_di", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2027-11-15", maxFraction: "0.98", fraction: "0.98", businessDays: days("2030-11-14"), anchor: esc("escritura_15a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2027-11-15", businessDays: days("2030-11-14"), anchor: esc("escritura_15a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2025-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_15a_emissao.pdf", "7.14.1")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-15-2", label: "15ª emissão, 2ª série (prefixada 14,15%)", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_15a_emissao.pdf", "0.1415"), quantity: 406349, indentureMechanisms: ["extraordinary_amortization_pre", "total_redemption_pre", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_pre", availableFrom: "2028-11-15", maxFraction: "0.98", fraction: "0.98", referenceRate: "B3 Pre x DI curve (nearest vertex to remaining duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_15a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_pre", availableFrom: "2028-11-15", referenceRate: "B3 Pre x DI curve (nearest vertex to remaining duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_15a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2025-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_15a_emissao.pdf", "7.14.1")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-15-3", label: "15ª emissão, 3ª série (IPCA + 8,20%)", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_15a_emissao.pdf", "0.082"), quantity: null, indentureMechanisms: ["extraordinary_amortization_ipca", "total_redemption_ipca", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2028-11-15", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_15a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2028-11-15", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_15a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2025-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_15a_emissao.pdf", "7.14.1")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
    {id: "deb-15-4", label: "15ª emissão, 4ª série (IPCA + 8,70%)", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: null, accruedAtExit: null, chargesAtExit: null, remainingFlows: null, remunerationRate: r710("escritura_15a_emissao.pdf", "0.087"), quantity: null, indentureMechanisms: ["extraordinary_amortization_ipca", "total_redemption_ipca", "negotiated_offer"], mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2029-11-15", maxFraction: "0.98", fraction: "0.98", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_15a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2029-11-15", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: null, anchor: esc("escritura_15a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2025-11-15", premium: null, requiresFullAdherence: false, anchor: esc("escritura_15a_emissao.pdf", "7.14.1")},
    ], anchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 40, note: "nota 15"}},
  ],
});
/** Hypothetical priced series (not Camil): every base component dated at the exit and anchored to the fixture note. */
export const hypo = (document = "fixture_hipotetico.md") => ({document, note: "fixture hipotético, não é evidência gold"});
export const dated = (value: string) => ({value, asOf: exitDate, anchor: hypo()});
export const flows = [
  {id: "coupon-2027", date: "2027-03-04", amount: "6", businessDaysFromExit: 125, calendarDaysFromExit: 181, anchor: hypo()},
  {id: "principal-2027", date: "2027-09-06", amount: "106", businessDaysFromExit: 252, calendarDaysFromExit: 367, anchor: hypo()},
];
export const ntnb = (quoteDate: string, before: number) => ({rate: "0.07", quoteDate, businessDaysBeforeExit: before, holidaysBetween: holidays(0), security: "NTN-B 2027-08-15", securityDurationBusinessDays: 240, candidates: [{security: "NTN-B 2027-08-15", durationBusinessDays: 240}, {security: "NTN-B 2028-08-15", durationBusinessDays: 480}], anchor: hypo("anbima_ntnb_2026-09-02.csv")});
export const hypoSeries = {quantity: null as number | null, indentureMechanisms: [] as string[]};
export const priced = (): ExitCostInput => ({
  exitDate, unit: "BRL thousand", documents,
  series: [
    {id: "h-di", label: "hipotética DI", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "unit_value_x_quantity", anchor: hypo()}, accruedAtExit: dated("1.5"), chargesAtExit: dated("0"), remainingFlows: null, remunerationRate: null, ...hypoSeries, quantity: 100, mechanisms: [
      {mechanism: "extraordinary_amortization_di", premiumPerYear: "0.004", availableFrom: "2026-01-01", maxFraction: "0.98", fraction: "0.98", businessDays: {count: 504, maturity: "2028-09-04", holidays: {count: weekdaysBetween(exitDate, "2028-09-04") - 504, anchor: calendar("2028-09-04")}, anchor: calendar("2028-09-04")}, anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_di", premiumPerYear: "0.004", availableFrom: "2026-01-01", businessDays: {count: 504, maturity: "2028-09-04", holidays: {count: weekdaysBetween(exitDate, "2028-09-04") - 504, anchor: calendar("2028-09-04")}, anchor: calendar("2028-09-04")}, anchor: esc("escritura_13a_emissao.pdf", "7.16")},
      {mechanism: "negotiated_offer", availableFrom: "2023-11-15", premium: {kind: "rate", rate: "0.01", anchor: hypo()}, requiresFullAdherence: false, adhesion: {fraction: "0.6", anchor: hypo()}, anchor: esc("escritura_13a_emissao.pdf", "7.14")},
    ], anchor: hypo()},
    {id: "h-ipca-13", label: "hipotética IPCA, regra da 13ª", indenture: esc("escritura_13a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "unit_value_x_quantity_updated", anchor: hypo()}, accruedAtExit: dated("1"), chargesAtExit: dated("0"), remainingFlows: flows, remunerationRate: {value: "0.06", anchor: hypo()}, ...hypoSeries, mechanisms: [
      {mechanism: "extraordinary_amortization_ipca", availableFrom: "2026-01-01", maxFraction: "0.98", fraction: "0.50", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: ntnb("2026-09-02", 2), anchor: esc("escritura_13a_emissao.pdf", "7.18")},
      {mechanism: "total_redemption_ipca", availableFrom: "2026-01-01", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "present_value_only", quoteDay: "prior_business_day", quote: ntnb("2026-09-03", 1), anchor: esc("escritura_13a_emissao.pdf", "7.16")},
    ], anchor: hypo()},
    {id: "h-ipca-14", label: "hipotética IPCA, regra da 14ª e da 15ª", indenture: esc("escritura_14a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "trustee_report_at_exit_date", anchor: hypo()}, accruedAtExit: dated("1"), chargesAtExit: dated("0.5"), remainingFlows: flows, remunerationRate: {value: "0.06", anchor: hypo()}, ...hypoSeries, indentureMechanisms: ["total_redemption_ipca", "extraordinary_amortization_ipca"], mechanisms: [
      {mechanism: "total_redemption_ipca", availableFrom: "2026-01-01", referenceRate: "NTN-B (ANBIMA indicative, nearest duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: ntnb("2026-09-02", 2), anchor: esc("escritura_14a_emissao.pdf", "7.19")},
    ], anchor: hypo()},
    {id: "h-pre", label: "hipotética prefixada, regra da 15ª", indenture: esc("escritura_15a_emissao.pdf", "4.1"), nominalAtExit: {value: "100", asOf: exitDate, derivation: "unit_value_x_quantity", anchor: hypo()}, accruedAtExit: dated("2"), chargesAtExit: dated("0.1"), remainingFlows: flows, remunerationRate: {value: "0.1415", anchor: hypo()}, ...hypoSeries, mechanisms: [
      {mechanism: "total_redemption_pre", availableFrom: "2026-01-01", referenceRate: "B3 Pre x DI curve (nearest vertex to remaining duration)", floor: "max_with_base", quoteDay: "second_prior_business_day", quote: {rate: "0.02", quoteDate: "2026-09-02", businessDaysBeforeExit: 2, holidaysBetween: holidays(0), security: "Pre x DI, vértice 360", securityCalendarDays: 360, candidates: [{security: "Pre x DI, vértice 180", calendarDays: 180}, {security: "Pre x DI, vértice 360", calendarDays: 360}, {security: "Pre x DI, vértice 720", calendarDays: 720}], anchor: hypo("b3_pre_di_2026-09-03.csv")}, anchor: esc("escritura_15a_emissao.pdf", "7.16")},
    ], anchor: hypo()},
  ],
});
export const series = (result: ReturnType<typeof estimateExitCostBySeries>, id: string) => result.exit_costs.find((entry) => entry.series_id === id)!;
export const route = (result: ReturnType<typeof estimateExitCostBySeries>, id: string, mechanism: string) => series(result, id).routes.find((entry) => entry.mechanism === mechanism)!;
