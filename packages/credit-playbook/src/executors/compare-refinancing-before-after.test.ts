import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import Decimal from "decimal.js";

import {compareRefinancingBeforeAfter, type BeforeAfterInput} from "./compare-refinancing-before-after";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
const d = (value: Decimal.Value) => new Decimal(value);
/**
 * Camil at 31/05/2026, R$ thousand: the ledger's schedule in the ITR's twelve-month windows from the
 * reference date (each window named by the safra years it spans and dated by its end), the debenture
 * transaction costs as the ledger's adjustment row, and the retirement of the DI series of the 13th
 * (14/11/2028, window 2028/29) and the 14th (14/06/2029, window 2029/30) with a new five-year SAC
 * debenture. The new debt's terms are indicative, not a quote.
 */
const camil = (): BeforeAfterInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"},
  before: {
    grossDebt: {value: "5670186", anchor: itr(40, "nota 15, total de empréstimos, financiamentos e debêntures")},
    unrestrictedCash: {value: "1455809", anchor: itr(51, "caixa e equivalentes (1.430.714) mais aplicações financeiras (25.095), quadro de dívida líquida")},
    derivativeLiabilities: {value: "14335", anchor: itr(51, "instrumentos financeiros derivativos, passivo, quadro de dívida líquida")},
    derivativeAssets: {value: "235", anchor: itr(51, "instrumentos financeiros derivativos, ativo, quadro de dívida líquida")},
    ltmEbitda: {value: "895864", periodStart: "2025-05-31", periodEnd: "2026-05-31", definitionKey: "ebitda.contractual.13a", basis: "implied_from_reported_index", anchor: itr(40, "nota 15: 4.228.477 / 4,72, derivado, não aberto pela companhia")},
    schedule: [
      {period: "2026/27", amount: "1229828", endsAt: "2027-05-31", anchor: itr(40, "nota 15, cronograma")}, {period: "2027/28", amount: "776868", endsAt: "2028-05-31", anchor: itr(40, "nota 15, cronograma")},
      {period: "2028/29", amount: "1228475", endsAt: "2029-05-31", anchor: itr(40, "nota 15, cronograma")}, {period: "2029/30", amount: "694497", endsAt: "2030-05-31", anchor: itr(40, "nota 15, cronograma")},
      {period: "2030/31", amount: "994544", endsAt: "2031-05-31", anchor: itr(40, "nota 15, cronograma")}, {period: "after 2031", amount: "809198", endsAt: null, anchor: itr(40, "nota 15, cronograma")},
      {period: "debenture costs", amount: "-63224", endsAt: null, kind: "adjustment", anchor: itr(40, "nota 15, custos de debêntures")},
    ],
    costOfExistingDebt: {weightedAverageRate: "0.1246", basis: "juros do serviço base do caso 02 sobre a dívida bruta (706.751 / 5.670.186), custo contábil, não all-in", anchor: itr(40, "nota 15")},
    cfadsByPeriod: null,
  },
  // The four indentures carry the same two-tier covenant; the 11th adds its own definition. Every one of them is listed, none resolved.
  covenants: [
    {instrument: "11ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência, sem fato na base"}, {limit: "4.00", applicability: "conditional", condition: "no exercício encerrado depois da quitação integral dos CRA de referência, condicionado à prova"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 35}},
    {instrument: "13ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência, sem fato na base"}, {limit: "4.00", applicability: "conditional", condition: "4,00x condicionado à prova da quitação ordinária dos CRA de referência"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3(VIII)", page: 54}},
    {instrument: "14ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência"}, {limit: "4.00", applicability: "conditional", condition: "condicionado à prova da quitação"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_14a_emissao.pdf", clause: "7.26.3(VIII)", page: 54}},
    {instrument: "15ª emissão", limit: "4.00", direction: "maximum", measurement: {frequency: "annual", nextDate: "2027-02-28"}, tiers: [{limit: "3.50", applicability: "conditional", condition: "até o vencimento ou a liquidação dos CRA de referência"}, {limit: "4.00", applicability: "conditional", condition: "condicionado à prova da quitação"}], state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_15a_emissao.pdf", clause: "7.26.3(VIII)", page: 56}},
  ],
  alternatives: [
    // The principal retired is the contractual nominal of each series (304.160 and 411.643 debentures of R$ 1.000), never the ITR's carrying amount; the new debt's terms are indicative and declared as such.
    {id: "extend-di", label: "Alongar as séries DI da 13ª e da 14ª com nova debênture de cinco anos", newDebt: {amount: "745000", annualRate: "0.145", termMonths: 60, graceMonths: 24, format: "sac", upfrontFeeRate: "0.01", disbursementDate: "2026-09-04", origin: "termos indicativos, curva de 04/09/2026; não há proposta nem term sheet no corpus", termsSource: "indicative_unverified", anchor: {document: "anbima_ettj_2026-09-04.csv"}}, retired: [
      {seriesId: "deb-13-1", instalments: [{period: "2028/29", principal: {value: "304160", basis: "contractual_nominal", anchor: {document: "escritura_13a_emissao.pdf", clause: "4.1", note: "304.160 debêntures de R$ 1.000"}}, maturityAnchor: {document: "escritura_13a_emissao.pdf", clause: "7.7.1", note: "vencimento 14/11/2028"}}], exitPremium: {value: "2448", mechanism: "total_redemption_di", permittedOnDate: true, anchor: {document: "exit-costs-gc01.json", note: "route total_redemption_di, 0,40% a.a. pro rata"}}},
      {seriesId: "deb-14-1", instalments: [{period: "2029/30", principal: {value: "411643", basis: "contractual_nominal", anchor: {document: "escritura_14a_emissao.pdf", clause: "4.1", note: "411.643 debêntures de R$ 1.000"}}, maturityAnchor: {document: "escritura_14a_emissao.pdf", clause: "7.7.1", note: "vencimento 14/06/2029"}}], exitPremium: {value: "5266", mechanism: "total_redemption_di", permittedOnDate: true, anchor: {document: "exit-costs-gc01.json", note: "route total_redemption_di"}}},
    ], feesPaidFromCash: {value: "1500", anchor: {document: "03_Pedido_Simulado_CRA_2026.docx", page: 1, note: "custos de estruturação sintéticos"}}},
    {id: "status-quo", label: "Manter a estrutura", newDebt: null, retired: []},
    // The 13th's second series amortizes in two instalments, 14/11/2029 (clause 7.8.2) and at maturity 14/11/2030 (clause 7.7.2): each leaves its own window; the nominal split is the indenture's, not half of a carrying amount.
    {id: "retire-ipca", label: "Retirar as séries IPCA antes da carência", newDebt: null, retired: [{seriesId: "deb-13-2", instalments: [{period: "2029/30", principal: {value: "125000", basis: "contractual_nominal", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.8.2", note: "50% do valor nominal atualizado em 14/11/2029 (nominal hipotético de 250.000 para o teste)"}}, maturityAnchor: {document: "escritura_13a_emissao.pdf", clause: "7.8.2", note: "primeira parcela em 14/11/2029"}}, {period: "2030/31", principal: {value: "125000", basis: "contractual_nominal", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.7.2", note: "saldo no vencimento"}}, maturityAnchor: {document: "escritura_13a_emissao.pdf", clause: "7.7.2", note: "vencimento em 14/11/2030"}}], exitPremium: null}], uncoveredTerms: ["ipca_exit_quote"]},
  ],
  ranking: {discriminator: "peak_concentration", rationale: "a tese é suavizar o degrau de 2028/29; custo e headroom entram como restrição, não como discriminador"},
  wallThreshold: {share: "0.20", policyKey: "policy.structure.maturity_wall", policyVersion: "2026.09.05-v8"},
});
/** Deep clone with every object's keys in reverse order: the same input, another key order. */
const reversedKeys = <T,>(value: T): T => (Array.isArray(value) ? value.map(reversedKeys) as T : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, inner]) => [key, reversedKeys(inner)])) as T : value);
const find = (result: ReturnType<typeof compareRefinancingBeforeAfter>, id: string) => result.alternatives.find((alternative) => alternative.id === id)!;

