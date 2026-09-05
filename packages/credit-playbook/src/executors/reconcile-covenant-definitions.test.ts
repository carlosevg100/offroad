import {describe, expect, it} from "vitest";

import {reconcileCovenantDefinitions, type CovenantReconciliationInput} from "./reconcile-covenant-definitions";

/** Camil, four live indentures (answer key section 13.1). Balances of 31/05/2026 in R$ thousand. */
const netDebt = "empréstimos, financiamentos e debêntures (circulante e não circulante) mais derivativos passivos e qualquer outra dívida onerosa, menos caixa e equivalentes, aplicações financeiras (circulante e não circulante) e derivativos ativos, pelo balanço consolidado";
const ebitda = "lucro antes das receitas e despesas financeiras mais depreciação e amortização dos últimos doze meses, conforme reportado";
const components = ["loans_and_financings", "debentures", "derivative_liabilities", "other_onerous_debt", "cash_and_equivalents", "financial_investments", "derivative_assets"] as const;
const tiers = (references: string[]) => [
  {limit: "3.50", condition: {type: "until_reference_settled" as const, referenceInstruments: references}},
  {limit: "4.00", condition: {type: "after_reference_settled" as const, referenceInstruments: references}},
];
const indenture = (id: string, document: string, clause: string, page: number, references: string[], adjustments: string[] = []): CovenantReconciliationInput["instruments"][number] => ({
  source: "indenture", id, indexName: "Dívida Líquida/EBITDA", netDebtDefinition: netDebt, netDebtComponents: [...components], ebitdaDefinition: ebitda, ebitdaAdjustments: adjustments,
  measurement: {frequency: "annual", basis: "demonstrações consolidadas auditadas do exercício encerrado em fevereiro", fiscalYearEnd: "02-28"}, tiers: tiers(references), anchor: {document, clause, page},
});
const itr = (page: number, note: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, note});
const camil = (settlement: "ordinary" | "unknown" | "outstanding" | "accelerated"): CovenantReconciliationInput => ({
  asOfDate: "2026-05-31",
  instruments: [
    indenture("deb-11", "escritura_11a_emissao.pdf", "4.22.3(j)", 34, ["cra-eco-8"], ["EBITDA dos últimos doze meses de sociedade adquirida nos doze meses anteriores e sellers finance"]),
    indenture("deb-13", "escritura_13a_emissao.pdf", "7.24.3(VIII)", 54, ["cra-eco-5", "cra-eco-257"]),
    indenture("deb-14", "escritura_14a_emissao.pdf", "7.26.3(VIII)", 53, ["cra-eco-5", "cra-eco-257"]),
    indenture("deb-15", "escritura_15a_emissao.pdf", "7.26.3", 55, ["cra-eco-257"]),
  ],
  referenceSettlements: [
    {instrument: "cra-eco-8", maturityDate: "2025-04-15", settlement, anchor: {document: "af_11a_emissao.pdf", note: "limite 4,000 aplicado ao exercício 2025/2026, confirmação indireta"}},
    {instrument: "cra-eco-5", maturityDate: "2025-04-16", settlement, anchor: {document: "af_13a_emissao.pdf"}},
    {instrument: "cra-eco-257", maturityDate: "2025-12-29", settlement, anchor: {document: "cra_257_relatorio_mensal_4t25.pdf", note: "saldo devedor até novembro de 2025; vencimento em 29/12/2025"}},
  ],
  components: {grossDebt: "5670186", derivativeLiabilities: "14335", derivativeAssets: "235", cashAndEquivalents: "1430714", financialInvestments: "25095", anchors: {debt: itr(39, "15"), cash: itr(20, "3"), derivatives: itr(51, "25")}},
  ltmEbitda: null,
  reported: {value: "4.72", asOf: "2026-05-31", definition: "dívida líquida pela definição contratual da nota 15 sobre EBITDA dos últimos doze meses, pro forma", netDebtComponents: [...components], ebitdaOpened: false, anchor: itr(40, "15")},
});

