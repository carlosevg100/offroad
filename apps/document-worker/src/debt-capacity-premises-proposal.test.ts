import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {composeBoundDebtCapacity, prepareDebtCapacityPacket} from "@offroad/financial-model";
import {buildDebtCapacityPremiseProposal, completeDebtCapacityFacts, shouldProposeDebtCapacityPremises, type DebtCapacityExtraction} from "./debt-capacity-premises-proposal";

const M = (v: string | number) => new Decimal(v).times(1e6).toDecimalPlaces(2).toFixed();
const none = {value: null, origin: null, source: null};
const doc = <T>(value: T, source: string) => ({value, origin: "document" as const, source});
const informed = <T>(value: T, source: string) => ({value, origin: "informed" as const, source});
const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
const CDI: Record<number, number> = {2027: 0.14, 2028: 0.1275, 2029: 0.12, 2030: 0.12, 2031: 0.12, 2032: 0.12, 2033: 0.12};
const EBITDA: Record<number, string> = {2027: "56.6", 2028: "58.8", 2029: "61.2", 2030: "63.6", 2031: "66.1", 2032: "68.7", 2033: "71.5"};
const debenture: Record<number, number> = {2026: 80, 2027: 80, 2028: 80, 2029: 64, 2030: 48, 2031: 32, 2032: 16, 2033: 0};
const finame: Record<number, number> = {2026: 23.33, 2027: 16.66, 2028: 9.99, 2029: 3.32, 2030: 0, 2031: 0, 2032: 0, 2033: 0};
const interest = (y: number) => new Decimal(debenture[y - 1]!).plus(debenture[y]!).div(2).times(CDI[y]! + 0.029)
  .plus(new Decimal(finame[y - 1]!).plus(finame[y]!).div(2).times(0.079 + 0.018)).plus(new Decimal(20).times(0.5).times(CDI[y]! + 0.02));
const project = (ebitda: Record<number, number>, capex: Record<number, number>) => years.flatMap((y) => [{yearEnd: `${y}-12-31`, capex: M(capex[y] ?? 0), ebitda: M(ebitda[y] ?? 0),
  depreciation: M(y >= 2029 ? 6 : y === 2028 ? 3 : 0), maintenanceCapex: M(ebitda[y] ? 1.5 : 0), workingCapitalInvestment: M((ebitda[y] ?? 0) - (ebitda[y - 1] ?? 0))}]);

/** Turn of ficha C04: the projection, the debt table, the indenture and the second line of R$ 60 mi, in reais. */
function c04Extraction(): DebtCapacityExtraction {
  return {needSituation: informed("capex-infrastructure" as const, "segunda linha de produção"),
    projection: doc(years.map((y) => ({yearEnd: `${y}-12-31`, ebitda: M(EBITDA[y]!), leasePayments: M(3), depreciation: M(12), maintenanceCapex: M(8), workingCapitalInvestment: M(2.5)})), "projeção 2027-2033"),
    openingCash: doc(M(15.3), "balanço de dezembro de 2026"), cashTaxRate: informed(0.34, "lucro real"), covenantEbitdaExcludesLeases: doc(true, "escritura, EBITDA sem IFRS 16"),
    covenantLimit: doc(3, "escritura da debênture"), minimumCash: none,
    existingDebt: doc(years.map((y) => ({yearEnd: `${y}-12-31`, closingDebt: M(new Decimal(debenture[y]!).plus(finame[y]!).plus(20).toFixed()),
      principalPaid: M(new Decimal(debenture[y - 1]!).minus(debenture[y]!).plus(finame[y - 1]!).minus(finame[y]!).toFixed()), cashInterest: M(interest(y).toFixed())})), "tabela de dívida"),
    existingDebtFinalPaymentDate: doc("2033-12-31", "tabela de dívida"),
    uses: [{label: "Segunda linha, como informado", role: "informed", change: null, years: informed(project({2029: 6, 2030: 12, 2031: 12, 2032: 12, 2033: 12}, {2027: 30, 2028: 30}), "plano da segunda linha")},
      {label: "Faseado", role: "alternative", change: "Desembolso em 2028 e 2029; resultado a partir de 2030", years: informed(project({2030: 6, 2031: 12, 2032: 12, 2033: 12}, {2028: 30, 2029: 30}), "alternativa discutida")}],
    structure: {label: "Cinco anos com carência até 2030", indexer: informed("CDI", "estrutura de referência"), annualSpread: informed(0.025, "CDI + 2,5%"), fixedRate: none,
      firstRepaymentYear: informed(2030, "carência até 2030"), repayments: informed(3, "três parcelas anuais")},
    indexCurve: doc(years.map((y) => ({year: y, annualRate: CDI[y]!})), "curva de CDI"),
    requestedAmount: informed(M(60), "segunda linha de R$ 60 milhões"),
  };
}
const ids = {capacityId: "c0400000-0000-4000-9000-000000000001", entityId: "c0400000-0000-4000-9000-000000000002", definitionVersionId: "c0400000-0000-4000-9000-000000000003"};

