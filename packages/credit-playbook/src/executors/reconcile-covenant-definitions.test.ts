import {describe, expect, it} from "vitest";

import {nextMeasurement, reconcileCovenantDefinitions, type CovenantReconciliationInput} from "./reconcile-covenant-definitions";

/** Camil, four live indentures (answer key section 13.1). Balances of 31/05/2026 in R$ thousand; anchors per clause. */
const netDebt = "empréstimos, financiamentos e debêntures (circulante e não circulante) mais derivativos passivos e qualquer outra dívida onerosa, menos caixa e equivalentes, aplicações financeiras (circulante e não circulante) e derivativos ativos, pelo balanço consolidado";
const ebitda = "lucro antes das receitas e despesas financeiras mais depreciação e amortização dos últimos doze meses, conforme reportado";
const contractual = ["loans_and_financings", "debentures", "derivative_liabilities", "other_onerous_debt", "cash_and_equivalents", "financial_investments", "derivative_assets"] as const;
type Instrument = Extract<CovenantReconciliationInput["instruments"][number], {source: "indenture"}>;
const indenture = (id: string, document: string, definitions: {clause: string; page: number}, tierPages: [number, number], references: string[], adjustments: Instrument["ebitdaAdjustments"] = []): Instrument => ({
  source: "indenture", id, indexName: "Dívida Líquida/EBITDA", netDebtDefinition: netDebt, netDebtComponents: [...contractual], ebitdaDefinition: ebitda, ebitdaAdjustments: adjustments,
  measurement: {frequency: "annual", basis: "demonstrações consolidadas auditadas do exercício encerrado em fevereiro", fiscalYearEnd: "02-28"},
  tiers: [
    {limit: "3.50", condition: {type: "until_reference_settled", referenceInstruments: references}, anchor: {document, clause: "índice financeiro, degrau 3,50x", page: tierPages[0]}},
    {limit: "4.00", condition: {type: "after_reference_settled", referenceInstruments: references}, anchor: {document, clause: "índice financeiro, degrau 4,00x", page: tierPages[1]}},
  ],
  definitionsAnchor: {document, clause: definitions.clause, page: definitions.page},
});
const itr = (page: number, note?: string) => (note ? {document: "01_ITR_1T26_31mai2026.pdf", page, note} : {document: "01_ITR_1T26_31mai2026.pdf", page});
const asOf = "2026-05-31";
const componentValues: CovenantReconciliationInput["componentValues"] = [
  {component: "loans_and_financings", covers: ["loans_and_financings", "debentures"], value: "5670186", asOf, anchor: itr(39, "15: empréstimos, financiamentos e debêntures, total consolidado")},
  {component: "derivative_liabilities", covers: ["derivative_liabilities"], value: "14335", asOf, anchor: itr(51, "25")},
  {component: "derivative_assets", covers: ["derivative_assets"], value: "235", asOf, anchor: itr(51, "25")},
  {component: "cash_and_equivalents", covers: ["cash_and_equivalents"], value: "1430714", asOf, anchor: itr(20, "3")},
  {component: "financial_investments", covers: ["financial_investments"], value: "25095", asOf, anchor: itr(11, "balanço patrimonial consolidado, aplicações financeiras circulante e não circulante")},
];
const adjustments11: Instrument["ebitdaAdjustments"] = [
  {id: "acquired-ebitda", kind: "denominator_addition", description: "EBITDA dos últimos doze meses de sociedade adquirida nos doze meses anteriores", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 34}},
  {id: "sellers-finance", kind: "numerator_obligation", description: "obrigações a pagar decorrentes da aquisição (sellers finance)", anchor: {document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 34}},
];
const settlement = (state: "ordinary" | "unknown" | "outstanding" | "accelerated"): NonNullable<CovenantReconciliationInput["referenceSettlements"]> => [
  {instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: state, settlementDate: state === "ordinary" ? "2025-04-15" : null, anchor: {document: "af_11a_emissao.pdf", note: "limite 4,000 aplicado ao exercício 2025/2026, confirmação indireta"}},
  {instrument: "cra-eco-5", maturityDate: "2025-04-16", settlement: state, settlementDate: state === "ordinary" ? "2025-04-16" : null, anchor: {document: "af_13a_emissao.pdf"}},
  {instrument: "cra-eco-257", maturityDate: "2025-12-29", settlement: state, settlementDate: state === "ordinary" ? "2025-12-29" : null, anchor: {document: "cra_257_relatorio_mensal_4t25.pdf", note: "saldo devedor até novembro de 2025; vencimento em 29/12/2025"}},
];
const camil = (state: "ordinary" | "unknown" | "outstanding" | "accelerated"): CovenantReconciliationInput => ({
  asOfDate: asOf,
  instruments: [
    indenture("deb-11", "escritura_11a_emissao.pdf", {clause: "4.22.3(j)", page: 34}, [33, 34], ["cra-eco-8"], adjustments11),
    indenture("deb-13", "escritura_13a_emissao.pdf", {clause: "1.1", page: 7}, [54, 54], ["cra-eco-5", "cra-eco-257"]),
    indenture("deb-14", "escritura_14a_emissao.pdf", {clause: "1.1", page: 7}, [53, 54], ["cra-eco-5", "cra-eco-257"]),
    indenture("deb-15", "escritura_15a_emissao.pdf", {clause: "1.1", page: 8}, [55, 55], ["cra-eco-257"]),
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

describe("reconcile-covenant-definitions executor (v3)", () => {
  it("gold: net debt by each indenture's own definition is 4.228.477 with one anchor per operand, and the implied EBITDA is traced", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    for (const covenant of result.covenants) {
      expect(covenant.netDebtByDefinition?.value).toBe("4228477");
      expect(covenant.netDebtByDefinition?.residualAssumedZero).toBe(true);
      expect(covenant.netDebtByDefinition?.anchors.financial_investments?.page).toBe(11);
      expect(covenant.netDebtByDefinition?.anchors.derivative_assets?.page).toBe(51);
      expect(covenant.index?.basis).toBe("reported");
      expect(covenant.index?.ebitda.basis).toBe("implied_from_reported");
      expect(covenant.index?.ebitda.value.startsWith("895863.77")).toBe(true);
    }
    expect(result.trace.calculations.filter((calculation) => calculation.id.startsWith("financial.debt_views"))).toHaveLength(4);
    expect(result.trace.calculations.find((calculation) => calculation.id === "financial.debt_views:deb-13")?.operands.loans_and_financings).toBe("5670186");
  });

  it("gold: with settlement unproven, both tiers of every indenture stay unproven, each with a written condition, and no headroom exists", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    expect(result.state).toBe("conditioned");
    for (const covenant of result.covenants) {
      expect(covenant.applicableLimit).toBeNull();
      expect(covenant.limitState).toBe("insufficient_evidence");
      expect(covenant.headroom).toBeNull();
      expect(covenant.status).toBe("unresolved");
      expect(covenant.measurement?.nextMeasurementDate).toBe("2027-02-28");
      expect(covenant.tiers.map((tier) => tier.state)).toEqual(["unproven", "unproven"]);
      expect(covenant.tiers.map((tier) => tier.anchor.page)).toHaveLength(2);
      expect(covenant.limitConditions).toHaveLength(2);
    }
    expect(result.unprovenConditions).toHaveLength(8);
    expect(by(result, "deb-11").definitions?.anchor).toEqual({document: "escritura_11a_emissao.pdf", clause: "4.22.3(j)", page: 34});
    expect(by(result, "deb-11").tiers[0]?.anchor.page).toBe(33);
    expect(JSON.stringify(result)).not.toMatch(/breach|rompid/i);
  });

  it("gold: the reported index is conditional (residual not enumerated, EBITDA not opened) and the 11th also carries its typed adjustments", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    for (const covenant of result.covenants) expect(covenant.comparability).toBe("conditional");
    expect(by(result, "deb-13").comparabilityReasons).toEqual(expect.arrayContaining([expect.stringMatching(/other_onerous_debt/), expect.stringMatching(/does not open the EBITDA/)]));
    const deb11 = by(result, "deb-11");
    expect(deb11.definitions?.ebitdaAdjustments.map((adjustment) => adjustment.kind)).toEqual(["denominator_addition", "numerator_obligation"]);
    expect(deb11.comparabilityReasons.some((reason) => reason.includes("sellers-finance") && reason.includes("numerator_obligation"))).toBe(true);
  });

  it("hypothetical, not gold: proven dated ordinary settlement resolves 4.00x, and the comparison stays conditional until the EBITDA is opened", () => {
    const result = reconcileCovenantDefinitions(camil("ordinary"));
    const deb13 = by(result, "deb-13");
    expect(deb13.applicableLimit).toBe("4.00");
    expect(deb13.tiers.map((tier) => tier.state)).toEqual(["ended", "applies"]);
    expect(deb13.comparability).toBe("conditional");
    expect(deb13.headroom).toBeNull();
    expect(result.unprovenConditions).toHaveLength(0);
  });

  it("hypothetical, not gold: with the residual enumerated and the EBITDA opened, headroom comes from financial-core and the status is interim", () => {
    const base = camil("ordinary");
    const opened: CovenantReconciliationInput = {...base, reported: {...base.reported!, netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", asOf, anchor: itr(40, "15, hipotético")}}};
    const result = reconcileCovenantDefinitions(opened);
    const deb13 = by(result, "deb-13");
    expect(deb13.comparability).toBe("comparable");
    expect(deb13.headroom?.absolute).toBe("-0.72");
    expect(deb13.headroom?.relative).toBe("-0.18");
    expect(deb13.status).toBe("above_limit_interim");
    const deb11 = by(result, "deb-11");
    expect(deb11.comparability).toBe("conditional");
    expect(deb11.headroom).toBeNull();
  });

  it("mutation: a definition that adds leases changes the computed net debt, and one that drops derivatives changes it the other way", () => {
    const base = camil("unknown");
    const withLeases: CovenantReconciliationInput = {
      ...base,
      instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-15" ? {...instrument, netDebtComponents: [...contractual, "leases"]} : instrument),
      componentValues: [...componentValues, {component: "leases", covers: ["leases"], value: "100000", asOf, anchor: itr(12, "hipotético")}],
    };
    const result = reconcileCovenantDefinitions(withLeases);
    expect(by(result, "deb-15").netDebtByDefinition?.value).toBe("4328477");
    expect(by(result, "deb-13").netDebtByDefinition?.value).toBe("4228477");
    expect(result.legalConditions.some((condition) => condition.startsWith("deb-13:") && condition.includes("lease liabilities"))).toBe(true);
    expect(by(result, "deb-15").comparability).toBe("not_comparable");
    const noDerivatives: CovenantReconciliationInput = {...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-14" ? {...instrument, netDebtComponents: ["loans_and_financings", "debentures", "cash_and_equivalents", "financial_investments"]} : instrument)};
    const again = reconcileCovenantDefinitions(noDerivatives);
    expect(by(again, "deb-14").netDebtByDefinition?.value).toBe("4214377");
    expect(by(again, "deb-14").comparability).toBe("not_comparable");
  });

  it("mutation: on the computed path the 11th stays conditional until the opened EBITDA states its adjustments", () => {
    const base = camil("ordinary");
    const opened: CovenantReconciliationInput = {...base, reported: null, ltmEbitda: {value: "895864", asOf, incorporatesAdjustments: [], anchor: itr(40, "hipotético")}};
    const result = reconcileCovenantDefinitions(opened);
    expect(by(result, "deb-11").comparability).toBe("conditional");
    expect(by(result, "deb-11").index?.basis).toBe("computed_from_components");
    expect(by(result, "deb-13").comparability).toBe("conditional");
    expect(by(result, "deb-13").comparabilityReasons.some((reason) => reason.includes("other_onerous_debt"))).toBe(true);
    const stated: CovenantReconciliationInput = {...opened, ltmEbitda: {...opened.ltmEbitda!, incorporatesAdjustments: ["acquired-ebitda", "sellers-finance"]}, componentValues: [...componentValues, {component: "other_onerous_debt", covers: ["other_onerous_debt"], value: "0", asOf, anchor: itr(39, "hipotético: nenhuma outra dívida onerosa")}]};
    const resolved = reconcileCovenantDefinitions(stated);
    expect(by(resolved, "deb-11").comparability).toBe("comparable");
    expect(by(resolved, "deb-11").headroom).not.toBeNull();
  });

  it("mutation: an old reported index, a component dated elsewhere, an undated ordinary settlement and duplicate ids are refused or not comparable", () => {
    const base = camil("unknown");
    const old = reconcileCovenantDefinitions({...base, reported: {...base.reported!, asOf: "2026-02-28"}});
    expect(by(old, "deb-13").comparability).toBe("not_comparable");
    expect(() => reconcileCovenantDefinitions({...base, componentValues: componentValues.map((line, index) => index === 0 ? {...line, asOf: "2026-02-28"} : line)})).toThrow(/not the as-of date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [{instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: "ordinary", anchor: {document: "x"}}]})).toThrow(/needs its date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [...settlement("unknown"), settlement("unknown")[0]!]})).toThrow(/duplicate settlement fact/);
    expect(() => reconcileCovenantDefinitions({...base, instruments: [...base.instruments, base.instruments[1]!]})).toThrow(/duplicate instrument/);
    expect(() => reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: [...adjustments11, adjustments11[0]!]} : instrument)})).toThrow(/duplicate adjustment/);
    expect(() => reconcileCovenantDefinitions({...base, reported: {...base.reported!, asOf: "2026-06-30"}})).toThrow(/after the as-of date/);
  });

  it("mutation: the next measurement follows the stated frequency", () => {
    expect(nextMeasurement("2026-05-31", "02-28", "annual")).toBe("2027-02-28");
    expect(nextMeasurement("2026-05-31", "02-28", "semiannual")).toBe("2026-08-31");
    expect(nextMeasurement("2026-05-31", "02-28", "quarterly")).toBe("2026-08-31");
    expect(nextMeasurement("2026-05-30", "02-28", "quarterly")).toBe("2026-05-31");
    expect(nextMeasurement("2026-12-31", "12-31", "quarterly")).toBe("2027-03-31");
    expect(nextMeasurement("2027-01-15", "02-28", "annual")).toBe("2027-02-28");
    const base = camil("unknown");
    const quarterly = reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-15" ? {...instrument, measurement: {...instrument.measurement, frequency: "quarterly"}} : instrument)});
    expect(by(quarterly, "deb-15").measurement?.nextMeasurementDate).toBe("2026-08-31");
    expect(by(quarterly, "deb-15").comparabilityReasons.some((reason) => reason.includes("quarterly"))).toBe(true);
  });

  it("mutation: an isolated until tier with missing facts leaves a written condition; an accelerated settlement keeps 3.50x", () => {
    const base = camil("unknown");
    const isolated = reconcileCovenantDefinitions({...base, referenceSettlements: [], instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-15" ? {...instrument, tiers: [instrument.tiers[0]!]} : instrument)});
    expect(by(isolated, "deb-15").tiers.map((tier) => tier.state)).toEqual(["unproven"]);
    expect(by(isolated, "deb-15").limitConditions).toHaveLength(1);
    expect(isolated.unprovenConditions.some((condition) => condition.startsWith("deb-15:"))).toBe(true);
    const accelerated = reconcileCovenantDefinitions(camil("accelerated"));
    expect(by(accelerated, "deb-13").applicableLimit).toBe("3.50");
    expect(by(accelerated, "deb-13").tiers.map((tier) => tier.state)).toEqual(["applies", "unproven"]);
  });

  it("a trustee report without the indenture keeps its limit and measurement, without headroom", () => {
    const result = reconcileCovenantDefinitions({asOfDate: asOf, instruments: [{source: "trustee_report", id: "af-12", indexName: "Dívida Líquida/EBITDA", reportedLimit: "4.00", reportedMeasurement: {value: "4.08", asOf: "2026-02-28"}, anchor: {document: "af_12a_emissao.pdf", page: 3}}], componentValues, reported: camil("unknown").reported});
    const covenant = result.covenants[0]!;
    expect(covenant.limitState).toBe("reported_by_trustee");
    expect(covenant.reportedMeasurement).toEqual({value: "4.08", asOf: "2026-02-28"});
    expect(covenant.headroom).toBeNull();
    expect(result.state).toBe("conditioned");
  });

  it("blocks on an empty base", () => {
    const result = reconcileCovenantDefinitions({asOfDate: asOf, instruments: []});
    expect(result.state).toBe("blocked");
    expect(result.blockReasons[0]).toMatch(/nothing to reconcile/);
  });

  it("is consistent under twenty permutations of instruments, facts, component lines, adjustments, references and reported components", () => {
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
    }
  });
});
