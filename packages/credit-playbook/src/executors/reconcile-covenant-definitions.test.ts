import {describe, expect, it} from "vitest";

import {nextMeasurement, reconcileCovenantDefinitions, type CovenantReconciliationInput} from "./reconcile-covenant-definitions";

/** Camil, four live indentures (answer key section 13.1). Balances of 31/05/2026 in R$ thousand; anchors per clause and page. */
const netDebt = "somatória da rubrica de empréstimos, financiamentos e debêntures no passivo circulante e não circulante, mais a rubrica de operações com derivativos do passivo circulante e não circulante, bem como qualquer outra rubrica que se refira à dívida onerosa da Emissora, menos a soma de disponibilidades, aplicações financeiras (circulante e não circulante) e operações com derivativos do ativo, com base no balanço patrimonial consolidado";
const ebitda = "lucro antes das receitas e despesas financeiras acrescidos da amortização e depreciação ao longo dos últimos 12 meses, conforme reportado nas demonstrações financeiras";
const contractual = ["loans_and_financings", "debentures", "derivative_liabilities", "other_onerous_debt", "cash_and_equivalents", "financial_investments", "derivative_assets"] as const;
type Instrument = Extract<CovenantReconciliationInput["instruments"][number], {source: "indenture"}>;
const indenture = (id: string, document: string, definitions: {clause: string; netDebtPage: number; ebitdaPage: number}, tierPages: [number, number], references: string[], adjustments: Instrument["ebitdaAdjustments"] = [], tierClause = "7.24.3(VIII)"): Instrument => ({
  source: "indenture", id, indexName: "Dívida Líquida/EBITDA", netDebtDefinition: netDebt, netDebtComponents: [...contractual], ebitdaDefinition: ebitda, ebitdaAdjustments: adjustments,
  measurement: {frequency: "annual", basis: "demonstrações consolidadas auditadas do exercício encerrado em fevereiro", fiscalYearEnd: "02-28"},
  tiers: [
    {limit: "3.50", condition: {type: "until_reference_settled", referenceInstruments: references}, anchor: {document, clause: `${tierClause}(a)`, page: tierPages[0]}},
    {limit: "4.00", condition: {type: "after_reference_settled", referenceInstruments: references}, anchor: {document, clause: `${tierClause}(b)`, page: tierPages[1]}},
  ],
  definitionAnchors: {netDebt: {document, clause: definitions.clause, page: definitions.netDebtPage}, ebitda: {document, clause: definitions.clause, page: definitions.ebitdaPage}},
});
const itr = (page: number, note?: string) => (note ? {document: "01_ITR_1T26_31mai2026.pdf", page, note} : {document: "01_ITR_1T26_31mai2026.pdf", page});
const asOf = "2026-05-31";
const unit = "BRL thousand" as const;
const componentValues: CovenantReconciliationInput["componentValues"] = [
  {component: "loans_and_financings", covers: ["loans_and_financings", "debentures"], value: "5670186", unit, asOf, anchor: itr(39, "15: empréstimos, financiamentos e debêntures, total consolidado")},
  {component: "derivative_liabilities", covers: ["derivative_liabilities"], value: "14335", unit, asOf, anchor: itr(51, "25")},
  {component: "derivative_assets", covers: ["derivative_assets"], value: "235", unit, asOf, anchor: itr(51, "25")},
  {component: "cash_and_equivalents", covers: ["cash_and_equivalents"], value: "1430714", unit, asOf, anchor: itr(20, "3")},
  {component: "financial_investments", covers: ["financial_investments"], value: "25095", unit, asOf, anchor: itr(11, "balanço patrimonial consolidado, aplicações financeiras circulante e não circulante")},
  // Known in the base and absent from every definition: the legal question the method must keep open.
  {component: "leases", covers: ["leases"], value: "276768", unit, asOf, anchor: itr(12, "balanço patrimonial consolidado, passivo de arrendamento circulante 67.399 e não circulante 209.369")},
];
const adjustments11: Instrument["ebitdaAdjustments"] = [
  {id: "acquired-ebitda", kind: "denominator_addition", description: "EBITDA dos últimos doze meses de sociedade adquirida nos doze meses anteriores", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 35}},
  {id: "sellers-finance", kind: "numerator_obligation", description: "obrigações a pagar decorrentes da aquisição (sellers finance)", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 35}},
];
const settlement = (state: "ordinary" | "unknown" | "outstanding" | "accelerated"): NonNullable<CovenantReconciliationInput["referenceSettlements"]> => [
  {instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: state, settlementDate: state === "ordinary" || state === "accelerated" ? "2025-04-15" : null, anchor: {document: "af_11a_emissao.pdf", note: "limite 4,000 aplicado ao exercício 2025/2026, confirmação indireta"}},
  {instrument: "cra-eco-5", maturityDate: "2025-04-16", settlement: state, settlementDate: state === "ordinary" || state === "accelerated" ? "2025-04-16" : null, anchor: {document: "af_13a_emissao.pdf"}},
  {instrument: "cra-eco-257", maturityDate: "2025-12-29", settlement: state, settlementDate: state === "ordinary" || state === "accelerated" ? "2025-12-29" : null, anchor: {document: "cra_257_relatorio_mensal_4t25.pdf", note: "saldo devedor até novembro de 2025; vencimento em 29/12/2025"}},
];
const camil = (state: "ordinary" | "unknown" | "outstanding" | "accelerated"): CovenantReconciliationInput => ({
  asOfDate: asOf,
  unit,
  instruments: [
    indenture("deb-11", "escritura_11a_emissao.pdf", {clause: "4.22.3(j)", netDebtPage: 35, ebitdaPage: 35}, [34, 34], ["cra-eco-8"], adjustments11, "4.22.3(j)"),
    indenture("deb-13", "escritura_13a_emissao.pdf", {clause: "1.1", netDebtPage: 7, ebitdaPage: 8}, [54, 55], ["cra-eco-5", "cra-eco-257"], [], "7.24.3(VIII)"),
    indenture("deb-14", "escritura_14a_emissao.pdf", {clause: "1.1", netDebtPage: 7, ebitdaPage: 8}, [54, 54], ["cra-eco-5", "cra-eco-257"], [], "7.26.3(VIII)"),
    indenture("deb-15", "escritura_15a_emissao.pdf", {clause: "1.1", netDebtPage: 7, ebitdaPage: 8}, [56, 56], ["cra-eco-257"], [], "7.26.3(VIII)"),
  ],
  referenceSettlements: settlement(state),
  componentValues,
  ltmEbitda: null,
  // The ITR enumerates loans, financings, debentures, derivatives, cash and investments; it never reproduces "qualquer outra dívida onerosa".
  reported: {value: "4.72", asOf, definition: "dívida líquida da nota 15 sobre EBITDA dos últimos doze meses, pro forma", netDebtComponents: ["loans_and_financings", "debentures", "derivative_liabilities", "derivative_assets", "cash_and_equivalents", "financial_investments"], ebitdaOpening: null, anchor: itr(40, "15")},
});

