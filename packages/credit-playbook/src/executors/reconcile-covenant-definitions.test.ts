import {describe, expect, it} from "vitest";

import {contractMismatch} from "./contract";

import {nextMeasurement, reconcileCovenantDefinitions, type CovenantReconciliationInput} from "./reconcile-covenant-definitions";
import {netDebt, ebitda, contractual, Instrument, indenture, itr, asOf, unit, componentValues, adjustments11, settlement, camil, permute, by, withoutLeases} from "../cases/gc01/reconcile-covenant-definitions";

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
    const opened: CovenantReconciliationInput = {...base, reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", unit, asOf, months: 12, anchor: itr(40, "15, hipotético")}}};
    const result = reconcileCovenantDefinitions(opened);
    const deb13 = by(result, "deb-13");
    // The legal veto is consolidated: the sellers finance of the 11th stays open, so no instrument of the run has a headroom, the 13th included.
    expect(deb13.comparability).toBe("conditional");
    expect(deb13.comparabilityReasons.some((reason) => /legal condition stands on another instrument of the same base/.test(reason))).toBe(true);
    expect(deb13.headroom).toBeNull();
    expect(result.trace.calculations.some((calculation) => calculation.id === "financial.net_leverage:deb-13:check")).toBe(true);
    // Once no legal condition stands anywhere, the 13th measures its headroom from financial-core.
    const cleared = reconcileCovenantDefinitions({...opened, instruments: opened.instruments.map((instrument) => (instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: (instrument.ebitdaAdjustments ?? []).filter((adjustment) => adjustment.kind !== "numerator_obligation")} : instrument))});
    expect(by(cleared, "deb-13").comparability).toBe("comparable");
    expect(by(cleared, "deb-13").headroom?.absolute).toBe("-0.72");
    expect(by(cleared, "deb-13").headroom?.relative).toBe("-0.18");
    expect(by(cleared, "deb-13").status).toBe("above_limit_interim");
    const deb11 = by(result, "deb-11");
    expect(deb11.comparability).toBe("conditional");
    expect(deb11.headroom).toBeNull();
    const priced: CovenantReconciliationInput = {...opened, instruments: opened.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: [adjustments11[0]!, {...adjustments11[1]!, obligation: {value: "100000", unit, asOf, anchor: itr(47, "hipotético: obrigação por aquisição")}}]} : instrument)};
    const pricedResult = reconcileCovenantDefinitions(priced);
    expect(by(pricedResult, "deb-11").netDebtByDefinition?.value).toBe("4328477");
    expect(by(pricedResult, "deb-11").comparability).toBe("conditional");
    expect(by(pricedResult, "deb-11").legalConditions.some((condition) => condition.includes("added to net debt at 100000"))).toBe(true);
    expect(by(pricedResult, "deb-11").netDebtByDefinition?.anchors["obligation:sellers-finance"]?.page).toBe(47);
    expect(by(pricedResult, "deb-11").netDebtByDefinition?.operands["obligation:sellers-finance"]).toBe("100000");
  });

  it("mutation: an opening that does not reproduce the reported index, an opening dated elsewhere, or an EBITDA of zero refuse the comparison", () => {
    const base = withoutLeases(camil("ordinary"));
    const inconsistent = reconcileCovenantDefinitions({...base, reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", netDebtComponents: [...contractual], ebitdaOpening: {value: "1200000", unit, asOf, months: 12, anchor: itr(40)}}});
    expect(by(inconsistent, "deb-13").comparability).toBe("not_comparable");
    expect(by(inconsistent, "deb-13").comparabilityReasons.some((reason) => reason.includes("does not reproduce the reported index"))).toBe(true);
    expect(() => reconcileCovenantDefinitions({...base, reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", ebitdaOpening: {value: "895864", unit, asOf: "2026-02-28", months: 12, anchor: itr(40)}}})).toThrow(/dated at the as-of date/);
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
    // Dropping the derivatives from the structured list while the clause still names them is a disagreement between clause and list: refused, not silently computed at 4.214.377.
    const noDerivatives: CovenantReconciliationInput = {...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-14" ? {...instrument, netDebtComponents: ["loans_and_financings", "debentures", "cash_and_equivalents", "financial_investments"]} : instrument)};
    expect(() => reconcileCovenantDefinitions(noDerivatives)).toThrow(/the clause adds derivative liabilities and the structured components omit them/);
  });

  it("mutation: on the computed path the 11th stays conditional until the opened EBITDA states its denominator additions and the obligation is valued", () => {
    const base = withoutLeases(camil("ordinary"));
    const opened: CovenantReconciliationInput = {...base, reported: null, ltmEbitda: {value: "895864", unit, asOf, months: 12, incorporatesAdjustments: [], anchor: itr(40, "hipotético")}};
    const result = reconcileCovenantDefinitions(opened);
    expect(by(result, "deb-11").comparability).toBe("conditional");
    expect(by(result, "deb-11").index?.basis).toBe("computed_from_components");
    // The residual is enumerated at zero and no lease sits in the base, but the 11th's obligation is a legal condition of the whole base: the 13th stays conditional until it is classified.
    expect(by(result, "deb-13").comparability).toBe("conditional");
    const stated: CovenantReconciliationInput = {...opened, ltmEbitda: {...opened.ltmEbitda!, incorporatesAdjustments: ["acquired-ebitda", "sellers-finance"]}};
    const stillOpen = reconcileCovenantDefinitions(stated);
    // Declaring the numerator obligation as "incorporated" in the EBITDA changes nothing: it is not a denominator item.
    expect(by(stillOpen, "deb-11").comparability).toBe("conditional");
    expect(by(stillOpen, "deb-13").comparability).toBe("conditional"); // the obligation, once valued, still needs legal review: the consolidated veto keeps every instrument conditional
    expect(by(stillOpen, "deb-13").headroom).toBeNull(); // valued or not, the obligation needs legal review: no headroom anywhere while it stands
  });

  it("mutation: undated settlements (ordinary or accelerated), an old reported index, a component dated elsewhere and duplicate ids are refused or not comparable", () => {
    const base = camil("unknown");
    const old = reconcileCovenantDefinitions({...base, reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", asOf: "2026-02-28"}});
    expect(by(old, "deb-13").comparability).toBe("not_comparable");
    expect(() => reconcileCovenantDefinitions({...base, componentValues: componentValues.map((line, index) => index === 0 ? {...line, asOf: "2026-02-28"} : line)})).toThrow(/not the as-of date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [{instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: "ordinary", anchor: {document: "x"}}]})).toThrow(/needs its date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [{instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement: "accelerated", anchor: {document: "x"}}]})).toThrow(/needs its date/);
    expect(() => reconcileCovenantDefinitions({...base, referenceSettlements: [...settlement("unknown"), settlement("unknown")[0]!]})).toThrow(/duplicate settlement fact/);
    expect(() => reconcileCovenantDefinitions({...base, instruments: [...base.instruments, base.instruments[1]!]})).toThrow(/duplicate instrument/);
    expect(() => reconcileCovenantDefinitions({...base, reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", asOf: "2026-06-30"}})).toThrow(/after the as-of date/);
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
    expect(by(accelerated, "deb-13").tiers.map((tier) => tier.state)).toEqual(["applies", "n/a"]);
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
      reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", unit, asOf, months: 12, anchor: itr(40)}},
    };
    const result = reconcileCovenantDefinitions(minimum);
    expect(by(result, "deb-min").headroom?.absolute).toBe("-1.28");
    expect(by(result, "deb-min").status).toBe("above_limit_interim");
  });

  it("a trustee report without the indenture keeps its limit and measurement, without headroom", () => {
    const result = reconcileCovenantDefinitions({asOfDate: asOf, unit, unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"}, instruments: [{source: "trustee_report", id: "af-12", indexName: "Dívida Líquida/EBITDA", reportedLimit: "4.00", reportedMeasurement: {value: "4.08", asOf: "2026-02-28"}, anchor: {document: "af_12a_emissao.pdf", page: 3}}], componentValues, reported: camil("unknown").reported});
    const covenant = result.covenants[0]!;
    expect(covenant.limitState).toBe("reported_by_trustee");
    expect(covenant.reportedMeasurement).toEqual({value: "4.08", asOf: "2026-02-28"});
    expect(covenant.headroom).toBeNull();
    expect(result.state).toBe("conditioned");
  });

  it("mutation: a uniform relabel of the scale changes the output fingerprint, and the unit travels with every calculation", () => {
    const base = camil("unknown");
    const first = reconcileCovenantDefinitions(base);
    // A uniform relabel against an anchor that says thousands is refused outright.
    expect(() => reconcileCovenantDefinitions({...base, unit: "BRL million", componentValues: base.componentValues!.map((line) => ({...line, unit: "BRL million" as const}))})).toThrow(/does not name the unit BRL million/);
    expect(first.unit).toBe("BRL thousand");
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
    const opened: CovenantReconciliationInput = {...base, reported: {...base.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", netDebtComponents: [...contractual], ebitdaOpening: {value: "895864", unit, asOf, months: 12, anchor: itr(40)}}};
    // With the 11th's obligation cleared, the 13th has a headroom; each mutation below takes it away.
    const clearedOpened: CovenantReconciliationInput = {...opened, instruments: opened.instruments.map((instrument) => (instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: (instrument.ebitdaAdjustments ?? []).filter((adjustment) => adjustment.kind !== "numerator_obligation")} : instrument))};
    expect(by(reconcileCovenantDefinitions(clearedOpened), "deb-13").headroom).not.toBeNull();
    const missing = reconcileCovenantDefinitions({...clearedOpened, componentValues: clearedOpened.componentValues!.filter((line) => line.component !== "derivative_liabilities")});
    expect(by(missing, "deb-13").comparability).toBe("not_comparable");
    expect(by(missing, "deb-13").headroom).toBeNull();
    const residualOpen = reconcileCovenantDefinitions({...opened, componentValues: opened.componentValues!.filter((line) => line.component !== "other_onerous_debt")});
    expect(by(residualOpen, "deb-13").comparability).toBe("conditional");
    expect(by(residualOpen, "deb-13").headroom).toBeNull();
    const zeroOpening = reconcileCovenantDefinitions({...opened, reported: {...opened.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", ebitdaOpening: {value: "0", unit, asOf, months: 12, anchor: itr(40)}}});
    expect(by(zeroOpening, "deb-13").comparability).toBe("not_comparable");
    expect(by(zeroOpening, "deb-13").headroom).toBeNull();
    const parent = reconcileCovenantDefinitions({...opened, reported: {...opened.reported!, definition: "dívida líquida contratual: empréstimos e financiamentos, debêntures, instrumentos financeiros derivativos passivos menos derivativos ativos, qualquer outra dívida onerosa, menos caixa e equivalentes e aplicações financeiras", perimeter: "parent"}});
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
    const valued = reconcileCovenantDefinitions({...base, instruments: base.instruments.map((instrument) => instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: [adjustments11[0]!, {...adjustments11[1]!, obligation: {value: "100000", unit, asOf, anchor: itr(47, "hipotético")}}]} : instrument)});
    expect(by(valued, "deb-11").netDebtByDefinition?.value).toBe("4328477");
    expect(by(valued, "deb-11").index?.ebitda?.value.startsWith("895863.77")).toBe(true);
  });

  it("blocks on an empty base and still carries the declared unit", () => {
    const result = reconcileCovenantDefinitions({asOfDate: asOf, unit, unitAnchor: {document: "01_ITR_1T26_31mai2026.pdf", page: 39, note: "nota 15, valores em R$ mil"}, instruments: []});
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

  it("emits exactly the top-level outputs the method declares", () => {
    expect(contractMismatch(reconcileCovenantDefinitions(camil("ordinary")) as unknown as Record<string, unknown>, "financial/reconcile-covenant-definitions.md")).toEqual([]);
  });

  it("mutation: an accelerated settlement of one reference with another reference without facts leaves the tier unproven with a written condition, never resolved", () => {
    const mixed = camil("accelerated");
    // cra-eco-257 loses its facts: the 13th, 14th and 15th reference it and cannot resolve their tiers.
    mixed.referenceSettlements = mixed.referenceSettlements!.filter((fact) => fact.instrument !== "cra-eco-257");
    const result = reconcileCovenantDefinitions(mixed);
    const deb13 = by(result, "deb-13");
    expect(deb13.limitState).toBe("insufficient_evidence");
    expect(deb13.tiers.map((tier) => tier.state)).toEqual(["unproven", "unproven"]);
    expect(deb13.limitConditions.some((condition) => /lacks them for cra-eco-257; an accelerated settlement of another reference does not settle the question/.test(condition))).toBe(true);
    expect(result.unproven_conditions.filter((condition) => condition.startsWith("deb-13:")).length).toBe(2);
    // The 11th references only cra-eco-8, settled by acceleration: 3,50x stays and 4,00x is n/a deterministically, with a note and no condition.
    const deb11 = by(result, "deb-11");
    expect(deb11.tiers.map((tier) => tier.state)).toEqual(["applies", "n/a"]);
    expect(result.unproven_conditions.some((condition) => condition.startsWith("deb-11:"))).toBe(false);
  });

  it("gold: the acquisition payables of note 16 are carried as a candidate for the sellers finance obligation, never added and never called absent", () => {
    const input = camil("unknown");
    input.candidateObligations = [
      {id: "note16-acquisition-cost", description: "contas a pagar por aquisição de investimentos, custo de aquisição", value: "27119", unit, asOf, relatedAdjustmentId: "sellers-finance", anchor: itr(41, "nota 16")},
      {id: "note16-contingent", description: "contas a pagar por aquisição de investimentos, passivo contingente", value: "51290", unit, asOf, relatedAdjustmentId: "sellers-finance", anchor: itr(41, "nota 16")},
    ];
    const result = reconcileCovenantDefinitions(input);
    expect(result.uncovered_terms.map((term) => term.id)).toEqual(["candidate:note16-acquisition-cost", "candidate:note16-contingent", "obligation:deb-11:sellers-finance"]);
    expect(result.uncovered_terms[0]?.reason).toMatch(/27119 BRL thousand at 2026-05-31 .*needs legal classification; not added to any numerator/);
    const deb11 = by(result, "deb-11");
    expect(deb11.legalConditions.some((condition) => /has no classified value; the base holds 27119 BRL thousand .* and 51290 BRL thousand/.test(condition))).toBe(true);
    expect(deb11.legalConditions.some((condition) => /no dated value/.test(condition))).toBe(false);
    expect(deb11.netDebtByDefinition?.formula.includes("obligation")).toBe(false);
    const without = reconcileCovenantDefinitions(camil("unknown"));
    expect(without.uncovered_terms.map((term) => term.id)).toEqual(["obligation:deb-11:sellers-finance"]);
    expect(without.trace.inputFingerprint).not.toBe(result.trace.inputFingerprint);
  });

  it("mutation: the literal reported definition must name every component it claims, and a reported index of another date implies no EBITDA", () => {
    const literal = camil("unknown");
    literal.reported = {...literal.reported!, definition: "somente caixa e equivalentes"};
    expect(() => reconcileCovenantDefinitions(literal)).toThrow(/never names the component loans_and_financings|literal definition and the structured components disagree/);
    const old = camil("unknown");
    old.reported = {...old.reported!, asOf: "2026-02-28"};
    const result = reconcileCovenantDefinitions(old);
    const deb13 = by(result, "deb-13");
    expect(deb13.comparability).toBe("not_comparable");
    expect(deb13.index?.ebitda).toBeNull();
    expect(deb13.comparabilityReasons.some((reason) => /no EBITDA is implied from a reported index that is not comparable/.test(reason))).toBe(true);
    expect(result.trace.calculations.some((calculation) => calculation.id.startsWith("financial.implied_ebitda:"))).toBe(false);
  });

  it("mutation: a reported definition that names a component the structured list omits, derivatives without their side, and a candidate in another unit or date are refused", () => {
    const omitted = camil("unknown");
    omitted.reported = {...omitted.reported!, netDebtComponents: ["loans_and_financings", "debentures", "derivative_liabilities", "derivative_assets", "cash_and_equivalents"]};
    expect(() => reconcileCovenantDefinitions(omitted)).toThrow(/names financial_investments and the structured components omit it/);
    const sideless = camil("unknown");
    sideless.reported = {...sideless.reported!, definition: "dívida líquida da nota 15 (empréstimos e financiamentos, debêntures, derivativos, caixa e equivalentes e aplicações financeiras) sobre EBITDA"};
    expect(() => reconcileCovenantDefinitions(sideless)).toThrow(/mentions derivatives without their side/);
    const otherUnit = camil("unknown");
    otherUnit.candidateObligations = [{id: "c", description: "candidata em outra escala", value: "27", unit: "BRL million", asOf, relatedAdjustmentId: "sellers-finance", anchor: itr(41, "nota 16")}];
    expect(() => reconcileCovenantDefinitions(otherUnit)).toThrow(/stated in BRL million, not the base unit/);
    const otherDate = camil("unknown");
    otherDate.candidateObligations = [{id: "c", description: "candidata de outra data", value: "27119", unit, asOf: "2026-02-28", relatedAdjustmentId: "sellers-finance", anchor: itr(41, "nota 16")}];
    expect(() => reconcileCovenantDefinitions(otherDate)).toThrow(/dated 2026-02-28, not the as-of date/);
  });

  it("mutation: derivatives listed on a side the clause never names are refused, a known maturity ends the until tier whatever the other reference's facts, an obligation in another unit and duplicate candidates are refused", () => {
    const onlyLiabilities = camil("unknown");
    onlyLiabilities.instruments = onlyLiabilities.instruments.map((instrument) => (instrument.source === "indenture" && instrument.id === "deb-13" ? {...instrument, netDebtDefinition: "empréstimos e financiamentos, debêntures e instrumentos financeiros derivativos passivos, menos caixa e equivalentes e aplicações financeiras", netDebtComponents: ["loans_and_financings", "debentures", "derivative_liabilities", "derivative_assets", "cash_and_equivalents", "financial_investments"]} : instrument));
    expect(() => reconcileCovenantDefinitions(onlyLiabilities)).toThrow(/deduct derivative assets and the clause never names them/);
    // cra-eco-5 matured on 16/04/2025 (facts known); cra-eco-257 loses its facts: the 13th's until tier still ends at the first maturity.
    const firstMaturity = camil("ordinary");
    firstMaturity.referenceSettlements = firstMaturity.referenceSettlements!.filter((fact) => fact.instrument !== "cra-eco-257");
    const result = reconcileCovenantDefinitions(firstMaturity);
    expect(by(result, "deb-13").tiers.map((tier) => tier.state)).toEqual(["ended", "unproven"]);
    const otherUnit = camil("unknown");
    otherUnit.instruments = otherUnit.instruments.map((instrument) => (instrument.source === "indenture" && instrument.id === "deb-11" ? {...instrument, ebitdaAdjustments: instrument.ebitdaAdjustments!.map((adjustment) => (adjustment.kind === "numerator_obligation" ? {...adjustment, obligation: {value: "78", unit: "BRL million" as const, asOf, anchor: itr(41, "nota 16")}} : adjustment))} : instrument));
    expect(() => reconcileCovenantDefinitions(otherUnit)).toThrow(/stated in BRL million, not the base unit/);
    const duplicates = camil("unknown");
    duplicates.candidateObligations = [{id: "c", description: "a", value: "1", unit, asOf, relatedAdjustmentId: null, anchor: itr(41)}, {id: "c", description: "b", value: "2", unit, asOf, relatedAdjustmentId: null, anchor: itr(41)}];
    expect(() => reconcileCovenantDefinitions(duplicates)).toThrow(/duplicate candidate c/);
  });
});