describe("compare-refinancing-before-after executor", () => {
  it("gold: before and after share the same objects, retired series leave their own windows, the new principal lands by date, and the exit cost and fees leave the cash", () => {
    const result = compareRefinancingBeforeAfter(camil());
    expect(result.schema_version).toBe("method.compare-refinancing-before-after.v7");
    expect(result.state).toBe("compared");
    expect(result.before.gross_debt).toBe("5670186");
    expect(result.before.contractual_net_debt).toBe("4228477");
    // 4.228.477 / 895.864: the implied EBITDA reproduces the reported 4,72x to the eighth decimal, not exactly
    expect(result.before.leverage?.value).toBe(d("4228477").div("895864").toDecimalPlaces(8).toFixed());
    expect(result.before.peak?.period).toBe("2026/27");
    expect(result.before.peak?.share_of_gross).toBe(d("1229828").div("5670186").toDecimalPlaces(8).toFixed());
    expect(result.before.cost.comparable_with_new_debt).toBe(false);
    expect(result.schedule_adjustments).toEqual([{id: "debenture costs", amount: "-63224"}]);
    const extend = find(result, "extend-di");
    expect(extend.state).toBe("compared");
    expect(extend.exit_cost?.value).toBe("7714");
    expect(extend.after?.gross_debt).toBe(d("5670186").plus("745000").minus("715803").toFixed());
    expect(extend.uncovered_terms.some((term) => term.id === "new_debt_terms" && /indicative and not verified/.test(term.reason))).toBe(true);
    // cash after = cash + (new debt - nominal retired: 745.000 - 715.803 = 29.197 stays in cash) - exit premiums - upfront fee (1% of 745.000) - fees paid from cash
    expect(extend.after?.deductible_cash).toBe(d("1455809").plus("29197").minus("7714").minus("7450").minus("1500").toFixed());
    expect(extend.after?.contractual_net_debt).toBe(d("5699383").plus("14335").minus("235").minus(extend.after!.deductible_cash).toFixed());
    expect(extend.exit_cost?.mechanisms).toEqual([{seriesId: "deb-13-1", mechanism: "total_redemption_di"}, {seriesId: "deb-14-1", mechanism: "total_redemption_di"}]);
    expect(extend.effective_date).toBe("2026-09-04");
    expect(extend.temporal_note).toMatch(/stated at 2026-05-31; the new debt is dated 2026-09-04; the balances between the two dates are not rolled forward/);
    const rows = extend.concentration!;
    expect(rows.map((row) => row.period)).toEqual(["2026/27", "2027/28", "2028/29", "2029/30", "2030/31", "after 2031"]);
    expect(rows.find((row) => row.period === "2028/29")?.existing).toBe(d("1228475").minus("304160").toFixed());
    expect(rows.find((row) => row.period === "2029/30")?.existing).toBe(d("694497").minus("411643").toFixed());
    expect(rows.find((row) => row.period === "2030/31")?.existing).toBe("994544");
    // SAC, 60 months, 24 of grace, disbursed 04/09/2026: 36 principal payments of 745.000/36 from 04/10/2028; 8 fall before 31/05/2029.
    const instalment = d("745000").div(36);
    expect(d(rows.find((row) => row.period === "2028/29")!.proposed).toDecimalPlaces(2).toFixed()).toBe(instalment.times(8).toDecimalPlaces(2).toFixed());
    expect(d(rows.find((row) => row.period === "2029/30")!.proposed).toDecimalPlaces(2).toFixed()).toBe(instalment.times(12).toDecimalPlaces(2).toFixed());
    expect(d(rows.find((row) => row.period === "after 2031")!.proposed).toDecimalPlaces(2).toFixed()).toBe(instalment.times(4).toDecimalPlaces(2).toFixed());
    // The schedule after reconciles exactly: the rounding residual of the instalments sits with the last one.
    const consolidated = rows.reduce((sum, row) => sum.plus(row.consolidated), d(0));
    expect(consolidated.minus("63224").toFixed()).toBe(extend.after!.gross_debt);
    expect(extend.after?.anchors["retired:deb-13-1:2028/29:principal"]).toEqual({document: "escritura_13a_emissao.pdf", clause: "4.1", note: "304.160 debêntures de R$ 1.000"});
    // The retire-ipca alternative (blocked, unpriced) would leave two windows, one per instalment.
    expect(find(result, "retire-ipca").block_reasons[0]).toMatch(/exit cost is not priced for deb-13-2/);
    expect(result.trace.calculations.some((calculation) => calculation.id === "structure.debt_service_schedule:rounding_residual" && calculation.alternative === "extend-di")).toBe(true);
    for (const row of rows) expect(row.share_of_gross).toBe(d(row.consolidated).div(extend.after!.gross_debt).toDecimalPlaces(8).toFixed());
    expect(rows.every((row) => row.principal_coverage === null)).toBe(true);
    expect(result.unsupported).toContain("principal cover per period is not measured: no cash generation per period in the base");
    expect(extend.after?.cost.comparable_with_new_debt).toBe(true);
    expect(extend.new_debt_service?.all_in_cost).not.toBe("0.145");
    expect(extend.after?.anchors["retired:deb-13-1:2028/29:maturity"]).toEqual({document: "escritura_13a_emissao.pdf", clause: "7.7.1", note: "vencimento 14/11/2028"});
    expect(extend.after?.headroom_by_instrument.map((entry) => entry.instrument)).toEqual(["11ª emissão", "13ª emissão", "14ª emissão", "15ª emissão"]);
    expect(extend.after?.headroom_by_instrument.every((entry) => entry.state === "not_measured")).toBe(true);
    expect(extend.after?.anchors["schedule:2028/29"]).toEqual(itr(40, "nota 15, cronograma"));
    expect(extend.after?.anchors.feesPaidFromCash).toEqual({document: "03_Pedido_Simulado_CRA_2026.docx", page: 1, note: "custos de estruturação sintéticos"});
    expect(extend.after?.anchors.cost).toEqual({document: "anbima_ettj_2026-09-04.csv"});
    expect(find(result, "status-quo").uncovered_terms).toEqual([]);
  });

  it("does not measure headroom while the limit is unresolved or the comparison is conditional, and measures it against the contractual net debt once both hold", () => {
    const result = compareRefinancingBeforeAfter(camil());
    expect(result.before.headroom).toBeNull();
    expect(result.unsupported.some((entry) => /headroom is not measured for 13ª emissão/.test(entry))).toBe(true);
    const resolve = (covenant: BeforeAfterInput["covenants"][number]) => ({...covenant, state: "resolved" as const, comparability: "comparable" as const, tiers: covenant.tiers!.map((tier) => (tier.limit === "4.00" ? {...tier, applicability: "applicable" as const, condition: "quitação ordinária provada (hipótese de teste)"} : tier))});
    const resolved = camil();
    resolved.covenants = resolved.covenants.map(resolve);
    // A resolved and comparable limit whose tier is still conditional yields no headroom.
    const conditionalTier = camil();
    conditionalTier.covenants = conditionalTier.covenants.map((covenant) => ({...covenant, state: "resolved" as const, comparability: "comparable" as const}));
    expect(compareRefinancingBeforeAfter(conditionalTier).before.headroom).toBeNull();
    expect(compareRefinancingBeforeAfter(conditionalTier).unsupported.some((entry) => /tier conditional/.test(entry))).toBe(true);
    const measured = compareRefinancingBeforeAfter(resolved);
    expect(measured.before.headroom?.within_limit).toBe(false);
    expect(measured.before.headroom?.reading).toBe("interim");
    expect(measured.before.headroom?.note).toMatch(/measures annually, next on 2027-02-28; neither a breach nor a compliance/);
    expect(measured.before.headroom?.absolute).toBe(d("4").minus(d("4228477").div("895864").toDecimalPlaces(8)).toDecimalPlaces(8).toFixed());
    // Every instrument keeps its own reading; the tightest one is the headroom shown.
    expect(measured.before.headroom_by_instrument.filter((entry) => entry.state === "measured")).toHaveLength(4);
    const tighter = camil();
    tighter.covenants = tighter.covenants.map(resolve).map((covenant) => (covenant.instrument === "15ª emissão" ? {...covenant, limit: "3.50", tiers: [{limit: "3.50", applicability: "applicable" as const, condition: "hipótese: degrau de 3,50x ainda vigente"}]} : covenant));
    expect(compareRefinancingBeforeAfter(tighter).before.headroom?.instrument).toBe("15ª emissão");
    // On the measurement date itself the reading is the measurement, and without any tier evidence there is no headroom at all.
    const onDate = {...resolved, referenceDate: "2027-02-28", covenants: resolved.covenants.map((covenant) => ({...covenant, measurement: {frequency: "annual" as const, nextDate: "2027-02-28"}})), before: {...resolved.before, ltmEbitda: {...resolved.before.ltmEbitda!, periodStart: "2026-02-28", periodEnd: "2027-02-28"}}, alternatives: resolved.alternatives.map((alternative) => (alternative.newDebt ? {...alternative, newDebt: {...alternative.newDebt, disbursementDate: "2027-03-04"}} : alternative))};
    expect(compareRefinancingBeforeAfter(onDate).before.headroom?.reading).toBe("measurement_date");
    const noTier = {...resolved, covenants: resolved.covenants.map((covenant) => ({...covenant, tiers: null}))};
    expect(compareRefinancingBeforeAfter(noTier).before.headroom).toBeNull();
    expect(compareRefinancingBeforeAfter(noTier).unsupported.some((entry) => /tier evidence absent/.test(entry))).toBe(true);
  });

  it("blocks an alternative without a priced exit, carries its uncovered terms, and ranks the rest by the declared discriminator", () => {
    const result = compareRefinancingBeforeAfter(camil());
    const ipca = find(result, "retire-ipca");
    expect(ipca.state).toBe("blocked");
    expect(ipca.block_reasons[0]).toMatch(/exit cost is not priced for deb-13-2/);
    expect(ipca.uncovered_terms).toEqual([{id: "ipca_exit_quote", state: "insufficient_evidence", reason: "the alternative lacks ipca_exit_quote; carried as a gap, not filled"}]);
    expect(result.ranking?.discriminator).toBe("peak_concentration");
    // The SAC principal of the new debt lands twelve instalments in 2030/31, which becomes the peak (1.242.877 over 5.670.230); the status quo keeps 2026/27 at 21,69%.
    expect(find(result, "extend-di").after?.peak?.period).toBe("2030/31");
    expect(result.ranking?.order.map((entry) => entry.id)).toEqual(["status-quo", "extend-di"]);
    // The ranking shows the economic value (the peak share, positive) apart from the ordering score.
    expect(result.ranking?.order[0]?.value).toBe(find(result, "status-quo").after?.peak?.share_of_gross);
    expect(result.ranking?.order[0]?.score).toBe(d(find(result, "status-quo").after!.peak!.share_of_gross).negated().toFixed());
    expect(result.unsupported.some((entry) => /^retire-ipca: exit cost is not priced/.test(entry))).toBe(true);
  });

  it("refuses to rank existing debt against a new debt's all-in, and ranks all-in only among alternatives with new debt", () => {
    const base = camil();
    const mixed = compareRefinancingBeforeAfter({...base, ranking: {discriminator: "all_in_cost", rationale: "custo"}});
    expect(mixed.ranking).toBeNull();
    expect(mixed.unsupported).toContain("ranking by all_in_cost needs a new debt in every compared alternative; the cost of existing debt is another basis");
    const twoNew = compareRefinancingBeforeAfter({...base, alternatives: [base.alternatives[0]!, {...base.alternatives[0]!, id: "extend-di-twin", label: "Alongar, de novo"}], ranking: {discriminator: "all_in_cost", rationale: "custo"}});
    expect(twoNew.ranking?.order.map((entry) => entry.id)).toEqual(["extend-di", "extend-di-twin"]);
    // One alternative alone compares nothing.
    expect(() => compareRefinancingBeforeAfter({...base, alternatives: [base.alternatives[0]!]})).toThrow();
  });

  it("measures principal cover per period only when the base declares cash generation per period, and never repeats one figure", () => {
    const base = camil();
    base.before.cfadsByPeriod = {"2026/27": {value: "700000", anchor: {document: "fixture_hipotetico.md", note: "geração declarada, hipótese"}}, "2028/29": {value: "650000", anchor: {document: "fixture_hipotetico.md", note: "geração declarada, hipótese"}}};
    const result = compareRefinancingBeforeAfter(base);
    const rows = find(result, "status-quo").concentration!;
    expect(rows.find((row) => row.period === "2026/27")?.principal_coverage).toBe(d("700000").div("1229828").toDecimalPlaces(8).toFixed());
    expect(rows.find((row) => row.period === "2027/28")?.principal_coverage).toBeNull();
    // A period without declared generation stays a named gap of that alternative, never a silent null.
    expect(find(result, "status-quo").uncovered_terms.map((term) => term.id)).toContain("principal_coverage:2027/28");
    expect(result.unsupported.some((entry) => /principal cover per period is not measured: no cash generation per period in the base/.test(entry))).toBe(false);
  });

  it("blocks when the schedule does not reconcile to the gross debt, and refuses a retired series larger than its window or outside it", () => {
    const off = camil();
    off.before.schedule = off.before.schedule.filter((row) => row.kind !== "adjustment");
    const result = compareRefinancingBeforeAfter(off);
    expect(result.state).toBe("blocked");
    expect(result.block_reasons[0]).toMatch(/the schedule sums to 5733410 and the gross debt is 5670186/);
    expect(result.alternatives.every((alternative) => alternative.state === "blocked")).toBe(true);
    const wrongWindow = camil();
    wrongWindow.alternatives[0]!.retired![1]!.instalments[0]!.period = "2032/33";
    expect(() => compareRefinancingBeforeAfter(wrongWindow)).toThrow(/not a period of the schedule/);
    const tooLarge = camil();
    tooLarge.alternatives[0]!.retired![0]!.instalments[0]!.principal = {value: "1300000", basis: "contractual_nominal", anchor: itr(39)};
    // A carrying amount is not a principal, and a merely authorized funding is not a source.
    const carrying = camil();
    carrying.alternatives[0]!.retired![0]!.instalments[0]!.principal = {value: "306038", basis: "carrying_amount", anchor: itr(39, "saldo contábil")};
    expect(() => compareRefinancingBeforeAfter(carrying)).toThrow(/retires a carrying amount/);
    const authorized = camil();
    authorized.alternatives[0]!.newDebt!.termsSource = "authorized_only";
    expect(() => compareRefinancingBeforeAfter(authorized)).toThrow(/only authorized is not a source of principal/);
    const twins = camil();
    twins.before.schedule = twins.before.schedule.flatMap((row) => (row.period === "2027/28" ? [{...row, period: "2027/28 a", amount: "400000"}, {...row, period: "2027/28 b", amount: "376868"}] : [row]));
    expect(() => compareRefinancingBeforeAfter(twins)).toThrow(/share the end date/);
    // A price whose mechanism is not permitted on the date, or a price next to an exit gap, is not a price.
    const notPermitted = camil();
    notPermitted.alternatives[0]!.retired![0]!.exitPremium = {value: "2448", mechanism: "extraordinary_amortization_ipca", permittedOnDate: false, anchor: itr(40)};
    expect(() => compareRefinancingBeforeAfter(notPermitted)).toThrow(/not permitted on the date/);
    const pricedGap = camil();
    pricedGap.alternatives[2]!.retired![0]!.exitPremium = {value: "1", mechanism: "negotiated_offer", permittedOnDate: true, anchor: itr(40)};
    expect(() => compareRefinancingBeforeAfter(pricedGap)).toThrow(/carries a price and the alternative still lists an exit gap/);
    expect(find(compareRefinancingBeforeAfter(tooLarge), "extend-di").block_reasons[0]).toMatch(/cannot lose 1300000/);
    const negative = camil();
    negative.alternatives[0]!.newDebt!.amount = "-1";
    expect(() => compareRefinancingBeforeAfter(negative)).toThrow();
    const early = camil();
    early.alternatives[0]!.newDebt!.disbursementDate = "2026-01-01";
    expect(() => compareRefinancingBeforeAfter(early)).toThrow(/disbursed before the reference date/);
    // Without an open-ended bucket, principal beyond the last dated period blocks the alternative instead of landing in that period.
    const closed = camil();
    closed.before.schedule = closed.before.schedule.map((row) => (row.period === "after 2031" ? {...row, endsAt: "2032-05-31"} : row));
    expect(find(compareRefinancingBeforeAfter(closed), "extend-di").state).toBe("compared");
    closed.alternatives[0]!.newDebt!.termMonths = 120;
    closed.alternatives[0]!.newDebt!.graceMonths = 24;
    expect(find(compareRefinancingBeforeAfter(closed), "extend-di").block_reasons[0]).toMatch(/beyond the last dated period, and the schedule has no open-ended bucket/);
  });

  it("does not measure leverage with a missing or non-positive EBITDA and refuses a mismatched unit", () => {
    const none = camil();
    none.before.ltmEbitda = null;
    const result = compareRefinancingBeforeAfter(none);
    expect(result.before.leverage).toBeNull();
    expect(result.unsupported).toContain("leverage is not measured: no EBITDA with a definition in the base");
    const zero = camil();
    zero.before.ltmEbitda = {...zero.before.ltmEbitda!, value: "0"};
    expect(compareRefinancingBeforeAfter(zero).unsupported).toContain("leverage is not measured: the EBITDA in the base is zero or negative");
    const unit = camil();
    (unit as {unit: string}).unit = "BRL thousands";
    expect(() => compareRefinancingBeforeAfter(unit)).toThrow();
    // Relabelling the scale while every figure stays the same is refused: the unit anchor names R$ mil.
    const relabelled = camil();
    relabelled.unit = "BRL million";
    expect(() => compareRefinancingBeforeAfter(relabelled)).toThrow(/does not name the unit BRL million/);
    const tiered = camil();
    tiered.covenants = tiered.covenants.map((covenant) => ({...covenant, measurement: {frequency: "annual" as const, nextDate: "2026-02-28"}}));
    expect(() => compareRefinancingBeforeAfter(tiered)).toThrow(/cannot precede the reference date/);
    const impossibleDate = camil();
    impossibleDate.referenceDate = "2026-02-30";
    expect(() => compareRefinancingBeforeAfter(impossibleDate)).toThrow(/not a calendar date/);
    const quarter = camil();
    quarter.before.ltmEbitda = {...quarter.before.ltmEbitda!, periodStart: "2026-02-28"};
    expect(() => compareRefinancingBeforeAfter(quarter)).toThrow(/not twelve months/);
    const overThreshold = camil();
    overThreshold.wallThreshold = {...overThreshold.wallThreshold, share: "1.2"};
    expect(() => compareRefinancingBeforeAfter(overThreshold)).toThrow(/between 0 and 1/);
    // Fees the base does not state are unknown: the all-in is not computed and the gap is named.
    const noFees = camil();
    noFees.alternatives[0]!.feesPaidFromCash = null;
    const unknownFees = find(compareRefinancingBeforeAfter(noFees), "extend-di");
    expect(unknownFees.state).toBe("compared");
    expect(unknownFees.new_debt_service?.all_in_cost).toBeNull();
    expect(unknownFees.after?.cost.comparable_with_new_debt).toBe(false);
    expect(unknownFees.uncovered_terms.map((term) => term.id)).toContain("fees_paid_from_cash");
  });

  it("produces no ranking without a declared discriminator, ranks by peak amount when asked, and names ties by id rather than merit", () => {
    const base = camil();
    expect(compareRefinancingBeforeAfter({...base, ranking: null}).unsupported).toContain("no ranking: the discriminator was not declared");
    const statusQuo = base.alternatives.find((alternative) => alternative.id === "status-quo")!;
    const tie = compareRefinancingBeforeAfter({...base, alternatives: [statusQuo, {...statusQuo, id: "status-quo-twin", label: "Manter, de novo"}], ranking: {discriminator: "peak_amount", rationale: "empate"}});
    expect(tie.ranking?.order.map((entry) => entry.id)).toEqual(["status-quo", "status-quo-twin"]);
    expect(tie.ranking?.order[1]?.reason).toMatch(/tied with the best on peak_amount; ordered by id/);
  });

  it("is consistent under twenty permutations of alternatives, retired series, schedule rows and key order", () => {
    const first = compareRefinancingBeforeAfter(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.alternatives = seed % 2 ? [...shuffled.alternatives].reverse() : [shuffled.alternatives[2]!, shuffled.alternatives[0]!, shuffled.alternatives[1]!];
      shuffled.alternatives.find((alternative) => alternative.id === "extend-di")!.retired!.reverse();
      shuffled.before.schedule = seed % 3 ? [...shuffled.before.schedule].reverse() : shuffled.before.schedule;
      shuffled.alternatives = shuffled.alternatives.map((alternative) => ({...alternative, uncoveredTerms: alternative.uncoveredTerms ? [...alternative.uncoveredTerms].reverse() : alternative.uncoveredTerms}));
      const again = compareRefinancingBeforeAfter(seed % 4 ? reversedKeys(shuffled) : shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(compareRefinancingBeforeAfter(camil()) as unknown as Record<string, unknown>, "refinance/compare-refinancing-before-after.md")).toEqual([]);
  });
});