/** Deterministic permutation, different at every step. */
const permute = <T>(items: readonly T[], seed: number): T[] => {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
};
const by = (result: ReturnType<typeof reconcileCovenantDefinitions>, id: string) => result.covenants.find((covenant) => covenant.instrument === id)!;
const withoutLeases = (input: CovenantReconciliationInput): CovenantReconciliationInput => ({...input, componentValues: [...input.componentValues!.filter((line) => line.component !== "leases"), {component: "other_onerous_debt", covers: ["other_onerous_debt"], value: "0", unit, asOf, anchor: itr(39, "hipotético: nenhuma outra dívida onerosa enumerada")}]});

describe("reconcile-covenant-definitions executor (v9)", () => {
  it("gold: net debt by each indenture's own definition is 4.228.477 through financial-core, one anchor per operand, implied EBITDA traced", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    for (const covenant of result.covenants) {
      expect(covenant.netDebtByDefinition?.value).toBe("4228477");
      expect(covenant.netDebtByDefinition?.residualAssumedZero).toBe(true);
      expect(covenant.netDebtByDefinition?.anchors.financial_investments?.page).toBe(11);
      expect(covenant.netDebtByDefinition?.anchors.derivative_assets?.page).toBe(51);
      expect(covenant.index?.basis).toBe("reported");
      expect(covenant.index?.ebitda?.basis).toBe("implied_from_reported");
      expect(covenant.index?.ebitda?.value.startsWith("895863.77")).toBe(true);
      expect(covenant.definitions?.anchors.netDebt.page).not.toBe(covenant.definitions?.anchors.ebitda.page === 8 ? 8 : -1);
    }
    expect(result.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.debt_views"))).toHaveLength(4);
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.debt_views:deb-13")?.operands["debentures+loans_and_financings"]).toBe("5670186");
    expect(by(result, "deb-13").netDebtByDefinition?.formula).toMatch(/^debentures\+loans_and_financings \+ derivative_liabilities/);
    expect(by(result, "deb-13").definitions?.anchors).toEqual({netDebt: {document: "escritura_13a_emissao.pdf", clause: "1.1", page: 7}, ebitda: {document: "escritura_13a_emissao.pdf", clause: "1.1", page: 8}});
    expect(by(result, "deb-11").definitions?.anchors.netDebt.page).toBe(35);
  });

  it("gold: maturity ended the 3.50x tiers, the 4.00x tiers stay unproven with a written condition each, no limit resolves and no headroom exists", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    expect(result.state).toBe("conditioned");
    for (const covenant of result.covenants) {
      expect(covenant.applicableLimit).toBeNull();
      expect(covenant.limitState).toBe("insufficient_evidence");
      expect(covenant.headroom).toBeNull();
      expect(covenant.status).toBe("unresolved");
      expect(covenant.measurement?.nextMeasurementDate).toBe("2027-02-28");
      expect(covenant.tiers.map((tier) => tier.state)).toEqual(["ended", "unproven"]);
      expect(covenant.limitConditions).toHaveLength(1);
    }
    expect(result.unproven_conditions).toHaveLength(4);
    expect(by(result, "deb-13").tiers.map((tier) => tier.anchor.page)).toEqual([54, 55]);
    expect(by(result, "deb-15").tiers.map((tier) => tier.anchor.page)).toEqual([56, 56]);
    expect(JSON.stringify(result)).not.toMatch(/breach|rompid/i);
  });

  it("gold: the known lease liability raises a legal condition on every indenture, sellers finance stays a separate numerator obligation, and the comparison is conditional", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    for (const covenant of result.covenants) {
      expect(covenant.comparability).toBe("conditional");
      expect(covenant.legalConditions.some((condition) => condition.includes("lease liabilities (276768"))).toBe(true);
    }
    const deb11 = by(result, "deb-11");
    expect(deb11.definitions?.ebitdaAdjustments.map((adjustment) => adjustment.kind)).toEqual(["denominator_addition", "numerator_obligation"]);
    expect(deb11.legalConditions.some((condition) => condition.includes("sellers-finance") && condition.includes("no dated value"))).toBe(true);
    expect(deb11.netDebtByDefinition?.numeratorObligations).toBeNull();
    expect(result.legal_conditions.filter((condition) => condition.startsWith("deb-11:"))).toHaveLength(2);
    expect(by(result, "deb-13").comparabilityReasons).toEqual(expect.arrayContaining([expect.stringMatching(/other_onerous_debt/), expect.stringMatching(/does not open the EBITDA/)]));
  });

  it("hypothetical, not gold: dated ordinary settlement resolves 4.00x; the comparison stays conditional until the EBITDA is opened", () => {
    const result = reconcileCovenantDefinitions(camil("ordinary"));
    const deb13 = by(result, "deb-13");
    expect(deb13.applicableLimit).toBe("4.00");
    expect(deb13.tiers.map((tier) => tier.state)).toEqual(["ended", "applies"]);
    expect(deb13.comparability).toBe("conditional");
    expect(deb13.headroom).toBeNull();
    expect(result.unproven_conditions).toHaveLength(0);
  });

  it("hypothetical, not gold: residual enumerated, EBITDA opened and consistent, no lease in the base: headroom from financial-core; the 11th stays conditional on its numerator obligation", () => {
    const base = withoutLeases(camil("ordinary"));
    const opened: CovenantReconciliationInput = {...base, reported: {...base.reported!, netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", unit, asOf, months: 12, anchor: itr(40, "15, hipotético")}}};
    const result = reconcileCovenantDefinitions(opened);
    const deb13 = by(result, "deb-13");
    expect(deb13.comparability).toBe("comparable");
    expect(deb13.headroom?.absolute).toBe("-0.72");
    expect(deb13.headroom?.relative).toBe("-0.18");
    expect(deb13.status).toBe("above_limit_interim");
    expect(result.trace.calculations.some((calculation) => calculation.id === "financial.net_leverage:deb-13:check")).toBe(true);
    const deb11 = by(result, "deb-11");
    expect(deb11.comparability).toBe("conditional");
    expect(deb11.headroom).toBeNull();
    const priced: CovenantReconciliationInput = {...opened, instruments: opened.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: [adjustments11[0]!, {...adjustments11[1]!, obligation: {value: "100000", asOf, anchor: itr(47, "hipotético: obrigação por aquisição")}}]} : instrument)};
    const pricedResult = reconcileCovenantDefinitions(priced);
    expect(by(pricedResult, "deb-11").netDebtByDefinition?.value).toBe("4328477");
    expect(by(pricedResult, "deb-11").comparability).toBe("conditional");
    expect(by(pricedResult, "deb-11").legalConditions.some((condition) => condition.includes("added to net debt at 100000"))).toBe(true);
    expect(by(pricedResult, "deb-11").netDebtByDefinition?.anchors["obligation:sellers-finance"]?.page).toBe(47);
    expect(by(pricedResult, "deb-11").netDebtByDefinition?.operands["obligation:sellers-finance"]).toBe("100000");
  });

  it("mutation: an opening that does not reproduce the reported index, an opening dated elsewhere, or an EBITDA of zero refuse the comparison", () => {
    const base = withoutLeases(camil("ordinary"));
    const inconsistent = reconcileCovenantDefinitions({...base, reported: {...base.reported!, netDebtComponents: [...contractual], ebitdaOpening: {value: "1200000", unit, asOf, months: 12, anchor: itr(40)}}});
    expect(by(inconsistent, "deb-13").comparability).toBe("not_comparable");
    expect(by(inconsistent, "deb-13").comparabilityReasons.some((reason) => reason.includes("does not reproduce the reported index"))).toBe(true);
    expect(() => reconcileCovenantDefinitions({...base, reported: {...base.reported!, ebitdaOpening: {value: "895864", unit, asOf: "2026-02-28", months: 12, anchor: itr(40)}}})).toThrow(/dated at the as-of date/);
    const zero = reconcileCovenantDefinitions({...base, reported: null, ltmEbitda: {value: "0", unit, asOf, months: 12, incorporatesAdjustments: [], anchor: itr(40)}});
    expect(by(zero, "deb-13").index).toBeNull();
    expect(by(zero, "deb-13").comparability).toBe("not_comparable");
    expect(() => reconcileCovenantDefinitions({...base, ltmEbitda: {value: "895864", unit: "BRL million", asOf, months: 12, incorporatesAdjustments: [], anchor: itr(40)}})).toThrow(/one unit per base/);
  });

  it("mutation: a definition that adds leases changes the computed net debt, and one that drops derivatives changes it the other way", () => {
    const base = camil("unknown");
    const withLeases: CovenantReconciliationInput = {...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-15" ? {...instrument, netDebtDefinition: `${instrument.netDebtDefinition}, mais os passivos de arrendamento`, netDebtComponents: [...contractual, "leases"]} : instrument)};
    const result = reconcileCovenantDefinitions(withLeases);
    expect(by(result, "deb-15").netDebtByDefinition?.value).toBe("4505245");
    expect(by(result, "deb-13").netDebtByDefinition?.value).toBe("4228477");
    expect(by(result, "deb-15").legalConditions.some((condition) => condition.includes("lease liabilities"))).toBe(false);
    expect(by(result, "deb-15").comparability).toBe("not_comparable");
    const noDerivatives: CovenantReconciliationInput = {...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-14" ? {...instrument, netDebtComponents: ["loans_and_financings", "debentures", "cash_and_equivalents", "financial_investments"]} : instrument)};
    const again = reconcileCovenantDefinitions(noDerivatives);
    expect(by(again, "deb-14").netDebtByDefinition?.value).toBe("4214377");
    expect(by(again, "deb-14").comparability).toBe("not_comparable");
  });

  it("mutation: on the computed path the 11th stays conditional until the opened EBITDA states its denominator additions and the obligation is valued", () => {
    const base = withoutLeases(camil("ordinary"));
    const opened: CovenantReconciliationInput = {...base, reported: null, ltmEbitda: {value: "895864", unit, asOf, months: 12, incorporatesAdjustments: [], anchor: itr(40, "hipotético")}};
    const result = reconcileCovenantDefinitions(opened);
    expect(by(result, "deb-11").comparability).toBe("conditional");
    expect(by(result, "deb-11").index?.basis).toBe("computed_from_components");
    // The residual is enumerated at zero and no lease sits in the base: the 13th is fully comparable on the computed path.
    expect(by(result, "deb-13").comparability).toBe("comparable");
    const stated: CovenantReconciliationInput = {...opened, ltmEbitda: {...opened.ltmEbitda!, incorporatesAdjustments: ["acquired-ebitda", "sellers-finance"]}};
    const stillOpen = reconcileCovenantDefinitions(stated);
    // Declaring the numerator obligation as "incorporated" in the EBITDA changes nothing: it is not a denominator item.
    expect(by(stillOpen, "deb-11").comparability).toBe("conditional");
    expect(by(stillOpen, "deb-13").comparability).toBe("comparable");
    expect(by(stillOpen, "deb-13").headroom).not.toBeNull();
  });

  it("mutation: undated settlements (ordinary or accelerated), an old reported index, a component dated elsewhere and duplicate ids are refused or not comparable", () => {
    const base = camil("unknown");
    const old = reconcileCovenantDefinitions({...base, reported: {...base.reported!, asOf: "2026-02-28"}});
    expect(by(old, "deb-13").comparability).toBe("not_comparable");
    expect(() => reconcileCovenantDefinitions({...base, componentValues: componentValues.map((line, index) => index === 0 ? {...line, asOf: "2026-02-28"} : line)})).toThrow(/not the as-of date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [{instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: "ordinary", anchor: {document: "x"}}]})).toThrow(/needs its date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [{instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: "accelerated", anchor: {document: "x"}}]})).toThrow(/needs its date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [...settlement("unknown"), settlement("unknown")[0]!]})).toThrow(/duplicate settlement fact/);
    expect(() => reconcileCovenantDefinitions({...base, instruments: [...base.instruments, base.instruments[1]!]})).toThrow(/duplicate instrument/);
    expect(() => reconcileCovenantDefinitions({...base, reported: {...base.reported!, asOf: "2026-06-30"}})).toThrow(/after the as-of date/);
  });

  it("mutation: the next measurement follows the stated frequency, including a leap year end", () => {
    expect(nextMeasurement("2026-05-31", "02-28", "annual")).toBe("2027-02-28");
    expect(nextMeasurement("2026-05-31", "02-28", "semiannual")).toBe("2026-08-31");
    expect(nextMeasurement("2026-05-31", "02-28", "quarterly")).toBe("2026-08-31");
    expect(nextMeasurement("2027-05-30", "02-28", "annual")).toBe("2028-02-29");
    expect(nextMeasurement("2026-12-31", "12-31", "quarterly")).toBe("2027-03-31");
    const base = camil("unknown");
    const quarterly = reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-15" ? {...instrument, measurement: {...instrument.measurement, frequency: "quarterly"}} : instrument)});
    expect(by(quarterly, "deb-15").measurement?.nextMeasurementDate).toBe("2026-08-31");
  });

  it("mutation: outstanding after maturity ends 3.50x and leaves 4.00x unproven; accelerated keeps 3.50x; an isolated until tier without facts stays unproven with a condition", () => {
    const outstanding = reconcileCovenantDefinitions(camil("outstanding"));
    expect(by(outstanding, "deb-13").tiers.map((tier) => tier.state)).toEqual(["ended", "unproven"]);
    expect(by(outstanding, "deb-13").applicableLimit).toBeNull();
    expect(by(outstanding, "deb-13").limitConditions[0]).toMatch(/recorded as outstanding/);
    const accelerated = reconcileCovenantDefinitions(camil("accelerated"));
    expect(by(accelerated, "deb-13").applicableLimit).toBe("3.50");
    expect(by(accelerated, "deb-13").tiers.map((tier) => tier.state)).toEqual(["applies", "unproven"]);
    const base = camil("unknown");
    const isolated = reconcileCovenantDefinitions({...base, referenceSettlements: [], instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-15" ? {...instrument, tiers: [instrument.tiers[0]!]} : instrument)});
    expect(by(isolated, "deb-15").tiers.map((tier) => tier.state)).toEqual(["unproven"]);
    expect(by(isolated, "deb-15").limitConditions).toHaveLength(1);
  });

  it("hypothetical: a minimum-direction covenant measures headroom the other way round", () => {
    const base = withoutLeases(camil("ordinary"));
    const minimum: CovenantReconciliationInput = {
      ...base,
      instruments: [{...(base.instruments[1] as Instrument), id: "deb-min", direction: "minimum", tiers: [{limit: "6.00", condition: {type: "unconditional"}, anchor: {document: "hipotetico.pdf", clause: "7.24.3(VIII)(c)", page: 1}}]}],
      reported: {...base.reported!, netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", unit, asOf, months: 12, anchor: itr(40)}},
    };
    const result = reconcileCovenantDefinitions(minimum);
    expect(by(result, "deb-min").headroom?.absolute).toBe("-1.28");
    expect(by(result, "deb-min").status).toBe("above_limit_interim");
  });

  it("a trustee report without the indenture keeps its limit and measurement, without headroom", () => {
    const result = reconcileCovenantDefinitions({asOfDate: asOf, unit, instruments: [{source: "trustee_report", id: "af-12", indexName: "Dívida Líquida/EBITDA", reportedLimit: "4.00", reportedMeasurement: {value: "4.08", asOf: "2026-02-28"}, anchor: {document: "af_12a_emissao.pdf", page: 3}}], componentValues, reported: camil("unknown").reported});
    const covenant = result.covenants[0]!;
    expect(covenant.limitState).toBe("reported_by_trustee");
    expect(covenant.reportedMeasurement).toEqual({value: "4.08", asOf: "2026-02-28"});
    expect(covenant.headroom).toBeNull();
    expect(result.state).toBe("conditioned");
  });

  it("mutation: a uniform relabel of the scale changes the output fingerprint, and the unit travels with every calculation", () => {
    const base = camil("unknown");
    const first = reconcileCovenantDefinitions(base);
    const relabeled = reconcileCovenantDefinitions({...base, unit: "BRL million", componentValues: base.componentValues!.map((line) => ({...line, unit: "BRL million" as const}))});
    expect(first.unit).toBe("BRL thousand");
    expect(relabeled.unit).toBe("BRL million");
    expect(relabeled.trace.outputFingerprint).not.toBe(first.trace.outputFingerprint);
    expect(first.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.debt_views")).every((calculation) => calculation.unit === "BRL thousand")).toBe(true);
    expect(first.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.net_leverage") || calculation.id.startsWith("structure.covenant_headroom")).every((calculation) => calculation.unit === "x")).toBe(true);
    expect(first.trace.calculations.find((calculation) => calculation.id === "financial.implied_ebitda:deb-13")?.result.startsWith("895863.77")).toBe(true);
  });

  it("mutation: with two references, the 3.50x tier ends at the first maturity while the other is alive, and a future-dated settlement is not a fact yet", () => {
    const base = camil("unknown");
    const between: CovenantReconciliationInput = {
      ...base, asOfDate: "2025-06-01", reported: null,
      componentValues: base.componentValues!.map((line) => ({...line, asOf: "2025-06-01"})),
      referenceSettlements: [
        {instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: "unknown", anchor: {document: "x"}},
        {instrument: "cra-eco-5", maturityDate: "2025-04-16", settlement: "unknown", anchor: {document: "x"}},
        {instrument: "cra-eco-257", maturityDate: "2025-12-29", settlement: "ordinary", settlementDate: "2025-12-29", anchor: {document: "x"}},
      ],
    };
    const result = reconcileCovenantDefinitions(between);
    expect(by(result, "deb-13").tiers.map((tier) => tier.state)).toEqual(["ended", "not_yet"]);
    expect(by(result, "deb-13").applicableLimit).toBeNull();
    expect(by(result, "deb-15").tiers.map((tier) => tier.state)).toEqual(["applies", "not_yet"]);
    expect(by(result, "deb-15").applicableLimit).toBe("3.50");
  });

  it("mutation: duplicate adjustment ids, a component covered twice and a non twelve-month EBITDA are refused", () => {
    const base = camil("unknown");
    expect(() => reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: [...adjustments11, adjustments11[0]!]} : instrument)})).toThrow(/duplicate adjustment/);
    expect(() => reconcileCovenantDefinitions({...base, componentValues: [...componentValues, {component: "debentures", covers: ["debentures"], value: "1", unit, asOf, anchor: itr(39)}]})).toThrow(/covered twice/);
    expect(() => reconcileCovenantDefinitions({...base, ltmEbitda: {value: "895864", unit, asOf, months: 3 as unknown as 12, incorporatesAdjustments: [], anchor: itr(40)}})).toThrow();
  });

  it("mutation: a missing component, a residual without a line, a zero opening or a different perimeter never yield headroom", () => {
    const base = withoutLeases(camil("ordinary"));
    const opened: CovenantReconciliationInput = {...base, reported: {...base.reported!, netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", unit, asOf, months: 12, anchor: itr(40)}}};
    expect(by(reconcileCovenantDefinitions(opened), "deb-13").headroom).not.toBeNull();
    const missing = reconcileCovenantDefinitions({...opened, componentValues: opened.componentValues!.filter((line) => line.component !== "derivative_liabilities")});
    expect(by(missing, "deb-13").comparability).toBe("not_comparable");
    expect(by(missing, "deb-13").headroom).toBeNull();
    const residualOpen = reconcileCovenantDefinitions({...opened, componentValues: opened.componentValues!.filter((line) => line.component !== "other_onerous_debt")});
    expect(by(residualOpen, "deb-13").comparability).toBe("conditional");
    expect(by(residualOpen, "deb-13").headroom).toBeNull();
    const zeroOpening = reconcileCovenantDefinitions({...opened, reported: {...opened.reported!, ebitdaOpening: {value: "0", unit, asOf, months: 12, anchor: itr(40)}}});
    expect(by(zeroOpening, "deb-13").comparability).toBe("not_comparable");
    expect(by(zeroOpening, "deb-13").headroom).toBeNull();
    const parent = reconcileCovenantDefinitions({...opened, reported: {...opened.reported!, perimeter: "parent"}});
    expect(by(parent, "deb-13").comparability).toBe("not_comparable");
    expect(by(parent, "deb-13").comparabilityReasons.some((reason) => reason.includes("perimeter"))).toBe(true);
  });

  it("mutation: an adjustment without a typed side never resolves comparability, and a line mixing debt and deductions is refused", () => {
    const base = withoutLeases(camil("ordinary"));
    const opened: CovenantReconciliationInput = {...base, reported: null, ltmEbitda: {value: "895864", unit, asOf, months: 12, incorporatesAdjustments: ["untyped"], anchor: itr(40)}, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-13" ? {...instrument, ebitdaAdjustments: [{id: "untyped", kind: "other", description: "ajuste sem lado definido", anchor: {document: "escritura_13a_emissao.pdf", clause: "1.1", page: 8}}]} : instrument)};
    const result = reconcileCovenantDefinitions(opened);
    expect(by(result, "deb-13").comparability).toBe("conditional");
    expect(by(result, "deb-13").headroom).toBeNull();
    expect(by(result, "deb-13").comparabilityReasons.some((reason) => reason.includes("no typed economic side"))).toBe(true);
    expect(() => reconcileCovenantDefinitions({...base, componentValues: [...base.componentValues!.filter((line) => line.component !== "financial_investments"), {component: "financial_investments", covers: ["financial_investments", "debentures"], value: "500", unit, asOf, anchor: itr(11)}]})).toThrow(/aggregates debt and deductions|covered twice/);
  });

  it("mutation: a definition text that never names a structured component is refused; lines or an opened EBITDA of another perimeter are not comparable; the implied EBITDA ignores numerator obligations", () => {
    const base = withoutLeases(camil("ordinary"));
    expect(() => reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-13" ? {...instrument, netDebtComponents: [...contractual, "leases"]} : instrument)})).toThrow(/never names the component leases/);
    const parentLines = reconcileCovenantDefinitions({...base, reported: null, ltmEbitda: {value: "895864", unit, asOf, months: 12, incorporatesAdjustments: [], anchor: itr(40)}, componentValues: base.componentValues!.map((line) => line.component === "cash_and_equivalents" ? {...line, perimeter: "parent" as const} : line)});
    expect(by(parentLines, "deb-13").netDebtByDefinition).toBeNull();
    expect(by(parentLines, "deb-13").comparabilityReasons.some((reason) => reason.includes("parent perimeter"))).toBe(true);
    const parentEbitda = reconcileCovenantDefinitions({...base, reported: null, ltmEbitda: {value: "895864", unit, perimeter: "parent", asOf, months: 12, incorporatesAdjustments: [], anchor: itr(40)}});
    expect(by(parentEbitda, "deb-13").comparability).toBe("not_comparable");
    const valued = reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: [adjustments11[0]!, {...adjustments11[1]!, obligation: {value: "100000", asOf, anchor: itr(47, "hipotético")}}]} : instrument)});
    expect(by(valued, "deb-11").netDebtByDefinition?.value).toBe("4328477");
    expect(by(valued, "deb-11").index?.ebitda?.value.startsWith("895863.77")).toBe(true);
  });

  it("blocks on an empty base and still carries the declared unit", () => {
    const result = reconcileCovenantDefinitions({asOfDate: asOf, unit, instruments: []});
    expect(result.state).toBe("blocked");
    expect(result.block_reasons[0]).toMatch(/nothing to reconcile/);
    expect(result.unit).toBe("BRL thousand");
  });

  it("names a proven acceleration as a note, never as an unproven condition; refuses a tier anchor without a numbered clause; puts the input fingerprint inside the output fingerprint", () => {
    const accelerated = reconcileCovenantDefinitions(camil("accelerated"));
    expect(accelerated.unproven_conditions).toHaveLength(0);
    expect(by(accelerated, "deb-13").notes.some((note) => note.includes("settled by acceleration on a proven date"))).toBe(true);
    const base = camil("unknown");
    expect(() => reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-13" ? {...instrument, tiers: instrument.tiers.map((tier) => ({...tier, anchor: {...tier.anchor, clause: "índice financeiro, degrau"}}))} : instrument)})).toThrow(/numbered clause/);
    const first = reconcileCovenantDefinitions(base);
    const unusedAnchor = reconcileCovenantDefinitions({...base, referenceSettlements: base.referenceSettlements!.map((fact) => fact.instrument === "cra-eco-8" ? {...fact, anchor: {document: "outro_documento.pdf"}} : fact)});
    expect(unusedAnchor.trace.inputFingerprint).not.toBe(first.trace.inputFingerprint);
    expect(unusedAnchor.trace.outputFingerprint).not.toBe(first.trace.outputFingerprint);
    const standalone = reconcileCovenantDefinitions({...base, componentValues: []});
    expect(by(standalone, "deb-13").index?.ebitda).toBeNull();
  });

  it("is consistent under twenty permutations, with the trace inside the output fingerprint", () => {
    const first = reconcileCovenantDefinitions(camil("unknown"));
    for (let seed = 1; seed <= 20; seed += 1) {
      const base = camil("unknown");
      const shuffled: CovenantReconciliationInput = {
        ...base,
        instruments: permute(base.instruments, seed).map((instrument) => instrument.source === "indenture"
          ? {...instrument, netDebtComponents: permute(instrument.netDebtComponents, seed + 1), ebitdaAdjustments: permute(instrument.ebitdaAdjustments ?? [], seed + 2), tiers: instrument.tiers.map((tier) => tier.condition.type === "unconditional" ? tier : {...tier, condition: {...tier.condition, referenceInstruments: permute(tier.condition.referenceInstruments, seed + 3)}})}
          : instrument),
        referenceSettlements: permute(base.referenceSettlements ?? [], seed + 4),
        componentValues: permute(base.componentValues ?? [], seed + 5).map((line) => ({...line, covers: permute(line.covers, seed + 6)})),
        reported: {...base.reported!, netDebtComponents: permute(base.reported!.netDebtComponents, seed + 7)},
      };
      const again = reconcileCovenantDefinitions(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
      expect(again.trace.calculations).toEqual(first.trace.calculations);
    }
  });
});