describe("capacity premises proposed from a turn", {timeout: 180000}, () => {
  it("recognizes the capacity question and not a factual one", () => {
    expect(shouldProposeDebtCapacityPremises("Quanto de dívida a gente aguenta tomar para a segunda linha de R$ 60 milhões?", false)).toBe(true);
    expect(shouldProposeDebtCapacityPremises("Qual é a nossa capacidade de endividamento?", true)).toBe(true);
    expect(shouldProposeDebtCapacityPremises("Qual o prazo da debênture?", false)).toBe(false);
  });
  it("proposes premises that reproduce the oracle in reais once adopted", () => {
    const c = completeDebtCapacityFacts({extraction: c04Extraction(), ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error(JSON.stringify(c));
    const proposal = buildDebtCapacityPremiseProposal(c.facts, c.situationId);
    expect(proposal.hypotheses.length).toBeLessThanOrEqual(256);
    expect(proposal.hypotheses.every((h) => /^Origem: /.test(h.reason) && h.dimensions.entityId === null)).toBe(true);
    let n = 0;
    const entries = proposal.hypotheses.map((h) => ({decisionId: `c0400000-0000-4000-9000-${String(1000 + n++).padStart(12, "0")}`, slotKey: createHash("sha256").update(h.fieldPath + h.dimensions.scenario).digest("hex"),
      kind: "hypothesis", fieldPath: h.fieldPath, dimensions: {...h.dimensions, entityId: ids.entityId, definitionVersionId: ids.definitionVersionId}, value: h.value,
      observationId: null, referenceValue: null, referenceDimensions: null, definitionKind: "managerial", actorId: ids.capacityId, reason: h.reason}));
    const snapshot = {schemaVersion: "contextual-adoption.v1", versionId: ids.capacityId, setId: ids.capacityId, workId: ids.entityId, purpose: "synthetic capacity", contextKey: "capacidade", revision: 1,
      previousVersionId: null, classification: "working_basis", entries}, canonical = JSON.stringify(snapshot);
    const packet = prepareDebtCapacityPacket(composeBoundDebtCapacity({envelope: {canonical, fingerprint: createHash("sha256").update(canonical).digest("hex")},
      scope: {workId: ids.entityId, purpose: "synthetic capacity", versionId: ids.capacityId}, question: "Quanto de dívida cabe?"}));
    const mi = (v: string | null) => new Decimal(v!).div(1e6).toDecimalPlaces(1).toNumber();
    const informedCase = packet.cases.find((x) => x.role === "informed")!, phased = packet.cases.find((x) => x.role === "alternative")!;
    expect(informedCase.limits.map((l) => [l.id, mi(l.capacity)])).toEqual([["covenant", 54.8], ["interest", 72], ["market", 76.8]]);
    expect(phased.limits.map((l) => [l.id, mi(l.capacity)])).toEqual([["covenant", 79.5], ["interest", 107.6], ["market", 108.6]]);
    expect(informedCase.review!.fits).toBe(false);
    expect(phased.review!.fits).toBe(true);
  });
  it("asks for what nobody stated instead of assuming it", () => {
    const e = c04Extraction(); e.covenantLimit = none; e.structure.repayments = none; e.uses = []; e.needSituation = none;
    expect(completeDebtCapacityFacts({extraction: e, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["needSituation", "covenantLimit", "structure.repayments", "uses"]});
    const off = c04Extraction(); off.existingDebt.value!.pop();
    expect(completeDebtCapacityFacts({extraction: off, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["existingDebt"]});
    const alt = c04Extraction(); alt.uses[1]!.change = null;
    expect(completeDebtCapacityFacts({extraction: alt, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["uses.2.change"]});
  });
  it("marks the house premises and keeps the minimum cash only when stated", () => {
    const c = completeDebtCapacityFacts({extraction: c04Extraction(), ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error("expected complete");
    expect(c.housePremiseKeys.sort()).toEqual(["covenantHeadroom", "interestCoverage", "marketLeverage", "monetaryQuantum", "stress"]);
    expect(c.facts.limits.map((l) => l.value.id)).toEqual(["covenant", "market", "interest"]);
    const withCash = c04Extraction(); withCash.minimumCash = informed(M(15), "caixa mínimo de R$ 15 milhões");
    const d = completeDebtCapacityFacts({extraction: withCash, ids, currency: "BRL"});
    if (d.status !== "complete") throw new Error("expected complete");
    expect(d.facts.limits.at(-1)!.value).toMatchObject({id: "minimum-cash", kind: "minimum_available_cash", base: M(15)});
  });
  it("asks for a missing year of a use and an index before the first stated year, never filling them", () => {
    const gap = c04Extraction(); gap.uses[0]!.years.value = gap.uses[0]!.years.value!.filter((r) => r.yearEnd !== "2029-12-31");
    expect(completeDebtCapacityFacts({extraction: gap, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["uses.1.years"]});
    const tail = c04Extraction(); tail.uses[0]!.years.value!.pop();
    expect(completeDebtCapacityFacts({extraction: tail, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["uses.1.years"]});
    const head = c04Extraction(); head.uses[0]!.years.value!.shift();
    expect(completeDebtCapacityFacts({extraction: head, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["uses.1.years"]});
    const hole = c04Extraction(); hole.indexCurve.value = hole.indexCurve.value!.filter((x) => x.year !== 2028);
    expect(completeDebtCapacityFacts({extraction: hole, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["indexCurve"]});
    const late = c04Extraction(); late.indexCurve.value = [{year: 2028, annualRate: 0.1275}];
    expect(completeDebtCapacityFacts({extraction: late, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["indexCurve"]});
    const carried = c04Extraction(); carried.indexCurve.value = [{year: 2027, annualRate: 0.14}, {year: 2028, annualRate: 0.1275}];
    const c = completeDebtCapacityFacts({extraction: carried, ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error("expected complete");
    expect(c.housePremiseKeys).toContain("indexCarriedForward");
    expect(c.facts.structure.origin).toBe("estimate");
    expect(c.facts.structure.source).toContain("CDI depois de 2028 mantido no último valor informado");
  });
  it("closes equal repayments exactly, so six annual parcels add up to one", () => {
    const e = c04Extraction(); e.structure.firstRepaymentYear = informed(2027, "amortiza desde 2027"); e.structure.repayments = informed(6, "seis parcelas");
    const c = completeDebtCapacityFacts({extraction: e, ids, currency: "BRL"});
    if (c.status !== "complete") throw new Error(JSON.stringify(c));
    const shares = c.facts.structure.value.amortizationShares;
    expect(shares.reduce((t, x) => t.plus(x), new Decimal(0)).toFixed()).toBe("1");
    expect(shares.filter((x) => x !== "0")).toHaveLength(6);
  });
  it("keeps one informed use and at most one alternative within a working basis", () => {
    const e = c04Extraction(); e.uses.push({...e.uses[1]!, label: "Outra alternativa"});
    expect(completeDebtCapacityFacts({extraction: e, ids, currency: "BRL"})).toEqual({status: "missing", missing: ["uses.atMostTwo"]});
  });
  it("continues a capacity question when the next message answers with figures", () => {
    const earlier = ["Quanto de dívida cabe para a segunda linha?"];
    expect(shouldProposeDebtCapacityPremises("A alíquota é 34%, covenant 3x e três parcelas a partir de 2030", false, earlier)).toBe(true);
    expect(shouldProposeDebtCapacityPremises("Obrigado, vou pensar", false, earlier)).toBe(false);
    expect(shouldProposeDebtCapacityPremises("A alíquota é 34%", false, ["Qual o prazo da debênture?"])).toBe(false);
    expect(shouldProposeDebtCapacityPremises("Qual o EBITDA de 2029?", false, earlier)).toBe(false);
    expect(shouldProposeDebtCapacityPremises("Obrigado, falamos em 2 dias", false, earlier)).toBe(false);
    const thread = [...earlier, "A alíquota é 34%", "O covenant é 3x"];
    expect(shouldProposeDebtCapacityPremises("Três parcelas anuais a partir de 2030", false, thread)).toBe(true);
    expect(shouldProposeDebtCapacityPremises("Covenant de três vezes o EBITDA", false, earlier)).toBe(true);
    const long = [...earlier, "A alíquota é 34%", "O covenant é 3x", "CDI de 12% em 2029", "Spread de 2,5%"];
    expect(shouldProposeDebtCapacityPremises("Três parcelas anuais a partir de 2030", false, long)).toBe(true);
    expect(shouldProposeDebtCapacityPremises("O covenant é 3x, certo?", false, earlier)).toBe(true);
    expect(shouldProposeDebtCapacityPremises("Qual o EBITDA de 2029", false, earlier)).toBe(false);
    expect(shouldProposeDebtCapacityPremises("Qual o EBITDA de 2029?", true, earlier)).toBe(false);
    for (const m of ["A alíquota é 34%, certo?", "Três parcelas anuais a partir de 2030, certo?", "O CDI é 12%, certo?"])
      expect(shouldProposeDebtCapacityPremises(m, false, earlier), m).toBe(true);
  });
});