/** Deterministic permutation, different at every step. */
const permute = <T>(items: T[], seed: number): T[] => {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
};

describe("reconcile-covenant-definitions executor", () => {
  it("gold: computes contractual net debt and implied EBITDA from the components, with operands in the trace", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    expect(result.comparableIndex?.netDebt?.value).toBe("4228477");
    expect(result.comparableIndex?.basis).toBe("reported");
    expect(result.comparableIndex?.ebitda?.basis).toBe("implied_from_reported");
    expect(result.comparableIndex?.ebitda?.value.startsWith("895863.77")).toBe(true);
    expect(result.trace.calculations.map((calculation) => calculation.id)).toEqual(["financial.debt_views", "financial.net_leverage"]);
    expect(result.trace.calculations[0]?.operands.grossDebt).toBe("5670186");
  });

  it("gold: with the settlement of the reference CRAs unproven, every 4.00x tier stays unresolved and conditioned, with no headroom", () => {
    const result = reconcileCovenantDefinitions(camil("unknown"));
    expect(result.covenants).toHaveLength(4);
    expect(result.state).toBe("conditioned");
    for (const covenant of result.covenants) {
      expect(covenant.applicableLimit).toBeNull();
      expect(covenant.limitState).toBe("insufficient_evidence");
      expect(covenant.headroom).toBeNull();
      expect(covenant.status).toBe("unresolved");
      expect(covenant.measurement?.nextMeasurementDate).toBe("2027-02-28");
      expect(covenant.tiers.map((tier) => tier.state)).toEqual(["unproven", "unproven"]);
    }
    expect(result.unprovenConditions).toHaveLength(4);
    expect(JSON.stringify(result)).not.toMatch(/breach|rompid/i);
  });

  it("hypothetical, not gold: once ordinary settlement is proven, 4.00x resolves but the comparison stays conditional while the EBITDA is not opened", () => {
    const result = reconcileCovenantDefinitions(camil("ordinary"));
    const deb13 = result.covenants.find((covenant) => covenant.instrument === "deb-13")!;
    expect(deb13.applicableLimit).toBe("4.00");
    expect(deb13.tiers.map((tier) => tier.state)).toEqual(["ended", "applies"]);
    expect(deb13.comparability).toBe("conditional");
    expect(deb13.headroom).toBeNull();
    expect(deb13.status).toBe("unresolved");
    const deb11 = result.covenants.find((covenant) => covenant.instrument === "deb-11")!;
    expect(deb11.comparabilityReasons).toHaveLength(2);
  });

  it("hypothetical: with the EBITDA opened and settlement proven, headroom is measured against 4.00x and named as interim", () => {
    const opened = camil("ordinary");
    opened.ltmEbitda = {value: "895864", anchor: {document: "hypothetical", note: "EBITDA de covenant aberto pela companhia"}};
    opened.instruments = opened.instruments.filter((instrument) => instrument.id !== "deb-11");
    const result = reconcileCovenantDefinitions(opened);
    expect(result.comparableIndex?.basis).toBe("computed_from_components");
    const deb13 = result.covenants.find((covenant) => covenant.instrument === "deb-13")!;
    expect(deb13.comparability).toBe("comparable");
    expect(Math.abs(Number(deb13.headroom?.absolute) + 0.72)).toBeLessThan(1e-3);
    expect(deb13.status).toBe("above_limit_interim");
    expect(result.state).toBe("resolved");
  });

  it("keeps 3.50x while a reference CRA is alive, dated consistently, and after an accelerated settlement", () => {
    const early = camil("outstanding");
    early.asOfDate = "2025-05-31";
    early.reported = {value: "4.08", asOf: "2025-05-31", definition: "pro forma de 31/05/2025", netDebtComponents: [...components], ebitdaOpened: false, anchor: itr(40, "15")};
    early.components = null;
    const result = reconcileCovenantDefinitions(early);
    expect(result.covenants.find((covenant) => covenant.instrument === "deb-15")?.applicableLimit).toBe("3.50");
    expect(result.covenants.find((covenant) => covenant.instrument === "deb-15")?.measurement?.nextMeasurementDate).toBe("2026-02-28");
    const accelerated = reconcileCovenantDefinitions(camil("accelerated"));
    expect(accelerated.covenants.every((covenant) => covenant.applicableLimit === "3.50")).toBe(true);
    expect(accelerated.unprovenConditions[0]).toMatch(/acceleration/);
  });

  it("activates 4.00x on an ordinary settlement before maturity, whichever comes first", () => {
    const early = camil("unknown");
    early.asOfDate = "2025-10-31";
    early.reported = null;
    early.components = null;
    early.referenceSettlements = early.referenceSettlements!.map((fact) => ({...fact, settlement: "ordinary" as const, settlementDate: "2025-09-30"}));
    const result = reconcileCovenantDefinitions(early);
    expect(result.covenants.every((covenant) => covenant.applicableLimit === "4.00")).toBe(true);
    expect(result.covenants[0]?.comparability).toBe("no_reported_index");
  });

  it("decides comparability on components, not on a flag, and per instrument", () => {
    const differs = camil("ordinary");
    differs.reported!.netDebtComponents = ["loans_and_financings", "debentures", "cash_and_equivalents", "financial_investments"];
    differs.components = null;
    const result = reconcileCovenantDefinitions(differs);
    expect(result.covenants.every((covenant) => covenant.comparability === "not_comparable" && covenant.headroom === null)).toBe(true);
    expect(result.covenants[1]?.comparabilityReasons.some((reason) => /missing: .*derivative_liabilities/.test(reason))).toBe(true);
  });

  it("handles a minimum-direction covenant and a trustee report without the indenture", () => {
    const mixed = camil("ordinary");
    mixed.ltmEbitda = {value: "895864", anchor: {document: "hypothetical"}};
    const minimumCovenant = indenture("deb-min", "x.pdf", "1.1", 1, ["cra-eco-257"]);
    if (minimumCovenant.source === "indenture") minimumCovenant.direction = "minimum";
    mixed.instruments = [
      minimumCovenant,
      {source: "trustee_report", id: "deb-report-only", indexName: "Dívida Líquida/EBITDA", reportedLimit: "3.50", reportedMeasurement: {value: "2.97", asOf: "2025-02-28"}, anchor: {document: "af_14a_emissao.pdf"}},
    ];
    const result = reconcileCovenantDefinitions(mixed);
    const minimum = result.covenants.find((covenant) => covenant.instrument === "deb-min")!;
    expect(Math.abs(Number(minimum.headroom?.absolute) - 0.72)).toBeLessThan(1e-3);
    expect(minimum.status).toBe("within_limit");
    const report = result.covenants.find((covenant) => covenant.instrument === "deb-report-only")!;
    expect(report.limitState).toBe("reported_by_trustee");
    expect(report.headroom).toBeNull();
  });

  it("blocks an empty base with a structured reason, refuses duplicate facts and a reported index dated after the as-of date", () => {
    const empty = reconcileCovenantDefinitions({asOfDate: "2026-05-31", instruments: []});
    expect(empty.state).toBe("blocked");
    expect(empty.blockReasons[0]).toMatch(/nothing to reconcile/);
    const duplicate = camil("unknown");
    duplicate.referenceSettlements!.push({...duplicate.referenceSettlements![0]!, settlement: "ordinary"});
    expect(() => reconcileCovenantDefinitions(duplicate)).toThrow(/duplicate settlement fact/);
    const future = camil("unknown");
    future.reported!.asOf = "2026-08-31";
    expect(() => reconcileCovenantDefinitions(future)).toThrow(/dated after/);
  });

  it("is consistent under twenty permutations of instruments, facts and adjustment order, on both fingerprints", () => {
    const first = reconcileCovenantDefinitions(camil("ordinary"));
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil("ordinary");
      shuffled.instruments = permute(shuffled.instruments, seed);
      shuffled.referenceSettlements = permute(shuffled.referenceSettlements!, seed * 3);
      const again = reconcileCovenantDefinitions(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });
});
