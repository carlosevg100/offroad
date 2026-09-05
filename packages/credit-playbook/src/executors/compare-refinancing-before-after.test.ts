import {describe, expect, it} from "vitest";

import Decimal from "decimal.js";

import {compareRefinancingBeforeAfter, type BeforeAfterInput} from "./compare-refinancing-before-after";

const itr = (page: number, note?: string) => ({document: "01_ITR_1T26_31mai2026.pdf", page, ...(note ? {note} : {})});
/** Camil: retire the DI series of the 13th and 14th (cheap exit from 2026) with a new 5-year DI debenture. R$ thousand. */
const camil = (): BeforeAfterInput => ({
  referenceDate: "2026-05-31",
  unit: "BRL thousand",
  before: {
    grossDebt: "5670186", unrestrictedCash: "1455809", derivativeLiabilities: "14335", derivativeAssets: "235",
    ltmEbitda: {value: "895864", basis: "EBITDA implícito no pro forma de 4,72x, derivado"},
    schedule: {"2027": "1229828", "2028": "776868", "2029": "1228475", "2030": "694497", "2031": "994544", "2032+": "809198"},
    weightedAverageRate: "0.145",
    anchor: itr(40, "15"),
  },
  covenant: {limit: "4.00", direction: "maximum", state: "insufficient_evidence", comparability: "conditional", anchor: {document: "escritura_13a_emissao.pdf", clause: "7.24.3", page: 54}},
  alternatives: [
    {id: "extend-di", label: "Alongar as séries DI da 13ª e da 14ª com nova debênture de cinco anos", newDebt: {amount: "745000", annualRate: "0.145", termMonths: 60, graceMonths: 24, format: "sac", upfrontFeeRate: "0.01", origin: "termos indicativos de mercado, curva de 04/09/2026", anchor: {document: "anbima_ettj_2026-09-04.csv"}}, retired: [
      {seriesId: "deb-13-1", principal: "306038", exitPremium: "2448", maturityPeriod: "2029"},
      {seriesId: "deb-14-1", principal: "438918", exitPremium: "5266", maturityPeriod: "2029"},
    ]},
    {id: "status-quo", label: "Manter a estrutura", newDebt: null, retired: []},
    {id: "retire-ipca", label: "Retirar as séries IPCA antes da carência", newDebt: null, retired: [{seriesId: "deb-13-2", principal: "282357", exitPremium: null, maturityPeriod: "2031"}]},
  ],
  ranking: {discriminator: "peak_concentration", rationale: "a tese é suavizar o degrau de 2028/29; custo e headroom entram como restrição, não como discriminador"},
});

const d = (value: string) => new Decimal(value);

describe("compare-refinancing-before-after executor", () => {
  it("gold: the before and after use the same objects, the exit cost enters the after, and the peak moves", () => {
    const result = compareRefinancingBeforeAfter(camil());
    expect(result.before.grossDebt).toBe("5670186");
    expect(result.before.contractualNetDebt).toBe("4228477");
    expect(result.before.peak?.period).toBe("2027");
    const extend = result.alternatives.find((alternative) => alternative.id === "extend-di")!;
    expect(extend.state).toBe("compared");
    expect(extend.exitCost).toBe("7714");
    expect(extend.after?.grossDebt).toBe("5670230");
    expect(Number(extend.after?.unrestrictedCash)).toBeLessThan(Number(result.before.unrestrictedCash));
    expect(extend.concentration?.find((row) => row.period === "2029")?.existing).toBe("483519");
    expect(extend.newDebtService?.peakDebtService).not.toBe("0");
  });

  it("does not measure headroom while the covenant limit is unresolved or the comparison is conditional", () => {
    const result = compareRefinancingBeforeAfter(camil());
    expect(result.before.headroom).toBeNull();
    expect(result.unsupported.some((entry) => /headroom is not measured/.test(entry))).toBe(true);
    const resolved = camil();
    resolved.covenant = {...resolved.covenant, state: "resolved", comparability: "comparable"};
    const measured = compareRefinancingBeforeAfter(resolved);
    expect(measured.before.headroom?.passes).toBe(false);
  });

  it("blocks an alternative that retires a series without a priced exit, and ranks the rest by the declared discriminator", () => {
    const result = compareRefinancingBeforeAfter(camil());
    const ipca = result.alternatives.find((alternative) => alternative.id === "retire-ipca")!;
    expect(ipca.state).toBe("blocked");
    expect(ipca.blockReasons[0]).toMatch(/exit cost is not priced/);
    expect(result.ranking?.discriminator).toBe("peak_concentration");
    expect(result.ranking?.order.map((entry) => entry.id)).toEqual(["extend-di", "status-quo"]);
  });

  it("produces no ranking without a declared discriminator", () => {
    const noRanking = camil();
    noRanking.ranking = null;
    const result = compareRefinancingBeforeAfter(noRanking);
    expect(result.ranking).toBeNull();
    expect(result.unsupported).toContain("no ranking: the discriminator was not declared");
  });

  it("is consistent under twenty permutations of alternatives and retired series", () => {
    const first = compareRefinancingBeforeAfter(camil());
    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffled = camil();
      shuffled.alternatives = seed % 2 ? [...shuffled.alternatives].reverse() : [shuffled.alternatives[2]!, shuffled.alternatives[0]!, shuffled.alternatives[1]!];
      shuffled.alternatives.find((alternative) => alternative.id === "extend-di")!.retired!.reverse();
      const again = compareRefinancingBeforeAfter(shuffled);
      expect(again.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
      expect(again.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    }
  });

  it("lands new-debt principal beyond the open-ended bucket in that bucket, ranks by peak amount when asked, and names ties", () => {
    const base = camil();
    const result = compareRefinancingBeforeAfter({...base, ranking: {discriminator: "peak_amount", rationale: "o pico em valor é o que a rolagem precisa vencer"}});
    for (const alternative of result.alternatives) {
      if (!alternative.concentration) continue;
      expect(alternative.concentration.some((row) => /^203[3-9]$/.test(row.period))).toBe(false);
    }
    const extend = result.alternatives.find((alternative) => alternative.id === "extend-di")!;
    expect(extend.concentration!.map((row) => row.period)).toEqual(["2027", "2028", "2029", "2030", "2031", "2032+"]);
    const consolidated = extend.concentration!.reduce((sum, row) => sum.plus(row.consolidated), d("0"));
    expect(consolidated.toFixed()).toBe(d(extend.after!.grossDebt).toFixed());
    expect(result.ranking?.discriminator).toBe("peak_amount");
    expect(result.ranking?.order[0]?.reason).toBe("best peak_amount");
    const tie = compareRefinancingBeforeAfter({...base, alternatives: [base.alternatives[2]!, {...base.alternatives[2]!, id: "status-quo-twin", label: "Manter, de novo"}], ranking: {discriminator: "peak_amount", rationale: "empate"}});
    expect(tie.ranking?.order[1]?.reason).toMatch(/tied with the best/);
  });
});
